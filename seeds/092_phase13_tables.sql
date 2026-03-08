-- seeds/092_phase13_tables.sql
-- Phase 13: USGS topographic data and TX Comptroller tax data persistence.
-- These tables cache expensive external API results so that subsequent page
-- loads are instant and the free USGS/Comptroller APIs are not hammered.

-- ── research_topo ──────────────────────────────────────────────────────────
-- Stores USGS National Map topographic query results per project.
-- One row per query (allows tracking queries over time).

CREATE TABLE IF NOT EXISTS research_topo (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id     UUID NOT NULL
                            REFERENCES research_projects(id) ON DELETE CASCADE,
    created_by              TEXT,

    -- Query parameters (stored for cache invalidation / re-query)
    query_lat               DOUBLE PRECISION,
    query_lon               DOUBLE PRECISION,
    query_radius_m          INTEGER DEFAULT 200,

    -- Result snapshot
    elevation_ft            DOUBLE PRECISION,
    elevation_data_source   TEXT,
    contour_count           INTEGER DEFAULT 0,
    water_feature_count     INTEGER DEFAULT 0,
    slope_pct               DOUBLE PRECISION,
    aspect_deg              DOUBLE PRECISION,
    elevation_range_ft      DOUBLE PRECISION,

    -- Full result JSON for rich UI display
    result                  JSONB NOT NULL DEFAULT '{}',
    errors                  TEXT[],

    queried_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_topo_project
    ON research_topo(research_project_id, queried_at DESC);

-- ── research_tax ───────────────────────────────────────────────────────────
-- Stores TX Comptroller PTAD tax rate query results per project.
-- One row per query per tax year.

CREATE TABLE IF NOT EXISTS research_tax (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id     UUID NOT NULL
                            REFERENCES research_projects(id) ON DELETE CASCADE,
    created_by              TEXT,

    -- Query parameters
    county_fips             CHAR(5),
    county_name             TEXT,
    appraisal_district_name TEXT,
    appraisal_district_url  TEXT,
    tax_year                INTEGER,

    -- Key metrics
    combined_rate           DOUBLE PRECISION,   -- Rate per $100 valuation
    taxing_unit_count       INTEGER DEFAULT 0,

    -- Full result JSON
    result                  JSONB NOT NULL DEFAULT '{}',
    errors                  TEXT[],

    queried_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_tax_project
    ON research_tax(research_project_id, queried_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_tax_fips
    ON research_tax(county_fips, tax_year);

-- ── Row-level security ─────────────────────────────────────────────────────
-- These tables inherit the same RLS model as research_projects.
-- Service-role key bypasses RLS for server-side API routes.
-- End-users should only see records for projects they own.

ALTER TABLE research_topo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_tax   ENABLE ROW LEVEL SECURITY;

-- Service-role policy (allows full server-side access)
DO $$
BEGIN
  -- research_topo
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'research_topo' AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY service_role_full_access ON research_topo
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- research_tax
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'research_tax' AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY service_role_full_access ON research_tax
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END;
$$;
