-- ============================================================================
-- 282_reports_mileage_entries.sql
--
-- Creates the `mileage_entries` table consumed by the operations
-- reports (R-2, R-5, R-12). The table holds per-entry mileage
-- attributed to a user + job + date, with a per-mile rate snapshot.
--
-- Source of data (future): a derivation cron that reads
-- public.location_pings + public.job_time_entries and produces one
-- row per (user_email, entry_date, job_id) tuple. Until that cron
-- ships, mileage rows can be inserted manually from the /admin/mileage
-- page or left empty (reports will show "No mileage entries" — which
-- is correct, since none have been recorded).
--
-- Phase R-2 of OWNER_REPORTS.md.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.mileage_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_email            TEXT NOT NULL,
  job_id                UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  entry_date            DATE NOT NULL,
  miles                 NUMERIC(10,2) NOT NULL CHECK (miles >= 0),
  rate_cents_per_mile   INTEGER NOT NULL CHECK (rate_cents_per_mile >= 0),
  total_cents           INTEGER GENERATED ALWAYS AS ((miles * rate_cents_per_mile)::INTEGER) STORED,
  notes                 TEXT,
  source                TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','derived_pings','api_import')),
  created_by            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mileage_entries IS
  'Per-employee mileage attribution. Consumed by /admin/reports for the Mileage section. Rows populated manually today; future cron derives them from location_pings + job_time_entries.';

CREATE INDEX IF NOT EXISTS idx_mileage_entries_org_date
  ON public.mileage_entries(org_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_mileage_entries_user_date
  ON public.mileage_entries(org_id, user_email, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_mileage_entries_job
  ON public.mileage_entries(job_id, entry_date DESC)
  WHERE job_id IS NOT NULL;

-- RLS — same pattern as the other tenant-scoped tables. Live app uses
-- supabaseAdmin so RLS is currently no-op against today's queries;
-- activates once the auth refactor lands.
ALTER TABLE public.mileage_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mileage_entries FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY mileage_entries_tenant_select ON public.mileage_entries
    FOR SELECT USING (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email() AND status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY mileage_entries_tenant_insert ON public.mileage_entries
    FOR INSERT WITH CHECK (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email() AND status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY mileage_entries_tenant_update ON public.mileage_entries
    FOR UPDATE USING (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email() AND status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY mileage_entries_tenant_delete ON public.mileage_entries
    FOR DELETE USING (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email() AND role = 'admin' AND status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
