-- ============================================================================
-- 381_email_send_log.sql
--
-- Audit log of admin-composer emails (doc 04, slice EM5). The send route
-- (app/api/admin/email/send/route.ts) inserts one row per send action with
-- who/when/subject + recipient counts, so admins can see a history of what
-- went out (and to how many) without digging through Resend. Viewed via
-- GET /api/admin/email/log → /admin/email/sent.
--
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS email_send_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email   TEXT NOT NULL,
  subject        TEXT NOT NULL,
  role           TEXT,                       -- role broadcast, if any
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count     INTEGER NOT NULL DEFAULT 0,
  failed_count   INTEGER NOT NULL DEFAULT 0,
  recipients     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- the actual addresses
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_send_log_created_at_idx
  ON email_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS email_send_log_sender_idx
  ON email_send_log (sender_email);

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--   SELECT count(*) FROM email_send_log;
