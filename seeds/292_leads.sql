-- ============================================================================
-- 292_leads.sql
--
-- Leads / sales pipeline — backs the previously-stubbed admin-only
-- /admin/leads page. Tracks potential clients from first contact
-- (status='new') through the pipeline to accepted/declined/lost, with an
-- optional link to the job created when a lead converts.
--
-- Read/write via app/api/admin/leads/route.ts (service-role supabaseAdmin;
-- access gated to admins at the API/auth layer).
--
-- Spec: docs/planning/completed/backend-audit-and-improvements-2026-05-27.md (Slice 11)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  company           TEXT,
  source            TEXT NOT NULL DEFAULT 'Phone',
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','contacted','quoted','accepted','declined','lost')),
  notes             TEXT,
  property_address  TEXT,
  city              TEXT,
  state             TEXT DEFAULT 'TX',
  survey_type       TEXT,
  estimated_acreage NUMERIC,
  quote_amount      NUMERIC,
  assigned_to       TEXT,
  follow_up_date    TIMESTAMPTZ,
  converted_job_id  UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.leads IS
  'Sales pipeline leads for /admin/leads. Managed via app/api/admin/leads/route.ts (admin-gated).';

CREATE INDEX IF NOT EXISTS idx_leads_status     ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up  ON public.leads(follow_up_date)
  WHERE follow_up_date IS NOT NULL;

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.leads;   -- 0
--   INSERT INTO public.leads (name, source, status, created_by)
--     VALUES ('Jane Landowner', 'Referral', 'new', 'alice@starr-surveying.com');
--   SELECT id, name, status FROM public.leads ORDER BY created_at DESC;
