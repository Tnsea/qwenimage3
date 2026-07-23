import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cors from "cors";
import express, { type Request, type Response } from "express";
import {
  canAccessGeneration,
  addSupportMessage,
  claimBillingEvent,
  completeBillingEvent,
  completeGeneration,
  completeCreditCheckout,
  completeSubscriptionCheckout,
  completeSubscriptionInvoice,
  consumeGuestQuota,
  consumeEmailVerification,
  consumeOAuthState,
  consumePasswordReset,
  consumeRateLimit,
  createAnonymousSession,
  createApiKey,
  createBillingOrder,
  createOAuthState,
  createPending,
  createProject,
  createSecurityToken,
  createSession,
  createSupportTicket,
  createUser,
  deleteUserAccount,
  deleteGeneration,
  failGeneration,
  failBillingEvent,
  findApiKeyActorByHash,
  findAnonymousSession,
  findIdempotentGeneration,
  findUserByEmail,
  findSessionActorByHash,
  findUserById,
  expireBillingCheckout,
  getActiveBillingPriceVersion,
  getAccountExport,
  getBillingPriceVersionByStripePriceId,
  getBillingState,
  getCreditAccount,
  getGenerationRecord,
  getOrCreatePricingPromotion,
  getPricingPromotionForUser,
  getSupportTicket,
  getWorkspaceOverview,
  listApiKeys,
  listApiRequestLogs,
  listActiveBillingPriceVersions,
  listBillingOrders,
  listCreditLedger,
  listGenerations,
  listProjects,
  listSessions,
  listSupportTickets,
  maintenanceStatus,
  markGenerationProcessing,
  markPaymentReversal,
  migrateGuestGenerations,
  migratePricingPromotion,
  projectBelongsToUser,
  recordApiRequest,
  refundCredits,
  releaseGuestQuota,
  reserveCredits,
  revokeApiKey,
  revokeOtherSessions,
  revokeSession,
  revokeSessionById,
  resolveOAuthUser,
  saveIdempotencyKey,
  setStripeCustomer,
  settleCredits,
  toggleFavorite,
  updateUserPassword,
  updateUserProfile,
  updateSubscriptionStatus,
  updateSupportTicketStatus,
  updateProject,
} from "./db.js";
import { billingProviderInfo, BillingError, cancelStripeSubscription, createStripeCheckout, createStripeCustomer, createStripePortal, deleteStripeCustomer, findBillingOffer, findPaidStripeInvoicePaymentIntent, verifyStripeWebhook, type StripeEvent } from "./billing.js";
import { emailProviderInfo, sendAuthenticationEmail } from "./mailer.js";
import { createAuthorizationUrl, exchangeOAuthCode, OAuthError, oauthMethods, type OAuthProvider } from "./oauth.js";
import { getGenerationProvider, providerInfo } from "./providers/index.js";
import { ProviderError } from "./providers/types.js";
import { freeQueueDelayMs, generationQueue, type GenerationQueueTier } from "./generation-queue.js";
import { createToken, hashPassword, hashToken, verifyPassword } from "./security.js";
import { originalExport, watermarkedExport } from "./watermark.js";
import { createCatalogCore } from "../src/catalog.js";
import type {
  AspectRatio,
  GenerationRequest,
  ImageQuality,
  ImageStyle,
  SessionState,
  SupportTicketCategory,
  SupportTicketPriority,
  User,
} from "../src/types.js";

const GUEST_LIMIT = 3;
const SESSION_DAYS = 30;
const GUEST_DAYS = 30;
const EMAIL_VERIFICATION_HOURS = 24;
const PASSWORD_RESET_MINUTES = 60;
const OAUTH_STATE_MINUTES = 10;
const validRatios: AspectRatio[] = ["1:1", "3:2", "16:9", "4:3", "9:16"];
const validStyles: ImageStyle[] = ["Photorealistic", "Editorial", "Cinematic", "Illustration"];
const validQualities: ImageQuality[] = ["Standard", "High", "Ultra"];
const validSupportCategories: SupportTicketCategory[] = ["generation", "billing", "api", "account", "other"];
const validSupportPriorities: SupportTicketPriority[] = ["normal", "high"];
const qualityCosts: Record<ImageQuality, number> = { Standard: 1, High: 2, Ultra: 4 };
const billingOfferIds = ["creator_intro", "creator_monthly", "credits_100", "credits_300"] as const;

interface Actor {
  user: User | null;
  anonymousSession: { id: string; usedCount: number; quotaDate: string } | null;
  sessionToken: string | null;
  sessionId: string | null;
  viaApiKey: boolean;
  apiKeyId: string | null;
  scopes: string[];
}

function parseCookies(request: Request) {
  const result: Record<string, string> = {};
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function quotaDate() {
  return new Date().toISOString().slice(0, 10);
}

function nextGuestReset() {
  const reset = new Date();
  reset.setUTCDate(reset.getUTCDate() + 1);
  reset.setUTCHours(0, 0, 0, 0);
  return reset.toISOString();
}

function cookieValue(name: string, value: string, maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function userAgentLabel(request: Request) {
  return (request.get("user-agent")?.trim() || "Unknown device").slice(0, 180);
}

function networkHint(request: Request) {
  const address = request.ip || request.socket.remoteAddress || "Unknown network";
  if (address.includes(".")) return address.replace(/\.\d+$/, ".*").slice(0, 80);
  if (address.includes(":")) return `${address.split(":").slice(0, 4).join(":")}:*`.slice(0, 80);
  return address.slice(0, 80);
}

function createUserSession(request: Request, userId: string) {
  const token = createToken();
  const id = crypto.randomUUID();
  createSession({
    id,
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    userAgent: userAgentLabel(request),
    ipHint: networkHint(request),
  });
  return { token, id };
}

function passwordIsStrong(password: string) {
  return password.length >= 8 && password.length <= 128 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

async function issueAuthenticationToken(user: User, purpose: "verify_email" | "reset_password") {
  const token = createToken();
  const lifetime = purpose === "verify_email" ? EMAIL_VERIFICATION_HOURS * 60 * 60 * 1000 : PASSWORD_RESET_MINUTES * 60 * 1000;
  createSecurityToken({
    id: crypto.randomUUID(),
    userId: user.id,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + lifetime).toISOString(),
  });
  try {
    return await sendAuthenticationEmail({
      purpose: purpose === "verify_email" ? "verify-email" : "reset-password",
      to: user.email,
      name: user.name,
      token,
    });
  } catch (error) {
    console.error(error);
    return { delivered: false, delivery: "none" as const };
  }
}

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "github";
}

function appReturnUrl(path: string) {
  const fallback = process.env.NODE_ENV === "production"
    ? `http://127.0.0.1:${process.env.PORT ?? "8787"}`
    : "http://127.0.0.1:5173";
  return `${(process.env.APP_BASE_URL ?? fallback).replace(/\/$/, "")}${path}`;
}

function securityHeaders(_request: Request, response: Response, next: express.NextFunction) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

function createRateLimiter(scope: string, limit: number, windowMs: number) {
  return (request: Request, response: Response, next: express.NextFunction) => {
    const key = `${scope}:${request.ip || request.socket.remoteAddress || "unknown"}`;
    const bucket = consumeRateLimit(key, limit, windowMs);
    response.setHeader("RateLimit-Limit", String(limit));
    response.setHeader("RateLimit-Remaining", String(bucket.remaining));
    response.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (!bucket.allowed) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000))));
      return sendError(response, 429, "RATE_LIMITED", "Too many requests. Wait a moment and try again.");
    }
    next();
  };
}

function requestId(response: Response) {
  return String(response.locals.requestId ?? "unknown");
}

function sendError(response: Response, status: number, code: string, message: string) {
  response.status(status).json({ error: { code, message, requestId: requestId(response) } });
}

function createGuest(response: Response) {
  const token = createToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + GUEST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const anonymousSession = createAnonymousSession({ id, tokenHash: hashToken(token), expiresAt, quotaDate: quotaDate() });
  response.appendHeader("Set-Cookie", cookieValue("qwen_guest", token, GUEST_DAYS * 24 * 60 * 60));
  return anonymousSession;
}

function resolveActor(request: Request, response: Response, ensureAnonymous = true): Actor {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const secret = authorization.slice("Bearer ".length).trim();
    const apiActor = secret ? findApiKeyActorByHash(hashToken(secret)) : null;
    if (apiActor) return { user: apiActor.user, anonymousSession: null, sessionToken: null, sessionId: null, viaApiKey: true, apiKeyId: apiActor.apiKeyId, scopes: apiActor.scopes };
  }

  const cookies = parseCookies(request);
  const sessionToken = cookies.qwen_session ?? null;
  if (sessionToken) {
    const sessionActor = findSessionActorByHash(hashToken(sessionToken));
    if (sessionActor) return { user: sessionActor.user, anonymousSession: null, sessionToken, sessionId: sessionActor.sessionId, viaApiKey: false, apiKeyId: null, scopes: [] };
  }

  const guestToken = cookies.qwen_guest;
  const existingGuest = guestToken ? findAnonymousSession(hashToken(guestToken), quotaDate()) : null;
  const anonymousSession = existingGuest ?? (ensureAnonymous ? createGuest(response) : null);
  return { user: null, anonymousSession, sessionToken: null, sessionId: null, viaApiKey: false, apiKeyId: null, scopes: [] };
}

function sessionState(actor: Actor): SessionState {
  if (actor.user) {
    const account = getCreditAccount(actor.user.id);
    const billing = getBillingState(actor.user.id);
    const isVip = billing.plan === "creator" && (billing.status === "active" || billing.status === "trialing");
    return {
      user: actor.user,
      entitlements: {
        accountType: isVip ? "creator" : "free",
        guestLimit: GUEST_LIMIT,
        guestRemaining: GUEST_LIMIT,
        credits: account.available,
        reservedCredits: account.reserved,
        guestResetsAt: nextGuestReset(),
        priorityGeneration: isVip,
        watermarkedExports: !isVip,
      },
    };
  }
  return {
    user: null,
    entitlements: {
      accountType: "guest",
      guestLimit: GUEST_LIMIT,
      guestRemaining: Math.max(0, GUEST_LIMIT - (actor.anonymousSession?.usedCount ?? 0)),
      credits: 0,
      reservedCredits: 0,
      guestResetsAt: nextGuestReset(),
      priorityGeneration: false,
      watermarkedExports: true,
    },
  };
}

function hasVipAccess(userId: string | null) {
  if (!userId) return false;
  const billing = getBillingState(userId);
  return billing.plan === "creator" && (billing.status === "active" || billing.status === "trialing");
}

function priceLabel(amountCents: number, kind: "subscription" | "credits") {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(amountCents / 100);
  return kind === "subscription" ? `${amount} / month` : `${amount} one time`;
}

function versionedBillingOffer(offerId: typeof billingOfferIds[number]) {
  const base = findBillingOffer(offerId);
  const version = getActiveBillingPriceVersion(offerId);
  if (!base) return null;
  const provider = billingProviderInfo();
  if (!version) return { ...base, configured: false };
  return {
    ...base,
    amountCents: version.amountCents,
    currency: version.currency,
    credits: version.credits,
    kind: version.kind,
    priceLabel: priceLabel(version.amountCents, version.kind),
    configured: provider.enabled && provider.credentialsConfigured,
  };
}

function versionedBillingOffers() {
  return billingOfferIds.map(versionedBillingOffer).filter((offer): offer is NonNullable<typeof offer> => Boolean(offer));
}

function localBillingConfigured() {
  const provider = billingProviderInfo();
  return provider.enabled && provider.credentialsConfigured && listActiveBillingPriceVersions().length === billingOfferIds.length;
}

function pricingPromotionFor(actor: Actor) {
  const promotion = getOrCreatePricingPromotion({
    userId: actor.user?.id ?? null,
    anonymousSessionId: actor.anonymousSession?.id ?? null,
  });
  const intro = versionedBillingOffer("creator_intro");
  const standard = versionedBillingOffer("creator_monthly");
  if (!promotion || !intro || !standard) return null;
  return {
    offerId: intro.id,
    standardOfferId: standard.id,
    startsAt: promotion.startsAt,
    expiresAt: promotion.expiresAt,
    active: promotion.active,
    redeemed: promotion.redeemed,
    standardAmountCents: standard.amountCents,
    promotionalAmountCents: intro.amountCents,
    currency: standard.currency,
  };
}

function requireUser(request: Request, response: Response) {
  const actor = resolveActor(request, response, false);
  if (!actor.user) {
    sendError(response, 401, "UNAUTHENTICATED", "Sign in to continue.");
    return null;
  }
  return actor;
}

function validateGeneration(body: Partial<GenerationRequest>) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3 || prompt.length > 1000) return { error: "Prompt must be between 3 and 1000 characters." } as const;
  if (!validRatios.includes(body.aspectRatio as AspectRatio) || !validStyles.includes(body.style as ImageStyle) || !validQualities.includes(body.quality as ImageQuality)) {
    return { error: "One or more generation settings are invalid." } as const;
  }
  return {
    input: {
      prompt,
      aspectRatio: body.aspectRatio as AspectRatio,
      style: body.style as ImageStyle,
      quality: body.quality as ImageQuality,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
    },
  } as const;
}

function objectString(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return "";
}

function stripePeriodEnd(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function invoiceSubscriptionId(object: Record<string, unknown>) {
  const direct = objectString(object.subscription);
  if (direct) return direct;
  const parent = object.parent && typeof object.parent === "object" ? object.parent as Record<string, unknown> : null;
  const details = parent?.subscription_details && typeof parent.subscription_details === "object"
    ? parent.subscription_details as Record<string, unknown>
    : null;
  return objectString(details?.subscription);
}

function invoicePeriodEnd(object: Record<string, unknown>) {
  const lines = object.lines && typeof object.lines === "object" ? object.lines as Record<string, unknown> : null;
  const data = Array.isArray(lines?.data) ? lines.data : [];
  const first = data[0] && typeof data[0] === "object" ? data[0] as Record<string, unknown> : null;
  const period = first?.period && typeof first.period === "object" ? first.period as Record<string, unknown> : null;
  return stripePeriodEnd(period?.end ?? object.period_end);
}

function invoicePriceIds(object: Record<string, unknown>) {
  const lines = object.lines && typeof object.lines === "object" ? object.lines as Record<string, unknown> : null;
  const data = Array.isArray(lines?.data) ? lines.data : [];
  return data.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const line = value as Record<string, unknown>;
    const direct = objectString(line.price);
    const pricing = line.pricing && typeof line.pricing === "object" ? line.pricing as Record<string, unknown> : null;
    const details = pricing?.price_details && typeof pricing.price_details === "object" ? pricing.price_details as Record<string, unknown> : null;
    const nested = objectString(details?.price);
    return direct || nested ? [direct || nested] : [];
  });
}

function invoicePaymentIntentId(object: Record<string, unknown>) {
  const direct = objectString(object.payment_intent);
  if (direct) return direct;
  const payments = object.payments && typeof object.payments === "object" ? object.payments as Record<string, unknown> : null;
  const data = Array.isArray(payments?.data) ? payments.data : [];
  for (const value of data) {
    if (!value || typeof value !== "object") continue;
    const payment = (value as Record<string, unknown>).payment;
    if (!payment || typeof payment !== "object") continue;
    const paymentIntent = objectString((payment as Record<string, unknown>).payment_intent);
    if (paymentIntent) return paymentIntent;
  }
  return "";
}

function productBillingStatus(value: unknown): "inactive" | "active" | "trialing" | "past_due" | "canceled" {
  if (value === "active" || value === "trialing" || value === "past_due" || value === "canceled") return value;
  if (value === "unpaid" || value === "incomplete_expired" || value === "paused") return "past_due";
  return "inactive";
}

async function handleStripeEvent(event: StripeEvent) {
  const object = event.data.object;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const sessionId = objectString(object.id);
    const mode = object.mode;
    if (mode === "payment" && object.payment_status === "paid" && sessionId) {
      const paymentIntentId = objectString(object.payment_intent);
      if (!paymentIntentId) throw new BillingError("INVALID_BILLING_EVENT", "Paid Checkout Session is missing its PaymentIntent.");
      return completeCreditCheckout({ checkoutSessionId: sessionId, paymentIntentId, ledgerId: crypto.randomUUID() });
    }
    if (mode === "subscription" && (object.payment_status === "paid" || object.payment_status === "no_payment_required") && sessionId) {
      const customerId = objectString(object.customer);
      const subscriptionId = objectString(object.subscription);
      if (customerId && subscriptionId) {
        return completeSubscriptionCheckout({ checkoutSessionId: sessionId, customerId, subscriptionId });
      }
    }
    throw new BillingError("INVALID_BILLING_EVENT", "Checkout event is incomplete or not paid.");
  }

  if (event.type === "checkout.session.expired") {
    const sessionId = objectString(object.id);
    if (sessionId) return expireBillingCheckout(sessionId);
    throw new BillingError("INVALID_BILLING_EVENT", "Expired Checkout Session has no identifier.");
  }

  if (event.type === "invoice.paid") {
    const customerId = objectString(object.customer);
    const subscriptionId = invoiceSubscriptionId(object);
    const invoiceId = objectString(object.id);
    const embeddedPaymentIntentId = invoicePaymentIntentId(object);
    const paymentIntentId = embeddedPaymentIntentId || (invoiceId ? await findPaidStripeInvoicePaymentIntent(invoiceId) : "");
    const amountPaid = typeof object.amount_paid === "number" ? object.amount_paid : -1;
    const subscriptionPrice = invoicePriceIds(object)
      .map(getBillingPriceVersionByStripePriceId)
      .find((version) => version?.kind === "subscription"
        && version.amountCents === amountPaid
        && version.currency === object.currency);
    const allowedReasons = new Set(["subscription_create", "subscription_cycle", "subscription_update"]);
    if (!customerId || !subscriptionId || !invoiceId || !paymentIntentId || object.status !== "paid"
      || object.currency !== "usd" || !allowedReasons.has(String(object.billing_reason)) || !subscriptionPrice) {
      throw new BillingError("INVOICE_VALIDATION_FAILED", "Paid invoice does not match a known Creator price version.");
    }
    return completeSubscriptionInvoice({
      customerId,
      subscriptionId,
      invoiceId,
      paymentIntentId,
      stripePriceId: subscriptionPrice.stripePriceId,
      credits: subscriptionPrice.credits,
      periodEnd: invoicePeriodEnd(object),
      ledgerId: crypto.randomUUID(),
    });
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const paymentIntentId = objectString(object.payment_intent);
    if (!paymentIntentId) throw new BillingError("INVALID_BILLING_EVENT", "Financial reversal has no PaymentIntent.");
    return markPaymentReversal({
      paymentIntentId,
      eventId: event.id,
      status: event.type === "charge.refunded" ? "refunded" : "disputed",
      reason: event.type === "charge.refunded"
        ? "Credit spending is paused while a Stripe refund is reviewed."
        : "Credit spending is paused while a Stripe dispute is reviewed.",
    });
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted" || event.type === "invoice.payment_failed") {
    const customerId = objectString(object.customer);
    if (customerId) {
      const subscriptionId = event.type.startsWith("customer.subscription") ? objectString(object.id) : invoiceSubscriptionId(object);
      const status = event.type === "customer.subscription.deleted" ? "canceled"
        : event.type === "invoice.payment_failed" ? "past_due"
          : productBillingStatus(object.status);
      const updated = updateSubscriptionStatus({
        customerId,
        subscriptionId: subscriptionId || null,
        status,
        periodEnd: stripePeriodEnd(object.current_period_end) ?? invoicePeriodEnd(object),
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
      });
      // Stripe can deliver the cancellation after external-first account deletion
      // has removed the local billing row. The external state is already final, so
      // acknowledging that terminal event avoids an unrecoverable retry loop.
      return event.type === "customer.subscription.deleted" ? true : updated;
    }
  }
  return true;
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  const configuredOrigins = new Set((process.env.CORS_ORIGINS ?? process.env.APP_BASE_URL ?? "")
    .split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean));
  if (process.env.NODE_ENV !== "production") {
    configuredOrigins.add("http://localhost:5173");
    configuredOrigins.add("http://127.0.0.1:5173");
  }
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || configuredOrigins.has(origin.replace(/\/$/, ""))) return callback(null, true);
      callback(null, false);
    },
  }));
  app.use(securityHeaders);
  app.use((_request, response, next) => {
    response.locals.requestId = crypto.randomUUID();
    response.setHeader("X-Request-Id", response.locals.requestId);
    next();
  });
  app.post("/api/billing/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (request, response) => {
    let eventId: string | null = null;
    try {
      if (!billingProviderInfo().webhookConfigured) return sendError(response, 503, "WEBHOOK_UNAVAILABLE", "Stripe webhook verification is not configured.");
      const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");
      const signature = typeof request.headers["stripe-signature"] === "string" ? request.headers["stripe-signature"] : undefined;
      const event = verifyStripeWebhook(rawBody, signature);
      eventId = event.id;
      const claim = claimBillingEvent({ eventId: event.id, eventType: event.type, payloadJson: rawBody.toString("utf8") });
      if (claim === "completed") return response.json({ received: true, duplicate: true });
      if (claim === "busy") return sendError(response, 409, "EVENT_IN_PROGRESS", "This Stripe event is already being processed.");
      if (!(await handleStripeEvent(event))) throw new BillingError("BILLING_DEPENDENCY_MISSING", "The Stripe event has no matching local billing record yet.");
      completeBillingEvent(event.id);
      response.json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe webhook could not be verified.";
      if (eventId) failBillingEvent(eventId, message);
      const code = error instanceof BillingError ? error.code : "INVALID_WEBHOOK";
      const status = code === "INVALID_SIGNATURE" || code === "INVALID_EVENT" || code === "WEBHOOK_UNAVAILABLE"
        ? 400 : code === "INVOICE_VALIDATION_FAILED" ? 422 : 503;
      sendError(response, status, code, message);
    }
  });
  app.use(express.json({ limit: "256kb" }));
  app.use((request, response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method) || request.headers.authorization) return next();
    const origin = request.get("origin");
    if (!origin || configuredOrigins.has(origin.replace(/\/$/, ""))) return next();
    sendError(response, 403, "ORIGIN_REJECTED", "This request origin is not allowed.");
  });
  app.use("/api/auth", createRateLimiter("auth", 30, 15 * 60 * 1000));
  app.use("/api/generations", createRateLimiter("web-generation", 30, 60 * 1000));
  app.use("/v1/generations", createRateLimiter("api-generation", 120, 60 * 1000));
  app.use("/api/billing", createRateLimiter("billing", 30, 60 * 1000));
  app.use("/api/support", createRateLimiter("support", 30, 60 * 60 * 1000));

  app.get("/api/health", (_request, response) => {
    const provider = providerInfo();
    const email = emailProviderInfo();
    const billingProvider = billingProviderInfo();
    const billing = {
      ...billingProvider,
      configured: localBillingConfigured(),
      priceCatalogConfigured: listActiveBillingPriceVersions().length === billingOfferIds.length,
    };
    response.json({ status: provider.configured && email.configured ? "ok" : "degraded", database: "sqlite", generator: provider.model, provider: provider.id, providerConfigured: provider.configured, auth: "session-cookie", oauth: oauthMethods(), email, billing, credits: "ledger", maintenance: maintenanceStatus() });
  });

  app.get("/api/session", (request, response) => {
    response.json(sessionState(resolveActor(request, response)));
  });

  app.get("/api/auth/methods", (_request, response) => {
    response.json({ password: true, ...oauthMethods() });
  });

  app.post("/api/auth/register", async (request, response) => {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (name.length < 2 || name.length > 60) return sendError(response, 400, "INVALID_NAME", "Name must be between 2 and 60 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(response, 400, "INVALID_EMAIL", "Enter a valid email address.");
    if (!passwordIsStrong(password)) {
      return sendError(response, 400, "WEAK_PASSWORD", "Password must be at least 8 characters and include a letter and a number.");
    }
    if (findUserByEmail(email)) return sendError(response, 409, "EMAIL_IN_USE", "An account with this email already exists.");

    const previousActor = resolveActor(request, response);
    const user = createUser({ id: crypto.randomUUID(), name, email, passwordHash: hashPassword(password) });
    const session = createUserSession(request, user.id);
    const migratedGenerations = previousActor.anonymousSession ? migrateGuestGenerations(previousActor.anonymousSession.id, user.id) : 0;
    if (previousActor.anonymousSession) migratePricingPromotion(previousActor.anonymousSession.id, user.id);
    const verification = await issueAuthenticationToken(user, "verify_email");
    response.appendHeader("Set-Cookie", cookieValue("qwen_session", session.token, SESSION_DAYS * 24 * 60 * 60));
    response.status(201).json({
      ...sessionState({ user, anonymousSession: null, sessionToken: session.token, sessionId: session.id, viaApiKey: false, apiKeyId: null, scopes: [] }),
      migratedGenerations,
      verification,
    });
  });

  app.post("/api/auth/login", (request, response) => {
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const row = findUserByEmail(email);
    if (!row || !verifyPassword(password, row.password_hash)) return sendError(response, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

    const previousActor = resolveActor(request, response);
    const user = findUserById(row.id)!;
    const session = createUserSession(request, user.id);
    const migratedGenerations = previousActor.anonymousSession ? migrateGuestGenerations(previousActor.anonymousSession.id, user.id) : 0;
    if (previousActor.anonymousSession) migratePricingPromotion(previousActor.anonymousSession.id, user.id);
    response.appendHeader("Set-Cookie", cookieValue("qwen_session", session.token, SESSION_DAYS * 24 * 60 * 60));
    response.json({ ...sessionState({ user, anonymousSession: null, sessionToken: session.token, sessionId: session.id, viaApiKey: false, apiKeyId: null, scopes: [] }), migratedGenerations });
  });

  app.post("/api/auth/logout", (request, response) => {
    const token = parseCookies(request).qwen_session;
    if (token) revokeSession(hashToken(token));
    response.appendHeader("Set-Cookie", clearCookie("qwen_session"));
    response.status(204).send();
  });

  app.post("/api/auth/verify-email/request", async (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    if (actor.user!.emailVerified) return response.json({ delivered: true, delivery: "none", alreadyVerified: true });
    const delivery = await issueAuthenticationToken(actor.user!, "verify_email");
    if (!delivery.delivered) return sendError(response, 503, "EMAIL_UNAVAILABLE", "Verification email delivery is not configured or temporarily unavailable.");
    response.json(delivery);
  });

  app.post("/api/auth/verify-email", (request, response) => {
    const token = typeof request.body?.token === "string" ? request.body.token.trim() : "";
    if (!token) return sendError(response, 400, "INVALID_TOKEN", "A verification token is required.");
    const user = consumeEmailVerification(hashToken(token), crypto.randomUUID());
    if (!user) return sendError(response, 400, "INVALID_TOKEN", "This verification link is invalid or has expired.");
    const actor = resolveActor(request, response, false);
    response.json({
      verified: true,
      user,
      ...(actor.user?.id === user.id ? { session: sessionState({ ...actor, user }) } : {}),
    });
  });

  app.post("/api/auth/password-reset/request", async (request, response) => {
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const row = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? findUserByEmail(email) : undefined;
    let devToken: string | undefined;
    if (row) {
      const user = findUserById(row.id)!;
      const delivery = await issueAuthenticationToken(user, "reset_password");
      devToken = delivery.devToken;
    }
    response.status(202).json({ accepted: true, ...(devToken ? { devToken } : {}) });
  });

  app.post("/api/auth/password-reset/confirm", (request, response) => {
    const token = typeof request.body?.token === "string" ? request.body.token.trim() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (!token) return sendError(response, 400, "INVALID_TOKEN", "A reset token is required.");
    if (!passwordIsStrong(password)) return sendError(response, 400, "WEAK_PASSWORD", "Password must be at least 8 characters and include a letter and a number.");
    if (!consumePasswordReset(hashToken(token), hashPassword(password))) {
      return sendError(response, 400, "INVALID_TOKEN", "This reset link is invalid or has expired.");
    }
    response.appendHeader("Set-Cookie", clearCookie("qwen_session"));
    response.json({ reset: true });
  });

  app.get("/api/auth/oauth/:provider/start", (request, response) => {
    if (!isOAuthProvider(request.params.provider)) return sendError(response, 404, "NOT_FOUND", "Sign-in provider not found.");
    try {
      const actor = resolveActor(request, response);
      const state = createToken();
      const codeVerifier = createToken(48);
      createOAuthState({
        stateHash: hashToken(state),
        provider: request.params.provider,
        codeVerifier,
        anonymousSessionId: actor.anonymousSession?.id ?? null,
        expiresAt: new Date(Date.now() + OAUTH_STATE_MINUTES * 60 * 1000).toISOString(),
      });
      response.redirect(createAuthorizationUrl(request.params.provider, state, codeVerifier));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Social sign-in could not start.";
      sendError(response, error instanceof OAuthError ? 503 : 500, "OAUTH_UNAVAILABLE", message);
    }
  });

  app.get("/api/auth/oauth/:provider/callback", async (request, response) => {
    if (!isOAuthProvider(request.params.provider)) return response.redirect(appReturnUrl("/?oauth_error=provider"));
    const code = typeof request.query.code === "string" ? request.query.code : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";
    const denied = typeof request.query.error === "string" ? request.query.error : "";
    if (denied || !code || !state) return response.redirect(appReturnUrl(`/?oauth_error=${encodeURIComponent(denied || "missing_response")}`));
    const storedState = consumeOAuthState(hashToken(state), request.params.provider);
    if (!storedState) return response.redirect(appReturnUrl("/?oauth_error=invalid_state"));
    try {
      const profile = await exchangeOAuthCode(request.params.provider, code, storedState.codeVerifier);
      const user = resolveOAuthUser({
        provider: request.params.provider,
        subject: profile.subject,
        email: profile.email,
        name: profile.name.slice(0, 60),
        userId: crypto.randomUUID(),
        identityId: crypto.randomUUID(),
        passwordHash: hashPassword(createToken()),
        ledgerId: crypto.randomUUID(),
      });
      const session = createUserSession(request, user.id);
      const migrated = storedState.anonymousSessionId ? migrateGuestGenerations(storedState.anonymousSessionId, user.id) : 0;
      if (storedState.anonymousSessionId) migratePricingPromotion(storedState.anonymousSessionId, user.id);
      response.appendHeader("Set-Cookie", cookieValue("qwen_session", session.token, SESSION_DAYS * 24 * 60 * 60));
      response.redirect(appReturnUrl(`/studio?oauth=success&migrated=${migrated}`));
    } catch (error) {
      console.error(error);
      response.redirect(appReturnUrl(`/?oauth_error=${encodeURIComponent(error instanceof OAuthError ? "provider_response" : "unexpected")}`));
    }
  });

  app.patch("/api/account/profile", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (name.length < 2 || name.length > 60) return sendError(response, 400, "INVALID_NAME", "Name must be between 2 and 60 characters.");
    response.json({ user: updateUserProfile(actor.user!.id, name) });
  });

  app.post("/api/account/password", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor || !actor.sessionId) return;
    const currentPassword = typeof request.body?.currentPassword === "string" ? request.body.currentPassword : "";
    const newPassword = typeof request.body?.newPassword === "string" ? request.body.newPassword : "";
    const row = findUserByEmail(actor.user!.email);
    if (!row || !verifyPassword(currentPassword, row.password_hash)) return sendError(response, 401, "INVALID_CREDENTIALS", "Current password is incorrect.");
    if (!passwordIsStrong(newPassword)) return sendError(response, 400, "WEAK_PASSWORD", "New password must be at least 8 characters and include a letter and a number.");
    if (verifyPassword(newPassword, row.password_hash)) return sendError(response, 400, "PASSWORD_UNCHANGED", "Choose a password you have not just used.");
    updateUserPassword(actor.user!.id, hashPassword(newPassword), actor.sessionId);
    response.json({ changed: true, revokedOtherSessions: true });
  });

  app.get("/api/account/sessions", (request, response) => {
    const actor = requireUser(request, response);
    if (actor) response.json({ sessions: listSessions(actor.user!.id, actor.sessionId) });
  });

  app.delete("/api/account/sessions/:id", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    if (!revokeSessionById(request.params.id, actor.user!.id)) return sendError(response, 404, "NOT_FOUND", "Session not found.");
    if (request.params.id === actor.sessionId) response.appendHeader("Set-Cookie", clearCookie("qwen_session"));
    response.status(204).send();
  });

  app.post("/api/account/sessions/revoke-others", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor || !actor.sessionId) return;
    response.json({ revoked: revokeOtherSessions(actor.user!.id, actor.sessionId) });
  });

  app.get("/api/account/export", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const payload = getAccountExport(actor.user!.id);
    if (!payload) return sendError(response, 404, "NOT_FOUND", "Account not found.");
    const filename = `qwen-image-account-${new Date().toISOString().slice(0, 10)}.json`;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    response.json(payload);
  });

  app.delete("/api/account", async (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const confirmation = typeof request.body?.confirmation === "string" ? request.body.confirmation.trim().toUpperCase() : "";
    const row = findUserByEmail(actor.user!.email);
    if (confirmation !== "DELETE") return sendError(response, 400, "CONFIRMATION_REQUIRED", "Type DELETE to confirm permanent account deletion.");
    if (!row || !verifyPassword(password, row.password_hash)) return sendError(response, 401, "INVALID_CREDENTIALS", "Password is incorrect.");
    const billing = getBillingState(actor.user!.id);
    try {
      if (billing.stripeCustomerId) {
        if (!billingProviderInfo().secretConfigured) {
          return sendError(response, 503, "BILLING_CLEANUP_UNAVAILABLE", "Account deletion is paused until Stripe cleanup is available. Your local account was not deleted.");
        }
        if (billing.stripeSubscriptionId) await cancelStripeSubscription(billing.stripeSubscriptionId);
        await deleteStripeCustomer(billing.stripeCustomerId);
      }
      if (!deleteUserAccount(actor.user!.id)) return sendError(response, 404, "NOT_FOUND", "Account not found.");
      response.appendHeader("Set-Cookie", clearCookie("qwen_session"));
      response.appendHeader("Set-Cookie", clearCookie("qwen_guest"));
      response.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe billing could not be cleaned up.";
      sendError(response, 502, error instanceof BillingError ? error.code : "BILLING_CLEANUP_FAILED", `${message} Your local account was not deleted.`);
    }
  });

  app.get("/api/billing", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const state = getBillingState(actor.user!.id);
    const { stripeCustomerId: _stripeCustomerId, stripeSubscriptionId: _stripeSubscriptionId, ...account } = state;
    response.json({
      configured: localBillingConfigured(),
      promotion: pricingPromotionFor(actor),
      account,
      offers: versionedBillingOffers().filter((offer) => offer.id !== "creator_intro"),
      orders: listBillingOrders(actor.user!.id),
    });
  });

  app.post("/api/billing/checkout", async (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    if (!actor.user!.emailVerified) return sendError(response, 403, "EMAIL_NOT_VERIFIED", "Verify your email before starting a purchase.");
    if (!localBillingConfigured()) return sendError(response, 503, "BILLING_UNAVAILABLE", "Billing is disabled or not fully configured.");
    const offerId = typeof request.body?.offerId === "string" ? request.body.offerId : "";
    const offer = billingOfferIds.includes(offerId as typeof billingOfferIds[number])
      ? versionedBillingOffer(offerId as typeof billingOfferIds[number])
      : null;
    if (!offer) return sendError(response, 400, "INVALID_OFFER", "Choose a valid billing offer.");
    if (!offer.configured) return sendError(response, 503, "OFFER_UNAVAILABLE", "This billing offer is not configured.");
    const currentBilling = getBillingState(actor.user!.id);
    if (offer.kind === "subscription" && currentBilling.plan === "creator" && (currentBilling.status === "active" || currentBilling.status === "trialing")) {
      return sendError(response, 409, "ALREADY_SUBSCRIBED", "Manage your active Creator subscription in the billing portal.");
    }
    if (offer.id === "creator_intro" && !getPricingPromotionForUser(actor.user!.id)?.active) {
      return sendError(response, 409, "PROMOTION_EXPIRED", "The $8 launch window has ended. Creator VIP is now $10 per month.");
    }
    try {
      const state = currentBilling;
      let customerId = state.stripeCustomerId;
      if (!customerId) {
        customerId = await createStripeCustomer(actor.user!);
        setStripeCustomer(actor.user!.id, customerId);
      }
      const checkout = await createStripeCheckout({
        user: actor.user!,
        customerId,
        offer,
        priceId: getActiveBillingPriceVersion(offer.id)!.stripePriceId,
        successUrl: appReturnUrl("/studio/billing?checkout=success"),
        cancelUrl: appReturnUrl("/studio/billing?checkout=canceled"),
      });
      createBillingOrder({
        id: crypto.randomUUID(),
        userId: actor.user!.id,
        checkoutSessionId: checkout.id,
        offerId: offer.id,
        kind: offer.kind,
        credits: offer.credits,
        amountCents: offer.amountCents,
        currency: offer.currency,
        stripePriceId: getActiveBillingPriceVersion(offer.id)!.stripePriceId,
      });
      response.status(201).json({ url: checkout.url });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout could not be created.";
      sendError(response, error instanceof BillingError && error.code === "OFFER_UNAVAILABLE" ? 503 : 502, error instanceof BillingError ? error.code : "BILLING_FAILED", message);
    }
  });

  app.post("/api/billing/portal", async (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const state = getBillingState(actor.user!.id);
    if (!state.stripeCustomerId) return sendError(response, 400, "NO_BILLING_ACCOUNT", "Complete a checkout before opening the billing portal.");
    try {
      const url = await createStripePortal(state.stripeCustomerId, appReturnUrl("/studio/billing"));
      response.json({ url });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing portal could not be opened.";
      sendError(response, 502, error instanceof BillingError ? error.code : "BILLING_FAILED", message);
    }
  });

  app.get("/api/generations", (request, response) => {
    const actor = resolveActor(request, response);
    const requested = Number(request.query.limit ?? 8);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), 1), 50) : 8;
    const projectId = typeof request.query.projectId === "string" ? request.query.projectId : null;
    response.json({ generations: listGenerations({ userId: actor.user?.id ?? null, anonymousSessionId: actor.anonymousSession?.id ?? null, limit, projectId }) });
  });

  const generationHandler = (apiOnly: boolean) => async (request: Request, response: Response) => {
    const startedAt = Date.now();
    const actor = resolveActor(request, response, !apiOnly);
    if (apiOnly && (!actor.user || !actor.viaApiKey)) return sendError(response, 401, "INVALID_API_KEY", "Provide a valid API key in the Authorization header.");
    if (apiOnly && !actor.scopes.includes("generations:write")) return sendError(response, 403, "INSUFFICIENT_SCOPE", "This API key does not have generations:write access.");
    if (apiOnly && actor.user) {
      response.once("finish", () => {
        try {
          recordApiRequest({
            id: crypto.randomUUID(),
            userId: actor.user!.id,
            apiKeyId: actor.apiKeyId,
            method: request.method,
            path: request.path,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
            requestId: requestId(response),
          });
        } catch (error) {
          console.error("Failed to persist API request log", error);
        }
      });
    }
    const normalizedBody = apiOnly ? {
      prompt: request.body?.prompt,
      aspectRatio: request.body?.aspect_ratio,
      style: request.body?.style ? String(request.body.style).replace(/^./, (value: string) => value.toUpperCase()) : "Photorealistic",
      quality: request.body?.quality ? String(request.body.quality).replace(/^./, (value: string) => value.toUpperCase()) : "High",
      projectId: request.body?.project_id,
    } : request.body;
    const validation = validateGeneration(normalizedBody);
    if ("error" in validation) return sendError(response, 400, "INVALID_REQUEST", validation.error ?? "Invalid generation request.");
    const input = validation.input;
    if (input.projectId && (!actor.user || !projectBelongsToUser(input.projectId, actor.user.id))) {
      return sendError(response, 400, "INVALID_PROJECT", "Choose a project that belongs to your account.");
    }

    const idempotencyKey = typeof request.headers["idempotency-key"] === "string" ? request.headers["idempotency-key"].trim() : "";
    if (apiOnly && idempotencyKey && actor.user) {
      if (idempotencyKey.length > 128) return sendError(response, 400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 128 characters or fewer.");
      const existing = findIdempotentGeneration(actor.user.id, idempotencyKey);
      if (existing) return response.status(200).json(existing);
    }

    const generationId = crypto.randomUUID();
    const creditCost = actor.user ? qualityCosts[input.quality] : 0;
    const queueTier: GenerationQueueTier = hasVipAccess(actor.user?.id ?? null) ? "vip" : "free";
    let quotaConsumed = false;
    let creditsReserved = false;
    if (actor.user) {
      const reservation = reserveCredits({ ledgerId: crypto.randomUUID(), userId: actor.user.id, amount: creditCost, referenceId: generationId });
      creditsReserved = reservation.reserved;
      if (!creditsReserved && reservation.blockedReason) return sendError(response, 423, "BILLING_REVIEW_REQUIRED", reservation.blockedReason);
      if (!creditsReserved) return sendError(response, 402, "INSUFFICIENT_CREDITS", `This generation costs ${creditCost} credits.`);
    } else if (actor.anonymousSession) {
      quotaConsumed = consumeGuestQuota(actor.anonymousSession.id, quotaDate(), GUEST_LIMIT);
      if (!quotaConsumed) return sendError(response, 429, "ANONYMOUS_LIMIT_REACHED", "You have used today's three free generations. Sign up for 20 credits or return tomorrow.");
    } else {
      return sendError(response, 401, "UNAUTHENTICATED", "A session is required to generate an image.");
    }

    createPending({
      id: generationId,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      style: input.style,
      quality: input.quality,
      ownerUserId: actor.user?.id ?? null,
      anonymousSessionId: actor.anonymousSession?.id ?? null,
      projectId: input.projectId,
      creditCost,
      queueTier,
    });
    if (apiOnly && idempotencyKey && actor.user) saveIdempotencyKey(actor.user.id, idempotencyKey, generationId);

    try {
      response.setHeader("X-Generation-Queue", queueTier);
      const result = await generationQueue.enqueue({
        id: generationId,
        tier: queueTier,
        delayMs: queueTier === "free" ? freeQueueDelayMs() : 0,
        task: async () => {
          markGenerationProcessing(generationId);
          return getGenerationProvider().generate(input);
        },
      });
      const saved = completeGeneration(generationId, result);
      if (actor.user && creditsReserved) settleCredits({ ledgerId: crypto.randomUUID(), userId: actor.user.id, amount: creditCost, referenceId: generationId });
      response.status(201).json(saved?.generation);
    } catch (error) {
      failGeneration(generationId);
      if (actor.user && creditsReserved) refundCredits({ ledgerId: crypto.randomUUID(), userId: actor.user.id, amount: creditCost, referenceId: generationId });
      if (actor.anonymousSession && quotaConsumed) releaseGuestQuota(actor.anonymousSession.id, quotaDate());
      if (!(error instanceof ProviderError)) console.error(error);
      const code = error instanceof ProviderError ? error.code : "GENERATION_FAILED";
      const status = code === "CONTENT_BLOCKED" ? 400 : code === "GENERATION_TIMEOUT" ? 504 : 503;
      const message = error instanceof Error ? error.message : "The image could not be generated. No allowance or credits were charged.";
      sendError(response, status, code, message);
    }
  };

  app.post("/api/generations", generationHandler(false));
  app.post("/v1/generations", generationHandler(true));

  const sendGenerationAsset = (download: boolean) => (request: Request, response: Response) => {
    const actor = resolveActor(request, response, false);
    const generationId = String(request.params.id);
    if (!canAccessGeneration(generationId, actor.user?.id ?? null, actor.anonymousSession?.id ?? null)) {
      return sendError(response, 404, "NOT_FOUND", "Image not found.");
    }
    const record = getGenerationRecord(generationId);
    if (!record?.asset) return sendError(response, 404, "NOT_FOUND", "Image not found.");
    const isVip = hasVipAccess(actor.user?.id ?? null);
    const source = { ...record.asset, width: record.generation.width, height: record.generation.height };
    const asset = isVip ? originalExport(source) : watermarkedExport(source);
    const disposition = download ? "attachment" : "inline";
    const suffix = asset.watermarked ? "-watermarked" : "-original";
    response.setHeader("Content-Type", asset.mimeType === "image/svg+xml" ? "image/svg+xml; charset=utf-8" : asset.mimeType);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Vary", "Cookie, Authorization");
    response.setHeader("X-Export-Tier", isVip ? "vip" : "free");
    response.setHeader("X-Export-Watermarked", asset.watermarked ? "true" : "false");
    response.setHeader("Content-Disposition", `${disposition}; filename=\"qwen-image-3-${generationId}${suffix}.${asset.extension}\"`);
    response.send(asset.data);
  };

  app.get("/api/generations/:id/image", sendGenerationAsset(false));
  app.get("/api/generations/:id/download", sendGenerationAsset(true));

  app.delete("/api/generations/:id", (request, response) => {
    const actor = resolveActor(request, response, false);
    if (!deleteGeneration(request.params.id, actor.user?.id ?? null, actor.anonymousSession?.id ?? null)) {
      return sendError(response, 404, "NOT_FOUND", "Generation not found.");
    }
    response.status(204).send();
  });

  app.patch("/api/generations/:id/favorite", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const favorite = Boolean(request.body?.favorite);
    if (!toggleFavorite(request.params.id, actor.user!.id, favorite)) return sendError(response, 404, "NOT_FOUND", "Generation not found.");
    response.json({ favorite });
  });

  app.get("/api/workspace/overview", (request, response) => {
    const actor = requireUser(request, response);
    if (actor) response.json(getWorkspaceOverview(actor.user!.id));
  });

  app.get("/api/support/tickets", (request, response) => {
    const actor = requireUser(request, response);
    if (actor) response.json({ tickets: listSupportTickets(actor.user!.id) });
  });

  app.post("/api/support/tickets", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const subject = typeof request.body?.subject === "string" ? request.body.subject.trim() : "";
    const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
    const category = request.body?.category as SupportTicketCategory;
    const priority = request.body?.priority as SupportTicketPriority;
    if (subject.length < 4 || subject.length > 120) return sendError(response, 400, "INVALID_SUBJECT", "Subject must be between 4 and 120 characters.");
    if (message.length < 10 || message.length > 4000) return sendError(response, 400, "INVALID_MESSAGE", "Message must be between 10 and 4000 characters.");
    if (!validSupportCategories.includes(category)) return sendError(response, 400, "INVALID_CATEGORY", "Choose a valid support category.");
    if (!validSupportPriorities.includes(priority)) return sendError(response, 400, "INVALID_PRIORITY", "Choose a valid support priority.");
    response.status(201).json(createSupportTicket({
      id: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      userId: actor.user!.id,
      subject,
      category,
      priority,
      message,
    }));
  });

  app.get("/api/support/tickets/:id", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const ticket = getSupportTicket(actor.user!.id, request.params.id);
    if (!ticket) return sendError(response, 404, "NOT_FOUND", "Support ticket not found.");
    response.json(ticket);
  });

  app.post("/api/support/tickets/:id/messages", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
    if (message.length < 2 || message.length > 4000) return sendError(response, 400, "INVALID_MESSAGE", "Reply must be between 2 and 4000 characters.");
    const result = addSupportMessage({
      id: crypto.randomUUID(),
      ticketId: request.params.id,
      userId: actor.user!.id,
      message,
    });
    if (result.outcome === "not_found") return sendError(response, 404, "NOT_FOUND", "Support ticket not found.");
    if (result.outcome === "closed") return sendError(response, 409, "TICKET_CLOSED", "Reopen this ticket before replying.");
    response.status(201).json(result.ticket);
  });

  app.patch("/api/support/tickets/:id", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const status = request.body?.status;
    if (status !== "open" && status !== "closed") return sendError(response, 400, "INVALID_STATUS", "A ticket can be reopened or closed.");
    const ticket = updateSupportTicketStatus({ ticketId: request.params.id, userId: actor.user!.id, status });
    if (!ticket) return sendError(response, 404, "NOT_FOUND", "Support ticket not found.");
    response.json(ticket);
  });

  app.get("/api/projects", (request, response) => {
    const actor = requireUser(request, response);
    if (actor) response.json({ projects: listProjects(actor.user!.id) });
  });

  app.post("/api/projects", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
    if (name.length < 2 || name.length > 80) return sendError(response, 400, "INVALID_PROJECT", "Project name must be between 2 and 80 characters.");
    response.status(201).json(createProject({ id: crypto.randomUUID(), userId: actor.user!.id, name, description: description.slice(0, 240) }));
  });

  app.patch("/api/projects/:id", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
    if (name.length < 2 || name.length > 80) return sendError(response, 400, "INVALID_PROJECT", "Project name must be between 2 and 80 characters.");
    const project = updateProject({ id: request.params.id, userId: actor.user!.id, name, description: description.slice(0, 240), archived: Boolean(request.body?.archived) });
    if (!project) return sendError(response, 404, "NOT_FOUND", "Project not found.");
    response.json(project);
  });

  app.get("/api/credits", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    response.json({ account: getCreditAccount(actor.user!.id), ledger: listCreditLedger(actor.user!.id) });
  });

  app.get("/api/api-keys", (request, response) => {
    const actor = requireUser(request, response);
    if (actor) response.json({ apiKeys: listApiKeys(actor.user!.id) });
  });

  app.get("/api/api-logs", (request, response) => {
    const actor = requireUser(request, response);
    if (actor) response.json({ requests: listApiRequestLogs(actor.user!.id) });
  });

  app.post("/api/api-keys", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    if (!actor.user!.emailVerified) return sendError(response, 403, "EMAIL_NOT_VERIFIED", "Verify your email before creating an API key.");
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (name.length < 2 || name.length > 60) return sendError(response, 400, "INVALID_NAME", "Key name must be between 2 and 60 characters.");
    const secret = `qig_${createToken(24)}`;
    const key = createApiKey({ id: crypto.randomUUID(), userId: actor.user!.id, name, prefix: secret.slice(0, 12), secretHash: hashToken(secret) });
    response.status(201).json({ ...key, secret });
  });

  app.delete("/api/api-keys/:id", (request, response) => {
    const actor = requireUser(request, response);
    if (!actor) return;
    if (!revokeApiKey(request.params.id, actor.user!.id)) return sendError(response, 404, "NOT_FOUND", "API key not found.");
    response.status(204).send();
  });

  app.get("/api/catalog", (request, response) => {
    const activeProvider = providerInfo();
    const actor = resolveActor(request, response);
    const publicOffers = versionedBillingOffers().filter((offer) => offer.id !== "creator_intro");
    const creatorOffer = versionedBillingOffer("creator_monthly");
    response.json({
      ...createCatalogCore({
        providerId: activeProvider.id === "alibaba-model-studio" ? "alibaba-model-studio" : "local-preview",
        providerModel: activeProvider.model,
        providerConfigured: activeProvider.configured,
        creatorPriceLabel: creatorOffer?.priceLabel ?? "$10 / month",
        creatorCredits: creatorOffer?.credits ?? 300,
        creatorPlanned: !localBillingConfigured(),
      }),
      promotion: pricingPromotionFor(actor),
      creditPacks: publicOffers.filter((offer) => offer.kind === "credits"),
    });
  });

  app.use(["/api/{*path}", "/v1/{*path}"], (_request, response) => sendError(response, 404, "NOT_FOUND", "API route not found."));

  const distPath = resolve("dist");
  if (process.env.NODE_ENV === "production" && existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("/{*path}", (_request, response) => response.sendFile(resolve(distPath, "index.html")));
  }

  app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    console.error(error);
    if (!response.headersSent) sendError(response, 500, "UNEXPECTED_ERROR", "Unexpected server error.");
  });
  return app;
}
