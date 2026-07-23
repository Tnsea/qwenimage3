import type { BillingOffer } from "../src/types.js";

export interface BillingEnvironment {
  BILLING_ENABLED?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_CREATOR_INTRO?: string;
  STRIPE_PRICE_CREATOR_MONTHLY?: string;
  STRIPE_PRICE_CREDITS_100?: string;
  STRIPE_PRICE_CREDITS_300?: string;
}

export function billingEnabled(env: BillingEnvironment) {
  return env.BILLING_ENABLED?.trim().toLowerCase() === "true";
}

export function stripeAccessConfigured(env: BillingEnvironment) {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

export function stripeWebhookConfigured(env: BillingEnvironment) {
  return Boolean(env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function priceIdFor(env: BillingEnvironment, offerId: BillingOffer["id"]) {
  if (offerId === "creator_intro") return env.STRIPE_PRICE_CREATOR_INTRO?.trim() || "";
  if (offerId === "creator_monthly") return env.STRIPE_PRICE_CREATOR_MONTHLY?.trim() || "";
  if (offerId === "credits_100") return env.STRIPE_PRICE_CREDITS_100?.trim() || "";
  return env.STRIPE_PRICE_CREDITS_300?.trim() || "";
}

export function allOffers(env: BillingEnvironment): BillingOffer[] {
  const enabled = billingEnabled(env);
  const sharedCreator = ["300 monthly credits", "VIP priority queue", "Original exports without a watermark", "Projects, favorites, API keys, and ledger", "Credits restored automatically after failed jobs"];
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
      configured: enabled && Boolean(priceIdFor(env, "creator_intro")),
      features: sharedCreator,
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
      configured: enabled && Boolean(priceIdFor(env, "creator_monthly")),
      features: sharedCreator,
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
      configured: enabled && Boolean(priceIdFor(env, "credits_100")),
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
      configured: enabled && Boolean(priceIdFor(env, "credits_300")),
      features: ["Up to 300 Standard images", "Works in the web app and API", "No recurring payment", "Credits remain until used"],
    },
  ];
}

export function billingCredentialsConfigured(env: BillingEnvironment) {
  return stripeAccessConfigured(env)
    && stripeWebhookConfigured(env)
    && (["creator_intro", "creator_monthly", "credits_100", "credits_300"] as const)
      .every((offerId) => Boolean(priceIdFor(env, offerId)));
}

export function billingConfigured(env: BillingEnvironment) {
  return billingEnabled(env) && billingCredentialsConfigured(env);
}
