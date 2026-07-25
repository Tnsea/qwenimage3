ALTER TABLE account_deletion_audit ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE account_deletion_audit ADD COLUMN stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS account_deletion_audit_customer_idx
  ON account_deletion_audit(stripe_customer_id);

CREATE INDEX IF NOT EXISTS account_deletion_audit_subscription_idx
  ON account_deletion_audit(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS billing_deleted_payment_tombstones (
  payment_intent_id TEXT PRIMARY KEY,
  former_user_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_deleted_payment_user_idx
  ON billing_deleted_payment_tombstones(former_user_id, deleted_at DESC);
