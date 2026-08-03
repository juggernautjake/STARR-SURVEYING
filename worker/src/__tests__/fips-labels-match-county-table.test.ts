// worker/src/__tests__/fips-labels-match-county-table.test.ts
//
// A ratchet for a defect that has now been found three times in this codebase: a county portal
// filed under the WRONG FIPS code.
//
//   Lampasas   filed under 48283 — which is La Salle, 250 miles south   (fixed when written)
//   Kimble     filed under 48265 — which is Kerr                        (fixed 2026-08-03)
//   Menard     filed under 48321 — which is Matagorda, on the Gulf      (fixed 2026-08-03)
//   Rockwall, Freestone, Garza, Haskell, Lynn, Jasper, Sabine,
//   San Augustine, San Jacinto, Foard — all likewise                    (fixed 2026-08-03)
//
// It is worth a permanent test because of the shape of the harm. A misfiled entry is wrong in two
// directions at once and neither is visible:
//
//   * the county it MEANT to cover (Kimble) silently has no adapter, and
//   * an unrelated county (Kerr) is reported as covered by a portal that is not its own.
//
// The second is the dangerous one. `paid-platform-registry` builds `coveredFIPS` straight from
// these sets, so a research run for Kerr would be told a platform covers it, and — had the vendor
// been reachable — would have searched Kimble County's records and returned them as Kerr's. That is
// this project's central defect wearing yet another costume: an unknown rendered as an answer, and
// here a wrong answer rendered as a confident one.
//
// `worker/src/lib/county-fips.ts` is the authoritative table (all 254, checked against the FIPS
// standard). Every adapter's FIPS→name claim is asserted against it below.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { TEXAS_COUNTIES } from '../lib/county-fips.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADAPTERS = resolve(HERE, '../adapters');

const NAME_BY_FIPS = new Map(TEXAS_COUNTIES.map((c) => [c.fips, c.name]));
const FIPS_BY_NAME = new Map(TEXAS_COUNTIES.map((c) => [norm(c.name), c.fips]));

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/\s+county$/, '').replace(/[^a-z]/g, '');
}

interface Claim {
  fips: string;
  claimed: string;
  where: string;
}

/** Pull every "this FIPS is this county" claim out of an adapter source file.
 *
 *  Reading the source rather than importing the configs is deliberate: the claim lives partly in
 *  comments and slugs, and a config whose key and countyDisplayName disagree is exactly the bug. */
function claimsIn(file: string): Claim[] {
  const text = readFileSync(resolve(ADAPTERS, file), 'utf8');
  const out: Claim[] = [];

  //  '48265': {  // Kimble County
  for (const m of text.matchAll(/'(48\d{3})'\s*:\s*\{[^\n]*?\/\/\s*([A-Za-z .']+?)\s*$/gm)) {
    out.push({ fips: m[1], claimed: m[2], where: `${file} key-comment` });
  }
  //  '48401': 'Rockwall',
  for (const m of text.matchAll(/'(48\d{3})'\s*:\s*'([A-Za-z ]+)'/g)) {
    out.push({ fips: m[1], claimed: m[2], where: `${file} name-map` });
  }
  //  '48027',  // Bell
  for (const m of text.matchAll(/'(48\d{3})',\s*\/\/\s*([A-Za-z .']+?)\s*$/gm)) {
    out.push({ fips: m[1], claimed: m[2], where: `${file} set-comment` });
  }
  //  Falls: { subdomain: 'i2i', fips: '48145' }
  for (const m of text.matchAll(/([A-Za-z ]+):\s*\{[^}]*?fips:\s*'(48\d{3})'/g)) {
    out.push({ fips: m[2], claimed: m[1], where: `${file} fips-field` });
  }
  //  '48265': { … countyDisplayName: 'Kimble County' }
  for (const m of text.matchAll(/'(48\d{3})'\s*:\s*\{[\s\S]{0,400}?countyDisplayName:\s*'([^']+)'/g)) {
    out.push({ fips: m[1], claimed: m[2], where: `${file} countyDisplayName` });
  }
  return out;
}

/** Every file that maps a FIPS code to a county. Add new adapters here — the cost of forgetting is
 *  a county's records attributed to a different county. */
const FILES = [
  'henschen-clerk-adapter.ts',
  'idocket-clerk-adapter.ts',
  'fidlar-clerk-adapter.ts',
  'tyler-clerk-adapter.ts',
  'countyfusion-adapter.ts',
  'edoctec-clerk-adapter.ts',
  'tyler-eagle-discovery.ts',
  'uslandrecords-discovery.ts',
  'aumentum-clerk-adapter.ts',
  'idocmarket-adapter.ts',
];

describe('every adapter FIPS label agrees with the authoritative county table', () => {
  it('the authoritative table itself holds all 254 Texas counties', () => {
    expect(TEXAS_COUNTIES).toHaveLength(254);
    expect(new Set(TEXAS_COUNTIES.map((c) => c.fips)).size).toBe(254);
  });

  for (const file of FILES) {
    it(`${file} files every county under its own FIPS`, () => {
      const wrong: string[] = [];
      for (const { fips, claimed, where } of claimsIn(file)) {
        const truth = NAME_BY_FIPS.get(fips);
        const c = norm(claimed);
        // Skip labels that are not county names (vendor names, 'TexasFile', etc.).
        if (!c || !FIPS_BY_NAME.has(c)) continue;
        if (!truth) {
          wrong.push(`${where}: ${fips} is not a Texas FIPS code (labelled "${claimed}")`);
          continue;
        }
        if (norm(truth) !== c) {
          wrong.push(
            `${where}: filed "${claimed}" under ${fips}, but ${fips} is ${truth} — ` +
              `${claimed} is ${FIPS_BY_NAME.get(c)}. Two counties are wrong: ${claimed} has no adapter, ` +
              `and ${truth} claims one that is not its own.`,
          );
        }
      }
      expect(wrong).toEqual([]);
    });
  }

  it('finds a real number of claims — a regex that matches nothing would pass vacuously', () => {
    // Without this, gutting the patterns above would turn every test in this file green.
    const total = FILES.reduce((n, f) => n + claimsIn(f).length, 0);
    expect(total).toBeGreaterThan(100);
  });
});
