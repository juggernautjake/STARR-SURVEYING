-- ============================================================================
-- 319_lead_replies.sql
--
-- Track every outbound reply the office sends to a lead from the
-- admin lead-detail Reply composer. The reply itself goes out via
-- Resend (info@starr-surveying.com sender, lead.email recipient); this
-- table is the audit trail / "we already responded" history that the
-- lead detail page renders below the contact card so the surveyor sees
-- what's already been said.
--
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sender_email  TEXT NOT NULL,         -- the surveyor who composed the reply
  to_email      TEXT NOT NULL,         -- snapshot of lead.email at send time
  subject       TEXT NOT NULL,
  body_html     TEXT NOT NULL,         -- rendered HTML (from the rich editor)
  body_text     TEXT,                  -- plain-text fallback
  attachments   JSONB NOT NULL DEFAULT '[]'::JSONB,
  resend_id     TEXT,                  -- Resend's message id when send succeeds
  send_error    TEXT,                  -- last error message when the send failed
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  org_id        UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID
);

COMMENT ON TABLE public.lead_replies IS
  'Audit trail of replies sent from the admin lead-detail Reply composer via Resend.';

CREATE INDEX IF NOT EXISTS idx_lead_replies_lead_id_sent
  ON public.lead_replies (lead_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_replies_sender
  ON public.lead_replies (sender_email, sent_at DESC);

ALTER TABLE public.lead_replies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_lead_replies ON public.lead_replies
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- Verification:
--   SELECT to_regclass('public.lead_replies');     -- non-null
--   SELECT count(*) FROM public.lead_replies;      -- 0 on first apply
