-- ============================================================================
-- 097_phase19_lidar.sql
-- Phase 19: TNRIS LiDAR Data Cache & Cross-County Properties
--
-- Creates tables for:
--   1. lidar_data_cache       — cached TNRIS LiDAR results per project location
--   2. cross_county_properties — projects identified as straddling county lines
--
-- Depends on: research_projects table (from 090_research_tables.sql)
-- ============================================================================

BEGIN;

-- ── 1. lidar_data_cache ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lidar_data_cache (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID REFERENCES research_projects(id) ON DELETE CASCADE,
  lat                 NUMERIC(10,7)    NOT NULL,
  lon                 NUMERIC(10,7)    NOT NULL,
  radius_m            INTEGER          NOT NULL DEFAULT 500,
  collection_id       TEXT,
  collection_name     TEXT,
  resolution_ft       NUMERIC(5,2),
  min_elevation_ft    NUMERIC(10,2),
  max_elevation_ft    NUMERIC(10,2),
  mean_elevation_ft   NUMERIC(10,2),
  slope_percent       NUMERIC(6,2),
  has_floodplain      BOOLEAN,
  drainage_direction  TEXT,
  data_available      BOOLEAN          NOT NULL DEFAULT false,
  fetched_at          TIMESTAMPTZ      NOT NULL DEFAULT now(),
  raw_response        JSONB,
  created_at          TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lidar_cache_project  ON lidar_data_cache(project_id);
CREATE INDEX IF NOT EXISTS idx_lidar_cache_coords   ON lidar_data_cache(lat, lon);
CREATE INDEX IF NOT EXISTS idx_lidar_cache_fetched  ON lidar_data_cache(fetched_at DESC);

-- ── 2. cross_county_properties ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cross_county_properties (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE UNIQUE,
  primary_county_fips      TEXT NOT NULL,
  secondary_county_fips    TEXT[],
  resolution_strategy      TEXT NOT NULL DEFAULT 'primary_only'
                             CHECK (resolution_strategy IN ('primary_only', 'both_counties', 'split_research')),
  detection_confidence     TEXT NOT NULL DEFAULT 'low'
                             CHECK (detection_confidence IN ('high', 'medium', 'low')),
  is_cross_county          BOOLEAN NOT NULL DEFAULT false,
  research_plan            JSONB,
  notes                    TEXT[],
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cross_county_project ON cross_county_properties(project_id);
CREATE INDEX IF NOT EXISTS idx_cross_county_fips    ON cross_county_properties(primary_county_fips);

-- ── updated_at trigger for cross_county_properties ───────────────────────────

CREATE OR REPLACE FUNCTION sync_cross_county_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cross_county_updated_at ON cross_county_properties;
CREATE TRIGGER trg_cross_county_updated_at
  BEFORE UPDATE ON cross_county_properties
  FOR EACH ROW EXECUTE FUNCTION sync_cross_county_updated_at();

-- ── RLS policies ─────────────────────────────────────────────────────────────

ALTER TABLE lidar_data_cache      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_county_properties ENABLE ROW LEVEL SECURITY;

-- lidar_data_cache: accessible by project owner (via research_projects.created_by)
CREATE POLICY lidar_cache_select ON lidar_data_cache
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM research_projects
      WHERE created_by = auth.email()
    )
  );

CREATE POLICY lidar_cache_insert ON lidar_data_cache
  FOR INSERT WITH CHECK (true);  -- worker inserts on behalf of users

CREATE POLICY lidar_cache_delete ON lidar_data_cache
  FOR DELETE USING (
    project_id IN (
      SELECT id FROM research_projects
      WHERE created_by = auth.email()
    )
  );

-- cross_county_properties: accessible by project owner
CREATE POLICY cross_county_select ON cross_county_properties
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM research_projects
      WHERE created_by = auth.email()
    )
  );

CREATE POLICY cross_county_upsert ON cross_county_properties
  FOR ALL USING (true) WITH CHECK (true);  -- worker manages these records

-- ── Service role grants ───────────────────────────────────────────────────────

GRANT ALL ON lidar_data_cache         TO service_role;
GRANT ALL ON cross_county_properties  TO service_role;

-- ── Helper: get_lidar_for_project ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_lidar_for_project(p_project_id UUID)
RETURNS TABLE (
  lat             NUMERIC,
  lon             NUMERIC,
  collection_name TEXT,
  resolution_ft   NUMERIC,
  mean_elevation_ft NUMERIC,
  slope_percent   NUMERIC,
  has_floodplain  BOOLEAN,
  data_available  BOOLEAN,
  fetched_at      TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT
    lat, lon, collection_name, resolution_ft,
    mean_elevation_ft, slope_percent, has_floodplain,
    data_available, fetched_at
  FROM lidar_data_cache
  WHERE project_id = p_project_id
  ORDER BY fetched_at DESC
  LIMIT 1;
$$;

COMMIT;
