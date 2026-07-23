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
  ('price_1TwMtcQnZzuLeKGY4q9BLtC8', 'starter_monthly', 'subscription', 990, 'usd', 500, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMtdQnZzuLeKGYO9XegLIL', 'starter_yearly', 'subscription', 9900, 'usd', 6000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMtdQnZzuLeKGYWgoYcaNO', 'creator_monthly', 'subscription', 2990, 'usd', 2000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMteQnZzuLeKGYjxknzpZe', 'creator_yearly', 'subscription', 29900, 'usd', 24000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMteQnZzuLeKGYjqn4eG12', 'professional_monthly', 'subscription', 5990, 'usd', 5000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMtfQnZzuLeKGYlJ54i9gT', 'professional_yearly', 'subscription', 59900, 'usd', 60000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMtfQnZzuLeKGYh8V43qBj', 'credits_400', 'credits', 1200, 'usd', 400, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMtfQnZzuLeKGYXOU6BWcs', 'credits_1200', 'credits', 3000, 'usd', 1200, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
  ('price_1TwMtgQnZzuLeKGY6JgUP5NB', 'credits_3000', 'credits', 6000, 'usd', 3000, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z')
ON CONFLICT(stripe_price_id) DO UPDATE SET
  active_for_checkout = excluded.active_for_checkout,
  retired_at = NULL;
