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

CREATE UNIQUE INDEX IF NOT EXISTS billing_price_versions_active_offer_idx
  ON billing_price_versions(offer_id) WHERE active_for_checkout = 1;
CREATE INDEX IF NOT EXISTS billing_price_versions_offer_history_idx
  ON billing_price_versions(offer_id, effective_from DESC);

INSERT OR IGNORE INTO billing_price_versions
  (stripe_price_id, offer_id, kind, amount_cents, currency, credits, active_for_checkout, effective_from, created_at)
VALUES
  ('price_1TwEbTQnZzuLeKGY8QOg8XtQ', 'creator_intro', 'subscription', 800, 'usd', 300, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwEYzQnZzuLeKGYJiEnuAxo', 'creator_monthly', 'subscription', 1000, 'usd', 300, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwEd3QnZzuLeKGYOXCJommu', 'credits_100', 'credits', 700, 'usd', 100, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwEeoQnZzuLeKGYpqgbXL5p', 'credits_300', 'credits', 1800, 'usd', 300, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z');

ALTER TABLE billing_orders ADD COLUMN stripe_price_id TEXT;
ALTER TABLE billing_payments ADD COLUMN stripe_price_id TEXT;

UPDATE billing_orders
SET stripe_price_id = (
  SELECT version.stripe_price_id
  FROM billing_price_versions AS version
  WHERE version.offer_id = billing_orders.offer_id
    AND version.active_for_checkout = 1
)
WHERE stripe_price_id IS NULL;

UPDATE billing_payments
SET stripe_price_id = (
  SELECT billing_orders.stripe_price_id
  FROM billing_orders
  WHERE billing_orders.id = billing_payments.billing_order_id
)
WHERE stripe_price_id IS NULL;

CREATE INDEX IF NOT EXISTS billing_orders_stripe_price_idx
  ON billing_orders(stripe_price_id);
CREATE INDEX IF NOT EXISTS billing_payments_stripe_price_idx
  ON billing_payments(stripe_price_id);
