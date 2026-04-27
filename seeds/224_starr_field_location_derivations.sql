-- ============================================================================
-- 224_starr_field_location_derivations.sql
-- Starr Field — derived stops + segments from the location_pings stream.
--
-- Per F6 plan checklist: "Stop detection, geofence + AI classification"
-- and "Daily timeline view (employee + admin)." This seed lands the
-- two derived tables already declared in the mobile PowerSync schema
-- (location_stops + location_segments) plus a deterministic derive
-- function that aggregates raw pings into stops + segments for a
-- given (user, date) bucket.
--
-- Algorithm (simple v1, no AI / no map-matching):
--
--   1. Stop detection — walk pings in captured_at ASC. A pin
--      becomes a "stop candidate" when the user has been within
--      STOP_RADIUS_M of the running cluster centroid for at least
--      STOP_MIN_MINUTES. The cluster centroid is recomputed each
--      time a new ping joins. Cluster ends when a ping > STOP_RADIUS_M
--      from the centroid arrives OR when the time gap exceeds
--      STOP_GAP_MINUTES (the user went offline; we don't know what
--      happened in that gap).
--
--   2. Segment derivation — every consecutive pair of stops becomes
--      a segment. distance_meters = sum of Haversine distances along
--      the pings between the two stops, with a 200 km single-jump
--      glitch guard (matches the mileage endpoint's bound).
--
-- v2 will layer on top:
--   - Geofence-based category assignment (job site / office / home /
--     gas station) using jobs.centroid_lat/lon + radius.
--   - AI classification via worker/src/services for ambiguous stops.
--   - PostGIS path_simplified column with Douglas-Peucker simplification
--     so the day-replay scrubber renders smoothly without 5000-vertex
--     polylines per day.
--
-- The derive function is idempotent — re-running for a (user, date)
-- DELETEs prior derivations and rewrites them. Safe to schedule via
-- pg_cron nightly OR call on-demand from the admin "Recompute"
-- button.
--
-- IMPORTANT — depends on auth.users (Supabase), location_pings
-- (seeds/223), and job_time_entries (existing). Apply BEFORE the
-- mobile lib/timeline.ts reader + the /admin/timeline page light up.
-- ============================================================================

BEGIN;

-- ── location_stops ──────────────────────────────────────────────────────────
-- One row per stationary period. Centroid lat/lon comes from the mean
-- of the constituent pings. duration_minutes is computed at derive
-- time so callers don't have to recompute on every read.
CREATE TABLE IF NOT EXISTS location_stops (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id             UUID NOT NULL REFERENCES auth.users,

  -- Optional FK back to the time entry that was open during this
  -- stop. Helps the dispatcher correlate a stop with the work that
  -- was being done. Nullable for the rare case where the time entry
  -- has been deleted but the pings linger.
  job_time_entry_id   UUID,

  -- Job correlation (denorm of job_time_entries.job_id). Speeds up
  -- "every stop on Job X" queries on the admin timeline + the
  -- per-job page.
  job_id              UUID,

  -- Category assignment. v1 leaves these null; v2 layers on the
  -- geofence + AI classifier. category_source records who decided.
  category            TEXT,
  category_source     TEXT,            -- 'geofence' | 'ai' | 'manual'
  ai_confidence       DOUBLE PRECISION,

  lat                 DOUBLE PRECISION NOT NULL,
  lon                 DOUBLE PRECISION NOT NULL,

  -- Place metadata — populated by an optional reverse-geocode pass
  -- (worker job, future). Null in v1.
  place_name          TEXT,
  place_address       TEXT,

  arrived_at          TIMESTAMPTZ NOT NULL,
  departed_at         TIMESTAMPTZ NOT NULL,
  duration_minutes    INTEGER NOT NULL,

  -- True when an admin / surveyor manually edited this stop's
  -- category — protects the row from getting overwritten by the
  -- next derive run.
  user_overridden     BOOLEAN NOT NULL DEFAULT false,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'location_stops_lat_lon_chk'
  ) THEN
    ALTER TABLE location_stops
      ADD CONSTRAINT location_stops_lat_lon_chk
        CHECK (
          lat BETWEEN -90 AND 90
          AND lon BETWEEN -180 AND 180
        );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'location_stops_window_chk'
  ) THEN
    ALTER TABLE location_stops
      ADD CONSTRAINT location_stops_window_chk
        CHECK (departed_at >= arrived_at);
  END IF;
END $$;


-- ── location_segments ──────────────────────────────────────────────────────
-- Movement between two stops. start_stop_id / end_stop_id reference
-- the bracketing rows. distance_meters is summed Haversine along the
-- intermediate pings.
CREATE TABLE IF NOT EXISTS location_segments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id             UUID NOT NULL REFERENCES auth.users,

  job_time_entry_id   UUID,

  -- Vehicle assignment for IRS mileage classification. Set by the
  -- v2 vehicle picker on clock-in; null in v1 (assumed business via
  -- the privacy contract — pings only happen while clocked in).
  vehicle_id          UUID,

  start_stop_id       UUID REFERENCES location_stops ON DELETE CASCADE,
  end_stop_id         UUID REFERENCES location_stops ON DELETE CASCADE,

  started_at          TIMESTAMPTZ NOT NULL,
  ended_at            TIMESTAMPTZ NOT NULL,

  -- Sum of consecutive Haversine distances along the pings between
  -- start_stop_id and end_stop_id. With a 200 km single-jump guard
  -- (cell-tower-triangulation outliers excluded), matching the
  -- mileage endpoint's bound.
  distance_meters     DOUBLE PRECISION NOT NULL DEFAULT 0,

  -- Default true since pings only happen while clocked in. v2 lets
  -- the surveyor toggle individual segments to personal (e.g. a
  -- lunch run that the dispatcher doesn't need).
  is_business         BOOLEAN NOT NULL DEFAULT true,
  business_purpose    TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'location_segments_window_chk'
  ) THEN
    ALTER TABLE location_segments
      ADD CONSTRAINT location_segments_window_chk
        CHECK (ended_at >= started_at);
  END IF;
END $$;


-- ── Indexes ──────────────────────────────────────────────────────────────────
-- "All stops for user X on date Y" — the timeline page's primary query.
CREATE INDEX IF NOT EXISTS idx_location_stops_user_arrived
  ON location_stops (user_id, arrived_at DESC);

-- "Every stop on this job" — F6 per-job timeline.
CREATE INDEX IF NOT EXISTS idx_location_stops_job
  ON location_stops (job_id, arrived_at DESC)
  WHERE job_id IS NOT NULL;

-- Segments by user + day for the mileage breakdown.
CREATE INDEX IF NOT EXISTS idx_location_segments_user_started
  ON location_segments (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_location_segments_entry
  ON location_segments (job_time_entry_id, started_at);


-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Service role does it all (admin web reads via supabaseAdmin).
-- Owners SELECT their own; INSERT/UPDATE/DELETE via service role
-- only — derivation runs server-side, owners shouldn't fabricate
-- stops from mobile.
ALTER TABLE location_stops    ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_segments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_location_stops ON location_stops
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_location_segments ON location_segments
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY location_stops_owner_select ON location_stops
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY location_segments_owner_select ON location_segments
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- v2 adds owner UPDATE for category override on stops + business
-- toggle on segments. v1 keeps everything server-managed.
REVOKE INSERT, UPDATE, DELETE ON location_stops    FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON location_segments FROM authenticated;
GRANT  SELECT ON location_stops    TO authenticated;
GRANT  SELECT ON location_segments TO authenticated;


-- ── Haversine helper ────────────────────────────────────────────────────────
-- Pure-SQL Haversine distance in meters. We DON'T require PostGIS
-- because the existing schema doesn't depend on it everywhere; for
-- v1 a plain function is good enough and keeps the seed self-
-- contained. v2's path_simplified column would force PostGIS in.
CREATE OR REPLACE FUNCTION haversine_m(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT 2 * 6371000 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2))
        * sin(radians(lon2 - lon1) / 2) ^ 2
    )
  );
$$;


-- ── Derive function ─────────────────────────────────────────────────────────
-- Aggregates pings → stops + segments for ONE (user_id, log_date)
-- bucket. Idempotent: DELETEs prior rows for the bucket first, then
-- rebuilds. Returns the count of rows written.
--
-- Algorithm constants (tuned for Texas surveying — slow walking on
-- foot through brush, occasional truck driving):
--   STOP_RADIUS_M       = 50   — within 50 m of cluster centroid
--   STOP_MIN_MINUTES    = 5    — must dwell ≥5 min
--   STOP_GAP_MINUTES    = 10   — split cluster on >10 min ping gap
--   MAX_PLAUSIBLE_JUMP_M = 200000  -- 200 km single-jump glitch guard
--                                     (matches /api/admin/mileage)
CREATE OR REPLACE FUNCTION derive_location_timeline(
  p_user_id UUID,
  p_log_date DATE
)
RETURNS TABLE(stops_written INTEGER, segments_written INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  c_radius_m              CONSTANT DOUBLE PRECISION := 50;
  c_min_dwell_minutes     CONSTANT INTEGER := 5;
  c_max_gap_minutes       CONSTANT INTEGER := 10;
  c_max_plausible_jump_m  CONSTANT DOUBLE PRECISION := 200000;

  v_day_start             TIMESTAMPTZ;
  v_day_end               TIMESTAMPTZ;
  v_stops_written         INTEGER := 0;
  v_segs_written          INTEGER := 0;

  -- Cluster accumulator state.
  v_cluster_started_at    TIMESTAMPTZ;
  v_cluster_last_at       TIMESTAMPTZ;
  v_cluster_lat_sum       DOUBLE PRECISION := 0;
  v_cluster_lon_sum       DOUBLE PRECISION := 0;
  v_cluster_count         INTEGER := 0;
  v_cluster_entry_id      UUID;
  v_cluster_job_id        UUID;
  v_prev_lat              DOUBLE PRECISION;
  v_prev_lon              DOUBLE PRECISION;
  v_prev_at               TIMESTAMPTZ;

  -- For segment-distance accumulation between stops.
  v_prev_stop_id          UUID := NULL;
  v_prev_stop_departed_at TIMESTAMPTZ := NULL;
  v_seg_distance_m        DOUBLE PRECISION := 0;
  v_seg_started_at        TIMESTAMPTZ := NULL;
  v_seg_entry_id          UUID;

  v_centroid_lat          DOUBLE PRECISION;
  v_centroid_lon          DOUBLE PRECISION;
  v_dist                  DOUBLE PRECISION;
  v_gap_min               DOUBLE PRECISION;
  v_dwell_min             DOUBLE PRECISION;
  v_inserted_stop_id      UUID;
  ping                    RECORD;
BEGIN
  -- Date bounds in UTC (matches /api/admin/mileage).
  v_day_start := (p_log_date::TEXT || 'T00:00:00Z')::TIMESTAMPTZ;
  v_day_end   := (p_log_date::TEXT || 'T23:59:59Z')::TIMESTAMPTZ;

  -- Wipe any prior derivation for this bucket. CASCADE drops segments
  -- whose stop FKs disappear; we re-derive them fresh below.
  DELETE FROM location_stops
    WHERE user_id = p_user_id
      AND arrived_at >= v_day_start
      AND arrived_at <= v_day_end
      AND user_overridden = false;
  DELETE FROM location_segments
    WHERE user_id = p_user_id
      AND started_at >= v_day_start
      AND started_at <= v_day_end;

  -- Walk pings in time order.
  FOR ping IN
    SELECT lat, lon, captured_at, job_time_entry_id, jte.job_id AS jte_job_id
      FROM location_pings lp
      LEFT JOIN job_time_entries jte ON jte.id = lp.job_time_entry_id
     WHERE lp.user_id = p_user_id
       AND lp.captured_at >= v_day_start
       AND lp.captured_at <= v_day_end
     ORDER BY lp.captured_at ASC
  LOOP
    -- Track segment distance: every consecutive pair (with glitch
    -- guard) contributes to the running segment between stops.
    IF v_prev_lat IS NOT NULL AND v_prev_stop_id IS NOT NULL THEN
      v_dist := haversine_m(v_prev_lat, v_prev_lon, ping.lat, ping.lon);
      IF v_dist <= c_max_plausible_jump_m THEN
        v_seg_distance_m := v_seg_distance_m + v_dist;
      END IF;
    END IF;

    -- Initialise cluster on first ping.
    IF v_cluster_count = 0 THEN
      v_cluster_started_at := ping.captured_at;
      v_cluster_last_at    := ping.captured_at;
      v_cluster_lat_sum    := ping.lat;
      v_cluster_lon_sum    := ping.lon;
      v_cluster_count      := 1;
      v_cluster_entry_id   := ping.job_time_entry_id;
      v_cluster_job_id     := ping.jte_job_id;
    ELSE
      v_centroid_lat := v_cluster_lat_sum / v_cluster_count;
      v_centroid_lon := v_cluster_lon_sum / v_cluster_count;
      v_dist := haversine_m(v_centroid_lat, v_centroid_lon, ping.lat, ping.lon);
      v_gap_min := EXTRACT(EPOCH FROM ping.captured_at - v_cluster_last_at) / 60.0;

      IF v_dist > c_radius_m OR v_gap_min > c_max_gap_minutes THEN
        -- Cluster broken. Was it a real stop?
        v_dwell_min := EXTRACT(
          EPOCH FROM v_cluster_last_at - v_cluster_started_at
        ) / 60.0;
        IF v_dwell_min >= c_min_dwell_minutes AND v_cluster_count >= 2 THEN
          -- Insert the stop.
          INSERT INTO location_stops (
            user_id, job_time_entry_id, job_id,
            lat, lon, arrived_at, departed_at, duration_minutes
          ) VALUES (
            p_user_id, v_cluster_entry_id, v_cluster_job_id,
            v_cluster_lat_sum / v_cluster_count,
            v_cluster_lon_sum / v_cluster_count,
            v_cluster_started_at, v_cluster_last_at,
            ROUND(v_dwell_min)::INTEGER
          )
          RETURNING id INTO v_inserted_stop_id;
          v_stops_written := v_stops_written + 1;

          -- Close any in-flight segment from the previous stop.
          IF v_prev_stop_id IS NOT NULL THEN
            INSERT INTO location_segments (
              user_id, job_time_entry_id,
              start_stop_id, end_stop_id,
              started_at, ended_at, distance_meters
            ) VALUES (
              p_user_id, v_seg_entry_id,
              v_prev_stop_id, v_inserted_stop_id,
              v_seg_started_at, v_cluster_started_at,
              v_seg_distance_m
            );
            v_segs_written := v_segs_written + 1;
          END IF;

          -- Start a fresh segment from this stop.
          v_prev_stop_id := v_inserted_stop_id;
          v_prev_stop_departed_at := v_cluster_last_at;
          v_seg_started_at := v_cluster_last_at;
          v_seg_distance_m := 0;
          v_seg_entry_id := ping.job_time_entry_id;
        END IF;

        -- Reset cluster to current ping.
        v_cluster_started_at := ping.captured_at;
        v_cluster_last_at    := ping.captured_at;
        v_cluster_lat_sum    := ping.lat;
        v_cluster_lon_sum    := ping.lon;
        v_cluster_count      := 1;
        v_cluster_entry_id   := ping.job_time_entry_id;
        v_cluster_job_id     := ping.jte_job_id;
      ELSE
        -- Extend the cluster.
        v_cluster_last_at  := ping.captured_at;
        v_cluster_lat_sum  := v_cluster_lat_sum + ping.lat;
        v_cluster_lon_sum  := v_cluster_lon_sum + ping.lon;
        v_cluster_count    := v_cluster_count + 1;
      END IF;
    END IF;

    v_prev_lat := ping.lat;
    v_prev_lon := ping.lon;
    v_prev_at  := ping.captured_at;
  END LOOP;

  -- Tail cluster — flush if it qualifies as a stop.
  IF v_cluster_count >= 2 THEN
    v_dwell_min := EXTRACT(
      EPOCH FROM v_cluster_last_at - v_cluster_started_at
    ) / 60.0;
    IF v_dwell_min >= c_min_dwell_minutes THEN
      INSERT INTO location_stops (
        user_id, job_time_entry_id, job_id,
        lat, lon, arrived_at, departed_at, duration_minutes
      ) VALUES (
        p_user_id, v_cluster_entry_id, v_cluster_job_id,
        v_cluster_lat_sum / v_cluster_count,
        v_cluster_lon_sum / v_cluster_count,
        v_cluster_started_at, v_cluster_last_at,
        ROUND(v_dwell_min)::INTEGER
      )
      RETURNING id INTO v_inserted_stop_id;
      v_stops_written := v_stops_written + 1;

      IF v_prev_stop_id IS NOT NULL THEN
        INSERT INTO location_segments (
          user_id, job_time_entry_id,
          start_stop_id, end_stop_id,
          started_at, ended_at, distance_meters
        ) VALUES (
          p_user_id, v_seg_entry_id,
          v_prev_stop_id, v_inserted_stop_id,
          v_seg_started_at, v_cluster_started_at,
          v_seg_distance_m
        );
        v_segs_written := v_segs_written + 1;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_stops_written, v_segs_written;
END;
$$;

-- Lock down execution: only service_role calls. Future v2 may grant
-- to a 'dispatcher' role.
REVOKE ALL ON FUNCTION derive_location_timeline(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION derive_location_timeline(UUID, DATE) TO service_role;

COMMIT;
