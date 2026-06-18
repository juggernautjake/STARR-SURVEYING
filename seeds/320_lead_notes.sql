-- ============================================================================
-- 320_lead_notes.sql
--
-- LR3 of lead-reply-expansion-2026-06-18.md — office-side conversation
-- notes on a lead. The existing `leads.notes` column stays unchanged
-- (it's the customer-supplied original message). This table holds
-- staff-supplied notes: "Hank called Mary Tuesday — said quote was too
-- high, needs revised pricing for the 5-acre add-on."
--
-- Read/write via app/api/admin/leads/[id]/notes/route.ts (admin-gated,
-- service-role supabaseAdmin client).
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  body         TEXT NOT NULL,
  pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  org_id       UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID
);

COMMENT ON TABLE public.lead_notes IS
  'Office-side conversation notes per lead. Distinct from leads.notes (customer-supplied).';

-- Pinned notes first, then newest, when the UI renders the list.
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_pinned_created
  ON public.lead_notes (lead_id, pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_notes_author
  ON public.lead_notes (author_email, created_at DESC);

-- Keep updated_at fresh on UPDATE.
CREATE OR REPLACE FUNCTION public.lead_notes_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lead_notes_updated_at ON public.lead_notes;
CREATE TRIGGER lead_notes_updated_at
  BEFORE UPDATE ON public.lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.lead_notes_set_updated_at();

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_lead_notes ON public.lead_notes
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- Verification:
--   SELECT to_regclass('public.lead_notes');                  -- non-null
--   SELECT count(*) FROM public.lead_notes;                    -- 0
