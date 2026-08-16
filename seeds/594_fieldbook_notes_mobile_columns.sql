-- ============================================================================
-- 594_fieldbook_notes_mobile_columns.sql
--
-- C44z of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
--
-- The second migration in this document that was designed, written down, and
-- never applied. Seed 593 was the first.
--
-- ── THE ROW SAID "NAME COLLISION". IT IS NOT ONE ────────────────────────────
--
-- C0d found `GET /api/admin/jobs/[id]/field-data` asking `fieldbook_notes` for
-- `body, note_template, structured_data, data_point_id`, saw that the live
-- table of that name carries `title`/`content`/`module_id`/`lesson_id`, and
-- concluded the job route was pointed at the LEARN notes table by accident —
-- a name collision needing a schema decision about which table should own
-- which notes.
--
-- Reading the live table settles it, and the answer is the other one. That
-- table also carries `job_id`, `job_name`, `job_number`, `is_current`,
-- `org_id`, `media` and `attachments`, and `app/api/admin/learn/fieldbook/
-- route.ts` describes itself in its first three lines as supporting
-- "public/private visibility, and job-linked notes". There is ONE fieldbook,
-- it has always been able to belong to a job, and the job routes are pointed
-- at exactly the right table.
--
-- The decision was in fact made two years of planning ago and written down.
-- `docs/planning/completed/STARR_FIELD_MOBILE_APP_PLAN.md` §5.5, verbatim:
--
--   "Notes table — none here. `field_notes` does not appear below: per §5.5,
--    mobile notes write through to the existing `fieldbook_notes` table.
--    ALTER columns for `fieldbook_notes` (e.g. `data_point_id`,
--    `note_template`, `structured_data` JSONB, `voice_transcript_media_id`)
--    ship in the same migration but extend the existing schema rather than
--    creating a parallel table."
--
-- The plan then prints the exact ALTER block below. It was never run. So this
-- is not a decision that was missing; it is a migration that was missing, and
-- the "collision" was the shape of its absence. That distinction matters
-- because creating a second notes table — the other option C44z left open —
-- would have split a surveyor's notes across two tables by which screen wrote
-- them, and quietly contradicted a decision already taken.
--
-- ── ON `body` VERSUS `content` ──────────────────────────────────────────────
--
-- Not everything the routes ask for is missing. `body` is not added here, and
-- deliberately:
--
--   * the server table has `content NOT NULL`, with four live rows in it and
--     three shipped routes reading it (`learn/fieldbook`, `learn/notes`, and
--     the my-notes UI);
--   * `body` is the column name in the MOBILE app's local SQLite mirror
--     (`mobile/lib/fieldNotes.ts`), which is a different database with its own
--     schema and no obligation to match;
--   * adding a second body column would leave two places for the text of a
--     note to live, and a note whose body is in the wrong one reads as blank.
--
-- So the column stays `content` and the two web routes are corrected to ask
-- for it. Renaming `content` to `body` would have been the other way to make
-- the query true, and it breaks three working routes to spare two broken ones.
--
-- ── APPLIED ────────────────────────────────────────────────────────────────
--
-- Idempotent (every statement is IF NOT EXISTS), so re-running is safe — which
-- is not true of several seeds in this repository.
-- ============================================================================

-- The point a note was taken at. Nullable: a note about the job as a whole
-- ("gate code is 4417, dog is friendly") belongs to no single shot, and
-- forcing one would make the commonest note the hardest to file.
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS data_point_id UUID
  REFERENCES field_data_points ON DELETE CASCADE;

-- Which structured template this note follows: 'offset_shot', 'hazard',
-- 'monument', … NULL means free text, which is the default and the majority.
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS note_template TEXT;

-- The template's payload. JSONB rather than columns because the templates are
-- a growing list defined in application code, and a column per field of every
-- template would make adding one a migration.
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS structured_data JSONB;

-- A dictated note keeps its recording. ON DELETE SET NULL, not CASCADE: losing
-- the audio must not delete the transcribed note, which is usually the part
-- that ends up in the deliverable.
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS voice_transcript_media_id UUID
  REFERENCES field_media ON DELETE SET NULL;

-- The mobile app's own id for a note created offline, so a note that syncs
-- twice is recognised as the same note rather than duplicated.
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS client_id TEXT;

-- The job manifest and the point viewer both filter by these, and both are
-- per-job reads on a table that will grow with every note ever taken.
CREATE INDEX IF NOT EXISTS idx_fieldbook_notes_job
  ON fieldbook_notes (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fieldbook_notes_data_point
  ON fieldbook_notes (data_point_id) WHERE data_point_id IS NOT NULL;

-- A client_id is only unique per author: two surveyors' offline databases can
-- hand out the same local id, and a global unique would make the second one
-- to sync fail with a conflict on somebody else's note.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fieldbook_notes_client_id
  ON fieldbook_notes (user_email, client_id) WHERE client_id IS NOT NULL;
