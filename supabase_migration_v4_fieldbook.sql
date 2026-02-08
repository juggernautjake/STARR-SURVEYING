-- =============================================================================
-- STARR SURVEYING — Fieldbook Enhancement Migration
-- =============================================================================
-- Enhances fieldbook_notes with categories, media/audio support, and richer
-- entry management. Run AFTER supabase_schema.sql.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENHANCE fieldbook_notes TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- Add media support (audio recordings, images, videos, URLs)
ALTER TABLE fieldbook_notes
  ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]',
  -- Each item: {type: 'audio'|'image'|'video'|'url', url: string, name: string,
  --             duration_seconds?: number, file_size?: number, mime_type?: string}
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT false,
  -- Marks the entry the user is currently editing
  ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'text'
    CHECK (content_format IN ('text', 'rich_text', 'markdown'));

-- Index for finding a user's current entry quickly
CREATE INDEX IF NOT EXISTS idx_fn_current ON fieldbook_notes(user_email, is_current)
  WHERE is_current = true;

-- Index for searching notes by date
CREATE INDEX IF NOT EXISTS idx_fn_created ON fieldbook_notes(user_email, created_at DESC);

-- Full-text search index on title and content
CREATE INDEX IF NOT EXISTS idx_fn_search ON fieldbook_notes
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FIELDBOOK CATEGORIES / LISTS
-- ─────────────────────────────────────────────────────────────────────────────
-- Users can organize entries into custom lists/categories.
-- Default categories ("Job Notes", "Learning Notes") cannot be deleted.

CREATE TABLE IF NOT EXISTS fieldbook_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#1D3095',
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fbc_email ON fieldbook_categories(user_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fbc_unique_name ON fieldbook_categories(user_email, name);

ALTER TABLE fieldbook_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "service_all" ON fieldbook_categories FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Trigger for updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fbc_upd') THEN
    CREATE TRIGGER trg_fbc_upd
      BEFORE UPDATE ON fieldbook_categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FIELDBOOK ENTRY ↔ CATEGORY LINK TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Many-to-many: an entry can belong to multiple categories.

CREATE TABLE IF NOT EXISTS fieldbook_entry_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES fieldbook_notes(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES fieldbook_categories(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_fec_entry ON fieldbook_entry_categories(entry_id);
CREATE INDEX IF NOT EXISTS idx_fec_category ON fieldbook_entry_categories(category_id);

ALTER TABLE fieldbook_entry_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "service_all" ON fieldbook_entry_categories FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. HELPER: Auto-create default categories for a user
-- ─────────────────────────────────────────────────────────────────────────────
-- Call this function from the API when a user first opens the fieldbook.

CREATE OR REPLACE FUNCTION ensure_default_fieldbook_categories(p_email TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO fieldbook_categories (user_email, name, icon, color, is_default, sort_order)
  VALUES
    (p_email, 'Job Notes',      '🔧', '#059669', true, 1),
    (p_email, 'Learning Notes', '📚', '#1D3095', true, 2),
    (p_email, 'Reminders',      '⏰', '#F59E0B', true, 3),
    (p_email, 'Observations',   '🔍', '#7C3AED', true, 4)
  ON CONFLICT (user_email, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;


COMMIT;

SELECT 'Fieldbook enhancement migration complete: media, categories, search indexes.' AS result;
