-- ============================================================================
-- 380_message_attachments_bucket.sql
--
-- Private storage bucket for files/photos sent inside internal messages
-- (doc 03, slice M3). The upload route
-- (app/api/admin/messages/attachments/route.ts) writes one object per
-- attachment under `{conversationId}/{uuid}-{filename}` and returns the
-- storage path, which the client stores on the message's `attachments`
-- JSONB array. The messages GET route
-- (app/api/admin/messages/send/route.ts) mints short-lived signed URLs
-- from those paths so participants can view/download in-thread without a
-- permanent public link.
--
-- The app also creates this bucket on demand at runtime via
-- ensureStorageBucket('message-attachments'), so this seed is belt-and-
-- suspenders — it pins the size limit + privacy in environments seeded
-- ahead of first use.
--
-- Idempotent — re-runnable. The bucket-insert step works in the Supabase
-- web SQL editor (storage.buckets is owned by `postgres`).
--
-- Storage policies on storage.objects must be added via the Supabase
-- dashboard Storage → Policies UI (same pattern as lead-attachments /
-- user-files / cad-images). Required policy: service-role ALL on
-- bucket_id = 'message-attachments'.
-- ============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  FALSE,                 -- private bucket; signed URLs only
  26214400,              -- 25 MB per file (matches the upload-route limit)
  NULL                   -- accept any mime; the route validates size + auth
)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

COMMIT;

-- ── Apply via dashboard ──────────────────────────────────────────────────────
-- After this seed lands, open Supabase → Storage → message-attachments →
-- Policies → New policy:
--   Name:          message-attachments service-role all
--   Operations:    SELECT, INSERT, UPDATE, DELETE
--   Target roles:  service_role
--   Definition:    bucket_id = 'message-attachments'
--
-- ── Verification ─────────────────────────────────────────────────────────────
--   SELECT id, public, file_size_limit FROM storage.buckets
--    WHERE id = 'message-attachments';   -- public=false, 26214400
