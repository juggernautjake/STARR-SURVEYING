-- seeds/672_call_screening.sql — every number catalogued, unwanted calls screened, one notice per call.
--
-- Owner, 2026-10-06: "we are getting a lot of spam callers and robo callers and people who don't
-- answer at all … if a number is clearly a robotic number, then they should be blocked forever …
-- If they are silent and Ellie ends up hanging up on them, then they should go straight to voicemail
-- from then on … catalogue all of the calls and numbers with IDs … We really need fail safes so
-- that we are not weeding out calls from actual or potential customers."
--
-- 1. caller_registry becomes the catalogue of NUMBERS: a stable id, what the calls from it turned
--    out to be (status + per-verdict counts), how the line should treat it next time (screening),
--    where it is from (region), and what it belongs to (customer / lead / job / contact).
--      screening  auto         the rules decide (lib/receptionist/screening.ts)
--                 always_ring  a person said "this one always gets through" — beats every rule
--                 voicemail    straight to the voicemail greeting; a real message still notifies
--                 block        refused before anything rings (the existing blocked_numbers path)
--      status     what the calls showed: person · customer · silent · robocall · spam · unknown.
--                 Derived from the calls, recomputed every time one settles — never hand-typed.
--
-- 2. phone_calls gets what happened at the door (screened_as / screen_reason), what the call turned
--    out to be (caller_verdict), the number it belongs to (number_id), and a record of every notice
--    sent about it (belled_at / emailed_at / notify_log). belled_at and emailed_at are CLAIMED with a
--    conditional update before anything is sent, which is what makes "one bell and one email per
--    call" hold when two webhooks for the same call arrive at once.
--
-- 3. bump_block_hit(): the blocked-call tally as one atomic statement, not read-then-write.
--
-- Additive; safe to apply twice. Backfill of verdicts and counts is done by
-- scripts/settle-calls.ts (it runs the same code the webhooks run).

BEGIN;

-- ── 1. the number catalogue ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caller_registry_id_key') THEN
    ALTER TABLE public.caller_registry ADD CONSTRAINT caller_registry_id_key UNIQUE (id);
  END IF;
END $$;

ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS screening text NOT NULL DEFAULT 'auto';
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS screening_note text;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS screening_set_by text;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS screening_set_at timestamptz;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS status_at timestamptz;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS calls_person integer NOT NULL DEFAULT 0;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS calls_silent integer NOT NULL DEFAULT 0;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS calls_robocall integer NOT NULL DEFAULT 0;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS calls_spam integer NOT NULL DEFAULT 0;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS calls_hangup integer NOT NULL DEFAULT 0;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS calls_screened integer NOT NULL DEFAULT 0;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS calls_blocked integer NOT NULL DEFAULT 0;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS lead_id uuid;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS job_id uuid;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS linked_label text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caller_registry_screening_check') THEN
    ALTER TABLE public.caller_registry ADD CONSTRAINT caller_registry_screening_check
      CHECK (screening IN ('auto', 'always_ring', 'voicemail', 'block'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caller_registry_status_check') THEN
    ALTER TABLE public.caller_registry ADD CONSTRAINT caller_registry_status_check
      CHECK (status IN ('unknown', 'person', 'customer', 'silent', 'robocall', 'spam'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_caller_registry_status ON public.caller_registry (status);
CREATE INDEX IF NOT EXISTS idx_caller_registry_screening ON public.caller_registry (screening) WHERE screening <> 'auto';

COMMENT ON COLUMN public.caller_registry.screening IS
  'How the line treats this number: auto (rules decide), always_ring (a person vouched for it — beats every rule), voicemail, block.';
COMMENT ON COLUMN public.caller_registry.status IS
  'What the calls from this number turned out to be, recomputed whenever one settles (lib/receptionist/screening.ts).';

-- ── 2. per-call screening, verdict and notice record ───────────────────────────────────────────
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS screened_as text;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS screen_reason text;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS caller_verdict text;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS verdict_reason text;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS verdict_at timestamptz;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS number_id uuid;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS job_id uuid;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS belled_at timestamptz;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS notify_log jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phone_calls_screened_as_check') THEN
    ALTER TABLE public.phone_calls ADD CONSTRAINT phone_calls_screened_as_check
      CHECK (screened_as IS NULL OR screened_as IN ('rang', 'voicemail', 'blocked'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phone_calls_caller_verdict_check') THEN
    ALTER TABLE public.phone_calls ADD CONSTRAINT phone_calls_caller_verdict_check
      CHECK (caller_verdict IS NULL OR caller_verdict IN ('person', 'silent', 'robocall', 'spam', 'hangup', 'blocked', 'unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_phone_calls_from ON public.phone_calls (from_number);
CREATE INDEX IF NOT EXISTS idx_phone_calls_unsettled ON public.phone_calls (ended_at) WHERE caller_verdict IS NULL;
CREATE INDEX IF NOT EXISTS idx_phone_calls_number ON public.phone_calls (number_id);

-- Calls that already have bell rows: the bell has been sent, so a later webhook revises it.
UPDATE public.phone_calls pc
SET belled_at = n.first_at
FROM (
  SELECT source_id, min(created_at) AS first_at
  FROM public.notifications
  WHERE source_type = 'phone_calls' AND source_id IS NOT NULL
  GROUP BY source_id
) n
WHERE pc.belled_at IS NULL AND n.source_id = pc.id::text;

-- Calls already stamped notified were emailed (or deliberately not, like a block): never again.
UPDATE public.phone_calls SET emailed_at = notified_at WHERE emailed_at IS NULL AND notified_at IS NOT NULL;

-- Blocked calls so far were screened at the door.
UPDATE public.phone_calls SET screened_as = 'blocked', caller_verdict = coalesce(caller_verdict, 'blocked')
WHERE answered_by = 'blocked' AND screened_as IS NULL;

-- ── 3. the blocked-call tally, atomically ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_block_hit(rule_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.blocked_numbers
  SET hit_count = hit_count + 1, last_hit_at = now(), updated_at = now()
  WHERE id = rule_id;
$$;
REVOKE ALL ON FUNCTION public.bump_block_hit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_block_hit(uuid) TO service_role;

COMMIT;
