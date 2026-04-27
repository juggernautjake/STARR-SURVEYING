-- seeds/230_starr_field_receipt_retention.sql
--
-- Receipt soft-delete + IRS retention foundation (Batch CC).
--
-- Closes the F2 audit-additions deferral *"Soft-delete + IRS 7-year
-- retention — `receipts` table currently hard-deletes on user
-- delete. Per §5.11.9 + risk register need a `deleted_at` column +
-- retention sweep."*
--
-- IRS rules require business expense receipts to be retained for
-- the full statute-of-limitations window (3 years from filing,
-- 7 years for substantial under-reporting, indefinitely for fraud).
-- Field hard-deletes are a compliance violation: a surveyor who
-- accidentally captures a duplicate AND deletes it loses the audit
-- trail showing they reviewed both. We never want that.
--
-- This seed:
--   1. Adds `receipts.deleted_at TIMESTAMPTZ` (nullable). NULL =
--      visible; non-null = soft-deleted. Mobile + admin filters
--      treat soft-deleted rows as gone.
--   2. Adds `receipts.deletion_reason TEXT` (optional). Set by the
--      mobile delete UI from a small enum: 'user_undo' |
--      'duplicate' | 'wrong_capture' | NULL. Keeps the audit
--      trail useful for IRS review.
--   3. Adds a partial index on `(user_id, created_at DESC) WHERE
--      deleted_at IS NULL` so the per-user list reads stay fast
--      even after years of accumulation. Postgres prunes
--      tombstoned rows from this index.
--   4. Adjusts the existing user-CRUD policy: users can UPDATE
--      `deleted_at` + `deletion_reason` on their own pending /
--      rejected receipts. Hard DELETE remains revoked from the
--      `authenticated` role — only `service_role` (the worker
--      retention sweep) can purge.
--
-- Apply AFTER seeds/220 (and 229 if dedup is wired). Idempotent —
-- every ALTER and policy creation guards on existence.

BEGIN;

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipts_deletion_reason_chk'
  ) THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_deletion_reason_chk
        CHECK (
          deletion_reason IS NULL
          OR deletion_reason IN ('user_undo','duplicate','wrong_capture')
        );
  END IF;
END $$;

-- Partial index for the visible-rows list. The existing
-- idx_receipts_user_time covers all rows; this one shaves
-- soft-deleted writes off the hot path so a user with thousands
-- of historical rows + a recent purge still gets fast reads.
CREATE INDEX IF NOT EXISTS idx_receipts_user_time_visible
  ON receipts (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Optional retention-sweep helper: a covering index for the worker
-- CLI that purges old soft-deleted rows. The CLI scans
-- `deleted_at < threshold` so we want it indexed.
CREATE INDEX IF NOT EXISTS idx_receipts_deleted_at
  ON receipts (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Authenticated user policy: allow UPDATE of deleted_at +
-- deletion_reason on the user's own pending / rejected receipts.
-- Other columns are still locked to the existing per-column GRANT
-- list. We DO NOT extend DELETE privileges — the soft-delete
-- pattern is the new contract.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'receipts'
       AND policyname = 'receipts_owner_soft_delete'
  ) THEN
    CREATE POLICY receipts_owner_soft_delete
      ON receipts FOR UPDATE TO authenticated
      USING (user_id = auth.uid() AND status IN ('pending','rejected'))
      WITH CHECK (user_id = auth.uid() AND status IN ('pending','rejected'));
  END IF;
END $$;

COMMIT;
