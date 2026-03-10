-- ============================================================================
-- 099_fieldbook.sql
-- Adds missing columns to the fieldbook_notes table needed for the Fieldbook
-- feature: public/private visibility and job linking.
--
-- The tables fieldbook_notes, fieldbook_categories, and
-- fieldbook_entry_categories already exist but fieldbook_notes is missing
-- the is_public, job_id, job_name, and job_number columns that the API and
-- UI components depend on.
-- ============================================================================

-- ── Add missing columns to fieldbook_notes ───────────────────────────────────
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS is_public   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS job_id      TEXT;
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS job_name    TEXT;
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS job_number  TEXT;

-- ── Add useful indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fieldbook_notes_user
    ON fieldbook_notes(user_email);
CREATE INDEX IF NOT EXISTS idx_fieldbook_notes_current
    ON fieldbook_notes(user_email, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_fieldbook_notes_job
    ON fieldbook_notes(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fieldbook_notes_public
    ON fieldbook_notes(is_public) WHERE is_public = true;

-- ── Auto-update updated_at on changes ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_fieldbook_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fieldbook_notes_updated ON fieldbook_notes;
CREATE TRIGGER trg_fieldbook_notes_updated
    BEFORE UPDATE ON fieldbook_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_fieldbook_notes_updated_at();

-- ── RLS Policies (idempotent) ────────────────────────────────────────────────
ALTER TABLE fieldbook_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fieldbook_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fieldbook_entry_categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY service_role_full_access_categories ON fieldbook_categories
        FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY service_role_full_access_notes ON fieldbook_notes
        FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY service_role_full_access_ec ON fieldbook_entry_categories
        FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Helper RPC: ensure default categories exist for a user ───────────────────
CREATE OR REPLACE FUNCTION ensure_default_fieldbook_categories(p_email TEXT)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM fieldbook_categories WHERE user_email = p_email LIMIT 1
    ) THEN
        INSERT INTO fieldbook_categories (user_email, name, icon, color, is_default, sort_order) VALUES
            (p_email, 'General',     '📋', '#1D3095', true, 0),
            (p_email, 'Field Work',  '🔧', '#059669', true, 1),
            (p_email, 'Study Notes', '📚', '#7C3AED', true, 2),
            (p_email, 'Important',   '⭐', '#D97706', true, 3);
    END IF;
END;
$$ LANGUAGE plpgsql;
