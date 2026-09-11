-- seeds/635_phone_calls.sql — one row per call to the business line.
--
-- Owner, 2026-09-11: "a total UI … dedicated page(s) for listening to the recordings and seeing the
-- transcribed conversations and the AI analysis. If a call comes in on the business number, then it
-- should notify us on the website and we should be able to click the notification and go to the
-- page to listen to the recording. Then we should be able to create a new project from the call."
--
-- Written by the Twilio webhooks (app/api/twilio/*) as the call unfolds: the entry route inserts
-- the row, the after-dial route records who answered, the turn route appends the transcript and
-- facts, the recording callback attaches the audio, and the analysis lands last. Read by
-- /admin/calls. Named `phone_calls` rather than `calls` because a `calls` table already exists in
-- the live schema with a different purpose (see lib/saas/org-scope.ts).
--
-- org_id follows the tenancy rule (audit §3c.1 item 8g): set by the webhook through the same
-- resolver the lead intake uses, filtered automatically for scoped admin sessions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.phone_calls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid,

  call_sid            text NOT NULL UNIQUE,
  from_number         text NOT NULL DEFAULT '',
  to_number           text NOT NULL DEFAULT '',
  direction           text NOT NULL DEFAULT 'inbound',

  -- ringing | in-progress | completed | failed
  status              text NOT NULL DEFAULT 'ringing',
  -- owner | ai | voicemail | none
  answered_by         text,

  -- What the receptionist learned. Mirrors lib/receptionist/state.ts CallFacts.
  kind                text,           -- customer | personal | vendor | unknown
  caller_name         text,
  callback_number     text,
  property_address    text,
  service             text,
  details             text,

  -- [{ role: 'caller'|'assistant'|'owner', text, at }]
  transcript          jsonb NOT NULL DEFAULT '[]'::jsonb,
  voicemail_text      text,

  recording_sid       text,
  recording_url       text,           -- Twilio URL; served through /api/admin/calls/[id]/recording
  recording_duration  integer,
  recording_source    text,           -- dial | ai | voicemail
  transcript_sid      text,           -- Voice Intelligence transcript, for calls a person answered
  transcript_status   text,

  summary             text,
  analysis            jsonb,          -- lib/receptionist/calls.ts CallAnalysis

  lead_id             uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  project_id          uuid REFERENCES public.projects(id) ON DELETE SET NULL,

  duration_seconds    integer,
  started_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  notified_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_calls_started ON public.phone_calls (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_calls_recording ON public.phone_calls (recording_sid);
CREATE INDEX IF NOT EXISTS idx_phone_calls_lead ON public.phone_calls (lead_id);
CREATE INDEX IF NOT EXISTS idx_phone_calls_org ON public.phone_calls (org_id);

-- Service role only. Every reader and writer is a server route holding the service key; nothing
-- in the browser touches this table directly.
ALTER TABLE public.phone_calls ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'phone_calls' AND policyname = 'phone_calls_no_direct_access') THEN
    CREATE POLICY phone_calls_no_direct_access ON public.phone_calls FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;
END $$;

COMMIT;
