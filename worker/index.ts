import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { renderGeneration } from "../server/generator.js";
import { createCatalogCore } from "../src/catalog.js";
import type {
  AccountSession,
  ApiKeyCreated,
  ApiKeySummary,
  ApiRequestLog,
  AspectRatio,
  BillingOffer,
  BillingSummary,
  CreditEntry,
  Generation,
  GenerationRequest,
  ImageQuality,
  ImageStyle,
  PricingPromotion,
  Project,
  SessionState,
  User,
} from "../src/types.js";
import {
  allOffers,
  billingConfigured,
  billingCredentialsConfigured,
  billingEnabled,
  stripeAccessConfigured,
  stripeWebhookConfigured,
  type BillingEnvironment,
} from "./offers.js";
import { createToken, hashPassword, hashToken, hexToBytes, hmacSha256, timingSafeEqual, verifyPassword } from "./security.js";

interface Env extends BillingEnvironment {
  DB: D1Database;
  ASSETS_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_BASE_URL: string;
  GENERATION_PROVIDER?: string;
  QWEN_MODEL_ID?: string;
  QWEN_API_BASE_URL?: string;
  DASHSCOPE_API_KEY?: string;
  QWEN_IMAGE_ALLOWED_HOSTS?: string;
  FREE_QUEUE_DELAY_MS?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

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
  anonymousSessionId: string | null;
  guestUsedCount: number;
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

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

const app = new Hono<WorkerContext>();
const encoder = new TextEncoder();
const GUEST_LIMIT = 3;
const SESSION_DAYS = 30;
const GUEST_DAYS = 30;
const PROMOTION_MINUTES = 10;
const billingOfferIds = ["creator_intro", "creator_monthly", "credits_100", "credits_300"] as const;
const validRatios: AspectRatio[] = ["1:1", "3:2", "16:9", "4:3", "9:16"];
const validStyles: ImageStyle[] = ["Photorealistic", "Editorial", "Cinematic", "Illustration"];
const validQualities: ImageQuality[] = ["Standard", "High", "Ultra"];
const qualityCosts: Record<ImageQuality, number> = { Standard: 1, High: 2, Ultra: 4 };

function now() {
  return new Date().toISOString();
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

function nextGuestReset() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function quotaDate() {
  return now().slice(0, 10);
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
  return c.json({ error: { code, message, requestId: c.get("requestId") } }, status as any);
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

async function readBody(c: Context<WorkerContext>) {
  return c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
}

async function resolveActor(c: Context<WorkerContext>, ensureGuest = true): Promise<Actor> {
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
        anonymousSessionId: null,
        guestUsedCount: 0,
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
        anonymousSessionId: null,
        guestUsedCount: 0,
        sessionId: row.session_id,
        apiKeyId: null,
        scopes: [],
      };
    }
    deleteCookie(c, "qwen_session", { path: "/" });
  }

  const guestToken = getCookie(c, "qwen_guest");
  if (guestToken) {
    const guestHash = await hashToken(guestToken);
    const guest = await c.env.DB.prepare("SELECT id, quota_date, used_count FROM anonymous_sessions WHERE token_hash = ? AND expires_at > ?")
      .bind(guestHash, now()).first<{ id: string; quota_date: string; used_count: number }>();
    if (guest) {
      let usedCount = guest.used_count;
      if (guest.quota_date !== quotaDate()) {
        usedCount = 0;
        await c.env.DB.prepare("UPDATE anonymous_sessions SET quota_date = ?, used_count = 0 WHERE id = ?").bind(quotaDate(), guest.id).run();
      }
      return { user: null, userRow: null, userId: null, anonymousSessionId: guest.id, guestUsedCount: usedCount, sessionId: null, apiKeyId: null, scopes: [] };
    }
    deleteCookie(c, "qwen_guest", { path: "/" });
  }

  if (!ensureGuest) return { user: null, userRow: null, userId: null, anonymousSessionId: null, guestUsedCount: 0, sessionId: null, apiKeyId: null, scopes: [] };
  const token = createToken();
  const id = crypto.randomUUID();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + GUEST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await c.env.DB.prepare("INSERT INTO anonymous_sessions (id, token_hash, quota_date, used_count, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(id, await hashToken(token), quotaDate(), expiresAt, createdAt).run();
  setPrivateCookie(c, "qwen_guest", token, GUEST_DAYS);
  return { user: null, userRow: null, userId: null, anonymousSessionId: id, guestUsedCount: 0, sessionId: null, apiKeyId: null, scopes: [] };
}

async function requireUser(c: Context<WorkerContext>) {
  const actor = await resolveActor(c, false);
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
  return account.plan === "creator" && (account.status === "active" || account.status === "trialing");
}

async function sessionState(env: Env, actor: Actor): Promise<SessionState> {
  if (actor.user && actor.userId) {
    const credits = await creditAccount(env, actor.userId);
    const vip = await isVip(env, actor.userId);
    return {
      user: actor.user,
      entitlements: {
        accountType: vip ? "creator" : "free",
        guestLimit: GUEST_LIMIT,
        guestRemaining: GUEST_LIMIT,
        credits: credits.available,
        reservedCredits: credits.reserved,
        guestResetsAt: nextGuestReset(),
        priorityGeneration: vip,
        watermarkedExports: !vip,
      },
    };
  }
  return {
    user: null,
    entitlements: {
      accountType: "guest",
      guestLimit: GUEST_LIMIT,
      guestRemaining: Math.max(0, GUEST_LIMIT - actor.guestUsedCount),
      credits: 0,
      reservedCredits: 0,
      guestResetsAt: nextGuestReset(),
      priorityGeneration: false,
      watermarkedExports: true,
    },
  };
}

async function ensurePromotion(env: Env, actor: Actor): Promise<PricingPromotion | null> {
  if (!actor.userId && !actor.anonymousSessionId) return null;
  const ownerColumn = actor.userId ? "user_id" : "anonymous_session_id";
  const ownerId = actor.userId ?? actor.anonymousSessionId!;
  let row = await env.DB.prepare(`SELECT starts_at, expires_at, redeemed_at FROM pricing_promotions WHERE ${ownerColumn} = ?`)
    .bind(ownerId).first<{ starts_at: string; expires_at: string; redeemed_at: string | null }>();
  if (!row) {
    const startsAt = now();
    const expiresAt = new Date(Date.now() + PROMOTION_MINUTES * 60 * 1000).toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO pricing_promotions (id, ${ownerColumn}, offer_id, starts_at, expires_at, created_at) VALUES (?, ?, 'creator_intro', ?, ?, ?)`)
      .bind(crypto.randomUUID(), ownerId, startsAt, expiresAt, startsAt).run();
    row = await env.DB.prepare(`SELECT starts_at, expires_at, redeemed_at FROM pricing_promotions WHERE ${ownerColumn} = ?`)
      .bind(ownerId).first<{ starts_at: string; expires_at: string; redeemed_at: string | null }>();
  }
  if (!row) return null;
  const offers = await versionedBillingOffers(env);
  const intro = offers.find((offer) => offer.id === "creator_intro");
  const standard = offers.find((offer) => offer.id === "creator_monthly");
  if (!intro || !standard) return null;
  return {
    offerId: "creator_intro",
    standardOfferId: "creator_monthly",
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    active: !row.redeemed_at && Date.parse(row.expires_at) > Date.now(),
    redeemed: Boolean(row.redeemed_at),
    standardAmountCents: standard.amountCents,
    promotionalAmountCents: intro.amountCents,
    currency: standard.currency,
  };
}

function billingPriceLabel(amountCents: number, kind: BillingOffer["kind"]) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(amountCents / 100);
  return kind === "subscription" ? `${amount} / month` : `${amount} one time`;
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
      priceLabel: billingPriceLabel(version.amount_cents, version.kind),
      configured: billingConfigured(env),
    };
  });
}

async function billingRuntimeConfigured(env: Env) {
  if (!billingConfigured(env)) return false;
  const versions = await activeBillingPriceVersions(env);
  return billingOfferIds.every((offerId) => versions.some((version) => version.offer_id === offerId));
}

async function migrateGuestData(env: Env, guestId: string | null, userId: string) {
  if (!guestId) return 0;
  const guestPromotion = await env.DB.prepare("SELECT * FROM pricing_promotions WHERE anonymous_session_id = ?").bind(guestId).first<Record<string, unknown>>();
  const userPromotion = await env.DB.prepare("SELECT id FROM pricing_promotions WHERE user_id = ?").bind(userId).first();
  const statements = [
    env.DB.prepare("UPDATE generations SET owner_user_id = ?, anonymous_session_id = NULL WHERE anonymous_session_id = ?").bind(userId, guestId),
  ];
  if (guestPromotion && !userPromotion) {
    statements.push(env.DB.prepare("UPDATE pricing_promotions SET user_id = ?, anonymous_session_id = NULL WHERE anonymous_session_id = ?").bind(userId, guestId));
  } else if (guestPromotion) {
    statements.push(env.DB.prepare("DELETE FROM pricing_promotions WHERE anonymous_session_id = ?").bind(guestId));
  }
  const results = await env.DB.batch(statements);
  return results[0].meta.changes ?? 0;
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
  const lifetime = purpose === "verify_email" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  await env.DB.prepare("INSERT INTO security_tokens (id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, purpose, await hashToken(token), new Date(Date.now() + lifetime).toISOString(), now()).run();
  return token;
}

async function sendAuthEmail(env: Env, input: { email: string; name: string; token: string; purpose: "verify_email" | "reset_password" }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const path = input.purpose === "verify_email" ? "/verify-email" : "/reset-password";
  const url = `${env.APP_BASE_URL.replace(/\/$/, "")}${path}?token=${encodeURIComponent(input.token)}`;
  const action = input.purpose === "verify_email" ? "Verify email" : "Reset password";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.email],
      subject: `${action} · Qwen Image 3.0`,
      html: `<p>Hello ${input.name.replace(/[<>&"']/g, "")},</p><p><a href="${url}">${action}</a>. This private link expires automatically.</p>`,
    }),
  });
  return response.ok;
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
  if (env.GENERATION_PROVIDER !== "qwen") {
    const result = renderGeneration(input);
    return { bytes: encoder.encode(result.svg), mimeType: "image/svg+xml", width: result.width, height: result.height, provider: "local-preview", model: "local-qwen-preview" };
  }
  if (!env.DASHSCOPE_API_KEY || !env.QWEN_API_BASE_URL) throw new Error("Qwen provider is not configured.");
  const dimensions = imageDimensions(input.quality, input.aspectRatio);
  const response = await fetch(`${env.QWEN_API_BASE_URL.replace(/\/$/, "")}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.QWEN_MODEL_ID || "qwen-image-2.0-pro",
      input: { messages: [{ role: "user", content: [{ text: `${input.prompt}\nVisual direction: ${input.style.toLowerCase()}.` }] }] },
      parameters: { size: `${dimensions.width}*${dimensions.height}`, n: 1, prompt_extend: true, watermark: false },
    }),
  });
  const payload = await response.json() as { code?: string; message?: string; output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> } };
  if (!response.ok) throw new Error(payload.message || "The Qwen provider rejected the generation.");
  const imageUrl = payload.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
  if (!imageUrl) throw new Error("The Qwen provider returned no image.");
  const parsed = new URL(imageUrl);
  const allowedHosts = (env.QWEN_IMAGE_ALLOWED_HOSTS || "aliyuncs.com").split(",").map((value) => value.trim().replace(/^\*\./, "")).filter(Boolean);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new Error("The Qwen provider returned an untrusted image location.");
  }
  const image = await fetch(parsed, { redirect: "error" });
  if (!image.ok) throw new Error("The generated image could not be downloaded.");
  const mimeType = (image.headers.get("content-type") || "").split(";")[0].toLowerCase();
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024 || !validImageSignature(bytes, mimeType)) throw new Error("The generated image did not pass asset validation.");
  return { bytes, mimeType, ...dimensions, provider: "alibaba-model-studio", model: env.QWEN_MODEL_ID || "qwen-image-2.0-pro" };
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}" data-export-watermark="free"><defs><pattern id="wm" width="${Math.max(280, font * 14)}" height="${Math.max(150, font * 7)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)"><text x="0" y="${font * 4}" fill="#fff" fill-opacity=".18" font-family="Arial,sans-serif" font-size="${font}" font-weight="700">QWEN IMAGE 3.0 · FREE</text></pattern></defs><image href="${source}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/><rect width="100%" height="100%" fill="url(#wm)"/><g transform="translate(${Math.max(16, safeWidth - 330)} ${Math.max(16, safeHeight - 72)})"><rect width="310" height="52" rx="26" fill="#080909" fill-opacity=".84" stroke="#fff" stroke-opacity=".24"/><circle cx="26" cy="26" r="8" fill="#8b5cf6"/><text x="48" y="33" fill="#fff" font-family="Arial,sans-serif" font-size="16" font-weight="700">Qwen Image 3.0 · Free export</text></g></svg>`;
}

async function stripeRequest<T>(env: Env, path: string, body?: URLSearchParams, method = "POST") {
  if (!stripeAccessConfigured(env) || !env.STRIPE_SECRET_KEY) throw new Error("Stripe API access is not configured.");
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `Stripe request failed with status ${response.status}.`);
  return payload;
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

async function verifyStripeSignature(secret: string, body: string, signature: string | undefined) {
  if (!signature) return false;
  const fields = signature.split(",").map((entry) => entry.split("="));
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || signatures.length === 0) return false;
  const expected = await hmacSha256(secret, `${timestamp}.${body}`);
  return signatures.some((value) => timingSafeEqual(expected, hexToBytes(value)));
}

async function addCredits(env: Env, input: { userId: string; amount: number; type: CreditEntry["type"]; referenceId: string; description: string }) {
  const account = await creditAccount(env, input.userId);
  const balance = account.available + input.amount;
  await env.DB.batch([
    env.DB.prepare("UPDATE credit_accounts SET available = ?, updated_at = ? WHERE user_id = ?").bind(balance, now(), input.userId),
    env.DB.prepare("INSERT OR IGNORE INTO credit_ledger (id, user_id, type, amount, balance_after, reference_id, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), input.userId, input.type, input.amount, balance, input.referenceId, input.description, now()),
  ]);
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

async function handleStripeEvent(env: Env, event: StripeEvent) {
  const object = event.data.object;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const sessionId = stripeObjectId(object.id);
    const order = await env.DB.prepare("SELECT * FROM billing_orders WHERE stripe_checkout_session_id = ?").bind(sessionId).first<BillingOrderRow>();
    if (!order) throw new Error("Stripe checkout does not match a local order.");
    if (order.status === "paid") return;
    if (order.kind === "credits") {
      const paymentIntent = stripeObjectId(object.payment_intent);
      if (object.payment_status !== "paid" || !paymentIntent) throw new Error("Credit checkout is not paid.");
      const existing = await env.DB.prepare("SELECT payment_intent_id FROM billing_payments WHERE payment_intent_id = ?").bind(paymentIntent).first();
      if (!existing) {
        await addCredits(env, { userId: order.user_id, amount: order.credits, type: "purchase_grant", referenceId: paymentIntent, description: `${order.credits}-credit Stripe purchase` });
        await env.DB.prepare("INSERT INTO billing_payments (payment_intent_id, user_id, billing_order_id, kind, credits_granted, amount_cents, currency, stripe_price_id, created_at, updated_at) VALUES (?, ?, ?, 'credits', ?, ?, ?, ?, ?, ?)")
          .bind(paymentIntent, order.user_id, order.id, order.credits, order.amount_cents, order.currency, order.stripe_price_id, now(), now()).run();
      }
      await env.DB.prepare("UPDATE billing_orders SET status = 'paid', payment_intent_id = ?, completed_at = ? WHERE id = ?").bind(paymentIntent, now(), order.id).run();
      return;
    }
    const customerId = stripeObjectId(object.customer);
    const subscriptionId = stripeObjectId(object.subscription);
    if (!customerId || !subscriptionId || !["paid", "no_payment_required"].includes(String(object.payment_status))) throw new Error("Subscription checkout is incomplete.");
    await env.DB.batch([
      env.DB.prepare("UPDATE billing_orders SET status = 'paid', completed_at = ? WHERE id = ?").bind(now(), order.id),
      env.DB.prepare("UPDATE billing_accounts SET stripe_customer_id = ?, stripe_subscription_id = ?, plan = 'creator', status = 'active', updated_at = ? WHERE user_id = ?")
        .bind(customerId, subscriptionId, now(), order.user_id),
      env.DB.prepare("UPDATE pricing_promotions SET redeemed_at = ? WHERE user_id = ? AND offer_id = 'creator_intro' AND ? = 'creator_intro'")
        .bind(now(), order.user_id, order.offer_id),
    ]);
    return;
  }

  if (event.type === "checkout.session.expired") {
    await env.DB.prepare("UPDATE billing_orders SET status = 'expired' WHERE stripe_checkout_session_id = ? AND status = 'pending'").bind(stripeObjectId(object.id)).run();
    return;
  }

  if (event.type === "invoice.paid") {
    const customerId = stripeObjectId(object.customer);
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
      || !allowedReasons.has(String(object.billing_reason)) || !priceVersion) throw new Error("Paid invoice failed the known Creator price-version contract.");
    const account = await env.DB.prepare("SELECT user_id, stripe_subscription_id FROM billing_accounts WHERE stripe_customer_id = ?").bind(customerId).first<{ user_id: string; stripe_subscription_id: string | null }>();
    if (!account || (account.stripe_subscription_id && account.stripe_subscription_id !== subscriptionId)) throw new Error("Paid invoice does not match a local subscription.");
    const existing = await env.DB.prepare("SELECT payment_intent_id FROM billing_payments WHERE payment_intent_id = ? OR invoice_id = ?").bind(paymentIntent, invoiceId).first();
    if (!existing) {
      await addCredits(env, { userId: account.user_id, amount: priceVersion.credits, type: "subscription_grant", referenceId: invoiceId, description: "Creator VIP monthly credits" });
      await env.DB.prepare("INSERT INTO billing_payments (payment_intent_id, user_id, invoice_id, kind, credits_granted, amount_cents, currency, stripe_price_id, created_at, updated_at) VALUES (?, ?, ?, 'subscription', ?, ?, ?, ?, ?, ?)")
        .bind(paymentIntent, account.user_id, invoiceId, priceVersion.credits, priceVersion.amount_cents, priceVersion.currency, priceVersion.stripe_price_id, now(), now()).run();
    }
    await env.DB.prepare("UPDATE billing_accounts SET stripe_subscription_id = ?, plan = 'creator', status = 'active', current_period_end = COALESCE(?, current_period_end), cancel_at_period_end = 0, spending_blocked = 0, block_reason = NULL, updated_at = ? WHERE user_id = ?")
      .bind(subscriptionId, periodEnd, now(), account.user_id).run();
    return;
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const paymentIntent = stripeObjectId(object.payment_intent);
    if (!paymentIntent) throw new Error("Financial reversal has no PaymentIntent.");
    const payment = await env.DB.prepare("SELECT user_id FROM billing_payments WHERE payment_intent_id = ?").bind(paymentIntent).first<{ user_id: string }>();
    if (!payment) throw new Error("Financial reversal has no local payment.");
    const status = event.type === "charge.refunded" ? "refunded" : "disputed";
    await env.DB.batch([
      env.DB.prepare("UPDATE billing_payments SET status = ?, financial_event_id = ?, updated_at = ? WHERE payment_intent_id = ?").bind(status, event.id, now(), paymentIntent),
      env.DB.prepare("UPDATE billing_orders SET financial_status = ?, financial_event_id = ? WHERE payment_intent_id = ?").bind(status, event.id, paymentIntent),
      env.DB.prepare("UPDATE billing_accounts SET spending_blocked = 1, block_reason = ?, updated_at = ? WHERE user_id = ?")
        .bind("Credit spending is paused while a Stripe refund or dispute is reviewed.", now(), payment.user_id),
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
    await env.DB.prepare("UPDATE billing_accounts SET stripe_subscription_id = COALESCE(?, stripe_subscription_id), plan = ?, status = ?, cancel_at_period_end = ?, updated_at = ? WHERE stripe_customer_id = ?")
      .bind(subscriptionId || null, status === "active" || status === "trialing" ? "creator" : "free", status, object.cancel_at_period_end ? 1 : 0, now(), customerId).run();
  }
}

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("X-Request-Id", requestId);
  c.header("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.stripe.com; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
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

app.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !c.req.header("authorization") && c.req.path !== "/api/billing/webhook") {
    const origin = c.req.header("origin");
    if (origin && origin.replace(/\/$/, "") !== c.env.APP_BASE_URL.replace(/\/$/, "")) {
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
  const limited = await enforceRateLimit(c, "web-generation", 30, 60 * 1000);
  if (limited) return limited;
  await next();
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

app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  const providerConfigured = c.env.GENERATION_PROVIDER !== "qwen" || Boolean(c.env.DASHSCOPE_API_KEY && c.env.QWEN_API_BASE_URL);
  const priceCatalogConfigured = (await activeBillingPriceVersions(c.env)).length === billingOfferIds.length;
  return c.json({
    status: providerConfigured ? "ok" : "degraded",
    database: "cloudflare-d1",
    objectStorage: "cloudflare-r2",
    generator: c.env.QWEN_MODEL_ID || "local-qwen-preview",
    provider: c.env.GENERATION_PROVIDER === "qwen" ? "alibaba-model-studio" : "local-preview",
    providerConfigured,
    auth: "session-cookie",
    oauth: { google: false, github: false },
    email: { provider: c.env.RESEND_API_KEY ? "resend" : "none", configured: Boolean(c.env.RESEND_API_KEY && c.env.EMAIL_FROM) },
    billing: {
      provider: "stripe",
      enabled: billingEnabled(c.env),
      configured: billingConfigured(c.env) && priceCatalogConfigured,
      credentialsConfigured: billingCredentialsConfigured(c.env),
      webhookConfigured: stripeWebhookConfigured(c.env),
      priceCatalogConfigured,
    },
    credits: "d1-ledger",
  });
});

app.get("/api/session", async (c) => c.json(await sessionState(c.env, await resolveActor(c))));

app.get("/api/auth/methods", (c) => c.json({ password: true, google: false, github: false }));

app.post("/api/auth/register", async (c) => {
  const body = await readBody(c);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (name.length < 2 || name.length > 60) return errorResponse(c, 400, "INVALID_NAME", "Name must be between 2 and 60 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse(c, 400, "INVALID_EMAIL", "Enter a valid email address.");
  if (!passwordIsStrong(password)) return errorResponse(c, 400, "WEAK_PASSWORD", "Password must be at least 8 characters and include a letter and a number.");
  if (await c.env.DB.prepare("SELECT 1 FROM users WHERE email_normalized = ?").bind(email).first()) return errorResponse(c, 409, "EMAIL_IN_USE", "An account with this email already exists.");
  const guest = await resolveActor(c);
  const id = crypto.randomUUID();
  const createdAt = now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO users (id, name, email_normalized, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, name, email, await hashPassword(password), createdAt, createdAt),
    c.env.DB.prepare("INSERT INTO credit_accounts (user_id, available, reserved, updated_at) VALUES (?, 0, 0, ?)").bind(id, createdAt),
    c.env.DB.prepare("INSERT INTO billing_accounts (user_id, updated_at) VALUES (?, ?)").bind(id, createdAt),
  ]);
  const migratedGenerations = await migrateGuestData(c.env, guest.anonymousSessionId, id);
  const sessionId = await createSession(c, id);
  const row = (await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>())!;
  const token = await createSecurityToken(c.env, id, "verify_email");
  const delivered = await sendAuthEmail(c.env, { email, name, token, purpose: "verify_email" });
  const actor: Actor = { user: publicUser(row), userRow: row, userId: id, anonymousSessionId: null, guestUsedCount: 0, sessionId, apiKeyId: null, scopes: [] };
  return c.json({ ...(await sessionState(c.env, actor)), migratedGenerations, verification: { delivered, delivery: delivered ? "resend" : "none" } }, 201);
});

app.post("/api/auth/login", async (c) => {
  const body = await readBody(c);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE email_normalized = ?").bind(email).first<UserRow>();
  if (!row || !(await verifyPassword(password, row.password_hash))) return errorResponse(c, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  const guest = await resolveActor(c);
  const migratedGenerations = await migrateGuestData(c.env, guest.anonymousSessionId, row.id);
  const sessionId = await createSession(c, row.id);
  const actor: Actor = { user: publicUser(row), userRow: row, userId: row.id, anonymousSessionId: null, guestUsedCount: 0, sessionId, apiKeyId: null, scopes: [] };
  return c.json({ ...(await sessionState(c.env, actor)), migratedGenerations });
});

app.post("/api/auth/logout", async (c) => {
  const actor = await resolveActor(c, false);
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
  const account = await creditAccount(c.env, row.user_id);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE security_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(timestamp, row.id),
    c.env.DB.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?").bind(timestamp, timestamp, row.user_id),
    c.env.DB.prepare("UPDATE credit_accounts SET available = CASE WHEN available = 0 THEN 20 ELSE available END, updated_at = ? WHERE user_id = ?").bind(timestamp, row.user_id),
    ...(account.available === 0 ? [c.env.DB.prepare("INSERT OR IGNORE INTO credit_ledger (id, user_id, type, amount, balance_after, reference_id, description, created_at) VALUES (?, ?, 'signup_grant', 20, 20, 'email-verification', 'Verified account starter credits', ?)")
      .bind(crypto.randomUUID(), row.user_id, timestamp)] : []),
  ]);
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
  const [projects, generations, ledger, orders] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM projects WHERE user_id = ?").bind(actor.userId).all(),
    c.env.DB.prepare("SELECT id, prompt, aspect_ratio, style, quality, status, provider, model, credit_cost, created_at FROM generations WHERE owner_user_id = ?").bind(actor.userId).all(),
    c.env.DB.prepare("SELECT * FROM credit_ledger WHERE user_id = ?").bind(actor.userId).all(),
    c.env.DB.prepare("SELECT id, offer_id, kind, credits, amount_cents, currency, status, financial_status, created_at, completed_at FROM billing_orders WHERE user_id = ?").bind(actor.userId).all(),
  ]);
  c.header("Content-Disposition", `attachment; filename="qwen-image-account-${now().slice(0, 10)}.json"`);
  return c.json({ exportedAt: now(), user: actor.user, projects: projects.results, generations: generations.results, creditLedger: ledger.results, billingOrders: orders.results });
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
  if (account.stripe_customer_id) {
    if (!stripeAccessConfigured(c.env)) return errorResponse(c, 503, "BILLING_CLEANUP_UNAVAILABLE", "Account deletion is paused until Stripe cleanup is available.");
    await stripeRequest(c.env, `/v1/customers/${encodeURIComponent(account.stripe_customer_id)}`, undefined, "DELETE");
  }
  const assets = await c.env.DB.prepare("SELECT r2_key FROM generations WHERE owner_user_id = ? AND r2_key IS NOT NULL").bind(actor.userId).all<{ r2_key: string }>();
  await Promise.all(assets.results.map((asset) => c.env.ASSETS_BUCKET.delete(asset.r2_key)));
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(actor.userId).run();
  deleteCookie(c, "qwen_session", { path: "/" });
  deleteCookie(c, "qwen_guest", { path: "/" });
  return c.body(null, 204);
});

app.get("/api/billing", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const account = await billingAccount(c.env, actor.userId!);
  const ordersResult = await c.env.DB.prepare("SELECT * FROM billing_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").bind(actor.userId).all<BillingOrderRow>();
  const offers = await versionedBillingOffers(c.env);
  const response: BillingSummary = {
    configured: await billingRuntimeConfigured(c.env),
    promotion: await ensurePromotion(c.env, actor),
    account: {
      plan: account.plan,
      status: account.status,
      currentPeriodEnd: account.current_period_end,
      cancelAtPeriodEnd: Boolean(account.cancel_at_period_end),
      hasCustomer: Boolean(account.stripe_customer_id),
      spendingBlocked: Boolean(account.spending_blocked),
      blockReason: account.block_reason,
    },
    offers: offers.filter((offer) => offer.id !== "creator_intro"),
    orders: ordersResult.results.map((order) => ({
      id: order.id, offerId: order.offer_id, kind: order.kind, credits: order.credits, amountCents: order.amount_cents, currency: order.currency,
      status: order.status, financialStatus: order.financial_status, createdAt: order.created_at, completedAt: order.completed_at,
    })),
  };
  return c.json(response);
});

app.post("/api/billing/checkout", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  if (!actor.user!.emailVerified) return errorResponse(c, 403, "EMAIL_NOT_VERIFIED", "Verify your email before starting a purchase.");
  if (!(await billingRuntimeConfigured(c.env))) return errorResponse(c, 503, "BILLING_UNAVAILABLE", "Billing is disabled or not fully configured.");
  const body = await readBody(c);
  const offer = (await versionedBillingOffers(c.env)).find((candidate) => candidate.id === body.offerId);
  if (!offer) return errorResponse(c, 400, "INVALID_OFFER", "Choose a valid billing offer.");
  if (!offer.configured) return errorResponse(c, 503, "OFFER_UNAVAILABLE", "This billing offer is not configured.");
  const account = await billingAccount(c.env, actor.userId!);
  if (offer.kind === "subscription" && account.plan === "creator" && ["active", "trialing"].includes(account.status)) {
    return errorResponse(c, 409, "ALREADY_SUBSCRIBED", "Manage your active Creator subscription in the billing portal.");
  }
  if (offer.id === "creator_intro" && !(await ensurePromotion(c.env, actor))?.active) {
    return errorResponse(c, 409, "PROMOTION_EXPIRED", "The $8 launch window has ended. Creator VIP is now $10 per month.");
  }
  let customerId = account.stripe_customer_id;
  const priceVersion = await activeBillingPriceVersion(c.env, offer.id);
  if (!priceVersion) return errorResponse(c, 503, "OFFER_UNAVAILABLE", "This billing offer has no active price version.");
  if (!customerId) {
    const params = new URLSearchParams({ email: actor.user!.email, name: actor.user!.name, "metadata[user_id]": actor.userId! });
    const customer = await stripeRequest<{ id?: string }>(c.env, "/v1/customers", params);
    if (!customer.id?.startsWith("cus_")) return errorResponse(c, 502, "STRIPE_RESPONSE_INVALID", "Stripe did not return a customer.");
    customerId = customer.id;
    await c.env.DB.prepare("UPDATE billing_accounts SET stripe_customer_id = ?, updated_at = ? WHERE user_id = ?").bind(customerId, now(), actor.userId).run();
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
  });
  if (offer.kind === "subscription") {
    params.set("subscription_data[metadata][user_id]", actor.userId!);
    params.set("subscription_data[metadata][offer_id]", offer.id);
  } else {
    params.set("payment_intent_data[metadata][user_id]", actor.userId!);
    params.set("payment_intent_data[metadata][offer_id]", offer.id);
  }
  const checkout = await stripeRequest<{ id?: string; url?: string }>(c.env, "/v1/checkout/sessions", params);
  if (!checkout.id?.startsWith("cs_") || !checkout.url || new URL(checkout.url).hostname !== "checkout.stripe.com") {
    return errorResponse(c, 502, "STRIPE_RESPONSE_INVALID", "Stripe did not return a valid Checkout Session.");
  }
  await c.env.DB.prepare("INSERT INTO billing_orders (id, user_id, stripe_checkout_session_id, offer_id, kind, credits, amount_cents, currency, stripe_price_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor.userId, checkout.id, offer.id, offer.kind, offer.credits, offer.amountCents, offer.currency, priceVersion.stripe_price_id, now()).run();
  return c.json({ url: checkout.url }, 201);
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
  if (!portal.url || new URL(portal.url).hostname !== "billing.stripe.com") return errorResponse(c, 502, "STRIPE_RESPONSE_INVALID", "Stripe did not return a valid portal URL.");
  return c.json({ url: portal.url });
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
    return errorResponse(c, 503, "WEBHOOK_PROCESSING_FAILED", message);
  }
});

app.get("/api/generations", async (c) => {
  const actor = await resolveActor(c);
  const limit = Math.min(50, Math.max(1, Number.parseInt(c.req.query("limit") || "8", 10) || 8));
  const projectId = c.req.query("projectId") || null;
  const ownerColumn = actor.userId ? "owner_user_id" : "anonymous_session_id";
  const ownerId = actor.userId ?? actor.anonymousSessionId;
  const result = await c.env.DB.prepare(`SELECT * FROM generations WHERE ${ownerColumn} = ? ${projectId ? "AND project_id = ?" : ""} ORDER BY created_at DESC LIMIT ?`)
    .bind(...(projectId ? [ownerId, projectId, limit] : [ownerId, limit])).all<GenerationRow>();
  return c.json({ generations: result.results.map(generationFromRow) });
});

async function generationHandler(c: Context<WorkerContext>, apiOnly: boolean) {
  const started = Date.now();
  const actor = await resolveActor(c, !apiOnly);
  if (apiOnly && (!actor.user || !actor.apiKeyId)) return errorResponse(c, 401, "INVALID_API_KEY", "Provide a valid API key in the Authorization header.");
  if (apiOnly && !actor.scopes.includes("generations:write")) return errorResponse(c, 403, "INSUFFICIENT_SCOPE", "This API key does not have generations:write access.");
  const body = await readBody(c);
  const normalized = apiOnly ? {
    prompt: body.prompt,
    aspectRatio: body.aspect_ratio,
    style: typeof body.style === "string" ? body.style.replace(/^./, (value) => value.toUpperCase()) : "Photorealistic",
    quality: typeof body.quality === "string" ? body.quality.replace(/^./, (value) => value.toUpperCase()) : "High",
    projectId: body.project_id,
  } : body;
  const input = validateGeneration(normalized);
  if (!input) return errorResponse(c, 400, "INVALID_REQUEST", "Prompt or generation settings are invalid.");
  if (input.projectId) {
    const owns = actor.userId && await c.env.DB.prepare("SELECT 1 FROM projects WHERE id = ? AND user_id = ?").bind(input.projectId, actor.userId).first();
    if (!owns) return errorResponse(c, 400, "INVALID_PROJECT", "Choose a project that belongs to your account.");
  }
  const idempotencyKey = c.req.header("idempotency-key")?.trim() || "";
  if (apiOnly && idempotencyKey && actor.userId) {
    if (idempotencyKey.length > 128) return errorResponse(c, 400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 128 characters or fewer.");
    const existing = await c.env.DB.prepare("SELECT g.* FROM idempotency_keys i JOIN generations g ON g.id = i.generation_id WHERE i.user_id = ? AND i.idempotency_key = ?")
      .bind(actor.userId, idempotencyKey).first<GenerationRow>();
    if (existing) return c.json(generationFromRow(existing));
  }
  const vip = await isVip(c.env, actor.userId);
  const queueTier = vip ? "vip" : "free";
  const generationId = crypto.randomUUID();
  const creditCost = actor.userId ? qualityCosts[input.quality] : 0;
  const timestamp = now();
  if (actor.userId) {
    const billing = await billingAccount(c.env, actor.userId);
    if (billing.spending_blocked) return errorResponse(c, 423, "BILLING_REVIEW_REQUIRED", billing.block_reason || "Credit spending is paused.");
    const credits = await creditAccount(c.env, actor.userId);
    if (credits.available < creditCost) return errorResponse(c, 402, "INSUFFICIENT_CREDITS", `This generation costs ${creditCost} credits.`);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE credit_accounts SET available = available - ?, reserved = reserved + ?, updated_at = ? WHERE user_id = ? AND available >= ?")
        .bind(creditCost, creditCost, timestamp, actor.userId, creditCost),
      c.env.DB.prepare("INSERT INTO credit_ledger (id, user_id, type, amount, balance_after, reference_id, description, created_at) VALUES (?, ?, 'generation_reservation', ?, ?, ?, 'Generation credit reservation', ?)")
        .bind(crypto.randomUUID(), actor.userId, -creditCost, credits.available - creditCost, generationId, timestamp),
    ]);
  } else if (actor.anonymousSessionId) {
    const quota = await c.env.DB.prepare("UPDATE anonymous_sessions SET used_count = used_count + 1 WHERE id = ? AND quota_date = ? AND used_count < ?")
      .bind(actor.anonymousSessionId, quotaDate(), GUEST_LIMIT).run();
    if (!quota.meta.changes) return errorResponse(c, 429, "ANONYMOUS_LIMIT_REACHED", "You have used today's three free generations. Sign up for 20 credits or return tomorrow.");
  } else {
    return errorResponse(c, 401, "UNAUTHENTICATED", "A session is required to generate an image.");
  }
  await c.env.DB.prepare(`INSERT INTO generations
    (id, owner_user_id, anonymous_session_id, project_id, prompt, aspect_ratio, style, quality, status, provider, model, credit_cost, queue_tier, queued_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?)`)
    .bind(generationId, actor.userId, actor.anonymousSessionId, input.projectId || null, input.prompt, input.aspectRatio, input.style, input.quality,
      c.env.GENERATION_PROVIDER === "qwen" ? "alibaba-model-studio" : "local-preview", c.env.QWEN_MODEL_ID || "local-qwen-preview", creditCost, queueTier, timestamp, timestamp, timestamp).run();
  if (apiOnly && idempotencyKey && actor.userId) {
    await c.env.DB.prepare("INSERT INTO idempotency_keys (user_id, idempotency_key, generation_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(actor.userId, idempotencyKey, generationId, timestamp).run();
  }
  try {
    if (!vip) {
      const delay = Math.min(10_000, Math.max(0, Number.parseInt(c.env.FREE_QUEUE_DELAY_MS || "1800", 10) || 1800));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const asset = await generateAsset(c.env, input);
    const extension = asset.mimeType === "image/svg+xml" ? "svg" : asset.mimeType === "image/jpeg" ? "jpg" : asset.mimeType === "image/webp" ? "webp" : "png";
    const key = `generations/${actor.userId ? `users/${actor.userId}` : `guests/${actor.anonymousSessionId}`}/${generationId}.${extension}`;
    await c.env.ASSETS_BUCKET.put(key, asset.bytes, {
      httpMetadata: { contentType: asset.mimeType, cacheControl: "private, no-store" },
      customMetadata: { generationId, ownerType: actor.userId ? "user" : "guest" },
    });
    await c.env.DB.prepare("UPDATE generations SET status = 'complete', width = ?, height = ?, r2_key = ?, mime_type = ?, provider = ?, model = ?, processing_started_at = ?, updated_at = ? WHERE id = ?")
      .bind(asset.width, asset.height, key, asset.mimeType, asset.provider, asset.model, timestamp, now(), generationId).run();
    if (actor.userId) {
      const credits = await creditAccount(c.env, actor.userId);
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE credit_accounts SET reserved = MAX(0, reserved - ?), updated_at = ? WHERE user_id = ?").bind(creditCost, now(), actor.userId),
        c.env.DB.prepare("INSERT INTO credit_ledger (id, user_id, type, amount, balance_after, reference_id, description, created_at) VALUES (?, ?, 'generation_settlement', 0, ?, ?, 'Generation completed', ?)")
          .bind(crypto.randomUUID(), actor.userId, credits.available, generationId, now()),
      ]);
    }
    const row = (await c.env.DB.prepare("SELECT * FROM generations WHERE id = ?").bind(generationId).first<GenerationRow>())!;
    c.header("X-Generation-Queue", queueTier);
    if (apiOnly && actor.userId && actor.apiKeyId) {
      await c.env.DB.prepare("INSERT INTO api_request_logs (id, user_id, api_key_id, method, path, status_code, duration_ms, request_id, created_at) VALUES (?, ?, ?, 'POST', '/v1/generations', 201, ?, ?, ?)")
        .bind(crypto.randomUUID(), actor.userId, actor.apiKeyId, Date.now() - started, c.get("requestId"), now()).run();
    }
    return c.json(generationFromRow(row), 201);
  } catch (reason) {
    await c.env.DB.prepare("UPDATE generations SET status = 'failed', updated_at = ? WHERE id = ?").bind(now(), generationId).run();
    if (actor.userId) {
      const credits = await creditAccount(c.env, actor.userId);
      const restored = credits.available + creditCost;
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE credit_accounts SET available = available + ?, reserved = MAX(0, reserved - ?), updated_at = ? WHERE user_id = ?").bind(creditCost, creditCost, now(), actor.userId),
        c.env.DB.prepare("INSERT INTO credit_ledger (id, user_id, type, amount, balance_after, reference_id, description, created_at) VALUES (?, ?, 'generation_refund', ?, ?, ?, 'Failed generation credit restoration', ?)")
          .bind(crypto.randomUUID(), actor.userId, creditCost, restored, generationId, now()),
      ]);
    } else if (actor.anonymousSessionId) {
      await c.env.DB.prepare("UPDATE anonymous_sessions SET used_count = MAX(0, used_count - 1) WHERE id = ? AND quota_date = ?").bind(actor.anonymousSessionId, quotaDate()).run();
    }
    return errorResponse(c, 503, "GENERATION_FAILED", reason instanceof Error ? reason.message : "The image could not be generated. No allowance or credits were charged.");
  }
}

app.post("/api/generations", (c) => generationHandler(c, false));
app.post("/v1/generations", (c) => generationHandler(c, true));

async function generationAsset(c: Context<WorkerContext>, download: boolean) {
  const actor = await resolveActor(c, false);
  const row = await c.env.DB.prepare("SELECT * FROM generations WHERE id = ?").bind(c.req.param("id")).first<GenerationRow>();
  if (!row || (row.owner_user_id !== actor.userId && row.anonymous_session_id !== actor.anonymousSessionId) || !row.r2_key) {
    return errorResponse(c, 404, "NOT_FOUND", "Image not found.");
  }
  const object = await c.env.ASSETS_BUCKET.get(row.r2_key);
  if (!object) return errorResponse(c, 404, "NOT_FOUND", "Image not found.");
  const bytes = new Uint8Array(await object.arrayBuffer());
  const vip = await isVip(c.env, actor.userId);
  const sourceMime = row.mime_type || object.httpMetadata?.contentType || "application/octet-stream";
  const data = vip ? bytes : encoder.encode(watermarkedSvg(bytes, sourceMime, row.width, row.height));
  const mimeType = vip ? sourceMime : "image/svg+xml";
  const extension = vip ? sourceMime === "image/jpeg" ? "jpg" : sourceMime === "image/webp" ? "webp" : sourceMime === "image/svg+xml" ? "svg" : "png" : "svg";
  c.header("Content-Type", `${mimeType}${mimeType === "image/svg+xml" ? "; charset=utf-8" : ""}`);
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Cookie, Authorization");
  c.header("X-Export-Tier", vip ? "vip" : "free");
  c.header("X-Export-Watermarked", vip ? "false" : "true");
  c.header("Content-Disposition", `${download ? "attachment" : "inline"}; filename="qwen-image-3-${row.id}-${vip ? "original" : "watermarked"}.${extension}"`);
  return c.body(data);
}

app.get("/api/generations/:id/image", (c) => generationAsset(c, false));
app.get("/api/generations/:id/download", (c) => generationAsset(c, true));

app.delete("/api/generations/:id", async (c) => {
  const actor = await resolveActor(c, false);
  const row = await c.env.DB.prepare("SELECT r2_key FROM generations WHERE id = ? AND ((owner_user_id = ? AND ? IS NOT NULL) OR (anonymous_session_id = ? AND ? IS NOT NULL))")
    .bind(c.req.param("id"), actor.userId, actor.userId, actor.anonymousSessionId, actor.anonymousSessionId).first<{ r2_key: string | null }>();
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

function projectFromRow(row: { id: string; name: string; description: string; archived: number; created_at: string; generation_count: number | null }): Project {
  return { id: row.id, name: row.name, description: row.description, archived: Boolean(row.archived), createdAt: row.created_at, generationCount: row.generation_count || 0 };
}

app.get("/api/projects", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const rows = await c.env.DB.prepare(`SELECT p.*, COUNT(g.id) AS generation_count FROM projects p
    LEFT JOIN generations g ON g.project_id = p.id WHERE p.user_id = ? GROUP BY p.id ORDER BY p.updated_at DESC`).bind(actor.userId).all<any>();
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
    .bind(c.req.param("id")).first<any>();
  return c.json(projectFromRow(row));
});

app.get("/api/credits", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const account = await creditAccount(c.env, actor.userId!);
  const rows = await c.env.DB.prepare("SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(actor.userId).all<any>();
  const ledger: CreditEntry[] = rows.results.map((row) => ({
    id: row.id, type: row.type, amount: row.amount, balanceAfter: row.balance_after, referenceId: row.reference_id, description: row.description, createdAt: row.created_at,
  }));
  return c.json({ account, ledger });
});

app.get("/api/api-keys", async (c) => {
  const actor = await requireUser(c);
  if (!actor) return errorResponse(c, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const rows = await c.env.DB.prepare("SELECT id, name, prefix, last_used_at, scopes, created_at FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC").bind(actor.userId).all<any>();
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
  const rows = await c.env.DB.prepare("SELECT * FROM api_request_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(actor.userId).all<any>();
  const requests: ApiRequestLog[] = rows.results.map((row) => ({
    id: row.id, userId: row.user_id, apiKeyId: row.api_key_id, method: row.method, path: row.path, statusCode: row.status_code, durationMs: row.duration_ms, requestId: row.request_id, createdAt: row.created_at,
  }));
  return c.json({ requests });
});

app.get("/api/catalog", async (c) => {
  const actor = await resolveActor(c);
  const offers = await versionedBillingOffers(c.env);
  const creatorOffer = offers.find((offer) => offer.id === "creator_monthly");
  const billingReady = await billingRuntimeConfigured(c.env);
  const providerId = c.env.GENERATION_PROVIDER === "qwen" ? "alibaba-model-studio" : "local-preview";
  return c.json({
    ...createCatalogCore({
      providerId,
      providerModel: c.env.QWEN_MODEL_ID || (providerId === "alibaba-model-studio" ? "qwen-image-2.0-pro" : "local-qwen-preview"),
      providerConfigured: providerId === "local-preview" || Boolean(c.env.DASHSCOPE_API_KEY && c.env.QWEN_API_BASE_URL),
      creatorPriceLabel: creatorOffer?.priceLabel ?? "$10 / month",
      creatorCredits: creatorOffer?.credits ?? 300,
      creatorPlanned: !billingReady,
    }),
    promotion: await ensurePromotion(c.env, actor),
    creditPacks: offers.filter((offer) => offer.kind === "credits"),
  });
});

app.onError((reason, c) => {
  console.error("worker-request-failed", { requestId: c.get("requestId"), reason });
  return errorResponse(c, 500, "INTERNAL_ERROR", "The request could not be completed.");
});

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/v1/")) return errorResponse(c, 404, "NOT_FOUND", "Route not found.");
  return c.env.ASSETS.fetch(c.req.raw);
});

async function retryFailedBillingEvents(env: Env) {
  const failed = await env.DB.prepare(`SELECT stripe_event_id, payload_json FROM billing_events
    WHERE status = 'failed' AND attempts < 8 ORDER BY updated_at ASC LIMIT 10`)
    .all<{ stripe_event_id: string; payload_json: string }>();
  for (const row of failed.results) {
    const claimed = await env.DB.prepare(`UPDATE billing_events SET status = 'processing', attempts = attempts + 1,
      last_error = NULL, processing_started_at = ?, updated_at = ?
      WHERE stripe_event_id = ? AND status = 'failed'`)
      .bind(now(), now(), row.stripe_event_id).run();
    if (!claimed.meta.changes) continue;
    try {
      const event = JSON.parse(row.payload_json) as StripeEvent;
      if (event.id !== row.stripe_event_id || !event.type || !event.data?.object) {
        throw new Error("Stored Stripe event is incomplete.");
      }
      await handleStripeEvent(env, event);
      await env.DB.prepare(`UPDATE billing_events SET status = 'completed', completed_at = ?, updated_at = ?
        WHERE stripe_event_id = ?`).bind(now(), now(), row.stripe_event_id).run();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Stripe event could not be retried.";
      await env.DB.prepare(`UPDATE billing_events SET status = 'failed', last_error = ?, updated_at = ?
        WHERE stripe_event_id = ?`).bind(message, now(), row.stripe_event_id).run();
    }
  }
}

async function runMaintenance(env: Env) {
  const timestamp = now();
  const guestCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const processingCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await retryFailedBillingEvents(env);
  const guestAssets = await env.DB.prepare("SELECT id, r2_key FROM generations WHERE anonymous_session_id IS NOT NULL AND created_at < ?")
    .bind(guestCutoff).all<{ id: string; r2_key: string | null }>();
  await Promise.all(guestAssets.results.flatMap((row) => row.r2_key ? [env.ASSETS_BUCKET.delete(row.r2_key)] : []));
  if (guestAssets.results.length) {
    await env.DB.batch(guestAssets.results.map((row) => env.DB.prepare("DELETE FROM generations WHERE id = ?").bind(row.id)));
  }

  const stale = await env.DB.prepare("SELECT id, owner_user_id, anonymous_session_id, credit_cost, created_at FROM generations WHERE status = 'processing' AND updated_at < ?")
    .bind(processingCutoff).all<{ id: string; owner_user_id: string | null; anonymous_session_id: string | null; credit_cost: number; created_at: string }>();
  for (const generation of stale.results) {
    if (generation.owner_user_id) {
      const account = await creditAccount(env, generation.owner_user_id);
      await env.DB.batch([
        env.DB.prepare(`UPDATE credit_accounts SET available = available + ?, reserved = MAX(0, reserved - ?), updated_at = ?
          WHERE user_id = ? AND EXISTS (SELECT 1 FROM generations WHERE id = ? AND status = 'processing')`)
          .bind(generation.credit_cost, generation.credit_cost, timestamp, generation.owner_user_id, generation.id),
        env.DB.prepare(`INSERT OR IGNORE INTO credit_ledger (id, user_id, type, amount, balance_after, reference_id, description, created_at)
          SELECT ?, ?, 'generation_refund', ?, ?, ?, 'Stale generation credit restoration', ?
          WHERE EXISTS (SELECT 1 FROM generations WHERE id = ? AND status = 'processing')`)
          .bind(crypto.randomUUID(), generation.owner_user_id, generation.credit_cost, account.available + generation.credit_cost, generation.id, timestamp, generation.id),
        env.DB.prepare("UPDATE generations SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'processing'").bind(timestamp, generation.id),
      ]);
    } else if (generation.anonymous_session_id) {
      await env.DB.batch([
        env.DB.prepare(`UPDATE anonymous_sessions SET used_count = CASE WHEN quota_date = ? THEN MAX(0, used_count - 1) ELSE used_count END
          WHERE id = ? AND EXISTS (SELECT 1 FROM generations WHERE id = ? AND status = 'processing')`)
          .bind(generation.created_at.slice(0, 10), generation.anonymous_session_id, generation.id),
        env.DB.prepare("UPDATE generations SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'processing'").bind(timestamp, generation.id),
      ]);
    }
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(timestamp),
    env.DB.prepare("DELETE FROM security_tokens WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(timestamp),
    env.DB.prepare("DELETE FROM rate_limit_buckets WHERE reset_at <= ?").bind(Date.now()),
    env.DB.prepare("DELETE FROM idempotency_keys WHERE created_at < ?").bind(guestCutoff),
    env.DB.prepare("DELETE FROM anonymous_sessions WHERE expires_at <= ?").bind(timestamp),
  ]);
}

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    return app.fetch(request, env, executionContext);
  },
  scheduled(_controller: ScheduledController, env: Env, executionContext: ExecutionContext) {
    executionContext.waitUntil(runMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
