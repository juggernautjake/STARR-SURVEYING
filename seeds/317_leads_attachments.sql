-- ============================================================================
-- 317_leads_attachments.sql
--
-- The public contact form (app/api/contact/route.ts) already accepts
-- attached files (drafts, deeds, PDFs of the parcel) and emails them to
-- the business inbox. The admin lead-detail page never saw them — the
-- `leads` table had no column for attachment metadata, so customers'
-- file uploads vanished off the office UI.
--
-- This seed adds a JSONB `attachments` column with an empty-array default
-- so the existing INSERT path keeps working unchanged. The intake helper
-- now writes a `[{name, size, storage_path?}, …]` summary alongside the
-- email send, and the lead-detail page renders the list.
--
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.leads.attachments IS
  'Array of {name, size, storage_path?} entries — one per file the customer attached to the public intake form.';

COMMIT;

-- Verification:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='leads' AND column_name='attachments';
