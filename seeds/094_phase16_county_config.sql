-- seeds/094_phase16_county_config.sql
-- Phase 16: County Configuration Registry Schema
--
-- Creates the county_portal_configs table used by the CountyConfigRegistry
-- service to persist per-county portal configurations (URLs, selectors,
-- rate limits, etc.) in Supabase so operators can manage them without
-- code changes.
--
-- Integrates with:
--   • worker/src/infra/county-config-registry.ts (runtime config source)
--   • app/api/admin/research/county-config/route.ts (CRUD API)
--
-- Phase 16 Spec §16.2 — County Configuration Registry Schema
-- v1.0: Initial implementation

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. County Portal Configs table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS county_portal_configs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county_fips  text NOT NULL,
  county_name  text NOT NULL,
  platform     text NOT NULL CHECK (
    platform IN (
      'tyler_pay',
      'henschen_pay',
      'idocket_pay',
      'fidlar_pay',
      'govos_direct',
      'kofile',
      'texasfile',
      'landex'
    )
  ),
  config       jsonb NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT true,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (county_fips, platform)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_county_portal_configs_fips
  ON county_portal_configs (county_fips);

CREATE INDEX IF NOT EXISTS idx_county_portal_configs_platform
  ON county_portal_configs (platform);

CREATE INDEX IF NOT EXISTS idx_county_portal_configs_active
  ON county_portal_configs (is_active)
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_county_portal_configs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_county_portal_configs_updated_at
  BEFORE UPDATE ON county_portal_configs
  FOR EACH ROW EXECUTE FUNCTION update_county_portal_configs_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE county_portal_configs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active configs
CREATE POLICY county_portal_configs_select_authenticated
  ON county_portal_configs
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Service role (used by admin API routes) can perform all operations
CREATE POLICY county_portal_configs_all_service_role
  ON county_portal_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Service role grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON county_portal_configs TO authenticated;
GRANT ALL    ON county_portal_configs TO service_role;
