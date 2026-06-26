-- seeds/382_worker_classification.sql
--
-- G5 / Phase 2.1 of docs/planning/completed/BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25.md
-- — worker tax classification on registered_users so payout tax reports can
-- split W-2 employees from 1099 contractors and flag 1099-NEC reportables
-- (a contractor paid >= $600 in a calendar year).
--
-- Values:
--   'unclassified'    — default; the office hasn't set it yet
--   'w2'              — W-2 employee (wages; withholding handled by a payroll provider)
--   'contractor_1099' — independent contractor (gets a 1099-NEC if >= $600/yr)
--
-- The classification is the office's call — the app does NOT make the legal
-- W-2/1099 determination; this column just records it so reports + exports
-- group correctly.
-- Idempotent.

BEGIN;

ALTER TABLE registered_users
  ADD COLUMN IF NOT EXISTS worker_classification TEXT NOT NULL DEFAULT 'unclassified';

-- Constrain to the known set; guard so a re-run doesn't fail on the existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registered_users_worker_classification_chk'
  ) THEN
    ALTER TABLE registered_users
      ADD CONSTRAINT registered_users_worker_classification_chk
      CHECK (worker_classification IN ('unclassified', 'w2', 'contractor_1099'));
  END IF;
END $$;

-- Read-path index for the tax report's per-classification grouping.
CREATE INDEX IF NOT EXISTS idx_registered_users_worker_classification
  ON registered_users (worker_classification);

COMMENT ON COLUMN registered_users.worker_classification IS
  'Tax worker classification: unclassified | w2 | contractor_1099. Drives the W-2 vs 1099 split + 1099-NEC (>= $600/yr) flagging on the payout tax report. Office sets it per worker; not a legal determination by the app.';

COMMIT;
