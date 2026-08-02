-- 534_data_point_review.sql — a fact somebody checked, and a fact nobody has (plan R23).
--
-- `extracted_data_points` has carried a confidence score since seed 090 and no human verdict at all.
-- So a value read correctly off a deed and a value the model invented look identical to the next
-- reader, and to every downstream stage — the boundary computation, the drawing, the packet. A
-- reviewer who spotted a wrong bearing had nowhere to put that knowledge; the only options were to
-- fix nothing or to fix it somewhere else and let the two disagree.
--
-- ── THE ORIGINAL IS NEVER OVERWRITTEN ───────────────────────────────────────────────────────────
--
-- A correction goes in `corrected_value`. `raw_value` keeps what the document/model produced,
-- untouched, for the same reason `research_survey_plans.ai_plan` does (seed 533) and the same reason
-- drawings keep annotations apart from the source image: once a correction overwrites the original,
-- "what did the extraction actually say" stops being answerable — and that is exactly the question
-- to ask when the same mistake shows up on the next property.
--
-- It is also what makes corrections usable as golden-record data for the self-healing checks (R9):
-- a pair of (what we extracted, what it should have been) is a test case. An overwrite is not.

ALTER TABLE extracted_data_points ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE extracted_data_points ADD COLUMN IF NOT EXISTS corrected_value TEXT;
ALTER TABLE extracted_data_points ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE extracted_data_points ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE extracted_data_points ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE extracted_data_points DROP CONSTRAINT IF EXISTS extracted_data_points_review_status_check;
ALTER TABLE extracted_data_points
  ADD CONSTRAINT extracted_data_points_review_status_check
  CHECK (review_status IN ('unreviewed', 'accepted', 'rejected', 'corrected'));

-- A correction with no corrected value is a status nobody can act on.
ALTER TABLE extracted_data_points DROP CONSTRAINT IF EXISTS extracted_data_points_corrected_has_value;
ALTER TABLE extracted_data_points
  ADD CONSTRAINT extracted_data_points_corrected_has_value
  CHECK (review_status <> 'corrected' OR corrected_value IS NOT NULL);

-- "What still needs checking on this project" is the question the review screen opens with, so it
-- gets an index rather than a scan of every fact ever extracted.
CREATE INDEX IF NOT EXISTS idx_data_points_unreviewed
  ON extracted_data_points (research_project_id)
  WHERE review_status = 'unreviewed';

-- The corrections, which are the golden-record candidates (R9).
CREATE INDEX IF NOT EXISTS idx_data_points_corrected
  ON extracted_data_points (research_project_id, reviewed_at DESC)
  WHERE review_status = 'corrected';
