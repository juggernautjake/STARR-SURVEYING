import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BIS_CONFIGS } from '../services/bis-cad.js';
import { getClerkSystem, KOFILE_FIPS_SET, EDOCTEC_FIPS_SET } from '../services/clerk-registry.js';
import { planCaptures } from '../research/capture-plan.js';

// A6 — the two counties the owner asked for, proven present at each layer they have to exist in.
//
// Structural only, and deliberately: a live portal test is not reproducible, and BOTH counties' CAD
// sites were unreachable during the reference runs of 2026-09-02 (plan §1.5). A test that goes to
// the county would have failed that day for a reason that has nothing to do with this code, and
// hammering small government servers on every CI run is the politeness rule this worker keeps.
//
// What IS checkable offline is the thing that was actually wrong: registries disagreeing with each
// other, and a county present in one table and absent from the next.

const COUNTIES = [
  { name: 'Milam',   key: 'milam',   fips: '48331', system: 'kofile'  as const, gis: 'milamcad'   },
  { name: 'Coryell', key: 'coryell', fips: '48099', system: 'edoctec' as const, gis: 'coryellcad' },
];

describe('Milam and Coryell are routed everywhere a run touches', () => {
  it('CONTROL: a county that is NOT configured behaves differently', () => {
    // Without this, every assertion below would also pass against a registry that answered "yes" to
    // everything — which is how a coverage test proves nothing.
    expect(BIS_CONFIGS['nonexistentcounty' as keyof typeof BIS_CONFIGS]).toBeUndefined();
    expect(getClerkSystem('48999')).toBe('texasfile'); // the fallback, not a county adapter
  });

  for (const c of COUNTIES) {
    describe(c.name, () => {
      it('has a CAD entry with a GIS viewer', () => {
        const cfg = BIS_CONFIGS[c.key as keyof typeof BIS_CONFIGS];
        expect(cfg, `${c.name} is missing from BIS_CONFIGS`).toBeTruthy();
        expect(cfg.baseUrl).toMatch(/^https:\/\//);
        expect(cfg.gisBaseUrl, `${c.name} has no GIS viewer to photograph`).toBeTruthy();
        expect(cfg.gisBaseUrl).toContain(c.gis);
      });

      it('routes to the clerk vendor it is actually served by', () => {
        // Coryell is the reason this assertion is here. adapters/clerk-registry.ts had it as a
        // Kofile stub on a dead URL while this registry has routed it to eDocTec since plan R39.
        expect(getClerkSystem(c.fips)).toBe(c.system);
      });

      it('is in the FIPS set its system reads', () => {
        const set = c.system === 'kofile' ? KOFILE_FIPS_SET : EDOCTEC_FIPS_SET;
        expect(set.has(c.fips)).toBe(true);
      });

      it('produces a cad_gis capture — the GIS map the owner asked for', () => {
        const plan = planCaptures({
          projectId: `proj-${c.key}`,
          county: c.name,
          latitude: 31.0,
          longitude: -97.0,
          gisBaseUrl: BIS_CONFIGS[c.key as keyof typeof BIS_CONFIGS].gisBaseUrl,
        });
        const gis = plan.captures.filter((x) => x.kind === 'cad_gis');
        expect(gis.length, `${c.name} plans no GIS capture`).toBeGreaterThan(0);
      });

      it('plans all three satellite zoom bands', () => {
        // "a zoomed out view, a medium zoom view, and then a closer up zoom view ... for every run".
        const plan = planCaptures({
          projectId: `proj-${c.key}-zoom`,
          county: c.name,
          latitude: 31.0,
          longitude: -97.0,
          gisBaseUrl: BIS_CONFIGS[c.key as keyof typeof BIS_CONFIGS].gisBaseUrl,
        });
        const zooms = new Set(
          plan.captures.filter((x) => x.zoom !== undefined && x.zoom !== null).map((x) => x.zoom),
        );
        expect(zooms.size, `${c.name} does not plan three distinct zooms`).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it('the county-name normaliser the worker uses finds both, including "X County"', () => {
    // index.ts strips a trailing " county" and lowercases before the lookup. A run whose county
    // arrives as "Milam County" must not silently lose its GIS viewer.
    const SRC = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');
    const at = SRC.indexOf('function gisBaseUrlFor');
    expect(at, 'gisBaseUrlFor is gone — the caller that supplies gisBaseUrl').toBeGreaterThan(-1);
    const fn = SRC.slice(at, at + 400);
    expect(fn).toContain('toLowerCase()');
    expect(fn, 'the trailing " County" is no longer stripped').toContain("county$/, ''");

    for (const c of COUNTIES) {
      const key = `${c.name} County`.trim().toLowerCase().replace(/\s+county$/, '');
      expect(BIS_CONFIGS[key as keyof typeof BIS_CONFIGS], `"${c.name} County" does not resolve`).toBeTruthy();
    }
  });
});
