ALTER TABLE generations ADD COLUMN provider_task_id TEXT;

CREATE INDEX IF NOT EXISTS generations_provider_task_idx
  ON generations(provider, provider_task_id)
  WHERE provider_task_id IS NOT NULL;
