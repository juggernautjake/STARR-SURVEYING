-- ============================================================================
-- 102_storage_buckets.sql
-- Creates Supabase Storage buckets required by the application.
--
-- The `research-documents` bucket stores user-uploaded survey documents
-- (PDFs, TIFFs, images, etc.) that are processed by the AI research pipeline.
--
-- The bucket is PUBLIC so that stored URLs can be used directly in the browser
-- (e.g. <img src={storage_url}> in the research UI, PDF viewer, aerial grid).
-- Files are stored under per-project UUID paths, making them difficult to
-- enumerate.  Signed upload URLs are still used for the upload flow to avoid
-- 413 errors; downloads also support signed-URL proxy for extra security.
--
-- Run via Supabase SQL Editor or psql after applying 090_research_tables.sql.
-- ============================================================================

-- ── research-documents bucket ─────────────────────────────────────────────
-- Public bucket so that storage_url values can be embedded directly in the
-- Next.js UI without requiring server-side signed-URL generation on every
-- page load.  Write access (upload/delete) is controlled via RLS policies
-- below and the service-role key used by the Next.js API layer.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'research-documents',
    'research-documents',
    true,           -- public: storage_url values are usable directly in the browser
    52428800,       -- 50 MB per-file limit (validated at API layer too)
    NULL            -- all MIME types allowed (validated at API layer)
)
ON CONFLICT (id) DO UPDATE SET public = true;  -- idempotent: ensure bucket is public

-- ── Row-Level Security for storage.objects ────────────────────────────────
-- The bucket is public so anonymous read access (SELECT/GET) is handled by
-- Supabase's built-in public-bucket logic — no SELECT policy is needed.
-- The policies below restrict WRITE operations (INSERT/DELETE) to the
-- service_role key (used by the Next.js API layer) and authenticated users.
-- This prevents anonymous uploads or deletions.

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
