-- Migration 106: Expand document_type CHECK constraint with new specific types
-- Adds: gis_map, flood_map, property_report, road_map, deed_screenshot,
--        plat_screenshot, map_screenshot
-- Purpose: Reduce "other" classification by providing more specific categories
-- for GIS screenshots, flood maps, road/ROW maps, and document screenshots.

-- Drop the old CHECK constraint and recreate with expanded values.
-- The constraint name is auto-generated; use a subquery to find and drop it.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = con.conrelid
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

COMMENT ON CONSTRAINT research_documents_document_type_check ON research_documents IS
  'Expanded document type categories (migration 106) — reduces reliance on catch-all "other" type';
