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
// ── WHAT IS NOT PROVEN, AND WHY NOTHING HERE IS ROUTED ──────────────────────────────────────────
//
// That POST returns `totalPages: 0` for SMITH — a name the autocomplete proves is in the index, on
// a county with 169 years of records. No validation messages, so the server accepted the query and
// answered "nothing".
//
// An empty answer that contradicts the index is exactly the failure this whole document exists to
// close. The most likely cause is that deep-linking to /search/<ID> skips a session step the
// disclaimer sets, so the backend answers without permission to return rows — but that is a
// HYPOTHESIS, and a hypothesis is not a county's records.
//
// So: these URLs are recorded as LOCATED. `tyler` stays out of PROVEN_VENDORS, no county routes
// here, and none of the nine is claimed as covered. Listing them as working on the strength of a
// 200 and a well-formed form is the precise mistake that produced 53 fictional Kofile counties.

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
  | { state: 'empty_but_suspect'; statement: string }
  | { state: 'has_results'; totalPages: number; statement: string };

/** Read the search response WITHOUT converting an unexplained zero into "no records".
 *
 *  `indexKnowsTerm` is what the autocomplete said. When the index contains the name and the search
 *  returns nothing, those two facts contradict each other, and the contradiction — not the zero —
 *  is the finding. */
export function readSearchOutcome(
  res: TylerSearchResponse,
  county: string,
  indexKnowsTerm: boolean,
): TylerOutcome {
  const messages = Object.keys(res.validationMessages ?? {});
  if (messages.length > 0) {
    return {
      state: 'rejected',
      statement: `${county}: the portal REJECTED the search (${messages.join(', ')}). Not an empty index — a malformed query.`,
    };
  }

  if (res.totalPages > 0) {
    return {
      state: 'has_results',
      totalPages: res.totalPages,
      statement: `${county}: ${res.totalPages} page(s) of results.`,
    };
  }

  if (indexKnowsTerm) {
    return {
      state: 'empty_but_suspect',
      statement:
        `${county}: search returned totalPages=0, but the portal's own autocomplete knows this name. ` +
        `Those two facts contradict each other, so this is UNREAD, not empty. Do not record "no records found".`,
    };
  }

  return {
    state: 'empty_but_suspect',
    statement:
      `${county}: search returned totalPages=0 and the index was not independently confirmed to know the term. ` +
      `Tyler results have never been driven successfully — treat as unread until one search is proven to return rows.`,
  };
}

/** Is any Tyler county safe to route to yet? */
export const TYLER_RESULTS_PROVEN = false;
