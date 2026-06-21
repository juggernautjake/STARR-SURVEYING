-- seeds/299_module_credential_mapping.sql
--
-- PAY_PROGRESSION_OVERHAUL.md P-25/P-26 deferred item — Module → credential
-- mapping + pay-impact callout. Adds a nullable `credential_key` column on
-- `learning_modules` so a module can declare "completing this earns the
-- credential X (which adds $Y/hr to your pay)". The pay-impact callout on
-- the module detail page reads through this mapping.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + ON CONFLICT DO NOTHING throughout.
-- Safe to re-run against the live DB.

-- ─── 1. Link column on learning_modules ─────────────────────────────────────

ALTER TABLE public.learning_modules
  ADD COLUMN IF NOT EXISTS credential_key TEXT;

COMMENT ON COLUMN public.learning_modules.credential_key IS
  'Optional credential awarded on module completion. References '
  'credential_bonuses.credential_key. NULL means the module is purely '
  'educational and does not earn a pay-bump credential. Populated by '
  'admins via the lesson-builder UI; consumed by the pay-impact callout '
  'on the module detail page + the module-completion handler in '
  'lib/learn/trigger-credential.ts.';

-- A loose FK constraint (validated, but soft so credential_bonuses can be
-- reseeded without breaking existing module rows). Use NOT VALID first then
-- VALIDATE so this seed never fails on legacy rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'learning_modules_credential_key_fkey'
  ) THEN
    ALTER TABLE public.learning_modules
      ADD CONSTRAINT learning_modules_credential_key_fkey
        FOREIGN KEY (credential_key)
        REFERENCES public.credential_bonuses(credential_key)
        ON UPDATE CASCADE
        ON DELETE SET NULL
        NOT VALID;
    -- Tolerate legacy rows that may have been mis-mapped; validation step is
    -- a no-op for new rows since they always satisfy the FK.
    BEGIN
      ALTER TABLE public.learning_modules
        VALIDATE CONSTRAINT learning_modules_credential_key_fkey;
    EXCEPTION WHEN OTHERS THEN
      -- If validation fails on legacy data, leave the FK as NOT VALID and
      -- log a notice so an admin can clean up.
      RAISE NOTICE 'learning_modules_credential_key_fkey kept NOT VALID — % rows fail FK check', SQLERRM;
    END;
  END IF;
END $$;

-- ─── 2. Lookup index for the pay-impact callout query path ─────────────────

CREATE INDEX IF NOT EXISTS learning_modules_credential_key_idx
  ON public.learning_modules (credential_key)
  WHERE credential_key IS NOT NULL;

-- ─── 3. Default mapping for the seeded modules ─────────────────────────────
-- Best-effort link of curriculum-shipped modules to their natural credentials.
-- All updates are guarded by a NULL check so the operator can re-target a
-- module later without this seed clobbering their choice.

UPDATE public.learning_modules
   SET credential_key = 'sit_exam'
 WHERE credential_key IS NULL
   AND lower(title) LIKE '%sit%';

UPDATE public.learning_modules
   SET credential_key = 'rpls_license'
 WHERE credential_key IS NULL
   AND lower(title) LIKE '%rpls%';

-- NOTE: the credential catalog (credential_bonuses) keys the FAA drone
-- credential as 'faa_part107', not 'drone_pilot'. Map drone/UAS/Part-107
-- modules to that existing key so the FK in step 1 is satisfied.
UPDATE public.learning_modules
   SET credential_key = 'faa_part107'
 WHERE credential_key IS NULL
   AND (lower(title) LIKE '%drone%' OR lower(title) LIKE '%uas%' OR lower(title) LIKE '%part 107%');

-- Verification:
--   SELECT id, title, credential_key FROM learning_modules WHERE credential_key IS NOT NULL ORDER BY title;
