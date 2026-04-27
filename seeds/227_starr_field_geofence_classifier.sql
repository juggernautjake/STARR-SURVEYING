-- ============================================================================
-- 227_starr_field_geofence_classifier.sql
-- Starr Field — stop-detection v2: geofence-based category assignment.
--
-- Per F6 plan ("Stop detection, geofence + AI classification"). Phase 1
-- of v2 layers a deterministic geofence match on top of the v1
-- aggregator from seeds/224: each derived stop is checked against
-- every job whose centroid is set (jobs.centroid_lat / .centroid_lon /
-- .geofence_radius_m, populated either via the new
-- /api/admin/jobs/[id]/geofence endpoint OR auto-captured via the
-- "Set as job site" button on /admin/timeline). When a stop is within
-- the job's radius:
--
--   stop.category        = jobs.name
--   stop.category_source = 'geofence'
--   stop.job_id          = jobs.id
--
-- Multiple matches (overlapping geofences for adjacent properties)
-- pick the CLOSEST match by Haversine distance. Stops outside any
-- geofence stay null; the v2 AI classifier (Phase 2 — pending)
-- handles those.
--
-- user_overridden=true stops are never touched. The v1 aggregator
-- already protects them; this seed inherits the same protection by
-- only patching freshly-DELETE'd-then-INSERT'd rows.
--
-- Idempotent: replaces the v1 derive_location_timeline function in
-- place. Safe to call repeatedly. Re-running with new geofence values
-- on the jobs table re-classifies stops on the next derive call.
--
-- IMPORTANT — depends on seeds/224 (location_stops, location_segments,
-- haversine_m, derive_location_timeline) and seeds/220 (jobs columns
-- centroid_lat / centroid_lon / geofence_radius_m).
-- ============================================================================

BEGIN;

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
  -- Geofence search bounding box. We only consider jobs whose
  -- centroid is within this many meters of the stop centroid before
  -- the more expensive Haversine check — keeps the per-stop work
  -- O(jobs-near-this-stop) rather than O(all-jobs).
  c_geofence_search_m     CONSTANT DOUBLE PRECISION := 5000;

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
  v_classified_job_id     UUID;
  v_classified_job_name   TEXT;
  ping                    RECORD;
  geofence_match          RECORD;
BEGIN
  v_day_start := (p_log_date::TEXT || 'T00:00:00Z')::TIMESTAMPTZ;
  v_day_end   := (p_log_date::TEXT || 'T23:59:59Z')::TIMESTAMPTZ;

  -- Wipe any prior derivation. user_overridden stops are preserved
  -- so admin/surveyor manual category fixes survive recomputes.
  DELETE FROM location_stops
    WHERE user_id = p_user_id
      AND arrived_at >= v_day_start
      AND arrived_at <= v_day_end
      AND user_overridden = false;
  DELETE FROM location_segments
    WHERE user_id = p_user_id
      AND started_at >= v_day_start
      AND started_at <= v_day_end;

  FOR ping IN
    SELECT lat, lon, captured_at, job_time_entry_id, jte.job_id AS jte_job_id
      FROM location_pings lp
      LEFT JOIN job_time_entries jte ON jte.id = lp.job_time_entry_id
     WHERE lp.user_id = p_user_id
       AND lp.captured_at >= v_day_start
       AND lp.captured_at <= v_day_end
     ORDER BY lp.captured_at ASC
  LOOP
    IF v_prev_lat IS NOT NULL AND v_prev_stop_id IS NOT NULL THEN
      v_dist := haversine_m(v_prev_lat, v_prev_lon, ping.lat, ping.lon);
      IF v_dist <= c_max_plausible_jump_m THEN
        v_seg_distance_m := v_seg_distance_m + v_dist;
      END IF;
    END IF;

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
        v_dwell_min := EXTRACT(
          EPOCH FROM v_cluster_last_at - v_cluster_started_at
        ) / 60.0;
        IF v_dwell_min >= c_min_dwell_minutes AND v_cluster_count >= 2 THEN
          v_centroid_lat := v_cluster_lat_sum / v_cluster_count;
          v_centroid_lon := v_cluster_lon_sum / v_cluster_count;

          -- Geofence classifier. v_classified_job_id wins over
          -- v_cluster_job_id (the time-entry link) when a closer
          -- match exists — bookkeepers care about WHICH SITE the
          -- crew was at, not which time-entry was open.
          v_classified_job_id := NULL;
          v_classified_job_name := NULL;
          SELECT j.id, j.name INTO geofence_match
            FROM jobs j
           WHERE j.centroid_lat IS NOT NULL
             AND j.centroid_lon IS NOT NULL
             AND COALESCE(j.geofence_radius_m, 0) > 0
             -- Cheap bounding-box filter first: exclude jobs whose
             -- centroid is more than c_geofence_search_m away from
             -- the stop. (1 deg ≈ 111 km lat / 111 km · cos(lat) lon.)
             AND ABS(j.centroid_lat - v_centroid_lat) <
                 c_geofence_search_m / 111000
             AND ABS(j.centroid_lon - v_centroid_lon) <
                 c_geofence_search_m / (111000 * GREATEST(cos(radians(v_centroid_lat)), 0.1))
             -- Real Haversine distance must be within the job's
             -- configured geofence radius.
             AND haversine_m(
                   v_centroid_lat, v_centroid_lon,
                   j.centroid_lat, j.centroid_lon
                 ) <= j.geofence_radius_m
           ORDER BY haversine_m(
                      v_centroid_lat, v_centroid_lon,
                      j.centroid_lat, j.centroid_lon
                    ) ASC
           LIMIT 1;
          IF geofence_match IS NOT NULL THEN
            v_classified_job_id := geofence_match.id;
            v_classified_job_name := geofence_match.name;
          END IF;

          INSERT INTO location_stops (
            user_id, job_time_entry_id, job_id,
            category, category_source,
            lat, lon, arrived_at, departed_at, duration_minutes
          ) VALUES (
            p_user_id, v_cluster_entry_id,
            COALESCE(v_classified_job_id, v_cluster_job_id),
            v_classified_job_name,
            CASE WHEN v_classified_job_id IS NOT NULL THEN 'geofence' ELSE NULL END,
            v_centroid_lat, v_centroid_lon,
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

          v_prev_stop_id := v_inserted_stop_id;
          v_prev_stop_departed_at := v_cluster_last_at;
          v_seg_started_at := v_cluster_last_at;
          v_seg_distance_m := 0;
          v_seg_entry_id := ping.job_time_entry_id;
        END IF;

        v_cluster_started_at := ping.captured_at;
        v_cluster_last_at    := ping.captured_at;
        v_cluster_lat_sum    := ping.lat;
        v_cluster_lon_sum    := ping.lon;
        v_cluster_count      := 1;
        v_cluster_entry_id   := ping.job_time_entry_id;
        v_cluster_job_id     := ping.jte_job_id;
      ELSE
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

  -- Tail cluster — same geofence-classifier pass.
  IF v_cluster_count >= 2 THEN
    v_dwell_min := EXTRACT(
      EPOCH FROM v_cluster_last_at - v_cluster_started_at
    ) / 60.0;
    IF v_dwell_min >= c_min_dwell_minutes THEN
      v_centroid_lat := v_cluster_lat_sum / v_cluster_count;
      v_centroid_lon := v_cluster_lon_sum / v_cluster_count;
      v_classified_job_id := NULL;
      v_classified_job_name := NULL;
      SELECT j.id, j.name INTO geofence_match
        FROM jobs j
       WHERE j.centroid_lat IS NOT NULL
         AND j.centroid_lon IS NOT NULL
         AND COALESCE(j.geofence_radius_m, 0) > 0
         AND ABS(j.centroid_lat - v_centroid_lat) <
             c_geofence_search_m / 111000
         AND ABS(j.centroid_lon - v_centroid_lon) <
             c_geofence_search_m / (111000 * GREATEST(cos(radians(v_centroid_lat)), 0.1))
         AND haversine_m(
               v_centroid_lat, v_centroid_lon,
               j.centroid_lat, j.centroid_lon
             ) <= j.geofence_radius_m
       ORDER BY haversine_m(
                  v_centroid_lat, v_centroid_lon,
                  j.centroid_lat, j.centroid_lon
                ) ASC
       LIMIT 1;
      IF geofence_match IS NOT NULL THEN
        v_classified_job_id := geofence_match.id;
        v_classified_job_name := geofence_match.name;
      END IF;

      INSERT INTO location_stops (
        user_id, job_time_entry_id, job_id,
        category, category_source,
        lat, lon, arrived_at, departed_at, duration_minutes
      ) VALUES (
        p_user_id, v_cluster_entry_id,
        COALESCE(v_classified_job_id, v_cluster_job_id),
        v_classified_job_name,
        CASE WHEN v_classified_job_id IS NOT NULL THEN 'geofence' ELSE NULL END,
        v_centroid_lat, v_centroid_lon,
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

REVOKE ALL ON FUNCTION derive_location_timeline(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION derive_location_timeline(UUID, DATE) TO service_role;

COMMIT;
