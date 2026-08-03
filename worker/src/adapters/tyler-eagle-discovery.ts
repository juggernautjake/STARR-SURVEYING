// worker/src/adapters/tyler-eagle-discovery.ts — nine portals located, none yet proven (plan R39).
//
// R38 concluded that the Tyler Host URL pattern "does not generalise". That conclusion was WRONG,
// and wrong in a specific way worth recording: the guess was `<county>tx-web.tylerhost.net`. The
// real pattern carries the word *county*:
//
//     https://<county>countytx-web.tylerhost.net/<app path>/
//
// Re-sweeping 40 counties with the corrected pattern found NINE live deployments, including
// McLennan — Waco — which R38 had listed as a dead end.
//
// ── WHAT IS PROVEN ──────────────────────────────────────────────────────────────────────────────
//
//   1. The nine subdomains below resolve and serve a Tyler "Self-Service" app.
//   2. Everything is gated behind a disclaimer at /user/disclaimer; accepting it lands on the menu.
//   3. The menu loads ASYNCHRONOUSLY — "Loading main menu, please wait..." is on the page before the
//      options exist. A fixed wait reads a working portal as having no search.
//   4. The search IDs are PER DEPLOYMENT, exactly like Kofile's department codes. McLennan's
//      official-public-record search is DOCSEARCH402S1; its marriage search is DOCSEARCH392S3.
//      These must be discovered from the menu, never hardcoded across counties.
//   5. The form fields are stable and complete (see TYLER_FIELDS).
//   6. The index answers: typing SMITH into McLennan's name field returned real indexed parties
//      ("SMITH & BRATCHER INC", "SMITH & BRATCHER INCORPORATED") from /search/suggest/BothNamesID.
//   7. McLennan states its own coverage: "Recorder Documents are indexed from Jan 1, 1857 through
//      Jul 30, 2026".
//   8. Results are JSON, not HTML. POST /web/searchPost/<SEARCHID> returns
//      {"validationMessages":{},"totalPages":N,"currentPage":1}. This is why scraping the DOM for a
//      results table finds nothing — there is no table to find.
//
// ── `totalPages: 0` MEANS TOO MANY, NOT NONE ────────────────────────────────────────────────────
//
// This file first recorded that zero as an unexplained contradiction, because SMITH returned
// `totalPages: 0` on a county whose own autocomplete had just listed Smiths. Screenshotting the
// page settled it. Tyler renders:
//
//     "We found more documents than the maximum allowed. It may be necessary to refine your search."
//
// The zero is an OVER-LIMIT signal. Reading it as "no records" inverts the truth completely — it
// turns the single largest result set the portal can produce into "this property has nothing".
// Proven by narrowing the same search:
//
//     SMITH, no date range        totalPages 0   over limit
//     SMITH, one month            totalPages 1   real results
//     SMITH JAMES, one year       totalPages 1   14 documents, listed below
//
// This is the sharpest instance of the defect this whole document exists to close, because the
// wrong reading is the one a careful person arrives at: the field is called totalPages, and it
// says zero.
//
// ── RESULTS ARE CARDS, NOT TABLE ROWS ───────────────────────────────────────────────────────────
//
// `li.ss-search-row`, each with an `h1` of "<instrument> • <document type>", label/value pairs in
// `div.searchResultFourColumn`, and a link to `/web/document/<DOCID>?search=<SEARCHID>`. Scraping
// for `<tr>` finds nothing, which is why every earlier probe reported zero rows on a page that was
// showing fourteen documents.

/** Counties whose Tyler Host deployment resolves, with the app path each one uses.
 *
 *  Note the path is NOT uniform: Williamson uses `/williamsonweb/`, every other one uses `/web/`.
 *  A single hardcoded path would have missed Williamson, and a single hardcoded subdomain missed
 *  all nine. */
export const TYLER_EAGLE_PORTALS: Record<string, { fips: string; appPath: string; milesFromBell: number | null }> = {
  McLennan:   { fips: '48309', appPath: '/web/',           milesFromBell: 35 },
  Burnet:     { fips: '48053', appPath: '/web/',           milesFromBell: 60 },
  Hamilton:   { fips: '48193', appPath: '/web/',           milesFromBell: 50 },
  Hill:       { fips: '48217', appPath: '/web/',           milesFromBell: 55 },
  Mills:      { fips: '48333', appPath: '/web/',           milesFromBell: 70 },
  Erath:      { fips: '48143', appPath: '/web/',           milesFromBell: 80 },
  Navarro:    { fips: '48349', appPath: '/web/',           milesFromBell: 85 },
  Somervell:  { fips: '48425', appPath: '/web/',           milesFromBell: 80 },
  Williamson: { fips: '48491', appPath: '/williamsonweb/', milesFromBell: 28 },
};

export function tylerEagleUrl(county: string): string | null {
  const entry = TYLER_EAGLE_PORTALS[county.replace(/\s+county$/i, '').trim()];
  if (!entry) return null;
  const host = `${county.toLowerCase().replace(/\s+/g, '')}countytx-web.tylerhost.net`;
  return `https://${host}${entry.appPath}`;
}

/** Form field names, read off McLennan's live search page on 2026-08-02. */
export const TYLER_FIELDS = {
  bothNames: 'field_BothNamesID',
  grantor: 'field_GrantorID',
  grantee: 'field_GranteeID',
  startDate: 'field_RecDateID_DOT_StartDate',
  endDate: 'field_RecDateID_DOT_EndDate',
  docNumber: 'field_DocNumID',
  book: 'field_BookVolPageID_DOT_Book',
  volume: 'field_BookVolPageID_DOT_Volume',
  page: 'field_BookVolPageID_DOT_Page',
  docTypes: 'field_selfservice_documentTypes',
} as const;

/** The submit control.
 *
 *  Matched by exact id. A looser `/search/i.test(el.id)` match hits the hidden per-field
 *  `advancedSearchButton-BothNamesID` links first and opens a help dialog instead of searching —
 *  which looks identical to "the search returned nothing". */
export const TYLER_SEARCH_BUTTON = 'a#searchButton';

/** The shape POST /web/searchPost/<SEARCHID> answers with. */
export interface TylerSearchResponse {
  validationMessages: Record<string, unknown>;
  totalPages: number;
  currentPage: number;
}

export type TylerOutcome =
  | { state: 'rejected'; statement: string }
  | { state: 'over_limit'; statement: string }
  | { state: 'empty'; statement: string }
  | { state: 'has_results'; totalPages: number; statement: string };

/** The banner Tyler renders when a search matched more than it will return. */
export const OVER_LIMIT_TEXT = /more documents than the maximum allowed/i;

/** Read the search response.
 *
 *  `pageText` is the rendered page. It is required, not optional, because the JSON alone CANNOT
 *  distinguish "too many" from "none" — both are `totalPages: 0`. Only the page says which. */
export function readSearchOutcome(res: TylerSearchResponse, county: string, pageText: string): TylerOutcome {
  const messages = Object.keys(res.validationMessages ?? {});
  if (messages.length > 0) {
    return {
      state: 'rejected',
      statement: `${county}: the portal REJECTED the search (${messages.join(', ')}). Not an empty index — a malformed query.`,
    };
  }

  if (res.totalPages > 0) {
    return { state: 'has_results', totalPages: res.totalPages, statement: `${county}: ${res.totalPages} page(s) of results.` };
  }

  if (OVER_LIMIT_TEXT.test(pageText)) {
    return {
      state: 'over_limit',
      statement:
        `${county}: the search matched MORE documents than the portal will return — narrow it (date range, ` +
        `document type, fuller name). This is the OPPOSITE of an empty result and must never be recorded as "no records found".`,
    };
  }

  return {
    state: 'empty',
    statement: `${county}: no documents matched, and the portal did not report an over-limit. Genuinely empty for this query.`,
  };
}

/** Narrow an over-limit search by slicing its date range.
 *
 *  Returned windows cover the original range with no gaps — a gap is a deed nobody sees, which is
 *  the same wrong answer as an empty result, only harder to notice. */
export function narrowByYear(from: Date, to: Date, years = 5): Array<{ from: Date; to: Date }> {
  if (to < from) return [];
  const out: Array<{ from: Date; to: Date }> = [];
  let cursor = new Date(from);
  while (cursor <= to) {
    const end = new Date(cursor.getFullYear() + years, 0, 0);
    out.push({ from: new Date(cursor), to: end > to ? new Date(to) : end });
    cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  }
  return out;
}

/** Results were driven end to end on 2026-08-02: SMITH JAMES, 2025, McLennan → 14 documents. */
export const TYLER_RESULTS_PROVEN = true;

/** Tyler serves 100 result cards per page. */
export const TYLER_PAGE_SIZE = 100;

/** A pager that never disables Next would loop forever; this is far beyond any real search. */
export const TYLER_MAX_PAGES = 200;

/** Should the walker fetch another page?
 *
 *  Kept pure and separate from the browser so the stop condition is testable. Getting it wrong in
 *  either direction is expensive: stopping early silently drops documents while looking like a
 *  complete answer, and never stopping hangs a research run. */
export function shouldContinuePaging(currentPage: number, totalPages: number, pagesRead: number): boolean {
  if (!Number.isFinite(currentPage) || !Number.isFinite(totalPages)) return false;
  if (pagesRead >= TYLER_MAX_PAGES) return false;
  return currentPage < totalPages;
}

/** Say plainly whether a paged read got everything.
 *
 *  A short answer that claims to be complete is worse than a short answer that admits it is not. */
export function describeCompleteness(
  county: string,
  parsed: number,
  pagesRead: number,
  totalPages: number | null,
  totalResults: number | null,
): string {
  const parts = [`${county}: ${parsed} document(s) across ${pagesRead} page(s).`];
  if (totalPages !== null && pagesRead < totalPages) {
    parts.push(`INCOMPLETE — the portal reported ${totalPages} page(s) but only ${pagesRead} were read.`);
  }
  if (totalResults !== null && parsed < totalResults) {
    parts.push(`The portal reported ${totalResults} total result(s); ${parsed} were parsed.`);
  }
  return parts.join(' ');
}
