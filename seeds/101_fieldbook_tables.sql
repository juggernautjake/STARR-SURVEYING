-- ============================================================================
-- 101_fieldbook_tables.sql
-- Fieldbook notes system: personal notes, categories/lists, and junction table.
-- Supports the floating Fieldbook widget, FieldbookButton, and My Notes page.
--
-- Tables:
--   fieldbook_notes            — per-user note entries (title, content, media…)
--   fieldbook_categories       — per-user custom lists / categories
--   fieldbook_entry_categories — many-to-many: notes ↔ categories
--
-- Functions:
--   ensure_default_fieldbook_categories(p_email) — idempotent default-list seeder
-- ============================================================================

BEGIN;

-- ─── fieldbook_notes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fieldbook_notes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email      TEXT        NOT NULL,

    title           TEXT,
    content         TEXT        NOT NULL DEFAULT '',
    content_format  TEXT        NOT NULL DEFAULT 'plain',

    -- Media attachments (audio, image, video, url) stored as a JSONB array
    media           JSONB       NOT NULL DEFAULT '[]'::jsonb,

    -- Free-form tags
    tags            TEXT[]      NOT NULL DEFAULT '{}',

    -- Visibility: private by default; job notes are always public
    is_public       BOOLEAN     NOT NULL DEFAULT false,

    -- Tracks the "current" (most-recently-active) entry for the floating widget
    is_current      BOOLEAN     NOT NULL DEFAULT false,

    -- Optional job context (for notes created on a job page)
    job_id          TEXT,
    job_name        TEXT,
    job_number      TEXT,

    -- Page / lesson context captured when the note was created
    context_label   TEXT,
    context_type    TEXT,
    page_url        TEXT,
    page_context    TEXT,

    -- Learning content links (set by FieldbookButton on lesson/article pages)
    module_id       TEXT,
    lesson_id       TEXT,
    topic_id        TEXT,
    article_id      TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fieldbook_notes_user_email_idx   ON fieldbook_notes (user_email);
CREATE INDEX IF NOT EXISTS fieldbook_notes_updated_at_idx   ON fieldbook_notes (updated_at DESC);
CREATE INDEX IF NOT EXISTS fieldbook_notes_is_current_idx   ON fieldbook_notes (user_email, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS fieldbook_notes_job_id_idx       ON fieldbook_notes (job_id) WHERE job_id IS NOT NULL;

-- Auto-refresh updated_at
CREATE OR REPLACE FUNCTION fieldbook_notes_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fieldbook_notes_updated_at_trigger ON fieldbook_notes;
CREATE TRIGGER fieldbook_notes_updated_at_trigger
  BEFORE UPDATE ON fieldbook_notes
  FOR EACH ROW EXECUTE FUNCTION fieldbook_notes_set_updated_at();

-- Row-Level Security — each user sees only their own notes
ALTER TABLE fieldbook_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "fieldbook_notes_select"
  ON fieldbook_notes FOR SELECT
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY IF NOT EXISTS "fieldbook_notes_insert"
  ON fieldbook_notes FOR INSERT
  WITH CHECK (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY IF NOT EXISTS "fieldbook_notes_update"
  ON fieldbook_notes FOR UPDATE
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY IF NOT EXISTS "fieldbook_notes_delete"
  ON fieldbook_notes FOR DELETE
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- ─── fieldbook_categories ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fieldbook_categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email  TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    icon        TEXT        NOT NULL DEFAULT '📁',
    color       TEXT        NOT NULL DEFAULT '#1D3095',
    is_default  BOOLEAN     NOT NULL DEFAULT false,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fieldbook_categories_user_email_idx ON fieldbook_categories (user_email);
CREATE INDEX IF NOT EXISTS fieldbook_categories_sort_order_idx ON fieldbook_categories (user_email, sort_order);

-- Row-Level Security
ALTER TABLE fieldbook_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "fieldbook_categories_select"
  ON fieldbook_categories FOR SELECT
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY IF NOT EXISTS "fieldbook_categories_insert"
  ON fieldbook_categories FOR INSERT
  WITH CHECK (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY IF NOT EXISTS "fieldbook_categories_update"
  ON fieldbook_categories FOR UPDATE
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email'
         AND is_default = false);

CREATE POLICY IF NOT EXISTS "fieldbook_categories_delete"
  ON fieldbook_categories FOR DELETE
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email'
         AND is_default = false);

-- ─── fieldbook_entry_categories (junction) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS fieldbook_entry_categories (
    entry_id    UUID        NOT NULL REFERENCES fieldbook_notes(id)      ON DELETE CASCADE,
    category_id UUID        NOT NULL REFERENCES fieldbook_categories(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entry_id, category_id)
);

CREATE INDEX IF NOT EXISTS fieldbook_entry_categories_entry_idx    ON fieldbook_entry_categories (entry_id);
CREATE INDEX IF NOT EXISTS fieldbook_entry_categories_category_idx ON fieldbook_entry_categories (category_id);

-- Row-Level Security — allow access when the underlying note belongs to the user
ALTER TABLE fieldbook_entry_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "fieldbook_entry_categories_select"
  ON fieldbook_entry_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM fieldbook_notes n
      WHERE n.id = entry_id
        AND n.user_email = current_setting('request.jwt.claims', true)::json->>'email'
    )
  );

CREATE POLICY IF NOT EXISTS "fieldbook_entry_categories_insert"
  ON fieldbook_entry_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fieldbook_notes n
      WHERE n.id = entry_id
        AND n.user_email = current_setting('request.jwt.claims', true)::json->>'email'
    )
  );

CREATE POLICY IF NOT EXISTS "fieldbook_entry_categories_delete"
  ON fieldbook_entry_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM fieldbook_notes n
      WHERE n.id = entry_id
        AND n.user_email = current_setting('request.jwt.claims', true)::json->>'email'
    )
  );

-- ─── ensure_default_fieldbook_categories ────────────────────────────────────
-- Idempotently creates the default categories for a given user.
-- Called at category-list fetch time so the UI always has at least some lists.
CREATE OR REPLACE FUNCTION ensure_default_fieldbook_categories(p_email TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Skip if the user already has at least one default category
  IF EXISTS (
    SELECT 1 FROM fieldbook_categories
    WHERE user_email = p_email AND is_default = true
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  INSERT INTO fieldbook_categories (user_email, name, icon, color, is_default, sort_order)
  VALUES
    (p_email, 'Study Notes',  '📚', '#1D3095', true, 0),
    (p_email, 'Field Notes',  '🔧', '#059669', true, 1),
    (p_email, 'Important',    '⭐', '#D97706', true, 2),
    (p_email, 'Questions',    '❓', '#7C3AED', true, 3);
END;
$$;

COMMIT;
