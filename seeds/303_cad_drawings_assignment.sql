-- ============================================================================
-- 303_cad_drawings_assignment.sql
-- drawings-collaboration Slice 1 — add per-drawing assignment + due-date
-- columns and a sibling notes thread.
--
-- assigned_to + due_date make a drawing addressable:
--   - "this drawing is yours, drawer@x.com"
--   - "it's due 2026-06-04"
-- Both nullable so existing rows keep loading; both indexed for the
-- per-user "my drawings" + the due-soon cron query.
--
-- drawing_notes is the thread the user described — RPLS leaves an
-- instruction for the drawer, drawer asks a question of the RPLS, any
-- job-scoped user can address one or more recipients on a drawing. The
-- post endpoint fans out a bell notification to each recipient.
--
-- Depends on: 100_cad_drawings.sql, registered_users.
-- ============================================================================

BEGIN;

-- ── 1. cad_drawings: assignment + due-date columns ──────────────────────────
ALTER TABLE cad_drawings
  ADD COLUMN IF NOT EXISTS assigned_to TEXT
    REFERENCES registered_users(email) ON DELETE SET NULL;

ALTER TABLE cad_drawings
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Per-user "drawings assigned to me" filter on the CAD list view.
CREATE INDEX IF NOT EXISTS cad_drawings_assigned_to_idx
  ON cad_drawings (assigned_to)
  WHERE assigned_to IS NOT NULL;

-- Window scan for the drawing-due cron (Slice 2): pending drawings with
-- a due_date in the next 3 days. Partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS cad_drawings_due_date_idx
  ON cad_drawings (due_date)
  WHERE due_date IS NOT NULL;

-- ── 2. drawing_notes: the RPLS ↔ drawer thread ──────────────────────────────
CREATE TABLE IF NOT EXISTS drawing_notes (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id        UUID        NOT NULL REFERENCES cad_drawings(id) ON DELETE CASCADE,
    author_email      TEXT        NOT NULL,
    body              TEXT        NOT NULL,
    -- Explicit recipient list: defaults to the drawing's assignee +
    -- the job-scope cohort on the server side (Slice 3). Kept as an
    -- array so the same note can address multiple people without
    -- fanning into N rows.
    recipient_emails  TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drawing_notes_drawing_id_idx
  ON drawing_notes (drawing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS drawing_notes_author_idx
  ON drawing_notes (author_email);

-- Row-Level Security mirrors cad_drawings: server-side enforcement
-- uses the supabaseAdmin client (no direct anon access to this table).
ALTER TABLE drawing_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drawing_notes_service_role_all ON drawing_notes;
CREATE POLICY drawing_notes_service_role_all ON drawing_notes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
