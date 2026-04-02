-- ============================================================================
-- 110_ensure_user_tables.sql
-- Adds missing columns to registered_users for the expanded user management
-- system. Safe to run multiple times (IF NOT EXISTS checks).
--
-- Your registered_users.roles column is TEXT[] (not JSONB) — this script
-- respects that. No changes to existing columns or data types.
-- ============================================================================

BEGIN;

-- Add auth_provider column: 'google' or 'credentials'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registered_users' AND column_name = 'auth_provider'
  ) THEN
    ALTER TABLE public.registered_users ADD COLUMN auth_provider TEXT DEFAULT NULL;
    COMMENT ON COLUMN public.registered_users.auth_provider IS 'Authentication provider: google or credentials';
  END IF;
END $$;

-- Add avatar_url column: Google profile image or uploaded avatar
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registered_users' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.registered_users ADD COLUMN avatar_url TEXT DEFAULT NULL;
    COMMENT ON COLUMN public.registered_users.avatar_url IS 'User profile image URL (from Google or uploaded)';
  END IF;
END $$;

-- Add last_sign_in column: updated each time user logs in
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registered_users' AND column_name = 'last_sign_in'
  ) THEN
    ALTER TABLE public.registered_users ADD COLUMN last_sign_in TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN public.registered_users.last_sign_in IS 'Timestamp of most recent sign-in';
  END IF;
END $$;

COMMIT;

-- Verify
DO $$ BEGIN
  RAISE NOTICE 'Migration complete. Added auth_provider, avatar_url, last_sign_in to registered_users.';
END $$;
