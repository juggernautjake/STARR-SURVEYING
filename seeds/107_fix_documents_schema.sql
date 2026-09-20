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
--
-- ── THIS MIGRATION MUST NOT NARROW WHAT THE DATA HAS OUTGROWN (2026-09-19) ───────────────────
--
-- Re-running the whole seed set against production stopped dead here:
--
--   ✗ 107_fix_documents_schema.sql: check constraint
--     "research_documents_document_type_check" is violated by some row
--
-- Nothing was wrong with the database. This file EXPANDED the list when it was written, but
-- seeds/626_research_documents_capture_columns.sql later expanded it much further — 'aerial',
-- 'aerial_wide', 'aerial_close', 'street_view', 'oblique' and more — and the research runs have
-- been writing those ever since. 38 rows use them.
--
-- Because the set is applied in numeric order, 107 runs BEFORE 626 and was dropping the correct
-- wide constraint to install its own narrow one, against data that had moved on years of commits
-- ago. It only ever failed on a database that was already right.
--
-- So the drop-and-recreate now happens only when every existing row would still satisfy this
-- file's list. On a fresh or genuinely old database that is true and this migration does exactly
-- what it always did. On a live one it steps aside and leaves 626's wider constraint in place.
--
-- A migration that can only be applied to a database nobody has used is not idempotent, whatever
-- its header claims.
DO $$
DECLARE
  constraint_name TEXT;
  offenders BIGINT;
BEGIN
  SELECT count(*) INTO offenders
  FROM research_documents
  WHERE document_type IS NOT NULL
    AND document_type NOT IN (
      'deed', 'plat', 'survey', 'legal_description',
      'title_commitment', 'easement', 'restrictive_covenant',
      'field_notes', 'subdivision_plat', 'metes_and_bounds',
      'county_record', 'appraisal_record', 'aerial_photo',
      'topo_map', 'utility_map',
      'gis_map', 'flood_map', 'property_report', 'road_map',
      'deed_screenshot', 'plat_screenshot', 'map_screenshot',
      'other'
    );

  IF offenders > 0 THEN
    RAISE NOTICE '107: leaving the existing document_type constraint alone — % row(s) use a type added after this migration (see seeds/626).', offenders;
    RETURN;
  END IF;

  -- `conrelid = 'research_documents'::regclass`, not `rel.relname = 'research_documents'`.
  -- The name match finds a constraint on ANY schema's table of that name, and the DROP below then
  -- runs against whichever one the search_path resolves to — so on a database with more than one,
  -- this reads a constraint off one table and tries to drop it from another. Caught on 2026-09-19
  -- while exercising this migration against a scratch copy; `regclass` resolves once, through the
  -- same search_path the ALTER uses, so the two can no longer disagree.
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  WHERE con.conrelid = 'research_documents'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%document_type%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE research_documents DROP CONSTRAINT %I', constraint_name);
  END IF;

  EXECUTE $c$
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
      ))
  $c$;
END $$;
