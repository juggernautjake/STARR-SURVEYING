-- seeds/623_research_run_lineage.sql — a re-run is a NEW RUN over a KEPT LIBRARY.
--
-- ── WHAT A RE-RUN DOES TODAY, AND WHY IT IS WRONG IN BOTH DIRECTIONS ────────────────────────────
--
-- `PATCH /api/admin/research` with `clear_pipeline_documents: true` runs this:
--
--     DELETE FROM research_documents
--      WHERE research_project_id = $1 AND source_type <> 'user_upload'
--
-- The confirmation dialog is honest about it — "All data from the previous run will be permanently
-- deleted" — and that is the first half of the problem. The owner's requirement is the opposite:
-- **keep the files from the first run.** A run that was cut short by a dropped connection or a
-- killed process still bought and downloaded real documents, and throwing them away is throwing
-- away money that was already spent.
--
-- The second half is the mirror image. Nothing stops a re-run from writing the same document again.
-- `harvest-supabase-sync.ts` and `artifact-uploader.ts` both end in a bare `.insert(row)`, so the
-- second run re-inserts everything the first run found. Measured against production on 2026-09-01,
-- before any of this shipped:
--
--     671 research_documents rows across 57 projects
--      25 duplicate groups by (project, document_label, recording_info) — every one exactly 2 rows
--      19 groups of rows pointing at the SAME storage_path, 53 redundant rows between them
--       2 research_runs rows in total
--
-- Every one of those pairs is a document a second run found again and filed twice. And that last
-- number is the reason it is invisible: with two run rows for 671 documents, **almost no document
-- in the system can say which run produced it**, so nothing can tell a duplicate from a document
-- that was legitimately found twice by two different sources.
--
-- ── SO THE FIX IS TWO COLUMNS' WORTH OF IDEA ────────────────────────────────────────────────────
--
--   1. ATTRIBUTION.  Every document says which run first produced it and which run last saw it.
--                    Without that, "keep the old files" and "do not duplicate" cannot both be true,
--                    because nothing can tell the two cases apart.
--
--   2. IDENTITY.     Every document carries the cross-vendor identity key that
--                    `worker/src/research/document-identity.ts` already computes for purchase
--                    decisions, plus a SHA-256 of the stored bytes. The purchase path has had a
--                    careful identity model since plan S-12; the PERSISTENCE path never used it.
--
-- With both, a re-run stops being a delete-and-replace and becomes what it should always have been:
-- research everything again from scratch, and file what comes back into a library that already
-- knows what it holds.
--
-- ── WHY `duplicate_of` AND NOT A DELETE ─────────────────────────────────────────────────────────
--
-- The same asymmetry that governs `DocumentIndex.decide()` governs this table, pointed the other
-- way. There, an over-eager match SKIPS BUYING a document we do not have, silently. Here, an
-- over-eager match DELETES a row, and deleting is the one action that cannot be walked back by
-- looking again.
--
-- So a duplicate is never removed. It is pointed at the row it duplicates, with the reason recorded
-- in text a person can read and disagree with. The library view shows one row per document; the
-- duplicate is one click away and can be un-marked. Nothing is lost by being wrong.
--
-- ── AND WHY `superseded_at` IS SEPARATE FROM `duplicate_of` ─────────────────────────────────────
--
-- They answer different questions and conflating them would lose one of the answers:
--
--     duplicate_of   this row is the SAME DOCUMENT as another row in this project.
--     superseded_at  this row belongs to a run that a later run replaced.
--
-- A superseded document is still a real, distinct document — it is simply from the previous
-- attempt. A re-run supersedes the previous run's rows so the current view is the current run's
-- work, and the previous run's files stay exactly where they are, downloadable, attributed, and one
-- toggle away. That is the "keep the files from the first run saved" requirement, stated as data.
--
-- Idempotent.

BEGIN;

-- ── 1. The run gains a number, an intent, and the settings it was given ────────────────────────
--
-- `settings` and `inputs` exist because the owner's second requirement is that a re-run be EDITABLE:
-- add or remove starting information, change whether it may use TexasFile, change its ceilings. A
-- run that can be configured must record what it was configured with, or the next person cannot
-- tell whether a thinner report came from a thinner property or a tighter budget.

ALTER TABLE research_runs
  ADD COLUMN IF NOT EXISTS run_number     integer,
  ADD COLUMN IF NOT EXISTS trigger        text,
  ADD COLUMN IF NOT EXISTS settings       jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inputs         jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS supersedes_run_id uuid REFERENCES research_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress_percent  integer,
  ADD COLUMN IF NOT EXISTS stop_reason       text;

COMMENT ON COLUMN research_runs.progress_percent IS
  'How far the run had got, 0-99 while running and 100 only on a genuine completion. Persisted at '
  'every phase boundary so a poll that cannot reach the worker still draws a truthful bar instead '
  'of falling back to a number inferred from prose.';

-- ── WHY A RUN NEEDS TO SAY *WHY* IT STOPPED, SEPARATELY FROM `status` ──────────────────────────
--
-- The worker has exactly one AbortController per run and two things call `.abort()` on it:
-- `index.ts:1208` when the run reaches its cost or time ceiling, and `index.ts:2092` when a person
-- presses cancel. The status endpoint could not tell them apart, so it reported both as:
--
--     { status: 'failed', failureReason: 'Pipeline cancelled by user' }
--
-- and `counties/router.ts:526` wrapped that into `Bell County research failed: Pipeline cancelled
-- by user`. A run that finished early because it hit a $2.00 ceiling — a NORMAL, SUCCESSFUL,
-- deliberate outcome — was reported to the operator as a failure caused by a person who had not
-- touched it. Meanwhile the budget bar beside it read "Finished in 2 minutes for $0.02". Both were
-- rendering the same run.
--
-- `stop_reason` is the missing distinction: budget_reached | cancelled_by_user | worker_stopped |
-- error. `status` says whether the research is usable; `stop_reason` says what ended it.
COMMENT ON COLUMN research_runs.stop_reason IS
  'What ended the run: budget_reached | cancelled_by_user | worker_stopped | error | finished. '
  'Distinct from status, which says whether the result is usable. A run that hits its ceiling is '
  'status=complete, stop_reason=budget_reached — it did not fail, and it was not cancelled by a '
  'person, and it used to be reported as both.';

COMMENT ON COLUMN research_runs.run_number IS
  'Ordinal within the project: 1 for the first run, 2 for the first re-run. Displayed, and used to '
  'label a document''s provenance in a way a person can hold in their head — "found in run 2".';

COMMENT ON COLUMN research_runs.trigger IS
  'Why this run exists: initial | rerun_same | rerun_edited | resumed_after_interrupt. A re-run '
  'after an interruption is not the same event as a re-run with new starting information, and the '
  'run list is where somebody works out what happened.';

COMMENT ON COLUMN research_runs.settings IS
  'The knobs this run was given — allowPaidDocuments, maxResearchTimeMinutes, maxCostUsd, mode. '
  'Recorded per RUN and not only per project, because the whole point of an editable re-run is that '
  'run 2 may be configured differently from run 1, and a report has to be explicable afterwards.';

COMMENT ON COLUMN research_runs.inputs IS
  'The starting information: address, county, parcel id, owner name, operator notes, and the names '
  'of any files the operator attached. The values, not references to them — a run must stay '
  'explicable after somebody edits the project.';

-- Backfill an ordinal for the runs that already exist, so the column is never half-meaningful.
-- `WHERE run_number IS NULL` keeps this a no-op on every re-run of the seed.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY research_project_id ORDER BY started_at) AS n
  FROM research_runs
)
UPDATE research_runs r
   SET run_number = numbered.n
  FROM numbered
 WHERE r.id = numbered.id
   AND r.run_number IS NULL;

UPDATE research_runs SET trigger = 'initial' WHERE trigger IS NULL AND run_number = 1;
UPDATE research_runs SET trigger = 'rerun_same' WHERE trigger IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_research_runs_project_number
  ON research_runs (research_project_id, run_number)
  WHERE run_number IS NOT NULL;


-- ── 2. The document gains provenance and identity ──────────────────────────────────────────────

ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS research_run_id  uuid REFERENCES research_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_seen_run_id uuid REFERENCES research_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS run_seen_count   integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS identity_key     text,
  ADD COLUMN IF NOT EXISTS content_sha256   text,
  ADD COLUMN IF NOT EXISTS duplicate_of     uuid REFERENCES research_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_reason text,
  ADD COLUMN IF NOT EXISTS superseded_at    timestamptz;

COMMENT ON COLUMN research_documents.research_run_id IS
  'The run that FIRST produced this document. NULL for the 671 rows that predate run attribution '
  'and for anything a person uploaded by hand.';

COMMENT ON COLUMN research_documents.last_seen_run_id IS
  'The most recent run that found this document again. When run 2 re-finds what run 1 already has, '
  'this moves and run_seen_count increments — no second row is written. That is the whole '
  'deduplication contract in one column: finding it again is an OBSERVATION, not a new document.';

COMMENT ON COLUMN research_documents.identity_key IS
  'The cross-vendor identity from worker/src/research/document-identity.ts — COUNTY|I:instrument|date '
  'or COUNTY|B:book-page|date. NULL when the document cannot be identified (no readable recording '
  'date, or neither an instrument number nor a book/page). A NULL key can never match anything, '
  'which is deliberate: an unidentifiable document is filed again rather than silently merged into '
  'something it might not be.';

COMMENT ON COLUMN research_documents.content_sha256 IS
  'SHA-256 of the stored bytes. Catches the duplicate the citation cannot: the same page image '
  'arriving from two vendors that number it differently, and the screenshot re-taken on every run.';

COMMENT ON COLUMN research_documents.duplicate_of IS
  'This row is the same document as the row it points at. Never deleted, always reversible — an '
  'over-eager match here would destroy a document, and looking again cannot undo a DELETE.';

COMMENT ON COLUMN research_documents.superseded_at IS
  'Set when a later run replaced this run''s work. A superseded document is still real and still '
  'downloadable; it is simply from the previous attempt. Distinct from duplicate_of, which says '
  'this row is the same document as another one.';

-- The two questions the library asks, and the one the run panel asks.
CREATE INDEX IF NOT EXISTS idx_research_docs_run
  ON research_documents (research_run_id);

CREATE INDEX IF NOT EXISTS idx_research_docs_identity
  ON research_documents (research_project_id, identity_key)
  WHERE identity_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_research_docs_sha
  ON research_documents (research_project_id, content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_research_docs_duplicate_of
  ON research_documents (duplicate_of)
  WHERE duplicate_of IS NOT NULL;

-- ── THE BACKSTOP, AND WHY IT IS ONLY A BACKSTOP ────────────────────────────────────────────────
--
-- The worker checks the library before it writes, which is where the readable explanation of a
-- duplicate comes from. This index is what happens when two phases of the same run race each other
-- to file the same instrument — the check passes twice, and only the database can break the tie.
--
-- It covers live rows only. A row already marked as a duplicate is excluded, so marking one does
-- not have to fight the constraint, and rows with no identity are excluded because NULL cannot
-- identify anything.
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_docs_identity_unique
  ON research_documents (research_project_id, identity_key)
  WHERE identity_key IS NOT NULL AND duplicate_of IS NULL;


-- ── 3. The duplicates that are already in there ────────────────────────────────────────────────
--
-- 53 rows share a storage_path with an earlier row and 25 more share a label and recording
-- reference. They are pointed at the row they duplicate — not deleted, per the rule above — so the
-- library view is correct on the day this ships rather than only for runs that happen afterwards.
--
-- Two passes, strongest evidence first. Both keep the OLDEST row: it is the one whose id other
-- tables (extracted_data_points.document_id, annotations) already reference, so keeping it is also
-- the choice that breaks nothing.
--
-- `WHERE d.duplicate_of IS NULL` makes both passes idempotent AND makes them defer to a human:
-- once somebody un-marks a duplicate, re-running the seed will not re-mark it.

-- Pass 1 — identical stored bytes. The same file, referenced twice.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY research_project_id, storage_path
                               ORDER BY created_at, id) AS keeper
  FROM research_documents
  WHERE storage_path IS NOT NULL AND storage_path <> ''
)
UPDATE research_documents d
   SET duplicate_of = ranked.keeper,
       duplicate_reason = 'Same stored file (identical storage_path) as the earlier row. '
                          'Marked automatically by seed 623; un-mark it if these are genuinely '
                          'different documents.',
       updated_at = now()
  FROM ranked
 WHERE d.id = ranked.id
   AND ranked.keeper <> d.id
   AND d.duplicate_of IS NULL;

-- Pass 2 — same project, same label, same recording reference, and neither row is a user upload.
-- Weaker evidence than a byte-identical file, so it is stated as such in the reason.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY research_project_id, document_label, recording_info
                               ORDER BY created_at, id) AS keeper
  FROM research_documents
  WHERE source_type <> 'user_upload'
    AND document_label IS NOT NULL
)
UPDATE research_documents d
   SET duplicate_of = ranked.keeper,
       duplicate_reason = 'Same document label and recording reference as the earlier row in this '
                          'project, and both came from the pipeline rather than an upload. Marked '
                          'automatically by seed 623; un-mark it if these are genuinely different.',
       updated_at = now()
  FROM ranked
 WHERE d.id = ranked.id
   AND ranked.keeper <> d.id
   AND d.duplicate_of IS NULL;

COMMIT;
