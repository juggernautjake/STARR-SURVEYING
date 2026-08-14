-- seeds/594_calls_and_call_events.sql — slice P0c of
-- docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
--
-- Owner, 2026-08-14: *"when business calls come through, they are transcribed and recorded and there
-- is a summary created… I want it so that we can assign calls to specific jobs, or we can use a call
-- to create a new job."*
--
-- ── WHY A CALL IS ITS OWN TABLE AND NOT A ROW ON A JOB ───────────────────────────────────────────
--
-- The tempting shape is `job_calls`, hung off `jobs`, because most calls are about a job. But the
-- owner's own sentence rules it out: *"or we can use a call to create a new job"*. A call arrives
-- before anyone knows what it is about, and a large share never become jobs at all — wrong numbers,
-- suppliers, the county. A call that must have a `job_id` to exist cannot represent the case the
-- feature was asked for.
--
-- So `job_id` is nullable throughout and set later. That also means the interesting query — "show me
-- everything that came in this week that nobody has filed yet" — is `WHERE job_id IS NULL`, which is
-- an index, not a full scan of every job's children.
--
-- ── WHY THERE IS A SECOND TABLE FOR THE RAW WEBHOOKS ─────────────────────────────────────────────
--
-- `calls` is a mutable summary: status moves ringing → in-progress → completed, a recording arrives
-- minutes later, a transcript minutes after that, and a person then corrects the whole thing. Every
-- one of those overwrites what was there before.
--
-- When a call later turns out to have gone wrong — it rang nobody, it recorded silence, it was
-- billed twice — the question is *what did Twilio actually tell us and when*, and the summary row
-- cannot answer it because each update destroyed the previous answer. `call_events` is append-only
-- and stores the payload verbatim. It is the difference between debugging this in an afternoon and
-- not being able to debug it at all.
--
-- ── AND WHY THE NUMBERS ARE E.164 ───────────────────────────────────────────────────────────────
--
-- `jobs.client_phone`, `leads.phone` and `contacts.phone` are all free text, holding everything from
-- "(936) 662-0077" to "936.662.0077 ext 2". Matching an inbound caller against those by string
-- equality finds nothing. The call tables store the canonical form so the match is possible at all;
-- reconciling the free-text columns is a separate job, and until it happens the match is a
-- suggestion the office confirms rather than a link the system makes on its own.

BEGIN;

CREATE TABLE IF NOT EXISTS public.calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Twilio's identifier. UNIQUE because Twilio retries a webhook it thinks failed, and without this
  -- a slow response turns one call into three rows.
  provider          TEXT NOT NULL DEFAULT 'twilio',
  provider_call_sid TEXT UNIQUE,

  direction         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'ringing',

  -- E.164, always. See the header.
  from_number       TEXT,
  to_number         TEXT,
  -- What the caller ID said the name was, when the carrier provided one.
  caller_name       TEXT,

  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at       TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  duration_seconds  INTEGER,

  -- Whether this call reached a person or the machine. Not derivable from `answered_at`: voicemail
  -- "answers" too, and treating that as answered would report a 100% pick-up rate at 3am.
  is_voicemail      BOOLEAN NOT NULL DEFAULT FALSE,
  -- Why it went to voicemail — 'outside_hours', 'day_closed', 'holiday', 'disabled', 'no_answer'.
  -- Stored rather than recomputed because the hours can be edited afterwards, and then the reason
  -- this call was missed would silently change to whatever the current settings imply.
  voicemail_reason  TEXT,

  -- Our own copy in Supabase storage, not Twilio's URL: recordings age out of a Twilio account, and
  -- a business record that disappears when a subscription lapses is not a business record.
  recording_path    TEXT,
  recording_seconds INTEGER,

  transcript        TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'pending',
  transcript_cost_cents NUMERIC(10,4),

  summary           TEXT,
  -- The structured read: {caller, wanted, promised, next_step, sentiment}. Kept beside the prose
  -- summary so the list can show "wanted" as a column without re-parsing a paragraph.
  summary_json      JSONB,
  summary_status    TEXT NOT NULL DEFAULT 'pending',

  -- All nullable, all set after the fact. A call belongs to at most one job.
  job_id            UUID REFERENCES jobs(id) ON DELETE SET NULL,
  lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,

  -- Who the system THINKS this is, before a person agrees. Separate from the FK columns above so
  -- that an automatic guess can never be mistaken for a filing decision somebody made.
  matched_kind      TEXT,
  matched_id        UUID,
  matched_label     TEXT,

  handled_by        TEXT,
  assigned_to       TEXT,
  notes             TEXT,
  -- Set when a person has read it. The unread count is the point of the screen.
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT,

  org_id            UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE public.calls IS
  'One row per phone call through the business Twilio number. job_id is nullable and set after the fact — a call exists before anyone knows what it is about. Raw webhook payloads live in call_events.';

CREATE TABLE IF NOT EXISTS public.call_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id       UUID REFERENCES public.calls(id) ON DELETE CASCADE,
  -- Kept even when no call row could be resolved, so an unmatched webhook is still evidence rather
  -- than a gap. That is precisely the case worth reading later.
  provider_call_sid TEXT,
  kind          TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  -- Whether the signature check passed. A rejected webhook is recorded, not discarded: a burst of
  -- these is the only evidence that somebody is probing the endpoint.
  signature_ok  BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.call_events IS
  'Append-only log of raw Twilio webhook payloads. Never updated. The only record of what the provider actually said, since calls.* is overwritten as a call progresses.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calls_direction_chk') THEN
    ALTER TABLE public.calls ADD CONSTRAINT calls_direction_chk
      CHECK (direction IN ('inbound', 'outbound'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calls_status_chk') THEN
    ALTER TABLE public.calls ADD CONSTRAINT calls_status_chk
      CHECK (status IN ('ringing', 'in_progress', 'completed', 'busy', 'failed', 'no_answer', 'canceled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calls_transcript_status_chk') THEN
    ALTER TABLE public.calls ADD CONSTRAINT calls_transcript_status_chk
      CHECK (transcript_status IN ('pending', 'queued', 'done', 'failed', 'skipped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calls_summary_status_chk') THEN
    ALTER TABLE public.calls ADD CONSTRAINT calls_summary_status_chk
      CHECK (summary_status IN ('pending', 'queued', 'done', 'failed', 'skipped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calls_matched_kind_chk') THEN
    ALTER TABLE public.calls ADD CONSTRAINT calls_matched_kind_chk
      CHECK (matched_kind IS NULL OR matched_kind IN ('lead', 'contact', 'customer', 'job'));
  END IF;
END $$;

-- The list opens on "newest first, not deleted", so that is the index.
CREATE INDEX IF NOT EXISTS calls_started_idx    ON public.calls (started_at DESC) WHERE deleted_at IS NULL;
-- "What has nobody filed yet" — the working queue.
CREATE INDEX IF NOT EXISTS calls_unfiled_idx    ON public.calls (started_at DESC) WHERE deleted_at IS NULL AND job_id IS NULL;
CREATE INDEX IF NOT EXISTS calls_unread_idx     ON public.calls (started_at DESC) WHERE deleted_at IS NULL AND reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS calls_job_idx        ON public.calls (job_id) WHERE job_id IS NOT NULL;
-- Caller history: "has this number rung us before". Both directions, hence two.
CREATE INDEX IF NOT EXISTS calls_from_idx       ON public.calls (from_number);
CREATE INDEX IF NOT EXISTS calls_to_idx         ON public.calls (to_number);
-- The worker's pickup query for transcription.
CREATE INDEX IF NOT EXISTS calls_transcript_idx ON public.calls (transcript_status) WHERE recording_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS call_events_call_idx ON public.call_events (call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_events_sid_idx  ON public.call_events (provider_call_sid);

-- Reached only through the service role in API routes, which gate on admin at the auth layer —
-- the same posture as receipts and job_briefings. RLS on with no policy denies anon outright.
ALTER TABLE public.calls       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.calls;        -- 0
--   SELECT count(*) FROM public.call_events;  -- 0
--   -- job_id must be optional, or the "call becomes a job" flow cannot start:
--   INSERT INTO public.calls (direction, from_number, to_number)
--     VALUES ('inbound', '+15125551234', '+19366620077') RETURNING id, job_id;
--   -- the retry guard:
--   INSERT INTO public.calls (direction, provider_call_sid) VALUES ('inbound', 'CAdupe');
--   INSERT INTO public.calls (direction, provider_call_sid) VALUES ('inbound', 'CAdupe');  -- must fail
--   DELETE FROM public.calls WHERE provider_call_sid = 'CAdupe' OR from_number = '+15125551234';
