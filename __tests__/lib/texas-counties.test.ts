// __tests__/lib/texas-counties.test.ts
//
// The county list, and the forms that ask for one.
//
// ── WHY THIS IS WORTH A TEST ────────────────────────────────────────────────────────────────────
//
// In September 2026 a potential customer near Canyon Lake rang the office to say the quote form
// would not let them submit: their county was not in the list. Canyon Lake is in COMAL COUNTY, and
// the calculator shipped a REQUIRED <select> of eleven counties plus "Other (specify below)". That
// is a real customer, lost, to a dropdown.
//
// The failure is invisible in every way a bug normally is not: it typechecks, it renders, it lints,
// and every automated check passes, because the form works perfectly — for the eleven counties
// somebody happened to type in. Only a person standing in the 243rd county finds it, and they find
// it by leaving.
//
// So this file asserts the two things that would have caught it:
//
//   · the list is ALL 254 counties, spelled the way the state spells them; and
//   · no county field anywhere carries a short hard-coded option list ever again.
//
// The list itself comes from the U.S. Census Bureau's 2020 FIPS file, machine-read rather than
// typed — see the header of lib/geo/texas-counties.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  TEXAS_COUNTIES,
  TEXAS_COUNTY_COUNT,
  TEXAS_COUNTY_DATALIST_ID,
  normalizeCounty,
  isTexasCounty,
  matchCounties,
  canonicalizeCountyInput,
} from '@/lib/geo/texas-counties';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('TEXAS_COUNTIES — the list itself', () => {
  it('has exactly 254 counties, which is how many Texas has', () => {
    expect(TEXAS_COUNTIES).toHaveLength(254);
    expect(TEXAS_COUNTY_COUNT).toBe(254);
    expect(TEXAS_COUNTIES).toHaveLength(TEXAS_COUNTY_COUNT);
  });

  it('contains no duplicates', () => {
    const seen = new Map<string, number>();
    for (const name of TEXAS_COUNTIES) seen.set(name, (seen.get(name) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name);
    expect(dupes, 'duplicated county names').toEqual([]);
  });

  it('is sorted A→Z, case-insensitively', () => {
    // Re-derived here rather than trusting the file's own ordering. Case-insensitive matters:
    // a raw code-unit sort puts "DeWitt" before "Deaf Smith", because 'W' < 'e' in ASCII.
    const sorted = [...TEXAS_COUNTIES].sort((a, b) => {
      const x = a.toLowerCase();
      const y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    expect(TEXAS_COUNTIES).toEqual(sorted);
  });

  it('stores plain names, with no "County" suffix and no stray whitespace', () => {
    const suffixed = TEXAS_COUNTIES.filter((n) => /\bcounty\b/i.test(n));
    expect(suffixed, 'names that still carry the word "County"').toEqual([]);
    const untidy = TEXAS_COUNTIES.filter((n) => n !== n.trim() || /\s{2,}/.test(n));
    expect(untidy, 'names with leading, trailing or doubled whitespace').toEqual([]);
    const empty = TEXAS_COUNTIES.filter((n) => n.length === 0);
    expect(empty).toEqual([]);
  });

  it('spells the ones people get wrong exactly right', () => {
    // These end up on a survey's cover letter. "Mclennan" and "Dewitt" are wrong, not stylistic.
    const exact = [
      'DeWitt',
      'McCulloch',
      'McLennan',
      'McMullen',
      'Val Verde',
      'Palo Pinto',
      'Jim Hogg',
      'Jim Wells',
      'La Salle',
      'Live Oak',
      'Deaf Smith',
      'Red River',
      'San Augustine',
      'San Saba',
      'San Jacinto',
      'Tom Green',
      'Fort Bend',
    ];
    for (const name of exact) {
      expect(TEXAS_COUNTIES, `${name} must be present, spelled exactly like this`).toContain(name);
    }
  });

  it('keeps the three San counties distinct from one another', () => {
    // San Augustine, San Saba and San Jacinto are three different places three hundred miles
    // apart, and a list that has collapsed two of them would still pass a bare count check.
    const sans = TEXAS_COUNTIES.filter((n) => n.startsWith('San '));
    expect(sans).toEqual(['San Augustine', 'San Jacinto', 'San Patricio', 'San Saba']);
  });
});

describe('the Comal County regression — the customer near Canyon Lake', () => {
  // Named after the lead this cost. If this test ever goes red, the same phone call is coming.
  it('lists Comal, so the customer from Canyon Lake can choose their county', () => {
    expect(TEXAS_COUNTIES).toContain('Comal');
    expect(isTexasCounty('Comal')).toBe(true);
  });

  it('accepts every spelling of Comal that a person would actually type', () => {
    expect(normalizeCounty('Comal')).toBe('Comal');
    expect(normalizeCounty('comal')).toBe('Comal');
    expect(normalizeCounty('COMAL')).toBe('Comal');
    expect(normalizeCounty('  Comal  ')).toBe('Comal');
    expect(normalizeCounty('comal county')).toBe('Comal');
    expect(normalizeCounty('Comal County')).toBe('Comal');
    expect(normalizeCounty('COMAL COUNTY')).toBe('Comal');
  });

  it('offers Comal from a partial type-ahead, the way the field is actually used', () => {
    expect(matchCounties('com')).toContain('Comal');
    expect(matchCounties('Comal', 5)).toEqual(['Comal']);
  });
});

describe('normalizeCounty', () => {
  it('returns the canonical capitalisation, not the input casing', () => {
    expect(normalizeCounty('mclennan')).toBe('McLennan');
    expect(normalizeCounty('DEWITT')).toBe('DeWitt');
    expect(normalizeCounty('deaf smith')).toBe('Deaf Smith');
    expect(normalizeCounty('val verde county')).toBe('Val Verde');
    expect(normalizeCounty('fort bend')).toBe('Fort Bend');
  });

  it('strips a trailing "County", in any case, with any surrounding whitespace', () => {
    expect(normalizeCounty('Bell County')).toBe('Bell');
    expect(normalizeCounty('bell   county')).toBe('Bell');
    expect(normalizeCounty('\tBell County\n')).toBe('Bell');
    expect(normalizeCounty('Bell Co.')).toBe('Bell');
    expect(normalizeCounty('Bell Co')).toBe('Bell');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeCounty('Palo   Pinto')).toBe('Palo Pinto');
    expect(normalizeCounty(' jim  wells county ')).toBe('Jim Wells');
  });

  it('rejects things that are not Texas counties', () => {
    expect(normalizeCounty('Nowhere')).toBeNull();
    expect(normalizeCounty('Nowhere County')).toBeNull();
    expect(normalizeCounty('')).toBeNull();
    expect(normalizeCounty('   ')).toBeNull();
    expect(normalizeCounty('County')).toBeNull();
    expect(normalizeCounty(null)).toBeNull();
    expect(normalizeCounty(undefined)).toBeNull();
    // A real county in a different state.
    expect(normalizeCounty('Maricopa')).toBeNull();
  });

  it('round-trips every county in the list, plain and suffixed', () => {
    for (const name of TEXAS_COUNTIES) {
      expect(normalizeCounty(name)).toBe(name);
      expect(normalizeCounty(`${name} County`)).toBe(name);
      expect(normalizeCounty(name.toUpperCase())).toBe(name);
      expect(normalizeCounty(name.toLowerCase())).toBe(name);
    }
  });
});

describe('isTexasCounty', () => {
  it('agrees with normalizeCounty', () => {
    expect(isTexasCounty('comal county')).toBe(true);
    expect(isTexasCounty('McMullen')).toBe(true);
    expect(isTexasCounty('Nowhere')).toBe(false);
    expect(isTexasCounty('')).toBe(false);
    expect(isTexasCounty(undefined)).toBe(false);
  });
});

describe('matchCounties', () => {
  it('puts prefix matches before mere contains matches', () => {
    const results = matchCounties('mc', 10);
    expect(results.slice(0, 3)).toEqual(['McCulloch', 'McLennan', 'McMullen']);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(matchCounties('  VAL  ', 3)).toContain('Val Verde');
    expect(matchCounties('jim', 5)).toEqual(['Jim Hogg', 'Jim Wells']);
  });

  it('honours the limit', () => {
    expect(matchCounties('a', 4)).toHaveLength(4);
    expect(matchCounties('', 3)).toEqual(['Anderson', 'Andrews', 'Angelina']);
    expect(matchCounties('bell', 0)).toEqual([]);
  });

  it('finds a contains-only match nothing starts with', () => {
    expect(matchCounties('zavala', 5)).toEqual(['Zavala']);
    expect(matchCounties('cogdoch', 5)).toEqual(['Nacogdoches']);
  });

  it('returns an empty list for a query no county matches', () => {
    expect(matchCounties('qqqq', 10)).toEqual([]);
  });
});

describe('canonicalizeCountyInput — what actually gets stored', () => {
  it('stores the canonical name whenever the input is recognisable', () => {
    expect(canonicalizeCountyInput('comal county')).toBe('Comal');
    expect(canonicalizeCountyInput(' MCLENNAN ')).toBe('McLennan');
  });

  it('never destroys an unrecognised answer — a typo is for a human to read, not a rejection', () => {
    // The owner's standing rule: the firm travels for larger jobs and the OFFICE decides coverage,
    // not the form. So an unfamiliar spelling is kept, tidied, and passed along.
    expect(canonicalizeCountyInput('Commal')).toBe('Commal');
    expect(canonicalizeCountyInput('  not  sure  ')).toBe('not sure');
    expect(canonicalizeCountyInput('')).toBe('');
    expect(canonicalizeCountyInput(undefined)).toBe('');
  });
});

describe('no form hard-codes a short county list any more', () => {
  const CALCULATOR_TYPES = 'app/components/surveyCalculatorTypes.ts';

  it('the calculator county field carries no options list at all', () => {
    const src = read(CALCULATOR_TYPES);
    const match = src.match(/export const PROPERTY_COUNTY_FIELD: FormField = \{[\s\S]*?\n\};/);
    expect(match, 'PROPERTY_COUNTY_FIELD should still exist').not.toBeNull();
    const field = match![0];

    // The bug in one line: a required <select> whose options were an eleven-item allowlist.
    expect(field, 'the county field must not enumerate options').not.toMatch(/options\s*:/);
    expect(field, 'the county field must use the datalist-backed county type').toMatch(
      /type\s*:\s*'county'/,
    );
  });

  it('the "Other (specify below)" escape hatch is gone', () => {
    // It only ever existed because the list was short. With all 254 listed it is not a kindness,
    // it is a second required field in front of someone the form has already told to go away.
    const types = read(CALCULATOR_TYPES);
    expect(types).not.toMatch(/OTHER_COUNTY_FIELD/);
    // The option itself, not the word — the prose above PROPERTY_COUNTY_FIELD names it on purpose,
    // so that whoever reads this file next knows what was removed and why.
    expect(types).not.toMatch(/label:\s*'Other \(specify below\)'/);
    expect(types).not.toMatch(/showWhen:\s*\{\s*field:\s*'propertyCounty'/);
    expect(read('app/components/surveyConfigs.ts')).not.toMatch(/OTHER_COUNTY_FIELD/);
    expect(read('app/components/SurveyCalculator.tsx')).not.toMatch(/otherCounty/);
  });

  it('every public form that asks for a county wires up the shared datalist', () => {
    // Found by listing them, because there are only three and each one is a lead surface: if a
    // fourth is added, the reviewer should have to think about this line.
    const forms = [
      'app/page.tsx',
      'app/contact/page.tsx',
      'app/components/SurveyCalculator.tsx',
    ];
    for (const rel of forms) {
      const src = read(rel);
      expect(src, `${rel} should render the shared county datalist`).toMatch(/TexasCountyDatalist/);
      expect(src, `${rel} should bind its county input to that datalist`).toMatch(
        /list=\{TEXAS_COUNTY_DATALIST_ID\}/,
      );
      expect(src, `${rel} should store the canonical county name`).toMatch(
        /canonicalizeCountyInput/,
      );
    }
  });

  it('the datalist component lists all 254 and nothing narrower', () => {
    const src = read('app/components/TexasCountyDatalist.tsx');
    expect(src).toMatch(/TEXAS_COUNTIES\.map/);
    expect(src).toMatch(new RegExp(TEXAS_COUNTY_DATALIST_ID));
  });

  it('no page under app/ enumerates counties itself', () => {
    // A second list is how the first one drifted, and a list inside a page is a list that will be
    // shorter than 254. Any file under app/ naming five or more counties in one literal is almost
    // certainly a copy and should import TEXAS_COUNTIES instead.
    //
    // Scoped to app/ deliberately. lib/ holds several lists that are a DIFFERENT fact and are
    // rightly short: `SERVICE_AREA_COUNTIES` in lib/seo/business.ts is the marketing coverage
    // claim, and the receptionist and research modules carry their own operational data. Those are
    // not the county field on a quote form, which is what cost the business the lead.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.next', '.git', 'dist'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        // Internal staff tooling, not a customer-facing intake form.
        if (rel.startsWith('app/admin/')) continue;
        const src = fs.readFileSync(full, 'utf8');
        // Five or more quoted county names inside one bracketed literal.
        const literals = src.match(/\[[^[\]]{20,4000}\]/g) ?? [];
        for (const literal of literals) {
          const quoted = literal.match(/['"]([A-Z][A-Za-z ]{2,20})(?: County)?['"]/g) ?? [];
          const counties = quoted.filter((q) =>
            isTexasCounty(q.slice(1, -1)),
          );
          if (counties.length >= 5) {
            offenders.push(rel);
            break;
          }
        }
      }
    };
    walk(path.join(ROOT, 'app'));
    expect(
      offenders,
      'these pages enumerate counties themselves — import TEXAS_COUNTIES instead',
    ).toEqual([]);
  });
});
