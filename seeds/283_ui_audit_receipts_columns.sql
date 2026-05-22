-- ============================================================================
-- 283_ui_audit_receipts_columns.sql
--
-- U-1 of UI_UX_OVERHAUL.md. Adds two columns to public.receipts that
-- the live app already queries but that don't currently exist on
-- this DB:
--
--   1. deleted_at TIMESTAMPTZ  — soft-delete tombstone the bookkeeper
--      queue filters on (`receipts.is_("deleted_at", null)`). Without
--      it, /admin/receipts returns 500 with "column receipts.deleted_at
--      does not exist".
--
--   2. org_id UUID            — multi-tenant foreign key. The SaaS
--      pivot's backfill seed (263) tried to add org_id to every tenant
--      table, but receipts didn't exist on this DB at the time the
--      backfill ran. Reports query at lib/reports/operations-data.ts
--      depends on this column.
--
-- Additive; idempotent (uses IF NOT EXISTS). Backfills org_id to
-- Starr's tenant id (00000000-0000-0000-0000-000000000001) for any
-- existing rows that have no org_id set.
-- ============================================================================

BEGIN;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- Index supports the deleted_at IS NULL filter the bookkeeper queue uses.
CREATE INDEX IF NOT EXISTS idx_receipts_active
  ON public.receipts(created_at DESC)
  WHERE deleted_at IS NULL;

-- Org-scoped queries (reports, future RLS) — partial index on
-- "rows that actually have an org" so the index stays tight while
-- the backfill is in progress.
CREATE INDEX IF NOT EXISTS idx_receipts_org_created
  ON public.receipts(org_id, created_at DESC)
  WHERE org_id IS NOT NULL;

-- Backfill: existing receipt rows belong to Starr (tenant #1). After
-- this backfill they're queryable by org-scoped reports.
UPDATE public.receipts
  SET org_id = '00000000-0000-0000-0000-000000000001'
  WHERE org_id IS NULL;

COMMENT ON COLUMN public.receipts.deleted_at IS
  'Soft-delete tombstone. NULL = active row visible in the bookkeeper queue. Set by the user-self-delete path on /admin/receipts and by admin "Reject + delete" actions.';

COMMENT ON COLUMN public.receipts.org_id IS
  'Multi-tenant FK to public.organizations. Backfilled from seed 283 for rows that pre-date the SaaS pivot; set by the receipts API for new rows from session.user.activeOrgId.';

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'receipts'
--      AND column_name IN ('deleted_at', 'org_id');
--   -- expected: 2 rows
--
--   SELECT count(*) AS total,
--          count(deleted_at) AS soft_deleted,
--          count(org_id) AS with_org
--   FROM public.receipts;
--   -- expected: total >= with_org (all rows now have org_id from backfill)
