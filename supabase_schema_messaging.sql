-- =============================================================================
-- STARR SURVEYING — Internal Messaging System Schema
-- Run this AFTER supabase_schema_v3.sql
-- =============================================================================

-- Conversations table: represents a thread between 2+ people
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,                                    -- NULL for 1:1, set for group chats
  type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group', 'announcement')),
  created_by TEXT NOT NULL,                      -- email of creator
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_preview TEXT,                     -- truncated preview of last message
  is_archived BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',                   -- extensible (e.g. linked job_id, project context)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation participants: who is in each conversation
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
  nickname TEXT,                                 -- optional display name override
  is_muted BOOLEAN DEFAULT FALSE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,                           -- NULL if still active
  UNIQUE(conversation_id, user_email)
);

-- Messages table: individual messages within conversations
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  content TEXT NOT NULL,                          -- message body (supports markdown/HTML)
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system', 'link')),
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,  -- threaded replies
  attachments JSONB DEFAULT '[]',                -- array of {url, name, size, type}
  metadata JSONB DEFAULT '{}',                   -- extensible (reactions, edits, etc.)
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,              -- soft delete
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message read receipts: track who has read each message
CREATE TABLE IF NOT EXISTS message_read_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_email)
);

-- Message reactions: emoji reactions on messages
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_email, emoji)
);

-- User messaging preferences
CREATE TABLE IF NOT EXISTS messaging_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL UNIQUE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  sound_enabled BOOLEAN DEFAULT TRUE,
  desktop_notifications BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT FALSE,     -- digest emails
  auto_archive_days INTEGER DEFAULT 0,           -- 0 = never
  theme TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pinned messages
CREATE TABLE IF NOT EXISTS pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by TEXT NOT NULL,
  pinned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, message_id)
);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);
CREATE INDEX IF NOT EXISTS idx_conv_participants_email ON conversation_participants(user_email);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_email);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_message ON message_read_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_user ON message_read_receipts(user_email);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_pinned_conv ON pinned_messages(conversation_id);

-- ===== TRIGGERS =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_conversations_updated') THEN
    CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_msg_prefs_updated') THEN
    CREATE TRIGGER trg_msg_prefs_updated BEFORE UPDATE ON messaging_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ===== ROW LEVEL SECURITY =====
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so these policies are for anon/user access
CREATE POLICY "conversations_service" ON conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "conv_participants_service" ON conversation_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "messages_service" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "read_receipts_service" ON message_read_receipts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "reactions_service" ON message_reactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "msg_prefs_service" ON messaging_preferences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pinned_service" ON pinned_messages FOR ALL USING (true) WITH CHECK (true);
