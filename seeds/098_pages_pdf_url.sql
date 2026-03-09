-- seeds/098_pages_pdf_url.sql
-- Adds pages_pdf_url column to research_documents to store the
-- public URL of the PDF bundled from Kofile page images.
-- Run once via: psql $DATABASE_URL -f seeds/098_pages_pdf_url.sql

ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS pages_pdf_url TEXT;

COMMENT ON COLUMN research_documents.pages_pdf_url IS
  'Public Supabase Storage URL for the PDF bundled from downloaded page images (Kofile interception). Set by the pipeline worker after Stage 2.5.';
