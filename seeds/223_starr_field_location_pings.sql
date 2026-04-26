-- ============================================================================
-- 223_starr_field_location_pings.sql
-- Starr Field — append-only GPS sample stream while clocked in.
--
-- Per the user's resilience requirement: "if the gps signal is lost,
-- we just need to keep track of the last known location of the user's
-- phone until they get reception again."
--
-- Distinct from location_stops + location_segments (planned for F6 —
-- those are derived/aggregated views): this table is the RAW pings,
-- captured every ~30 s by the mobile background task while a
-- job_time_entries row is open. The aggregator (server-side, F6) reads
-- from here to materialise stops + segments; the dispatcher Team page
-- reads from here directly to show "last seen at 14:32 — Smith Job".
--
-- Privacy contract (plan §5.10.1): we ONLY capture pings while the
-- user is clocked in. The mobile background task is started by
-- useClockIn and stopped by useClockOut; it does NOT run on the
-- "off the clock" surface. RLS below scopes reads to owners +
-- service_role (admin web) — no peer visibility.
--
-- Cardinality: ~1 ping every 30 s while clocked in → ~960 rows / 8h
-- shift / user. With 20 users that's ~20k rows/day. Indexes scoped to
-- a 7-day window keep the hot path tiny.
--
-- IMPORTANT — depends on auth.users (Supabase) and job_time_entries.
-- Apply BEFORE the mobile lib/locationTracker.ts background task
-- ships.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS location_pings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity. user_id is the canonical key; user_email is denormed
  -- because the existing time-tracking flow keys on email and we want
  -- the dispatcher Team page query to JOIN cheaply against
  -- registered_users without a second lookup.
  user_id             UUID NOT NULL REFERENCES auth.users,
  user_email          TEXT NOT NULL,

  -- The clock-in slice this ping belongs to. Null when the row is
  -- clock-out adjacent (a final stamp captured during the stopAsync
  -- handshake) — most rows have it set. ON DELETE SET NULL preserves
  -- the historical pings if a time entry is deleted by an admin.
  job_time_entry_id   UUID,

  -- GPS payload. lat/lon are required (the row is meaningless without
  -- them); accuracy / altitude / heading / speed are populated when
  -- expo-location reports them, null otherwise.
  lat                 DOUBLE PRECISION NOT NULL,
  lon                 DOUBLE PRECISION NOT NULL,
  accuracy_m          DOUBLE PRECISION,
  altitude_m          DOUBLE PRECISION,
  -- Degrees (0 = north, increasing clockwise). Some Android devices
  -- never report this; iOS reports it once the device is moving.
  heading             DOUBLE PRECISION,
  -- Meters per second. Useful for dispatcher to spot a crew on the
  -- highway vs walking the property.
  speed_mps           DOUBLE PRECISION,

  -- Battery snapshot — drives the resilience triage. If pings stop
  -- around 14:00 and the last one had battery_pct=4, that's a "phone
  -- died" scenario; if battery_pct=80 then it's a reception drop.
  battery_pct         INTEGER,
  is_charging         BOOLEAN,

  -- Source: 'foreground' (app open) | 'background' (task) |
  -- 'clock_in' / 'clock_out' (the explicit stamp at lifecycle boundary).
  source              TEXT NOT NULL,

  captured_at         TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mobile-side dedup key for idempotent retries when the offline
  -- queue replays a row that already landed.
  client_id           TEXT
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'location_pings_source_chk'
  ) THEN
    ALTER TABLE location_pings
      ADD CONSTRAINT location_pings_source_chk
        CHECK (source IN ('foreground','background','clock_in','clock_out'));
  END IF;
END $$;

-- Reasonable bounds so a corrupt sensor read doesn't poison the data.
-- ±90 lat, ±180 lon. Battery 0-100. Speed_mps 0-1000 (≈3600 km/h —
-- aircraft territory, anything larger is sensor noise).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'location_pings_lat_lon_chk'
  ) THEN
    ALTER TABLE location_pings
      ADD CONSTRAINT location_pings_lat_lon_chk
        CHECK (
          lat BETWEEN -90 AND 90
          AND lon BETWEEN -180 AND 180
        );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'location_pings_battery_chk'
  ) THEN
    ALTER TABLE location_pings
      ADD CONSTRAINT location_pings_battery_chk
        CHECK (battery_pct IS NULL OR (battery_pct BETWEEN 0 AND 100));
  END IF;
END $$;

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Most-recent ping per user — drives the dispatcher Team page's
-- "last seen" column. 7-day partial keeps the index tight.
CREATE INDEX IF NOT EXISTS idx_location_pings_user_recent
  ON location_pings (user_id, captured_at DESC)
  WHERE captured_at > now() - interval '7 days';

-- Per-time-entry route reconstruction. F6's segment-builder reads
-- "every ping where job_time_entry_id = $1 ORDER BY captured_at."
CREATE INDEX IF NOT EXISTS idx_location_pings_entry
  ON location_pings (job_time_entry_id, captured_at);

-- Dedup helper for retried offline replays. Mobile sends client_id
-- on every insert; an UPSERT on conflict (client_id, user_id) lets
-- the queue replay safely without duplicating bytes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_pings_client_id
  ON location_pings (user_id, client_id)
  WHERE client_id IS NOT NULL;


-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Service role does it all (admin Team page reads via supabaseAdmin).
-- Owners INSERT + SELECT their own; cannot UPDATE or DELETE — the
-- table is append-only history. Editing a misplaced ping happens via
-- the F6 admin console, not from mobile.
ALTER TABLE location_pings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_location_pings ON location_pings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY location_pings_owner_select ON location_pings
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY location_pings_owner_insert ON location_pings
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- No UPDATE / DELETE policy for owners → both denied. Service role
-- bypasses RLS, so the F6 admin tooling can still correct rows.

-- Defense in depth: even though the policy gates access, also REVOKE
-- UPDATE/DELETE explicitly so a future policy mistake doesn't open
-- the door.
REVOKE UPDATE, DELETE ON location_pings FROM authenticated;
GRANT  SELECT, INSERT  ON location_pings TO authenticated;

COMMIT;
