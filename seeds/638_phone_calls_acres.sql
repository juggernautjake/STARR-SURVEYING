-- seeds/638_phone_calls_acres.sql — the property size, in acres, when the caller gave one.
--
-- Owner, 2026-09-12: the text message after a call should carry "details about the job request
-- like the address and ID and number of acres". The receptionist already asks for acreage before
-- it runs the estimate calculator; this keeps the number beside the address and property ID so the
-- notification, the call page, and the lead all see it.

BEGIN;

ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS acres numeric;

COMMIT;
