CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('generation', 'billing', 'api', 'account', 'other')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'waiting', 'resolved', 'closed')),
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK(author IN ('user', 'support')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx
  ON support_tickets(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS support_messages_ticket_idx
  ON support_messages(ticket_id, created_at ASC);
