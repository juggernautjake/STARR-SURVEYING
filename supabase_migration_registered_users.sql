-- Migration: registered_users table for external user registration
-- Phase 5: Allow non-@starr-surveying.com users to register with email/password

CREATE TABLE IF NOT EXISTS registered_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'employee' CHECK (role IN ('admin', 'teacher', 'employee')),
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups during login
CREATE INDEX IF NOT EXISTS idx_registered_users_email ON registered_users (email);

-- RLS: Only service role can access this table (server-side only)
ALTER TABLE registered_users ENABLE ROW LEVEL SECURITY;

-- No public access — all access goes through supabaseAdmin (service role)
-- Service role bypasses RLS automatically
