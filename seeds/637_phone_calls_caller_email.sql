-- seeds/637_phone_calls_caller_email.sql — the receptionist takes an email address too.
--
-- Owner, 2026-09-11: "It should be able to store email address info and double check the spelling
-- of the email address too." The receptionist reads it back letter by letter before keeping it
-- (lib/receptionist/brain.ts, rule 2); this is where it lands, beside the callback number, and it
-- flows into the lead the same way the name and number do.

BEGIN;

ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS caller_email text;

COMMIT;
