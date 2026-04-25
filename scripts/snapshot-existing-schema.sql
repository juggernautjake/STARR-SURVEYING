-- ============================================================================
-- snapshot-existing-schema.sql
--
-- Generates an idempotent CREATE TABLE script for the existing live tables
-- that Starr Field's mobile-app migration (seeds/220_starr_field_tables.sql)
-- ALTERs. Without this, a fresh `./seeds/run_all.sh --reset` would fail
-- because seeds/220 references `jobs`, `daily_time_logs`, etc. that aren't
-- in the seed pipeline yet.
--
-- Per STARR_FIELD_MOBILE_APP_PLAN.md §15 bootstrapping (the "schema-
-- snapshot prerequisite"), the output of this script lands at
-- `seeds/214_starr_field_existing_schema_snapshot.sql`.
--
-- HOW TO RUN
-- ----------
--   1. Open Supabase Dashboard → SQL Editor → New Query.
--   2. Paste the SELECT below in full.
--   3. Run it. The result set has one row per table with the full
--      CREATE TABLE IF NOT EXISTS statement in column `ddl`.
--   4. Copy each row's `ddl` value (cmd/ctrl-click each cell, copy as
--      text) into a new file at:
--        seeds/214_starr_field_existing_schema_snapshot.sql
--      Wrap the whole thing in `BEGIN; … COMMIT;` per the project
--      seed convention (see seeds/201_captcha_solves.sql for the
--      template).
--   5. Commit the file. Now `seeds/220_starr_field_tables.sql` can
--      apply against a fresh restore.
--
-- WHAT'S CAPTURED
-- ---------------
-- Tables listed below are the ones discovered by inspecting
-- `app/api/admin/jobs/**` and `app/api/admin/time-logs/**`. If your
-- live database has additional `job_*` or pay-related tables that
-- mobile will eventually reference, add them to the IN-list before
-- running.
--
-- Constraints, indexes, RLS policies, and triggers are NOT captured
-- by this query — only the column-level DDL. For the migration to
-- be fully replayable from seeds/, the user may also need to add:
--   - PRIMARY KEY definitions
--   - FOREIGN KEY constraints
--   - RLS policies (see seeds/210_hardening.sql for examples)
-- after the first round-trip. Use `pg_dump --schema-only` for the
-- full picture if needed; this script is the 80% solution.
-- ============================================================================

WITH target_tables AS (
  SELECT unnest(ARRAY[
    -- Jobs core + join tables (per app/api/admin/jobs/**):
    'jobs',
    'job_team',
    'job_tags',
    'job_equipment',
    'job_files',
    'job_research',
    'job_stages_history',
    'job_checklists',
    'job_time_entries',
    -- Time / payroll core (per app/api/admin/time-logs/** and
    -- app/api/admin/payroll/**):
    'daily_time_logs',
    'pay_system_config',
    'work_type_rates',
    'role_tiers',
    'seniority_brackets',
    'employee_profiles',
    -- Generic audit table referenced by jobs API:
    'activity_log'
  ]) AS table_name
),
cols AS (
  SELECT
    c.table_name,
    c.column_name,
    c.ordinal_position,
    c.data_type,
    c.character_maximum_length,
    c.numeric_precision,
    c.numeric_scale,
    c.is_nullable,
    c.column_default
  FROM information_schema.columns c
  JOIN target_tables t ON t.table_name = c.table_name
  WHERE c.table_schema = 'public'
)
SELECT
  table_name,
  E'-- ──────────────────────────────────────────────────────────────────────\n'
  || '-- ' || table_name || E'\n'
  || '-- ──────────────────────────────────────────────────────────────────────\n'
  || 'CREATE TABLE IF NOT EXISTS ' || table_name || E' (\n'
  || string_agg(
       '  ' || column_name || ' ' ||
       CASE
         WHEN data_type = 'character varying' THEN 'TEXT'
         WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
         WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
         WHEN data_type = 'numeric' THEN 'NUMERIC' ||
              CASE WHEN numeric_precision IS NOT NULL
                   THEN '(' || numeric_precision ||
                        CASE WHEN numeric_scale IS NOT NULL
                             THEN ',' || numeric_scale
                             ELSE ''
                        END || ')'
                   ELSE ''
              END
         WHEN data_type = 'integer' THEN 'INTEGER'
         WHEN data_type = 'bigint' THEN 'BIGINT'
         WHEN data_type = 'boolean' THEN 'BOOLEAN'
         WHEN data_type = 'uuid' THEN 'UUID'
         WHEN data_type = 'jsonb' THEN 'JSONB'
         WHEN data_type = 'json' THEN 'JSON'
         WHEN data_type = 'date' THEN 'DATE'
         WHEN data_type = 'ARRAY' THEN 'TEXT[]'
         ELSE upper(data_type)
       END
       || CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
       || CASE WHEN column_default IS NOT NULL
               THEN ' DEFAULT ' || column_default
               ELSE ''
          END,
       E',\n'
       ORDER BY ordinal_position
     )
  || E'\n);' AS ddl
FROM cols
GROUP BY table_name
ORDER BY table_name;
