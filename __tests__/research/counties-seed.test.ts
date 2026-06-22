// __tests__/research/counties-seed.test.ts
//
// Source-lock for seeds/372_research_counties_texas_full.sql.
// Locks two invariants:
//   1. The seed produces exactly 254 county rows (the canonical count
//      of Texas counties; missing one is a real bug).
//   2. Every odd FIPS code 48001-48507 (the Texas county code range)
//      is present exactly once.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'seeds', '372_research_counties_texas_full.sql'),
  'utf8',
);

/** Pull every ('48NNN', '<Name>', 'TX', N) tuple out of the seed file. */
function extractRows(): Array<{ fips: string; name: string; tier: number }> {
  const re = /\(\s*'(48\d{3})'\s*,\s*'([^']+)'\s*,\s*'TX'\s*,\s*(\d)\s*\)/g;
  const rows: Array<{ fips: string; name: string; tier: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(SRC)) !== null) {
    rows.push({ fips: m[1]!, name: m[2]!, tier: Number(m[3]) });
  }
  return rows;
}

describe('seeds/372 — full Texas county roster', () => {
  const rows = extractRows();
  const fipsSet = new Set(rows.map((r) => r.fips));

  it('contains all 254 Texas counties', () => {
    expect(rows.length).toBe(254);
    expect(fipsSet.size).toBe(254);
  });

  it('covers every odd FIPS in the Texas range 48001..48507', () => {
    const missing: string[] = [];
    for (let n = 1; n <= 507; n += 2) {
      const fips = `48${String(n).padStart(3, '0')}`;
      if (!fipsSet.has(fips)) missing.push(fips);
    }
    expect(missing).toEqual([]);
  });

  it('contains every key metro by name', () => {
    const names = new Set(rows.map((r) => r.name));
    for (const expected of [
      'Harris', 'Dallas', 'Tarrant', 'Bexar', 'Travis', 'Collin',
      'Denton', 'Fort Bend', 'Hidalgo', 'El Paso', 'Williamson',
      'Montgomery', 'Cameron', 'Bell', 'Brazoria', 'Galveston',
      'Lubbock', 'Nueces', 'McLennan', 'Webb',
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it('assigns Tier 1 to the canonical top metros', () => {
    const tier1 = new Set(rows.filter((r) => r.tier === 1).map((r) => r.name));
    for (const expected of [
      'Harris', 'Dallas', 'Tarrant', 'Bexar', 'Travis', 'Collin',
      'Denton', 'Fort Bend', 'Hidalgo', 'El Paso',
    ]) {
      expect(tier1.has(expected)).toBe(true);
    }
  });

  it('uses tier values 1-4 only', () => {
    for (const r of rows) {
      expect(r.tier).toBeGreaterThanOrEqual(1);
      expect(r.tier).toBeLessThanOrEqual(4);
    }
  });

  it('is wrapped in a transaction and idempotent', () => {
    expect(SRC).toMatch(/^BEGIN;/m);
    expect(SRC).toMatch(/COMMIT;\s*$/m);
    expect(SRC).toMatch(/ON CONFLICT \(fips\) DO NOTHING/);
  });

  it('has no duplicate FIPS codes', () => {
    expect(fipsSet.size).toBe(rows.length);
  });
});
