-- ============================================================================
-- 318_lead_attachments_bucket.sql
--
-- Private storage bucket for files customers upload via the public
-- intake form. The contact route (app/api/contact/route.ts) writes one
-- object per attachment under `{leadId}/{uuid}-{filename}` and saves
-- the storage path into the `leads.attachments` JSONB column. The
-- admin lead-detail GET generates short-lived signed URLs from those
-- paths so surveyors can download / preview without leaving the
-- /admin/leads/[id] page.
--
-- Idempotent — re-runnable. The bucket-insert step works in the
-- Supabase web SQL editor (storage.buckets is owned by `postgres`).
--
-- Storage policies on storage.objects must be added via the Supabase
-- dashboard Storage → Policies UI (storage.objects is owned by
-- supabase_admin, so policy SQL can't run from the web editor — same
-- pattern as cad-images + user-files in seeds 290 / 295). Required
-- policy: service-role ALL on bucket_id = 'lead-attachments'.
-- ============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-attachments',
  'lead-attachments',
  FALSE,                 -- private bucket; signed URLs only
  52428800,              -- 50 MB per file (matches contact-form limit)
  NULL                   -- accept any mime; the route validates via lib/quote-attachments
)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

COMMIT;

-- ── Apply via dashboard ──────────────────────────────────────────────────────
-- After this seed lands, open Supabase → Storage → lead-attachments → Policies
-- → New policy:
--   Name:          lead-attachments service-role all
--   Operations:    SELECT, INSERT, UPDATE, DELETE
--   Target roles:  service_role
--   Definition:    bucket_id = 'lead-attachments'
--
-- ── Verification ─────────────────────────────────────────────────────────────
--   SELECT id, public, file_size_limit FROM storage.buckets
--    WHERE id = 'lead-attachments';   -- public=false, 52428800
