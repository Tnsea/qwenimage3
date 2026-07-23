CREATE TABLE IF NOT EXISTS billing_terms_acceptances (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  ip_hint TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  PRIMARY KEY (user_id, terms_version)
);

CREATE INDEX IF NOT EXISTS billing_terms_acceptances_version_idx
  ON billing_terms_acceptances(terms_version, accepted_at DESC);

ALTER TABLE billing_checkout_attempts ADD COLUMN terms_version TEXT;
ALTER TABLE billing_checkout_attempts ADD COLUMN terms_accepted_at TEXT;
