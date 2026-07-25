UPDATE billing_price_versions
SET active_for_checkout = 0,
    retired_at = COALESCE(retired_at, '2026-07-23T00:00:00.000Z')
WHERE active_for_checkout = 1;

INSERT INTO billing_price_versions (
  stripe_price_id,
  offer_id,
  kind,
  amount_cents,
  currency,
  credits,
  active_for_checkout,
  effective_from,
  created_at
)
VALUES
  ('price_1TwMSWHyVvkt92TEJXyOtAjU', 'starter_monthly', 'subscription', 990, 'usd', 500, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMSWHyVvkt92TE7PQbN7jU', 'starter_yearly', 'subscription', 9900, 'usd', 6000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMSXHyVvkt92TEeoNEvU57', 'creator_monthly', 'subscription', 2990, 'usd', 2000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMSYHyVvkt92TELfcuWC5B', 'creator_yearly', 'subscription', 29900, 'usd', 24000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMSZHyVvkt92TEfGFFtnKF', 'professional_monthly', 'subscription', 5990, 'usd', 5000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMSaHyVvkt92TEtH8a22JR', 'professional_yearly', 'subscription', 59900, 'usd', 60000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMSbHyVvkt92TEBWGvGd0Y', 'credits_400', 'credits', 1200, 'usd', 400, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMScHyVvkt92TENyvKVc2Z', 'credits_1200', 'credits', 3000, 'usd', 1200, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMSdHyVvkt92TEhloi1tBj', 'credits_3000', 'credits', 6000, 'usd', 3000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z');

