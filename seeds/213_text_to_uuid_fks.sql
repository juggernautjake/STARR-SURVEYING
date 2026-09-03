-- ============================================================================
-- 213_text_to_uuid_fks.sql
-- STARR RECON — Convert TEXT project_id columns to UUID with FK
--
-- Two columns reference research_projects.id but were declared as TEXT
-- (no FK, no type safety). The migration audit flagged them as "ghost FKs."
-- This migration converts both to proper UUID + FK columns.
--
-- Safety guard:
--   Both tables are expected to be empty at apply time (verified via Query 9
--   in the post-migration audit). The DO block at the top aborts with a
--   clear error if any rows exist — that case needs a real backfill strategy
--   (parse valid UUIDs from existing TEXT, decide what to do with garbage
--   "temp ID" rows), not a naive drop+add.
--
-- Approach (when both tables are empty, the simple path):
--   1. Drop the existing index on the TEXT column.
--   2. Drop the TEXT column.
--   3. Add a new UUID column with FK to research_projects(id), ON DELETE
--      SET NULL (preserves telemetry/history rows when a project is deleted).
--   4. Re-create the index on the new column.
--
-- Nullability:
--   * research_usage_events.research_project_id was originally TEXT NOT NULL
--     "may be temp ID per worker comment". The temp-ID semantic implies the
--     project may not exist when the event is logged. New column is NULLABLE
--     to support that (if the worker has a real project_id, set it; if it's
--     a temp string today, set NULL until backfill from a future workflow).
--   * document_purchase_history.project_id was originally TEXT DEFAULT NULL
--     "NULL for wallet credits". Stays nullable.
-- ============================================================================

BEGIN;


-- ─────────────────────────────────────────────────────────────────────────────
-- §0. Safety guard — abort loudly if either table has data
-- ─────────────────────────────────────────────────────────────────────────────

-- ── "ARE THERE ROWS?" IS NOT THE SAME QUESTION AS "IS THERE WORK TO DO?" ────────────────────
--
-- Measured 2026-09-03, running the full seed set against production: this file aborted the run at
-- file 35 of 420 with
--
--     research_usage_events has 14 rows — naive drop+add would lose data
--
-- which is a true sentence about a situation that does not exist. The migration had ALREADY RUN.
-- Both columns are `uuid` and both foreign keys are in place
-- (`research_usage_events_research_project_id_fkey`, `document_purchase_history_project_id_fkey`);
-- the 14 rows accumulated afterwards, as rows do. There was no TEXT column left to convert and
-- therefore nothing to lose.
--
-- The guard only ever asked "are there rows?" and reported a specific, alarming conclusion it had
-- not checked — the same shape as `auto-update.sh` blaming a rewritten history for an expired
-- credential, and the schema audit reporting a table that never existed. A refusal that names a
-- cause it has not verified sends the reader to solve the wrong problem, and this one names data
-- loss, which is the most expensive wrong problem to go looking for.
--
-- The order matters: ask "am I already applied?" FIRST. Only if there is real work to do does the
-- row count mean anything, and then it means exactly what it says.
DO $$
DECLARE
    v_usage_events_count   bigint;
    v_purchase_history_count bigint;
    v_usage_type           text;
    v_purchase_type        text;
BEGIN
    SELECT data_type INTO v_usage_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'research_usage_events' AND column_name = 'research_project_id';
    SELECT data_type INTO v_purchase_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'document_purchase_history' AND column_name = 'project_id';

    -- Already converted. Nothing below would change anything, and running §1/§2 anyway would DROP
    -- two live UUID columns — turning a no-op re-run into the very data loss the guard exists to
    -- prevent.
    IF v_usage_type = 'uuid' AND v_purchase_type = 'uuid' THEN
        RAISE NOTICE '213: already applied — both columns are UUID with FKs. Nothing to do.';
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_usage_events_count   FROM research_usage_events;
    SELECT COUNT(*) INTO v_purchase_history_count FROM document_purchase_history;

    IF v_usage_events_count > 0 THEN
        RAISE EXCEPTION
            'research_usage_events has % rows — naive drop+add would lose data. '
            'Use a backfill migration that adds a new column, validates UUIDs, and '
            'preserves valid rows before dropping the TEXT column.',
            v_usage_events_count;
    END IF;

    IF v_purchase_history_count > 0 THEN
        RAISE EXCEPTION
            'document_purchase_history has % rows — naive drop+add would lose data. '
            'Same backfill strategy required as research_usage_events.',
            v_purchase_history_count;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §1. research_usage_events.research_project_id (TEXT NOT NULL → UUID NULL + FK)
-- ─────────────────────────────────────────────────────────────────────────────

-- Guarded by the SAME condition as §0, and this is not belt-and-braces — it is required.
-- `RETURN` inside a DO block exits the BLOCK, not the file. Without this wrapper, an early-exiting
-- guard would fall straight through to `DROP COLUMN` and destroy the live UUID column, converting a
-- harmless re-run into precisely the data loss §0 exists to prevent. The guard would have caused
-- the disaster it was written to stop.
DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'research_usage_events'
           AND column_name = 'research_project_id') = 'uuid' THEN
        RETURN;   -- already converted
    END IF;

    DROP INDEX IF EXISTS idx_usage_events_project;
    ALTER TABLE research_usage_events DROP COLUMN research_project_id;
    ALTER TABLE research_usage_events
        ADD COLUMN research_project_id UUID
        REFERENCES research_projects(id) ON DELETE SET NULL;
    CREATE INDEX idx_usage_events_project
        ON research_usage_events(research_project_id)
        WHERE research_project_id IS NOT NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2. document_purchase_history.project_id (TEXT NULL → UUID NULL + FK)
-- ─────────────────────────────────────────────────────────────────────────────

-- Same guard, same reason. See §1.
DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'document_purchase_history'
           AND column_name = 'project_id') = 'uuid' THEN
        RETURN;   -- already converted
    END IF;

    DROP INDEX IF EXISTS idx_doc_purchase_project;
    ALTER TABLE document_purchase_history DROP COLUMN project_id;
    ALTER TABLE document_purchase_history
        ADD COLUMN project_id UUID
        REFERENCES research_projects(id) ON DELETE SET NULL;
    CREATE INDEX idx_doc_purchase_project
        ON document_purchase_history(project_id)
        WHERE project_id IS NOT NULL;
END $$;


COMMIT;
