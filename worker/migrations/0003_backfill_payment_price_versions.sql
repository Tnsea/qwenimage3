UPDATE billing_payments
SET stripe_price_id = COALESCE(
  (
    SELECT billing_orders.stripe_price_id
    FROM billing_orders
    WHERE billing_orders.user_id = billing_payments.user_id
      AND billing_orders.kind = billing_payments.kind
      AND billing_orders.amount_cents = billing_payments.amount_cents
      AND billing_orders.currency = billing_payments.currency
      AND billing_orders.stripe_price_id IS NOT NULL
    ORDER BY billing_orders.created_at DESC
    LIMIT 1
  ),
  (
    SELECT billing_price_versions.stripe_price_id
    FROM billing_price_versions
    WHERE billing_price_versions.kind = billing_payments.kind
      AND billing_price_versions.amount_cents = billing_payments.amount_cents
      AND billing_price_versions.currency = billing_payments.currency
    ORDER BY billing_price_versions.effective_from DESC
    LIMIT 1
  )
)
WHERE stripe_price_id IS NULL;
