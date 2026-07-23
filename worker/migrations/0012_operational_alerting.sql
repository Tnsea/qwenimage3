CREATE TABLE IF NOT EXISTS operational_alert_state (
  alert_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'healthy'
    CHECK(status IN ('healthy', 'unhealthy')),
  fingerprint TEXT NOT NULL DEFAULT '',
  last_checked_at TEXT,
  last_attempt_at TEXT,
  last_sent_at TEXT,
  last_recovered_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operational_alert_deliveries (
  id TEXT PRIMARY KEY,
  alert_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('alert', 'reminder', 'recovery', 'test')),
  status TEXT NOT NULL CHECK(status IN ('sending', 'delivered', 'failed')),
  fingerprint TEXT NOT NULL,
  subject TEXT NOT NULL,
  error TEXT,
  operator_id TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS operational_alert_deliveries_key_idx
  ON operational_alert_deliveries(alert_key, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS operational_alert_deliveries_test_key_idx
  ON operational_alert_deliveries(idempotency_key)
  WHERE kind = 'test' AND idempotency_key IS NOT NULL;

INSERT OR IGNORE INTO operational_alert_state
  (alert_key, status, fingerprint, updated_at)
VALUES ('billing-health', 'healthy', '', datetime('now'));
