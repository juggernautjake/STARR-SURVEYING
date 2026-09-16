-- seeds/640_caller_registry.sql — what we know about a phone number, and how sure we are of it
--
-- Owner, 2026-09-16: "The voice agent needs to know that my number is (254)-315-1123 (Jacob Maddux).
-- it should not assume that anyone else's number is me. Please build out the whole infrastructure
-- for the call id rememberance log that attaches call info and names and stuff to a number."
--
-- ── WHY A TABLE, WHEN phone_calls ALREADY HAS EVERY CALL ────────────────────────────────────────
--
-- Because the receptionist was reading names out of call rows, and call rows are a log of what
-- somebody SAID, not a record of who anybody IS. A speech-to-text guess at a name, written mid-call
-- into the row of the call that was still happening, is what made the agent ask a first-time caller
-- whether she was "the same Angela who called in September" and ask a stranger whether he was Jacob.
--
-- So the two things are separated, and the distinction is the point of this table:
--
--   CERTAIN    a person put this name to this number on purpose. The owner's own number. The crew.
--              A customer somebody typed in. `name_source = 'verified'`, and the receptionist may
--              greet them by name — "Hi, is this Jacob?" — because we actually know.
--
--   OBSERVED   the name came out of a transcript, an analysis, or a web form. `name_source =
--              'observed'`, and the receptionist may NOT say it first. It asks who is speaking and
--              uses the name only to recognise the answer. Phones are lent, inherited and answered
--              by spouses; a name we overheard once is a hint, never an identification.
--
-- Everything else here exists so a callback is useful: how many times they have rung, when they
-- last did, what they called about, and any note the office wants the receptionist to have.
--
-- `phone` is the ten national digits, the only form every source agrees on — Twilio's +1254…,
-- a web form's (254) 315-1123 and a customer row's 254.315.1123 are one key here.

BEGIN;

CREATE TABLE IF NOT EXISTS public.caller_registry (
  phone        text PRIMARY KEY CHECK (phone ~ '^[0-9]{10}$'),
  org_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,

  display_name text CHECK (display_name IS NULL OR btrim(display_name) <> ''),
  -- 'verified' = a person said so and the receptionist may greet by name.
  -- 'observed'  = heard on a call or read off a form; the receptionist must ask, never assume.
  name_source  text NOT NULL DEFAULT 'observed' CHECK (name_source IN ('verified', 'observed')),
  email        text,
  company      text,

  -- Who this is to the firm. Shapes the call: staff and family are not interviewed like customers.
  relationship text NOT NULL DEFAULT 'unknown'
    CHECK (relationship IN ('owner', 'staff', 'family', 'customer', 'vendor', 'spam', 'unknown')),

  -- Free text the receptionist is allowed to be told. Written for a model to act on.
  notes        text,

  -- Set when a number is known to be shared, or reassigned, or when a caller has asked us not to
  -- recognise them. The lookup still returns the row's call counts; it returns no name.
  never_assume boolean NOT NULL DEFAULT false,

  times_called integer NOT NULL DEFAULT 0 CHECK (times_called >= 0),
  first_seen_at timestamptz,
  last_seen_at  timestamptz,
  -- The last thing they rang about, in a few words, for the receptionist's ear.
  last_about   text,

  created_by   text,
  updated_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.caller_registry IS
  'What we know about a phone number (caller ID memory, 2026-09-16). One row per ten-digit number. name_source = verified means a person put this name to this number and the receptionist may greet by it; observed means it was overheard and must be asked about, never assumed.';
COMMENT ON COLUMN public.caller_registry.never_assume IS
  'A shared, reassigned or opted-out number: the receptionist is told the number has called before but is given no name at all.';

-- The one hot query: who is this, by number. (The primary key already covers it; this is the
-- ordering the admin list uses.)
CREATE INDEX IF NOT EXISTS idx_caller_registry_last_seen ON public.caller_registry (last_seen_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_caller_registry_name ON public.caller_registry (lower(display_name)) WHERE display_name IS NOT NULL;

-- Server-only, like phone_calls: every read and write goes through the API with the service role.
-- The receptionist's lookup runs on the server; nothing here is ever exposed to a browser directly.
ALTER TABLE public.caller_registry ENABLE ROW LEVEL SECURITY;

-- updated_at, the same way every other table in this schema does it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_caller_registry_updated_at ON public.caller_registry;
    CREATE TRIGGER trg_caller_registry_updated_at BEFORE UPDATE ON public.caller_registry
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── THE NUMBERS WE ACTUALLY KNOW ────────────────────────────────────────────────────────────────
-- Owner, 2026-09-16: "my number is (254)-315-1123 (Jacob Maddux). it should not assume that anyone
-- else's number is me." Verified, because a person said so — this row is why the receptionist may
-- say "is this Jacob?" to THIS number and to no other.
INSERT INTO public.caller_registry (phone, display_name, name_source, relationship, notes, created_by, updated_by)
VALUES (
  '2543151123', 'Jacob Maddux', 'verified', 'staff',
  'Jacob is the party chief and survey technician, and he works with Hank every day. Not a customer: never run a survey enquiry with him, never ask what the property is for. Say hello, take whatever he wants passed to Hank, and let him go.',
  'seed 640', 'seed 640'
)
ON CONFLICT (phone) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      name_source  = 'verified',
      relationship = EXCLUDED.relationship,
      notes        = COALESCE(public.caller_registry.notes, EXCLUDED.notes),
      updated_by   = EXCLUDED.updated_by,
      updated_at   = now();

COMMIT;
