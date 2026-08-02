// A paywall is not an empty index (research plan R38).
//
// After the vendor sweep, TexasFile is the fallback for 233 of the 254 Texas counties. Driving it on
// 2026-08-02 showed:
//
//   1. The adapter's URL shape (/search?county=48027&grantor=SMITH) is IGNORED — the site redirects
//      to a generic landing page and shows nothing.
//   2. The real per-county page is slug-based: /search/texas/bell-county/county-clerk-records/
//   3. A search there works and reports a count — "We found 5000 records matching your search for
//      Name: SMITH in Bell County" — then redirects to /register/ to view them.
//
// Without this module that arrives as an empty result, and an empty result reads as "this property
// has no records" — the same failure the dead vendor URLs produced, across most of the state.

import { describe, it, expect } from 'vitest';
import {
  TEXASFILE_FIELDS,
  countyRecordsUrl,
  countySlug,
  credentialWarning,
  hasTexasFileCredentials,
  readAccess,
} from '../adapters/texasfile-access.js';

/** Verbatim from the page TexasFile served on 2026-08-02. */
const PAYWALL_BODY =
  'Search HOME HELP SEARCH COVERAGE REGISTER LOGIN Good News! We found 5000 records matching your ' +
  'instrument search for Name: SMITH in Bell County. Register below or login to view your results.';

describe('the per-county URL', () => {
  it('is slug-based, not FIPS-based', () => {
    // The adapter was building ?county=48027, which the site ignores.
    expect(countySlug('Bell')).toBe('bell-county');
    expect(countyRecordsUrl('Bell')).toBe('https://www.texasfile.com/search/texas/bell-county/county-clerk-records/');
  });

  it('handles a county already written with the word County', () => {
    expect(countySlug('Bell County')).toBe('bell-county');
  });

  it('handles a two-word county', () => {
    expect(countySlug('San Saba')).toBe('san-saba-county');
    expect(countySlug('Val Verde')).toBe('val-verde-county');
  });
});

describe('a paywall is reported as a paywall', () => {
  it('says the records EXIST and we cannot open them', () => {
    const a = readAccess('https://www.texasfile.com/register/?next=/search/…', PAYWALL_BODY, 'Bell');
    expect(a.state).toBe('paywalled');
    expect(a.recordCount).toBe(5000);
    expect(a.statement).toContain('5,000 matching record(s)');
    expect(a.statement).toContain('NOT an empty index');
  });

  it('keeps the count, which is the useful part', () => {
    // TexasFile states how many records exist BEFORE asking for money. "5,000 records exist here and
    // we cannot open them" is a purchasing decision; "no records found" is a wrong answer.
    expect(readAccess('', PAYWALL_BODY, 'Bell').recordCount).toBe(5000);
  });

  it('still says paywalled when the count is missing', () => {
    const a = readAccess('https://www.texasfile.com/register/', 'Please login to view your results.', 'Milam');
    expect(a.state).toBe('paywalled');
    expect(a.recordCount).toBeNull();
    expect(a.statement).toContain('not an empty index');
  });

  it('detects the paywall from the URL alone', () => {
    expect(readAccess('https://www.texasfile.com/register/?next=x', 'anything', 'Hays').state).toBe('paywalled');
  });

  it('names what would unblock it', () => {
    expect(readAccess('', PAYWALL_BODY, 'Bell').nextStep).toContain('TEXASFILE_USERNAME');
  });
});

describe('the other three states', () => {
  it('reports a genuine empty result as empty', () => {
    const a = readAccess('https://www.texasfile.com/search/…', 'No records were found for your search.', 'Leon');
    expect(a.state).toBe('empty');
    expect(a.recordCount).toBe(0);
  });

  it('reports open results with their count', () => {
    const a = readAccess('https://www.texasfile.com/search/…', 'We found 42 records matching your search.', 'Leon');
    expect(a.state).toBe('open');
    expect(a.recordCount).toBe(42);
  });

  it('never guesses "empty" when it cannot tell', () => {
    // An unreadable page and an empty index are opposite facts.
    const a = readAccess('https://www.texasfile.com/search/…', 'Some unrelated page content.', 'Leon');
    expect(a.state).toBe('unknown');
    expect(a.statement).toContain('Treat as unread, not as empty');
  });
});

describe('warning before the run, not after', () => {
  it('says up front that a county will hit a paywall', () => {
    // Better than discovering an empty result 20 minutes into a run.
    const w = credentialWarning(false, 'Coryell');
    expect(w.blocked).toBe(true);
    expect(w.statement).toContain('no verified free portal');
    expect(w.statement).toContain('the absence of ACCESS, not the absence of records');
  });

  it('says nothing when credentials exist', () => {
    expect(credentialWarning(true, 'Coryell').blocked).toBe(false);
  });

  it('reads both credentials, not just one', () => {
    expect(hasTexasFileCredentials({ TEXASFILE_USERNAME: 'u' } as NodeJS.ProcessEnv)).toBe(false);
    expect(hasTexasFileCredentials({ TEXASFILE_PASSWORD: 'p' } as NodeJS.ProcessEnv)).toBe(false);
    expect(hasTexasFileCredentials({ TEXASFILE_USERNAME: 'u', TEXASFILE_PASSWORD: 'p' } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe('the form fields read off the live page', () => {
  it('records the Django form names the search actually uses', () => {
    // Not guessed: `instrno`, `grantor` and `grantee` — what the adapter was sending — do not exist
    // on the page.
    expect(TEXASFILE_FIELDS.name).toBe('name-0-name');
    expect(TEXASFILE_FIELDS.instrumentNumber).toBe('number-0-number');
    expect(TEXASFILE_FIELDS.volume).toBe('bvp-0-volume');
  });

  it('keeps the hidden fields a Django POST needs', () => {
    expect(TEXASFILE_FIELDS.csrf).toBe('csrfmiddlewaretoken');
    expect(TEXASFILE_FIELDS.selectedCounties).toBe('selected_counties');
  });
});
