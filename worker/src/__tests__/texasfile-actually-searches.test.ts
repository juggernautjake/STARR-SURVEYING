import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { countyRecordsUrl, countySlug, hasTexasFileCredentials, TEXASFILE_FIELDS } from '../adapters/texasfile-access.js';

// "Make sure TexasFile is fully set up and that we are actually searching it."
//
// ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────────────────────────
//
// `texasfile-access.ts` was written on 2026-08-02 after driving the live site, and it recorded three
// facts:
//
//   1. the per-county URL is slug-based — `/search/texas/bell-county/county-clerk-records/`, and the
//      `/search?county=48027&grantor=SMITH` shape the adapter used is IGNORED by the site;
//   2. the form is a Django form whose real field names are `name-0-name`, `number-0-number`,
//      `bvp-0-volume` and so on, with a `csrfmiddlewaretoken` that must survive;
//   3. whether credentials exist at all.
//
// Every one of those was exported and had ZERO callers. The adapter went on navigating to a URL the
// site ignores, looking for `input[name="grantee"]` elements that do not exist, and never logging in
// — so for the 233 counties that fall back to TexasFile, a search reached a record COUNT and a
// paywall, and `readAccess` correctly reported `paywalled`. The measurement was made, written down,
// and never connected to the code that needed it.
//
// The credentials have been set and funded since 2026-08-29. Nothing read them.

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'src/adapters/texasfile-adapter.ts'),
  'utf8',
);

const codeOnly = SRC
  .split(/\r?\n/)
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('the measured facts are used, not just recorded', () => {
  it('CONTROL: the access module still exports them', () => {
    // If these were renamed the assertions below would pass vacuously against a stale adapter.
    expect(typeof countyRecordsUrl).toBe('function');
    expect(typeof hasTexasFileCredentials).toBe('function');
    expect(TEXASFILE_FIELDS.name).toBe('name-0-name');
  });

  it('navigates to the slug URL the site actually serves', () => {
    expect(codeOnly).toContain('countyRecordsUrl(this.countyName)');
  });

  it('no longer uses the query-string shape the site ignores', () => {
    // This is the specific defect: the adapter built `/search?county=…&grantor=…`, which TexasFile
    // redirects to its landing page, so every search silently looked at nothing.
    expect(codeOnly, 'the ignored URL shape is back').not.toContain('/search?county=');
  });

  it('fills the real Django field names rather than guessing selectors', () => {
    expect(codeOnly).toContain('TEXASFILE_FIELDS[');
    expect(codeOnly, 'still guessing at a grantee input the page does not have')
      .not.toContain('input[name="grantee"]');
    expect(codeOnly).not.toContain('input[name="grantor"]');
    expect(codeOnly).not.toContain('input[name="instrno"]');
  });

  it('submits the FORM, so the CSRF token and county selection survive', () => {
    // A constructed URL drops both, which is why the access module recorded that the search has to
    // be driven through the form.
    expect(codeOnly).toContain('submitSearch(');
  });
});

describe('the session signs in', () => {
  it('calls signIn during initSession', () => {
    expect(codeOnly).toContain('await this.signIn()');
  });

  it('reads the credentials that have been set since 2026-08-29', () => {
    expect(codeOnly).toContain('process.env.TEXASFILE_USERNAME');
    expect(codeOnly).toContain('process.env.TEXASFILE_PASSWORD');
  });

  it('consults hasTexasFileCredentials — which had no callers at all', () => {
    expect(codeOnly).toContain('hasTexasFileCredentials()');
  });

  it('verifies the login TOOK, rather than that the click did not throw', () => {
    // A rejected login returns 200 with an error on the page, which is indistinguishable from
    // success to a navigation check. This repo has been caught by exactly that shape before.
    expect(codeOnly).toContain('stillOnLogin');
    expect(codeOnly).toMatch(/rejected/);
  });

  it('a failed sign-in degrades to the old behaviour instead of throwing', () => {
    // Losing the login must not lose the record COUNT: "5,000 records exist here and we cannot open
    // them" is still a purchasing decision, and it is what readAccess reports as `paywalled`.
    const at = codeOnly.indexOf('private async signIn(');
    const fn = codeOnly.slice(at, at + 2200);
    expect(fn).toContain('catch');
    expect(fn, 'signIn throws, which would take down the search with it').not.toMatch(/throw new Error/);
  });

  it('says a missing subscription is not an absence of records', () => {
    expect(SRC).toMatch(/missing subscription, not an absence of records/);
  });
});

describe('a missing form is an error, not an empty index', () => {
  it('throws rather than returning [] when the form is absent', () => {
    // The old fallback path returned whatever the ignored URL rendered, which parsed to []. For the
    // fallback adapter of 233 counties, that reports "this property has no records" for most of
    // Texas whenever the page shape changes.
    expect(codeOnly).toContain('the county search form was not on the page');
  });
});

describe('the county slug matches what the site expects', () => {
  it('builds the measured URL', () => {
    expect(countyRecordsUrl('Bell')).toBe(
      'https://www.texasfile.com/search/texas/bell-county/county-clerk-records/',
    );
  });

  it('tolerates a name that already carries "County"', () => {
    expect(countySlug('Bell County')).toBe('bell-county');
    expect(countySlug('Fort Bend')).toBe('fort-bend-county');
  });

  it('CONTROL: credentials are read from the environment, not assumed', () => {
    expect(hasTexasFileCredentials({} as NodeJS.ProcessEnv)).toBe(false);
    expect(hasTexasFileCredentials({
      TEXASFILE_USERNAME: 'u', TEXASFILE_PASSWORD: 'p',
    } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});
