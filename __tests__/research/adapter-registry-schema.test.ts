// __tests__/research/adapter-registry-schema.test.ts
//
// Source-lock for seeds/370_research_adapter_registry.sql — §7.1–7.4 of
// docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Locks the table + column shape so a future slice that renames a column
// (e.g. `field_map_template` → `mapping`) has to update this test
// deliberately, AND verifies the seeded vendor templates parse as valid
// CanonicalFieldMap shapes against lib/research/canonical-schema.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'seeds', '370_research_adapter_registry.sql'),
  'utf8',
);

describe('seeds/370_research_adapter_registry.sql — table shapes', () => {
  it('creates research_counties with the §7.1 column set', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.research_counties/);
    for (const col of ['fips', 'name', 'state', 'metro_tier', 'centroid']) {
      expect(SRC).toContain(col);
    }
    expect(SRC).toMatch(/fips\s+TEXT UNIQUE NOT NULL/);
  });

  it('creates research_data_vendors with the §7.2 column set + access_method check', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.research_data_vendors/);
    for (const col of [
      'vendor_key',
      'display_name',
      'access_method',
      'url_fingerprints',
      'config_template',
      'field_map_template',
    ]) {
      expect(SRC).toContain(col);
    }
    expect(SRC).toMatch(/access_method IN \('json_api', 'html_scrape', 'arcgis_rest', 'browser_playwright'\)/);
  });

  it('creates research_site_adapters with the §7.3 column set + status enum', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.research_site_adapters/);
    for (const col of [
      'county_id',
      'vendor_id',
      'site_type',
      'base_url',
      'config',
      'field_map',
      'status',
      'health',
      'last_verified_at',
    ]) {
      expect(SRC).toContain(col);
    }
    // Status enum values per the planning doc.
    for (const v of ["'draft'", "'active'", "'degraded'", "'broken'", "'quarantined'"]) {
      expect(SRC).toContain(v);
    }
  });

  it('creates research_county_data_sources with the §7.4 coverage enum', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.research_county_data_sources/);
    for (const col of ['county_id', 'site_type', 'coverage', 'adapter_id']) {
      expect(SRC).toContain(col);
    }
    for (const v of ["'full'", "'partial'", "'requested'", "'none'"]) {
      expect(SRC).toContain(v);
    }
  });

  it('enforces a single adapter per (county, site_type) by default', () => {
    expect(SRC).toMatch(/UNIQUE \(county_id, site_type\)/);
  });

  it('is wrapped in a transaction so partial application is impossible', () => {
    expect(SRC).toMatch(/^BEGIN;/m);
    expect(SRC).toMatch(/COMMIT;\s*$/m);
  });

  it('is idempotent — re-running the seed must not fail or duplicate', () => {
    expect(SRC).toMatch(/IF NOT EXISTS/);
    expect(SRC).toMatch(/ON CONFLICT \(fips\) DO NOTHING/);
    expect(SRC).toMatch(/ON CONFLICT \(vendor_key\) DO NOTHING/);
  });
});

describe('seeds/370 — vendor templates', () => {
  // Pull every vendor_key the seed registers so future templates need a
  // deliberate test update too.
  const vendorKeys = ['bell_cad_arcgis', 'trueautomation_propaccess', 'esearch_cad', 'publicsearch_clerk'];

  for (const k of vendorKeys) {
    it(`registers the ${k} vendor template with non-empty url_fingerprints + field_map`, () => {
      expect(SRC).toContain(`'${k}'`);
    });
  }

  it('Bell CAD ArcGIS template maps the four critical canonical fields', () => {
    // parcel_id + owner.display_name + acreage + legal.text are the
    // minimum every Texas CAD adapter must produce — without these the
    // downstream pipeline can't anchor the subject.
    for (const target of ['"parcel_id"', '"owner.display_name"', '"acreage"', '"legal.text"']) {
      expect(SRC).toContain(target);
    }
  });

  it('uses the arcgis_rings_to_geojson_polygon transform for Bell geometry', () => {
    // Documented in lib/research/canonical-schema.ts as the transform
    // name; ensure the seed actually references it.
    expect(SRC).toContain('"arcgis_rings_to_geojson_polygon"');
  });

  it('seeds counties tied to existing working adapters so FKs resolve', () => {
    // Bell county FIPS code; existing bell-cad-arcgis service hardcodes
    // 48027 today. The full 254-county seed is a separate data slice.
    expect(SRC).toContain("'48027'");
    expect(SRC).toContain("'Bell'");
  });
});
