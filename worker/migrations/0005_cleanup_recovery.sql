CREATE TABLE IF NOT EXISTS r2_deletion_queue (
  object_key TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  reference_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS r2_deletion_queue_updated_idx
  ON r2_deletion_queue(updated_at, attempts);

CREATE TABLE IF NOT EXISTS account_deletion_audit (
  id TEXT PRIMARY KEY,
  former_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed')),
  assets_queued INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS account_deletion_audit_completed_idx
  ON account_deletion_audit(completed_at DESC);
