PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT NOT NULL,
  ip_hint TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  quota_date TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count >= 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
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
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_reference_idx
  ON credit_ledger(user_id, type, reference_id) WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  anonymous_session_id TEXT REFERENCES anonymous_sessions(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  style TEXT NOT NULL,
  quality TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing', 'complete', 'failed')),
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  mime_type TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  credit_cost INTEGER NOT NULL DEFAULT 0,
  queue_tier TEXT NOT NULL DEFAULT 'free' CHECK(queue_tier IN ('free', 'vip')),
  queued_at TEXT NOT NULL,
  processing_started_at TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((owner_user_id IS NOT NULL) <> (anonymous_session_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS generations_owner_idx ON generations(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generations_guest_idx ON generations(anonymous_session_id, created_at DESC);

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

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS pricing_promotions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  anonymous_session_id TEXT REFERENCES anonymous_sessions(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL CHECK(offer_id = 'creator_intro'),
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  created_at TEXT NOT NULL,
  CHECK((user_id IS NOT NULL) <> (anonymous_session_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pricing_promotion_user_idx
  ON pricing_promotions(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pricing_promotion_guest_idx
  ON pricing_promotions(anonymous_session_id) WHERE anonymous_session_id IS NOT NULL;

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
  financial_status TEXT NOT NULL DEFAULT 'normal' CHECK(financial_status IN ('normal', 'refunded', 'disputed')),
  financial_event_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS billing_orders_user_idx ON billing_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_events (
  stripe_event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  last_error TEXT,
  processing_started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_payments (
  payment_intent_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_order_id TEXT REFERENCES billing_orders(id) ON DELETE SET NULL,
  invoice_id TEXT UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('subscription', 'credits')),
  credits_granted INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid', 'refunded', 'disputed')),
  financial_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
