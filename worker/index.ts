import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { renderGeneration } from "../server/generator.js";
import { BILLING_TERMS_VERSION } from "../src/billing-policy.js";
import { createCatalogCore, createModelCatalog, KIE_QWEN_MODEL_ID, SUPPORTED_QWEN_MODEL_ID } from "../src/catalog.js";
import { publicCanonicalUrl, rewritePublicCanonicalMetadata } from "../src/seo.js";
import type {
  AccountSession,
  ApiKeyCreated,
  ApiKeySummary,
  ApiRequestLog,
  AspectRatio,
  BillingOffer,
  BillingSummary,
  BillingInterval,
  BillingPlanTier,
  CatalogModel,
  CreditEntry,
  Generation,
  GenerationRequest,
  ImageQuality,
  ImageStyle,
  Project,
  SessionState,
  SupportMessage,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketDetail,
  SupportTicketPriority,
  SupportTicketStatus,
  User,
  WorkspaceActivity,
  WorkspaceOverview,
} from "../src/types.js";
import {
  allOffers,
  activeBillingOfferIds,
  billingConfigured,
  billingCredentialsConfigured,
  billingEnabled,
  priceIdFor,
  stripeAccessConfigured,
  stripeWebhookConfigured,
} from "./offers.js";
import {
  collectOperationalHealth,
  operationalAlertConfigured,
  readOperationalAlertState,
  runOperationalAlerting,
  sendOperationalAlertTest,
} from "./alerting.js";
import {
  creditMutationApplied,
  grantCredits,
  prepareCreditGrant,
  prepareCreditReservation,
  refundCredits,
  settleCredits,
} from "./credits.js";
import type { Env } from "./env.js";
import {
  ExternalRequestError,
  fetchWithTimeout,
  timeoutMs,
  trustedServiceUrl,
} from "./external.js";
import {
  createAuthorizationUrl,
  exchangeOAuthCode,
  isOAuthProvider,
  oauthMethods,
  type OAuthProvider,
} from "./oauth.js";
import { runMaintenance, type MaintenanceStripeEvent } from "./maintenance.js";
import { KieQwenImageProvider } from "./kie.js";
import { createToken, hashPassword, hashToken, hexToBytes, hmacSha256, timingSafeEqual, verifyPassword } from "./security.js";

type Variables = {
  requestId: string;
  actor: Actor;
};

type WorkerContext = { Bindings: Env; Variables: Variables };

interface UserRow {
  id: string;
  name: string;
  email_normalized: string;
  password_hash: string;
  email_verified_at: string | null;
  created_at: string;
}

interface Actor {
  user: User | null;
  userRow: UserRow | null;
  userId: string | null;
  sessionId: string | null;
  apiKeyId: string | null;
  scopes: string[];
}

interface GenerationRow {
  id: string;
  owner_user_id: string | null;
  anonymous_session_id: string | null;
  project_id: string | null;
  prompt: string;
  aspect_ratio: AspectRatio;
  style: ImageStyle;
  quality: ImageQuality;
  status: "processing" | "complete" | "failed";
  width: number;
  height: number;
  r2_key: string | null;
  mime_type: string | null;
  provider: string;
  model: string;
  credit_cost: number;
  queue_tier: "free" | "vip";
  queued_at: string;
  processing_started_at: string | null;
  favorite: number;
  created_at: string;
}

interface BillingAccountRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: "free" | "creator";
  plan_tier: "free" | BillingPlanTier;
  billing_interval: BillingInterval | null;
  active_offer_id: string | null;
  status: "inactive" | "active" | "trialing" | "past_due" | "canceled";
  current_period_end: string | null;
  cancel_at_period_end: number;
  spending_blocked: number;
  block_reason: string | null;
}

interface BillingOrderRow {
  id: string;
  user_id: string;
  stripe_checkout_session_id: string;
  offer_id: string;
  kind: "subscription" | "credits";
  credits: number;
  amount_cents: number;
  currency: string;
  status: "pending" | "paid" | "expired";
  financial_status: "normal" | "refunded" | "disputed";
  payment_intent_id: string | null;
  stripe_price_id: string | null;
  created_at: string;
  completed_at: string | null;
}

interface BillingPaymentOwnerRow {
  user_id: string;
  credits_granted: number;
  amount_cents: number;
}

interface BillingPriceVersionRow {
  stripe_price_id: string;
  offer_id: BillingOffer["id"];
  kind: BillingOffer["kind"];
  amount_cents: number;
  currency: "usd";
  credits: number;
  active_for_checkout: number;
  effective_from: string;
  retired_at: string | null;
}

type BillingReviewTrigger = "early_fraud_warning" | "refund" | "dispute";
type BillingReviewDecision = "confirmed_loss" | "cleared";

interface BillingReviewRow {
  id: string;
  payment_intent_id: string;
  user_id: string;
  latest_trigger_type: BillingReviewTrigger;
  status: "open" | "resolved";
  decision: BillingReviewDecision | null;
  credits_at_risk: number;
  credits_reclaimed: number;
  unrecovered_credits: number;
  operator_note: string | null;
  resolved_by: string | null;
  opened_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface BillingReviewActionRow {
  id: string;
  review_id: string;
  idempotency_key: string;
  decision: BillingReviewDecision;
  credits_reclaimed: number;
  unrecovered_after: number;
  operator_id: string;
  note: string;
  created_at: string;
}

type StripeEvent = MaintenanceStripeEvent;

const app = new Hono<WorkerContext>();
const encoder = new TextEncoder();
const SESSION_DAYS = 30;
const OAUTH_STATE_SECONDS = 10 * 60;
const billingOfferIds = activeBillingOfferIds;
const validRatios: AspectRatio[] = ["1:1", "3:2", "16:9", "4:3", "9:16"];
const validStyles: ImageStyle[] = ["Photorealistic", "Editorial", "Cinematic", "Illustration"];
const validQualities: ImageQuality[] = ["Standard", "High", "Ultra"];
const validSupportCategories: SupportTicketCategory[] = ["generation", "billing", "api", "account", "other"];
const validSupportPriorities: SupportTicketPriority[] = ["normal", "high"];
const qualityCosts: Record<ImageQuality, number> = { Standard: 4, High: 8, Ultra: 16 };

function modelRuntime(env: Env) {
  const requestedProvider = env.GENERATION_PROVIDER?.trim().toLowerCase();
  const providerId = requestedProvider === "kie"
    ? "kie-ai" as const
    : requestedProvider === "qwen"
      ? "alibaba-model-studio" as const
      : "local-preview" as const;
  const providerModel = providerId === "kie-ai"
    ? env.KIE_MODEL_ID?.trim() || KIE_QWEN_MODEL_ID
    : env.QWEN_MODEL_ID?.trim() || (providerId === "alibaba-model-studio" ? SUPPORTED_QWEN_MODEL_ID : "local-qwen-preview");
  return {
    providerId,
    providerModel,
    providerConfigured: providerId === "local-preview"
      || (providerId === "alibaba-model-studio" && Boolean(
        providerModel === SUPPORTED_QWEN_MODEL_ID
          && env.DASHSCOPE_API_KEY?.trim()
          && env.QWEN_API_BASE_URL?.trim()
          && env.QWEN_API_ALLOWED_HOST?.trim()
          && env.QWEN_IMAGE_ALLOWED_HOSTS?.trim(),
      ))
      || (providerId === "kie-ai" && Boolean(
        providerModel === KIE_QWEN_MODEL_ID
          && env.KIE_API_KEY?.trim()
          && env.KIE_API_BASE_URL?.trim()
          && env.KIE_API_ALLOWED_HOST?.trim()
          && env.KIE_IMAGE_ALLOWED_HOSTS?.trim(),
      )),
  };
}

function availableGenerationModel(env: Env, requestedModelId?: string): CatalogModel | null {
  const models = createModelCatalog(modelRuntime(env)).filter((model) => model.available);
  if (!requestedModelId) return models[0] ?? null;
  return models.find((model) => model.id === requestedModelId) ?? null;
}

function now() {
  return new Date().toISOString();
}

export function refundCreditsAtRisk(
  creditsGranted: number,
  paymentAmountCents: number,
  amountRefunded: unknown,
) {
  if (!Number.isSafeInteger(creditsGranted) || creditsGranted <= 0
    || !Number.isSafeInteger(paymentAmountCents) || paymentAmountCents <= 0) {
    throw new Error("Refund exposure requires a positive local payment contract.");
  }
  const refundedCents = typeof amountRefunded === "number"
    && Number.isSafeInteger(amountRefunded)
    && amountRefunded > 0
    ? Math.min(paymentAmountCents, amountRefunded)
    : paymentAmountCents;
  return {
    amountCentsAtRisk: refundedCents,
    creditsAtRisk: Math.min(
      creditsGranted,
      Math.max(1, Math.ceil(creditsGranted * refundedCents / paymentAmountCents)),
    ),
  };
}

function publicUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email_normalized,
    emailVerified: Boolean(row.email_verified_at),
    createdAt: row.created_at,
  };
}

function passwordIsStrong(password: string) {
  return password.length >= 8 && password.length <= 128 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function ipHint(c: Context<WorkerContext>) {
  const address = c.req.header("cf-connecting-ip") || "Cloudflare edge";
  if (address.includes(".")) return address.replace(/\.\d+$/, ".*").slice(0, 80);
  if (address.includes(":")) return `${address.split(":").slice(0, 4).join(":")}:*`.slice(0, 80);
  return address.slice(0, 80);
}

function errorResponse(c: Context<WorkerContext>, status: number, code: string, message: string) {
  return c.json({ error: { code, message, requestId: c.get("requestId") } }, status as ContentfulStatusCode);
}

function setPrivateCookie(c: Context<WorkerContext>, name: string, value: string, days: number) {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: days * 24 * 60 * 60,
  });
}

function oauthStateCookieName(provider: OAuthProvider) {
  return `qwen_oauth_${provider}_state`;
}

function setOAuthStateCookie(c: Context<WorkerContext>, provider: OAuthProvider, state: string) {
  setCookie(c, oauthStateCookieName(provider), state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: OAUTH_STATE_SECONDS,
  });
}

export function oauthStateMatches(cookieState: string | undefined, queryState: string) {
  if (!cookieState || cookieState.length !== queryState.length) return false;
  return timingSafeEqual(encoder.encode(cookieState), encoder.encode(queryState));
}

async function readBody(c: Context<WorkerContext>) {
  return c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
}

function billingOperatorAccess(c: Context<WorkerContext>) {
  const expected = c.env.BILLING_OPERATOR_TOKEN?.trim() || "";
  if (expected.length < 32) return "unconfigured" as const;
  const authorization = c.req.header("authorization") || "";
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!provided || !timingSafeEqual(encoder.encode(provided), encoder.encode(expected))) {
    return "unauthorized" as const;
  }
  return "authorized" as const;
}

function requireBillingOperator(c: Context<WorkerContext>) {
  const access = billingOperatorAccess(c);
  if (access === "unconfigured") {
    return errorResponse(
      c,
      503,
      "OPERATOR_ACCESS_UNAVAILABLE",
      "Billing review operations are not configured.",
    );
  }
  if (access === "unauthorized") {
    return errorResponse(c, 401, "OPERATOR_UNAUTHORIZED", "Valid billing operator credentials are required.");
  }
  return null;
}

function billingReviewJson(row: BillingReviewRow & { available_credits?: number }) {
  return {
    id: row.id,
    paymentIntentId: row.payment_intent_id,
    userId: row.user_id,
    latestTriggerType: row.latest_trigger_type,
    status: row.status,
    decision: row.decision,
    creditsAtRisk: row.credits_at_risk,
    creditsReclaimed: row.credits_reclaimed,
    unrecoveredCredits: row.unrecovered_credits,
    availableCredits: row.available_credits,
    operatorNote: row.operator_note,
    resolvedBy: row.resolved_by,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

function billingReviewActionJson(row: BillingReviewActionRow) {
  return {
    id: row.id,
    reviewId: row.review_id,
    decision: row.decision,
    creditsReclaimed: row.credits_reclaimed,
    unrecoveredAfter: row.unrecovered_after,
    operatorId: row.operator_id,
    note: row.note,
    createdAt: row.created_at,
  };
}

async function resolveActor(c: Context<WorkerContext>): Promise<Actor> {
  const authorization = c.req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const secretHash = await hashToken(authorization.slice("Bearer ".length).trim());
    const row = await c.env.DB.prepare(`
      SELECT k.id AS api_key_id, k.scopes, u.*
      FROM api_keys k JOIN users u ON u.id = k.user_id
      WHERE k.secret_hash = ? AND k.revoked_at IS NULL
    `).bind(secretHash).first<UserRow & { api_key_id: string; scopes: string }>();
    if (row) {
      await c.env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(now(), row.api_key_id).run();
      return {
        user: publicUser(row),
        userRow: row,
        userId: row.id,
        sessionId: null,
        apiKeyId: row.api_key_id,
        scopes: row.scopes.split(","),
      };
    }
  }

  const sessionToken = getCookie(c, "qwen_session");
  if (sessionToken) {
    const tokenHash = await hashToken(sessionToken);
    const row = await c.env.DB.prepare(`
      SELECT s.id AS session_id, u.*
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).bind(tokenHash, now()).first<UserRow & { session_id: string }>();
    if (row) {
      await c.env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(now(), row.session_id).run();
      return {
        user: publicUser(row),
        userRow: row,
        userId: row.id,
        sessionId: row.session_id,
        apiKeyId: null,
        scopes: [],
      };
    }
    deleteCookie(c, "qwen_session", { path: "/" });
  }

  if (getCookie(c, "qwen_guest")) deleteCookie(c, "qwen_guest", { path: "/" });
  return { user: null, userRow: null, userId: null, sessionId: null, apiKeyId: null, scopes: [] };
}

async function requireUser(c: Context<WorkerContext>) {
  const actor = await resolveActor(c);
  if (!actor.user) return null;
  c.set("actor", actor);
  return actor;
}

async function billingAccount(env: Env, userId: string) {
  const row = await env.DB.prepare("SELECT * FROM billing_accounts WHERE user_id = ?").bind(userId).first<BillingAccountRow>();
  if (row) return row;
  await env.DB.prepare("INSERT OR IGNORE INTO billing_accounts (user_id, updated_at) VALUES (?, ?)").bind(userId, now()).run();
  return (await env.DB.prepare("SELECT * FROM billing_accounts WHERE user_id = ?").bind(userId).first<BillingAccountRow>())!;
}

async function creditAccount(env: Env, userId: string) {
  const row = await env.DB.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = ?").bind(userId).first<{ available: number; reserved: number }>();
  return row ?? { available: 0, reserved: 0 };
}

async function isVip(env: Env, userId: string | null) {
  if (!userId) return false;
  const account = await billingAccount(env, userId);
  return account.plan === "creator"
    && ["creator", "professional"].includes(account.plan_tier)
    && (account.status === "active" || account.status === "trialing");
}

async function hasPaidPlan(env: Env, userId: string | null) {
  if (!userId) return false;
  const account = await billingAccount(env, userId);
  return account.plan === "creator" && (account.status === "active" || account.status === "trialing");
}

async function sessionState(env: Env, actor: Actor): Promise<SessionState> {
  if (actor.user && actor.userId) {
    const credits = await creditAccount(env, actor.userId);
    const vip = await isVip(env, actor.userId);
    const paid = await hasPaidPlan(env, actor.userId);
    return {
      user: actor.user,
      entitlements: {
        accountType: paid ? "creator" : "free",
        guestLimit: 0,
        guestRemaining: 0,
        credits: credits.available,
        reservedCredits: credits.reserved,
        guestResetsAt: "",
        priorityGeneration: vip,
        watermarkedExports: !paid,
      },
    };
  }
  return {
    user: null,
    entitlements: {
      accountType: "guest",
      guestLimit: 0,
      guestRemaining: 0,
      credits: 0,
      reservedCredits: 0,
      guestResetsAt: "",
      priorityGeneration: false,
      watermarkedExports: true,
    },
  };
}

function billingPriceLabel(amountCents: number, kind: BillingOffer["kind"], interval?: BillingInterval) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(amountCents / 100);
  return kind === "subscription" ? `${amount} / ${interval ?? "month"}` : `${amount} one time`;
}

async function activeBillingPriceVersions(env: Env) {
  const result = await env.DB.prepare(`SELECT * FROM billing_price_versions
    WHERE active_for_checkout = 1 ORDER BY offer_id`).all<BillingPriceVersionRow>();
  return result.results;
}

async function activeBillingPriceVersion(env: Env, offerId: BillingOffer["id"]) {
  return env.DB.prepare(`SELECT * FROM billing_price_versions
    WHERE offer_id = ? AND active_for_checkout = 1`).bind(offerId).first<BillingPriceVersionRow>();
}

async function billingPriceVersionByStripeId(env: Env, stripePriceId: string) {
  return env.DB.prepare("SELECT * FROM billing_price_versions WHERE stripe_price_id = ?")
    .bind(stripePriceId).first<BillingPriceVersionRow>();
}

async function versionedBillingOffers(env: Env) {
  const versions = await activeBillingPriceVersions(env);
  const byOffer = new Map(versions.map((version) => [version.offer_id, version]));
  return allOffers(env).map((base) => {
    const version = byOffer.get(base.id);
    if (!version) return { ...base, configured: false };
    return {
      ...base,
      amountCents: version.amount_cents,
      currency: version.currency,
      credits: version.credits,
      kind: version.kind,
      priceLabel: billingPriceLabel(version.amount_cents, version.kind, base.billingInterval),
      configured: base.configured && version.stripe_price_id === priceIdFor(env, base.id),
    };
  });
}

async function billingRuntimeConfigured(env: Env) {
  if (!billingConfigured(env)) return false;
  return (await versionedBillingOffers(env)).some((offer) => offer.configured);
}

function subscriptionDescriptor(offerId: string): {
  tier: BillingPlanTier;
  interval: BillingInterval;
} {
  if (offerId.startsWith("starter_")) return { tier: "starter", interval: offerId.endsWith("_yearly") ? "year" : "month" };
  if (offerId.startsWith("professional_")) return { tier: "professional", interval: offerId.endsWith("_yearly") ? "year" : "month" };
  return { tier: "creator", interval: offerId.endsWith("_yearly") ? "year" : "month" };
}

async function createSession(c: Context<WorkerContext>, userId: string) {
  const id = crypto.randomUUID();
  const token = createToken();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_hint, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, userId, await hashToken(token), (c.req.header("user-agent") || "Unknown device").slice(0, 180), ipHint(c), expiresAt, createdAt, createdAt).run();
  setPrivateCookie(c, "qwen_session", token, SESSION_DAYS);
  return id;
}

async function createSecurityToken(env: Env, userId: string, purpose: "verify_email" | "reset_password") {
  const token = createToken();
  const timestamp = now();
  const lifetime = purpose === "verify_email" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM security_tokens WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL")
      .bind(userId, purpose),
    env.DB.prepare("INSERT INTO security_tokens (id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, purpose, await hashToken(token), new Date(Date.now() + lifetime).toISOString(), timestamp),
  ]);
  return token;
}

async function sendAuthEmail(env: Env, input: { email: string; name: string; token: string; purpose: "verify_email" | "reset_password" }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const path = input.purpose === "verify_email" ? "/verify-email" : "/reset-password";
  const url = `${env.APP_BASE_URL.replace(/\/$/, "")}${path}?token=${encodeURIComponent(input.token)}`;
  const action = input.purpose === "verify_email" ? "Verify email" : "Reset password";
  const response = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.email],
      subject: `${action} · Qwen Image Generator Hub`,
      html: `<p>Hello ${input.name.replace(/[<>&"']/g, "")},</p><p><a href="${url}">${action}</a>. This private link expires automatically.</p>`,
    }),
  }, timeoutMs(env.EXTERNAL_HTTP_TIMEOUT_MS), "Email delivery");
  return response.ok;
}

async function resolveOAuthUser(
  env: Env,
  input: { provider: OAuthProvider; subject: string; email: string; name: string },
) {
  const identity = await env.DB.prepare(`SELECT u.* FROM oauth_identities i
    JOIN users u ON u.id = i.user_id
    WHERE i.provider = ? AND i.provider_subject = ?`)
    .bind(input.provider, input.subject)
    .first<UserRow>();
  if (identity) {
    await grantCredits(env.DB, {
      userId: identity.id,
      amount: 20,
      type: "signup_grant",
      referenceId: "email-verification",
      description: "Account welcome credits",
    });
    return identity;
  }

  let user = await env.DB.prepare("SELECT * FROM users WHERE email_normalized = ?")
    .bind(input.email.toLowerCase())
    .first<UserRow>();
  const timestamp = now();
  if (!user) {
    const userId = crypto.randomUUID();
    const identityId = crypto.randomUUID();
    const welcomeGrant = prepareCreditGrant(env.DB, {
      userId,
      amount: 20,
      type: "signup_grant",
      referenceId: "email-verification",
      description: "Account welcome credits",
      timestamp,
    });
    try {
      const results = await env.DB.batch([
        env.DB.prepare(`INSERT INTO users
          (id, name, email_normalized, password_hash, email_verified_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            userId,
            input.name.slice(0, 60),
            input.email.toLowerCase(),
            await hashPassword(createToken()),
            timestamp,
            timestamp,
            timestamp,
          ),
        env.DB.prepare("INSERT INTO credit_accounts (user_id, available, reserved, updated_at) VALUES (?, 0, 0, ?)")
          .bind(userId, timestamp),
        env.DB.prepare("INSERT INTO billing_accounts (user_id, updated_at) VALUES (?, ?)")
          .bind(userId, timestamp),
        env.DB.prepare(`INSERT INTO oauth_identities
          (id, user_id, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)`)
          .bind(identityId, userId, input.provider, input.subject, timestamp),
        ...welcomeGrant.statements,
      ]);
      creditMutationApplied(results, 4);
    } catch (reason) {
      const raced = await env.DB.prepare("SELECT * FROM users WHERE email_normalized = ?")
        .bind(input.email.toLowerCase())
        .first<UserRow>();
      if (!raced) throw reason;
      user = raced;
    }
    if (!user) {
      user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<UserRow>();
    }
  }

  if (!user) throw new Error("OAuth user resolution failed.");
  const grant = prepareCreditGrant(env.DB, {
    userId: user.id,
    amount: 20,
    type: "signup_grant",
    referenceId: "email-verification",
    description: "Account welcome credits",
    timestamp,
  });
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?")
      .bind(timestamp, timestamp, user.id),
    env.DB.prepare(`INSERT OR IGNORE INTO oauth_identities
      (id, user_id, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), user.id, input.provider, input.subject, timestamp),
    ...grant.statements,
  ]);
  creditMutationApplied(results, 2);
  return (await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first<UserRow>())!;
}

function generationFromRow(row: GenerationRow): Generation {
  const ready = row.status === "complete" && Boolean(row.r2_key);
  return {
    id: row.id,
    prompt: row.prompt,
    aspectRatio: row.aspect_ratio,
    style: row.style,
    quality: row.quality,
    status: row.status,
    width: row.width,
    height: row.height,
    imageUrl: ready ? `/api/generations/${row.id}/image` : null,
    downloadUrl: ready ? `/api/generations/${row.id}/download` : null,
    provider: row.provider,
    model: row.model,
    creditCost: row.credit_cost,
    queueTier: row.queue_tier,
    queuedAt: row.queued_at,
    processingStartedAt: row.processing_started_at,
    favorite: Boolean(row.favorite),
    projectId: row.project_id,
    createdAt: row.created_at,
  };
}

function validateGeneration(value: Record<string, unknown>): GenerationRequest | null {
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (prompt.length < 3 || prompt.length > 1000) return null;
  if (!validRatios.includes(value.aspectRatio as AspectRatio) || !validStyles.includes(value.style as ImageStyle) || !validQualities.includes(value.quality as ImageQuality)) return null;
  return {
    prompt,
    modelId: typeof value.modelId === "string" ? value.modelId : undefined,
    aspectRatio: value.aspectRatio as AspectRatio,
    style: value.style as ImageStyle,
    quality: value.quality as ImageQuality,
    projectId: typeof value.projectId === "string" && value.projectId ? value.projectId : null,
  };
}

function imageDimensions(quality: ImageQuality, ratio: AspectRatio) {
  const base: Record<AspectRatio, [number, number]> = {
    "1:1": [1024, 1024],
    "3:2": [1536, 1024],
    "16:9": [1536, 864],
    "4:3": [1360, 1024],
    "9:16": [864, 1536],
  };
  const scale = quality === "Ultra" ? 2 : quality === "High" ? 1.5 : 1;
  return { width: Math.round(base[ratio][0] * scale), height: Math.round(base[ratio][1] * scale) };
}

function validImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

async function generateAsset(env: Env, input: GenerationRequest) {
  const selectedModel = availableGenerationModel(env, input.modelId);
  if (!selectedModel) {
    throw new ExternalRequestError("PROVIDER_UNAVAILABLE", "The selected image model is not available.");
  }
  if (selectedModel.provider === "local-preview") {
    const result = renderGeneration(input);
    return { bytes: encoder.encode(result.svg), mimeType: "image/svg+xml", width: result.width, height: result.height, provider: selectedModel.provider, model: selectedModel.id };
  }
  if (selectedModel.provider === "kie-ai") {
    if (!env.KIE_API_KEY || !env.KIE_API_BASE_URL || !env.KIE_API_ALLOWED_HOST || !env.KIE_IMAGE_ALLOWED_HOSTS) {
      throw new ExternalRequestError("PROVIDER_UNAVAILABLE", "The image provider is not configured.");
    }
    const provider = new KieQwenImageProvider({
      apiKey: env.KIE_API_KEY,
      baseUrl: env.KIE_API_BASE_URL,
      allowedApiHost: env.KIE_API_ALLOWED_HOST,
      allowedImageHosts: env.KIE_IMAGE_ALLOWED_HOSTS.split(","),
      model: selectedModel.id,
      requestTimeoutMs: timeoutMs(env.EXTERNAL_HTTP_TIMEOUT_MS),
      maxPollMs: timeoutMs(env.KIE_MAX_POLL_MS, 120_000),
      pollIntervalMs: Number.parseInt(env.KIE_POLL_INTERVAL_MS || "2000", 10) || 2_000,
    });
    const result = await provider.generate(input);
    return {
      bytes: result.bytes,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      provider: result.provider,
      model: result.model,
    };
  }
  if (selectedModel.provider !== "alibaba-model-studio") {
    throw new ExternalRequestError("PROVIDER_UNAVAILABLE", "The selected image model has no assigned provider.");
  }
  if (!env.DASHSCOPE_API_KEY || !env.QWEN_API_BASE_URL || !env.QWEN_API_ALLOWED_HOST || !env.QWEN_IMAGE_ALLOWED_HOSTS) {
    throw new ExternalRequestError("PROVIDER_UNAVAILABLE", "The image provider is not configured.");
  }
  const providerBase = new URL(env.QWEN_API_BASE_URL);
  const providerHost = env.QWEN_API_ALLOWED_HOST?.trim().toLowerCase() || "";
  if (
    providerBase.protocol !== "https:"
    || providerBase.username
    || providerBase.password
    || providerBase.port
    || !providerHost
    || providerBase.hostname.toLowerCase() !== providerHost
  ) {
    throw new ExternalRequestError("PROVIDER_UNAVAILABLE", "The image provider is not configured.");
  }
  const dimensions = imageDimensions(input.quality, input.aspectRatio);
  const response = await fetchWithTimeout(`${providerBase.toString().replace(/\/$/, "")}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: selectedModel.id,
      input: { messages: [{ role: "user", content: [{ text: `${input.prompt}\nVisual direction: ${input.style.toLowerCase()}.` }] }] },
      parameters: { size: `${dimensions.width}*${dimensions.height}`, n: 1, prompt_extend: true, watermark: false },
    }),
  }, timeoutMs(env.EXTERNAL_HTTP_TIMEOUT_MS, 60_000), "Image generation provider");
  const payload = await response.json() as { code?: string; message?: string; output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> } };
  if (!response.ok) {
    throw new ExternalRequestError(
      "PROVIDER_REJECTED",
      "The image provider could not complete this request.",
      payload.message || `Provider request failed with status ${response.status}.`,
    );
  }
  const imageUrl = payload.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
  if (!imageUrl) throw new ExternalRequestError("PROVIDER_RESPONSE_INVALID", "The image provider returned no usable image.");
  const parsed = new URL(imageUrl);
  const allowedHosts = env.QWEN_IMAGE_ALLOWED_HOSTS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value && !value.includes("*"));
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new ExternalRequestError("PROVIDER_ASSET_REJECTED", "The image provider returned an untrusted asset location.");
  }
  const image = await fetchWithTimeout(parsed, {}, timeoutMs(env.EXTERNAL_HTTP_TIMEOUT_MS), "Generated image download");
  if (!image.ok) throw new ExternalRequestError("PROVIDER_ASSET_UNAVAILABLE", "The generated image could not be downloaded.");
  const mimeType = (image.headers.get("content-type") || "").split(";")[0].toLowerCase();
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024 || !validImageSignature(bytes, mimeType)) {
    throw new ExternalRequestError("PROVIDER_ASSET_INVALID", "The generated image did not pass asset validation.");
  }
  return { bytes, mimeType, ...dimensions, provider: selectedModel.provider, model: selectedModel.id };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + size, bytes.length)));
  }
  return btoa(binary);
}

function watermarkedSvg(bytes: Uint8Array, mimeType: string, width: number, height: number) {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const unit = Math.min(safeWidth, safeHeight);
  const font = Math.max(18, Math.round(unit * 0.026));
  const source = `data:${mimeType};base64,${bytesToBase64(bytes)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}" data-export-watermark="free"><defs><pattern id="wm" width="${Math.max(320, font * 16)}" height="${Math.max(150, font * 7)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)"><text x="0" y="${font * 4}" fill="#fff" fill-opacity=".18" font-family="Arial,sans-serif" font-size="${font}" font-weight="700">QWEN IMAGE HUB · FREE</text></pattern></defs><image href="${source}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/><rect width="100%" height="100%" fill="url(#wm)"/><g transform="translate(${Math.max(16, safeWidth - 350)} ${Math.max(16, safeHeight - 72)})"><rect width="330" height="52" rx="26" fill="#080909" fill-opacity=".84" stroke="#fff" stroke-opacity=".24"/><circle cx="26" cy="26" r="8" fill="#8b5cf6"/><text x="48" y="33" fill="#fff" font-family="Arial,sans-serif" font-size="16" font-weight="700">Qwen Image Hub · Free export</text></g></svg>`;
}

async function stripeRequest<T>(
  env: Env,
  path: string,
  body?: URLSearchParams,
  method = "POST",
  idempotencyKey?: string,
) {
  if (!stripeAccessConfigured(env) || !env.STRIPE_SECRET_KEY) {
    throw new ExternalRequestError("BILLING_UNAVAILABLE", "Billing services are unavailable.");
  }
  const response = await fetchWithTimeout(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
  }, timeoutMs(env.STRIPE_TIMEOUT_MS), "Billing provider");
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new ExternalRequestError(
      "BILLING_PROVIDER_FAILED",
      "Billing services could not complete this request.",
      payload.error?.message || `Stripe request failed with status ${response.status}.`,
    );
  }
  return payload;
}

async function stripeDeleteObject(
  env: Env,
  path: string,
  expectedId: string,
  kind: "customer" | "subscription",
) {
  if (!stripeAccessConfigured(env) || !env.STRIPE_SECRET_KEY) {
    throw new ExternalRequestError("BILLING_UNAVAILABLE", "Billing services are unavailable.");
  }
  const response = await fetchWithTimeout(`https://api.stripe.com${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  }, timeoutMs(env.STRIPE_TIMEOUT_MS), "Billing provider");
  const payload = await response.json() as {
    id?: unknown;
    deleted?: unknown;
    status?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  if (response.status === 404 && payload.error?.code === "resource_missing") {
    return { id: expectedId, alreadyMissing: true };
  }
  if (!response.ok) {
    throw new ExternalRequestError(
      "BILLING_PROVIDER_FAILED",
      "Billing services could not complete this request.",
      typeof payload.error?.message === "string"
        ? payload.error.message
        : `Stripe request failed with status ${response.status}.`,
    );
  }
  if (payload.id !== expectedId) {
    throw new ExternalRequestError(
      "BILLING_CLEANUP_FAILED",
      `Billing services did not confirm ${kind} deletion.`,
    );
  }
  if (kind === "subscription" && payload.status !== "canceled") {
    throw new ExternalRequestError(
      "BILLING_CLEANUP_FAILED",
      "Billing services did not confirm subscription cancellation.",
    );
  }
  if (kind === "customer" && payload.deleted !== true) {
    throw new ExternalRequestError(
      "BILLING_CLEANUP_FAILED",
      "Billing services did not confirm customer deletion.",
    );
  }
  return { id: expectedId, alreadyMissing: false };
}

function stripeObjectId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return "";
}

function stripeInvoicePriceIds(object: Record<string, unknown>) {
  const lines = object.lines && typeof object.lines === "object" ? object.lines as { data?: unknown[] } : null;
  return (lines?.data || []).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const line = value as Record<string, unknown>;
    const direct = stripeObjectId(line.price);
    const pricing = line.pricing && typeof line.pricing === "object" ? line.pricing as Record<string, unknown> : null;
    const details = pricing?.price_details && typeof pricing.price_details === "object" ? pricing.price_details as Record<string, unknown> : null;
    const nested = stripeObjectId(details?.price);
    return direct || nested ? [direct || nested] : [];
  });
}

function stripeInvoiceSubscription(object: Record<string, unknown>) {
  const direct = stripeObjectId(object.subscription);
  if (direct) return direct;
  const parent = object.parent && typeof object.parent === "object" ? object.parent as Record<string, unknown> : null;
  const details = parent?.subscription_details && typeof parent.subscription_details === "object" ? parent.subscription_details as Record<string, unknown> : null;
  return stripeObjectId(details?.subscription);
}

function stripePeriodEnd(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function stripeInvoicePeriodEnd(object: Record<string, unknown>) {
  const lines = object.lines && typeof object.lines === "object" ? object.lines as { data?: unknown[] } : null;
  const first = lines?.data?.[0];
  const line = first && typeof first === "object" ? first as Record<string, unknown> : null;
  const period = line?.period && typeof line.period === "object" ? line.period as Record<string, unknown> : null;
  return stripePeriodEnd(period?.end ?? object.period_end);
}

function embeddedStripeInvoicePaymentIntent(object: Record<string, unknown>) {
  const direct = stripeObjectId(object.payment_intent);
  if (direct) return direct;
  const payments = object.payments && typeof object.payments === "object" ? object.payments as { data?: unknown[] } : null;
  for (const value of payments?.data || []) {
    if (!value || typeof value !== "object") continue;
    const payment = (value as Record<string, unknown>).payment;
    if (payment && typeof payment === "object") {
      const id = stripeObjectId((payment as Record<string, unknown>).payment_intent);
      if (id) return id;
    }
  }
  return "";
}

async function stripeInvoicePaymentIntent(env: Env, object: Record<string, unknown>, invoiceId: string) {
  const embedded = embeddedStripeInvoicePaymentIntent(object);
  if (embedded || !invoiceId) return embedded;
  const query = new URLSearchParams({ invoice: invoiceId, status: "paid", limit: "10" });
  const payments = await stripeRequest<{
    data?: Array<{
      status?: unknown;
      payment?: {
        type?: unknown;
        payment_intent?: unknown;
      };
    }>;
  }>(env, `/v1/invoice_payments?${query.toString()}`, undefined, "GET");
  const paymentIntent = payments.data?.find((entry) => entry.status === "paid"
    && entry.payment?.type === "payment_intent"
    && typeof entry.payment.payment_intent === "string"
    && entry.payment.payment_intent.startsWith("pi_"))?.payment?.payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : "";
}

async function stripeChargePaymentIntent(env: Env, value: unknown) {
  const chargeId = stripeObjectId(value);
  if (!chargeId.startsWith("ch_")) {
    throw new Error("Stripe risk event has no valid Charge.");
  }
  const expanded = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const embedded = stripeObjectId(expanded?.payment_intent);
  if (embedded) return { chargeId, paymentIntent: embedded };
  const charge = await stripeRequest<{ id?: unknown; payment_intent?: unknown }>(
    env,
    `/v1/charges/${encodeURIComponent(chargeId)}`,
    undefined,
    "GET",
  );
  if (stripeObjectId(charge.id) !== chargeId) {
    throw new Error("Stripe returned a mismatched Charge.");
  }
  const paymentIntent = stripeObjectId(charge.payment_intent);
  if (!paymentIntent.startsWith("pi_")) {
    throw new Error("Stripe Charge has no valid PaymentIntent.");
  }
  return { chargeId, paymentIntent };
}

async function verifyStripeSignature(secret: string, body: string, signature: string | undefined) {
  if (!signature) return false;
  const fields = signature.split(",").map((entry) => entry.split("="));
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || signatures.length === 0) return false;
  const expected = await hmacSha256(secret, `${timestamp}.${body}`);
  return signatures.some((value) => timingSafeEqual(expected, hexToBytes(value)));
}

async function enforceRateLimit(c: Context<WorkerContext>, scope: string, limit: number, windowMs: number) {
  const timestamp = Date.now();
  const key = `${scope}:${c.req.header("cf-connecting-ip") || "unknown"}`;
  const resetAt = timestamp + windowMs;
  const results = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO rate_limit_buckets (bucket_key, count, reset_at, updated_at) VALUES (?, 1, ?, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET
        count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
        reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END,
        updated_at = ?`)
      .bind(key, resetAt, now(), timestamp, timestamp, resetAt, now()),
    c.env.DB.prepare("SELECT count, reset_at FROM rate_limit_buckets WHERE bucket_key = ?").bind(key),
  ]);
  const bucket = results[1].results?.[0] as { count: number; reset_at: number } | undefined;
  const count = bucket?.count ?? 1;
  const effectiveReset = bucket?.reset_at ?? resetAt;
  c.header("RateLimit-Limit", String(limit));
  c.header("RateLimit-Remaining", String(Math.max(0, limit - count)));
  c.header("RateLimit-Reset", String(Math.ceil(effectiveReset / 1000)));
  if (count <= limit) return null;
  c.header("Retry-After", String(Math.max(1, Math.ceil((effectiveReset - timestamp) / 1000))));
  return errorResponse(c, 429, "RATE_LIMITED", "Too many requests. Wait a moment and try again.");
}

function stripeMetadata(object: Record<string, unknown>) {
  return object.metadata && typeof object.metadata === "object"
    ? object.metadata as Record<string, unknown>
    : {};
}

async function deletedBillingOwnerExists(
  env: Env,
  input: { userId?: string; customerId?: string; paymentIntent?: string },
) {
  if (input.paymentIntent) {
    const payment = await env.DB.prepare(`SELECT payment_intent_id
      FROM billing_deleted_payment_tombstones WHERE payment_intent_id = ?`)
      .bind(input.paymentIntent)
      .first();
    if (payment) return true;
  }
  if (input.customerId) {
    const customer = await env.DB.prepare(`SELECT id FROM account_deletion_audit
      WHERE stripe_customer_id = ? LIMIT 1`)
      .bind(input.customerId)
      .first();
    if (customer) return true;
  }
  if (input.userId) {
    const user = await env.DB.prepare(`SELECT id FROM account_deletion_audit
      WHERE former_user_id = ? LIMIT 1`)
      .bind(input.userId)
      .first();
    if (user) return true;
  }
  return false;
}

function prepareBillingReview(
  env: Env,
  input: {
    eventId: string;
    paymentIntent: string;
    userId: string;
    triggerType: BillingReviewTrigger;
    creditsAtRisk: number;
    amountCentsAtRisk: number;
    timestamp: string;
  },
) {
  const reviewId = crypto.randomUUID();
  return [
    env.DB.prepare(`INSERT OR IGNORE INTO billing_reviews
      (id, payment_intent_id, user_id, latest_trigger_type, status, credits_at_risk,
        opened_at, updated_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`)
      .bind(
        reviewId,
        input.paymentIntent,
        input.userId,
        input.triggerType,
        input.creditsAtRisk,
        input.timestamp,
        input.timestamp,
      ),
    env.DB.prepare(`UPDATE billing_reviews
      SET latest_trigger_type = ?,
        credits_at_risk = CASE
          WHEN status = 'resolved' AND decision = 'cleared' THEN ?
          ELSE MAX(credits_at_risk, ?)
        END,
        status = CASE
          WHEN status = 'resolved' AND (
            decision = 'cleared'
            OR ? > credits_at_risk
          ) THEN 'open'
          ELSE status
        END,
        decision = CASE
          WHEN status = 'resolved' AND (
            decision = 'cleared'
            OR ? > credits_at_risk
          ) THEN NULL
          ELSE decision
        END,
        operator_note = CASE
          WHEN status = 'resolved' AND (
            decision = 'cleared'
            OR ? > credits_at_risk
          ) THEN NULL
          ELSE operator_note
        END,
        resolved_by = CASE
          WHEN status = 'resolved' AND (
            decision = 'cleared'
            OR ? > credits_at_risk
          ) THEN NULL
          ELSE resolved_by
        END,
        resolved_at = CASE
          WHEN status = 'resolved' AND (
            decision = 'cleared'
            OR ? > credits_at_risk
          ) THEN NULL
          ELSE resolved_at
        END,
        updated_at = ?
      WHERE payment_intent_id = ?`)
      .bind(
        input.triggerType,
        input.creditsAtRisk,
        input.creditsAtRisk,
        input.creditsAtRisk,
        input.creditsAtRisk,
        input.creditsAtRisk,
        input.creditsAtRisk,
        input.creditsAtRisk,
        input.timestamp,
        input.paymentIntent,
      ),
    env.DB.prepare(`INSERT OR IGNORE INTO billing_review_events
      (stripe_event_id, review_id, trigger_type, amount_cents_at_risk,
        credits_at_risk, created_at)
      SELECT ?, id, ?, ?, ?, ?
      FROM billing_reviews WHERE payment_intent_id = ?`)
      .bind(
        input.eventId,
        input.triggerType,
        input.amountCentsAtRisk,
        input.creditsAtRisk,
        input.timestamp,
        input.paymentIntent,
      ),
  ];
}

function refreshBillingReviewBlock(env: Env, userId: string, timestamp: string) {
  return env.DB.prepare(`UPDATE billing_accounts
    SET spending_blocked = CASE
        WHEN EXISTS (
          SELECT 1 FROM billing_reviews
          WHERE user_id = ? AND (
            status = 'open'
            OR (decision = 'confirmed_loss' AND unrecovered_credits > 0)
          )
        ) THEN 1
        ELSE 0
      END,
      block_reason = CASE
        WHEN EXISTS (
          SELECT 1 FROM billing_reviews
          WHERE user_id = ? AND status = 'open'
        ) THEN 'Credit spending is paused while a payment risk review is open.'
        WHEN EXISTS (
          SELECT 1 FROM billing_reviews
          WHERE user_id = ?
            AND decision = 'confirmed_loss'
            AND unrecovered_credits > 0
        ) THEN 'Credit spending remains paused while an unrecovered payment loss is resolved.'
        ELSE NULL
      END,
      updated_at = ?
    WHERE user_id = ?`)
    .bind(userId, userId, userId, timestamp, userId);
}

async function resolveCheckoutOrder(env: Env, object: Record<string, unknown>) {
  const sessionId = stripeObjectId(object.id);
  let order = await env.DB.prepare("SELECT * FROM billing_orders WHERE stripe_checkout_session_id = ?")
    .bind(sessionId)
    .first<BillingOrderRow>();
  if (order) return order;

  const attemptId = String(stripeMetadata(object).order_id || "");
  if (!attemptId || !sessionId) return null;
  const attempt = await env.DB.prepare(`SELECT * FROM billing_checkout_attempts
    WHERE id = ? AND status IN ('creating', 'created', 'failed', 'completed')`)
    .bind(attemptId)
    .first<{
      id: string;
      user_id: string;
      offer_id: string;
      kind: "subscription" | "credits";
      credits: number;
      amount_cents: number;
      currency: string;
      stripe_price_id: string;
    }>();
  if (!attempt) return null;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO billing_orders
      (id, user_id, stripe_checkout_session_id, offer_id, kind, credits, amount_cents, currency, stripe_price_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        attempt.id,
        attempt.user_id,
        sessionId,
        attempt.offer_id,
        attempt.kind,
        attempt.credits,
        attempt.amount_cents,
        attempt.currency,
        attempt.stripe_price_id,
        now(),
      ),
    env.DB.prepare(`UPDATE billing_checkout_attempts
      SET stripe_checkout_session_id = ?, status = 'created', updated_at = ?
      WHERE id = ?`)
      .bind(sessionId, now(), attempt.id),
  ]);
  order = await env.DB.prepare("SELECT * FROM billing_orders WHERE stripe_checkout_session_id = ?")
    .bind(sessionId)
    .first<BillingOrderRow>();
  return order ?? null;
}

async function handleStripeEvent(env: Env, event: StripeEvent) {
  const object = event.data.object;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const order = await resolveCheckoutOrder(env, object);
    if (!order) {
      const metadataUserId = String(stripeMetadata(object).user_id || "");
      if (metadataUserId && await deletedBillingOwnerExists(env, { userId: metadataUserId })) return;
      throw new Error("Stripe checkout does not match a local order.");
    }
    if (order.status === "paid") return;
    if (order.kind === "credits") {
      const paymentIntent = stripeObjectId(object.payment_intent);
      if (object.payment_status !== "paid" || !paymentIntent) throw new Error("Credit checkout is not paid.");
      const existing = await env.DB.prepare("SELECT payment_intent_id FROM billing_payments WHERE payment_intent_id = ?").bind(paymentIntent).first();
      if (!existing) {
        await grantCredits(env.DB, { userId: order.user_id, amount: order.credits, type: "purchase_grant", referenceId: paymentIntent, description: `${order.credits}-credit Stripe purchase` });
        await env.DB.prepare("INSERT INTO billing_payments (payment_intent_id, user_id, billing_order_id, kind, credits_granted, amount_cents, currency, stripe_price_id, created_at, updated_at) VALUES (?, ?, ?, 'credits', ?, ?, ?, ?, ?, ?)")
          .bind(paymentIntent, order.user_id, order.id, order.credits, order.amount_cents, order.currency, order.stripe_price_id, now(), now()).run();
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE billing_orders SET status = 'paid', payment_intent_id = ?, completed_at = ? WHERE id = ?").bind(paymentIntent, now(), order.id),
        env.DB.prepare("UPDATE billing_checkout_attempts SET status = 'completed', updated_at = ? WHERE id = ?").bind(now(), order.id),
      ]);
      return;
    }
    const customerId = stripeObjectId(object.customer);
    const subscriptionId = stripeObjectId(object.subscription);
    if (!customerId || !subscriptionId || !["paid", "no_payment_required"].includes(String(object.payment_status))) throw new Error("Subscription checkout is incomplete.");
    const subscription = subscriptionDescriptor(order.offer_id);
    await env.DB.batch([
      env.DB.prepare("UPDATE billing_orders SET status = 'paid', completed_at = ? WHERE id = ?").bind(now(), order.id),
      env.DB.prepare("UPDATE billing_accounts SET stripe_customer_id = ?, stripe_subscription_id = ?, plan = 'creator', plan_tier = ?, billing_interval = ?, active_offer_id = ?, status = 'active', updated_at = ? WHERE user_id = ?")
        .bind(customerId, subscriptionId, subscription.tier, subscription.interval, order.offer_id, now(), order.user_id),
      env.DB.prepare("UPDATE billing_checkout_attempts SET status = 'completed', updated_at = ? WHERE id = ?").bind(now(), order.id),
    ]);
    return;
  }

  if (event.type === "checkout.session.expired") {
    await env.DB.prepare("UPDATE billing_orders SET status = 'expired' WHERE stripe_checkout_session_id = ? AND status = 'pending'").bind(stripeObjectId(object.id)).run();
    return;
  }

  if (event.type === "invoice.paid") {
    const customerId = stripeObjectId(object.customer);
    if (customerId && await deletedBillingOwnerExists(env, { customerId })) return;
    const subscriptionId = stripeInvoiceSubscription(object);
    const invoiceId = stripeObjectId(object.id);
    const paymentIntent = await stripeInvoicePaymentIntent(env, object, invoiceId);
    const periodEnd = stripeInvoicePeriodEnd(object);
    const amount = typeof object.amount_paid === "number" ? object.amount_paid : -1;
    const invoicePriceVersions = await Promise.all(stripeInvoicePriceIds(object)
      .map((priceId) => billingPriceVersionByStripeId(env, priceId)));
    const priceVersion = invoicePriceVersions.find((candidate) => candidate?.kind === "subscription"
      && candidate.amount_cents === amount
      && candidate.currency === object.currency);
    const allowedReasons = new Set(["subscription_create", "subscription_cycle", "subscription_update"]);
    if (!customerId || !subscriptionId || !invoiceId || !paymentIntent || object.status !== "paid" || object.currency !== "usd"
      || !allowedReasons.has(String(object.billing_reason)) || !priceVersion) throw new Error("Paid invoice failed the known subscription price-version contract.");
    const account = await env.DB.prepare("SELECT user_id, stripe_subscription_id FROM billing_accounts WHERE stripe_customer_id = ?").bind(customerId).first<{ user_id: string; stripe_subscription_id: string | null }>();
    if (!account) {
      if (await deletedBillingOwnerExists(env, { customerId })) return;
      throw new Error("Paid invoice does not match a local subscription.");
    }
    if (account.stripe_subscription_id && account.stripe_subscription_id !== subscriptionId) throw new Error("Paid invoice does not match a local subscription.");
    const existing = await env.DB.prepare("SELECT payment_intent_id FROM billing_payments WHERE payment_intent_id = ? OR invoice_id = ?").bind(paymentIntent, invoiceId).first();
    if (!existing) {
      const subscription = subscriptionDescriptor(priceVersion.offer_id);
      const periodLabel = subscription.interval === "year" ? "annual" : "monthly";
      await grantCredits(env.DB, {
        userId: account.user_id,
        amount: priceVersion.credits,
        type: "subscription_grant",
        referenceId: invoiceId,
        description: `${subscription.tier[0].toUpperCase()}${subscription.tier.slice(1)} ${periodLabel} credits`,
      });
      await env.DB.prepare("INSERT INTO billing_payments (payment_intent_id, user_id, invoice_id, kind, credits_granted, amount_cents, currency, stripe_price_id, created_at, updated_at) VALUES (?, ?, ?, 'subscription', ?, ?, ?, ?, ?, ?)")
        .bind(paymentIntent, account.user_id, invoiceId, priceVersion.credits, priceVersion.amount_cents, priceVersion.currency, priceVersion.stripe_price_id, now(), now()).run();
    }
    const subscription = subscriptionDescriptor(priceVersion.offer_id);
    await env.DB.prepare("UPDATE billing_accounts SET stripe_subscription_id = ?, plan = 'creator', plan_tier = ?, billing_interval = ?, active_offer_id = ?, status = 'active', current_period_end = COALESCE(?, current_period_end), cancel_at_period_end = 0, updated_at = ? WHERE user_id = ?")
      .bind(subscriptionId, subscription.tier, subscription.interval, priceVersion.offer_id, periodEnd, now(), account.user_id).run();
    return;
  }

  if (event.type === "radar.early_fraud_warning.created") {
    const warningId = stripeObjectId(object.id);
    if (!warningId.startsWith("issfr_") || typeof object.actionable !== "boolean") {
      throw new Error("Stripe early fraud warning is incomplete.");
    }
    const { chargeId, paymentIntent } = await stripeChargePaymentIntent(env, object.charge);
    const payment = await env.DB.prepare(`SELECT user_id, credits_granted, amount_cents
      FROM billing_payments WHERE payment_intent_id = ?`)
      .bind(paymentIntent)
      .first<BillingPaymentOwnerRow>();
    if (!payment) {
      if (await deletedBillingOwnerExists(env, { paymentIntent })) return;
      throw new Error("Stripe early fraud warning has no local payment yet.");
    }
    if (!Number.isSafeInteger(payment.credits_granted) || payment.credits_granted <= 0
      || !Number.isSafeInteger(payment.amount_cents) || payment.amount_cents <= 0) {
      throw new Error("Stripe early fraud warning matched an invalid local payment exposure.");
    }
    const timestamp = now();
    const actionable = object.actionable;
    const fraudType = typeof object.fraud_type === "string" && object.fraud_type
      ? object.fraud_type.slice(0, 80)
      : "unknown";
    const statements = [
      env.DB.prepare(`INSERT OR IGNORE INTO billing_risk_events
        (stripe_event_id, warning_id, charge_id, payment_intent_id, user_id, kind,
          actionable, fraud_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'early_fraud_warning', ?, ?, ?, ?, ?)`)
        .bind(
          event.id,
          warningId,
          chargeId,
          paymentIntent,
          payment.user_id,
          actionable ? 1 : 0,
          fraudType,
          actionable ? "open" : "non_actionable",
          timestamp,
          timestamp,
        ),
      env.DB.prepare(`UPDATE billing_payments
        SET financial_event_id = CASE WHEN status = 'paid' THEN ? ELSE financial_event_id END,
          updated_at = ?
        WHERE payment_intent_id = ?`)
        .bind(event.id, timestamp, paymentIntent),
      env.DB.prepare(`UPDATE billing_orders
        SET financial_event_id = CASE WHEN financial_status = 'normal' THEN ? ELSE financial_event_id END
        WHERE payment_intent_id = ?`)
        .bind(event.id, paymentIntent),
    ];
    if (actionable) {
      statements.push(
        ...prepareBillingReview(env, {
          eventId: event.id,
          paymentIntent,
          userId: payment.user_id,
          triggerType: "early_fraud_warning",
          creditsAtRisk: payment.credits_granted,
          amountCentsAtRisk: payment.amount_cents,
          timestamp,
        }),
        refreshBillingReviewBlock(env, payment.user_id, timestamp),
      );
    }
    await env.DB.batch(statements);
    return;
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const paymentIntent = stripeObjectId(object.payment_intent);
    if (!paymentIntent) throw new Error("Financial reversal has no PaymentIntent.");
    const payment = await env.DB.prepare(`SELECT user_id, credits_granted, amount_cents
      FROM billing_payments WHERE payment_intent_id = ?`)
      .bind(paymentIntent)
      .first<BillingPaymentOwnerRow>();
    if (!payment) {
      if (await deletedBillingOwnerExists(env, { paymentIntent })) return;
      throw new Error("Financial reversal has no local payment.");
    }
    if (!Number.isSafeInteger(payment.credits_granted) || payment.credits_granted <= 0
      || !Number.isSafeInteger(payment.amount_cents) || payment.amount_cents <= 0) {
      throw new Error("Financial reversal matched an invalid local payment exposure.");
    }
    const status = event.type === "charge.refunded" ? "refunded" : "disputed";
    const triggerType: BillingReviewTrigger = event.type === "charge.refunded" ? "refund" : "dispute";
    const refundExposure = triggerType === "refund"
      ? refundCreditsAtRisk(payment.credits_granted, payment.amount_cents, object.amount_refunded)
      : null;
    const amountCentsAtRisk = refundExposure?.amountCentsAtRisk ?? payment.amount_cents;
    const creditsAtRisk = refundExposure?.creditsAtRisk ?? payment.credits_granted;
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare("UPDATE billing_payments SET status = ?, financial_event_id = ?, updated_at = ? WHERE payment_intent_id = ?").bind(status, event.id, timestamp, paymentIntent),
      env.DB.prepare("UPDATE billing_orders SET financial_status = ?, financial_event_id = ? WHERE payment_intent_id = ?").bind(status, event.id, paymentIntent),
      ...prepareBillingReview(env, {
        eventId: event.id,
        paymentIntent,
        userId: payment.user_id,
        triggerType,
        creditsAtRisk,
        amountCentsAtRisk,
        timestamp,
      }),
      refreshBillingReviewBlock(env, payment.user_id, timestamp),
    ]);
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted" || event.type === "invoice.payment_failed") {
    const customerId = stripeObjectId(object.customer);
    const subscriptionId = event.type.startsWith("customer.subscription") ? stripeObjectId(object.id) : stripeInvoiceSubscription(object);
    if (!customerId) return;
    const status = event.type === "customer.subscription.deleted" ? "canceled"
      : event.type === "invoice.payment_failed" ? "past_due"
        : ["active", "trialing", "past_due", "canceled"].includes(String(object.status)) ? String(object.status) : "inactive";
    const scheduledCancellation = object.cancel_at_period_end === true
      || (["active", "trialing"].includes(status) && typeof object.cancel_at === "number" && object.cancel_at > 0);
    await env.DB.prepare("UPDATE billing_accounts SET stripe_subscription_id = COALESCE(?, stripe_subscription_id), plan = ?, plan_tier = CASE WHEN ? IN ('active', 'trialing') THEN plan_tier ELSE 'free' END, billing_interval = CASE WHEN ? IN ('active', 'trialing') THEN billing_interval ELSE NULL END, active_offer_id = CASE WHEN ? IN ('active', 'trialing') THEN active_offer_id ELSE NULL END, status = ?, cancel_at_period_end = ?, updated_at = ? WHERE stripe_customer_id = ?")
      .bind(
        subscriptionId || null,
        status === "active" || status === "trialing" ? "creator" : "free",
        status,
        status,
        status,
        status,
        scheduledCancellation ? 1 : 0,
        now(),
        customerId,
      ).run();
  }
}

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("X-Request-Id", requestId);
  c.header("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob: https://www.google-analytics.com https://region1.google-analytics.com; style-src 'self' 'unsafe-inline'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
});

app.use("*", async (c, next) => {
  const canonical = new URL(c.env.APP_BASE_URL);
  const requestUrl = new URL(c.req.url);
  if (requestUrl.hostname === `www.${canonical.hostname}`) {
    requestUrl.protocol = canonical.protocol;
    requestUrl.hostname = canonical.hostname;
    requestUrl.port = canonical.port;
    return c.redirect(requestUrl.toString(), 308);
  }
  await next();
});

for (const legacyPromptsPath of ["/prompts", "/prompts/"]) {
  app.get(legacyPromptsPath, (c) => {
    const destination = new URL(c.req.url);
    destination.pathname = "/examples";
    return c.redirect(destination.toString(), 308);
  });
}

export function browserWriteOriginAllowed(request: Request, appBaseUrl: string) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin) {
    const requestOrigin = new URL(request.url).origin;
    return origin === appBaseUrl.replace(/\/$/, "") || origin === requestOrigin;
  }
  return !fetchSite || ["same-origin", "none"].includes(fetchSite);
}

app.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !c.req.header("authorization") && c.req.path !== "/api/billing/webhook") {
    if (!browserWriteOriginAllowed(c.req.raw, c.env.APP_BASE_URL)) {
      return errorResponse(c, 403, "ORIGIN_REJECTED", "This request origin is not allowed.");
    }
  }
  await next();
});

app.use("/api/auth/*", async (c, next) => {
  const limited = await enforceRateLimit(c, "auth", 30, 15 * 60 * 1000);
  if (limited) return limited;
  await next();
});

app.use("/api/generations", async (c, next) => {
  if (c.req.method !== "POST") {
    await next();
    return;
  }
  const limited = await enforceRateLimit(c, "web-generation", 30, 60 * 1000);
  if (limited) return limited;
  await next();
});

app.use("/v1/generations", async (c, next) => {
  const startedAt = Date.now();
  const actor = await resolveActor(c);
  c.set("actor", actor);
  try {
    await next();
  } finally {
    try {
      await c.env.DB.prepare(`INSERT INTO api_request_logs
        (id, user_id, api_key_id, method, path, status_code, duration_ms, request_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(),
          actor?.userId ?? null,
          actor?.apiKeyId ?? null,
          c.req.method,
          "/v1/generations",
          c.res.status,
          Date.now() - startedAt,
          c.get("requestId"),
          now(),
        )
        .run();
    } catch (reason) {
      console.error("api-request-log-failed", {
        requestId: c.get("requestId"),
        reason: reason instanceof Error ? reason.message : "unknown",
      });
    }
  }
});

app.use("/v1/generations", async (c, next) => {
  const limited = await enforceRateLimit(c, "api-generation", 120, 60 * 1000);
  if (limited) return limited;
  await next();
});

app.use("/api/billing/*", async (c, next) => {
  if (c.req.path === "/api/billing/webhook") {
    await next();
    return;
  }
  const limited = await enforceRateLimit(c, "billing", 30, 60 * 1000);
  if (limited) return limited;
  await next();
});

app.use("/api/operator/*", async (c, next) => {
  const limited = await enforceRateLimit(c, "billing-operator", 60, 60 * 1000);
  if (limited) return limited;
  c.header("Cache-Control", "private, no-store");
  await next();
});

app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  const runtime = modelRuntime(c.env);
  const providerConfigured = runtime.providerConfigured;
  const versions = await activeBillingPriceVersions(c.env);
  const priceCatalogConfigured = billingOfferIds.every((offerId) => versions.some((version) => version.offer_id === offerId));
  const maintenance = await c.env.DB.prepare(`SELECT status, started_at, completed_at
    FROM maintenance_runs ORDER BY started_at DESC LIMIT 1`)
    .first<{ status: string; started_at: string; completed_at: string | null }>();
  const operationalHealth = await collectOperationalHealth(c.env);
  const billingEventsHealthy = operationalHealth.failedBillingEvents === 0
    && operationalHealth.staleBillingEvents === 0;
  const billingReviewsHealthy = operationalHealth.openBillingReviews === 0
    && operationalHealth.outstandingLossReviews === 0;
  const alertState = await readOperationalAlertState(c.env);
  const alertingConfigured = operationalAlertConfigured(c.env);
  const alertingRequired = billingEnabled(c.env);
  const alertingHealthy = alertingConfigured && !alertState?.lastError;
  const oauth = oauthMethods(c.env);
  const maintenanceCompletedAt = maintenance?.completed_at ? Date.parse(maintenance.completed_at) : Number.NaN;
  const maintenanceAgeSeconds = Number.isFinite(maintenanceCompletedAt)
    ? Math.max(0, Math.floor((Date.now() - maintenanceCompletedAt) / 1000))
    : null;
  return c.json({
    status: providerConfigured
      && billingEventsHealthy
      && billingReviewsHealthy
      && (!alertingRequired || alertingHealthy)
      ? "ok"
      : "degraded",
    runtime: "cloudflare-worker",
    revision: c.env.CF_VERSION_METADATA?.id || c.env.DEPLOY_REVISION || "unversioned",
    database: "cloudflare-d1",
    objectStorage: "cloudflare-r2",
    generator: runtime.providerModel,
    provider: runtime.providerId,
    providerConfigured,
    auth: "session-cookie",
    oauth,
    email: { provider: c.env.RESEND_API_KEY ? "resend" : "none", configured: Boolean(c.env.RESEND_API_KEY && c.env.EMAIL_FROM) },
    maintenance: maintenance ? {
      status: maintenance.status,
      startedAt: maintenance.started_at,
      completedAt: maintenance.completed_at,
      ageSeconds: maintenanceAgeSeconds,
      fresh: maintenance.status === "completed"
        && maintenanceAgeSeconds !== null
        && maintenanceAgeSeconds <= 30 * 60,
    } : {
      status: "pending-first-run",
      startedAt: null,
      completedAt: null,
      ageSeconds: null,
      fresh: false,
    },
    billing: {
      provider: "stripe",
      enabled: billingEnabled(c.env),
      configured: billingConfigured(c.env) && priceCatalogConfigured,
      credentialsConfigured: billingCredentialsConfigured(c.env),
      webhookConfigured: stripeWebhookConfigured(c.env),
      priceCatalogConfigured,
      eventHealth: {
        healthy: billingEventsHealthy,
        failedEvents: operationalHealth.failedBillingEvents,
        staleEvents: operationalHealth.staleBillingEvents,
      },
      reviewHealth: {
        healthy: billingReviewsHealthy,
        openReviews: operationalHealth.openBillingReviews,
        outstandingLossReviews: operationalHealth.outstandingLossReviews,
      },
      alerting: {
        configured: alertingConfigured,
        required: alertingRequired,
        healthy: alertingHealthy,
        state: alertState?.status ?? "pending-first-run",
        lastCheckedAt: alertState?.lastCheckedAt ?? null,
        lastSentAt: alertState?.lastSentAt ?? null,
        lastRecoveredAt: alertState?.lastRecoveredAt ?? null,
        lastError: alertState?.lastError ?? null,
      },
    },
    credits: "d1-ledger",
  });
});

app.get("/api/session", async (c) => c.json(await sessionState(c.env, await resolveActor(c))));

app.get("/api/auth/methods", (c) => c.json({
  password: true,
  ...oauthMethods(c.env),
}));

app.post("/api/auth/register", async (c) => {
  const body = await readBody(c);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (name.length < 2 || name.length > 60) return errorResponse(c, 400, "INVALID_NAME", "Name must be between 2 and 60 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse(c, 400, "INVALID_EMAIL", "Enter a valid email address.");
  if (!passwordIsStrong(password)) return errorResponse(c, 400, "WEAK_PASSWORD", "Password must be at least 8 characters and include a letter and a number.");
  if (await c.env.DB.prepare("SELECT 1 FROM users WHERE email_normalized = ?").bind(email).first()) return errorResponse(c, 409, "EMAIL_IN_USE", "An account with this email already exists.");
  const id = crypto.randomUUID();
  const createdAt = now();
  const welcomeGrant = prepareCreditGrant(c.env.DB, {
    userId: id,
    amount: 20,
    type: "signup_grant",
    referenceId: "email-verification",
    description: "Account welcome credits",
    timestamp: createdAt,
  });
  const results = await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO users (id, name, email_normalized, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, name, email, await hashPassword(password), createdAt, createdAt),
    c.env.DB.prepare("INSERT INTO credit_accounts (user_id, available, reserved, updated_at) VALUES (?, 0, 0, ?)").bind(id, createdAt),
    c.env.DB.prepare("INSERT INTO billing_accounts (user_id, updated_at) VALUES (?, ?)").bind(id, createdAt),
    ...welcomeGrant.statements,
  ]);
  creditMutationApplied(results, 3);
  const sessionId = await createSession(c, id);
  const row = (await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>())!;
  const token = await createSecurityToken(c.env, id, "verify_email");
  const delivered = await sendAuthEmail(c.env, { email, name, token, purpose: "verify_email" });
  const actor: Actor = { user: publicUser(row), userRow: row, userId: id, sessionId, apiKeyId: null, scopes: [] };
  return c.json({ ...(await sessionState(c.env, actor)), verification: { delivered, delivery: delivered ? "resend" : "none" } }, 201);
});

app.post("/api/auth/login", async (c) => {
  const body = await readBody(c);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE email_normalized = ?").bind(email).first<UserRow>();
  if (!row || !(await verifyPassword(password, row.password_hash))) return errorResponse(c, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  await grantCredits(c.env.DB, {
    userId: row.id,
    amount: 20,
    type: "signup_grant",
    referenceId: "email-verification",
    description: "Account welcome credits",
  });
  const sessionId = await createSession(c, row.id);
  const actor: Actor = { user: publicUser(row), userRow: row, userId: row.id, sessionId, apiKeyId: null, scopes: [] };
  return c.json(await sessionState(c.env, actor));
});

app.post("/api/auth/logout", async (c) => {
  const actor = await resolveActor(c);
  if (actor.sessionId) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(actor.sessionId).run();
  deleteCookie(c, "qwen_session", { path: "/" });
  return c.body(null, 204);
});

app.post("/api/auth/verify-email/request", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  if (actor.user!.emailVerified) return c.json({ delivered: false, delivery: "none", alreadyVerified: true });
  const token = await createSecurityToken(c.env, actor.userId!, "verify_email");
  const delivered = await sendAuthEmail(c.env, { email: actor.user!.email, name: actor.user!.name, token, purpose: "verify_email" });
  return c.json({ delivered, delivery: delivered ? "resend" : "none" });
});

app.post("/api/auth/verify-email", async (c) => {
  const body = await readBody(c);
  const token = typeof body.token === "string" ? body.token : "";
  const tokenHash = await hashToken(token);
  const row = await c.env.DB.prepare("SELECT id, user_id FROM security_tokens WHERE token_hash = ? AND purpose = 'verify_email' AND consumed_at IS NULL AND expires_at > ?")
    .bind(tokenHash, now()).first<{ id: string; user_id: string }>();
  if (!row) return errorResponse(c, 400, "INVALID_TOKEN", "This verification link is invalid or expired.");
  const timestamp = now();
  const welcomeGrant = prepareCreditGrant(c.env.DB, {
    userId: row.user_id,
    amount: 20,
    type: "signup_grant",
    referenceId: "email-verification",
    description: "Verified account starter credits",
    timestamp,
  });
  const results = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE security_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(timestamp, row.id),
    c.env.DB.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?").bind(timestamp, timestamp, row.user_id),
    ...welcomeGrant.statements,
  ]);
  if (!(results[0].meta.changes ?? 0)) {
    return errorResponse(c, 400, "INVALID_TOKEN", "This verification link was already used.");
  }
  creditMutationApplied(results, 2);
  return c.json({ verified: true });
});

app.post("/api/auth/password-reset/request", async (c) => {
  const body = await readBody(c);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE email_normalized = ?").bind(email).first<UserRow>();
  if (row) {
    const token = await createSecurityToken(c.env, row.id, "reset_password");
    await sendAuthEmail(c.env, { email: row.email_normalized, name: row.name, token, purpose: "reset_password" });
  }
  return c.json({ accepted: true });
});

app.post("/api/auth/password-reset/confirm", async (c) => {
  const body = await readBody(c);
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!passwordIsStrong(password)) return errorResponse(c, 400, "WEAK_PASSWORD", "New password must be at least 8 characters and include a letter and a number.");
  const row = await c.env.DB.prepare("SELECT id, user_id FROM security_tokens WHERE token_hash = ? AND purpose = 'reset_password' AND consumed_at IS NULL AND expires_at > ?")
    .bind(await hashToken(token), now()).first<{ id: string; user_id: string }>();
  if (!row) return errorResponse(c, 400, "INVALID_TOKEN", "This reset link is invalid or expired.");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(password), now(), row.user_id),
    c.env.DB.prepare("UPDATE security_tokens SET consumed_at = ? WHERE id = ?").bind(now(), row.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
  ]);
  return c.json({ reset: true });
});

app.get("/api/auth/oauth/:provider/start", async (c) => {
  const provider = c.req.param("provider");
  if (!isOAuthProvider(provider)) return errorResponse(c, 404, "NOT_FOUND", "Sign-in provider not found.");
  if (!oauthMethods(c.env)[provider]) {
    return errorResponse(c, 503, "OAUTH_UNAVAILABLE", "This sign-in provider is not configured.");
  }
  const state = createToken();
  const codeVerifier = createToken(48);
  const timestamp = now();
  try {
    const authorizationUrl = await createAuthorizationUrl(c.env, provider, state, codeVerifier);
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(timestamp),
      c.env.DB.prepare(`INSERT INTO oauth_states
        (state_hash, provider, code_verifier, anonymous_session_id, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(
          await hashToken(state),
          provider,
          codeVerifier,
          null,
          new Date(Date.now() + OAUTH_STATE_SECONDS * 1000).toISOString(),
          timestamp,
        ),
    ]);
    setOAuthStateCookie(c, provider, state);
    return c.redirect(authorizationUrl, 302);
  } catch (reason) {
    console.error("oauth-start-failed", {
      provider,
      requestId: c.get("requestId"),
      reason: reason instanceof Error ? reason.message : "unknown",
    });
    return errorResponse(c, 503, "OAUTH_UNAVAILABLE", "Social sign-in could not start.");
  }
});

app.get("/api/auth/oauth/:provider/callback", async (c) => {
  const provider = c.req.param("provider");
  const returnTo = (query: string) => c.redirect(`${c.env.APP_BASE_URL.replace(/\/$/, "")}${query}`, 302);
  if (!isOAuthProvider(provider)) return returnTo("/?oauth_error=provider");
  const cookieState = getCookie(c, oauthStateCookieName(provider));
  deleteCookie(c, oauthStateCookieName(provider), { path: "/" });
  const denied = c.req.query("error") || "";
  const code = c.req.query("code") || "";
  const state = c.req.query("state") || "";
  if (!state || !oauthStateMatches(cookieState, state)) return returnTo("/?oauth_error=invalid_state");
  const stored = await c.env.DB.prepare(`DELETE FROM oauth_states
    WHERE state_hash = ? AND provider = ? AND expires_at > ?
    RETURNING code_verifier, anonymous_session_id`)
    .bind(await hashToken(state), provider, now())
    .first<{ code_verifier: string; anonymous_session_id: string | null }>();
  if (!stored) return returnTo("/?oauth_error=invalid_state");
  if (denied || !code) {
    return returnTo(`/?oauth_error=${encodeURIComponent(denied || "missing_response")}`);
  }
  try {
    const profile = await exchangeOAuthCode(c.env, provider, code, stored.code_verifier);
    const row = await resolveOAuthUser(c.env, {
      provider,
      subject: profile.subject,
      email: profile.email,
      name: profile.name,
    });
    await createSession(c, row.id);
    deleteCookie(c, "qwen_guest", { path: "/" });
    return returnTo("/studio?oauth=success");
  } catch (reason) {
    console.error("oauth-callback-failed", {
      provider,
      requestId: c.get("requestId"),
      reason: reason instanceof Error ? reason.message : "unknown",
    });
    return returnTo("/?oauth_error=provider_response");
  }
});

app.patch("/api/account/profile", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const body = await readBody(c);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 60) return errorResponse(c, 400, "INVALID_NAME", "Name must be between 2 and 60 characters.");
  await c.env.DB.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").bind(name, now(), actor.userId).run();
  return c.json({ user: { ...actor.user, name } });
});

app.post("/api/account/password", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  if (!actor.sessionId || !actor.userRow) return errorResponse(c, 403, "SESSION_REQUIRED", "A signed-in browser session is required.");
  const body = await readBody(c);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!(await verifyPassword(currentPassword, actor.userRow.password_hash))) return errorResponse(c, 401, "INVALID_CREDENTIALS", "Current password is incorrect.");
  if (!passwordIsStrong(newPassword)) return errorResponse(c, 400, "WEAK_PASSWORD", "New password must be at least 8 characters and include a letter and a number.");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(newPassword), now(), actor.userId),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").bind(actor.userId, actor.sessionId),
  ]);
  return c.json({ changed: true, revokedOtherSessions: true });
});

app.get("/api/account/sessions", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const result = await c.env.DB.prepare("SELECT id, user_agent, ip_hint, last_seen_at, expires_at, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC").bind(actor.userId).all<{
    id: string; user_agent: string; ip_hint: string; last_seen_at: string; expires_at: string; created_at: string;
  }>();
  const sessions: AccountSession[] = result.results.map((row) => ({
    id: row.id, userAgent: row.user_agent, ipHint: row.ip_hint, current: row.id === actor.sessionId, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, createdAt: row.created_at,
  }));
  return c.json({ sessions });
});

app.delete("/api/account/sessions/:id", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const result = await c.env.DB.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").bind(c.req.param("id"), actor.userId).run();
  if (!result.meta.changes) return errorResponse(c, 404, "NOT_FOUND", "Session not found.");
  if (c.req.param("id") === actor.sessionId) deleteCookie(c, "qwen_session", { path: "/" });
  return c.body(null, 204);
});

app.post("/api/account/sessions/revoke-others", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  if (!actor.sessionId) return errorResponse(c, 403, "SESSION_REQUIRED", "A signed-in browser session is required.");
  const result = await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").bind(actor.userId, actor.sessionId).run();
  return c.json({ revoked: result.meta.changes ?? 0 });
});

app.get("/api/account/export", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const [projects, generations, ledger, orders, supportTickets, supportMessages] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM projects WHERE user_id = ?").bind(actor.userId).all(),
    c.env.DB.prepare("SELECT id, prompt, aspect_ratio, style, quality, status, provider, model, credit_cost, created_at FROM generations WHERE owner_user_id = ?").bind(actor.userId).all(),
    c.env.DB.prepare("SELECT * FROM credit_ledger WHERE user_id = ?").bind(actor.userId).all(),
    c.env.DB.prepare("SELECT id, offer_id, kind, credits, amount_cents, currency, status, financial_status, created_at, completed_at FROM billing_orders WHERE user_id = ?").bind(actor.userId).all(),
    c.env.DB.prepare("SELECT id, subject, category, priority, status, last_message_at, created_at, updated_at FROM support_tickets WHERE user_id = ?").bind(actor.userId).all(),
    c.env.DB.prepare(`SELECT m.id, m.ticket_id, m.author, m.body, m.created_at FROM support_messages m
      JOIN support_tickets t ON t.id = m.ticket_id WHERE t.user_id = ? ORDER BY m.created_at ASC`).bind(actor.userId).all(),
  ]);
  c.header("Content-Disposition", `attachment; filename="qwen-image-account-${now().slice(0, 10)}.json"`);
  return c.json({
    exportedAt: now(),
    user: actor.user,
    projects: projects.results,
    generations: generations.results,
    creditLedger: ledger.results,
    billingOrders: orders.results,
    supportTickets: supportTickets.results,
    supportMessages: supportMessages.results,
  });
});

app.delete("/api/account", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  if (!actor.userRow) return errorResponse(c, 403, "SESSION_REQUIRED", "A signed-in browser session is required.");
  const body = await readBody(c);
  const password = typeof body.password === "string" ? body.password : "";
  if (String(body.confirmation || "").trim().toUpperCase() !== "DELETE") return errorResponse(c, 400, "CONFIRMATION_REQUIRED", "Type DELETE to confirm permanent account deletion.");
  if (!(await verifyPassword(password, actor.userRow.password_hash))) return errorResponse(c, 401, "INVALID_CREDENTIALS", "Password is incorrect.");
  const account = await billingAccount(c.env, actor.userId!);
  const timestamp = now();
  await c.env.DB.prepare(`INSERT INTO account_deletion_jobs (user_id, status, created_at, updated_at)
    VALUES (?, 'requested', ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET last_error = NULL, updated_at = excluded.updated_at`)
    .bind(actor.userId, timestamp, timestamp)
    .run();
  try {
    if (account.stripe_subscription_id || account.stripe_customer_id) {
      if (!stripeAccessConfigured(c.env)) {
        throw new ExternalRequestError(
          "BILLING_CLEANUP_UNAVAILABLE",
          "Account deletion is paused until billing cleanup is available.",
        );
      }
    }
    if (account.stripe_subscription_id) {
      await stripeDeleteObject(
        c.env,
        `/v1/subscriptions/${encodeURIComponent(account.stripe_subscription_id)}`,
        account.stripe_subscription_id,
        "subscription",
      );
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE account_deletion_jobs SET status = 'subscription_canceled', updated_at = ? WHERE user_id = ?")
          .bind(now(), actor.userId),
        c.env.DB.prepare(`UPDATE billing_accounts
          SET stripe_subscription_id = NULL, plan = 'free', status = 'canceled', updated_at = ?
          WHERE user_id = ?`).bind(now(), actor.userId),
      ]);
    }
    if (account.stripe_customer_id) {
      await stripeDeleteObject(
        c.env,
        `/v1/customers/${encodeURIComponent(account.stripe_customer_id)}`,
        account.stripe_customer_id,
        "customer",
      );
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE account_deletion_jobs SET status = 'customer_deleted', updated_at = ? WHERE user_id = ?")
          .bind(now(), actor.userId),
        c.env.DB.prepare("UPDATE billing_accounts SET stripe_customer_id = NULL, updated_at = ? WHERE user_id = ?")
          .bind(now(), actor.userId),
      ]);
    }
    const assets = await c.env.DB.prepare("SELECT r2_key FROM generations WHERE owner_user_id = ? AND r2_key IS NOT NULL")
      .bind(actor.userId)
      .all<{ r2_key: string }>();
    const deletionId = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT OR IGNORE INTO r2_deletion_queue
        (object_key, reason, reference_id, created_at, updated_at)
        SELECT r2_key, 'account_deletion', ?, ?, ?
        FROM generations WHERE owner_user_id = ? AND r2_key IS NOT NULL`)
        .bind(deletionId, now(), now(), actor.userId),
      c.env.DB.prepare(`INSERT INTO account_deletion_audit
        (id, former_user_id, status, assets_queued, created_at, completed_at,
          stripe_customer_id, stripe_subscription_id)
        VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)`)
        .bind(
          deletionId,
          actor.userId,
          assets.results.length,
          timestamp,
          now(),
          account.stripe_customer_id,
          account.stripe_subscription_id,
        ),
      c.env.DB.prepare(`INSERT OR IGNORE INTO billing_deleted_payment_tombstones
        (payment_intent_id, former_user_id, deleted_at)
        SELECT payment_intent_id, user_id, ?
        FROM billing_payments WHERE user_id = ?`)
        .bind(now(), actor.userId),
      c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(actor.userId),
    ]);
    await Promise.allSettled(assets.results.map(async (asset) => {
      try {
        await c.env.ASSETS_BUCKET.delete(asset.r2_key);
        await c.env.DB.prepare("DELETE FROM r2_deletion_queue WHERE object_key = ?")
          .bind(asset.r2_key)
          .run();
      } catch (reason) {
        await c.env.DB.prepare(`UPDATE r2_deletion_queue
          SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE object_key = ?`)
          .bind(reason instanceof Error ? reason.message : "R2 deletion failed.", now(), asset.r2_key)
          .run();
      }
    }));
    deleteCookie(c, "qwen_session", { path: "/" });
    deleteCookie(c, "qwen_guest", { path: "/" });
    return c.body(null, 204);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Account deletion cleanup failed.";
    await c.env.DB.prepare("UPDATE account_deletion_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE user_id = ?")
      .bind(message, now(), actor.userId)
      .run();
    console.error("account-deletion-failed", {
      userId: actor.userId,
      requestId: c.get("requestId"),
      reason: message,
    });
    const unavailable = reason instanceof ExternalRequestError && reason.code === "BILLING_CLEANUP_UNAVAILABLE";
    return errorResponse(
      c,
      unavailable ? 503 : 502,
      unavailable ? "BILLING_CLEANUP_UNAVAILABLE" : "ACCOUNT_DELETION_FAILED",
      unavailable
        ? reason.publicMessage
        : "Account deletion is paused until external cleanup succeeds. Your account remains intact.",
    );
  }
});

app.get("/api/operator/billing/reviews", async (c) => {
  const denied = requireBillingOperator(c);
  if (denied) return denied;
  const status = c.req.query("status") || "open";
  if (!["open", "resolved", "all"].includes(status)) {
    return errorResponse(c, 400, "INVALID_REVIEW_STATUS", "Use open, resolved, or all.");
  }
  const rows = await c.env.DB.prepare(`SELECT review.*, account.available AS available_credits
    FROM billing_reviews review
    JOIN credit_accounts account ON account.user_id = review.user_id
    WHERE (? = 'all' OR review.status = ?)
    ORDER BY
      CASE WHEN review.status = 'open' THEN 0 ELSE 1 END,
      review.updated_at DESC
    LIMIT 100`)
    .bind(status, status)
    .all<BillingReviewRow & { available_credits: number }>();
  return c.json({ reviews: rows.results.map(billingReviewJson) });
});

app.post("/api/operator/alerts/test", async (c) => {
  const denied = requireBillingOperator(c);
  if (denied) return denied;
  const operatorId = (c.req.header("x-operator-id") || "").trim();
  const idempotencyKey = (c.req.header("idempotency-key") || "").trim();
  if (!/^[A-Za-z0-9@._+-]{3,80}$/.test(operatorId)) {
    return errorResponse(c, 400, "INVALID_OPERATOR_ID", "Provide a stable operator ID.");
  }
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
    return errorResponse(c, 400, "INVALID_IDEMPOTENCY_KEY", "Provide a stable idempotency key.");
  }
  const result = await sendOperationalAlertTest(c.env, { operatorId, idempotencyKey });
  if (!result.configured) {
    return errorResponse(c, 503, "ALERTING_UNAVAILABLE", "Operational alert delivery is not configured.");
  }
  if (result.inProgress) {
    return c.json({ delivered: false, replayed: true, status: "sending" }, 202);
  }
  if (!result.delivered) {
    return errorResponse(c, 502, "ALERT_DELIVERY_FAILED", "The operational alert test could not be delivered.");
  }
  return c.json({
    delivered: true,
    replayed: result.replayed,
    status: "delivered",
    health: result.health,
  });
});

app.get("/api/operator/billing/reviews/:id", async (c) => {
  const denied = requireBillingOperator(c);
  if (denied) return denied;
  const review = await c.env.DB.prepare(`SELECT review.*, account.available AS available_credits
    FROM billing_reviews review
    JOIN credit_accounts account ON account.user_id = review.user_id
    WHERE review.id = ?`)
    .bind(c.req.param("id"))
    .first<BillingReviewRow & { available_credits: number }>();
  if (!review) return errorResponse(c, 404, "REVIEW_NOT_FOUND", "Billing review not found.");
  const [events, actions, payment] = await Promise.all([
    c.env.DB.prepare(`SELECT stripe_event_id, trigger_type, amount_cents_at_risk,
        credits_at_risk, created_at
      FROM billing_review_events WHERE review_id = ? ORDER BY created_at ASC`)
      .bind(review.id)
      .all<{
        stripe_event_id: string;
        trigger_type: BillingReviewTrigger;
        amount_cents_at_risk: number;
        credits_at_risk: number;
        created_at: string;
      }>(),
    c.env.DB.prepare(`SELECT id, review_id, idempotency_key, decision,
        credits_reclaimed, unrecovered_after, operator_id, note, created_at
      FROM billing_review_actions WHERE review_id = ? ORDER BY created_at ASC`)
      .bind(review.id)
      .all<BillingReviewActionRow>(),
    c.env.DB.prepare(`SELECT kind, credits_granted, amount_cents, currency, status,
        financial_event_id, created_at, updated_at
      FROM billing_payments WHERE payment_intent_id = ?`)
      .bind(review.payment_intent_id)
      .first<{
        kind: "subscription" | "credits";
        credits_granted: number;
        amount_cents: number;
        currency: string;
        status: "paid" | "refunded" | "disputed";
        financial_event_id: string | null;
        created_at: string;
        updated_at: string;
      }>(),
  ]);
  return c.json({
    review: billingReviewJson(review),
    events: events.results.map((event) => ({
      stripeEventId: event.stripe_event_id,
      triggerType: event.trigger_type,
      amountCentsAtRisk: event.amount_cents_at_risk,
      creditsAtRisk: event.credits_at_risk,
      createdAt: event.created_at,
    })),
    actions: actions.results.map(billingReviewActionJson),
    payment: payment ? {
      kind: payment.kind,
      creditsGranted: payment.credits_granted,
      amountCents: payment.amount_cents,
      currency: payment.currency,
      status: payment.status,
      financialEventId: payment.financial_event_id,
      createdAt: payment.created_at,
      updatedAt: payment.updated_at,
    } : null,
  });
});

app.post("/api/operator/billing/reviews/:id/resolve", async (c) => {
  const denied = requireBillingOperator(c);
  if (denied) return denied;
  const operatorId = (c.req.header("x-operator-id") || "").trim();
  const idempotencyKey = (c.req.header("idempotency-key") || "").trim();
  const body = await readBody(c);
  const decision = body.decision;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!/^[A-Za-z0-9@._+-]{3,80}$/.test(operatorId)) {
    return errorResponse(c, 400, "INVALID_OPERATOR_ID", "Provide a stable operator ID.");
  }
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
    return errorResponse(c, 400, "INVALID_IDEMPOTENCY_KEY", "Provide a stable idempotency key.");
  }
  if (decision !== "confirmed_loss" && decision !== "cleared") {
    return errorResponse(c, 400, "INVALID_REVIEW_DECISION", "Use confirmed_loss or cleared.");
  }
  if (note.length < 8 || note.length > 1000) {
    return errorResponse(c, 400, "INVALID_REVIEW_NOTE", "Add an 8 to 1,000 character review note.");
  }
  const reviewId = c.req.param("id");
  const existingAction = await c.env.DB.prepare(`SELECT id, review_id, idempotency_key,
      decision, credits_reclaimed, unrecovered_after, operator_id, note, created_at
    FROM billing_review_actions WHERE review_id = ? AND idempotency_key = ?`)
    .bind(reviewId, idempotencyKey)
    .first<BillingReviewActionRow>();
  if (existingAction) {
    if (existingAction.decision !== decision) {
      return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "This idempotency key was used for another decision.");
    }
    return c.json({ action: billingReviewActionJson(existingAction), replayed: true });
  }
  const review = await c.env.DB.prepare("SELECT * FROM billing_reviews WHERE id = ?")
    .bind(reviewId)
    .first<BillingReviewRow>();
  if (!review) return errorResponse(c, 404, "REVIEW_NOT_FOUND", "Billing review not found.");
  if (decision === "cleared") {
    const refundTrigger = await c.env.DB.prepare(`SELECT stripe_event_id
      FROM billing_review_events
      WHERE review_id = ? AND trigger_type = 'refund'
      LIMIT 1`)
      .bind(reviewId)
      .first();
    if (refundTrigger) {
      return errorResponse(c, 409, "REFUND_REQUIRES_RECOVERY", "A completed refund must be resolved as a confirmed loss.");
    }
  }
  if (decision === "cleared" && review.status !== "open") {
    return errorResponse(c, 409, "REVIEW_ALREADY_RESOLVED", "This billing review is already resolved.");
  }
  if (decision === "confirmed_loss"
    && review.status === "resolved"
    && (review.decision !== "confirmed_loss" || review.unrecovered_credits === 0)) {
    return errorResponse(c, 409, "REVIEW_ALREADY_RESOLVED", "This billing review has no outstanding loss.");
  }

  const actionId = crypto.randomUUID();
  const timestamp = now();
  if (decision === "cleared") {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT OR IGNORE INTO billing_review_actions
        (id, review_id, idempotency_key, decision, credits_reclaimed,
          unrecovered_after, operator_id, note, created_at)
        SELECT ?, id, ?, 'cleared', 0, 0, ?, ?, ?
        FROM billing_reviews
        WHERE id = ? AND status = 'open' AND NOT EXISTS (
          SELECT 1 FROM billing_review_events
          WHERE review_id = billing_reviews.id AND trigger_type = 'refund'
        )`)
        .bind(actionId, idempotencyKey, operatorId, note, timestamp, reviewId),
      c.env.DB.prepare(`UPDATE billing_reviews
        SET status = 'resolved', decision = 'cleared', unrecovered_credits = 0,
          operator_note = ?, resolved_by = ?, resolved_at = ?, updated_at = ?
        WHERE id = ? AND EXISTS (
          SELECT 1 FROM billing_review_actions WHERE id = ?
        )`)
        .bind(note, operatorId, timestamp, timestamp, reviewId, actionId),
      c.env.DB.prepare(`UPDATE billing_payments
        SET status = 'paid', updated_at = ?
        WHERE payment_intent_id = (
          SELECT payment_intent_id FROM billing_reviews WHERE id = ?
        ) AND EXISTS (
          SELECT 1 FROM billing_review_actions WHERE id = ?
        )`)
        .bind(timestamp, reviewId, actionId),
      c.env.DB.prepare(`UPDATE billing_orders
        SET financial_status = 'normal'
        WHERE payment_intent_id = (
          SELECT payment_intent_id FROM billing_reviews WHERE id = ?
        ) AND EXISTS (
          SELECT 1 FROM billing_review_actions WHERE id = ?
        )`)
        .bind(reviewId, actionId),
      c.env.DB.prepare(`UPDATE billing_risk_events
        SET status = 'resolved', updated_at = ?
        WHERE payment_intent_id = (
          SELECT payment_intent_id FROM billing_reviews WHERE id = ?
        ) AND EXISTS (
          SELECT 1 FROM billing_review_actions WHERE id = ?
        )`)
        .bind(timestamp, reviewId, actionId),
      refreshBillingReviewBlock(c.env, review.user_id, timestamp),
    ]);
  } else {
    const ledgerId = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT OR IGNORE INTO billing_review_actions
        (id, review_id, idempotency_key, decision, credits_reclaimed,
          unrecovered_after, operator_id, note, created_at)
        SELECT ?, id, ?, 'confirmed_loss', 0,
          CASE
            WHEN status = 'open' THEN MAX(0, credits_at_risk - credits_reclaimed)
            ELSE unrecovered_credits
          END,
          ?, ?, ?
        FROM billing_reviews
        WHERE id = ? AND (
          status = 'open'
          OR (decision = 'confirmed_loss' AND unrecovered_credits > 0)
        )`)
        .bind(actionId, idempotencyKey, operatorId, note, timestamp, reviewId),
      c.env.DB.prepare(`INSERT OR IGNORE INTO credit_ledger
        (id, user_id, type, amount, balance_after, reference_id, description, created_at)
        SELECT
          ?,
          account.user_id,
          'manual_adjustment',
          -MIN(
            account.available,
            CASE
              WHEN review.status = 'open'
                THEN MAX(0, review.credits_at_risk - review.credits_reclaimed)
              ELSE review.unrecovered_credits
            END
          ),
          account.available - MIN(
            account.available,
            CASE
              WHEN review.status = 'open'
                THEN MAX(0, review.credits_at_risk - review.credits_reclaimed)
              ELSE review.unrecovered_credits
            END
          ),
          ?,
          'Billing loss credit recovery',
          ?
        FROM billing_reviews review
        JOIN credit_accounts account ON account.user_id = review.user_id
        WHERE review.id = ?
          AND account.available > 0
          AND (
            CASE
              WHEN review.status = 'open'
                THEN MAX(0, review.credits_at_risk - review.credits_reclaimed)
              ELSE review.unrecovered_credits
            END
          ) > 0
          AND EXISTS (
            SELECT 1 FROM billing_review_actions WHERE id = ?
          )`)
        .bind(ledgerId, actionId, timestamp, reviewId, actionId),
      c.env.DB.prepare(`UPDATE credit_accounts
        SET available = available + COALESCE((
            SELECT amount FROM credit_ledger WHERE id = ?
          ), 0),
          updated_at = ?
        WHERE user_id = ? AND EXISTS (
          SELECT 1 FROM billing_review_actions WHERE id = ?
        )`)
        .bind(ledgerId, timestamp, review.user_id, actionId),
      c.env.DB.prepare(`UPDATE billing_reviews
        SET status = 'resolved',
          decision = 'confirmed_loss',
          credits_reclaimed = credits_reclaimed + COALESCE((
            SELECT -amount FROM credit_ledger WHERE id = ?
          ), 0),
          unrecovered_credits = MAX(
            0,
            credits_at_risk - credits_reclaimed - COALESCE((
              SELECT -amount FROM credit_ledger WHERE id = ?
            ), 0)
          ),
          operator_note = ?,
          resolved_by = ?,
          resolved_at = COALESCE(resolved_at, ?),
          updated_at = ?
        WHERE id = ? AND EXISTS (
          SELECT 1 FROM billing_review_actions WHERE id = ?
        )`)
        .bind(
          ledgerId,
          ledgerId,
          note,
          operatorId,
          timestamp,
          timestamp,
          reviewId,
          actionId,
        ),
      c.env.DB.prepare(`UPDATE billing_review_actions
        SET credits_reclaimed = COALESCE((
            SELECT -amount FROM credit_ledger WHERE id = ?
          ), 0),
          unrecovered_after = COALESCE((
            SELECT unrecovered_credits FROM billing_reviews WHERE id = ?
          ), unrecovered_after)
        WHERE id = ?`)
        .bind(ledgerId, reviewId, actionId),
      c.env.DB.prepare(`UPDATE billing_risk_events
        SET status = 'resolved', updated_at = ?
        WHERE payment_intent_id = (
          SELECT payment_intent_id FROM billing_reviews WHERE id = ?
        ) AND EXISTS (
          SELECT 1 FROM billing_review_actions WHERE id = ?
        )`)
        .bind(timestamp, reviewId, actionId),
      refreshBillingReviewBlock(c.env, review.user_id, timestamp),
    ]);
  }

  const action = await c.env.DB.prepare(`SELECT id, review_id, idempotency_key,
      decision, credits_reclaimed, unrecovered_after, operator_id, note, created_at
    FROM billing_review_actions WHERE id = ?`)
    .bind(actionId)
    .first<BillingReviewActionRow>();
  if (!action) {
    const replay = await c.env.DB.prepare(`SELECT id, review_id, idempotency_key,
        decision, credits_reclaimed, unrecovered_after, operator_id, note, created_at
      FROM billing_review_actions WHERE review_id = ? AND idempotency_key = ?`)
      .bind(reviewId, idempotencyKey)
      .first<BillingReviewActionRow>();
    if (replay && replay.decision === decision) {
      return c.json({ action: billingReviewActionJson(replay), replayed: true });
    }
    return errorResponse(c, 409, "REVIEW_STATE_CHANGED", "The billing review changed before this decision was applied.");
  }
  return c.json({ action: billingReviewActionJson(action), replayed: false });
});

app.get("/api/billing", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const account = await billingAccount(c.env, actor.userId!);
  const ordersResult = await c.env.DB.prepare("SELECT * FROM billing_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").bind(actor.userId).all<BillingOrderRow>();
  const termsAcceptance = await c.env.DB.prepare(`SELECT accepted_at
    FROM billing_terms_acceptances WHERE user_id = ? AND terms_version = ?`)
    .bind(actor.userId, BILLING_TERMS_VERSION)
    .first<{ accepted_at: string }>();
  const offers = await versionedBillingOffers(c.env);
  const response: BillingSummary = {
    configured: await billingRuntimeConfigured(c.env),
    promotion: null,
    terms: {
      version: BILLING_TERMS_VERSION,
      accepted: Boolean(termsAcceptance),
      acceptedAt: termsAcceptance?.accepted_at ?? null,
    },
    account: {
      plan: account.plan,
      planTier: account.plan_tier,
      billingInterval: account.billing_interval,
      status: account.status,
      currentPeriodEnd: account.current_period_end,
      cancelAtPeriodEnd: Boolean(account.cancel_at_period_end),
      hasCustomer: Boolean(account.stripe_customer_id),
      spendingBlocked: Boolean(account.spending_blocked),
      blockReason: account.block_reason,
    },
    offers,
    orders: ordersResult.results.map((order) => ({
      id: order.id, offerId: order.offer_id, kind: order.kind, credits: order.credits, amountCents: order.amount_cents, currency: order.currency,
      status: order.status, financialStatus: order.financial_status, createdAt: order.created_at, completedAt: order.completed_at,
    })),
  };
  return c.json(response);
});

app.post("/api/billing/terms/accept", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const body = await readBody(c);
  if (body.confirmed !== true || body.version !== BILLING_TERMS_VERSION) {
    return errorResponse(
      c,
      400,
      "TERMS_CONFIRMATION_REQUIRED",
      "Review and accept the current Billing Terms and Refund Policy before purchasing.",
    );
  }
  const timestamp = now();
  await c.env.DB.prepare(`INSERT OR IGNORE INTO billing_terms_acceptances
    (user_id, terms_version, accepted_at, ip_hint, user_agent)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(
      actor.userId,
      BILLING_TERMS_VERSION,
      timestamp,
      ipHint(c),
      (c.req.header("user-agent") || "Unknown device").slice(0, 180),
    )
    .run();
  const acceptance = await c.env.DB.prepare(`SELECT accepted_at
    FROM billing_terms_acceptances WHERE user_id = ? AND terms_version = ?`)
    .bind(actor.userId, BILLING_TERMS_VERSION)
    .first<{ accepted_at: string }>();
  return c.json({
    version: BILLING_TERMS_VERSION,
    accepted: true,
    acceptedAt: acceptance?.accepted_at ?? timestamp,
  });
});

app.post("/api/billing/checkout", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  if (!actor.user!.emailVerified) return errorResponse(c, 403, "EMAIL_NOT_VERIFIED", "Verify your email before starting a purchase.");
  if (!billingConfigured(c.env)) return errorResponse(c, 503, "BILLING_UNAVAILABLE", "Billing is disabled or Stripe credentials are incomplete.");
  const body = await readBody(c);
  const offer = (await versionedBillingOffers(c.env)).find((candidate) => candidate.id === body.offerId);
  if (!offer) return errorResponse(c, 400, "INVALID_OFFER", "Choose a valid billing offer.");
  if (!offer.configured) return errorResponse(c, 503, "OFFER_UNAVAILABLE", "This billing offer is not configured.");
  const account = await billingAccount(c.env, actor.userId!);
  if (account.spending_blocked) {
    return errorResponse(
      c,
      423,
      "BILLING_REVIEW_REQUIRED",
      account.block_reason || "Purchases and credit spending are paused during billing review.",
    );
  }
  if (offer.kind === "subscription" && account.plan === "creator" && ["active", "trialing"].includes(account.status)) {
    return errorResponse(c, 409, "ALREADY_SUBSCRIBED", "Manage your active subscription in the billing portal.");
  }
  const termsAcceptance = await c.env.DB.prepare(`SELECT accepted_at
    FROM billing_terms_acceptances WHERE user_id = ? AND terms_version = ?`)
    .bind(actor.userId, BILLING_TERMS_VERSION)
    .first<{ accepted_at: string }>();
  if (!termsAcceptance) {
    return errorResponse(
      c,
      409,
      "BILLING_TERMS_REQUIRED",
      "Review and accept the current Billing Terms and Refund Policy before purchasing.",
    );
  }
  let customerId = account.stripe_customer_id;
  const priceVersion = await activeBillingPriceVersion(c.env, offer.id);
  if (!priceVersion) return errorResponse(c, 503, "OFFER_UNAVAILABLE", "This billing offer has no active price version.");
  const attemptId = crypto.randomUUID();
  const timestamp = now();
  await c.env.DB.prepare(`INSERT INTO billing_checkout_attempts
    (id, user_id, offer_id, kind, credits, amount_cents, currency, stripe_price_id,
      status, terms_version, terms_accepted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?, ?, ?)`)
    .bind(
      attemptId,
      actor.userId,
      offer.id,
      offer.kind,
      offer.credits,
      offer.amountCents,
      offer.currency,
      priceVersion.stripe_price_id,
      BILLING_TERMS_VERSION,
      termsAcceptance.accepted_at,
      timestamp,
      timestamp,
    )
    .run();
  try {
    if (!customerId) {
      const customerParams = new URLSearchParams({
        email: actor.user!.email,
        name: actor.user!.name,
        "metadata[user_id]": actor.userId!,
      });
      const customer = await stripeRequest<{ id?: string }>(
        c.env,
        "/v1/customers",
        customerParams,
        "POST",
        `customer-${actor.userId}`,
      );
      if (!customer.id?.startsWith("cus_")) {
        throw new ExternalRequestError("EXTERNAL_RESPONSE_INVALID", "Billing services returned an invalid customer.");
      }
      customerId = customer.id;
      await c.env.DB.prepare("UPDATE billing_accounts SET stripe_customer_id = ?, updated_at = ? WHERE user_id = ?")
        .bind(customerId, now(), actor.userId)
        .run();
    }
    const params = new URLSearchParams({
      mode: offer.kind === "subscription" ? "subscription" : "payment",
      customer: customerId,
      client_reference_id: actor.userId!,
      success_url: `${c.env.APP_BASE_URL.replace(/\/$/, "")}/studio/billing?checkout=success`,
      cancel_url: `${c.env.APP_BASE_URL.replace(/\/$/, "")}/studio/billing?checkout=canceled`,
      "line_items[0][price]": priceVersion.stripe_price_id,
      "line_items[0][quantity]": "1",
      "metadata[user_id]": actor.userId!,
      "metadata[offer_id]": offer.id,
      "metadata[kind]": offer.kind,
      "metadata[order_id]": attemptId,
      "metadata[terms_version]": BILLING_TERMS_VERSION,
    });
    if (offer.kind === "subscription") {
      params.set("subscription_data[metadata][user_id]", actor.userId!);
      params.set("subscription_data[metadata][offer_id]", offer.id);
      params.set("subscription_data[metadata][order_id]", attemptId);
      params.set("subscription_data[metadata][terms_version]", BILLING_TERMS_VERSION);
    } else {
      params.set("payment_intent_data[metadata][user_id]", actor.userId!);
      params.set("payment_intent_data[metadata][offer_id]", offer.id);
      params.set("payment_intent_data[metadata][order_id]", attemptId);
      params.set("payment_intent_data[metadata][terms_version]", BILLING_TERMS_VERSION);
    }
    const checkout = await stripeRequest<{ id?: string; url?: string }>(
      c.env,
      "/v1/checkout/sessions",
      params,
      "POST",
      `checkout-${attemptId}`,
    );
    if (!checkout.id?.startsWith("cs_")) {
      throw new ExternalRequestError("EXTERNAL_RESPONSE_INVALID", "Billing services returned an invalid Checkout Session.");
    }
    const checkoutUrl = trustedServiceUrl(checkout.url, "checkout.stripe.com", "Billing provider");
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE billing_checkout_attempts
        SET stripe_checkout_session_id = ?, status = 'created', updated_at = ? WHERE id = ?`)
        .bind(checkout.id, now(), attemptId),
      c.env.DB.prepare(`INSERT OR IGNORE INTO billing_orders
        (id, user_id, stripe_checkout_session_id, offer_id, kind, credits, amount_cents, currency, stripe_price_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          attemptId,
          actor.userId,
          checkout.id,
          offer.id,
          offer.kind,
          offer.credits,
          offer.amountCents,
          offer.currency,
          priceVersion.stripe_price_id,
          timestamp,
        ),
    ]);
    return c.json({ url: checkoutUrl }, 201);
  } catch (reason) {
    await c.env.DB.prepare(`UPDATE billing_checkout_attempts
      SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`)
      .bind(reason instanceof Error ? reason.message : "Checkout creation failed.", now(), attemptId)
      .run();
    console.error("billing-checkout-failed", {
      attemptId,
      requestId: c.get("requestId"),
      reason: reason instanceof Error ? reason.message : "unknown",
    });
    const message = reason instanceof ExternalRequestError
      ? reason.publicMessage
      : "Billing services could not start Checkout.";
    return errorResponse(c, 502, "BILLING_FAILED", message);
  }
});

app.post("/api/billing/portal", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const account = await billingAccount(c.env, actor.userId!);
  if (!account.stripe_customer_id) return errorResponse(c, 400, "NO_BILLING_ACCOUNT", "Complete a checkout before opening the billing portal.");
  const portal = await stripeRequest<{ url?: string }>(c.env, "/v1/billing_portal/sessions", new URLSearchParams({
    customer: account.stripe_customer_id,
    return_url: `${c.env.APP_BASE_URL.replace(/\/$/, "")}/studio/billing`,
  }));
  try {
    return c.json({ url: trustedServiceUrl(portal.url, "billing.stripe.com", "Billing provider") });
  } catch (reason) {
    return errorResponse(
      c,
      502,
      "STRIPE_RESPONSE_INVALID",
      reason instanceof ExternalRequestError ? reason.publicMessage : "Billing services returned an invalid portal URL.",
    );
  }
});

app.post("/api/billing/webhook", async (c) => {
  if (!stripeWebhookConfigured(c.env) || !c.env.STRIPE_WEBHOOK_SECRET) {
    return errorResponse(c, 503, "WEBHOOK_UNAVAILABLE", "Stripe webhook verification is not configured.");
  }
  const rawBody = await c.req.text();
  if (!(await verifyStripeSignature(c.env.STRIPE_WEBHOOK_SECRET, rawBody, c.req.header("stripe-signature")))) {
    return errorResponse(c, 400, "INVALID_SIGNATURE", "Stripe webhook signature is invalid.");
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return errorResponse(c, 400, "INVALID_EVENT", "Stripe webhook payload is invalid.");
  }
  if (!event.id || !event.type || !event.data?.object) return errorResponse(c, 400, "INVALID_EVENT", "Stripe webhook event is incomplete.");
  const timestamp = now();
  const insert = await c.env.DB.prepare("INSERT OR IGNORE INTO billing_events (stripe_event_id, type, status, payload_json, processing_started_at, updated_at) VALUES (?, ?, 'processing', ?, ?, ?)")
    .bind(event.id, event.type, rawBody, timestamp, timestamp).run();
  if (!insert.meta.changes) {
    const previous = await c.env.DB.prepare("SELECT status FROM billing_events WHERE stripe_event_id = ?").bind(event.id).first<{ status: string }>();
    if (previous?.status === "completed") return c.json({ received: true, duplicate: true });
    if (previous?.status === "processing") return errorResponse(c, 409, "EVENT_IN_PROGRESS", "This Stripe event is already being processed.");
    await c.env.DB.prepare("UPDATE billing_events SET status = 'processing', attempts = attempts + 1, last_error = NULL, processing_started_at = ?, updated_at = ? WHERE stripe_event_id = ? AND status = 'failed'")
      .bind(now(), now(), event.id).run();
  }
  try {
    await handleStripeEvent(c.env, event);
    await c.env.DB.prepare("UPDATE billing_events SET status = 'completed', completed_at = ?, updated_at = ? WHERE stripe_event_id = ?").bind(now(), now(), event.id).run();
    return c.json({ received: true });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Stripe event could not be processed.";
    await c.env.DB.prepare("UPDATE billing_events SET status = 'failed', last_error = ?, updated_at = ? WHERE stripe_event_id = ?").bind(message, now(), event.id).run();
    console.error("billing-webhook-processing-failed", {
      eventId: event.id,
      requestId: c.get("requestId"),
      reason: message,
    });
    return errorResponse(c, 503, "WEBHOOK_PROCESSING_FAILED", "The billing event could not be processed yet and will be retried.");
  }
});

app.get("/api/generations", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const limit = Math.min(50, Math.max(1, Number.parseInt(c.req.query("limit") || "8", 10) || 8));
  const projectId = c.req.query("projectId") || null;
  const result = await c.env.DB.prepare(`SELECT * FROM generations WHERE owner_user_id = ? ${projectId ? "AND project_id = ?" : ""} ORDER BY created_at DESC LIMIT ?`)
    .bind(...(projectId ? [actor.userId, projectId, limit] : [actor.userId, limit])).all<GenerationRow>();
  return c.json({ generations: result.results.map(generationFromRow) });
});

async function generationHandler(c: Context<WorkerContext>, apiOnly: boolean) {
  const actor = apiOnly ? c.get("actor") : await resolveActor(c);
  c.set("actor", actor);
  if (apiOnly && (!actor.user || !actor.apiKeyId)) return errorResponse(c, 401, "INVALID_API_KEY", "Provide a valid API key in the Authorization header.");
  if (apiOnly && !actor.scopes.includes("generations:write")) return errorResponse(c, 403, "INSUFFICIENT_SCOPE", "This API key does not have generations:write access.");
  if (!actor.user || !actor.userId) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to generate an image.");
  const body = await readBody(c);
  const normalized = apiOnly ? {
    prompt: body.prompt,
    modelId: body.model,
    aspectRatio: body.aspect_ratio,
    style: typeof body.style === "string" ? body.style.replace(/^./, (value) => value.toUpperCase()) : "Photorealistic",
    quality: typeof body.quality === "string" ? body.quality.replace(/^./, (value) => value.toUpperCase()) : "High",
    projectId: body.project_id,
  } : body;
  const requestedModelId = typeof normalized.modelId === "string" ? normalized.modelId.trim() : "";
  const selectedModel = availableGenerationModel(c.env, requestedModelId);
  if (!selectedModel) return errorResponse(c, 400, "MODEL_UNAVAILABLE", "Choose an available image model.");
  const input = validateGeneration({ ...normalized, modelId: selectedModel.id });
  if (!input) return errorResponse(c, 400, "INVALID_REQUEST", "Prompt or generation settings are invalid.");
  if (
    input.prompt.length > selectedModel.maxPromptLength
    || !selectedModel.supportedAspectRatios.includes(input.aspectRatio)
    || !selectedModel.supportedQualities.includes(input.quality)
  ) {
    return errorResponse(c, 400, "MODEL_SETTINGS_UNSUPPORTED", "Choose settings supported by the selected image model.");
  }
  if (input.projectId) {
    const owns = actor.userId && await c.env.DB.prepare("SELECT 1 FROM projects WHERE id = ? AND user_id = ?").bind(input.projectId, actor.userId).first();
    if (!owns) return errorResponse(c, 400, "INVALID_PROJECT", "Choose a project that belongs to your account.");
  }
  const idempotencyKey = c.req.header("idempotency-key")?.trim() || "";
  if (apiOnly && idempotencyKey && actor.userId) {
    if (idempotencyKey.length > 128) return errorResponse(c, 400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 128 characters or fewer.");
    const existing = await c.env.DB.prepare(`SELECT r.status request_status, r.failure_code, g.* FROM generation_requests r
      LEFT JOIN generations g ON g.id = r.generation_id
      WHERE r.user_id = ? AND r.idempotency_key = ?`)
      .bind(actor.userId, idempotencyKey)
      .first<(GenerationRow & { request_status: string; failure_code: string | null })>();
    if (existing) {
      if (existing.request_status === "failed") {
        return errorResponse(c, 503, existing.failure_code || "GENERATION_FAILED", "The earlier request failed without charging credits.");
      }
      if (!existing.id || existing.request_status !== "completed" || existing.status === "processing") {
        c.header("Retry-After", "2");
        return errorResponse(c, 409, "REQUEST_IN_PROGRESS", "A request with this Idempotency-Key is still processing.");
      }
      return c.json(generationFromRow(existing));
    }
    const legacy = await c.env.DB.prepare("SELECT g.* FROM idempotency_keys i JOIN generations g ON g.id = i.generation_id WHERE i.user_id = ? AND i.idempotency_key = ?")
      .bind(actor.userId, idempotencyKey).first<GenerationRow>();
    if (legacy) {
      if (legacy.status === "processing") {
        c.header("Retry-After", "2");
        return errorResponse(c, 409, "REQUEST_IN_PROGRESS", "A request with this Idempotency-Key is still processing.");
      }
      return c.json(generationFromRow(legacy));
    }
  }
  const vip = await isVip(c.env, actor.userId);
  const queueTier = vip ? "vip" : "free";
  const generationId = crypto.randomUUID();
  const creditCost = qualityCosts[input.quality];
  const timestamp = now();
  let generationRequestId: string | null = null;
  if (apiOnly && idempotencyKey && actor.userId) {
    generationRequestId = crypto.randomUUID();
    const claim = await c.env.DB.prepare(`INSERT OR IGNORE INTO generation_requests
      (id, user_id, api_key_id, idempotency_key, generation_id, status, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 'claimed', ?, ?, ?)`)
      .bind(
        generationRequestId,
        actor.userId,
        actor.apiKeyId,
        idempotencyKey,
        generationId,
        timestamp,
        timestamp,
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      )
      .run();
    if (!(claim.meta.changes ?? 0)) {
      const concurrent = await c.env.DB.prepare(`SELECT r.status request_status, g.*
        FROM generation_requests r
        LEFT JOIN generations g ON g.id = r.generation_id
        WHERE r.user_id = ? AND r.idempotency_key = ?`)
        .bind(actor.userId, idempotencyKey)
        .first<GenerationRow & { request_status: string; failure_code: string | null }>();
      if (concurrent?.request_status === "failed") {
        return errorResponse(c, 503, concurrent.failure_code || "GENERATION_FAILED", "The earlier request failed without charging credits.");
      }
      if (concurrent?.id && concurrent.request_status === "completed" && concurrent.status !== "processing") {
        return c.json(generationFromRow(concurrent));
      }
      c.header("Retry-After", "2");
      return errorResponse(c, 409, "REQUEST_IN_PROGRESS", "A request with this Idempotency-Key is still processing.");
    }
  }

  const insertGeneration = (ownerGuard: string, guardValues: Array<string | number>) => c.env.DB.prepare(`INSERT INTO generations
    (id, owner_user_id, anonymous_session_id, project_id, prompt, aspect_ratio, style, quality, status, provider, model, credit_cost, queue_tier, queued_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?
    WHERE ${ownerGuard}`)
    .bind(
      generationId,
      actor.userId,
      null,
      input.projectId || null,
      input.prompt,
      input.aspectRatio,
      input.style,
      input.quality,
      selectedModel.provider,
      selectedModel.id,
      creditCost,
      queueTier,
      timestamp,
      timestamp,
      timestamp,
      ...guardValues,
    );

  if (actor.userId) {
    const reservation = prepareCreditReservation(c.env.DB, {
      userId: actor.userId,
      amount: creditCost,
      referenceId: generationId,
      timestamp,
    });
    const statements = [
      ...reservation.statements,
      insertGeneration("EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)", [reservation.ledgerId]),
    ];
    if (idempotencyKey) {
      statements.push(
        c.env.DB.prepare(`INSERT OR IGNORE INTO idempotency_keys
          (user_id, idempotency_key, generation_id, created_at)
          SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM generations WHERE id = ?)`)
          .bind(actor.userId, idempotencyKey, generationId, timestamp, generationId),
      );
    }
    if (generationRequestId) {
      statements.push(
        c.env.DB.prepare(`UPDATE generation_requests SET status = 'processing', updated_at = ?
          WHERE id = ? AND EXISTS (SELECT 1 FROM generations WHERE id = ?)`)
          .bind(timestamp, generationRequestId, generationId),
      );
    }
    const results = await c.env.DB.batch(statements);
    const reserved = creditMutationApplied(results);
    const generationInserted = results[2].meta.changes ?? 0;
    if (!reserved || generationInserted !== 1) {
      if (generationRequestId) {
        await c.env.DB.prepare("DELETE FROM generation_requests WHERE id = ? AND status = 'claimed'")
          .bind(generationRequestId)
          .run();
      }
      const billing = await billingAccount(c.env, actor.userId);
      if (billing.spending_blocked) {
        return errorResponse(c, 423, "BILLING_REVIEW_REQUIRED", billing.block_reason || "Credit spending is paused.");
      }
      return errorResponse(c, 402, "INSUFFICIENT_CREDITS", `This generation costs ${creditCost} credits.`);
    }
  } else {
    return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to generate an image.");
  }
  let objectKey: string | null = null;
  let completed = false;
  try {
    if (!vip) {
      const delay = Math.min(10_000, Math.max(0, Number.parseInt(c.env.FREE_QUEUE_DELAY_MS || "1800", 10) || 1800));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    await c.env.DB.prepare("UPDATE generations SET processing_started_at = ?, updated_at = ? WHERE id = ? AND status = 'processing'")
      .bind(now(), now(), generationId)
      .run();
    const asset = await generateAsset(c.env, input);
    const extension = asset.mimeType === "image/svg+xml" ? "svg" : asset.mimeType === "image/jpeg" ? "jpg" : asset.mimeType === "image/webp" ? "webp" : "png";
    const key = `generations/users/${actor.userId}/${generationId}.${extension}`;
    objectKey = key;
    await c.env.ASSETS_BUCKET.put(key, asset.bytes, {
      httpMetadata: { contentType: asset.mimeType, cacheControl: "private, no-store" },
      customMetadata: { generationId, ownerType: "user" },
    });
    const completion = await c.env.DB.prepare(`UPDATE generations
      SET status = 'complete', width = ?, height = ?, r2_key = ?, mime_type = ?, provider = ?, model = ?, updated_at = ?
      WHERE id = ? AND status = 'processing'`)
      .bind(asset.width, asset.height, key, asset.mimeType, asset.provider, asset.model, now(), generationId)
      .run();
    if ((completion.meta.changes ?? 0) !== 1) {
      throw new Error("Generation completion state changed unexpectedly.");
    }
    completed = true;
    if (actor.userId) {
      try {
        await settleCredits(c.env.DB, { userId: actor.userId, amount: creditCost, referenceId: generationId });
      } catch (reason) {
        console.error("generation-settlement-deferred", {
          generationId,
          requestId: c.get("requestId"),
          reason: reason instanceof Error ? reason.message : "unknown",
        });
      }
    }
    if (generationRequestId) {
      await c.env.DB.prepare("UPDATE generation_requests SET status = 'completed', updated_at = ? WHERE id = ?")
        .bind(now(), generationRequestId)
        .run();
    }
    const row = (await c.env.DB.prepare("SELECT * FROM generations WHERE id = ?").bind(generationId).first<GenerationRow>())!;
    c.header("X-Generation-Queue", queueTier);
    return c.json(generationFromRow(row), 201);
  } catch (reason) {
    if (!completed) {
      if (objectKey) {
        try {
          await c.env.ASSETS_BUCKET.delete(objectKey);
        } catch (cleanupReason) {
          await c.env.DB.prepare(`INSERT INTO r2_deletion_queue
            (object_key, reason, reference_id, attempts, last_error, created_at, updated_at)
            VALUES (?, 'failed_generation', ?, 1, ?, ?, ?)
            ON CONFLICT(object_key) DO UPDATE SET
              attempts = attempts + 1, last_error = excluded.last_error, updated_at = excluded.updated_at`)
            .bind(
              objectKey,
              generationId,
              cleanupReason instanceof Error ? cleanupReason.message : "R2 deletion failed.",
              now(),
              now(),
            )
            .run()
            .catch(() => undefined);
        }
      }
      const failed = await c.env.DB.prepare("UPDATE generations SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'processing'")
        .bind(now(), generationId)
        .run();
      if ((failed.meta.changes ?? 0) === 1 && actor.userId) {
        await refundCredits(c.env.DB, { userId: actor.userId, amount: creditCost, referenceId: generationId });
      }
      if (generationRequestId) {
        await c.env.DB.prepare("UPDATE generation_requests SET status = 'failed', failure_code = ?, updated_at = ? WHERE id = ?")
          .bind(reason instanceof ExternalRequestError ? reason.code : "GENERATION_FAILED", now(), generationRequestId)
          .run();
      }
    }
    console.error("generation-request-failed", {
      generationId,
      requestId: c.get("requestId"),
      reason: reason instanceof Error ? reason.message : "unknown",
      completed,
    });
    if (completed) {
      c.header("Retry-After", "2");
      return errorResponse(c, 503, "GENERATION_PERSISTED", "The image was saved, but its response could not be completed. Retry with the same Idempotency-Key.");
    }
    const providerFailure = reason instanceof ExternalRequestError ? reason : null;
    const timeout = providerFailure?.code === "EXTERNAL_TIMEOUT";
    return errorResponse(
      c,
      timeout ? 504 : 503,
      timeout ? "GENERATION_TIMEOUT" : providerFailure?.code || "GENERATION_FAILED",
      `${providerFailure?.publicMessage || "The image could not be generated."} No allowance or credits were charged.`,
    );
  }
}

app.post("/api/generations", (c) => generationHandler(c, false));
app.post("/v1/generations", (c) => generationHandler(c, true));

async function generationAsset(c: Context<WorkerContext>, download: boolean) {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to access this image.");
  const row = await c.env.DB.prepare("SELECT * FROM generations WHERE id = ?").bind(c.req.param("id")).first<GenerationRow>();
  if (!row || row.owner_user_id !== actor.userId || !row.r2_key) {
    return errorResponse(c, 404, "NOT_FOUND", "Image not found.");
  }
  const object = await c.env.ASSETS_BUCKET.get(row.r2_key);
  if (!object) return errorResponse(c, 404, "NOT_FOUND", "Image not found.");
  const bytes = new Uint8Array(await object.arrayBuffer());
  const paid = await hasPaidPlan(c.env, actor.userId);
  const vip = await isVip(c.env, actor.userId);
  const sourceMime = row.mime_type || object.httpMetadata?.contentType || "application/octet-stream";
  const data = paid ? bytes : encoder.encode(watermarkedSvg(bytes, sourceMime, row.width, row.height));
  const mimeType = paid ? sourceMime : "image/svg+xml";
  const extension = paid ? sourceMime === "image/jpeg" ? "jpg" : sourceMime === "image/webp" ? "webp" : sourceMime === "image/svg+xml" ? "svg" : "png" : "svg";
  c.header("Content-Type", `${mimeType}${mimeType === "image/svg+xml" ? "; charset=utf-8" : ""}`);
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Cookie, Authorization");
  c.header("X-Export-Tier", vip ? "vip" : paid ? "starter" : "free");
  c.header("X-Export-Watermarked", paid ? "false" : "true");
  c.header("Content-Disposition", `${download ? "attachment" : "inline"}; filename="qwen-image-3-${row.id}-${paid ? "original" : "watermarked"}.${extension}"`);
  return c.body(data);
}

app.get("/api/generations/:id/image", (c) => generationAsset(c, false));
app.get("/api/generations/:id/download", (c) => generationAsset(c, true));

app.delete("/api/generations/:id", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to manage your generations.");
  const row = await c.env.DB.prepare("SELECT r2_key FROM generations WHERE id = ? AND owner_user_id = ?")
    .bind(c.req.param("id"), actor.userId).first<{ r2_key: string | null }>();
  if (!row) return errorResponse(c, 404, "NOT_FOUND", "Generation not found.");
  if (row.r2_key) await c.env.ASSETS_BUCKET.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM generations WHERE id = ?").bind(c.req.param("id")).run();
  return c.body(null, 204);
});

app.patch("/api/generations/:id/favorite", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const body = await readBody(c);
  const result = await c.env.DB.prepare("UPDATE generations SET favorite = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?")
    .bind(body.favorite ? 1 : 0, now(), c.req.param("id"), actor.userId).run();
  if (!result.meta.changes) return errorResponse(c, 404, "NOT_FOUND", "Generation not found.");
  return c.json({ favorite: Boolean(body.favorite) });
});

interface SupportTicketQueryRow {
  id: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  message_count: number;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

interface SupportMessageQueryRow {
  id: string;
  ticket_id: string;
  author: SupportMessage["author"];
  body: string;
  created_at: string;
}

function supportTicketFromRow(row: SupportTicketQueryRow): SupportTicket {
  return {
    id: row.id,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    messageCount: Number(row.message_count),
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function workerSupportTicket(env: Env, userId: string, ticketId: string): Promise<SupportTicketDetail | null> {
  const row = await env.DB.prepare(`SELECT t.id, t.subject, t.category, t.priority, t.status, t.last_message_at, t.created_at, t.updated_at,
    COUNT(m.id) message_count
    FROM support_tickets t LEFT JOIN support_messages m ON m.ticket_id = t.id
    WHERE t.id = ? AND t.user_id = ? GROUP BY t.id`)
    .bind(ticketId, userId).first<SupportTicketQueryRow>();
  if (!row) return null;
  const messages = await env.DB.prepare(`SELECT id, ticket_id, author, body, created_at
    FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC`)
    .bind(ticketId).all<SupportMessageQueryRow>();
  return {
    ...supportTicketFromRow(row),
    messages: messages.results.map((message) => ({
      id: message.id,
      ticketId: message.ticket_id,
      author: message.author,
      body: message.body,
      createdAt: message.created_at,
    })),
  };
}

app.get("/api/workspace/overview", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [account, credits, counts, generationRows, creditRows, paymentRows, supportRows] = await Promise.all([
    billingAccount(c.env, actor.userId!),
    creditAccount(c.env, actor.userId!),
    c.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM generations WHERE owner_user_id = ?) generations_all_time,
      (SELECT COUNT(*) FROM generations WHERE owner_user_id = ? AND created_at >= ?) generations_this_month,
      (SELECT COUNT(*) FROM projects WHERE user_id = ? AND archived = 0) active_projects,
      (SELECT COUNT(*) FROM api_keys WHERE user_id = ? AND revoked_at IS NULL) active_api_keys,
      (SELECT COUNT(*) FROM support_tickets WHERE user_id = ? AND status IN ('open', 'waiting')) open_support_tickets`)
      .bind(actor.userId, actor.userId, monthStart.toISOString(), actor.userId, actor.userId, actor.userId)
      .first<{
        generations_all_time: number;
        generations_this_month: number;
        active_projects: number;
        active_api_keys: number;
        open_support_tickets: number;
      }>(),
    c.env.DB.prepare("SELECT id, prompt, status, quality, created_at FROM generations WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 5")
      .bind(actor.userId).all<{ id: string; prompt: string; status: Generation["status"]; quality: ImageQuality; created_at: string }>(),
    c.env.DB.prepare("SELECT id, type, amount, description, created_at FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 5")
      .bind(actor.userId).all<{ id: string; type: CreditEntry["type"]; amount: number; description: string; created_at: string }>(),
    c.env.DB.prepare("SELECT id, offer_id, status, financial_status, amount_cents, currency, created_at FROM billing_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5")
      .bind(actor.userId).all<{ id: string; offer_id: string; status: string; financial_status: string; amount_cents: number; currency: string; created_at: string }>(),
    c.env.DB.prepare("SELECT id, subject, status, category, updated_at FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5")
      .bind(actor.userId).all<{ id: string; subject: string; status: string; category: string; updated_at: string }>(),
  ]);

  const recentActivity: WorkspaceActivity[] = [
    ...generationRows.results.map((item) => ({
      id: `generation:${item.id}`,
      type: "generation" as const,
      title: item.status === "complete" ? "Image generated" : item.status === "failed" ? "Generation failed safely" : "Generation started",
      detail: item.prompt,
      status: item.quality,
      href: "/studio/history",
      createdAt: item.created_at,
    })),
    ...creditRows.results.map((item) => ({
      id: `credit:${item.id}`,
      type: "credit" as const,
      title: item.description,
      detail: `${item.amount > 0 ? "+" : ""}${item.amount} credits`,
      status: item.type.replaceAll("_", " "),
      href: "/studio/credits",
      createdAt: item.created_at,
    })),
    ...paymentRows.results.map((item) => ({
      id: `payment:${item.id}`,
      type: "payment" as const,
      title: item.offer_id.replaceAll("_", " "),
      detail: new Intl.NumberFormat("en-US", { style: "currency", currency: item.currency.toUpperCase() }).format(item.amount_cents / 100),
      status: item.financial_status === "normal" ? item.status : item.financial_status,
      href: "/studio/payments",
      createdAt: item.created_at,
    })),
    ...supportRows.results.map((item) => ({
      id: `support:${item.id}`,
      type: "support" as const,
      title: item.subject,
      detail: `${item.category} support`,
      status: item.status,
      href: "/studio/support",
      createdAt: item.updated_at,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);

  const overview: WorkspaceOverview = {
    plan: {
      name: account.plan === "creator"
        ? account.plan_tier === "professional" ? "Professional"
          : account.plan_tier === "starter" ? "Starter"
            : "Creator"
        : "Account",
      status: account.status,
    },
    credits,
    usage: {
      generationsThisMonth: Number(counts?.generations_this_month ?? 0),
      generationsAllTime: Number(counts?.generations_all_time ?? 0),
    },
    activeProjects: Number(counts?.active_projects ?? 0),
    activeApiKeys: Number(counts?.active_api_keys ?? 0),
    openSupportTickets: Number(counts?.open_support_tickets ?? 0),
    recentActivity,
  };
  return c.json(overview);
});

app.get("/api/support/tickets", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const rows = await c.env.DB.prepare(`SELECT t.id, t.subject, t.category, t.priority, t.status, t.last_message_at, t.created_at, t.updated_at,
    COUNT(m.id) message_count
    FROM support_tickets t LEFT JOIN support_messages m ON m.ticket_id = t.id
    WHERE t.user_id = ? GROUP BY t.id ORDER BY t.updated_at DESC`)
    .bind(actor.userId).all<SupportTicketQueryRow>();
  return c.json({ tickets: rows.results.map(supportTicketFromRow) });
});

app.post("/api/support/tickets", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const limited = await enforceRateLimit(c, `support:${actor.userId}`, 30, 60 * 60 * 1000);
  if (limited) return limited;
  const body = await readBody(c);
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const category = body.category as SupportTicketCategory;
  const priority = body.priority as SupportTicketPriority;
  if (subject.length < 4 || subject.length > 120) return errorResponse(c, 400, "INVALID_SUBJECT", "Subject must be between 4 and 120 characters.");
  if (message.length < 10 || message.length > 4000) return errorResponse(c, 400, "INVALID_MESSAGE", "Message must be between 10 and 4000 characters.");
  if (!validSupportCategories.includes(category)) return errorResponse(c, 400, "INVALID_CATEGORY", "Choose a valid support category.");
  if (!validSupportPriorities.includes(priority)) return errorResponse(c, 400, "INVALID_PRIORITY", "Choose a valid support priority.");
  const ticketId = crypto.randomUUID();
  const createdAt = now();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO support_tickets
      (id, user_id, subject, category, priority, status, last_message_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`)
      .bind(ticketId, actor.userId, subject, category, priority, createdAt, createdAt, createdAt),
    c.env.DB.prepare("INSERT INTO support_messages (id, ticket_id, author, body, created_at) VALUES (?, ?, 'user', ?, ?)")
      .bind(crypto.randomUUID(), ticketId, message, createdAt),
  ]);
  return c.json((await workerSupportTicket(c.env, actor.userId!, ticketId))!, 201);
});

app.get("/api/support/tickets/:id", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const ticket = await workerSupportTicket(c.env, actor.userId!, c.req.param("id"));
  if (!ticket) return errorResponse(c, 404, "NOT_FOUND", "Support ticket not found.");
  return c.json(ticket);
});

app.post("/api/support/tickets/:id/messages", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const limited = await enforceRateLimit(c, `support:${actor.userId}`, 30, 60 * 60 * 1000);
  if (limited) return limited;
  const body = await readBody(c);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 2 || message.length > 4000) return errorResponse(c, 400, "INVALID_MESSAGE", "Reply must be between 2 and 4000 characters.");
  const ticket = await c.env.DB.prepare("SELECT status FROM support_tickets WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), actor.userId).first<{ status: SupportTicketStatus }>();
  if (!ticket) return errorResponse(c, 404, "NOT_FOUND", "Support ticket not found.");
  if (ticket.status === "closed") return errorResponse(c, 409, "TICKET_CLOSED", "Reopen this ticket before replying.");
  const createdAt = now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO support_messages (id, ticket_id, author, body, created_at) VALUES (?, ?, 'user', ?, ?)")
      .bind(crypto.randomUUID(), c.req.param("id"), message, createdAt),
    c.env.DB.prepare("UPDATE support_tickets SET status = 'open', last_message_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(createdAt, createdAt, c.req.param("id"), actor.userId),
  ]);
  return c.json((await workerSupportTicket(c.env, actor.userId!, c.req.param("id")))!, 201);
});

app.patch("/api/support/tickets/:id", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const body = await readBody(c);
  const status = body.status;
  if (status !== "open" && status !== "closed") return errorResponse(c, 400, "INVALID_STATUS", "A ticket can be reopened or closed.");
  const result = await c.env.DB.prepare("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(status, now(), c.req.param("id"), actor.userId).run();
  if (!result.meta.changes) return errorResponse(c, 404, "NOT_FOUND", "Support ticket not found.");
  return c.json((await workerSupportTicket(c.env, actor.userId!, c.req.param("id")))!);
});

interface ProjectQueryRow {
  id: string;
  name: string;
  description: string;
  archived: number;
  created_at: string;
  generation_count: number | null;
}

interface CreditLedgerQueryRow {
  id: string;
  type: CreditEntry["type"];
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string;
  created_at: string;
}

interface ApiKeyQueryRow {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  scopes: string;
  created_at: string;
}

interface ApiRequestQueryRow {
  id: string;
  user_id: string | null;
  api_key_id: string | null;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  request_id: string;
  created_at: string;
}

function projectFromRow(row: ProjectQueryRow): Project {
  return { id: row.id, name: row.name, description: row.description, archived: Boolean(row.archived), createdAt: row.created_at, generationCount: row.generation_count || 0 };
}

app.get("/api/projects", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const rows = await c.env.DB.prepare(`SELECT p.*, COUNT(g.id) AS generation_count FROM projects p
    LEFT JOIN generations g ON g.project_id = p.id WHERE p.user_id = ? GROUP BY p.id ORDER BY p.updated_at DESC`).bind(actor.userId).all<ProjectQueryRow>();
  return c.json({ projects: rows.results.map(projectFromRow) });
});

app.post("/api/projects", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const body = await readBody(c);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 240) : "";
  if (name.length < 2 || name.length > 80) return errorResponse(c, 400, "INVALID_PROJECT", "Project name must be between 2 and 80 characters.");
  const id = crypto.randomUUID();
  const timestamp = now();
  await c.env.DB.prepare("INSERT INTO projects (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, actor.userId, name, description, timestamp, timestamp).run();
  return c.json({ id, name, description, generationCount: 0, archived: false, createdAt: timestamp } satisfies Project, 201);
});

app.patch("/api/projects/:id", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const body = await readBody(c);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 240) : "";
  if (name.length < 2 || name.length > 80) return errorResponse(c, 400, "INVALID_PROJECT", "Project name must be between 2 and 80 characters.");
  const result = await c.env.DB.prepare("UPDATE projects SET name = ?, description = ?, archived = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(name, description, body.archived ? 1 : 0, now(), c.req.param("id"), actor.userId).run();
  if (!result.meta.changes) return errorResponse(c, 404, "NOT_FOUND", "Project not found.");
  const row = await c.env.DB.prepare(`SELECT p.*, COUNT(g.id) AS generation_count FROM projects p LEFT JOIN generations g ON g.project_id = p.id WHERE p.id = ? GROUP BY p.id`)
    .bind(c.req.param("id")).first<ProjectQueryRow>();
  if (!row) return errorResponse(c, 404, "NOT_FOUND", "Project not found.");
  return c.json(projectFromRow(row));
});

app.get("/api/credits", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const account = await creditAccount(c.env, actor.userId!);
  const rows = await c.env.DB.prepare("SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(actor.userId).all<CreditLedgerQueryRow>();
  const ledger: CreditEntry[] = rows.results.map((row) => ({
    id: row.id, type: row.type, amount: row.amount, balanceAfter: row.balance_after, referenceId: row.reference_id, description: row.description, createdAt: row.created_at,
  }));
  return c.json({ account, ledger });
});

app.get("/api/api-keys", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const rows = await c.env.DB.prepare("SELECT id, name, prefix, last_used_at, scopes, created_at FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC").bind(actor.userId).all<ApiKeyQueryRow>();
  const apiKeys: ApiKeySummary[] = rows.results.map((row) => ({ id: row.id, name: row.name, prefix: row.prefix, lastUsedAt: row.last_used_at, scopes: row.scopes.split(","), createdAt: row.created_at }));
  return c.json({ apiKeys });
});

app.post("/api/api-keys", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  if (!actor.user!.emailVerified) return errorResponse(c, 403, "EMAIL_NOT_VERIFIED", "Verify your email before creating an API key.");
  const body = await readBody(c);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 60) return errorResponse(c, 400, "INVALID_NAME", "Key name must be between 2 and 60 characters.");
  const secret = `qig_${createToken(24)}`;
  const key: ApiKeyCreated = { id: crypto.randomUUID(), name, prefix: secret.slice(0, 12), lastUsedAt: null, scopes: ["generations:write"], createdAt: now(), secret };
  await c.env.DB.prepare("INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?, 'generations:write', ?)")
    .bind(key.id, actor.userId, key.name, key.prefix, await hashToken(secret), key.createdAt).run();
  return c.json(key, 201);
});

app.delete("/api/api-keys/:id", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const result = await c.env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL").bind(now(), c.req.param("id"), actor.userId).run();
  if (!result.meta.changes) return errorResponse(c, 404, "NOT_FOUND", "API key not found.");
  return c.body(null, 204);
});

app.get("/api/api-logs", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const rows = await c.env.DB.prepare("SELECT * FROM api_request_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(actor.userId).all<ApiRequestQueryRow>();
  const requests: ApiRequestLog[] = rows.results.map((row) => ({
    id: row.id, userId: row.user_id, apiKeyId: row.api_key_id, method: row.method, path: row.path, statusCode: row.status_code, durationMs: row.duration_ms, requestId: row.request_id, createdAt: row.created_at,
  }));
  return c.json({ requests });
});

app.get("/api/catalog", async (c) => {
  const offers = await versionedBillingOffers(c.env);
  const runtime = modelRuntime(c.env);
  return c.json({
    ...createCatalogCore({
      ...runtime,
      creatorPriceLabel: "$29.90 / month",
      creatorCredits: 2000,
      creatorPlanned: !offers.some((offer) => offer.configured),
      pricingOffers: offers,
    }),
    promotion: null,
    creditPacks: offers.filter((offer) => offer.kind === "credits"),
  });
});

app.onError((reason, c) => {
  console.error("worker-request-failed", { requestId: c.get("requestId"), reason });
  return errorResponse(c, 500, "INTERNAL_ERROR", "The request could not be completed.");
});

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/v1/")) return errorResponse(c, 404, "NOT_FOUND", "Route not found.");
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (!asset.headers.get("content-type")?.toLowerCase().includes("text/html")) return asset;
  const headers = new Headers(asset.headers);
  // Zone-level Web Analytics is independent of Worker code. no-transform keeps
  // the reviewed HTML immutable at the edge and prevents automatic beacon injection.
  headers.set("Cache-Control", "public, max-age=0, must-revalidate, no-transform");
  const canonicalUrl = publicCanonicalUrl(c.req.path, c.env.APP_BASE_URL);
  if (!canonicalUrl) return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });

  const html = rewritePublicCanonicalMetadata(await asset.text(), canonicalUrl);
  headers.delete("Content-Length");
  headers.delete("ETag");
  return new Response(html, { status: asset.status, statusText: asset.statusText, headers });
});

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    return app.fetch(request, env, executionContext);
  },
  scheduled(_controller: ScheduledController, env: Env, executionContext: ExecutionContext) {
    executionContext.waitUntil((async () => {
      try {
        await runMaintenance(env, handleStripeEvent);
      } catch (reason) {
        console.error("scheduled-maintenance-failed", {
          reason: reason instanceof Error ? reason.message : "unknown",
        });
      }
      try {
        await runOperationalAlerting(env);
      } catch (reason) {
        console.error("scheduled-alerting-failed", {
          reason: reason instanceof Error ? reason.message : "unknown",
        });
      }
    })());
  },
} satisfies ExportedHandler<Env>;
