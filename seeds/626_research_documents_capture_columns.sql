-- seeds/626_research_documents_capture_columns.sql — every drawing, plat and aerial this system
-- captures is currently discarded at the INSERT.
--
-- ── MEASURED, NOT INFERRED ──────────────────────────────────────────────────────────────────────
--
-- Found by an eight-lens audit of the research platform on 2026-09-03 and confirmed against the
-- live database. FOUR row builders write to `research_documents` and THREE of them cannot execute:
--
--   worker/src/research/capture-runner.ts:222   every imagery/drawing capture
--   worker/src/services/harvest-supabase-sync.ts:239   every harvested document
--   worker/src/research/project-library.ts:196  the cross-run library READ
--
-- `capture-runner.ts` alone fails four separate ways in one statement:
--
--   source_type: 'pipeline_capture'   → 23514, the CHECK permits only user_upload, property_search,
--                                       linked_reference, manual_entry
--   public_url                        → 42703, no such column (it is `storage_url`)
--   ocr_text                          → 42703, no such column (it is `extracted_text`)
--   processing_status: 'stored'       → 23514, the CHECK has no such value
--   document_type: 13 of its 14 capture kinds → 23514
--
-- The evidence that none of it has ever run:
--
--   rows with source_type = 'pipeline_capture'  →  0 of 697
--   rows with content_sha256 set                →  0 of 697
--
-- `capture-runner.ts` is the ONLY originating writer of `content_sha256`. Zero rows in 697 is not a
-- feature nobody uses; it is a feature that has never once completed. Every satellite view, oblique,
-- street view, GIS capture and generated drawing the system has taken was written to storage and
-- then dropped on the way to the row that would let anyone find it.
--
-- ── WHY THIS BLOCKS THE OWNER'S FIRST PRIORITY ──────────────────────────────────────────────────
--
-- The requested run order is drawings/plats first, then overhead imagery, then documents. Reordering
-- the pipeline without this seed produces a run that does the right work in the right order and
-- discards the result of the first two thirds of it.
--
-- ── AND THE READ THAT SWALLOWS ITS OWN FAILURE ──────────────────────────────────────────────────
--
-- `project-library.ts:196` SELECTs `harvest_metadata`. PostgREST rejects a SELECT naming an unknown
-- column outright, so the whole query 42703s — and the error is downgraded to a `console.warn` and
-- an EMPTY library is returned. Cross-run deduplication is therefore off for every run ever made,
-- silently, and the symptom is only visible as `last_seen_run_id = research_run_id` on 100% of rows.
--
-- Adding the column fixes the read as well as the write.

-- ── 1. The columns the writers actually reference ──────────────────────────────────────────────
--
-- `harvest_metadata` carries the provenance that makes a captured file defensible six months later:
-- the vendor, the grantors, whether it was watermarked, what it cost, the capture scale and date.
-- A row without it is an image nobody can source.
ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS harvest_metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN research_documents.harvest_metadata IS
  'Provenance for harvested and captured documents: vendor, grantors, watermark, price, capture '
  'scale/date/source. Written by harvest-supabase-sync.ts and capture-runner.ts, read by '
  'project-library.ts. Absent until seed 626, which is why all three failed 42703.';

-- ── 2. `pipeline_capture` is a real origin ─────────────────────────────────────────────────────
--
-- Distinct from `property_search` on purpose: a deed the clerk index returned and a satellite view
-- we commissioned are different kinds of evidence, and a reviewer needs to tell them apart. That
-- distinction is exactly what the CHECK was rejecting.
ALTER TABLE research_documents DROP CONSTRAINT IF EXISTS research_documents_source_type_check;
ALTER TABLE research_documents ADD CONSTRAINT research_documents_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'user_upload', 'property_search', 'linked_reference', 'manual_entry',
    'pipeline_capture'
  ]));

-- ── 3. `stored` — bytes are down, nothing has read them yet ────────────────────────────────────
--
-- A captured aerial has no text to extract, so `pending` would leave it queued forever for work
-- that will never happen and `analyzed` would claim an analysis nobody ran. It needs its own word.
ALTER TABLE research_documents DROP CONSTRAINT IF EXISTS research_documents_processing_status_check;
ALTER TABLE research_documents ADD CONSTRAINT research_documents_processing_status_check
  CHECK (processing_status = ANY (ARRAY[
    'pending', 'extracting', 'extracted', 'analyzing', 'analyzed', 'error', 'unreadable',
    'stored'
  ]));

-- ── 4. The capture kinds ───────────────────────────────────────────────────────────────────────
--
-- `documentTypeFor()` in capture-runner.ts emits fourteen values and the CHECK admitted ONE of
-- them (`gis_map`). The existing 23 are all kept — nothing that files today stops filing.
--
-- Both spellings of two of them are admitted (`oblique`/`oblique_aerial`,
-- `street_view`/`streetview`) rather than picking a winner and breaking whichever call site uses
-- the other. Normalising them is a code change with a test, not a constraint that rejects rows at
-- 3am; this seed's job is to stop discarding data.
ALTER TABLE research_documents DROP CONSTRAINT IF EXISTS research_documents_document_type_check;
ALTER TABLE research_documents ADD CONSTRAINT research_documents_document_type_check
  CHECK (document_type = ANY (ARRAY[
    -- recorded instruments and reports, unchanged
    'deed', 'plat', 'survey', 'legal_description', 'title_commitment', 'easement',
    'restrictive_covenant', 'field_notes', 'subdivision_plat', 'metes_and_bounds',
    'county_record', 'appraisal_record', 'aerial_photo', 'topo_map', 'utility_map',
    'gis_map', 'flood_map', 'property_report', 'road_map', 'deed_screenshot',
    'plat_screenshot', 'map_screenshot', 'other',
    -- imagery and drawings the capture planner produces
    'aerial', 'aerial_wide', 'aerial_close', 'aerial_historical', 'aerial_neighbours',
    'adjoiner_aerial', 'historical_aerial',
    'oblique', 'oblique_aerial',
    'street_view', 'streetview',
    'cad_gis', 'drawing'
  ]));

-- Finding a run's captures is an ordinary operator question ("show me the aerials for this run")
-- and the partial index keeps it off the 697-row scan.
CREATE INDEX IF NOT EXISTS idx_research_documents_capture
  ON research_documents (research_project_id, document_type)
  WHERE source_type = 'pipeline_capture';

-- Cross-run dedupe reads this. It has been NULL on every row because its only writer could not
-- execute; the index is here so it is fast the first time it is not.
CREATE INDEX IF NOT EXISTS idx_research_documents_sha
  ON research_documents (content_sha256)
  WHERE content_sha256 IS NOT NULL;
