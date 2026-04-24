-- ============================================================================
-- 212_fieldbook_rls_repair.sql
-- STARR RECON — Fieldbook RLS policy repair + registered_users policy gap
--
-- Context:
--   * `101_fieldbook_tables.sql` declared 11 authenticated-user RLS policies
--     using `CREATE POLICY IF NOT EXISTS` — an invalid Postgres syntax that
--     silently failed on apply. Result: 3 fieldbook tables have RLS enabled
--     but only a single `service_all` policy each. Authenticated clients
--     (i.e. users accessing their own fieldbook notes via the Next.js app)
--     are currently blocked from all operations.
--
--   * `registered_users` has RLS enabled but zero policies. Same silent
--     lockout — authenticated clients can't read their own profile row.
--     This migration adds the missing self-read policy.
--
-- What this migration does:
--   * Drops the 3 existing `service_all` policies on fieldbook tables,
--     re-adds them with descriptive names.
--   * Adds all 11 authenticated CRUD policies that 101 meant to create.
--   * Adds a self-read policy to `registered_users`.
--   * Normalizes the auth accessor to `auth.jwt() ->> 'email'` for
--     consistency with 093/095/096/210 (the pre-existing policies use the
--     legacy `current_setting('request.jwt.claims'...` form).
--
-- Impact on data: none. Schema-only — policies change what queries are
-- allowed to return, not the underlying rows.
--
-- Rollback: re-create the three `service_all`-style policies manually.
-- This migration doesn't DISABLE RLS, so rollback without policies would
-- lock out authenticated clients — exactly the broken state we're fixing.
-- ============================================================================

BEGIN;


-- ─────────────────────────────────────────────────────────────────────────────
-- §1. fieldbook_notes
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the legacy-name placeholder policy
DROP POLICY IF EXISTS service_all ON fieldbook_notes;

-- Owner policies: users see/manage only their own notes
DROP POLICY IF EXISTS fieldbook_notes_select ON fieldbook_notes;
CREATE POLICY fieldbook_notes_select ON fieldbook_notes
  FOR SELECT
  USING (user_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS fieldbook_notes_insert ON fieldbook_notes;
CREATE POLICY fieldbook_notes_insert ON fieldbook_notes
  FOR INSERT
  WITH CHECK (user_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS fieldbook_notes_update ON fieldbook_notes;
CREATE POLICY fieldbook_notes_update ON fieldbook_notes
  FOR UPDATE
  USING (user_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS fieldbook_notes_delete ON fieldbook_notes;
CREATE POLICY fieldbook_notes_delete ON fieldbook_notes
  FOR DELETE
  USING (user_email = auth.jwt() ->> 'email');

-- Service role full access (worker, admin API)
DROP POLICY IF EXISTS fieldbook_notes_service_role ON fieldbook_notes;
CREATE POLICY fieldbook_notes_service_role ON fieldbook_notes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON fieldbook_notes TO authenticated;
GRANT ALL ON fieldbook_notes TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2. fieldbook_categories
-- ─────────────────────────────────────────────────────────────────────────────
-- Same CRUD pattern as fieldbook_notes, with one twist: default categories
-- (is_default=true, seeded by ensure_default_fieldbook_categories) cannot
-- be updated or deleted by the user — only service_role.

DROP POLICY IF EXISTS service_all ON fieldbook_categories;

DROP POLICY IF EXISTS fieldbook_categories_select ON fieldbook_categories;
CREATE POLICY fieldbook_categories_select ON fieldbook_categories
  FOR SELECT
  USING (user_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS fieldbook_categories_insert ON fieldbook_categories;
CREATE POLICY fieldbook_categories_insert ON fieldbook_categories
  FOR INSERT
  WITH CHECK (user_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS fieldbook_categories_update ON fieldbook_categories;
CREATE POLICY fieldbook_categories_update ON fieldbook_categories
  FOR UPDATE
  USING (user_email = auth.jwt() ->> 'email'
         AND is_default = false);

DROP POLICY IF EXISTS fieldbook_categories_delete ON fieldbook_categories;
CREATE POLICY fieldbook_categories_delete ON fieldbook_categories
  FOR DELETE
  USING (user_email = auth.jwt() ->> 'email'
         AND is_default = false);

DROP POLICY IF EXISTS fieldbook_categories_service_role ON fieldbook_categories;
CREATE POLICY fieldbook_categories_service_role ON fieldbook_categories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON fieldbook_categories TO authenticated;
GRANT ALL ON fieldbook_categories TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- §3. fieldbook_entry_categories (junction table)
-- ─────────────────────────────────────────────────────────────────────────────
-- Access is scoped indirectly: user can manage a junction row iff they
-- own the fieldbook_notes entry it points to. UPDATE is intentionally
-- NOT granted — the junction is immutable (create/delete only).

DROP POLICY IF EXISTS service_all ON fieldbook_entry_categories;

DROP POLICY IF EXISTS fieldbook_entry_categories_select ON fieldbook_entry_categories;
CREATE POLICY fieldbook_entry_categories_select ON fieldbook_entry_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM fieldbook_notes n
      WHERE n.id = entry_id
        AND n.user_email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS fieldbook_entry_categories_insert ON fieldbook_entry_categories;
CREATE POLICY fieldbook_entry_categories_insert ON fieldbook_entry_categories
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fieldbook_notes n
      WHERE n.id = entry_id
        AND n.user_email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS fieldbook_entry_categories_delete ON fieldbook_entry_categories;
CREATE POLICY fieldbook_entry_categories_delete ON fieldbook_entry_categories
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM fieldbook_notes n
      WHERE n.id = entry_id
        AND n.user_email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS fieldbook_entry_categories_service_role ON fieldbook_entry_categories;
CREATE POLICY fieldbook_entry_categories_service_role ON fieldbook_entry_categories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON fieldbook_entry_categories TO authenticated;
GRANT ALL ON fieldbook_entry_categories TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- §4. registered_users — self-read policy
-- ─────────────────────────────────────────────────────────────────────────────
-- registered_users currently has RLS enabled with zero policies, blocking
-- authenticated clients from reading their own profile. Add a self-read
-- policy so "/api/me" style calls from the browser can resolve their
-- profile without hitting service_role. Writes remain service_role only
-- (profile changes go through an admin/profile API that uses service_role).

DROP POLICY IF EXISTS registered_users_self_select ON registered_users;
CREATE POLICY registered_users_self_select ON registered_users
  FOR SELECT
  USING (email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS registered_users_service_role ON registered_users;
CREATE POLICY registered_users_service_role ON registered_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON registered_users TO authenticated;
GRANT ALL ON registered_users TO service_role;


COMMIT;
