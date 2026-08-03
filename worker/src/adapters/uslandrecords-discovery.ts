// worker/src/adapters/uslandrecords-discovery.ts — a third vendor, and now nineteen counties
// (plan R39, extended by S-7 on 2026-08-03).
//
// Found 2026-08-02 by reading Falls County's and Robertson County's own clerk pages. The platform
// had no name for this one either: Avenu/Neumo's "20/20 Perfect Vision Land Records", served from
// per-county subdomains of uslandrecords.com.
//
//     Falls      https://i2i.uslandrecords.com/TX/Falls/D/        30 miles from Bell (Marlin)
//     Robertson  https://i2j.uslandrecords.com/TX/Robertson/D/    45 miles from Bell (Franklin)
//
// The subdomain is NOT derivable from the county name — Falls is `i2i` and Robertson is `i2j`.
// Every other county tried on those subdomains 404s. Each had to be found from the county's own
// site, which is the R39 method and the reason this file once listed two counties rather than a
// pattern.
//
// ── S-7: THE OTHER SEVENTEEN WERE ALREADY PUBLISHED, ON A PAGE WE HAD MISREAD ────────────────────
//
// S-7 was planned as "build a texaslandrecords.com adapter — 23 counties, free index". It is not an
// adapter. `texaslandrecords.com/txlr/TxlrApp/index.jsp` is a **county directory**: its county list
// is 22 ordinary <a href>s pointing at the very uslandrecords.com portals this file already drives,
// plus three Kofile portals. There is no second system behind it and nothing to parse.
//
// What it is instead is the lookup table the R39 method said did not exist — the mapping from county
// to subdomain that "has to be found from the county's site, one at a time". Avenu publishes it.
// That turns a slice's worth of adapter work into a county-list expansion:
//
//     i2i   Angelina, Bandera, Castro, Cherokee, Cooke, Duval, Edwards, Falls, Hutchinson,
//           Madison, Marion
//     i2j   McMullen, Robertson, Rusk, San Jacinto, Upton, Wilbarger
//     i2m   San Augustine
//     i2g   Val Verde
//
// Note i2m and i2g: two subdomains beyond the i2i/i2j pair, which is the strongest evidence yet
// that the letters are not a sequence. Both were driven end to end on 2026-08-03 before being
// listed — Val Verde SANCHEZ MARIA returned 313 rows, San Augustine THOMAS JOHN returned 44 rows
// reaching back to **1838** — and both render the identical grid the parser here already reads.
//
// The three counties on that page that are NOT this vendor (Cochran, Leon, Live Oak) are Kofile
// `*.tx.publicsearch.us` portals and belong in KOFILE_FIPS_SET, not here. Leon was already listed;
// Cochran and Live Oak were checked for a **Real Property** department before being added, because
// Williamson taught this codebase that a Kofile portal answering 200 may index only Commissioners
// Court.
//
// ── A PROBE THAT REPORTED A LIVE SITE AS DEAD ───────────────────────────────────────────────────
//
// Sixteen of these were confirmed with `fetch()`. Marion failed it twice — `fetch failed`, no
// status — and would have been written off as unreachable. Opened in a real browser it loads fine:
// the portal bounces through `?AspxAutoDetectCookieSupport=1`, and Node's fetch does not survive
// that redirect.
//
// Worth writing down because it inverts the usual caution here. The rule in this codebase is that a
// county belongs in a routing table only because its portal ANSWERED — but that rule is only as good
// as the thing doing the asking. A cheap probe can manufacture a dead site just as easily as a
// careless one can manufacture a live record, and "we could not reach it" is itself a claim that
// needs the right instrument. Anything this probe calls dead gets a browser before it is believed.
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

/** County → subdomain and URL path segment.
 *
 *  Every entry was probed on 2026-08-03 and rendered the live search form; a county is here because
 *  its portal ANSWERED, never because the directory listed it.
 *
 *  `path` is separate from the county name on purpose. Avenu writes multi-word counties closed up —
 *  `San Jacinto` is `/TX/SanJacinto/`, `Val Verde` is `/TX/ValVerde/` — so deriving the path from
 *  the name would 404 on exactly the three counties added last, and a 404 here surfaces to the
 *  researcher as "no records found". */
export const USLR_COUNTIES: Record<string, { subdomain: string; fips: string; path: string }> = {
  Angelina:       { subdomain: 'i2i', fips: '48005', path: 'Angelina' },
  Bandera:        { subdomain: 'i2i', fips: '48019', path: 'Bandera' },
  Castro:         { subdomain: 'i2i', fips: '48069', path: 'Castro' },
  Cherokee:       { subdomain: 'i2i', fips: '48073', path: 'Cherokee' },
  Cooke:          { subdomain: 'i2i', fips: '48097', path: 'Cooke' },
  Duval:          { subdomain: 'i2i', fips: '48131', path: 'Duval' },
  Edwards:        { subdomain: 'i2i', fips: '48137', path: 'Edwards' },
  Falls:          { subdomain: 'i2i', fips: '48145', path: 'Falls' },
  Hutchinson:     { subdomain: 'i2i', fips: '48233', path: 'Hutchinson' },
  // Madison has TWO working portals: this one and a Kofile one already in KOFILE_FIPS_SET. Kofile
  // has routing priority and deserves it — it serves free watermarked page images, which this
  // vendor charges for. The entry stays because a second index of the same county is a real
  // fallback when the first is down, and because deleting it would make Madison look unavailable
  // here rather than merely outranked.
  Madison:        { subdomain: 'i2i', fips: '48313', path: 'Madison' },
  Marion:         { subdomain: 'i2i', fips: '48315', path: 'Marion' },
  McMullen:       { subdomain: 'i2j', fips: '48311', path: 'McMullen' },
  Robertson:      { subdomain: 'i2j', fips: '48395', path: 'Robertson' },
  Rusk:           { subdomain: 'i2j', fips: '48401', path: 'Rusk' },
  'San Jacinto':  { subdomain: 'i2j', fips: '48407', path: 'SanJacinto' },
  Upton:          { subdomain: 'i2j', fips: '48461', path: 'Upton' },
  Wilbarger:      { subdomain: 'i2j', fips: '48487', path: 'Wilbarger' },
  'San Augustine': { subdomain: 'i2m', fips: '48405', path: 'SanAugustine' },
  'Val Verde':    { subdomain: 'i2g', fips: '48465', path: 'ValVerde' },
};

/** Counties listed on texaslandrecords.com that are NOT this vendor.
 *
 *  They are Kofile `*.tx.publicsearch.us` portals and route through KofileClerkAdapter. Kept here
 *  because the directory is where they were found, and because a future reader checking "did we do
 *  everything on that page" should not have to rediscover why three of the 22 are missing. */
export const TXLR_KOFILE_COUNTIES: Record<string, string> = {
  Cochran: '48079',
  Leon: '48289',
  'Live Oak': '48297',
};

/** The Avenu directory that publishes the county → portal mapping. Not an adapter target — see the
 *  header. Recorded so the next person can re-read it when a county is added or moved. */
export const TXLR_DIRECTORY_URL = 'https://www.texaslandrecords.com/txlr/TxlrApp/index.jsp';

function countyKey(county: string): string {
  return (county ?? '').replace(/\s+county$/i, '').trim();
}

export function uslrUrl(county: string): string | null {
  const e = USLR_COUNTIES[countyKey(county)];
  return e ? `https://${e.subdomain}.uslandrecords.com/TX/${e.path}/D/` : null;
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

/** The grid serves 20 rows per page. */
export const USLR_PAGE_SIZE = 20;

/** A pager that never runs out would otherwise hang a research run. 239 rows is 12 pages; this is
 *  far beyond any real search and still bounded. */
export const USLR_MAX_PAGES = 100;

/** Say plainly whether a paged read got everything.
 *
 *  This vendor prints no "page X of Y" — only a "239 rows" counter — so completeness is measured
 *  against that count. Where the count is absent nothing is claimed, because asserting completeness
 *  from silence is how a partial answer starts looking like a whole one. */
export function describeUslrCompleteness(
  county: string,
  documents: number,
  rowsSeen: number,
  pagesRead: number,
  reportedRows: number | null,
): string {
  const parts = [`${county}: ${documents} document(s) from ${rowsSeen} party row(s) across ${pagesRead} page(s).`];
  parts.push('Party lists are PARTIAL — a name search returns only the parties that matched.');
  if (reportedRows === null) {
    parts.push('The grid did not state a total, so completeness is UNKNOWN — do not treat this as the whole result set.');
  } else if (rowsSeen < reportedRows) {
    parts.push(`INCOMPLETE — the grid reported ${reportedRows} row(s) but only ${rowsSeen} were read.`);
  }
  return parts.join(' ');
}

/** What each county's index actually covers, quoted from its own page.
 *
 *  `from`/`to`/`lastDocument`/`lastRecorded` come from the certification banner where the county
 *  publishes one. Three counties (Cherokee, Marion, Val Verde) state coverage only in prose on the
 *  welcome panel; for those, `from` is that prose date and `bannerless` is set.
 *
 *  `disputedFrom` is set when the SAME PAGE says two different things — see below. */
export interface Coverage {
  from: string;
  to: string;
  lastDocument: string;
  lastRecorded: string;
  /** The county states coverage in prose only; there is no certification banner to quote. */
  bannerless?: boolean;
  /** A second, LATER start date the same page also claims. Coverage between the two is uncertain. */
  disputedFrom?: string;
}

/** Read off each portal on 2026-08-03. Every date here is the county's own claim, not an inference
 *  from another county — assuming one county's coverage from another's is the mistake that made
 *  Falls and Robertson worth writing down in the first place. */
export const USLR_COVERAGE: Record<string, Coverage> = {
  Angelina:  { from: '12/13/1881', to: '07/29/2026', lastDocument: '473516', lastRecorded: '07/31/2026' },
  Bandera:   { from: '01/01/1856', to: '07/30/2026', lastDocument: '275911', lastRecorded: '07/31/2026' },
  Castro:    { from: '01/08/1800', to: '07/31/2026', lastDocument: '76762',  lastRecorded: '07/31/2026' },
  Cherokee:  { from: '08/20/1846', to: 'current',    lastDocument: '',       lastRecorded: '', bannerless: true },
  Cooke:     { from: '07/29/1850', to: '07/29/2026', lastDocument: '5845',   lastRecorded: '07/31/2026' },
  // Duval's banner certifies only through 07/31/2025 while its last recorded document is dated
  // 07/31/2026. Documents from the last year are in the index but OUTSIDE what the county certifies,
  // which is a real distinction for a title search and not ours to smooth over.
  Duval:     { from: '12/30/1975', to: '07/31/2025', lastDocument: '38992',  lastRecorded: '07/31/2026' },
  Edwards:   { from: '05/02/1871', to: '07/28/2026', lastDocument: '831',    lastRecorded: '07/31/2026' },
  Falls:     { from: '09/23/1970', to: '07/30/2026', lastDocument: '23447',  lastRecorded: '07/31/2026' },
  Hutchinson:{ from: '05/25/1954', to: '07/30/2026', lastDocument: '395696', lastRecorded: '07/30/2026' },
  Madison:   { from: '03/23/1838', to: '07/30/2026', lastDocument: '130660', lastRecorded: '07/31/2026' },
  Marion:    { from: '12/27/1954', to: 'current',    lastDocument: '',       lastRecorded: '', bannerless: true },
  McMullen:  { from: '01/01/1754', to: '07/28/2026', lastDocument: '94123',  lastRecorded: '07/28/2026' },
  Robertson: { from: '01/01/1800', to: '07/30/2026', lastDocument: '20263237', lastRecorded: '07/31/2026' },
  Rusk:      { from: '05/03/1832', to: '07/29/2026', lastDocument: '274243', lastRecorded: '07/31/2026' },
  // San Augustine's banner certifies from 01/01/1800; its welcome text says 01/02/1856. A THOMAS
  // JOHN search returned a Bill of Sale filed 2/26/1838 — inside the banner's range and outside the
  // prose's, so the prose is the wrong one. Both are recorded rather than resolved: the point of
  // this table is what the county claims, and a search landing between the two dates deserves to be
  // told the county contradicts itself instead of getting a confident answer either way.
  'San Augustine': { from: '01/01/1800', to: '07/31/2026', lastDocument: '91695', lastRecorded: '07/31/2026', disputedFrom: '01/02/1856' },
  'San Jacinto': { from: '01/01/1954', to: '07/28/2026', lastDocument: '20264485', lastRecorded: '07/31/2026' },
  Upton:     { from: '01/01/1984', to: '07/23/2026', lastDocument: '204306', lastRecorded: '07/31/2026' },
  'Val Verde': { from: '01/04/1982', to: 'current',  lastDocument: '',       lastRecorded: '', bannerless: true },
  Wilbarger: { from: '04/20/1917', to: '07/30/2026', lastDocument: '147254', lastRecorded: '07/31/2026' },
};

function parseCoverageDate(mdy: string): Date | null {
  const [m, d, y] = mdy.split('/').map(Number);
  return Number.isFinite(m) && Number.isFinite(d) && Number.isFinite(y) ? new Date(y, m - 1, d) : null;
}

/** The date before which a county's online index simply does not reach.
 *
 *  Where a county disputes its own start date this returns the EARLIER one. That direction is
 *  deliberate: `coverageWarning` uses it to decide whether to suppress trust in an empty result, and
 *  taking the later date would mark a searchable year unsearchable — San Augustine has a real 1838
 *  record its own welcome text says should not exist. The disputed span is reported separately
 *  rather than silently resolved. */
export function indexBegins(county: string): Date | null {
  const c = USLR_COVERAGE[countyKey(county)];
  return c ? parseCoverageDate(c.from) : null;
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
  const c = USLR_COVERAGE[countyKey(county)];
  const begins = indexBegins(county);
  if (!c || !begins) return null;

  if (from < begins) {
    return (
      `${county}: the online index begins ${c.from}, but the search starts ${from.toLocaleDateString('en-US')}. ` +
      `Anything earlier is NOT in this index and an empty result says nothing about whether the deed exists — ` +
      `those years are on paper at the courthouse. Report as UNSEARCHABLE ONLINE, never as "no records".`
    );
  }

  // Inside the earlier claim but before the later one the same page also makes. The search will run
  // and may well return records — San Augustine's do — but an EMPTY result here cannot be trusted,
  // because the county itself says these years might not be indexed.
  const disputed = c.disputedFrom ? parseCoverageDate(c.disputedFrom) : null;
  if (disputed && from < disputed) {
    return (
      `${county}: the county contradicts itself about this period. Its certification banner claims coverage from ` +
      `${c.from}, its welcome text says ${c.disputedFrom}, and the search starts ${from.toLocaleDateString('en-US')} — ` +
      `between the two. Records found here are real; an EMPTY result is UNCERTAIN, not "no records", because the ` +
      `county's own page says these years may not be indexed.`
    );
  }

  return null;
}

/** State how well a county's coverage is actually known.
 *
 *  Three counties publish no certification banner at all, so their start date comes from a sentence
 *  on the welcome panel and there is no "certified through" date to bound the other end. That is
 *  weaker evidence than a banner, and a report that presents both identically is overstating one of
 *  them. */
export function coverageConfidence(county: string): string | null {
  const c = USLR_COVERAGE[countyKey(county)];
  if (!c) return null;
  if (c.disputedFrom) {
    return `${county}: DISPUTED — the banner says ${c.from}, the welcome text says ${c.disputedFrom}. Treat the span between as uncertain.`;
  }
  if (c.bannerless) {
    return `${county}: STATED IN PROSE, not certified — the portal publishes no certification banner, so coverage from ${c.from} is the county's description rather than its certification, and there is no certified-through date.`;
  }
  return `${county}: CERTIFIED ${c.from} thru ${c.to} (last recorded document ${c.lastDocument} @ ${c.lastRecorded}).`;
}
