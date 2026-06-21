-- ============================================================================
-- 370_research_adapter_registry.sql
--
-- §7.1–7.4 of docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md
-- — the shared foundation the three research pillars (self-healing
-- adapters, one-screen site registration, relevance-scoped extraction)
-- all build on.
--
-- Tables (all idempotent):
--   - counties              one row per Texas county (254 total)
--   - data_vendors          reusable vendor templates — the moat
--   - site_adapters         concrete registered sites (county × vendor × type)
--   - county_data_sources   coverage rollup per county × site_type
--
-- This seed creates the schema + seeds the four working vendor templates
-- (Bell ArcGIS, TrueAutomation/PropAccess, eSearch, publicsearch) so day-one
-- registration of a new county that uses one of those vendors is a config
-- row, not a code change.
--
-- The full 254-county seed (§7.1 acceptance) lands in a follow-up data slice
-- so this migration stays small + auditable; this file seeds only the
-- counties already wired up in the existing adapters (Bell, etc.) plus the
-- vendor templates.
--
-- Depends on: public schema baseline (pgcrypto for gen_random_uuid, postgis
-- optional — geometry is stored as plain JSONB to keep the migration
-- universally applicable).
-- ============================================================================

BEGIN;

-- ── §7.1 counties ──────────────────────────────────────────────────────────
-- One row per Texas county. `metro_tier` (1 = top metro, 4 = rural) drives
-- the prioritization of scheduled health checks (§9.7) and county
-- onboarding order.
CREATE TABLE IF NOT EXISTS public.research_counties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fips        TEXT UNIQUE NOT NULL,                -- 5-digit FIPS, e.g. '48027' (Bell)
  name        TEXT NOT NULL,                       -- 'Bell', 'Harris', etc.
  state       TEXT NOT NULL DEFAULT 'TX',
  metro_tier  SMALLINT,                            -- 1..4; null = unranked
  centroid    JSONB,                               -- {lon, lat} as GeoJSON Point coords
  seeded_at   TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_research_counties_state_tier
  ON public.research_counties(state, metro_tier NULLS LAST);
COMMENT ON TABLE public.research_counties IS
  '§7.1 — Texas county registry. metro_tier drives §9.7 health-check cadence.';


-- ── §7.2 data_vendors ──────────────────────────────────────────────────────
-- Reusable vendor templates — the leverage point that makes county-portal
-- onboarding O(1) instead of O(n). Each row is a vendor family (Tyler's
-- publicsearch.us, Pritchard & Abbott eSearch, TrueAutomation PropAccess,
-- generic Esri ArcGIS REST, etc.). `url_fingerprints` lets the §8.2
-- registration wizard auto-detect the vendor from a pasted portal URL.
CREATE TABLE IF NOT EXISTS public.research_data_vendors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_key           TEXT UNIQUE NOT NULL,           -- e.g. 'bell_cad_arcgis'
  display_name         TEXT NOT NULL,                  -- 'Bell CAD (Esri ArcGIS REST)'
  access_method        TEXT NOT NULL,                  -- 'json_api' / 'html_scrape' / 'arcgis_rest' / 'browser_playwright'
  url_fingerprints     JSONB NOT NULL DEFAULT '[]',    -- regex/host patterns: [{type:'host_re', re:'^.+\\.publicsearch\\.us$'}]
  config_template      JSONB NOT NULL DEFAULT '{}',    -- endpoint shapes, default selectors, query templates, pagination, auth
  field_map_template   JSONB NOT NULL DEFAULT '{}',    -- CanonicalFieldMap from lib/research/canonical-schema.ts
  notes                TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  version              TEXT NOT NULL DEFAULT '1.0.0',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT research_data_vendors_access_method_chk
    CHECK (access_method IN ('json_api', 'html_scrape', 'arcgis_rest', 'browser_playwright'))
);
CREATE INDEX IF NOT EXISTS idx_research_data_vendors_active
  ON public.research_data_vendors(is_active, vendor_key);
COMMENT ON TABLE public.research_data_vendors IS
  '§7.2 — Reusable vendor templates. New county portals usually match an existing vendor and become a config row, not a code change.';


-- ── §7.3 site_adapters ─────────────────────────────────────────────────────
-- A concrete registered site (one county's specific portal). `vendor_id` is
-- nullable so a bespoke browser_playwright adapter (built via the §8.3 AI
-- probe for an unknown portal) is representable. `status` drives the §9
-- self-healing state machine.
DO $$ BEGIN
  CREATE TYPE public.research_adapter_status_enum AS ENUM
    ('draft', 'active', 'degraded', 'broken', 'quarantined', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.research_site_type_enum AS ENUM
    ('appraisal_cad', 'clerk_deeds', 'plat_records', 'gis_parcels',
     'legal_description', 'flood_fema', 'survey_glo', 'misc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.research_site_adapters (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id            UUID NOT NULL REFERENCES public.research_counties(id) ON DELETE RESTRICT,
  vendor_id            UUID REFERENCES public.research_data_vendors(id) ON DELETE SET NULL,
  site_type            public.research_site_type_enum NOT NULL,
  base_url             TEXT NOT NULL,
  access_method        TEXT NOT NULL,                  -- mirrors vendors.access_method; cached here for fast queries
  config               JSONB NOT NULL DEFAULT '{}',    -- vendor_template merged with county-specific params
  field_map            JSONB NOT NULL DEFAULT '{}',    -- CanonicalFieldMap actually applied (overrides template)
  status               public.research_adapter_status_enum NOT NULL DEFAULT 'draft',
  health               JSONB NOT NULL DEFAULT '{}',    -- rollup of recent adapter_health_checks (§9.3)
  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  last_verified_at     TIMESTAMPTZ,
  -- One adapter per (county, site_type) by default. To register a 2nd
  -- adapter (e.g. clerk has two portals), bump a discriminator into config
  -- and we can relax this with a partial unique later.
  CONSTRAINT research_site_adapters_county_type_uniq
    UNIQUE (county_id, site_type)
);
CREATE INDEX IF NOT EXISTS idx_research_site_adapters_status
  ON public.research_site_adapters(status, last_verified_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_research_site_adapters_vendor
  ON public.research_site_adapters(vendor_id);
COMMENT ON TABLE public.research_site_adapters IS
  '§7.3 — Concrete registered sites. status drives §9 self-healing.';


-- ── §7.4 county_data_sources ──────────────────────────────────────────────
-- Coverage rollup per county × site_type. Powers /admin/research/coverage
-- (existing route) so customers see "we already support your county".
DO $$ BEGIN
  CREATE TYPE public.research_coverage_enum AS ENUM
    ('full', 'partial', 'requested', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.research_county_data_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id    UUID NOT NULL REFERENCES public.research_counties(id) ON DELETE CASCADE,
  site_type    public.research_site_type_enum NOT NULL,
  coverage     public.research_coverage_enum NOT NULL DEFAULT 'none',
  adapter_id   UUID REFERENCES public.research_site_adapters(id) ON DELETE SET NULL,
  notes        TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT research_county_data_sources_county_type_uniq
    UNIQUE (county_id, site_type)
);
CREATE INDEX IF NOT EXISTS idx_research_county_data_sources_coverage
  ON public.research_county_data_sources(coverage, site_type);
COMMENT ON TABLE public.research_county_data_sources IS
  '§7.4 — Coverage rollup. Powers /admin/research/coverage.';


-- ── Updated-at triggers (idempotent) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.research_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_research_counties_updated
    BEFORE UPDATE ON public.research_counties
    FOR EACH ROW EXECUTE FUNCTION public.research_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_research_data_vendors_updated
    BEFORE UPDATE ON public.research_data_vendors
    FOR EACH ROW EXECUTE FUNCTION public.research_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_research_site_adapters_updated
    BEFORE UPDATE ON public.research_site_adapters
    FOR EACH ROW EXECUTE FUNCTION public.research_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_research_county_data_sources_updated
    BEFORE UPDATE ON public.research_county_data_sources
    FOR EACH ROW EXECUTE FUNCTION public.research_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Seed: counties already wired into existing adapters ───────────────────
-- The full 254-county seed lands in a separate data slice. Here we seed
-- only the counties already integrated so the four working adapters can
-- have their (county_id, vendor_id) FKs resolved immediately.
INSERT INTO public.research_counties (fips, name, state, metro_tier) VALUES
  ('48027', 'Bell',       'TX', 2),  -- Bell CAD ArcGIS adapter
  ('48201', 'Harris',     'TX', 1),
  ('48029', 'Bexar',      'TX', 1),
  ('48113', 'Dallas',     'TX', 1),
  ('48439', 'Tarrant',    'TX', 1),
  ('48453', 'Travis',     'TX', 1),
  ('48085', 'Collin',     'TX', 1),
  ('48121', 'Denton',     'TX', 1),
  ('48141', 'El Paso',    'TX', 1),
  ('48157', 'Fort Bend',  'TX', 1)
ON CONFLICT (fips) DO NOTHING;


-- ── Seed: vendor templates (the moat) ─────────────────────────────────────
-- Each template captures the SHAPE of the vendor's portal. Per-county
-- params (client id, layer ids, etc.) live in site_adapters.config, NOT
-- here, so registering a new county that uses the same vendor is a
-- config-row change.

INSERT INTO public.research_data_vendors
  (vendor_key, display_name, access_method, url_fingerprints, config_template, field_map_template, notes)
VALUES
-- 1. Bell CAD ArcGIS — Esri ArcGIS REST. Existing service:
--    lib/research/bell-cad-arcgis.service.ts
(
  'bell_cad_arcgis',
  'Bell CAD (Esri ArcGIS REST)',
  'arcgis_rest',
  '[
    {"type":"host_re","re":"^services[0-9]*\\.arcgis\\.com$"},
    {"type":"path_re","re":"/FeatureServer/[0-9]+/query"}
  ]'::jsonb,
  '{
    "endpoints": {
      "query":  "{base_url}/{layer_id}/query",
      "feature":"{base_url}/{layer_id}/{object_id}"
    },
    "default_params": {
      "f": "json",
      "outSR": 4326,
      "returnGeometry": true,
      "outFields": "*"
    },
    "pagination": { "type": "objectIdOffset", "page_size": 1000 }
  }'::jsonb,
  '{
    "vendor_key": "bell_cad_arcgis",
    "version": "1.0.0",
    "mappings": [
      { "from_path": "attributes.prop_id",              "to_path": "parcel_id",           "transform": "string" },
      { "from_path": "attributes.file_as_name",         "to_path": "owner.display_name",  "transform": "trim" },
      { "from_path": "attributes.legal_acreage",        "to_path": "acreage",             "transform": "number" },
      { "from_path": "attributes.full_legal_description","to_path":"legal.text",          "transform": "trim" },
      { "from_path": "attributes.tract_or_lot",         "to_path": "legal.tract",         "transform": "string" },
      { "from_path": "attributes.block",                "to_path": "legal.block",         "transform": "string" },
      { "from_path": "attributes.abs_subdv_cd",         "to_path": "legal.abstract_number","transform":"string" },
      { "from_path": "attributes.land_val",             "to_path": "valuation.land_value","transform": "number" },
      { "from_path": "attributes.imprv_val",            "to_path": "valuation.improvement_value","transform":"number" },
      { "from_path": "attributes.market",               "to_path": "valuation.market_value","transform":"number" },
      { "from_path": "geometry",                        "to_path": "geometry.geojson",    "transform": "arcgis_rings_to_geojson_polygon" },
      { "from_path": "attributes.geo_id",               "to_path": "extras.geo_id" }
    ]
  }'::jsonb,
  'Esri ArcGIS REST FeatureServer. Layer + service id live in site_adapters.config.layer_id. WKID 4326 forced; reproject upstream if the layer is in 2277/2278 (TX State Plane).'
),
-- 2. TrueAutomation PropAccess — html_scrape via Playwright. Existing
--    service: lib/research/browser-scrape.service.ts
(
  'trueautomation_propaccess',
  'TrueAutomation PropAccess (browser scrape)',
  'browser_playwright',
  '[
    {"type":"host_re","re":"^propaccess\\.trueautomation\\.com$"},
    {"type":"path_re","re":"/(clientdb|ClientDB)/"}
  ]'::jsonb,
  '{
    "flow": [
      { "step": "open",    "url": "{base_url}" },
      { "step": "fill",    "selector": "input[name=propertySearchOptions:input_propertyId]", "value": "{parcel_id}" },
      { "step": "click",   "selector": "button[type=submit]" },
      { "step": "wait",    "selector": ".propertyDetailContainer" }
    ],
    "result_selectors": {
      "owner":               ".propertyDetailContainer .owner",
      "legal_description":   ".propertyDetailContainer .legalDescription",
      "deed_reference":      ".propertyDetailContainer .deedReference"
    }
  }'::jsonb,
  '{
    "vendor_key": "trueautomation_propaccess",
    "version": "1.0.0",
    "mappings": [
      { "from_path": "propertyId",       "to_path": "parcel_id",            "transform": "string" },
      { "from_path": "ownerName",        "to_path": "owner.display_name",   "transform": "trim" },
      { "from_path": "legalDescription", "to_path": "legal.text",           "transform": "trim" },
      { "from_path": "deedReference",    "to_path": "deed_references[0].citation", "transform": "string" }
    ]
  }'::jsonb,
  'TrueAutomation PropAccess. Selectors are stable across counties; per-county subdomain in site_adapters.config.subdomain.'
),
-- 3. eSearch CAD — html_scrape. Pritchard & Abbott eSearch portals.
(
  'esearch_cad',
  'eSearch CAD (Pritchard & Abbott, browser scrape)',
  'browser_playwright',
  '[
    {"type":"host_re","re":"^esearch\\..+\\.org$"},
    {"type":"host_re","re":"^.+\\.esearch\\.us$"}
  ]'::jsonb,
  '{
    "flow": [
      { "step": "open",  "url": "{base_url}" },
      { "step": "fill",  "selector": "#PropertyID", "value": "{parcel_id}" },
      { "step": "click", "selector": "#btnSearch" },
      { "step": "wait",  "selector": ".property-details" }
    ],
    "result_selectors": {
      "owner":             ".property-details .owner-name",
      "legal_description": ".property-details .legal-description",
      "acreage":           ".property-details .acreage"
    }
  }'::jsonb,
  '{
    "vendor_key": "esearch_cad",
    "version": "1.0.0",
    "mappings": [
      { "from_path": "propertyId",       "to_path": "parcel_id",          "transform": "string" },
      { "from_path": "ownerName",        "to_path": "owner.display_name", "transform": "trim" },
      { "from_path": "legalDescription", "to_path": "legal.text",         "transform": "trim" },
      { "from_path": "acreage",          "to_path": "acreage",            "transform": "number" }
    ]
  }'::jsonb,
  'Pritchard & Abbott eSearch. Portal hosts vary; url_fingerprints cover both common shapes.'
),
-- 4. publicsearch_clerk — Tyler Technologies publicsearch.us clerk records.
(
  'publicsearch_clerk',
  'Tyler publicsearch.us (clerk deeds, browser scrape)',
  'browser_playwright',
  '[
    {"type":"host_re","re":"^.+\\.publicsearch\\.us$"}
  ]'::jsonb,
  '{
    "flow": [
      { "step": "open",  "url": "{base_url}/search/landrecords" },
      { "step": "fill",  "selector": "input[name=grantor]", "value": "{owner_name}" },
      { "step": "click", "selector": "button.search-button" },
      { "step": "wait",  "selector": "table.search-results" }
    ],
    "result_selectors": {
      "row":              "table.search-results tbody tr",
      "instrument_type":  "td.instrument-type",
      "recorded_at":      "td.recorded-date",
      "instrument_number":"td.instrument-number",
      "volume":           "td.volume",
      "page":             "td.page"
    }
  }'::jsonb,
  '{
    "vendor_key": "publicsearch_clerk",
    "version": "1.0.0",
    "mappings": [
      { "from_path": "instrument_number", "to_path": "deed_references[].instrument_number", "transform": "string" },
      { "from_path": "instrument_type",   "to_path": "deed_references[].instrument_type",   "transform": "string" },
      { "from_path": "volume",            "to_path": "deed_references[].volume",            "transform": "string" },
      { "from_path": "page",              "to_path": "deed_references[].page",              "transform": "string" },
      { "from_path": "recorded_at",       "to_path": "deed_references[].recorded_at",       "transform": "iso_date" }
    ]
  }'::jsonb,
  'Tyler publicsearch.us clerk records. Search by grantor name; site_adapters.config.search_field can switch to grantee/instrument_number per county.'
)
ON CONFLICT (vendor_key) DO NOTHING;


-- ── Seed: coverage rows for the four working adapters ─────────────────────
-- Initial state: Bell CAD ArcGIS is the only one wired up to a specific
-- county adapter today (the lib/research/bell-cad-arcgis.service.ts file
-- targets county_id='48027'). The other three vendor templates exist but
-- have no concrete site_adapters row yet — they'll be created via the §8
-- registration wizard. Coverage marks Bell as 'partial' (CAD only;
-- clerk/plat live on different portals).
INSERT INTO public.research_county_data_sources (county_id, site_type, coverage)
SELECT c.id, 'appraisal_cad'::public.research_site_type_enum, 'partial'::public.research_coverage_enum
FROM public.research_counties c
WHERE c.fips = '48027'
ON CONFLICT (county_id, site_type) DO NOTHING;

COMMIT;
