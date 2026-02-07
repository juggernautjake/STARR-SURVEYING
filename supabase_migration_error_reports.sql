-- Error Reports table — comprehensive error tracking for the entire application
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS error_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Error details
  error_message TEXT NOT NULL,
  error_stack TEXT,
  error_type TEXT NOT NULL DEFAULT 'unknown',
    -- 'render' = React component crash, 'api' = API call failure,
    -- 'runtime' = unhandled JS error, 'promise' = unhandled rejection,
    -- 'network' = fetch/XHR failure, 'validation' = form validation error,
    -- 'auth' = authentication/authorization error, 'unknown' = other
  error_code TEXT, -- HTTP status code or custom code
  component_name TEXT, -- React component where the error occurred
  element_selector TEXT, -- CSS selector or element info that triggered the error

  -- Context
  page_url TEXT NOT NULL,
  page_title TEXT,
  route_path TEXT, -- Next.js route path
  api_endpoint TEXT, -- API endpoint that failed (for API errors)
  request_method TEXT, -- GET, POST, PUT, DELETE
  request_body JSONB, -- Sanitized request body (no passwords/tokens)

  -- User info
  user_email TEXT NOT NULL,
  user_name TEXT,
  user_role TEXT, -- 'admin' or 'employee'

  -- User-submitted feedback
  user_notes TEXT, -- What the user was doing when the error occurred
  user_expected TEXT, -- What the user expected to happen
  user_cause_guess TEXT, -- Why they think it happened
  severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical' (user-reported)

  -- Environment / troubleshooting
  browser_info TEXT, -- navigator.userAgent
  screen_size TEXT, -- e.g. "1920x1080"
  viewport_size TEXT, -- e.g. "1200x800"
  connection_type TEXT, -- navigator.connection?.effectiveType
  memory_usage TEXT, -- performance.memory info
  session_duration_ms INTEGER, -- How long user has been on the site
  console_logs JSONB, -- Last N console.error/warn entries before the error
  breadcrumbs JSONB, -- Last N user actions (clicks, navigations) before the error

  -- Resolution tracking
  status TEXT DEFAULT 'new', -- 'new', 'acknowledged', 'investigating', 'resolved', 'wont_fix'
  assigned_to TEXT, -- Admin email assigned to investigate
  resolution_notes TEXT, -- How the error was resolved
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,

  -- Timestamps
  occurred_at TIMESTAMPTZ DEFAULT now(), -- When the error actually occurred
  created_at TIMESTAMPTZ DEFAULT now(), -- When the report was submitted
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_error_reports_user ON error_reports(user_email);
CREATE INDEX IF NOT EXISTS idx_error_reports_status ON error_reports(status);
CREATE INDEX IF NOT EXISTS idx_error_reports_type ON error_reports(error_type);
CREATE INDEX IF NOT EXISTS idx_error_reports_page ON error_reports(route_path);
CREATE INDEX IF NOT EXISTS idx_error_reports_created ON error_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_severity ON error_reports(severity);

-- RLS Policies
ALTER TABLE error_reports ENABLE ROW LEVEL SECURITY;

-- All authenticated users can submit error reports
CREATE POLICY "Users can insert error reports"
  ON error_reports FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can view their own error reports
CREATE POLICY "Users can view own error reports"
  ON error_reports FOR SELECT
  TO authenticated
  USING (user_email = auth.email());

-- Admins can view all error reports (use service role key to bypass RLS)
-- Admin access is handled via supabaseAdmin (service role) in API routes

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_error_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER error_reports_updated_at
  BEFORE UPDATE ON error_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_error_reports_updated_at();
