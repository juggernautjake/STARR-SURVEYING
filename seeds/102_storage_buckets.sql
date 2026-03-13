-- ============================================================================
-- 102_storage_buckets.sql
-- Creates Supabase Storage buckets required by the application.
--
-- The `research-documents` bucket stores user-uploaded survey documents
-- (PDFs, TIFFs, images, etc.) that are processed by the AI research pipeline.
-- Files are accessed exclusively via server-generated signed URLs, so the
-- bucket is private (not publicly readable).
--
-- Run via Supabase SQL Editor or psql after applying 090_research_tables.sql.
-- ============================================================================

-- ── research-documents bucket ─────────────────────────────────────────────
-- Private bucket; all access is mediated by the Next.js API layer using the
-- service-role key.  Browser uploads use short-lived signed upload URLs
-- (createSignedUploadUrl) and downloads use signed read URLs
-- (createSignedUrl), both created server-side.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'research-documents',
    'research-documents',
    false,          -- private: no anonymous/public read access
    52428800,       -- 50 MB per-file limit (validated at API layer too)
    NULL            -- all MIME types allowed (validated at API layer)
)
ON CONFLICT (id) DO NOTHING;

-- ── Row-Level Security for storage.objects ────────────────────────────────
-- The service_role key (used by supabaseAdmin in API routes) bypasses RLS
-- automatically.  The policies below allow authenticated users to manage
-- their own files when accessed via signed URLs, and prevent anonymous
-- access entirely.

-- Enable RLS on storage.objects (may already be enabled; harmless if so)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Service role has unrestricted access (implicit via Supabase; policy is
-- redundant but added for clarity and portability).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename  = 'objects'
          AND policyname = 'research_documents_service_role_all'
    ) THEN
        CREATE POLICY research_documents_service_role_all
            ON storage.objects
            FOR ALL
            TO service_role
            USING      (bucket_id = 'research-documents')
            WITH CHECK (bucket_id = 'research-documents');
    END IF;
END;
$$;

-- Authenticated users may upload (INSERT) objects into the bucket.
-- Actual path authorisation is enforced by the API before issuing a signed
-- upload URL; this policy is the Supabase-side safety net.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename  = 'objects'
          AND policyname = 'research_documents_authenticated_insert'
    ) THEN
        CREATE POLICY research_documents_authenticated_insert
            ON storage.objects
            FOR INSERT
            TO authenticated
            WITH CHECK (bucket_id = 'research-documents');
    END IF;
END;
$$;

-- Authenticated users may read objects (needed for signed-URL redirects).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename  = 'objects'
          AND policyname = 'research_documents_authenticated_select'
    ) THEN
        CREATE POLICY research_documents_authenticated_select
            ON storage.objects
            FOR SELECT
            TO authenticated
            USING (bucket_id = 'research-documents');
    END IF;
END;
$$;

-- Authenticated users may delete their own objects (e.g., when a document
-- record is removed from research_documents).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename  = 'objects'
          AND policyname = 'research_documents_authenticated_delete'
    ) THEN
        CREATE POLICY research_documents_authenticated_delete
            ON storage.objects
            FOR DELETE
            TO authenticated
            USING (bucket_id = 'research-documents');
    END IF;
END;
$$;
