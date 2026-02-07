-- Assignments & Notifications tables
-- Run this in your Supabase SQL editor

-- ─── Assignments ───
CREATE TABLE IF NOT EXISTS assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assignment_type TEXT NOT NULL DEFAULT 'task',
    -- 'study_material', 'exam', 'draw_job', 'start_job', 'finish_job',
    -- 'equipment_maintenance', 'log_hours', 'field_work', 'training', 'task'
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'overdue', 'cancelled'
  assigned_to TEXT NOT NULL, -- user email
  assigned_by TEXT NOT NULL, -- admin email
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Linked entities
  job_id UUID REFERENCES jobs(id),
  module_id UUID,
  lesson_id UUID,
  notes TEXT, -- admin notes for assignee
  completion_notes TEXT, -- assignee notes on completion
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_date);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assignments"
  ON assignments FOR SELECT TO authenticated
  USING (assigned_to = auth.email() OR assigned_by = auth.email());

CREATE POLICY "Admins can insert assignments"
  ON assignments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own assignments"
  ON assignments FOR UPDATE TO authenticated
  USING (assigned_to = auth.email() OR assigned_by = auth.email());

-- ─── Notifications ───
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
    -- 'assignment', 'message', 'payment', 'system', 'reminder',
    -- 'job_update', 'approval', 'mention', 'info'
  title TEXT NOT NULL,
  body TEXT,
  icon TEXT, -- emoji or icon identifier
  link TEXT, -- URL to navigate to when clicked
  -- Source reference
  source_type TEXT, -- 'assignment', 'message', 'job', 'payroll', etc.
  source_id TEXT, -- ID of the source entity
  -- State
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_email, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (user_email = auth.email());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (user_email = auth.email());

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_assignments_updated_at();
