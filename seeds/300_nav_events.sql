-- seeds/300_nav_events.sql
--
-- ADMIN_NAVIGATION_REDESIGN.md §13.8 deferred item — nav.* telemetry
-- destination. The doc asked "analytics_events (existing) or a new
-- nav_events table?" — the repo doesn't have an `analytics_events`
-- table (only file-based ResearchEvent telemetry under
-- /tmp/analytics), so we go with the second option: a small, focused
-- `nav_events` table the V2 rail emits to.
--
-- Idempotent: ADD/CREATE … IF NOT EXISTS throughout. Safe to re-run.
--
-- Event shape (mirrors the §13.8 spec):
--   event_name TEXT       — e.g. 'nav.cmdk.open', 'nav.workspace.click'
--   user_email TEXT       — actor; resolved from session at the API layer
--   pathname   TEXT       — current pathname when the event fired
--   props      JSONB      — event-specific payload (workspace id, route href, …)
--   created_at TIMESTAMPTZ — server-side timestamp
--
-- Retention: this table is append-only for usage analytics. A future
-- janitor can prune rows older than ~90 days; intentionally not added
-- to this seed because the operator hasn't picked the retention window.

CREATE TABLE IF NOT EXISTS public.nav_events (
  id         BIGSERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  pathname   TEXT,
  props      JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nav_events IS
  'Append-only usage telemetry for the V2 admin nav (IconRail, WorkspaceFlyout, '
  'Cmd+K palette, persona override, pinning). One row per user-initiated nav '
  'action; populated by app/api/admin/nav-events/route.ts via lib/admin/nav-telemetry.ts.';

COMMENT ON COLUMN public.nav_events.event_name IS
  'Dotted event name, e.g. nav.cmdk.open, nav.workspace.click, nav.pin.add, nav.persona.override.';

COMMENT ON COLUMN public.nav_events.props IS
  'Event-specific payload as JSONB. Conventions: workspace.click → { "workspace": "<id>", "href": "<path>" }; '
  'pin.add → { "href": "<path>", "label": "<route label>" }; persona.override → { "from": "<persona>", "to": "<persona>" }; '
  'cmdk.open → { "trigger": "shortcut"|"button" }.';

-- Lookup indexes for the dashboards a follow-up slice will build.
CREATE INDEX IF NOT EXISTS nav_events_event_name_created_at_idx
  ON public.nav_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS nav_events_user_email_created_at_idx
  ON public.nav_events (user_email, created_at DESC);

-- Service-role-only writes; reads scoped to authenticated users with
-- the admin/developer/tech_support roles (mirrors AdminAudit RLS).
ALTER TABLE public.nav_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nav_events_service_write ON public.nav_events;
CREATE POLICY nav_events_service_write
  ON public.nav_events
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS nav_events_admin_read ON public.nav_events;
CREATE POLICY nav_events_admin_read
  ON public.nav_events
  FOR SELECT
  TO authenticated, service_role
  USING (true);  -- API layer does the role check via auth() session

-- Verification:
--   SELECT count(*) FROM nav_events;
--   SELECT event_name, count(*) FROM nav_events GROUP BY event_name ORDER BY 2 DESC;
