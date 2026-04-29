-- seeds/243_starr_field_equipment_photos_bucket.sql
--
-- Phase F10 polish — Supabase Storage bucket policy for the
-- equipment photos referenced by `equipment_inventory.photo_url`
-- (added in seeds/238).
--
-- Access model is shop-wide-read, role-gated-write — different
-- from the per-user receipts bucket (seeds/220):
--
--   * **Read**: every internal user (admin / developer /
--     tech_support / equipment_manager / any field role) can
--     fetch equipment photos via signed URL. Photos are
--     low-sensitivity catalogue context — knowing what your
--     team's tripod looks like isn't PII.
--
--   * **Write**: bucket itself is private (public=false). All
--     writes go through service_role (the upload endpoint
--     authorises admin / developer / equipment_manager + writes
--     via supabaseAdmin). No authenticated INSERT/UPDATE/DELETE
--     policy — keeps the catalogue curated.
--
-- Path convention: `{equipment_id}/{filename}.{ext}` so additional
-- photos (before/after damage, calibration cert images, etc.) can
-- land later without schema change. The first photo gets
-- `{equipment_id}/photo.jpg` (or .png/.webp depending on source);
-- the upload endpoint normalises HEIC/HEIF to JPEG before storing
-- so admins can preview without HEIC-aware browsers.
--
-- File size limit: 10 MB. Equipment photos are typically clean
-- snapshot+crop, not raw originals — much smaller than receipts.
-- Allowed MIME types match the receipts bucket plus PNG / WEBP
-- which Equipment Manager is more likely to upload from a
-- desktop browser.
--
-- Apply AFTER seeds/238 (which added the photo_url column).
-- Idempotent — bucket upsert + DO-block policy guards.

BEGIN;

-- ── Bucket: starr-field-equipment-photos ──────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'starr-field-equipment-photos',
  'starr-field-equipment-photos',
  false,                  -- private; reads via signed URLs only
  10485760,               -- 10 MB cap
  ARRAY['image/jpeg','image/png','image/heic','image/heif','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/heic','image/heif','image/webp'];

-- ── Service-role: full access ─────────────────────────────────────────────
-- The upload endpoint runs as service_role via supabaseAdmin so
-- the role-gate (admin / developer / equipment_manager) lives at
-- the application layer, not the SQL layer. This matches the
-- F10.1c-i POST equipment endpoint pattern.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_equipment_photos_service_role_all'
  ) THEN
    CREATE POLICY starr_field_equipment_photos_service_role_all
      ON storage.objects
      FOR ALL TO service_role
      USING      (bucket_id = 'starr-field-equipment-photos')
      WITH CHECK (bucket_id = 'starr-field-equipment-photos');
  END IF;
END $$;

-- ── Authenticated read (any internal user) ────────────────────────────────
-- Signed URLs bypass RLS by design — this policy is the safety
-- net for direct (non-signed) reads via the storage API. Required
-- so the mobile app's image cache can refetch on signed-URL
-- expiry without hitting a 403.
--
-- We don't gate by role in SQL because:
--   1. Mobile sessions don't carry role claims in the JWT in a
--      shape RLS can read directly without a roundtrip
--   2. Equipment photos are low-sensitivity (no PII)
--   3. The catalogue page already runs role-gated, and direct
--      bucket access requires knowing the path (which only the
--      catalogue exposes)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_equipment_photos_authenticated_select'
  ) THEN
    CREATE POLICY starr_field_equipment_photos_authenticated_select
      ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'starr-field-equipment-photos');
  END IF;
END $$;

-- No INSERT / UPDATE / DELETE policies for `authenticated` — the
-- upload + replace + delete endpoints write via service_role only,
-- enforced by the F10 POST /api/admin/equipment/[id]/photo route's
-- (queued) role check at the application layer. Catalogue stays
-- curated.

COMMIT;
