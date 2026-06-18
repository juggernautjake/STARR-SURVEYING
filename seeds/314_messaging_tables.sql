-- ============================================================================
-- 314_messaging_tables.sql
--
-- The internal messenger (FloatingMessenger + /admin/messages) reads / writes
-- five tables that were never seeded into the repo:
--   - conversations
--   - conversation_participants
--   - messages
--   - message_read_receipts
--   - message_reactions
--
-- Without these, every `/api/admin/messages/*` call silently 500s, the send
-- button "does nothing", and recipients never see new messages.
--
-- This seed creates the full set with the columns the API actually queries
-- (audited against app/api/admin/messages/{send,conversations,read,reactions,
-- mentions,search,contacts}/route.ts). Idempotent — safe to re-run.
-- ============================================================================

BEGIN;

-- ── conversations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT,
  type                 TEXT NOT NULL DEFAULT 'direct'
                         CHECK (type IN ('direct', 'group')),
  created_by           TEXT NOT NULL,
  metadata             JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_archived          BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at      TIMESTAMPTZ,
  last_message_preview TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON public.conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by
  ON public.conversations(created_by);

-- ── conversation_participants ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_email      TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at         TIMESTAMPTZ,
  last_read_at    TIMESTAMPTZ,
  UNIQUE (conversation_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user
  ON public.conversation_participants(user_email)
  WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conv_participants_conversation
  ON public.conversation_participants(conversation_id)
  WHERE left_at IS NULL;

-- ── messages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_email    TEXT NOT NULL,
  content         TEXT NOT NULL,
  message_type    TEXT NOT NULL DEFAULT 'text',
  reply_to_id     UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  attachments     JSONB NOT NULL DEFAULT '[]'::JSONB,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  is_edited       BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages(sender_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_not_deleted
  ON public.messages(conversation_id, created_at DESC)
  WHERE is_deleted = FALSE;

-- ── message_read_receipts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_message_read_receipts_user
  ON public.message_read_receipts(user_email, read_at DESC);

-- ── message_reactions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_email, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON public.message_reactions(message_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- The API gates access in code (every route checks
-- conversation_participants membership before reading / writing). The
-- supabaseAdmin client uses the service role, which bypasses RLS. We still
-- enable RLS so direct anon/authenticated access can't leak data if anyone
-- later hits these tables from the browser.
ALTER TABLE public.conversations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_read_receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions          ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'messaging_service_role_all_conv') THEN
    CREATE POLICY messaging_service_role_all_conv ON public.conversations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'messaging_service_role_all_parts') THEN
    CREATE POLICY messaging_service_role_all_parts ON public.conversation_participants
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'messaging_service_role_all_msgs') THEN
    CREATE POLICY messaging_service_role_all_msgs ON public.messages
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'messaging_service_role_all_reads') THEN
    CREATE POLICY messaging_service_role_all_reads ON public.message_read_receipts
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'messaging_service_role_all_reactions') THEN
    CREATE POLICY messaging_service_role_all_reactions ON public.message_reactions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ── Verification ──────────────────────────────────────────────────────────
--   SELECT to_regclass('public.conversations'),
--          to_regclass('public.conversation_participants'),
--          to_regclass('public.messages'),
--          to_regclass('public.message_read_receipts'),
--          to_regclass('public.message_reactions');
--   -- all five should return their table names (not NULL)
