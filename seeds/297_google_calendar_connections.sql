-- ============================================================================
-- 297_google_calendar_connections.sql
--
-- Per-user Google Calendar OAuth connections + per-event mapping so the
-- bi-directional sync knows which Google event corresponds to which
-- schedule_events row. Built for Slice 29 (deferred from Slice 12).
--
-- google_calendar_connections (one row per connected user)
--   user_email           — owner of the connection (FK by convention)
--   access_token         — refreshed automatically when expired
--   refresh_token        — long-lived; only obtained on the very first connect
--   token_expires_at     — clock-based refresh trigger
--   calendar_id          — which calendar events go to ('primary' by default)
--   last_synced_at       — set on every push/pull; UI shows this
--
-- google_calendar_event_links (one row per schedule_event <-> GCal pairing)
--   schedule_event_id    — local PK
--   google_event_id      — remote PK in Google Calendar
--   etag                 — last-known remote etag for change detection
--   updated_remote_at    — last remote update time we observed
--
-- Spec: docs/planning/in-progress/backend-audit-and-improvements-2026-05-27.md
--       Slice 12 deferred items.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  user_email        TEXT PRIMARY KEY,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  token_expires_at  TIMESTAMPTZ NOT NULL,
  calendar_id       TEXT NOT NULL DEFAULT 'primary',
  scope             TEXT,
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.google_calendar_connections IS
  'Google Calendar OAuth credentials for two-way schedule sync. Managed via app/api/admin/google-calendar/* and lib/integrations/google-calendar.ts.';

CREATE TABLE IF NOT EXISTS public.google_calendar_event_links (
  schedule_event_id  UUID NOT NULL REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  google_event_id    TEXT NOT NULL,
  user_email         TEXT NOT NULL,
  etag               TEXT,
  updated_remote_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_event_id),
  UNIQUE (user_email, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_gcal_link_user_email
  ON public.google_calendar_event_links(user_email);

COMMIT;
