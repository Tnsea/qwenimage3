ALTER TABLE billing_accounts
  ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free'
  CHECK(plan_tier IN ('free', 'starter', 'creator', 'professional'));

ALTER TABLE billing_accounts
  ADD COLUMN billing_interval TEXT
  CHECK(billing_interval IN ('month', 'year'));

ALTER TABLE billing_accounts
  ADD COLUMN active_offer_id TEXT;

UPDATE billing_accounts
SET plan_tier = 'creator',
    billing_interval = 'month',
    active_offer_id = 'creator_monthly'
WHERE plan = 'creator';

UPDATE billing_price_versions
SET active_for_checkout = 0,
    retired_at = COALESCE(retired_at, '2026-07-23T00:00:00.000Z')
WHERE active_for_checkout = 1;

CREATE TABLE billing_price_versions_v2 (
  stripe_price_id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL CHECK(offer_id IN (
    'starter_monthly',
    'starter_yearly',
    'creator_intro',
    'creator_monthly',
    'creator_yearly',
    'professional_monthly',
    'professional_yearly',
    'credits_100',
    'credits_300',
    'credits_400',
    'credits_1200',
    'credits_3000'
  )),
  kind TEXT NOT NULL CHECK(kind IN ('subscription', 'credits')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  currency TEXT NOT NULL CHECK(currency = 'usd'),
  credits INTEGER NOT NULL CHECK(credits > 0),
  active_for_checkout INTEGER NOT NULL DEFAULT 0 CHECK(active_for_checkout IN (0, 1)),
  effective_from TEXT NOT NULL,
  retired_at TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO billing_price_versions_v2 (
  stripe_price_id,
  offer_id,
  kind,
  amount_cents,
  currency,
  credits,
  active_for_checkout,
  effective_from,
  retired_at,
  created_at
)
SELECT
  stripe_price_id,
  offer_id,
  kind,
  amount_cents,
  currency,
  credits,
  active_for_checkout,
  effective_from,
  retired_at,
  created_at
FROM billing_price_versions;

DROP TABLE billing_price_versions;
ALTER TABLE billing_price_versions_v2 RENAME TO billing_price_versions;

CREATE UNIQUE INDEX billing_price_versions_active_offer_idx
  ON billing_price_versions(offer_id) WHERE active_for_checkout = 1;
CREATE INDEX billing_price_versions_offer_history_idx
  ON billing_price_versions(offer_id, effective_from DESC);
