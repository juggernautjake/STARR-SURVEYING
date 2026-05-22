-- seeds/287_earned_credentials_verification.sql
--
-- P-19 of PAY_PROGRESSION_OVERHAUL.md.
--
-- Adds an approval workflow to employee_earned_credentials so that
-- learn-module completion can auto-insert a credential row without
-- granting the pay bump until an admin verifies it.
--
-- New columns:
--   verified      BOOLEAN  — only verified=true rows count toward pay
--   verified_at   TIMESTAMPTZ
--   verified_by   TEXT     — admin email
--   source        TEXT     — where the credential came from (e.g.
--                            'module:abc-123', 'exam-prep:fs',
--                            'manual:admin@…') for audit
--
-- The pay-progression rewards API is updated in the same slice to filter
-- on verified=true so the bump doesn't apply until approval. Existing
-- rows are backfilled to verified=true so the change is non-disruptive
-- (everything currently in the table is treated as legacy-approved).

ALTER TABLE public.employee_earned_credentials
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Backfill: existing rows pre-date this workflow, so treat them as
-- already verified by 'legacy' so nobody's pay drops on apply.
UPDATE public.employee_earned_credentials
   SET verified = TRUE,
       verified_at = COALESCE(verified_at, now()),
       verified_by = COALESCE(verified_by, 'legacy'),
       source = COALESCE(source, 'legacy')
 WHERE verified = FALSE;

CREATE INDEX IF NOT EXISTS idx_employee_earned_credentials_verified
  ON public.employee_earned_credentials(verified, user_email);

COMMENT ON COLUMN public.employee_earned_credentials.verified IS
  'Pay bump from this credential only counts when verified=TRUE. New rows from learn completion default to FALSE and require admin approval via the queue in P-21.';

-- ─── Verification ───────────────────────────────────────────────────────────
-- SELECT user_email, credential_key, verified, source
-- FROM employee_earned_credentials
-- ORDER BY user_email, credential_key;
--
-- Expect: every row has verified=TRUE (backfilled from legacy) on first run.
