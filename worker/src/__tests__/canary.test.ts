// Did we get the RIGHT data, not just a page (research plan R9, semantic layer).
//
// The structural check catches a redesign. It does not catch the failures that actually cost a
// survey — a lazy-loading grid that leaves the selector matching an empty table, a portal that
// starts returning the first result for every query, a vendor migration that swaps acres for square
// feet, a session expiry that renders a login page with the same container ids. Every one of those
// keeps the structure intact and the answers wrong, and the wrong answers flow into a boundary a
// surveyor is asked to stake.

import { describe, it, expect } from 'vitest';
import {
  compareField,
  evaluateCanary,
  normaliseIdentifier,
  parseMeasure,
  tokenSimilarity,
  toSemanticLayer,
  type ExpectedField,
} from '../infra/canary.js';
import { toHealthCheck } from '../infra/health-persistence.js';
import type { SiteHealthResult } from '../infra/site-health-monitor.js';

const KNOWN: ExpectedField[] = [
  { field: 'parcel_id', kind: 'identifier', value: 'R-12345' },
  { field: 'owner_name', kind: 'name', value: 'SMITH, JOHN A' },
  { field: 'acreage', kind: 'measure', value: '10.02' },
  { field: 'legal_description', kind: 'text', value: 'A0123 J SMITH SURVEY, TRACT 4, ACRES 10.02' },
];

describe('formatting is not a break', () => {
  it('an identifier that lost its hyphen is the same parcel', () => {
    expect(compareField(KNOWN[0]!, 'R12345').verdict).toBe('match');
    expect(normaliseIdentifier('R-12345')).toBe(normaliseIdentifier('r 12345'));
  });

  it('a reordered name is the same owner', () => {
    // A county reformatting "SMITH, JOHN A" to "JOHN A SMITH" is not a regression, and an alarm
    // that fires on it is one people learn to dismiss.
    expect(compareField(KNOWN[1]!, 'JOHN A SMITH').verdict).toBe('match');
  });

  it('trailing zeros on a measure are the same acreage', () => {
    expect(compareField(KNOWN[2]!, '10.0200').verdict).toBe('match');
    expect(compareField(KNOWN[2]!, '10.02 acres').verdict).toBe('match');
    expect(parseMeasure('10.02 AC')).toBe(10.02);
  });

  it('a legal description with different whitespace still matches', () => {
    expect(compareField(KNOWN[3]!, 'A0123  J SMITH SURVEY,   TRACT 4, ACRES 10.02').verdict).toBe('match');
  });
});

describe('the failures that keep the structure and lose the data', () => {
  it('a different property is a MISMATCH, not drift', () => {
    // The portal returning the first result for every query. Selectors all present; answer useless.
    const r = compareField(KNOWN[0]!, 'R99999');
    expect(r.verdict).toBe('mismatch');
  });

  it('acres silently becoming square feet is caught', () => {
    // 10.02 acres → 436,471 sq ft. Beyond ten times the tolerance is a different number, not noise.
    expect(compareField(KNOWN[2]!, '436471').verdict).toBe('mismatch');
  });

  it('a field that disappeared reads as missing, not as wrong', () => {
    // Different repairs: "the selector moved" versus "the value changed".
    expect(compareField(KNOWN[2]!, null).verdict).toBe('missing');
    expect(compareField(KNOWN[2]!, '').verdict).toBe('missing');
  });

  it('a small CAD rounding change is drift, worth a look, not an alarm', () => {
    // 10.02 → 10.15 is 1.3%: past the 1% tolerance, nowhere near a different parcel.
    const r = compareField(KNOWN[2]!, '10.15');
    expect(r.verdict).toBe('drift');
  });

  it('a shared surname is not a match', () => {
    const r = compareField(KNOWN[1]!, 'SMITH, MARGARET');
    expect(r.verdict).not.toBe('match');
  });
});

describe('the whole canary', () => {
  const actual = {
    parcel_id: 'R12345',
    owner_name: 'JOHN A SMITH',
    acreage: '10.02',
    legal_description: 'A0123 J SMITH SURVEY, TRACT 4, ACRES 10.02',
  };

  it('passes when the known property still returns its known values', () => {
    const e = evaluateCanary(KNOWN, actual);
    expect(e.verdict).toBe('pass');
    expect(e.severity).toBe('none');
    expect(e.summary).toContain('still match');
  });

  it('distinguishes "returned nothing" from "returned the wrong thing"', () => {
    // Different breaks, different repairs. Collapsing them sends the repair agent to diagnose the
    // wrong thing entirely.
    const nothing = evaluateCanary(KNOWN, null);
    expect(nothing.verdict).toBe('no_record');
    expect(nothing.producedRecord).toBe(false);
    expect(nothing.summary).toContain('search itself is broken');

    const wrong = evaluateCanary(KNOWN, { ...actual, parcel_id: 'R99999' });
    expect(wrong.verdict).toBe('fail');
    expect(wrong.producedRecord).toBe(true);
  });

  it('names the field AND both values, so the reader knows what happened', () => {
    // "parcel_id changed" sends somebody to guess. R12345 → R99999 tells them the search is
    // matching the wrong property.
    const e = evaluateCanary(KNOWN, { ...actual, parcel_id: 'R99999' });
    expect(e.summary).toContain('R-12345');
    expect(e.summary).toContain('R99999');
  });

  it('lets an optional field drift without failing the check', () => {
    const withOptional: ExpectedField[] = [...KNOWN, { field: 'zoning', kind: 'exact', value: 'A-1', required: false }];
    const e = evaluateCanary(withOptional, { ...actual, zoning: 'A1' });
    expect(e.verdict).toBe('drift');
    expect(e.severity).toBe('minor');
  });

  it('emits the layer shape seed 371 documents', () => {
    const layer = toSemanticLayer(evaluateCanary(KNOWN, { ...actual, acreage: null as never }));
    expect(layer).toMatchObject({ severity: 'major', produced_record: true });
    expect((layer as { missing_fields: string[] }).missing_fields).toContain('acreage');
  });
});

describe('the semantic layer can only make a health check worse', () => {
  const healthy: SiteHealthResult = {
    siteId: 'kofile-bell', name: 'Kofile — Bell County', vendor: 'kofile',
    url: 'https://bell.tx.publicsearch.us', status: 'healthy',
    checkedAt: '2026-08-02T12:00:00.000Z', latencyMs: 700,
    selectors: [{ selector: '.results-table', label: 'results table', required: true, found: true, count: 1 }],
    alerts: [],
  } as SiteHealthResult;

  it('turns an all-selectors-present page into broken when the data is wrong', () => {
    // This is the whole reason the semantic layer exists.
    const row = toHealthCheck('a1', healthy, 'scheduled', evaluateCanary(KNOWN, { parcel_id: 'R99999' }));
    expect(row.status).toBe('broken');
    expect(row.diff_summary).toContain('no longer returns its known values');
  });

  it('records no_record separately from broken', () => {
    const row = toHealthCheck('a1', healthy, 'scheduled', evaluateCanary(KNOWN, null));
    expect(row.status).toBe('no_record');
  });

  it('does NOT let a passing canary excuse a missing required element', () => {
    // The canary exercises one property; the element may matter for every other one.
    const structurallyBroken = {
      ...healthy,
      selectors: [{ selector: '.results-table', label: 'results table', required: true, found: false, count: 0 }],
    } as SiteHealthResult;
    const row = toHealthCheck('a1', structurallyBroken, 'scheduled', evaluateCanary(KNOWN, {
      parcel_id: 'R12345', owner_name: 'JOHN A SMITH', acreage: '10.02',
      legal_description: 'A0123 J SMITH SURVEY, TRACT 4, ACRES 10.02',
    }));
    expect(row.status).toBe('broken');
  });

  it('keeps both layers in the row, so a repair agent can read either', () => {
    const row = toHealthCheck('a1', healthy, 'scheduled', evaluateCanary(KNOWN, { parcel_id: 'R99999' }));
    expect(row.layer_results).toHaveProperty('structural');
    expect(row.layer_results).toHaveProperty('semantic');
  });
});

describe('similarity', () => {
  it('is symmetric and bounded', () => {
    expect(tokenSimilarity('a b c', 'c b a')).toBe(1);
    expect(tokenSimilarity('a b c', 'x y z')).toBe(0);
    expect(tokenSimilarity('', '')).toBe(1);
  });
});
