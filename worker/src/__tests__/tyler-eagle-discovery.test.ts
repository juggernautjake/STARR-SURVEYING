// Nine portals located, none claimed (plan R39).

import { describe, it, expect } from 'vitest';
import {
  TYLER_EAGLE_PORTALS,
  TYLER_FIELDS,
  TYLER_RESULTS_PROVEN,
  TYLER_SEARCH_BUTTON,
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

describe('located is not the same as working', () => {
  it('does not mark Tyler results proven', () => {
    // The search POST answers totalPages=0 for a name the autocomplete proves is indexed.
    expect(TYLER_RESULTS_PROVEN).toBe(false);
  });

  it('keeps Tyler out of the proven vendors', () => {
    expect(isVendorProven('tyler')).toBe(false);
  });

  it('routes none of the nine counties to Tyler', () => {
    // Listing a county as covered on the strength of a 200 and a well-formed form is exactly how
    // the platform came to claim 53 Kofile counties it could not reach.
    for (const [county, { fips }] of Object.entries(TYLER_EAGLE_PORTALS)) {
      expect(getClerkSystem(fips), county).not.toBe('tyler');
    }
  });
});

describe('an unexplained zero is never reported as an empty index', () => {
  const ZERO = { validationMessages: {}, totalPages: 0, currentPage: 1 };

  it('calls out the contradiction when the index knows the name', () => {
    const o = readSearchOutcome(ZERO, 'McLennan', true);
    expect(o.state).toBe('empty_but_suspect');
    expect(o.statement).toContain('contradict');
    expect(o.statement).toContain('Do not record "no records found"');
  });

  it('still refuses to say empty when the index was not confirmed', () => {
    const o = readSearchOutcome(ZERO, 'Burnet', false);
    expect(o.state).toBe('empty_but_suspect');
    expect(o.statement).toContain('treat as unread');
  });

  it('distinguishes a rejected query from an empty one', () => {
    // A malformed query and a property with no deeds are opposite facts.
    const o = readSearchOutcome({ validationMessages: { field_RecDateID: 'bad date' }, totalPages: 0, currentPage: 1 }, 'Hill', true);
    expect(o.state).toBe('rejected');
    expect(o.statement).toContain('REJECTED');
    expect(o.statement).toContain('Not an empty index');
  });

  it('reports real results plainly', () => {
    const o = readSearchOutcome({ validationMessages: {}, totalPages: 7, currentPage: 1 }, 'McLennan', true);
    expect(o.state).toBe('has_results');
    expect(o).toMatchObject({ totalPages: 7 });
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
