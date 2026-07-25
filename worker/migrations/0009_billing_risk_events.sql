CREATE TABLE IF NOT EXISTS billing_risk_events (
  stripe_event_id TEXT PRIMARY KEY,
  warning_id TEXT NOT NULL UNIQUE,
  charge_id TEXT NOT NULL,
  payment_intent_id TEXT NOT NULL REFERENCES billing_payments(payment_intent_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind = 'early_fraud_warning'),
  actionable INTEGER NOT NULL CHECK(actionable IN (0, 1)),
  fraud_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open', 'non_actionable', 'resolved')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_risk_events_user_idx
  ON billing_risk_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS billing_risk_events_payment_idx
  ON billing_risk_events(payment_intent_id, created_at DESC);

