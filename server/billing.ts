import crypto from "node:crypto";
import type { BillingOffer, User } from "../src/types.js";

export interface StripeEvent {
  id: string;
  type: string;
  created?: number;
  data: { object: Record<string, unknown> };
}

export class BillingError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BillingError";
    this.code = code;
  }
}

function stripeSecret() {
  return process.env.STRIPE_SECRET_KEY?.trim() || "";
}

export function billingEnabled() {
  return process.env.BILLING_ENABLED?.trim().toLowerCase() === "true";
}

export function priceIdFor(offerId: BillingOffer["id"]) {
  if (offerId === "creator_intro") return process.env.STRIPE_PRICE_CREATOR_INTRO?.trim() || "";
  if (offerId === "creator_monthly") return process.env.STRIPE_PRICE_CREATOR_MONTHLY?.trim() || "";
  if (offerId === "credits_100") return process.env.STRIPE_PRICE_CREDITS_100?.trim() || "";
  return process.env.STRIPE_PRICE_CREDITS_300?.trim() || "";
}

function allBillingOffers(): BillingOffer[] {
  const enabled = billingEnabled();
  return [
    {
      id: "creator_intro",
      name: "Creator VIP launch price",
      description: "The complete Creator plan at a one-time founder rate for customers who check out before their timer ends.",
      priceLabel: "$8 / month",
      amountCents: 800,
      currency: "usd",
      credits: 300,
      kind: "subscription",
      configured: enabled && Boolean(priceIdFor("creator_intro")),
      features: ["300 monthly credits", "VIP priority queue", "Original exports without a watermark", "Projects, favorites, API keys, and ledger", "Credits restored automatically after failed jobs"],
    },
    {
      id: "creator_monthly",
      name: "Creator VIP",
      description: "Priority production for regular image work, with a clear monthly allowance and clean original exports.",
      priceLabel: "$10 / month",
      amountCents: 1000,
      currency: "usd",
      credits: 300,
      kind: "subscription",
      configured: enabled && Boolean(priceIdFor("creator_monthly")),
      features: ["300 monthly credits", "VIP priority queue", "Original exports without a watermark", "Projects, favorites, API keys, and ledger", "Credits restored automatically after failed jobs"],
    },
    {
      id: "credits_100",
      name: "100-credit pack",
      description: "A small one-time top-up for occasional production runs.",
      priceLabel: "$7 one time",
      amountCents: 700,
      currency: "usd",
      credits: 100,
      kind: "credits",
      configured: enabled && Boolean(priceIdFor("credits_100")),
      features: ["Up to 100 Standard images", "Works in the web app and API", "No recurring payment", "Credits remain until used"],
    },
    {
      id: "credits_300",
      name: "300-credit pack",
      description: "The lower per-credit option when you need more output without a subscription.",
      priceLabel: "$18 one time",
      amountCents: 1800,
      currency: "usd",
      credits: 300,
      kind: "credits",
      configured: enabled && Boolean(priceIdFor("credits_300")),
      features: ["Up to 300 Standard images", "Works in the web app and API", "No recurring payment", "Credits remain until used"],
    },
  ];
}

export function billingOffers(): BillingOffer[] {
  return allBillingOffers().filter((offer) => offer.id !== "creator_intro");
}

export function billingProviderInfo() {
  const secretConfigured = Boolean(stripeSecret());
  const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const pricesConfigured = (["creator_intro", "creator_monthly", "credits_100", "credits_300"] as const)
    .every((offerId) => Boolean(priceIdFor(offerId)));
  const credentialsConfigured = secretConfigured && webhookConfigured && pricesConfigured;
  return {
    provider: "stripe",
    enabled: billingEnabled(),
    configured: billingEnabled() && credentialsConfigured,
    credentialsConfigured,
    secretConfigured,
    webhookConfigured,
  };
}

export function findBillingOffer(value: string) {
  return allBillingOffers().find((offer) => offer.id === value) ?? null;
}

async function stripeRequest<T>(path: string, body?: URLSearchParams, method: "GET" | "POST" | "DELETE" = "POST"): Promise<T> {
  const secret = stripeSecret();
  if (!secret) throw new BillingError("BILLING_UNAVAILABLE", "Stripe API access is not configured.");
  const timeout = Math.max(1_000, Number(process.env.STRIPE_TIMEOUT_MS ?? 15_000));
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(timeout),
  });
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new BillingError("STRIPE_REQUEST_FAILED", payload.error?.message ?? `Stripe request failed with status ${response.status}.`);
  return payload;
}

export async function findPaidStripeInvoicePaymentIntent(invoiceId: string) {
  if (!invoiceId.startsWith("in_")) {
    throw new BillingError("STRIPE_IDENTIFIER_INVALID", "Stripe invoice identifier is invalid.");
  }
  const query = new URLSearchParams({ invoice: invoiceId, status: "paid", limit: "10" });
  const payload = await stripeRequest<{
    data?: Array<{
      status?: unknown;
      payment?: {
        type?: unknown;
        payment_intent?: unknown;
      };
    }>;
  }>(`/v1/invoice_payments?${query.toString()}`, undefined, "GET");
  const paymentIntent = payload.data?.find((entry) => entry.status === "paid"
    && entry.payment?.type === "payment_intent"
    && typeof entry.payment.payment_intent === "string"
    && entry.payment.payment_intent.startsWith("pi_"))?.payment?.payment_intent;
  if (typeof paymentIntent !== "string") {
    throw new BillingError("INVOICE_PAYMENT_NOT_FOUND", "Stripe did not return a paid PaymentIntent for this invoice.");
  }
  return paymentIntent;
}

function trustedStripeUrl(value: unknown, expectedHost: "checkout.stripe.com" | "billing.stripe.com") {
  if (typeof value !== "string") throw new BillingError("STRIPE_RESPONSE_INVALID", "Stripe did not return a checkout URL.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== expectedHost) throw new BillingError("STRIPE_RESPONSE_INVALID", "Stripe returned an unexpected redirect URL.");
  return url.toString();
}

export async function createStripeCustomer(user: User) {
  const body = new URLSearchParams({ email: user.email, name: user.name, "metadata[user_id]": user.id });
  const payload = await stripeRequest<{ id?: string }>("/v1/customers", body);
  if (!payload.id?.startsWith("cus_")) throw new BillingError("STRIPE_RESPONSE_INVALID", "Stripe did not return a customer identifier.");
  return payload.id;
}

export async function createStripeCheckout(input: {
  user: User;
  customerId: string;
  offer: BillingOffer;
  priceId?: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const priceId = input.priceId ?? priceIdFor(input.offer.id);
  if (!priceId || !stripeSecret()) throw new BillingError("OFFER_UNAVAILABLE", "This billing offer is not configured.");
  const body = new URLSearchParams({
    mode: input.offer.kind === "subscription" ? "subscription" : "payment",
    customer: input.customerId,
    client_reference_id: input.user.id,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "metadata[user_id]": input.user.id,
    "metadata[offer_id]": input.offer.id,
    "metadata[kind]": input.offer.kind,
  });
  if (input.offer.kind === "subscription") {
    body.set("subscription_data[metadata][user_id]", input.user.id);
    body.set("subscription_data[metadata][offer_id]", input.offer.id);
  } else {
    body.set("payment_intent_data[metadata][user_id]", input.user.id);
    body.set("payment_intent_data[metadata][offer_id]", input.offer.id);
  }
  const payload = await stripeRequest<{ id?: string; url?: string }>("/v1/checkout/sessions", body);
  if (!payload.id?.startsWith("cs_")) throw new BillingError("STRIPE_RESPONSE_INVALID", "Stripe did not return a checkout session.");
  return { id: payload.id, url: trustedStripeUrl(payload.url, "checkout.stripe.com") };
}

export async function createStripePortal(customerId: string, returnUrl: string) {
  const payload = await stripeRequest<{ url?: string }>("/v1/billing_portal/sessions", new URLSearchParams({ customer: customerId, return_url: returnUrl }));
  return trustedStripeUrl(payload.url, "billing.stripe.com");
}

export async function cancelStripeSubscription(subscriptionId: string) {
  if (!subscriptionId.startsWith("sub_")) throw new BillingError("STRIPE_IDENTIFIER_INVALID", "Stored subscription identifier is invalid.");
  const payload = await stripeRequest<{ id?: string; status?: string }>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, "DELETE");
  if (payload.id !== subscriptionId || payload.status !== "canceled") {
    throw new BillingError("STRIPE_RESPONSE_INVALID", "Stripe did not confirm subscription cancellation.");
  }
}

export async function deleteStripeCustomer(customerId: string) {
  if (!customerId.startsWith("cus_")) throw new BillingError("STRIPE_IDENTIFIER_INVALID", "Stored customer identifier is invalid.");
  const payload = await stripeRequest<{ id?: string; deleted?: boolean }>(`/v1/customers/${encodeURIComponent(customerId)}`, undefined, "DELETE");
  if (payload.id !== customerId || payload.deleted !== true) {
    throw new BillingError("STRIPE_RESPONSE_INVALID", "Stripe did not confirm customer deletion.");
  }
}

export function verifyStripeWebhook(rawBody: Buffer, signatureHeader: string | undefined, secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "", nowSeconds = Math.floor(Date.now() / 1000)): StripeEvent {
  if (!secret) throw new BillingError("WEBHOOK_UNAVAILABLE", "Stripe webhook verification is not configured.");
  if (!signatureHeader) throw new BillingError("INVALID_SIGNATURE", "Stripe-Signature is required.");
  const components = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = Number(components.find((part) => part.startsWith("t="))?.slice(2));
  const signatures = components.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || signatures.length === 0) {
    throw new BillingError("INVALID_SIGNATURE", "Stripe webhook signature is invalid or expired.");
  }
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, "hex");
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
  });
  if (!valid) throw new BillingError("INVALID_SIGNATURE", "Stripe webhook signature verification failed.");
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as StripeEvent;
  } catch {
    throw new BillingError("INVALID_EVENT", "Stripe webhook payload is not valid JSON.");
  }
  if (!event.id?.startsWith("evt_") || typeof event.type !== "string" || !event.data?.object) {
    throw new BillingError("INVALID_EVENT", "Stripe webhook payload is incomplete.");
  }
  return event;
}
