-- ============================================================================
-- 294_app_settings.sql
--
-- Org-wide application settings — a simple key→JSONB store backing the
-- editable sections of /admin/settings (General, Company). One row per
-- settings "section" (e.g. key='general', value={companyName, defaultState,
-- jobNumberPrefix, timezone}). Read/written by admins only.
--
-- Read/write via app/api/admin/settings/route.ts (service-role
-- supabaseAdmin; access gated to admins at the API/auth layer).
--
-- Spec: docs/planning/completed/backend-audit-and-improvements-2026-05-27.md (Slice 13)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.app_settings IS
  'Org-wide settings as key->JSONB sections (general, company, …). Managed via app/api/admin/settings/route.ts.';

COMMIT;

-- Verification:
--   SELECT key, value FROM public.app_settings;   -- 0 rows initially
--   INSERT INTO public.app_settings (key, value, updated_by)
--     VALUES ('general', '{"companyName":"Starr Surveying","defaultState":"TX"}', 'admin@starr-surveying.com')
--     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
--   SELECT value->>'companyName' FROM public.app_settings WHERE key = 'general';
