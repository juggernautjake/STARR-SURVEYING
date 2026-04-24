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

DO $$
DECLARE
    v_usage_events_count   bigint;
    v_purchase_history_count bigint;
BEGIN
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

DROP INDEX IF EXISTS idx_usage_events_project;
ALTER TABLE research_usage_events DROP COLUMN research_project_id;
ALTER TABLE research_usage_events
    ADD COLUMN research_project_id UUID
    REFERENCES research_projects(id) ON DELETE SET NULL;
CREATE INDEX idx_usage_events_project
    ON research_usage_events(research_project_id)
    WHERE research_project_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2. document_purchase_history.project_id (TEXT NULL → UUID NULL + FK)
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_doc_purchase_project;
ALTER TABLE document_purchase_history DROP COLUMN project_id;
ALTER TABLE document_purchase_history
    ADD COLUMN project_id UUID
    REFERENCES research_projects(id) ON DELETE SET NULL;
CREATE INDEX idx_doc_purchase_project
    ON document_purchase_history(project_id)
    WHERE project_id IS NOT NULL;


COMMIT;
