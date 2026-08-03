// worker/src/adapters/texasfile-access.ts — a paywall is not an empty index (plan R38).
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// After the vendor sweep, TexasFile is the fallback for 233 of the 254 Texas counties — every county
// without a verified Kofile portal. Driving it on 2026-08-02 showed what actually happens:
//
//   1. The adapter's URL shape (`/search?county=48027&grantor=SMITH`) is IGNORED. The site redirects
//      to its generic landing page and shows nothing.
//   2. The real per-county page is slug-based: `/search/texas/bell-county/county-clerk-records/`.
//   3. A search there DOES work and DOES report a count — "We found 5000 records matching your
//      search for Name: SMITH in Bell County" — and then redirects to `/register/` to view them.
//
// So for 233 counties the platform reaches a paywall. Without this module that arrives as an empty
// result, and an empty result reads as **"this property has no records"** — the same failure the
// dead vendor URLs produced, on a far larger share of the state.
//
// The count is the useful part: TexasFile states how many records exist BEFORE asking for money.
// "5,000 records exist here and we cannot open them" is a purchasing decision. "No records found"
// is a wrong answer.

/** Slug TexasFile uses in its per-county URLs. `Bell` → `bell-county`. */
export function countySlug(countyName: string): string {
  return `${countyName.trim().toLowerCase().replace(/\s+county$/, '').replace(/[^a-z0-9]+/g, '-')}-county`;
}

export function countyRecordsUrl(countyName: string): string {
  return `https://www.texasfile.com/search/texas/${countySlug(countyName)}/county-clerk-records/`;
}

/** The real form field names, read off the live page. A Django form — the hidden
 *  `csrfmiddlewaretoken` and `selected_counties` must be preserved, which is why the search is driven
 *  through the form rather than by constructing a URL. */
export const TEXASFILE_FIELDS = {
  name: 'name-0-name',
  nameType: 'name-0-name_type',
  secondName: 'name-1-name',
  synonymSearch: 'synonym_search',
  instrumentNumber: 'number-0-number',
  volume: 'bvp-0-volume',
  page: 'bvp-0-page',
  book: 'bvp-0-book',
  selectedCounties: 'selected_counties',
  csrf: 'csrfmiddlewaretoken',
} as const;

export type AccessState =
  /** Results are visible and parseable. */
  | 'open'
  /** The search ran, the site knows how many records match, and wants an account to show them. */
  | 'paywalled'
  /** The search genuinely returned nothing. */
  | 'empty'
  /** We could not tell — treat as unread, never as empty. */
  | 'unknown';

export interface AccessResult {
  state: AccessState;
  /** How many records TexasFile says exist. Available even when paywalled, which is the point. */
  recordCount: number | null;
  statement: string;
  /** What would change the answer. */
  nextStep: string;
}

/** Read TexasFile's own words. Its register page states the count before asking for payment. */
const COUNT_RE = /found\s+([\d,]+)\s+record/i;
const PAYWALL_RE = /register below or login to view|login to view your results|\/register\//i;
const EMPTY_RE = /no records (were )?found|0 records|did not match any/i;

export function readAccess(pageUrl: string, bodyText: string, countyName: string): AccessResult {
  const countMatch = bodyText.match(COUNT_RE);
  const recordCount = countMatch ? Number(countMatch[1]!.replace(/,/g, '')) : null;

  if (PAYWALL_RE.test(bodyText) || /\/register\//.test(pageUrl)) {
    return {
      state: 'paywalled',
      recordCount,
      // The distinction that matters: the county HAS records, we simply cannot open them.
      statement: recordCount != null
        ? `TexasFile reports ${recordCount.toLocaleString()} matching record(s) in ${countyName} County but requires an account to view them. This is a paywall, NOT an empty index — the records exist.`
        : `TexasFile requires an account to view results for ${countyName} County. Whether records matched is unknown; this is a paywall, not an empty index.`,
      nextStep:
        'Add TexasFile credentials (TEXASFILE_USERNAME / TEXASFILE_PASSWORD), or research this county ' +
        'through its own clerk portal if one exists.',
    };
  }

  if (EMPTY_RE.test(bodyText)) {
    return {
      state: 'empty', recordCount: 0,
      statement: `TexasFile searched ${countyName} County and found no matching records.`,
      nextStep: '',
    };
  }

  if (recordCount != null && recordCount > 0) {
    return {
      state: 'open', recordCount,
      statement: `${recordCount.toLocaleString()} record(s) in ${countyName} County.`,
      nextStep: '',
    };
  }

  return {
    state: 'unknown', recordCount: null,
    // Never 'empty'. An unreadable page and an empty index are opposite facts.
    statement: `Could not tell whether TexasFile returned results for ${countyName} County. Treat as unread, not as empty.`,
    nextStep: 'Open the search by hand and see what the page says.',
  };
}

export interface CoverageWarning {
  blocked: boolean;
  statement: string;
}

/** Called before a run reaches for TexasFile, so the limitation is stated up front rather than
 *  discovered as an empty result 20 minutes in. */
export function credentialWarning(hasCredentials: boolean, countyName: string): CoverageWarning {
  if (hasCredentials) return { blocked: false, statement: '' };
  return {
    blocked: true,
    statement:
      `${countyName} County has no verified free portal, so research falls back to TexasFile — a ` +
      'subscription service with no credentials configured. Any search will reach a paywall. ' +
      'Anything this run reports about this county is the absence of ACCESS, not the absence of records.',
  };
}

export function hasTexasFileCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.TEXASFILE_USERNAME && env.TEXASFILE_PASSWORD);
}
