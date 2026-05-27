-- ============================================================================
-- 293_schedule_events.sql
--
-- Schedule / calendar events — backs the previously-stubbed /admin/schedule
-- (and the Hub /admin/me?tab=schedule). Each row is a calendar entry
-- (field work, meeting, time off, deadline, …) assigned to a team member,
-- optionally linked to a job. Employees see their own events; admins see
-- and create for everyone.
--
-- Read/write via app/api/admin/schedule/route.ts (service-role
-- supabaseAdmin; access gated at the API/auth layer).
--
-- Spec: docs/planning/in-progress/backend-audit-and-improvements-2026-05-27.md (Slice 12)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.schedule_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  event_type   TEXT NOT NULL DEFAULT 'other',
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  all_day      BOOLEAN NOT NULL DEFAULT false,
  location     TEXT,
  notes        TEXT,
  job_id       UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  assigned_to  TEXT NOT NULL,
  assigned_by  TEXT,
  color        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.schedule_events IS
  'Calendar events for /admin/schedule. assigned_to = the team member the event is for. Managed via app/api/admin/schedule/route.ts.';

CREATE INDEX IF NOT EXISTS idx_schedule_assigned_start
  ON public.schedule_events(assigned_to, start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_start_time
  ON public.schedule_events(start_time);

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.schedule_events;   -- 0
--   INSERT INTO public.schedule_events (title, event_type, start_time, end_time, assigned_to, assigned_by)
--     VALUES ('Boundary survey — Johnson', 'field_work', now(), now() + interval '8 hours',
--             'crew@starr-surveying.com', 'admin@starr-surveying.com');
--   SELECT id, title, start_time FROM public.schedule_events ORDER BY start_time;
