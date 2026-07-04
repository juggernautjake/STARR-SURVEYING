-- seeds/400_learn_tutor_conversations.sql
-- Saved AI-tutor conversations so students can reopen + review them later.
-- Thread stored as JSONB (message items: {role, content}). Row-scoped per user;
-- API routes access it via the service role, so RLS is enabled with no public
-- policies (service role bypasses RLS; anon/authenticated are denied).
CREATE TABLE IF NOT EXISTS learn_tutor_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email    text NOT NULL,
  title         text NOT NULL DEFAULT 'Conversation',
  topic         text,
  module_id     text,
  module_title  text,
  messages      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learn_tutor_conv_user
  ON learn_tutor_conversations (user_email, updated_at DESC);
ALTER TABLE learn_tutor_conversations ENABLE ROW LEVEL SECURITY;
