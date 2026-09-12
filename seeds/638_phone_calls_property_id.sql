-- seeds/638_phone_calls_property_id.sql — the appraisal-district property ID, when the caller has it.
--
-- Owner, 2026-09-12: "the agent should check and see if the caller has a property id, that is, if
-- they are wanting a quote for a property." Read back digit by digit on the call, stored here beside
-- the address, and written into the lead's details so the RPLS can pull the deed before calling back.

BEGIN;

ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS property_id text;

COMMIT;
