-- Migration 107: Combined schema fix for research_documents
-- Ensures pages_pdf_url column exists (from 098) and document_type
-- CHECK constraint includes all needed types (from 106).
-- Safe to run multiple times (idempotent).

-- ── 1. Add pages_pdf_url column if missing ───────────────────────────────────
ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS pages_pdf_url TEXT;

COMMENT ON COLUMN research_documents.pages_pdf_url IS
  'Public Supabase Storage URL for the PDF bundled from downloaded page images.';

-- ── 2. Expand document_type CHECK constraint ─────────────────────────────────
-- Drop the old constraint (whatever name it has) and recreate.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'research_documents'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%document_type%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE research_documents DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE research_documents
  ADD CONSTRAINT research_documents_document_type_check
  CHECK (document_type IN (
    'deed', 'plat', 'survey', 'legal_description',
    'title_commitment', 'easement', 'restrictive_covenant',
    'field_notes', 'subdivision_plat', 'metes_and_bounds',
    'county_record', 'appraisal_record', 'aerial_photo',
    'topo_map', 'utility_map',
    'gis_map', 'flood_map', 'property_report', 'road_map',
    'deed_screenshot', 'plat_screenshot', 'map_screenshot',
    'other'
  ));
