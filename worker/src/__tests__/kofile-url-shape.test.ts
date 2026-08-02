// The Kofile search URL, read off the live site (research plan R37/R38).
//
// ── THE BUG THIS FIXES ──────────────────────────────────────────────────────────────────────────
//
// `kofile-clerk-adapter.ts` built every search as `?searchOper=…&searchString=…`. The live site
// IGNORES both parameters: the page renders, no error appears, and zero rows come back.
//
// That is worse than a 404. A 404 fails loudly and R9's health check catches it. A results page that
// renders correctly and lists nothing is indistinguishable from "this property has no records" — so
// every search through this adapter was returning an empty index as though it were an answer, on the
// one county marked `active`.
//
// Verified against Milam on 2026-08-02:
//   ?searchOper=instrument&searchString=2019-3389                        →  0 rows, no error
//   ?department=RP&limit=50&offset=0&q=2019-3389&recordedDateRange=…     → 50 rows of 220,777

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.join(process.cwd(), 'src/adapters/kofile-clerk-adapter.ts'), 'utf8',
);

describe('the stale query shape is gone', () => {
  it('no search still builds searchOper/searchString', () => {
    // One mention survives, in the comment explaining why.
    const uses = src.split('searchOper=').length - 1;
    expect(uses).toBe(1);
    expect(src).toContain('is IGNORED by the site and returns a');
  });

  it('every search goes through one builder', () => {
    // Five call sites each building their own query string is five places for the next vendor change
    // to hide.
    expect(src).toContain('private resultsUrl(');
    for (const call of [
      'this.resultsUrl(instrumentNo)',
      'this.resultsUrl(cleanName)',
      'this.resultsUrl(name)',
    ]) {
      expect(src).toContain(call);
    }
  });
});

describe('the builder matches what the live site accepts', () => {
  it('sends the parameters the site actually reads', () => {
    for (const p of ['department', 'limit', 'offset', 'q', 'recordedDateRange', 'searchOcrText']) {
      expect(src).toContain(`${p}:`);
    }
  });

  it('always sends a date range, because omitting it returns nothing', () => {
    expect(src).toContain("opts.from ?? '18000101'");
    expect(src).toContain('is required — omitting it returns nothing');
  });

  it('defaults to the whole record, not a recent window', () => {
    // A chain of title needs the earliest instrument the county holds.
    expect(src).toContain('18000101');
    expect(src).toContain('needs the earliest instrument the county holds');
  });

  it('uses URLSearchParams rather than hand-built escaping', () => {
    // The old code called encodeURIComponent on some parameters and not others.
    expect(src).toContain('new URLSearchParams({');
  });
});

describe('what the survey proved, and what it did not', () => {
  const seed = fs.readFileSync(path.join(process.cwd(), '../seeds/543_kofile_proof_status.sql'), 'utf8');

  it('records the two counties that returned real rows', () => {
    expect(seed).toContain('220,777');
    expect(seed).toContain('547,747');
  });

  it('records that one county with the same shape does NOT work', () => {
    // One vendor, three deployments, two behaviours — which is why R9 keeps a canary per county
    // rather than one per vendor.
    expect(seed).toContain('Error with search query');
    expect(seed).toContain('uses a different department code');
  });

  it('calls the untested counties an assumption, not an inheritance', () => {
    // Madison is the reason that distinction matters.
    expect(seed).toContain('this is an assumption, not an inheritance');
  });

  it('leaves even the proven counties as drafts', () => {
    // A URL that lists results is not an adapter that parses them, follows a document and returns an
    // instrument — and R11's coverage promise means the second thing.
    // Normalise the SQL comment prefixes as well as whitespace, or the wrap breaks the match.
    const prose = seed.replace(/^--\s?/gm, '').replace(/\s+/g, ' ');
    expect(prose).toContain('A URL that lists results is not the same as an adapter that parses them');
    expect(seed).not.toMatch(/status\s*=\s*'active'/);
    expect(seed).not.toContain('last_verified_at = now()');
  });
});
