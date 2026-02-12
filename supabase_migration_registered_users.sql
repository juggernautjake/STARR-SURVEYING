-- Migration: registered_users table for external user registration
-- Supports multi-role (admin AND/OR teacher) and ban/delete functionality
-- Run this in Supabase SQL Editor

-- =============================================================================
-- FRESH INSTALL (if table does not exist yet)
-- =============================================================================
CREATE TABLE IF NOT EXISTS registered_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Multi-role: users can be employee, teacher, admin, or combinations
  -- e.g. ARRAY['employee','teacher'] or ARRAY['admin','teacher']
  roles TEXT[] DEFAULT ARRAY['employee']::TEXT[],
  is_approved BOOLEAN DEFAULT TRUE,
  -- Ban system: admins can ban users to prevent login
  is_banned BOOLEAN DEFAULT FALSE,
  banned_at TIMESTAMPTZ,
  banned_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups during login
CREATE INDEX IF NOT EXISTS idx_registered_users_email ON registered_users (email);

-- RLS: Only service role can access this table (server-side only)
ALTER TABLE registered_users ENABLE ROW LEVEL SECURITY;

-- No public access — all access goes through supabaseAdmin (service role)
-- Service role bypasses RLS automatically


-- =============================================================================
-- UPGRADE PATH (if you already have the old table with 'role' TEXT column)
-- Run these ALTER statements instead of the CREATE TABLE above
-- =============================================================================

-- Step 1: Add new columns
-- ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY['employee']::TEXT[];
-- ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
-- ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
-- ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS banned_reason TEXT;

-- Step 2: Migrate existing role data to roles array
-- UPDATE registered_users SET roles = ARRAY[role]::TEXT[] WHERE role IS NOT NULL AND roles IS NULL;

-- Step 3: Drop old role column (after verifying migration)
-- ALTER TABLE registered_users DROP COLUMN IF EXISTS role;
