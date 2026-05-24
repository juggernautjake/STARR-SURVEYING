-- ============================================================================
-- 290_cad_images_bucket.sql
-- Creates the `cad-images` Supabase Storage bucket for raster images placed
-- into CAD survey drawings (aerials, plats, sketches).
--
-- Storing the bytes here (referenced by public URL) instead of inlining
-- base64 in the cad_drawings.document JSONB keeps image-heavy surveys small
-- and fast to save/load. The bucket is public so getPublicUrl() values render
-- directly in <img> tags and the PixiJS canvas. Writes are restricted to the
-- service-role key (used by /api/admin/cad/images) + authenticated users.
--
-- Idempotent. Also auto-created at runtime by ensureStorageBucket() on first
-- upload, so applying this seed is optional but recommended for RLS.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'cad-images',
    'cad-images',
    true,
    26214400,   -- 25 MB per-file limit (validated at the API layer too)
    NULL
)
ON CONFLICT (id) DO UPDATE SET public = true;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'cad_images_service_role_all'
    ) THEN
        CREATE POLICY cad_images_service_role_all
            ON storage.objects FOR ALL TO service_role
            USING      (bucket_id = 'cad-images')
            WITH CHECK (bucket_id = 'cad-images');
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'cad_images_authenticated_insert'
    ) THEN
        CREATE POLICY cad_images_authenticated_insert
            ON storage.objects FOR INSERT TO authenticated
            WITH CHECK (bucket_id = 'cad-images');
    END IF;
END;
$$;

-- ── Verification ─────────────────────────────────────────────────────────
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'cad-images';
