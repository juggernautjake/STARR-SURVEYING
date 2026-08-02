// worker/src/adapters/uslandrecords-discovery.ts — a third vendor, two more counties (plan R39).
//
// Found 2026-08-02 by reading Falls County's and Robertson County's own clerk pages. The platform
// had no name for this one either: Avenu/Neumo's "20/20 Perfect Vision Land Records", served from
// per-county subdomains of uslandrecords.com.
//
//     Falls      https://i2i.uslandrecords.com/TX/Falls/D/        30 miles from Bell (Marlin)
//     Robertson  https://i2j.uslandrecords.com/TX/Robertson/D/    45 miles from Bell (Franklin)
//
// The subdomain is NOT derivable from the county name — Falls is `i2i` and Robertson is `i2j`.
// Every other county tried on those subdomains 404s. Each has to be found from the county's site,
// which is the R39 method and the reason this file lists two counties rather than a pattern.
//
// ── WHAT IS PROVEN ──────────────────────────────────────────────────────────────────────────────
//
//   * Both portals load and render a Real Property name-search form with no login.
//   * Searching is FREE. The site says so: "Searching and watermarked document viewing is provided
//     as a free service." Printing and downloading are charged ($1.00 for the first 10 pages,
//     $0.10/page after; search results $1.50/page).
//   * The form fields are ASP.NET WebForms names (see USLR_FIELDS).
//   * Each county states its own certified coverage, and the two DISAGREE by 170 years — see below.
//
// ── DRIVEN, ONCE THE CLICK WAS TRUSTED ──────────────────────────────────────────────────────────
//
// This file first recorded that results "open in a popup window" which closed before navigating.
// Wrong. That popup was the site testing whether pop-ups are allowed. The real reason nothing
// happened is smaller and more embarrassing: the form submits via an <input type="submit">, and a
// SYNTHETIC click — page.evaluate(() => el.click()) — does not submit it. No POST was ever sent. A
// trusted click, page.click(), submits immediately.
//
// The symptom is worth remembering because it looks like the wrong thing: no POST, no error, no
// change. That reads as "the site is broken" when it means "our click was not real".
//
// With that fixed, both counties return records:
//
//     Robertson  SMITH JAMES   239 rows, earliest 01/22/1870
//     Falls      SMITH JAMES    40 rows, earliest 06/03/1971
//
// Falls's earliest result landing in 1971 is the coverage claim below confirmed by data rather than
// by a banner.
//
// ── A THIRD WAY TO SAY "TOO BROAD" ──────────────────────────────────────────────────────────────
//
// A bare surname across 1800–2026 returns a modal — "Your search has reached the configured timeout
// period. Please narrow your search criteria" — and no rows. Unhandled, that is indistinguishable
// from "this name owns nothing in this county": the same defect as Kofile's empty department and
// Tyler's totalPages: 0, wearing a third costume in a single day. See readResults().

/** County → subdomain. Verified individually; the letters are not a sequence to extrapolate. */
export const USLR_COUNTIES: Record<string, { subdomain: string; fips: string }> = {
  Falls: { subdomain: 'i2i', fips: '48145' },
  Robertson: { subdomain: 'i2j', fips: '48395' },
};

export function uslrUrl(county: string): string | null {
  const e = USLR_COUNTIES[county.replace(/\s+county$/i, '').trim()];
  return e ? `https://${e.subdomain}.uslandrecords.com/TX/${county.replace(/\s+county$/i, '').trim()}/D/` : null;
}

/** ASP.NET WebForms field names, read off the live forms on 2026-08-02. */
export const USLR_FIELDS = {
  lastName: 'SearchFormEx1$ACSTextBox_LastName1',
  firstName: 'SearchFormEx1$ACSTextBox_FirstName1',
  partyType: 'SearchFormEx1$ACSRadioButtonList_PartyType1',
  search: 'SearchFormEx1$btnSearch',
  office: 'SearchCriteriaOffice1$DDL_OfficeName',
  searchType: 'SearchCriteriaName1$DDL_SearchName',
} as const;

/** The popup was a pop-up-blocker test, not the results target. Results render in the page. */
export const USLR_RESULTS_IN_POPUP = false;

/** A synthetic click does not submit this form; only a trusted one does. */
export const USLR_REQUIRES_TRUSTED_CLICK = true;

/** Driven end to end on 2026-08-02 for both counties. */
export const USLR_RESULTS_PROVEN = true;

/** What each county's index actually covers, quoted from its own certification banner. */
export interface Coverage {
  from: string;
  to: string;
  lastDocument: string;
  lastRecorded: string;
}

export const USLR_COVERAGE: Record<string, Coverage> = {
  Robertson: { from: '01/01/1800', to: '07/30/2026', lastDocument: '20263237', lastRecorded: '07/31/2026' },
  Falls: { from: '09/23/1970', to: '07/30/2026', lastDocument: '23447', lastRecorded: '07/31/2026' },
};

/** The year before which a county's online index simply does not reach. */
export function indexBegins(county: string): Date | null {
  const c = USLR_COVERAGE[county.replace(/\s+county$/i, '').trim()];
  if (!c) return null;
  const [m, d, y] = c.from.split('/').map(Number);
  return new Date(y, m - 1, d);
}

/** Is a search window inside what this county actually indexes?
 *
 *  Falls begins at 09/23/1970 while Robertson begins at 01/01/1800 — the same vendor, 170 years
 *  apart. A 1940 Falls deed is NOT in this index, and a search for it returns nothing. Without this
 *  check that nothing becomes "this property has no deeds before 1970", which is a statement about
 *  Falls County's website presented as a statement about the land.
 *
 *  Paper records for those years exist at the courthouse; they are simply not online. */
export function coverageWarning(county: string, from: Date): string | null {
  const begins = indexBegins(county);
  if (!begins || from >= begins) return null;
  const c = USLR_COVERAGE[county.replace(/\s+county$/i, '').trim()];
  return (
    `${county}: the online index begins ${c.from}, but the search starts ${from.toLocaleDateString('en-US')}. ` +
    `Anything earlier is NOT in this index and an empty result says nothing about whether the deed exists — ` +
    `those years are on paper at the courthouse. Report as UNSEARCHABLE ONLINE, never as "no records".`
  );
}
