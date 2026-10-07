-- seeds/673_number_origin.sql — where each number is from, stored on its catalogue row.
--
-- Owner, 2026-10-06: "We need to check area codes and determine where the calls are from, and if
-- they are some kind of 1-800 number that is likely spam. This might help us understand if the
-- silent calls were more likely real people or not."
--
-- area_code and place ("Illinois", "Toll-free", "Jamaica") are written by refreshNumber from
-- lib/receptionist/area-code-map.ts, so the numbers page can group and filter by origin without
-- every reader re-deriving it. `region` (seeds/672) stays the coarse bucket: texas · out_of_state
-- · toll_free · international · unknown.
--
-- Display only: lib/receptionist/screening.ts never screens on origin. Additive; safe twice.

BEGIN;

ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS area_code text;
ALTER TABLE public.caller_registry ADD COLUMN IF NOT EXISTS place text;

-- Every row's area code is its first three digits; the place is filled by scripts/settle-calls.ts.
UPDATE public.caller_registry SET area_code = substr(phone, 1, 3) WHERE area_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_caller_registry_place ON public.caller_registry (place);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caller_registry_region_check') THEN
    ALTER TABLE public.caller_registry ADD CONSTRAINT caller_registry_region_check
      CHECK (region IS NULL OR region IN ('texas', 'out_of_state', 'toll_free', 'international', 'unknown'));
  END IF;
END $$;

COMMIT;
