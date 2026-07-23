import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ApiKeySummary,
  ApiRequestLog,
  AspectRatio,
  BillingOffer,
  BillingSummary,
  CreditEntry,
  Generation,
  GenerationQueueTier,
  ImageQuality,
  ImageStyle,
  Project,
  User,
} from "../src/types.js";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/qwenimage.db");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL;");
database.exec("PRAGMA foreign_keys = ON;");
database.exec("PRAGMA busy_timeout = 5000;");

database.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS anonymous_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    quota_date TEXT NOT NULL,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credit_accounts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    available INTEGER NOT NULL DEFAULT 0 CHECK(available >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credit_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_id TEXT,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    secret_hash TEXT NOT NULL UNIQUE,
    last_used_at TEXT,
    revoked_at TEXT,
    scopes TEXT NOT NULL DEFAULT 'generations:write',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS idempotency_keys (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    generation_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    aspect_ratio TEXT NOT NULL,
    style TEXT NOT NULL,
    quality TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('processing', 'complete', 'failed')),
    width INTEGER,
    height INTEGER,
    image_svg TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS security_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK(purpose IN ('verify_email', 'reset_password')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oauth_identities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK(provider IN ('google', 'github')),
    provider_subject TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(provider, provider_subject)
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK(provider IN ('google', 'github')),
    code_verifier TEXT NOT NULL,
    anonymous_session_id TEXT REFERENCES anonymous_sessions(id) ON DELETE SET NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS billing_accounts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'creator')),
    status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('inactive', 'active', 'trialing', 'past_due', 'canceled')),
    current_period_end TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    spending_blocked INTEGER NOT NULL DEFAULT 0,
    block_reason TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS billing_price_versions (
    stripe_price_id TEXT PRIMARY KEY,
    offer_id TEXT NOT NULL CHECK(offer_id IN ('creator_intro', 'creator_monthly', 'credits_100', 'credits_300')),
    kind TEXT NOT NULL CHECK(kind IN ('subscription', 'credits')),
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    currency TEXT NOT NULL CHECK(currency = 'usd'),
    credits INTEGER NOT NULL CHECK(credits > 0),
    active_for_checkout INTEGER NOT NULL DEFAULT 0 CHECK(active_for_checkout IN (0, 1)),
    effective_from TEXT NOT NULL,
    retired_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS billing_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_checkout_session_id TEXT NOT NULL UNIQUE,
    offer_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('subscription', 'credits')),
    credits INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'expired')),
    payment_intent_id TEXT,
    stripe_price_id TEXT,
    financial_status TEXT NOT NULL DEFAULT 'normal',
    financial_event_id TEXT,
    financial_updated_at TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS billing_events (
    stripe_event_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    processed_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    attempts INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT,
    last_error TEXT,
    processing_started_at TEXT,
    completed_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS billing_payments (
    payment_intent_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    billing_order_id TEXT REFERENCES billing_orders(id) ON DELETE SET NULL,
    invoice_id TEXT UNIQUE,
    kind TEXT NOT NULL CHECK(kind IN ('subscription', 'credits')),
    credits_granted INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid', 'refunded', 'disputed')),
    financial_event_id TEXT,
    stripe_price_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_request_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS maintenance_runs (
    name TEXT PRIMARY KEY,
    last_run_at TEXT NOT NULL,
    details_json TEXT NOT NULL
  );
`);

function hasColumn(table: string, column: string) {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumn(table: string, definition: string, column: string) {
  if (!hasColumn(table, column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function runSchemaMigration(version: number, name: string, work: () => void) {
  const applied = database.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version);
  if (applied) return;
  database.exec("BEGIN IMMEDIATE");
  try {
    work();
    database.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
      .run(version, name, new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

runSchemaMigration(1, "legacy identity and generation columns", () => {
  addColumn("generations", "owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE", "owner_user_id");
  addColumn("generations", "anonymous_session_id TEXT REFERENCES anonymous_sessions(id) ON DELETE CASCADE", "anonymous_session_id");
  addColumn("generations", "project_id TEXT REFERENCES projects(id) ON DELETE SET NULL", "project_id");
  addColumn("generations", "credit_cost INTEGER NOT NULL DEFAULT 0", "credit_cost");
  addColumn("generations", "favorite INTEGER NOT NULL DEFAULT 0", "favorite");
  addColumn("generations", "image_blob BLOB", "image_blob");
  addColumn("generations", "mime_type TEXT NOT NULL DEFAULT 'image/svg+xml'", "mime_type");
  addColumn("generations", "provider_id TEXT NOT NULL DEFAULT 'local-preview'", "provider_id");
  addColumn("generations", "model_id TEXT NOT NULL DEFAULT 'local-qwen-preview'", "model_id");
  addColumn("users", "email_verified INTEGER NOT NULL DEFAULT 0", "email_verified");
  addColumn("users", "updated_at TEXT", "updated_at");
  addColumn("sessions", "user_agent TEXT NOT NULL DEFAULT 'Unknown device'", "user_agent");
  addColumn("sessions", "ip_hint TEXT NOT NULL DEFAULT 'Unknown network'", "ip_hint");
  addColumn("sessions", "last_seen_at TEXT", "last_seen_at");
});

runSchemaMigration(2, "recoverable billing lifecycle", () => {
  addColumn("api_keys", "scopes TEXT NOT NULL DEFAULT 'generations:write'", "scopes");
  addColumn("billing_accounts", "spending_blocked INTEGER NOT NULL DEFAULT 0", "spending_blocked");
  addColumn("billing_accounts", "block_reason TEXT", "block_reason");
  addColumn("billing_orders", "payment_intent_id TEXT", "payment_intent_id");
  addColumn("billing_orders", "financial_status TEXT NOT NULL DEFAULT 'normal'", "financial_status");
  addColumn("billing_orders", "financial_event_id TEXT", "financial_event_id");
  addColumn("billing_orders", "financial_updated_at TEXT", "financial_updated_at");
  addColumn("billing_events", "status TEXT NOT NULL DEFAULT 'processing'", "status");
  addColumn("billing_events", "attempts INTEGER NOT NULL DEFAULT 1", "attempts");
  addColumn("billing_events", "payload_json TEXT", "payload_json");
  addColumn("billing_events", "last_error TEXT", "last_error");
  addColumn("billing_events", "processing_started_at TEXT", "processing_started_at");
  addColumn("billing_events", "completed_at TEXT", "completed_at");
  addColumn("billing_events", "updated_at TEXT", "updated_at");
  database.prepare("UPDATE billing_events SET status = 'completed', completed_at = processed_at, updated_at = processed_at WHERE updated_at IS NULL").run();
});

runSchemaMigration(3, "shared rate limits and api request logs", () => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      bucket_key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_request_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      request_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS maintenance_runs (
      name TEXT PRIMARY KEY,
      last_run_at TEXT NOT NULL,
      details_json TEXT NOT NULL
    );
  `);
});

runSchemaMigration(4, "payment lifecycle ledger", () => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS billing_payments (
      payment_intent_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      billing_order_id TEXT REFERENCES billing_orders(id) ON DELETE SET NULL,
      invoice_id TEXT UNIQUE,
      kind TEXT NOT NULL CHECK(kind IN ('subscription', 'credits')),
      credits_granted INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid', 'refunded', 'disputed')),
      financial_event_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
});

runSchemaMigration(5, "generation queue metadata", () => {
  addColumn("generations", "queue_tier TEXT NOT NULL DEFAULT 'free'", "queue_tier");
  addColumn("generations", "queued_at TEXT", "queued_at");
  addColumn("generations", "processing_started_at TEXT", "processing_started_at");
  database.prepare("UPDATE generations SET queued_at = COALESCE(queued_at, created_at), processing_started_at = COALESCE(processing_started_at, created_at)").run();
});

runSchemaMigration(6, "persistent introductory pricing", () => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS pricing_promotions (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      anonymous_session_id TEXT UNIQUE REFERENCES anonymous_sessions(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL CHECK(offer_id = 'creator_intro'),
      starts_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      redeemed_at TEXT,
      created_at TEXT NOT NULL,
      CHECK((user_id IS NOT NULL AND anonymous_session_id IS NULL) OR (user_id IS NULL AND anonymous_session_id IS NOT NULL))
    );
  `);
});

runSchemaMigration(7, "versioned Stripe price and credit catalog", () => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS billing_price_versions (
      stripe_price_id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL CHECK(offer_id IN ('creator_intro', 'creator_monthly', 'credits_100', 'credits_300')),
      kind TEXT NOT NULL CHECK(kind IN ('subscription', 'credits')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      currency TEXT NOT NULL CHECK(currency = 'usd'),
      credits INTEGER NOT NULL CHECK(credits > 0),
      active_for_checkout INTEGER NOT NULL DEFAULT 0 CHECK(active_for_checkout IN (0, 1)),
      effective_from TEXT NOT NULL,
      retired_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  addColumn("billing_orders", "stripe_price_id TEXT", "stripe_price_id");
  addColumn("billing_payments", "stripe_price_id TEXT", "stripe_price_id");

  const seededAt = "2026-07-23T00:00:00.000Z";
  const seeds: Array<{
    stripePriceId: string;
    offerId: BillingOffer["id"];
    kind: BillingOffer["kind"];
    amountCents: number;
    credits: number;
  }> = [
    { stripePriceId: process.env.STRIPE_PRICE_CREATOR_INTRO?.trim() || "", offerId: "creator_intro", kind: "subscription", amountCents: 800, credits: 300 },
    { stripePriceId: process.env.STRIPE_PRICE_CREATOR_MONTHLY?.trim() || "", offerId: "creator_monthly", kind: "subscription", amountCents: 1000, credits: 300 },
    { stripePriceId: process.env.STRIPE_PRICE_CREDITS_100?.trim() || "", offerId: "credits_100", kind: "credits", amountCents: 700, credits: 100 },
    { stripePriceId: process.env.STRIPE_PRICE_CREDITS_300?.trim() || "", offerId: "credits_300", kind: "credits", amountCents: 1800, credits: 300 },
  ];
  const insertSeed = database.prepare(`INSERT OR IGNORE INTO billing_price_versions
    (stripe_price_id, offer_id, kind, amount_cents, currency, credits, active_for_checkout, effective_from, created_at)
    VALUES (?, ?, ?, ?, 'usd', ?, 1, ?, ?)`);
  for (const seed of seeds) {
    if (!seed.stripePriceId) continue;
    insertSeed.run(seed.stripePriceId, seed.offerId, seed.kind, seed.amountCents, seed.credits, seededAt, seededAt);
  }
  database.prepare(`UPDATE billing_orders SET stripe_price_id = (
    SELECT stripe_price_id FROM billing_price_versions
    WHERE offer_id = billing_orders.offer_id AND active_for_checkout = 1
  ) WHERE stripe_price_id IS NULL`).run();
  database.prepare(`UPDATE billing_payments SET stripe_price_id = (
    SELECT stripe_price_id FROM billing_orders WHERE billing_orders.id = billing_payments.billing_order_id
  ) WHERE stripe_price_id IS NULL`).run();
});

database.prepare("UPDATE users SET updated_at = created_at WHERE updated_at IS NULL").run();
database.prepare("UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL").run();

database.exec(`
  CREATE INDEX IF NOT EXISTS generations_created_at_idx ON generations(created_at DESC);
  CREATE INDEX IF NOT EXISTS generations_owner_idx ON generations(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS generations_guest_idx ON generations(anonymous_session_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS security_tokens_user_idx ON security_tokens(user_id, purpose, created_at DESC);
  CREATE INDEX IF NOT EXISTS oauth_identities_user_idx ON oauth_identities(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS oauth_states_expiry_idx ON oauth_states(expires_at);
  CREATE INDEX IF NOT EXISTS billing_orders_user_idx ON billing_orders(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS billing_orders_checkout_idx ON billing_orders(stripe_checkout_session_id);
  CREATE UNIQUE INDEX IF NOT EXISTS billing_orders_payment_intent_idx ON billing_orders(payment_intent_id) WHERE payment_intent_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_reference_idx ON credit_ledger(user_id, type, reference_id) WHERE reference_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS billing_events_status_idx ON billing_events(status, updated_at);
  CREATE INDEX IF NOT EXISTS billing_payments_user_idx ON billing_payments(user_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS billing_price_versions_active_offer_idx ON billing_price_versions(offer_id) WHERE active_for_checkout = 1;
  CREATE INDEX IF NOT EXISTS billing_price_versions_offer_history_idx ON billing_price_versions(offer_id, effective_from DESC);
  CREATE INDEX IF NOT EXISTS billing_orders_stripe_price_idx ON billing_orders(stripe_price_id);
  CREATE INDEX IF NOT EXISTS billing_payments_stripe_price_idx ON billing_payments(stripe_price_id);
  CREATE INDEX IF NOT EXISTS pricing_promotions_expiry_idx ON pricing_promotions(expires_at);
  CREATE INDEX IF NOT EXISTS rate_limit_reset_idx ON rate_limit_buckets(reset_at);
  CREATE INDEX IF NOT EXISTS api_request_logs_user_idx ON api_request_logs(user_id, created_at DESC);
`);

function transaction<T>(work: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

interface UserRow {
  id: string;
  name: string;
  email_normalized: string;
  password_hash: string;
  email_verified: number;
  created_at: string;
  updated_at: string | null;
}

interface GenerationRow {
  id: string;
  prompt: string;
  aspect_ratio: AspectRatio;
  style: ImageStyle;
  quality: ImageQuality;
  status: Generation["status"];
  width: number | null;
  height: number | null;
  image_svg?: string | null;
  image_blob?: Uint8Array | null;
  mime_type: string;
  provider_id: string;
  model_id: string;
  credit_cost: number;
  queue_tier: GenerationQueueTier;
  queued_at: string | null;
  processing_started_at: string | null;
  favorite: number;
  project_id: string | null;
  created_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email_normalized,
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at,
  };
}

function toGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    prompt: row.prompt,
    aspectRatio: row.aspect_ratio,
    style: row.style,
    quality: row.quality,
    status: row.status,
    width: row.width ?? 0,
    height: row.height ?? 0,
    imageUrl: row.status === "complete" ? `/api/generations/${row.id}/image` : null,
    downloadUrl: row.status === "complete" ? `/api/generations/${row.id}/download` : null,
    provider: row.provider_id,
    model: row.model_id,
    creditCost: row.credit_cost,
    queueTier: row.queue_tier ?? "free",
    queuedAt: row.queued_at ?? row.created_at,
    processingStartedAt: row.processing_started_at,
    favorite: Boolean(row.favorite),
    projectId: row.project_id,
    createdAt: row.created_at,
  };
}

const generationColumns = "id, prompt, aspect_ratio, style, quality, status, width, height, credit_cost, queue_tier, queued_at, processing_started_at, favorite, project_id, provider_id, model_id, created_at";

export function findUserByEmail(email: string) {
  return database.prepare("SELECT * FROM users WHERE email_normalized = ?").get(email.toLowerCase()) as UserRow | undefined;
}

export function findUserById(id: string) {
  const row = database.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function createUser(input: { id: string; name: string; email: string; passwordHash: string; emailVerified?: boolean; ledgerId?: string }) {
  const now = new Date().toISOString();
  return transaction(() => {
    const verified = Boolean(input.emailVerified);
    database.prepare(`INSERT INTO users
      (id, name, email_normalized, password_hash, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(input.id, input.name, input.email.toLowerCase(), input.passwordHash, verified ? 1 : 0, now, now);
    database.prepare("INSERT INTO credit_accounts (user_id, available, reserved, updated_at) VALUES (?, 0, 0, ?)")
      .run(input.id, now);
    database.prepare("INSERT INTO billing_accounts (user_id, updated_at) VALUES (?, ?)").run(input.id, now);
    if (verified && input.ledgerId) {
      database.prepare("UPDATE credit_accounts SET available = 20, updated_at = ? WHERE user_id = ?").run(now, input.id);
      database.prepare(`INSERT INTO credit_ledger
        (id, user_id, type, amount, balance_after, reference_id, description, created_at)
        VALUES (?, ?, 'signup_grant', 20, 20, NULL, 'Email-verified welcome credit grant', ?)`)
        .run(input.ledgerId, input.id, now);
    }
    return findUserById(input.id)!;
  });
}

export function grantWelcomeCredits(userId: string, ledgerId: string) {
  return transaction(() => {
    const alreadyGranted = database.prepare("SELECT 1 FROM credit_ledger WHERE user_id = ? AND type = 'signup_grant'").get(userId);
    if (alreadyGranted) return false;
    const account = getCreditAccount(userId);
    const availableAfter = account.available + 20;
    const now = new Date().toISOString();
    database.prepare("UPDATE credit_accounts SET available = ?, updated_at = ? WHERE user_id = ?")
      .run(availableAfter, now, userId);
    database.prepare(`INSERT INTO credit_ledger
      (id, user_id, type, amount, balance_after, reference_id, description, created_at)
      VALUES (?, ?, 'signup_grant', 20, ?, NULL, 'Email-verified welcome credit grant', ?)`)
      .run(ledgerId, userId, availableAfter, now);
    return true;
  });
}

export function createSession(input: { id: string; userId: string; tokenHash: string; expiresAt: string; userAgent?: string; ipHint?: string }) {
  const now = new Date().toISOString();
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  database.prepare(`INSERT INTO sessions
    (id, user_id, token_hash, expires_at, created_at, user_agent, ip_hint, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(input.id, input.userId, input.tokenHash, input.expiresAt, now, input.userAgent ?? "Unknown device", input.ipHint ?? "Unknown network", now);
}

export function findSessionActorByHash(tokenHash: string) {
  const now = new Date().toISOString();
  const row = database.prepare(`SELECT u.*, s.id session_id FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash, now) as (UserRow & { session_id: string }) | undefined;
  if (!row) return null;
  database.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, row.session_id);
  return { user: toUser(row), sessionId: row.session_id };
}

export function findUserBySessionHash(tokenHash: string) {
  return findSessionActorByHash(tokenHash)?.user ?? null;
}

export function revokeSession(tokenHash: string) {
  return database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash).changes > 0;
}

export function listSessions(userId: string, currentSessionId: string | null) {
  const rows = database.prepare(`SELECT id, user_agent, ip_hint, expires_at, created_at, last_seen_at
    FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`)
    .all(userId, new Date().toISOString()) as unknown as Array<{
      id: string;
      user_agent: string;
      ip_hint: string;
      expires_at: string;
      created_at: string;
      last_seen_at: string;
    }>;
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.user_agent,
    ipHint: row.ip_hint,
    current: row.id === currentSessionId,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export function revokeSessionById(id: string, userId: string) {
  return database.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function revokeOtherSessions(userId: string, currentSessionId: string) {
  return database.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(userId, currentSessionId).changes;
}

export function createSecurityToken(input: { id: string; userId: string; purpose: "verify_email" | "reset_password"; tokenHash: string; expiresAt: string }) {
  const now = new Date().toISOString();
  transaction(() => {
    database.prepare("DELETE FROM security_tokens WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL")
      .run(input.userId, input.purpose);
    database.prepare(`INSERT INTO security_tokens
      (id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(input.id, input.userId, input.purpose, input.tokenHash, input.expiresAt, now);
  });
}

export function consumeEmailVerification(tokenHash: string, ledgerId: string) {
  return transaction(() => {
    const now = new Date().toISOString();
    const token = database.prepare(`SELECT id, user_id FROM security_tokens
      WHERE token_hash = ? AND purpose = 'verify_email' AND consumed_at IS NULL AND expires_at > ?`)
      .get(tokenHash, now) as { id: string; user_id: string } | undefined;
    if (!token) return null;
    database.prepare("UPDATE security_tokens SET consumed_at = ? WHERE id = ?").run(now, token.id);
    database.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").run(now, token.user_id);
    const alreadyGranted = database.prepare("SELECT 1 FROM credit_ledger WHERE user_id = ? AND type = 'signup_grant'").get(token.user_id);
    if (!alreadyGranted) {
      const account = getCreditAccount(token.user_id);
      const availableAfter = account.available + 20;
      database.prepare("UPDATE credit_accounts SET available = ?, updated_at = ? WHERE user_id = ?")
        .run(availableAfter, now, token.user_id);
      database.prepare(`INSERT INTO credit_ledger
        (id, user_id, type, amount, balance_after, reference_id, description, created_at)
        VALUES (?, ?, 'signup_grant', 20, ?, NULL, 'Email-verified welcome credit grant', ?)`)
        .run(ledgerId, token.user_id, availableAfter, now);
    }
    return findUserById(token.user_id);
  });
}

export function consumePasswordReset(tokenHash: string, passwordHash: string) {
  return transaction(() => {
    const now = new Date().toISOString();
    const token = database.prepare(`SELECT id, user_id FROM security_tokens
      WHERE token_hash = ? AND purpose = 'reset_password' AND consumed_at IS NULL AND expires_at > ?`)
      .get(tokenHash, now) as { id: string; user_id: string } | undefined;
    if (!token) return false;
    database.prepare("UPDATE security_tokens SET consumed_at = ? WHERE id = ?").run(now, token.id);
    database.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash, now, token.user_id);
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(token.user_id);
    return true;
  });
}

export function updateUserProfile(userId: string, name: string) {
  database.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").run(name, new Date().toISOString(), userId);
  return findUserById(userId);
}

export function updateUserPassword(userId: string, passwordHash: string, currentSessionId: string) {
  return transaction(() => {
    database.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, new Date().toISOString(), userId);
    database.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(userId, currentSessionId);
    return true;
  });
}

export function createOAuthState(input: { stateHash: string; provider: "google" | "github"; codeVerifier: string; anonymousSessionId: string | null; expiresAt: string }) {
  database.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").run(new Date().toISOString());
  database.prepare(`INSERT INTO oauth_states
    (state_hash, provider, code_verifier, anonymous_session_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(input.stateHash, input.provider, input.codeVerifier, input.anonymousSessionId, input.expiresAt, new Date().toISOString());
}

export function consumeOAuthState(stateHash: string, provider: "google" | "github") {
  return transaction(() => {
    const row = database.prepare(`SELECT code_verifier, anonymous_session_id FROM oauth_states
      WHERE state_hash = ? AND provider = ? AND expires_at > ?`)
      .get(stateHash, provider, new Date().toISOString()) as { code_verifier: string; anonymous_session_id: string | null } | undefined;
    if (!row) return null;
    database.prepare("DELETE FROM oauth_states WHERE state_hash = ?").run(stateHash);
    return { codeVerifier: row.code_verifier, anonymousSessionId: row.anonymous_session_id };
  });
}

export function resolveOAuthUser(input: {
  provider: "google" | "github";
  subject: string;
  email: string;
  name: string;
  userId: string;
  identityId: string;
  passwordHash: string;
  ledgerId: string;
}) {
  return transaction(() => {
    const identity = database.prepare(`SELECT u.* FROM oauth_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = ? AND i.provider_subject = ?`).get(input.provider, input.subject) as UserRow | undefined;
    if (identity) return toUser(identity);

    let user = database.prepare("SELECT * FROM users WHERE email_normalized = ?").get(input.email.toLowerCase()) as UserRow | undefined;
    const now = new Date().toISOString();
    if (!user) {
      database.prepare(`INSERT INTO users
        (id, name, email_normalized, password_hash, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .run(input.userId, input.name, input.email.toLowerCase(), input.passwordHash, now, now);
      database.prepare("INSERT INTO credit_accounts (user_id, available, reserved, updated_at) VALUES (?, 20, 0, ?)")
        .run(input.userId, now);
      database.prepare("INSERT INTO billing_accounts (user_id, updated_at) VALUES (?, ?)").run(input.userId, now);
      database.prepare(`INSERT INTO credit_ledger
        (id, user_id, type, amount, balance_after, reference_id, description, created_at)
        VALUES (?, ?, 'signup_grant', 20, 20, NULL, 'Verified social-account welcome credit grant', ?)`)
        .run(input.ledgerId, input.userId, now);
      user = database.prepare("SELECT * FROM users WHERE id = ?").get(input.userId) as unknown as UserRow;
    } else if (!user.email_verified) {
      database.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").run(now, user.id);
      const alreadyGranted = database.prepare("SELECT 1 FROM credit_ledger WHERE user_id = ? AND type = 'signup_grant'").get(user.id);
      if (!alreadyGranted) {
        const account = getCreditAccount(user.id);
        const availableAfter = account.available + 20;
        database.prepare("UPDATE credit_accounts SET available = ?, updated_at = ? WHERE user_id = ?")
          .run(availableAfter, now, user.id);
        database.prepare(`INSERT INTO credit_ledger
          (id, user_id, type, amount, balance_after, reference_id, description, created_at)
          VALUES (?, ?, 'signup_grant', 20, ?, NULL, 'Verified social-account welcome credit grant', ?)`)
          .run(input.ledgerId, user.id, availableAfter, now);
      }
      user = database.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as unknown as UserRow;
    }

    database.prepare(`INSERT INTO oauth_identities
      (id, user_id, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(input.identityId, user.id, input.provider, input.subject, now);
    return toUser(user);
  });
}

export function createAnonymousSession(input: { id: string; tokenHash: string; expiresAt: string; quotaDate: string }) {
  database.prepare(`INSERT INTO anonymous_sessions
    (id, token_hash, quota_date, used_count, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)`)
    .run(input.id, input.tokenHash, input.quotaDate, input.expiresAt, new Date().toISOString());
  return { id: input.id, usedCount: 0, quotaDate: input.quotaDate };
}

export function findAnonymousSession(tokenHash: string, quotaDate: string) {
  const row = database.prepare(`SELECT id, quota_date, used_count FROM anonymous_sessions
    WHERE token_hash = ? AND expires_at > ?`).get(tokenHash, new Date().toISOString()) as
    | { id: string; quota_date: string; used_count: number }
    | undefined;
  if (!row) return null;
  if (row.quota_date !== quotaDate) {
    database.prepare("UPDATE anonymous_sessions SET quota_date = ?, used_count = 0 WHERE id = ?").run(quotaDate, row.id);
    return { id: row.id, quotaDate, usedCount: 0 };
  }
  return { id: row.id, quotaDate: row.quota_date, usedCount: row.used_count };
}

interface PricingPromotionRow {
  id: string;
  starts_at: string;
  expires_at: string;
  redeemed_at: string | null;
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
  created_at: string;
}

export interface BillingPriceVersion {
  stripePriceId: string;
  offerId: BillingOffer["id"];
  kind: BillingOffer["kind"];
  amountCents: number;
  currency: "usd";
  credits: number;
  activeForCheckout: boolean;
  effectiveFrom: string;
  retiredAt: string | null;
  createdAt: string;
}

function toBillingPriceVersion(row: BillingPriceVersionRow): BillingPriceVersion {
  return {
    stripePriceId: row.stripe_price_id,
    offerId: row.offer_id,
    kind: row.kind,
    amountCents: row.amount_cents,
    currency: row.currency,
    credits: row.credits,
    activeForCheckout: Boolean(row.active_for_checkout),
    effectiveFrom: row.effective_from,
    retiredAt: row.retired_at,
    createdAt: row.created_at,
  };
}

export function getActiveBillingPriceVersion(offerId: BillingOffer["id"]) {
  const row = database.prepare(`SELECT * FROM billing_price_versions
    WHERE offer_id = ? AND active_for_checkout = 1`).get(offerId) as BillingPriceVersionRow | undefined;
  return row ? toBillingPriceVersion(row) : null;
}

export function getBillingPriceVersionByStripePriceId(stripePriceId: string) {
  const row = database.prepare("SELECT * FROM billing_price_versions WHERE stripe_price_id = ?")
    .get(stripePriceId) as BillingPriceVersionRow | undefined;
  return row ? toBillingPriceVersion(row) : null;
}

export function listActiveBillingPriceVersions() {
  const rows = database.prepare(`SELECT * FROM billing_price_versions
    WHERE active_for_checkout = 1 ORDER BY offer_id`).all() as unknown as BillingPriceVersionRow[];
  return rows.map(toBillingPriceVersion);
}

export function activateBillingPriceVersion(input: {
  stripePriceId: string;
  offerId: BillingOffer["id"];
  kind: BillingOffer["kind"];
  amountCents: number;
  credits: number;
  effectiveFrom?: string;
}) {
  if (!input.stripePriceId.startsWith("price_") || input.amountCents <= 0 || input.credits <= 0) {
    throw new Error("A billing price version requires a Stripe Price ID, positive amount, and positive credits.");
  }
  return transaction(() => {
    const existing = getBillingPriceVersionByStripePriceId(input.stripePriceId);
    if (existing && (existing.offerId !== input.offerId
      || existing.kind !== input.kind
      || existing.amountCents !== input.amountCents
      || existing.credits !== input.credits
      || existing.currency !== "usd")) {
      throw new Error("Stripe Price versions are immutable and cannot be reassigned or edited.");
    }
    const effectiveFrom = input.effectiveFrom ?? new Date().toISOString();
    database.prepare(`UPDATE billing_price_versions
      SET active_for_checkout = 0, retired_at = COALESCE(retired_at, ?)
      WHERE offer_id = ? AND active_for_checkout = 1 AND stripe_price_id <> ?`)
      .run(effectiveFrom, input.offerId, input.stripePriceId);
    if (existing) {
      database.prepare(`UPDATE billing_price_versions SET active_for_checkout = 1, retired_at = NULL
        WHERE stripe_price_id = ?`).run(input.stripePriceId);
    } else {
      database.prepare(`INSERT INTO billing_price_versions
        (stripe_price_id, offer_id, kind, amount_cents, currency, credits, active_for_checkout, effective_from, created_at)
        VALUES (?, ?, ?, ?, 'usd', ?, 1, ?, ?)`)
        .run(input.stripePriceId, input.offerId, input.kind, input.amountCents, input.credits, effectiveFrom, effectiveFrom);
    }
    return getActiveBillingPriceVersion(input.offerId)!;
  });
}

function toPricingPromotion(row: PricingPromotionRow, now: Date) {
  return {
    id: row.id,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    active: !row.redeemed_at && new Date(row.expires_at).getTime() > now.getTime(),
    redeemed: Boolean(row.redeemed_at),
  };
}

export function getOrCreatePricingPromotion(input: {
  userId?: string | null;
  anonymousSessionId?: string | null;
  now?: Date;
  durationMs?: number;
}) {
  const now = input.now ?? new Date();
  const durationMs = Math.max(60_000, input.durationMs ?? 10 * 60 * 1000);
  const ownerColumn = input.userId ? "user_id" : "anonymous_session_id";
  const ownerId = input.userId ?? input.anonymousSessionId;
  if (!ownerId) return null;
  const existing = database.prepare(`SELECT id, starts_at, expires_at, redeemed_at FROM pricing_promotions WHERE ${ownerColumn} = ?`)
    .get(ownerId) as PricingPromotionRow | undefined;
  if (existing) return toPricingPromotion(existing, now);
  const id = crypto.randomUUID();
  const startsAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + durationMs).toISOString();
  database.prepare(`INSERT INTO pricing_promotions
    (id, user_id, anonymous_session_id, offer_id, starts_at, expires_at, created_at)
    VALUES (?, ?, ?, 'creator_intro', ?, ?, ?)`)
    .run(id, input.userId ?? null, input.anonymousSessionId ?? null, startsAt, expiresAt, startsAt);
  return { id, startsAt, expiresAt, active: true, redeemed: false };
}

export function getPricingPromotionForUser(userId: string, now = new Date()) {
  const row = database.prepare("SELECT id, starts_at, expires_at, redeemed_at FROM pricing_promotions WHERE user_id = ?")
    .get(userId) as PricingPromotionRow | undefined;
  return row ? toPricingPromotion(row, now) : null;
}

export function migratePricingPromotion(anonymousSessionId: string, userId: string) {
  return transaction(() => {
    const guestPromotion = database.prepare("SELECT id FROM pricing_promotions WHERE anonymous_session_id = ?")
      .get(anonymousSessionId) as { id: string } | undefined;
    if (!guestPromotion) return false;
    const userPromotion = database.prepare("SELECT id FROM pricing_promotions WHERE user_id = ?")
      .get(userId) as { id: string } | undefined;
    if (userPromotion) {
      database.prepare("DELETE FROM pricing_promotions WHERE id = ?").run(guestPromotion.id);
      return false;
    }
    database.prepare("UPDATE pricing_promotions SET user_id = ?, anonymous_session_id = NULL WHERE id = ?")
      .run(userId, guestPromotion.id);
    return true;
  });
}

export function consumeGuestQuota(anonymousSessionId: string, quotaDate: string, limit: number) {
  return transaction(() => {
    const row = database.prepare("SELECT quota_date, used_count FROM anonymous_sessions WHERE id = ?")
      .get(anonymousSessionId) as { quota_date: string; used_count: number } | undefined;
    if (!row) return false;
    const used = row.quota_date === quotaDate ? row.used_count : 0;
    if (used >= limit) return false;
    database.prepare("UPDATE anonymous_sessions SET quota_date = ?, used_count = ? WHERE id = ?")
      .run(quotaDate, used + 1, anonymousSessionId);
    return true;
  });
}

export function releaseGuestQuota(anonymousSessionId: string, quotaDate: string) {
  database.prepare(`UPDATE anonymous_sessions SET used_count = MAX(used_count - 1, 0)
    WHERE id = ? AND quota_date = ?`).run(anonymousSessionId, quotaDate);
}

export function migrateGuestGenerations(anonymousSessionId: string, userId: string) {
  return database.prepare(`UPDATE generations SET owner_user_id = ?, anonymous_session_id = NULL
    WHERE anonymous_session_id = ? AND created_at >= ?`)
    .run(userId, anonymousSessionId, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).changes;
}

export function getCreditAccount(userId: string) {
  const row = database.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = ?")
    .get(userId) as { available: number; reserved: number } | undefined;
  return row ?? { available: 0, reserved: 0 };
}

export function reserveCredits(input: { ledgerId: string; userId: string; amount: number; referenceId: string }) {
  return transaction(() => {
    const billing = database.prepare("SELECT spending_blocked, block_reason FROM billing_accounts WHERE user_id = ?")
      .get(input.userId) as { spending_blocked: number; block_reason: string | null } | undefined;
    if (billing?.spending_blocked) return { reserved: false, blockedReason: billing.block_reason ?? "Billing review required." };
    const account = getCreditAccount(input.userId);
    if (account.available < input.amount) return { reserved: false, blockedReason: null };
    const availableAfter = account.available - input.amount;
    database.prepare("UPDATE credit_accounts SET available = ?, reserved = reserved + ?, updated_at = ? WHERE user_id = ?")
      .run(availableAfter, input.amount, new Date().toISOString(), input.userId);
    database.prepare(`INSERT INTO credit_ledger
      (id, user_id, type, amount, balance_after, reference_id, description, created_at)
      VALUES (?, ?, 'generation_reservation', ?, ?, ?, 'Credits reserved for image generation', ?)`)
      .run(input.ledgerId, input.userId, -input.amount, availableAfter, input.referenceId, new Date().toISOString());
    return { reserved: true, blockedReason: null };
  });
}

export function settleCredits(input: { ledgerId: string; userId: string; amount: number; referenceId: string }) {
  transaction(() => {
    const account = getCreditAccount(input.userId);
    database.prepare("UPDATE credit_accounts SET reserved = MAX(reserved - ?, 0), updated_at = ? WHERE user_id = ?")
      .run(input.amount, new Date().toISOString(), input.userId);
    database.prepare(`INSERT INTO credit_ledger
      (id, user_id, type, amount, balance_after, reference_id, description, created_at)
      VALUES (?, ?, 'generation_settlement', 0, ?, ?, 'Generation completed', ?)`)
      .run(input.ledgerId, input.userId, account.available, input.referenceId, new Date().toISOString());
  });
}

export function refundCredits(input: { ledgerId: string; userId: string; amount: number; referenceId: string }) {
  transaction(() => {
    const account = getCreditAccount(input.userId);
    const availableAfter = account.available + input.amount;
    database.prepare("UPDATE credit_accounts SET available = ?, reserved = MAX(reserved - ?, 0), updated_at = ? WHERE user_id = ?")
      .run(availableAfter, input.amount, new Date().toISOString(), input.userId);
    database.prepare(`INSERT INTO credit_ledger
      (id, user_id, type, amount, balance_after, reference_id, description, created_at)
      VALUES (?, ?, 'generation_refund', ?, ?, ?, 'Generation failed; reservation released', ?)`)
      .run(input.ledgerId, input.userId, input.amount, availableAfter, input.referenceId, new Date().toISOString());
  });
}

export function listCreditLedger(userId: string, limit = 50): CreditEntry[] {
  const rows = database.prepare(`SELECT id, type, amount, balance_after, reference_id, description, created_at
    FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit) as unknown as Array<{
      id: string; type: CreditEntry["type"]; amount: number; balance_after: number; reference_id: string | null; description: string; created_at: string;
    }>;
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    referenceId: row.reference_id,
    description: row.description,
    createdAt: row.created_at,
  }));
}

export function createPending(input: {
  id: string;
  prompt: string;
  aspectRatio: AspectRatio;
  style: ImageStyle;
  quality: ImageQuality;
  ownerUserId: string | null;
  anonymousSessionId: string | null;
  projectId: string | null;
  creditCost: number;
  queueTier?: GenerationQueueTier;
}) {
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO generations
    (id, prompt, aspect_ratio, style, quality, status, owner_user_id, anonymous_session_id, project_id, credit_cost, queue_tier, queued_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(input.id, input.prompt, input.aspectRatio, input.style, input.quality, input.ownerUserId, input.anonymousSessionId, input.projectId, input.creditCost, input.queueTier ?? "free", now, now, now);
}

export function markGenerationProcessing(id: string) {
  database.prepare("UPDATE generations SET processing_started_at = ?, updated_at = ? WHERE id = ? AND status = 'processing'")
    .run(new Date().toISOString(), new Date().toISOString(), id);
}

export function completeGeneration(id: string, input: { width: number; height: number; data: string | Uint8Array; mimeType: string; provider: string; model: string }) {
  const isSvg = input.mimeType === "image/svg+xml";
  database.prepare(`UPDATE generations SET status = 'complete', width = ?, height = ?, image_svg = ?, image_blob = ?,
    mime_type = ?, provider_id = ?, model_id = ?, updated_at = ? WHERE id = ?`)
    .run(input.width, input.height, isSvg ? input.data : null, isSvg ? null : input.data, input.mimeType, input.provider, input.model, new Date().toISOString(), id);
  return getGenerationRecord(id);
}

export function failGeneration(id: string) {
  database.prepare("UPDATE generations SET status = 'failed', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

export function getGenerationRecord(id: string) {
  const row = database.prepare("SELECT * FROM generations WHERE id = ?").get(id) as GenerationRow | undefined;
  if (!row) return null;
  const data = row.image_blob ? Buffer.from(row.image_blob) : row.image_svg ?? null;
  return { generation: toGeneration(row), asset: data ? { data, mimeType: row.mime_type } : null };
}

export function canAccessGeneration(id: string, userId: string | null, anonymousSessionId: string | null) {
  const row = database.prepare("SELECT owner_user_id, anonymous_session_id, created_at FROM generations WHERE id = ?").get(id) as
    | { owner_user_id: string | null; anonymous_session_id: string | null; created_at: string }
    | undefined;
  if (!row) return false;
  const accountAccess = Boolean(userId) && row.owner_user_id === userId;
  const guestAccess = Boolean(anonymousSessionId) && row.anonymous_session_id === anonymousSessionId
    && row.created_at >= new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return accountAccess || guestAccess;
}

export function listGenerations(input: { userId: string | null; anonymousSessionId: string | null; limit?: number; projectId?: string | null }) {
  const limit = input.limit ?? 8;
  if (input.userId) {
    if (input.projectId) {
      return (database.prepare(`SELECT ${generationColumns} FROM generations WHERE owner_user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?`)
        .all(input.userId, input.projectId, limit) as unknown as GenerationRow[]).map(toGeneration);
    }
    return (database.prepare(`SELECT ${generationColumns} FROM generations WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(input.userId, limit) as unknown as GenerationRow[]).map(toGeneration);
  }
  if (!input.anonymousSessionId) return [];
  return (database.prepare(`SELECT ${generationColumns} FROM generations
    WHERE anonymous_session_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?`)
    .all(input.anonymousSessionId, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), limit) as unknown as GenerationRow[]).map(toGeneration);
}

export function deleteGeneration(id: string, userId: string | null, anonymousSessionId: string | null) {
  if (!canAccessGeneration(id, userId, anonymousSessionId)) return false;
  return database.prepare("DELETE FROM generations WHERE id = ?").run(id).changes > 0;
}

export function toggleFavorite(id: string, userId: string, favorite: boolean) {
  return database.prepare("UPDATE generations SET favorite = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?")
    .run(favorite ? 1 : 0, new Date().toISOString(), id, userId).changes > 0;
}

export function listProjects(userId: string): Project[] {
  const rows = database.prepare(`SELECT p.id, p.name, p.description, p.archived, p.created_at, COUNT(g.id) generation_count
    FROM projects p LEFT JOIN generations g ON g.project_id = p.id
    WHERE p.user_id = ? GROUP BY p.id ORDER BY p.updated_at DESC`).all(userId) as unknown as Array<{
      id: string; name: string; description: string; archived: number; created_at: string; generation_count: number;
    }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    archived: Boolean(row.archived),
    generationCount: row.generation_count,
    createdAt: row.created_at,
  }));
}

export function createProject(input: { id: string; userId: string; name: string; description: string }) {
  const now = new Date().toISOString();
  database.prepare("INSERT INTO projects (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(input.id, input.userId, input.name, input.description, now, now);
  return listProjects(input.userId).find((project) => project.id === input.id)!;
}

export function updateProject(input: { id: string; userId: string; name: string; description: string; archived: boolean }) {
  const changed = database.prepare(`UPDATE projects SET name = ?, description = ?, archived = ?, updated_at = ?
    WHERE id = ? AND user_id = ?`).run(input.name, input.description, input.archived ? 1 : 0, new Date().toISOString(), input.id, input.userId).changes;
  return changed > 0 ? listProjects(input.userId).find((project) => project.id === input.id) ?? null : null;
}

export function projectBelongsToUser(projectId: string, userId: string) {
  return Boolean(database.prepare("SELECT 1 FROM projects WHERE id = ? AND user_id = ? AND archived = 0").get(projectId, userId));
}

export function createApiKey(input: { id: string; userId: string; name: string; prefix: string; secretHash: string; scopes?: string[] }) {
  const createdAt = new Date().toISOString();
  const scopes = input.scopes?.length ? [...new Set(input.scopes)].sort() : ["generations:write"];
  database.prepare("INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(input.id, input.userId, input.name, input.prefix, input.secretHash, scopes.join(" "), createdAt);
  return { id: input.id, name: input.name, prefix: input.prefix, scopes, lastUsedAt: null, createdAt } satisfies ApiKeySummary;
}

export function listApiKeys(userId: string): ApiKeySummary[] {
  const rows = database.prepare(`SELECT id, name, prefix, scopes, last_used_at, created_at FROM api_keys
    WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`).all(userId) as unknown as Array<{
      id: string; name: string; prefix: string; scopes: string; last_used_at: string | null; created_at: string;
    }>;
  return rows.map((row) => ({ id: row.id, name: row.name, prefix: row.prefix, scopes: row.scopes.split(/\s+/).filter(Boolean), lastUsedAt: row.last_used_at, createdAt: row.created_at }));
}

export function revokeApiKey(id: string, userId: string) {
  return database.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .run(new Date().toISOString(), id, userId).changes > 0;
}

export function findApiKeyActorByHash(secretHash: string) {
  const row = database.prepare(`SELECT u.*, k.id api_key_id, k.scopes api_key_scopes FROM api_keys k JOIN users u ON u.id = k.user_id
    WHERE k.secret_hash = ? AND k.revoked_at IS NULL`).get(secretHash) as UserRow | undefined;
  if (!row) return null;
  database.prepare("UPDATE api_keys SET last_used_at = ? WHERE secret_hash = ?").run(new Date().toISOString(), secretHash);
  const actorRow = row as UserRow & { api_key_id: string; api_key_scopes: string };
  return { user: toUser(actorRow), apiKeyId: actorRow.api_key_id, scopes: actorRow.api_key_scopes.split(/\s+/).filter(Boolean) };
}

export function findUserByApiKeyHash(secretHash: string) {
  return findApiKeyActorByHash(secretHash)?.user ?? null;
}

export function recordApiRequest(input: Omit<ApiRequestLog, "createdAt">) {
  database.prepare(`INSERT INTO api_request_logs
    (id, user_id, api_key_id, method, path, status_code, duration_ms, request_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(input.id, input.userId, input.apiKeyId, input.method, input.path, input.statusCode, input.durationMs, input.requestId, new Date().toISOString());
}

export function listApiRequestLogs(userId: string, limit = 100): ApiRequestLog[] {
  const rows = database.prepare(`SELECT id, user_id, api_key_id, method, path, status_code, duration_ms, request_id, created_at
    FROM api_request_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit) as unknown as Array<{
      id: string; user_id: string | null; api_key_id: string | null; method: string; path: string; status_code: number; duration_ms: number; request_id: string; created_at: string;
    }>;
  return rows.map((row) => ({ id: row.id, userId: row.user_id, apiKeyId: row.api_key_id, method: row.method, path: row.path, statusCode: row.status_code, durationMs: row.duration_ms, requestId: row.request_id, createdAt: row.created_at }));
}

export function findIdempotentGeneration(userId: string, key: string) {
  const row = database.prepare(`SELECT g.* FROM idempotency_keys i
    JOIN generations g ON g.id = i.generation_id
    WHERE i.user_id = ? AND i.idempotency_key = ? AND i.created_at >= ?`)
    .get(userId, key, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) as GenerationRow | undefined;
  return row ? toGeneration(row) : null;
}

export function saveIdempotencyKey(userId: string, key: string, generationId: string) {
  database.prepare(`INSERT OR IGNORE INTO idempotency_keys
    (user_id, idempotency_key, generation_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(userId, key, generationId, new Date().toISOString());
}

export function getAccountExport(userId: string) {
  const user = findUserById(userId);
  if (!user) return null;
  const sessions = listSessions(userId, null).map(({ current: _current, ...session }) => session);
  const projects = listProjects(userId);
  const generations = listGenerations({ userId, anonymousSessionId: null, limit: 10_000 });
  const credits = { account: getCreditAccount(userId), ledger: listCreditLedger(userId, 10_000) };
  const apiKeys = listApiKeys(userId);
  const apiRequests = listApiRequestLogs(userId, 10_000);
  const identities = database.prepare(`SELECT provider, created_at FROM oauth_identities
    WHERE user_id = ? ORDER BY created_at ASC`).all(userId) as unknown as Array<{ provider: string; created_at: string }>;
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    user,
    projects,
    generations,
    credits,
    apiKeys,
    apiRequests,
    sessions,
    connectedAccounts: identities.map((identity) => ({ provider: identity.provider, connectedAt: identity.created_at })),
    billing: (() => {
      const { stripeCustomerId: _customerId, stripeSubscriptionId: _subscriptionId, ...billing } = getBillingState(userId);
      return billing;
    })(),
  };
}

export function getBillingState(userId: string) {
  const row = database.prepare(`SELECT stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, spending_blocked, block_reason
    FROM billing_accounts WHERE user_id = ?`).get(userId) as {
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      plan: "free" | "creator";
      status: BillingSummary["account"]["status"];
      current_period_end: string | null;
      cancel_at_period_end: number;
      spending_blocked: number;
      block_reason: string | null;
    } | undefined;
  return {
    plan: row?.plan ?? "free",
    status: row?.status ?? "inactive",
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
    hasCustomer: Boolean(row?.stripe_customer_id),
    spendingBlocked: Boolean(row?.spending_blocked),
    blockReason: row?.block_reason ?? null,
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
  };
}

export function setStripeCustomer(userId: string, customerId: string) {
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO billing_accounts (user_id, stripe_customer_id, updated_at)
    VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, updated_at = excluded.updated_at`)
    .run(userId, customerId, now);
}

export function createBillingOrder(input: {
  id: string;
  userId: string;
  checkoutSessionId: string;
  offerId: string;
  kind: "subscription" | "credits";
  credits: number;
  amountCents: number;
  currency: string;
  stripePriceId?: string;
}) {
  const stripePriceId = input.stripePriceId
    ?? getActiveBillingPriceVersion(input.offerId as BillingOffer["id"])?.stripePriceId
    ?? null;
  database.prepare(`INSERT INTO billing_orders
    (id, user_id, stripe_checkout_session_id, offer_id, kind, credits, amount_cents, currency, stripe_price_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(input.id, input.userId, input.checkoutSessionId, input.offerId, input.kind, input.credits, input.amountCents, input.currency, stripePriceId, new Date().toISOString());
}

export function listBillingOrders(userId: string, limit = 20): BillingSummary["orders"] {
  const rows = database.prepare(`SELECT id, offer_id, kind, credits, amount_cents, currency, status, financial_status, created_at, completed_at
    FROM billing_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit) as unknown as Array<{
      id: string;
      offer_id: string;
      kind: "subscription" | "credits";
      credits: number;
      amount_cents: number;
      currency: string;
      status: "pending" | "paid" | "expired";
      financial_status: "normal" | "refunded" | "disputed";
      created_at: string;
      completed_at: string | null;
    }>;
  return rows.map((row) => ({
    id: row.id,
    offerId: row.offer_id,
    kind: row.kind,
    credits: row.credits,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    financialStatus: row.financial_status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

export function claimBillingEvent(input: { eventId: string; eventType: string; payloadJson: string }) {
  return transaction<"claimed" | "completed" | "busy">(() => {
    const now = new Date().toISOString();
    const existing = database.prepare("SELECT status, processing_started_at FROM billing_events WHERE stripe_event_id = ?")
      .get(input.eventId) as { status: string; processing_started_at: string | null } | undefined;
    if (!existing) {
      database.prepare(`INSERT INTO billing_events
        (stripe_event_id, type, processed_at, status, attempts, payload_json, processing_started_at, updated_at)
        VALUES (?, ?, ?, 'processing', 1, ?, ?, ?)`)
        .run(input.eventId, input.eventType, now, input.payloadJson, now, now);
      return "claimed";
    }
    if (existing.status === "completed") return "completed";
    const staleBefore = Date.now() - 5 * 60 * 1000;
    const processingIsFresh = existing.status === "processing"
      && existing.processing_started_at
      && Date.parse(existing.processing_started_at) > staleBefore;
    if (processingIsFresh) return "busy";
    database.prepare(`UPDATE billing_events SET type = ?, payload_json = ?, status = 'processing', attempts = attempts + 1,
      last_error = NULL, processing_started_at = ?, updated_at = ? WHERE stripe_event_id = ?`)
      .run(input.eventType, input.payloadJson, now, now, input.eventId);
    return "claimed";
  });
}

export function completeBillingEvent(eventId: string) {
  const now = new Date().toISOString();
  database.prepare(`UPDATE billing_events SET status = 'completed', completed_at = ?, processed_at = ?,
    processing_started_at = NULL, last_error = NULL, updated_at = ? WHERE stripe_event_id = ?`)
    .run(now, now, now, eventId);
}

export function failBillingEvent(eventId: string, message: string) {
  database.prepare(`UPDATE billing_events SET status = 'failed', last_error = ?, processing_started_at = NULL, updated_at = ?
    WHERE stripe_event_id = ?`).run(message.slice(0, 500), new Date().toISOString(), eventId);
}

export function completeCreditCheckout(input: { checkoutSessionId: string; paymentIntentId: string; ledgerId: string }) {
  return transaction(() => {
    const now = new Date().toISOString();
    const order = database.prepare(`SELECT id, user_id, credits, status, payment_intent_id, stripe_price_id FROM billing_orders
      WHERE stripe_checkout_session_id = ? AND kind = 'credits'`)
      .get(input.checkoutSessionId) as { id: string; user_id: string; credits: number; status: string; payment_intent_id: string | null; stripe_price_id: string | null } | undefined;
    if (!order) return false;
    if (order.status === "paid" && order.payment_intent_id !== input.paymentIntentId) return false;
    if (order.status !== "paid") {
      const account = getCreditAccount(order.user_id);
      const availableAfter = account.available + order.credits;
      database.prepare("UPDATE credit_accounts SET available = ?, updated_at = ? WHERE user_id = ?")
        .run(availableAfter, now, order.user_id);
      database.prepare(`INSERT INTO credit_ledger
        (id, user_id, type, amount, balance_after, reference_id, description, created_at)
        VALUES (?, ?, 'purchase_grant', ?, ?, ?, 'Stripe credit-pack purchase', ?)`)
        .run(input.ledgerId, order.user_id, order.credits, availableAfter, input.checkoutSessionId, now);
      database.prepare(`UPDATE billing_orders SET status = 'paid', payment_intent_id = ?, completed_at = ? WHERE id = ?`)
        .run(input.paymentIntentId, now, order.id);
    }
    database.prepare(`INSERT INTO billing_payments
      (payment_intent_id, user_id, billing_order_id, invoice_id, kind, credits_granted, status, stripe_price_id, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'credits', ?, 'paid', ?, ?, ?)
      ON CONFLICT(payment_intent_id) DO UPDATE SET updated_at = excluded.updated_at`)
      .run(input.paymentIntentId, order.user_id, order.id, order.credits, order.stripe_price_id, now, now);
    return true;
  });
}

export function completeSubscriptionCheckout(input: { checkoutSessionId: string; customerId: string; subscriptionId: string }) {
  return transaction(() => {
    const now = new Date().toISOString();
    const order = database.prepare(`SELECT id, user_id, offer_id FROM billing_orders
      WHERE stripe_checkout_session_id = ? AND kind = 'subscription'`)
      .get(input.checkoutSessionId) as { id: string; user_id: string; offer_id: string } | undefined;
    if (!order) return false;
    database.prepare("UPDATE billing_orders SET status = 'paid', completed_at = COALESCE(completed_at, ?) WHERE id = ?")
      .run(now, order.id);
    database.prepare(`UPDATE billing_accounts SET stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = ?
      WHERE user_id = ?`).run(input.customerId, input.subscriptionId, now, order.user_id);
    if (order.offer_id === "creator_intro") {
      database.prepare("UPDATE pricing_promotions SET redeemed_at = COALESCE(redeemed_at, ?) WHERE user_id = ?")
        .run(now, order.user_id);
    }
    return true;
  });
}

export function completeSubscriptionInvoice(input: {
  customerId: string;
  subscriptionId: string;
  invoiceId: string;
  paymentIntentId: string;
  stripePriceId: string;
  credits: number;
  periodEnd: string | null;
  ledgerId: string;
}) {
  return transaction(() => {
    const now = new Date().toISOString();
    const accountRow = database.prepare(`SELECT user_id, stripe_subscription_id FROM billing_accounts
      WHERE stripe_customer_id = ?`).get(input.customerId) as { user_id: string; stripe_subscription_id: string | null } | undefined;
    if (!accountRow || (accountRow.stripe_subscription_id && accountRow.stripe_subscription_id !== input.subscriptionId)) return false;
    const existing = database.prepare("SELECT invoice_id, payment_intent_id FROM billing_payments WHERE invoice_id = ? OR payment_intent_id = ?")
      .get(input.invoiceId, input.paymentIntentId) as { invoice_id: string | null; payment_intent_id: string } | undefined;
    if (existing && (existing.invoice_id !== input.invoiceId || existing.payment_intent_id !== input.paymentIntentId)) return false;
    if (!existing) {
      const account = getCreditAccount(accountRow.user_id);
      const availableAfter = account.available + input.credits;
      database.prepare("UPDATE credit_accounts SET available = ?, updated_at = ? WHERE user_id = ?")
        .run(availableAfter, now, accountRow.user_id);
      database.prepare(`INSERT INTO credit_ledger
        (id, user_id, type, amount, balance_after, reference_id, description, created_at)
        VALUES (?, ?, 'subscription_grant', ?, ?, ?, 'Paid Creator subscription invoice', ?)`)
        .run(input.ledgerId, accountRow.user_id, input.credits, availableAfter, input.invoiceId, now);
      const order = database.prepare(`SELECT id FROM billing_orders WHERE user_id = ? AND kind = 'subscription'
        ORDER BY created_at DESC LIMIT 1`).get(accountRow.user_id) as { id: string } | undefined;
      database.prepare(`INSERT INTO billing_payments
        (payment_intent_id, user_id, billing_order_id, invoice_id, kind, credits_granted, status, stripe_price_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'subscription', ?, 'paid', ?, ?, ?)`)
        .run(input.paymentIntentId, accountRow.user_id, order?.id ?? null, input.invoiceId, input.credits, input.stripePriceId, now, now);
    }
    database.prepare(`UPDATE billing_accounts SET stripe_subscription_id = ?, plan = 'creator', status = 'active',
      current_period_end = COALESCE(?, current_period_end), cancel_at_period_end = 0,
      spending_blocked = 0, block_reason = NULL, updated_at = ? WHERE user_id = ?`)
      .run(input.subscriptionId, input.periodEnd, now, accountRow.user_id);
    return true;
  });
}

export function updateSubscriptionStatus(input: {
  customerId: string;
  subscriptionId: string | null;
  status: BillingSummary["account"]["status"];
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const now = new Date().toISOString();
  const account = database.prepare("SELECT stripe_subscription_id FROM billing_accounts WHERE stripe_customer_id = ?")
    .get(input.customerId) as { stripe_subscription_id: string | null } | undefined;
  if (!account || (account.stripe_subscription_id && input.subscriptionId && account.stripe_subscription_id !== input.subscriptionId)) return false;
  const plan = input.status === "canceled" || input.status === "inactive" ? "free" : "creator";
  database.prepare(`UPDATE billing_accounts SET stripe_subscription_id = COALESCE(?, stripe_subscription_id), plan = ?, status = ?,
    current_period_end = COALESCE(?, current_period_end), cancel_at_period_end = ?, updated_at = ? WHERE stripe_customer_id = ?`)
    .run(input.subscriptionId, plan, input.status, input.periodEnd, input.cancelAtPeriodEnd ? 1 : 0, now, input.customerId);
  return true;
}

export function expireBillingCheckout(checkoutSessionId: string) {
  const result = database.prepare("UPDATE billing_orders SET status = 'expired' WHERE stripe_checkout_session_id = ? AND status = 'pending'")
    .run(checkoutSessionId);
  return result.changes > 0 || Boolean(database.prepare("SELECT 1 FROM billing_orders WHERE stripe_checkout_session_id = ?").get(checkoutSessionId));
}

export function markPaymentReversal(input: { paymentIntentId: string; eventId: string; status: "refunded" | "disputed"; reason: string }) {
  return transaction(() => {
    const payment = database.prepare("SELECT user_id, billing_order_id FROM billing_payments WHERE payment_intent_id = ?")
      .get(input.paymentIntentId) as { user_id: string; billing_order_id: string | null } | undefined;
    if (!payment) return false;
    const now = new Date().toISOString();
    database.prepare(`UPDATE billing_payments SET status = ?, financial_event_id = ?, updated_at = ? WHERE payment_intent_id = ?`)
      .run(input.status, input.eventId, now, input.paymentIntentId);
    if (payment.billing_order_id) {
      database.prepare(`UPDATE billing_orders SET financial_status = ?, financial_event_id = ?, financial_updated_at = ? WHERE id = ?`)
        .run(input.status, input.eventId, now, payment.billing_order_id);
    }
    database.prepare(`UPDATE billing_accounts SET spending_blocked = 1, block_reason = ?, updated_at = ? WHERE user_id = ?`)
      .run(input.reason.slice(0, 240), now, payment.user_id);
    return true;
  });
}

export function consumeRateLimit(bucketKey: string, limit: number, windowMs: number, nowMs = Date.now()) {
  return transaction(() => {
    const current = database.prepare("SELECT count, reset_at FROM rate_limit_buckets WHERE bucket_key = ?")
      .get(bucketKey) as { count: number; reset_at: number } | undefined;
    const resetAt = !current || current.reset_at <= nowMs ? nowMs + windowMs : current.reset_at;
    const count = !current || current.reset_at <= nowMs ? 1 : current.count + 1;
    database.prepare(`INSERT INTO rate_limit_buckets (bucket_key, count, reset_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at, updated_at = excluded.updated_at`)
      .run(bucketKey, count, resetAt, new Date(nowMs).toISOString());
    return { allowed: count <= limit, count, remaining: Math.max(0, limit - count), resetAt };
  });
}

export function runMaintenance(now = new Date()) {
  return transaction(() => {
    const nowIso = now.toISOString();
    const stalledBefore = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const guestBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const idempotencyBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const recoverable = database.prepare(`SELECT g.id, g.owner_user_id, g.anonymous_session_id, g.credit_cost, g.created_at, g.status
      FROM generations g
      WHERE (g.status = 'processing' AND g.created_at < ?)
         OR (g.status IN ('complete', 'failed') AND EXISTS (
           SELECT 1 FROM credit_ledger l WHERE l.user_id = g.owner_user_id AND l.type = 'generation_reservation'
             AND l.reference_id = g.id AND NOT EXISTS (
               SELECT 1 FROM credit_ledger closed WHERE closed.user_id = g.owner_user_id
                 AND closed.reference_id = g.id AND closed.type IN ('generation_settlement', 'generation_refund')
             )
         ))`).all(stalledBefore) as unknown as Array<{
           id: string; owner_user_id: string | null; anonymous_session_id: string | null; credit_cost: number; created_at: string; status: string;
         }>;
    let recoveredReservations = 0;
    let failedStalled = 0;
    for (const generation of recoverable) {
      if (generation.status === "processing") {
        database.prepare("UPDATE generations SET status = 'failed', updated_at = ? WHERE id = ?").run(nowIso, generation.id);
        failedStalled += 1;
      }
      if (generation.owner_user_id && generation.credit_cost > 0) {
        const account = getCreditAccount(generation.owner_user_id);
        if (generation.status === "complete") {
          database.prepare("UPDATE credit_accounts SET reserved = MAX(reserved - ?, 0), updated_at = ? WHERE user_id = ?")
            .run(generation.credit_cost, nowIso, generation.owner_user_id);
          database.prepare(`INSERT OR IGNORE INTO credit_ledger
            (id, user_id, type, amount, balance_after, reference_id, description, created_at)
            VALUES (?, ?, 'generation_settlement', 0, ?, ?, 'Recovered completed generation settlement', ?)`)
            .run(crypto.randomUUID(), generation.owner_user_id, account.available, generation.id, nowIso);
        } else {
          const availableAfter = account.available + generation.credit_cost;
          database.prepare("UPDATE credit_accounts SET available = ?, reserved = MAX(reserved - ?, 0), updated_at = ? WHERE user_id = ?")
            .run(availableAfter, generation.credit_cost, nowIso, generation.owner_user_id);
          database.prepare(`INSERT OR IGNORE INTO credit_ledger
            (id, user_id, type, amount, balance_after, reference_id, description, created_at)
            VALUES (?, ?, 'generation_refund', ?, ?, ?, 'Recovered stranded generation reservation', ?)`)
            .run(crypto.randomUUID(), generation.owner_user_id, generation.credit_cost, availableAfter, generation.id, nowIso);
        }
        recoveredReservations += 1;
      } else if (generation.anonymous_session_id && generation.status === "processing" && generation.created_at.slice(0, 10) === nowIso.slice(0, 10)) {
        database.prepare("UPDATE anonymous_sessions SET used_count = MAX(used_count - 1, 0) WHERE id = ? AND quota_date = ?")
          .run(generation.anonymous_session_id, nowIso.slice(0, 10));
      }
    }
    const guestAssetsDeleted = database.prepare("DELETE FROM generations WHERE anonymous_session_id IS NOT NULL AND created_at < ?")
      .run(guestBefore).changes;
    const expiredSessions = database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso).changes;
    const expiredGuests = database.prepare("DELETE FROM anonymous_sessions WHERE expires_at <= ?").run(nowIso).changes;
    const expiredTokens = database.prepare("DELETE FROM security_tokens WHERE expires_at <= ? OR consumed_at IS NOT NULL").run(nowIso).changes;
    const expiredOAuth = database.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").run(nowIso).changes;
    const expiredIdempotency = database.prepare("DELETE FROM idempotency_keys WHERE created_at < ?").run(idempotencyBefore).changes;
    const expiredRateLimits = database.prepare("DELETE FROM rate_limit_buckets WHERE reset_at <= ?").run(now.getTime()).changes;
    const details = { failedStalled, recoveredReservations, guestAssetsDeleted, expiredSessions, expiredGuests, expiredTokens, expiredOAuth, expiredIdempotency, expiredRateLimits };
    database.prepare(`INSERT INTO maintenance_runs (name, last_run_at, details_json) VALUES ('retention', ?, ?)
      ON CONFLICT(name) DO UPDATE SET last_run_at = excluded.last_run_at, details_json = excluded.details_json`)
      .run(nowIso, JSON.stringify(details));
    return details;
  });
}

export function maintenanceStatus() {
  const row = database.prepare("SELECT last_run_at, details_json FROM maintenance_runs WHERE name = 'retention'")
    .get() as { last_run_at: string; details_json: string } | undefined;
  return row ? { lastRunAt: row.last_run_at, details: JSON.parse(row.details_json) as Record<string, number> } : null;
}

export function deleteUserAccount(userId: string) {
  return database.prepare("DELETE FROM users WHERE id = ?").run(userId).changes > 0;
}

export function resetDatabaseForTests() {
  database.exec(`
    DELETE FROM api_request_logs;
    DELETE FROM rate_limit_buckets;
    DELETE FROM maintenance_runs;
    DELETE FROM billing_events;
    DELETE FROM billing_payments;
    DELETE FROM billing_orders;
    DELETE FROM pricing_promotions;
    DELETE FROM billing_accounts;
    DELETE FROM oauth_states;
    DELETE FROM oauth_identities;
    DELETE FROM security_tokens;
    DELETE FROM idempotency_keys;
    DELETE FROM api_keys;
    DELETE FROM credit_ledger;
    DELETE FROM generations;
    DELETE FROM projects;
    DELETE FROM credit_accounts;
    DELETE FROM sessions;
    DELETE FROM anonymous_sessions;
    DELETE FROM users;
  `);
}

export function closeDatabase() {
  database.close();
}
