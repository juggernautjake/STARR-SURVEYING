-- 570_document_ocr_regions.sql — keeping the coordinates the OCR already measured (plan R17),
-- and correcting a column name that nearly caused this seed to destroy the document viewer.
--
-- ── THE COORDINATES WERE ALREADY BEING PRODUCED, AND THROWN AWAY ────────────────────────────────
--
-- `extracted_data_points.source_bounding_box` has existed since seed 090 and has NEVER held a value.
-- The reason recorded in the plan was that text extraction has no coordinates to give.
--
-- That stopped being true when R18 shipped. `adaptive-vision.ts` tiles a page into quadrants, OCRs
-- each one, escalates the dense ones into zoom sub-quadrants, and returns a pixel `boundingBox` for
-- every segment. `ai-extraction.ts` then keeps `avResult.mergedText` and drops `avResult.segments`.
--
-- So the coordinates were being produced and thrown away two files before anything could store them.
--
-- ── A COLUMN CALLED ocr_regions THAT HOLDS NO REGIONS ───────────────────────────────────────────
--
-- The obvious place to put them was `research_documents.ocr_regions`, which has existed, unused and
-- undocumented, since seed 090.
--
-- It is NOT unused. `artifact-uploader.ts` writes `{"pageUrls": [...]}` into it — the list of page
-- image URLs — and `SourceDocumentViewer.tsx` and `ResearchRunPanel.tsx` read it back to render the
-- document's pages. Writing OCR segments there would have blanked the page viewer for every document
-- in the system, and the failure would have shown up as documents that simply stopped displaying,
-- with nothing pointing at the seed that did it.
--
-- The column is misnamed, not free. Renaming it would break two components and every row, so the
-- cheaper and safer fix is to say what it actually holds — which is what the COMMENT below does, and
-- which is the thing whose absence made it look free in the first place.
--
-- The segments go in a NEW column.
--
-- ── WHY THE PAGE SIZE IS STORED WITH THEM, AND NOT SEPARATELY ───────────────────────────────────
--
-- The segment boxes are in PIXELS, measured against one particular rendering of the page. The fact
-- table's contract is fractions of the page, 0–1, precisely because a pixel box is correct exactly
-- once and silently points at the wrong place at every other resolution (see `isNormalisedBox`).
--
-- Converting between them needs the dimensions of the image the boxes were measured on. If those
-- live anywhere other than beside the boxes they can drift apart, and the failure mode of a
-- mismatched page size is not an error — it is a box that lands confidently on the wrong part of the
-- page. So the page size sits inside the same JSON value as the regions it describes, written in the
-- same statement, and a region set without one is treated as unusable rather than guessed at.
--
-- ── SHAPE ───────────────────────────────────────────────────────────────────────────────────────
--
--   {
--     "pageSize": { "width": 2550, "height": 3300 },
--     "regions": [
--       { "segmentId": "r0c1", "depth": 0, "page": 1,
--         "boundingBox": { "x": 1275, "y": 0, "w": 1275, "h": 1650 },
--         "text": "BEING 12.43 ACRES OF LAND ..." }
--     ]
--   }
--
-- JSONB rather than a table: these are read all-at-once with their document and never queried across
-- documents. A `document_ocr_segments` table would add a join to every read of a fact's provenance
-- for no query anybody makes.

-- Say what the OLD column actually holds. Its emptiness of documentation is what made it look like
-- free space for something else entirely.
COMMENT ON COLUMN research_documents.ocr_regions IS
    'DESPITE THE NAME, this holds no OCR regions. It stores {"pageUrls": [...]} — the page image '
    'URLs written by artifact-uploader.ts and read by SourceDocumentViewer.tsx and '
    'ResearchRunPanel.tsx to render a document''s pages. Overwriting it blanks the document viewer. '
    'Vision OCR segments live in ocr_segments (plan R17, seed 570).';

ALTER TABLE research_documents
    ADD COLUMN IF NOT EXISTS ocr_segments JSONB;

COMMENT ON COLUMN research_documents.ocr_segments IS
    'Vision OCR segments with pixel bounding boxes and the page size they were measured against '
    '(plan R17). Shape: { pageSize: {width,height}, regions: [{segmentId,depth,page,boundingBox,text}] }. '
    'NULL means the document was not read through the adaptive vision pipeline — which is NOT the '
    'same as "the document has no regions", and consumers must not present it as such.';

-- Documents that have segments are the only ones a fact can be located within, so this is the index
-- the locator's "can this document place anything?" check runs against.
CREATE INDEX IF NOT EXISTS idx_research_documents_has_ocr_segments
    ON research_documents (research_project_id)
    WHERE ocr_segments IS NOT NULL;

-- The index the first draft of this seed created, against the wrong column. Dropped so a re-run of
-- the seed folder does not leave it behind describing a relationship that does not exist.
DROP INDEX IF EXISTS idx_research_documents_has_ocr_regions;
