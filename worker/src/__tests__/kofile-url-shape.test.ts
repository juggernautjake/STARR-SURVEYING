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
  it('sends the parameter names the site itself emits', () => {
    // Read off the address bar after driving each county's own search form (2026-08-02), not
    // guessed. `searchValue` + `searchType=quickSearch` is the indexed grantor/grantee lookup; the
    // legacy `q=` is a broad keyword sweep — on Milam the same term gives 5,484 against 220,777, so
    // they answer different questions and a name search wants the narrow one.
    for (const p of ['department', 'searchType', 'searchValue', 'keywordSearch', 'recordedDateRange', 'searchOcrText', 'limit', 'offset']) {
      expect(src, p).toContain(`${p}:`);
    }
    expect(src).toContain("searchType: 'quickSearch'");
  });

  it('treats the department code as per-county, not a constant', () => {
    // Williamson's own form defaults to CCM (court minutes, 1904–1999) and returns nothing for a
    // deed search; Milam's is RP. Getting this wrong looks exactly like a broken portal.
    expect(src).toContain('opts.department ?? this.config.department');
    expect(src).toContain('Department codes are PER COUNTY');
  });

  it('lets the registry repair a department code without a release', () => {
    // The same contract R8b established for base_url — the third per-county value after base URL
    // and column set.
    expect(src).toContain("if (typeof cfg.department === 'string') this.config.department = cfg.department;");
  });

  it('always sends a date range, because omitting it returns nothing', () => {
    expect(src).toContain('recordedDateRange:');
    expect(src).toContain('is required — omitting it returns nothing');
  });

  it('prefers the county’s OWN published span over a made-up one', () => {
    // The site rejects a range outside its own index. Sending 18000101 to Travis, whose index starts
    // 18010101, is what made Travis look broken.
    expect(src).toContain("discovered?.split(',')[0]");
    expect(src).toContain('is what made it look broken');
  });

  it('falls back to a span the site will accept, not to year zero', () => {
    // A chain of title needs the earliest instrument the county holds, but asking for earlier than
    // the index begins is an error rather than a wider search.
    expect(src).toContain("?? '18010101'");
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
