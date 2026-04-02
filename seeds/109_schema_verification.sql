-- ============================================================================
-- SCHEMA VERIFICATION SCRIPT
-- Run in Supabase SQL Editor to verify all required columns exist.
-- Reports MISSING columns and shows current data.
-- ============================================================================

-- 1. Show registered_users columns
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'registered_users'
ORDER BY ordinal_position;

-- 2. Check for missing columns in registered_users
DO $$
DECLARE
  -- Core columns (must exist)
  core_cols TEXT[] := ARRAY[
    'id', 'email', 'name', 'password_hash', 'roles',
    'is_approved', 'is_banned', 'banned_at', 'banned_reason',
    'created_at', 'updated_at'
  ];
  -- New columns from migration 110 (should exist after running migration)
  new_cols TEXT[] := ARRAY['auth_provider', 'avatar_url', 'last_sign_in'];
  col TEXT;
  core_missing TEXT[] := '{}';
  new_missing TEXT[] := '{}';
BEGIN
  FOREACH col IN ARRAY core_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'registered_users' AND column_name = col
    ) THEN
      core_missing := array_append(core_missing, col);
    END IF;
  END LOOP;

  FOREACH col IN ARRAY new_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'registered_users' AND column_name = col
    ) THEN
      new_missing := array_append(new_missing, col);
    END IF;
  END LOOP;

  IF array_length(core_missing, 1) IS NULL THEN
    RAISE NOTICE 'registered_users CORE columns: ALL present';
  ELSE
    RAISE NOTICE 'registered_users CORE columns MISSING: %', array_to_string(core_missing, ', ');
  END IF;

  IF array_length(new_missing, 1) IS NULL THEN
    RAISE NOTICE 'registered_users NEW columns: ALL present (migration 110 applied)';
  ELSE
    RAISE NOTICE 'registered_users NEW columns MISSING: % -- Run seeds/110_ensure_user_tables.sql', array_to_string(new_missing, ', ');
  END IF;
END $$;

-- 3. Show employee_profiles columns
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'employee_profiles'
ORDER BY ordinal_position;

-- 4. Show data counts and sample data
SELECT 'registered_users' as table_name, count(*) as row_count FROM registered_users
UNION ALL
SELECT 'employee_profiles', count(*) FROM employee_profiles;

-- 5. Show registered users
SELECT email, name, roles, is_approved, is_banned, created_at
FROM registered_users
ORDER BY created_at DESC
LIMIT 20;
