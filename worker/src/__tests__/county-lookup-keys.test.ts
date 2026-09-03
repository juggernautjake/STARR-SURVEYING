import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { countyKey, lookupByCounty } from '../research/county-key.js';
import { getClerkByCountyName } from '../adapters/clerk-registry.js';

// ── SIX COUNTIES WERE UNREACHABLE BECAUSE OF A SPACE ────────────────────────────────────────────
//
// Every config table here is keyed in snake_case — `fort_bend`, `tom_green`, `van_zandt`,
// `san_saba`, `palo_pinto`, `san_jacinto` — and every lookup read `TABLE[county.toLowerCase()]`.
// `"Fort Bend".toLowerCase()` is `"fort bend"`, with a space. It has never matched.
//
// Six counties with fully configured appraisal districts and clerk portals returned "no config for
// this county" — a finding about our table, reported as a finding about the county.
//
// And one the audit did not mention: `"Bell County"` misses too, because the raw lookup never
// strips the word. `CountyNote` in the create form suggests canonical names that operators
// reasonably type that way.

describe('countyKey normalises the way resolveCounty does', () => {
  it('CONTROL: a single-word county was already fine', () => {
    // Proves the lookup works at all, so the misses below are real rather than a broken test.
    expect(countyKey('Bell')).toBe('bell');
  });

  it('THE DEFECT: multi-word counties collapse to underscores', () => {
    expect(countyKey('Fort Bend')).toBe('fort_bend');
    expect(countyKey('Tom Green')).toBe('tom_green');
    expect(countyKey('Van Zandt')).toBe('van_zandt');
    expect(countyKey('San Saba')).toBe('san_saba');
    expect(countyKey('Palo Pinto')).toBe('palo_pinto');
    expect(countyKey('San Jacinto')).toBe('san_jacinto');
  });

  it('and the word "County" is dropped — which the raw lookup never did', () => {
    expect(countyKey('Bell County')).toBe('bell');
    expect(countyKey('Fort Bend County')).toBe('fort_bend');
    expect(countyKey('  FORT-BEND  ')).toBe('fort_bend');
  });

  it('an already-normalised key passes through unchanged', () => {
    // Safe to apply to values that came from a config table rather than a person.
    expect(countyKey('fort_bend')).toBe('fort_bend');
  });

  it('lookupByCounty finds what the raw expression could not', () => {
    const table = { bell: 'B', fort_bend: 'FB' };
    expect(lookupByCounty(table, 'Fort Bend')).toBe('FB');
    expect(lookupByCounty(table, 'Fort Bend County')).toBe('FB');
    // The old expression, for contrast — keeping it here stops someone "simplifying" back to it.
    expect(table['Fort Bend'.toLowerCase() as keyof typeof table]).toBeUndefined();
  });

  it('an empty county finds nothing rather than the first entry', () => {
    expect(lookupByCounty({ bell: 'B' }, '')).toBeUndefined();
    expect(lookupByCounty({ bell: 'B' }, null)).toBeUndefined();
  });
});

describe('the clerk fallback stops inventing a county', () => {
  it('resolves a REAL FIPS for a county not in the registry', () => {
    // It returned '000' unconditionally. There is no county 000, and every consumer that keys on
    // FIPS then received a value that cannot identify a place — from a function whose entire job is
    // to identify one.
    const e = getClerkByCountyName('Kenedy');
    expect(e.fallback).toBe(true);
    expect(e.fips).not.toBe('000');
    expect(e.fips).toMatch(/^\d{3}$/);
  });

  it('in the THREE-DIGIT form this table compares with ===', () => {
    // `getClerkByFIPS` normalises with `fips.replace(/^48/,'').padStart(3,'0')` and compares
    // exactly, so a five-digit value from resolveCounty would never match anything. Caught by
    // reading the comparison instead of assuming both halves used one format.
    const e = getClerkByCountyName('Kenedy');
    expect(e.fips.length).toBe(3);
    expect(e.fips.startsWith('48')).toBe(false);
  });

  it("'000' now means only 'not a Texas county'", () => {
    expect(getClerkByCountyName('Notacounty').fips).toBe('000');
  });

  it('CONTROL: a county IN the registry is unaffected', () => {
    const e = getClerkByCountyName('Bell');
    expect(e.fallback).toBeUndefined();
    expect(e.fips).toBe('027');
  });
});

describe('every run-path lookup is normalised — assert the CALLERS', () => {
  const ROOT = path.join(__dirname, '..');
  const code = (p: string) => {
    const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const s = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
    if (!/\b(import|export|const)\b/.test(s)) throw new Error(`stripping destroyed ${p}`);
    return s;
  };

  it('no raw TABLE[county.toLowerCase()] survives on the run path', () => {
    for (const f of ['services/bis-cad.ts', 'services/bell-clerk.ts', 'services/pipeline.ts']) {
      expect(code(f), `${f} still has a raw lookup`).not.toMatch(/CONFIGS\[[a-zA-Z.]*county\.toLowerCase\(\)\]/);
    }
  });

  it('and they all go through the shared helper', () => {
    for (const f of ['services/bis-cad.ts', 'services/bell-clerk.ts', 'services/pipeline.ts']) {
      expect(code(f), `${f} does not use lookupByCounty`).toContain('lookupByCounty(');
    }
  });
});
