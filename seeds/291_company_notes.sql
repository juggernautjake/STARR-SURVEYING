-- ============================================================================
-- 291_company_notes.sql
--
-- Company Notes — shared, company-wide notes board surfaced at
-- /admin/notes. Any authenticated team member can read every note;
-- notes are categorised (general/procedures/safety/equipment/legal/hr/
-- training) and can be pinned to the top. Backs the previously-stubbed
-- /admin/notes page (UI shipped; this provisions its storage).
--
-- Read/write via app/api/admin/notes/route.ts (service-role supabaseAdmin;
-- no RLS — access is gated at the API/auth layer like the rest of the
-- /api/admin surface).
--
-- Spec: docs/planning/completed/backend-audit-and-improvements-2026-05-27.md (Slice 10)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.company_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT 'general'
             CHECK (category IN ('general','procedures','safety','equipment','legal','hr','training')),
  is_pinned  BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.company_notes IS
  'Shared company-wide notes board (procedures, safety, equipment, etc.). Read by every authenticated team member; managed via app/api/admin/notes/route.ts.';

-- Pinned-first, newest-first listing is the default query; index the sort keys.
CREATE INDEX IF NOT EXISTS idx_company_notes_pinned_updated
  ON public.company_notes(is_pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_notes_category
  ON public.company_notes(category);

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.company_notes;   -- 0
--
--   INSERT INTO public.company_notes (title, content, category, created_by)
--     VALUES ('Monument tie procedure', 'Always …', 'procedures', 'alice@starr-surveying.com');
--   SELECT id, title, category, is_pinned FROM public.company_notes
--     ORDER BY is_pinned DESC, updated_at DESC;
