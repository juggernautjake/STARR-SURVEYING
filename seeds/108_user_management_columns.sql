-- 108_user_management_columns.sql
-- Adds columns to registered_users for tracking auth provider, avatar, and last sign-in.
-- These columns support the expanded user management and employee roster features.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

BEGIN;

-- Add auth_provider column to track how user signed up (google vs credentials)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registered_users' AND column_name = 'auth_provider'
  ) THEN
    ALTER TABLE public.registered_users ADD COLUMN auth_provider TEXT DEFAULT NULL;
    COMMENT ON COLUMN public.registered_users.auth_provider IS 'Authentication provider: google or credentials';
  END IF;
END $$;

-- Add avatar_url column for Google profile images
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registered_users' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.registered_users ADD COLUMN avatar_url TEXT DEFAULT NULL;
    COMMENT ON COLUMN public.registered_users.avatar_url IS 'User profile image URL (from Google or uploaded)';
  END IF;
END $$;

-- Add last_sign_in column to track last login time
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
