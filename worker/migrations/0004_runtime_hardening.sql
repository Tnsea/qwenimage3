CREATE TABLE IF NOT EXISTS generation_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  generation_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('claimed', 'processing', 'completed', 'failed')),
  failure_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS generation_requests_expiry_idx
  ON generation_requests(expires_at, status);

CREATE TABLE IF NOT EXISTS maintenance_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
  guest_assets_deleted INTEGER NOT NULL DEFAULT 0,
  stale_generations_recovered INTEGER NOT NULL DEFAULT 0,
  completed_reservations_settled INTEGER NOT NULL DEFAULT 0,
  failed_billing_events_retried INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS maintenance_runs_started_idx
  ON maintenance_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('google', 'github')),
  code_verifier TEXT NOT NULL,
  anonymous_session_id TEXT REFERENCES anonymous_sessions(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_states_expiry_idx ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS oauth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('google', 'github')),
  provider_subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS oauth_identities_user_idx ON oauth_identities(user_id);

CREATE TABLE IF NOT EXISTS billing_checkout_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('subscription', 'credits')),
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('creating', 'created', 'failed', 'completed')),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS billing_checkout_attempts_user_idx
  ON billing_checkout_attempts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS account_deletion_jobs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('requested', 'subscription_canceled', 'customer_deleted', 'assets_deleted', 'failed')),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
