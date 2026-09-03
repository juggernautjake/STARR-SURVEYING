import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { countyKey, lookupByCounty } from '../research/county-key.js';
import { getClerkByCountyName } from '../adapters/clerk-registry.js';
import { TEXAS_COUNTIES } from '../lib/county-fips.js';

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

  // ── A LIST OF KNOWN LINES IS NOT A GUARD ────────────────────────────────────────────────────
  //
  // The two tests above name three files. A NINTH site of the same defect was found the next day
  // in `index.ts`:
  //
  //     const key = county.trim().toLowerCase().replace(/\s+county$/, '');
  //     const cfg = (BIS_CONFIGS as any)[key];
  //
  // It handled the WORD "County" and not the space, so "Fort Bend" became "fort bend" against a
  // key of `fort_bend` — and this is the function that generalises imagery capture past Bell to
  // the nineteen counties with a GIS viewer. It was invisible to the tests above because it does
  // not spell `.toLowerCase()` at the index: it wrote its own normaliser two lines earlier.
  //
  // Copying a rule is how a rule drifts. This scans the whole worker for the SHAPE — a county name
  // being hand-normalised, or a config table being indexed by anything other than the helper —
  // rather than for the lines somebody already found.

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === '__tests__' || e.name === 'node_modules' || e.name === 'dist') continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(rel));
      else if (e.name.endsWith('.ts')) out.push(rel);
    }
    return out;
  }
  const WORKER_FILES = walk('.').map((f) => f.replace(/^\.\//, ''));

  it('CONTROL: the sweep reads real files', () => {
    expect(WORKER_FILES.length).toBeGreaterThan(100);
    expect(WORKER_FILES).toContain('index.ts');
    expect(WORKER_FILES).toContain('research/county-key.ts');
  });

  // ── WHICH TABLES ARE COUNTY-KEYED IS A QUESTION THE DATA ANSWERS ────────────────────────────
  //
  // The first version of this guard looked for the SYNTAX — `TABLE[…toLowerCase()…]` — and for
  // hand-rolled `replace(/\s+county$/)`. Both were wrong in opposite directions on the same run:
  //
  //   · The syntax probe flagged `SOURCE_FILE_MAP[sourceKey]` in timeline-tracker, which maps log
  //     source names to file paths and has nothing to do with counties.
  //   · The `replace` probe flagged TWELVE files, nearly all of them building a URL slug or a
  //     display name, which is a perfectly good reason to strip the word.
  //
  // A guard with that much noise gets baselined and then stops meaning anything. So the question
  // is not "does this line look like the defect" but "is this table keyed by county at all" — and
  // the table's own keys answer it. A table whose keys are Texas county names must be reached
  // through the helper; every other table is none of this test's business.
  const COUNTY_KEYS = new Set(TEXAS_COUNTIES.map((c) => c.key));

  /** Tables in the worker whose literal keys are Texas counties, as `file → NAME`. */
  function countyKeyedTables(): Array<{ file: string; name: string; keys: string[] }> {
    const out: Array<{ file: string; name: string; keys: string[] }> = [];
    for (const f of WORKER_FILES) {
      const s = code(f);
      for (const m of s.matchAll(/(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*:\s*Record<string,[\s\S]*?=\s*\{/g)) {
        // Read to the matching close brace so a nested object cannot end the scan early.
        let depth = 1;
        let i = m.index! + m[0].length;
        for (; i < s.length && depth > 0; i++) {
          if (s[i] === '{') depth++;
          else if (s[i] === '}') depth--;
        }
        const body = s.slice(m.index! + m[0].length, i);
        // Top-level keys only: `  key: {` or `  'key': {` at one indent level.
        const keys = [...body.matchAll(/^ {2}'?([a-z][a-z0-9_]*)'?\s*:/gm)].map((k) => k[1]);
        const countyish = keys.filter((k) => COUNTY_KEYS.has(k));
        if (countyish.length >= 2) out.push({ file: f, name: m[1], keys: countyish });
      }
    }
    return out;
  }

  const TABLES = countyKeyedTables();

  it('CONTROL: the county-keyed tables are found by their contents', () => {
    // If this finds nothing, every assertion below is vacuous — the failure mode where a guard
    // reporting zero problems never looked at anything.
    const names = TABLES.map((t) => t.name);
    expect(names, `found: ${names.join(', ')}`).toContain('BIS_CONFIGS');
    expect(names).toContain('KOFILE_CONFIGS');
    expect(names).toContain('PLAT_REPO_REGISTRY');
    // And it must NOT sweep in a table that merely looks like config.
    expect(names).not.toContain('SOURCE_FILE_MAP');
  });

  it('every county-keyed table is reached through the helper', () => {
    const offenders: string[] = [];
    for (const f of WORKER_FILES) {
      if (f === 'research/county-key.ts') continue;
      const s = code(f);
      for (const { name, file: declaredIn } of TABLES) {
        // ── A NAME COLLISION IS NOT A DEFECT ────────────────────────────────────────────────
        //
        // `kofile-clerk-adapter.ts` declares its OWN `KOFILE_CONFIGS`, keyed by FIPS — '48027',
        // not 'bell'. Indexing it with a FIPS is correct, and the first version of this test
        // reported it purely because bell-clerk.ts has a county-keyed table of the same name.
        // A file that declares the name owns it; only the declaring file's own table is checked
        // here, plus files that import it.
        if (f !== declaredIn && new RegExp(`\\bconst\\s+${name}\\b`).test(s)) continue;
        // Three forms, because the defect has appeared as all three:
        //   TABLE[expr]                                    bis-cad, pipeline, bell-clerk
        //   (TABLE as any)[key]                            index.ts's gisBaseUrlFor
        //   hasOwnProperty.call(TABLE, expr)               hasKofileConfig, hasPlatRepository
        const patterns: Array<[RegExp, string]> = [
          [new RegExp(`${name}\\s*(?:as\\s+\\w+\\s*\\)?\\s*)?\\[([^\\]]*)\\]`, 'g'), '[…]'],
          [new RegExp(`hasOwnProperty\\.call\\(\\s*${name}\\s*,([^)]*)\\)`, 'g'), 'hasOwnProperty'],
        ];
        for (const [re, form] of patterns) {
          for (const m of s.matchAll(re)) {
            const arg = m[1].trim();
            // A string literal is a fixed key the author wrote — `BIS_CONFIGS['bell']` is fine.
            if (/^['"`][a-z0-9_]+['"`]$/i.test(arg)) continue;
            // The helper's own output is already normalised.
            if (/countyKey\(/.test(arg)) continue;
            offenders.push(`${f}: ${name}${form === '[…]' ? `[${arg}]` : ` via hasOwnProperty(${arg})`}`);
          }
        }
      }
    }
    expect(
      offenders,
      offenders.length
        ? 'A county-keyed table reached without countyKey/lookupByCounty. "Fort Bend".toLowerCase() '
          + `is "fort bend"; the key is "fort_bend":\n  ${offenders.join('\n  ')}`
        : '',
    ).toEqual([]);
  });

  it('the GIS viewer lookup — the ninth site — goes through the helper', () => {
    // Asserting the caller. This is the line that decides whether a county gets its CAD GIS map
    // photographed at all, and it silently answered "no viewer" for six counties that have one.
    expect(code('index.ts')).toContain('lookupByCounty(BIS_CONFIGS, county)');
  });
});
