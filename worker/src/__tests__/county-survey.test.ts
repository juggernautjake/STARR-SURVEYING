// What the live site survey found (research plan R37).
//
// The owner named 23 places, which resolve to 13 counties. Seed 540 registered them with each
// county's own landing page and marked every one `not_surveyed`, because inventing a search path is
// how every adapter this repo shipped against a guessed DOM came to need rewriting.
//
// The survey (2026-08-02) fetched the vendor URL patterns directly, paced at R12's politeness gap.
// "Does `<county>.tx.publicsearch.us` answer with 200" is a fact; "this page links to something
// labelled Search" is a guess.
//
// It turned up the finding that matters: EIGHT of the thirteen run Kofile, which this repo already
// has a working adapter for — and two of those, Leon and Madison, were in no registry, so the
// platform could already have served them and did not know it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { KOFILE_FIPS_SET } from '../services/clerk-registry.js';
import { getClerkSystem } from '../services/clerk-registry.js';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** Verified live on 2026-08-02: each returned 200 on `https://<county>.tx.publicsearch.us/`. */
const VERIFIED_KOFILE: Array<[string, string]> = [
  ['48027', 'Bell'],
  ['48453', 'Travis'],
  ['48491', 'Williamson'],
  ['48331', 'Milam'],
  ['48471', 'Walker'],
  ['48289', 'Leon'],
  ['48339', 'Montgomery'],
  ['48313', 'Madison'],
];

describe('counties whose Kofile portal was confirmed live', () => {
  it('routes every one of them to the Kofile adapter', () => {
    for (const [fips, name] of VERIFIED_KOFILE) {
      expect(getClerkSystem(fips), `${name} (${fips})`).toBe('kofile');
    }
  });

  it('includes the two the registry did not know about', () => {
    // Leon (Centerville) and Madison (Madisonville) are on the owner's list and were missing, so the
    // platform would have fallen through to the TexasFile fallback and paid for pages it could have
    // read free.
    expect(KOFILE_FIPS_SET.has('48289')).toBe(true);
    expect(KOFILE_FIPS_SET.has('48313')).toBe(true);
  });

  it('records that these were verified rather than assumed', () => {
    const src = read('src/services/clerk-registry.ts');
    expect(src).toContain('Verified live 2026-08-02 by the R37 site survey');
    expect(src).toContain('returned 200');
  });
});

describe('one Kofile list, not two', () => {
  it('the paid-platform registry shares the clerk registry’s set', () => {
    // It WAS a copy with a "keep in sync" comment, and the two drifted six counties apart. A county
    // missing from the copy is one the purchase planner will not offer a Kofile route for, so the
    // drift quietly narrowed what the platform would buy.
    const paid = read('src/services/paid-platform-registry.ts');
    expect(paid).toContain("import { KOFILE_FIPS_SET } from './clerk-registry.js'");
    expect(paid).not.toMatch(/^const KOFILE_FIPS_SET = new Set/m);
  });

  it('names the drift rather than just fixing it quietly', () => {
    const paid = read('src/services/paid-platform-registry.ts');
    expect(paid).toContain('drifted six counties apart');
  });

  it('still covers the counties that were only in the paid copy', () => {
    // Brazoria was in the paid list and not the clerk one. Sharing the clerk list must not lose it.
    // It is deliberately NOT re-added: Brazoria is TexasFile, per the clerk registry's own note.
    const clerk = read('src/services/clerk-registry.ts');
    expect(clerk).toContain('Brazoria (TexasFile)');
  });
});

describe('what the survey could not confirm is recorded as such', () => {
  const seed = read('../seeds/541_surveyed_county_portals.sql');

  it('marks failures as looked-for-and-not-found', () => {
    // Different from never having been attempted, and a reviewer reading coverage needs to see which.
    expect(seed).toContain("'survey_status', 'survey_failed'");
    expect(seed).toContain('Harrison');
    expect(seed).toContain('McLennan');
  });

  it('refuses to invent a URL for a county it could not confirm', () => {
    // A wrong base URL does not fail loudly — it sends a run at the wrong site.
    expect(seed).toContain('a wrong base URL does not fail loudly');
  });

  it('leaves the surveyed adapters as drafts', () => {
    // Knowing a portal exists is not the same as having driven it. R11's coverage must keep showing
    // these as registered-and-unproven until a probe reads a results page.
    expect(seed).not.toMatch(/status\s*=\s*'active'/);
    expect(seed).toContain('before this can be marked active');
  });

  it('says how each URL was established', () => {
    expect(seed).toContain('HTTP GET on the vendor URL pattern, 200 OK, redirect followed');
  });
});
