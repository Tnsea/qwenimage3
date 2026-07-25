CREATE TABLE IF NOT EXISTS billing_reviews (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL UNIQUE
    REFERENCES billing_payments(payment_intent_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latest_trigger_type TEXT NOT NULL
    CHECK(latest_trigger_type IN ('early_fraud_warning', 'refund', 'dispute')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open', 'resolved')),
  decision TEXT
    CHECK(decision IS NULL OR decision IN ('confirmed_loss', 'cleared')),
  credits_at_risk INTEGER NOT NULL CHECK(credits_at_risk >= 0),
  credits_reclaimed INTEGER NOT NULL DEFAULT 0 CHECK(credits_reclaimed >= 0),
  unrecovered_credits INTEGER NOT NULL DEFAULT 0 CHECK(unrecovered_credits >= 0),
  operator_note TEXT,
  resolved_by TEXT,
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK(credits_reclaimed <= credits_at_risk),
  CHECK(unrecovered_credits <= credits_at_risk)
);

CREATE INDEX IF NOT EXISTS billing_reviews_queue_idx
  ON billing_reviews(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS billing_reviews_user_idx
  ON billing_reviews(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS billing_review_events (
  stripe_event_id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES billing_reviews(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL
    CHECK(trigger_type IN ('early_fraud_warning', 'refund', 'dispute')),
  amount_cents_at_risk INTEGER NOT NULL CHECK(amount_cents_at_risk >= 0),
  credits_at_risk INTEGER NOT NULL CHECK(credits_at_risk >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_review_events_review_idx
  ON billing_review_events(review_id, created_at ASC);

CREATE TABLE IF NOT EXISTS billing_review_actions (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES billing_reviews(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('confirmed_loss', 'cleared')),
  credits_reclaimed INTEGER NOT NULL DEFAULT 0 CHECK(credits_reclaimed >= 0),
  unrecovered_after INTEGER NOT NULL DEFAULT 0 CHECK(unrecovered_after >= 0),
  operator_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(review_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS billing_review_actions_review_idx
  ON billing_review_actions(review_id, created_at DESC);

INSERT OR IGNORE INTO billing_reviews
  (id, payment_intent_id, user_id, latest_trigger_type, status, credits_at_risk,
    opened_at, updated_at)
SELECT
  'review:' || payment_intent_id,
  payment_intent_id,
  user_id,
  CASE status WHEN 'refunded' THEN 'refund' ELSE 'dispute' END,
  'open',
  credits_granted,
  updated_at,
  updated_at
FROM billing_payments
WHERE status IN ('refunded', 'disputed');

INSERT OR IGNORE INTO billing_review_events
  (stripe_event_id, review_id, trigger_type, amount_cents_at_risk,
    credits_at_risk, created_at)
SELECT
  financial_event_id,
  'review:' || payment_intent_id,
  CASE status WHEN 'refunded' THEN 'refund' ELSE 'dispute' END,
  amount_cents,
  credits_granted,
  updated_at
FROM billing_payments
WHERE status IN ('refunded', 'disputed')
  AND financial_event_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM billing_reviews
    WHERE billing_reviews.payment_intent_id = billing_payments.payment_intent_id
  );

INSERT OR IGNORE INTO billing_reviews
  (id, payment_intent_id, user_id, latest_trigger_type, status, credits_at_risk,
    opened_at, updated_at)
SELECT
  'review:' || risk.payment_intent_id,
  risk.payment_intent_id,
  risk.user_id,
  'early_fraud_warning',
  'open',
  payment.credits_granted,
  risk.created_at,
  risk.updated_at
FROM billing_risk_events risk
JOIN billing_payments payment
  ON payment.payment_intent_id = risk.payment_intent_id
WHERE risk.actionable = 1
  AND risk.status = 'open';

INSERT OR IGNORE INTO billing_review_events
  (stripe_event_id, review_id, trigger_type, amount_cents_at_risk,
    credits_at_risk, created_at)
SELECT
  risk.stripe_event_id,
  review.id,
  'early_fraud_warning',
  payment.amount_cents,
  payment.credits_granted,
  risk.created_at
FROM billing_risk_events risk
JOIN billing_reviews review
  ON review.payment_intent_id = risk.payment_intent_id
JOIN billing_payments payment
  ON payment.payment_intent_id = risk.payment_intent_id
WHERE risk.actionable = 1;

UPDATE billing_accounts
SET spending_blocked = 1,
  block_reason = 'Credit spending is paused while a payment risk review is open.'
WHERE EXISTS (
  SELECT 1
  FROM billing_reviews review
  WHERE review.user_id = billing_accounts.user_id
    AND review.status = 'open'
);
