-- seeds/636_phone_calls_is_test.sql — test calls are calls too, just not customers.
--
-- Owner, 2026-09-11: "It should not report the test calls as if they are actual customer calls,
-- but should still be able to handle quoting and reporting land laws and taking down job
-- information … and all of the calls should be captured and able to be reviewed and transcribed."
--
-- So a test call from /admin/dev/receptionist gets the same row, recording, transcript and
-- analysis as a real one, with this flag set. The flag is what switches off the owner alerts and
-- the lead insert (lib/receptionist/finish.ts, relay-turn, turn) and what draws the "Test" badge.

BEGIN;

ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_phone_calls_is_test ON public.phone_calls (is_test) WHERE is_test;

COMMIT;
