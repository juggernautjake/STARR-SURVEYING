// Nine portals located, none claimed (plan R39).

import { describe, it, expect } from 'vitest';
import {
  TYLER_EAGLE_PORTALS,
  TYLER_FIELDS,
  TYLER_RESULTS_PROVEN,
  TYLER_SEARCH_BUTTON,
  narrowByYear,
  readSearchOutcome,
  tylerEagleUrl,
} from '../adapters/tyler-eagle-discovery.js';
import { getClerkSystem, isVendorProven } from '../services/clerk-registry.js';

describe('the corrected URL pattern', () => {
  it('carries the word county, which the R38 guess omitted', () => {
    // R38 probed `mclennantx-web` and concluded the pattern does not generalise. The real host is
    // `mclennancountytx-web` — the conclusion was an artefact of the guess.
    expect(tylerEagleUrl('McLennan')).toBe('https://mclennancountytx-web.tylerhost.net/web/');
  });

  it('keeps Williamson\'s different app path', () => {
    // Eight counties use /web/; Williamson uses /williamsonweb/. A single hardcoded path loses it.
    expect(tylerEagleUrl('Williamson')).toBe('https://williamsoncountytx-web.tylerhost.net/williamsonweb/');
  });

  it('found nine live deployments', () => {
    expect(Object.keys(TYLER_EAGLE_PORTALS)).toHaveLength(9);
    expect(TYLER_EAGLE_PORTALS.McLennan.fips).toBe('48309');
  });

  it('returns null for a county with no known deployment', () => {
    expect(tylerEagleUrl('Coryell')).toBeNull();
  });
});

describe('results were driven, so the counties route', () => {
  it('marks Tyler results proven', () => {
    // SMITH JAMES, 2025, McLennan → 14 documents, read off the rendered page.
    expect(TYLER_RESULTS_PROVEN).toBe(true);
  });

  it('routes all nine counties to Tyler', () => {
    for (const [county, { fips }] of Object.entries(TYLER_EAGLE_PORTALS)) {
      expect(getClerkSystem(fips), county).toBe('tyler');
    }
  });

  it('puts Tyler in the proven vendors', () => {
    expect(isVendorProven('tyler')).toBe(true);
  });
});

describe('totalPages: 0 means TOO MANY, not none', () => {
  const ZERO = { validationMessages: {}, totalPages: 0, currentPage: 1 };
  const OVER_LIMIT_PAGE = 'We found more documents than the maximum allowed. It may be necessary to refine your search.';

  it('reads the over-limit banner rather than the count', () => {
    // This file originally recorded that zero as "no records" — the exact inversion this project
    // exists to prevent. The JSON cannot tell the two apart; only the page can.
    const o = readSearchOutcome(ZERO, 'McLennan', OVER_LIMIT_PAGE);
    expect(o.state).toBe('over_limit');
    expect(o.statement).toContain('OPPOSITE of an empty result');
    expect(o.statement).toContain('never be recorded as "no records found"');
  });

  it('tells the caller how to narrow', () => {
    expect(readSearchOutcome(ZERO, 'McLennan', OVER_LIMIT_PAGE).statement).toMatch(/date range, document type, fuller name/);
  });

  it('reports a genuine empty as empty, when the portal did NOT say over-limit', () => {
    const o = readSearchOutcome(ZERO, 'Hill', 'Showing page 1 of 1 for 0 Total Results');
    expect(o.state).toBe('empty');
    expect(o.statement).toContain('Genuinely empty');
  });

  it('distinguishes a rejected query from both', () => {
    const o = readSearchOutcome({ validationMessages: { field_RecDateID: 'bad date' }, totalPages: 0, currentPage: 1 }, 'Hill', '');
    expect(o.state).toBe('rejected');
    expect(o.statement).toContain('Not an empty index');
  });

  it('reports real results plainly', () => {
    const o = readSearchOutcome({ validationMessages: {}, totalPages: 7, currentPage: 1 }, 'McLennan', 'Showing page 1 of 7 for 340 Total Results');
    expect(o.state).toBe('has_results');
    expect(o).toMatchObject({ totalPages: 7 });
  });
});

describe('narrowing an over-limit search leaves no gaps', () => {
  it('tiles the range with contiguous windows', () => {
    // A gap between windows is a deed nobody sees — the same wrong answer as an empty result, only
    // harder to notice.
    const windows = narrowByYear(new Date(2000, 0, 1), new Date(2019, 11, 31), 5);
    expect(windows.length).toBeGreaterThan(1);
    for (let i = 1; i < windows.length; i++) {
      const prevEnd = windows[i - 1].to.getTime();
      const thisStart = windows[i].from.getTime();
      expect(thisStart - prevEnd).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
      expect(thisStart).toBeGreaterThan(prevEnd);
    }
  });

  it('never runs past the requested end', () => {
    const windows = narrowByYear(new Date(2020, 0, 1), new Date(2022, 5, 30), 5);
    expect(windows[windows.length - 1].to.getTime()).toBeLessThanOrEqual(new Date(2022, 5, 30).getTime());
  });

  it('covers the whole range from the first window to the last', () => {
    const from = new Date(1990, 0, 1);
    const to = new Date(2026, 6, 30);
    const w = narrowByYear(from, to, 5);
    expect(w[0].from.getTime()).toBe(from.getTime());
    expect(w[w.length - 1].to.getTime()).toBe(to.getTime());
  });

  it('returns nothing for an inverted range instead of looping', () => {
    expect(narrowByYear(new Date(2020, 0, 1), new Date(2010, 0, 1))).toEqual([]);
  });
});

describe('the field map read off the live form', () => {
  it('records the real ASP field names', () => {
    expect(TYLER_FIELDS.bothNames).toBe('field_BothNamesID');
    expect(TYLER_FIELDS.grantor).toBe('field_GrantorID');
    expect(TYLER_FIELDS.startDate).toBe('field_RecDateID_DOT_StartDate');
    expect(TYLER_FIELDS.docNumber).toBe('field_DocNumID');
  });

  it('pins the submit control by exact id', () => {
    // A looser id match opens the per-field help dialog instead, which is indistinguishable from a
    // search that returned nothing.
    expect(TYLER_SEARCH_BUTTON).toBe('a#searchButton');
  });
});
