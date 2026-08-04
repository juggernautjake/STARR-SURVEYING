// worker/src/adapters/remaining-counties-survey.ts — the last six counties, hunted (plan R39).
//
// Bosque, Limestone, Bastrop, Hays, Lee and San Saba were the counties inside the 80-mile ring with
// no located portal. They were hunted individually, which is the only method left once no vendor URL
// pattern generalises.
//
// ── THE FINDING THAT MATTERS BEYOND THESE COUNTIES ──────────────────────────────────────────────
//
// R37 probed every CountyFusion base URL and concluded the vendor was unreachable. It is not. Our
// table had the wrong TLD:
//
//     WRONG   countyfusion7.kofiletech.com    ERR_NAME_NOT_RESOLVED — the domain does not exist
//     RIGHT   countyfusion7.kofiletech.us     200, "Neumo Records County Access Portal"
//
// All twelve numbered hosts answer on `.us`. So "all 54 vendor URLs are dead" was, in this vendor's
// case, a fact about a typo in our own registry.
//
// A second lesson sits underneath it: the sweep used `fetch`, and `fetch` fails on these hosts with
// ERR_HTTP2_STREAM_ERROR even though a browser loads them fine. A negative result from the wrong
// client is not evidence the site is down — the same shape of error as a negative result from a
// guessed URL, and it cost this project a whole vendor.
//
// CountyFusion still is NOT routed: every per-county entry point is a username/password login and
// no credentials exist. "The host is alive" and "we can read records" are different claims.

export interface CountySurvey {
  fips: string;
  /** What was actually found.
   *
   *  `no_online_portal` and `not_found` are deliberately different. The first is a conclusion —
   *  the county does not publish its land records online. The second is an admission that the
   *  search is unfinished. Collapsing them would turn "we stopped looking" into "there is nothing
   *  there", which is this document's defect in its purest form. */
  status:
    | 'open_partial'
    | 'login_required'
    | 'paywalled'
    /** Located, but the index sits behind a captcha. See `captcha_gated` below. */
    | 'captcha_gated'
    | 'no_online_portal'
    | 'not_found';
  url: string | null;
  /** Years the free path actually covers, when it is known. */
  freeCoverage?: string;
  /** What blocks the rest. */
  blocker?: string;
  note: string;
}

export const REMAINING_COUNTY_SURVEY: Record<string, CountySurvey> = {
  Bosque: {
    fips: '48035',
    status: 'open_partial',
    url: 'https://kofilequicklinks.com/Bosque/',
    freeCoverage: '1847–1905 (deed index books and volumes)',
    blocker: 'See BOSQUE_GAP — 1906–2011 is not in either free index.',
    note:
      'TWO free portals, and a hole between them. Kofile QuickLink is FULLY OPEN — no login, no ' +
      'payment — for the historical deed books (type/year/party, plus book/volume/page). iDocMarket ' +
      'carries the modern index and its Basic Search also opens without a login, but it starts in ' +
      '2012. For boundary work the early deeds are often the operative ones, so the historical window ' +
      'is worth more than its year count suggests.',
  },
  Limestone: {
    fips: '48293',
    status: 'login_required',
    url: 'https://countyfusion10.kofiletech.us/countyweb/login.do?countyname=LimestoneTX',
    blocker: 'Username/password login; no guest entry found on the page.',
    note:
      'Records stated as 1861 to present. The portal is live and is the proof that CountyFusion was ' +
      'never dead — only our TLD was wrong. Not routed: no credentials.',
  },
  Bastrop: {
    fips: '48021',
    status: 'open_partial',
    url: 'http://www.cc.co.bastrop.tx.us/RealEstate/SearchEntry.aspx',
    freeCoverage: '1973–2026 (permanent index; images from 1973)',
    blocker: 'Pre-1973 is not online at all. Adapter class AumentumClerkAdapter now exists and Bastrop routes to it.',
    note:
      'A FOURTH vendor: Harris Recording Solutions / Aumentum Recorder. Entry is as "Visitor" with NO ' +
      'login once the disclaimer is acknowledged. Driven on 2026-08-02: party search "SMITH" returned ' +
      '100 records with instrument number, book/page, filing date, document type, [R]/[E] party role ' +
      'markers and survey names. Two traps had to be cleared first — see BASTROP_TRAPS.',
  },
  Hays: {
    fips: '48209',
    status: 'captcha_gated',
    url: 'https://erss.co.hays.tx.us/web/search/DOCSEARCH149S1',
    blocker: 'Google reCAPTCHA v2 on the disclaimer; #submitDisclaimerAccept is disabled until solved.',
    note:
      'FOUND 2026-08-04 (R39). Was "not_found" — Henschen names Hays as theirs and no Henschen host ' +
      'resolves. It is a Tyler Eagle county, the same software already driven for nine others, but on ' +
      'a hostname the Tyler pattern cannot produce: the pattern builds ' +
      '<county>countytx-web.tylerhost.net and Hays hosts it at its own erss.co.hays.tx.us. Found by ' +
      "walking the county's own clerk page, which is the fourth time that has worked and the fourth " +
      'time a URL pattern has not. ' +
      'NOT ROUTED, and not because we could not: per R12 a captcha is refused until the county terms ' +
      'are read and a posture is agreed. Falls through to TexasFile.',
  },
  Lee: {
    fips: '48287',
    status: 'no_online_portal',
    url: 'https://www.co.lee.tx.us/',
    note:
      'NETR lists the clerk as "Website Only" and the county site carries no records search. Lee ' +
      'appears to have NO online land-records portal — a different fact from "we have not found it". ' +
      'The path here is TexasFile or the courthouse in Giddings.',
  },
  'San Saba': {
    fips: '48411',
    status: 'no_online_portal',
    url: 'https://www.co.san-saba.tx.us/page/sansaba.county.clerk',
    note:
      'NETR lists the clerk as "Website Only" and the clerk page carries no records search. No online ' +
      'land-records portal found. TexasFile or the courthouse in San Saba.',
  },
};

// ── THE THREE OTHER "DEAD" VENDORS ARE GENUINELY DEAD ───────────────────────────────────────────
//
// After the CountyFusion typo, every URL R37 declared dead was re-probed in a real BROWSER rather
// than with fetch. The verdict held for all three:
//
//     Henschen   16/16  ERR_NAME_NOT_RESOLVED — `<county>.co.texas.us` does not exist as a pattern
//     iDocket    18/18  HTTP 404 — the host resolves, the paths do not
//     Fidlar      6/6   ERR_NAME_NOT_RESOLVED
//
// So R37 was right about these and wrong only about CountyFusion. Recorded so nobody re-runs the
// sweep hoping the browser will find something: it already has been re-run, this way.
//
// iDocket carries a second correction. `online.idocket.com` is alive and is **Judicial Case
// Search** — court cases, not land records. It was never a deeds vendor, so its counties belonged
// in a clerk-deeds registry only by mistake.

/** Confirmed dead in a browser on 2026-08-02, not merely by fetch. */
export const BROWSER_CONFIRMED_DEAD: Record<string, { urls: number; failure: string }> = {
  henschen: { urls: 16, failure: 'ERR_NAME_NOT_RESOLVED' },
  idocket: { urls: 18, failure: 'HTTP 404' },
  fidlar: { urls: 6, failure: 'ERR_NAME_NOT_RESOLVED' },
};

/** iDocMarket — the land-records product, found while re-probing iDocket.
 *
 *  Its Basic Search opens without a login. Seven Texas counties, of which only Bosque is inside the
 *  80-mile ring; the rest are recorded because finding them cost nothing and re-finding them would. */
export const IDOCMARKET_TX_COUNTIES: Record<string, string> = {
  Bosque: 'BOSTX1',
  Glasscock: 'GLATX1',
  Hartley: 'HARTX1',
  Hemphill: 'HEMTX1',
  Lamb: 'LAMTX1',
  Reagan: 'REATX1',
  Sutton: 'SUTTX1',
};

export function idocMarketSearchUrl(county: string): string | null {
  const code = IDOCMARKET_TX_COUNTIES[county.replace(/\s+county$/i, '').trim()];
  return code ? `https://www.idocmarket.com/${code}/Document/Search` : null;
}

// ── iDOCMARKET, DRIVEN ──────────────────────────────────────────────────────────────────────────
//
// Bosque, 2026-08-02: party "SMITH" → "Showing: 1000 of 3639 results", no login. Records render as
// `div.row`, not table rows:
//
//     DEED #2026-02531  7/28/2026  5 Pages  MAIN KELLY  GUILD MORTGAGE COMPANY LLC  View »
//
// i.e. document type, instrument number, recorded date, page count, then the two parties.
//
// ── THIS VENDOR TRUNCATES HONESTLY ──────────────────────────────────────────────────────────────
//
// Four vendors in this build cap their results, and they differ entirely in how they say so:
//
//     Tyler        a banner       "more documents than the maximum allowed"
//     Avenu        a modal        "reached the configured timeout period"
//     iDocMarket   a COUNT        "Showing: 1000 of 3639 results"
//     Aumentum     NOTHING        100 rows and a counter that reads like an answer
//
// iDocMarket's is the only one that states both numbers, so a caller knows exactly how much is
// missing rather than merely that something is. Worth naming, because the platform's job is to
// preserve that distinction rather than flatten every cap into "here are the results".

export const IDOCMARKET_PAGE_CAP = 1000;

/** "Showing: 1000 of 3639 results" */
export const IDOCMARKET_SHOWING = /Showing:\s*([\d,]+)\s*of\s*([\d,]+)\s*results/i;

export interface ShowingCount {
  shown: number;
  total: number;
  truncated: boolean;
}

export function parseShowing(pageText: string): ShowingCount | null {
  const m = IDOCMARKET_SHOWING.exec(pageText ?? '');
  if (!m) return null;
  const shown = Number(m[1].replace(/,/g, ''));
  const total = Number(m[2].replace(/,/g, ''));
  return { shown, total, truncated: shown < total };
}

/** Say how much of the result set was actually returned.
 *
 *  Unlike Aumentum's silent cap, both numbers are known here — so the statement can be exact
 *  instead of a warning that something might be missing. */
export function describeShowing(county: string, pageText: string): string | null {
  const s = parseShowing(pageText);
  if (!s) return null;
  if (!s.truncated) return `${county}: all ${s.total} result(s) returned.`;
  return (
    `${county}: TRUNCATED — the portal returned ${s.shown} of ${s.total} result(s), so ${s.total - s.shown} ` +
    `are missing. Narrow the search (date range, document type, fuller name) before treating this as complete.`
  );
}

/** Bosque's two free indexes do not meet.
 *
 *  QuickLink stops in 1905; iDocMarket starts in 2012. A deed recorded in 1950 is in NEITHER, and
 *  both searches return nothing. Two empty results look like a thorough search that found nothing —
 *  which is the most convincing possible way to be wrong about whether a deed exists. */
export const BOSQUE_GAP = { from: 1906, to: 2011 } as const;

export function bosqueGapWarning(year: number): string | null {
  if (year < BOSQUE_GAP.from || year > BOSQUE_GAP.to) return null;
  return (
    `Bosque: ${year} falls in the gap between the two free indexes — QuickLink ends 1905 and ` +
    `iDocMarket begins 2012. BOTH will return nothing, and two empty results are not evidence the ` +
    `deed does not exist. Records for ${BOSQUE_GAP.from}–${BOSQUE_GAP.to} must be obtained from the ` +
    `clerk in Meridian or through a paid iDocMarket subscription.`
  );
}

// ── THE TWO TRAPS THAT HID BASTROP ──────────────────────────────────────────────────────────────
//
// The search looked broken for three attempts. Neither cause was visible from the outside, and both
// produce the same symptom as a county with no records: a form that submits and returns nothing.
//
// 1. THE BUTTON HAS NO BOX. `#cphNoMargin_SearchButtons1_btnSearch` is an <input> with width 0,
//    height 0 and z-index -1. Playwright refuses to click it — correctly, since it is not a visible
//    target. Aumentum renders buttons as table composites and the real clickable surface is a <td>
//    whose id is the input's id plus `__5`. Clicking that works.
//
// 2. THE TEXTBOX IS A WATERMARK FIELD. Its value is literally "Lastname Firstname" until a focus
//    handler clears it. `page.fill()` sets `.value` without triggering that handler, so the
//    watermark survives, the form posts "Lastname Firstname" as the search term, and the server
//    answers "Please enter search criteria." — a validation message that never reaches a scraper
//    reading only the results area.
//
//    The fix is to click the field, clear it, and TYPE with real key events.
//
// Both belong to the same family as the trusted-click trap on Avenu: a programmatic shortcut that
// looks like it worked, on a page that then behaves as though nothing was entered.

export const BASTROP_TRAPS = {
  /** The <input> is 0×0; click this <td> instead. */
  searchButtonSelector: '#cphNoMargin_SearchButtons1_btnSearch__5',
  /** The value the field holds before anybody types into it. */
  partyWatermark: 'Lastname Firstname',
  partyField: '#cphNoMargin_f_txtParty',
  /** What the server says when the watermark is submitted as the search term. */
  watermarkValidation: 'Please enter search criteria.',
  /** Party role markers in the results grid. */
  roleMarkers: { grantor: 'R', grantee: 'E' },
} as const;

/** Is a value actually a search term, or just the watermark the page shipped with? */
export function isRealSearchTerm(value: string): boolean {
  const v = (value ?? '').trim();
  if (!v) return false;
  return v.toLowerCase() !== BASTROP_TRAPS.partyWatermark.toLowerCase();
}

/** The CountyFusion host that actually answers. */
export const COUNTYFUSION_HOST = (n: number): string => `https://countyfusion${n}.kofiletech.us/countyweb/`;

/** All twelve answered 200 on 2026-08-02. */
export const COUNTYFUSION_LIVE_HOSTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** The TLD the registry had, which does not resolve at all. */
export const COUNTYFUSION_WRONG_TLD = 'kofiletech.com';
export const COUNTYFUSION_RIGHT_TLD = 'kofiletech.us';

/** Is a county's free path good enough to answer a given search?
 *
 *  Bosque's free window stops in 1905. Searching it for a 1995 deed returns nothing, and reporting
 *  that as "no deed" would be wrong twice over: the deed exists, and we know exactly where it is
 *  (iDocMarket, behind a fee). Saying so turns a wrong answer into a purchasing decision. */
export function freePathWarning(county: string, year: number): string | null {
  const s = REMAINING_COUNTY_SURVEY[county];
  if (!s || s.status !== 'open_partial' || !s.freeCoverage) return null;

  const range = /(\d{4})\s*[–-]\s*(\d{4})/.exec(s.freeCoverage);
  if (!range) return null;
  const [from, to] = [Number(range[1]), Number(range[2])];
  if (year >= from && year <= to) return null;

  return (
    `${county}: the FREE index covers ${from}–${to}; ${year} is outside it. ` +
    `${s.blocker ?? ''} An empty result here means the record is not in the free window — NOT that it does not exist.`
  ).trim();
}

/** A one-line statement per county, so a run can say what it could and could not reach. */
export function describeCounty(county: string): string {
  const s = REMAINING_COUNTY_SURVEY[county];
  if (!s) return `${county}: not surveyed.`;
  switch (s.status) {
    case 'open_partial':
      return `${county}: free portal at ${s.url}, covering ${s.freeCoverage}. ${s.blocker ?? ''}`.trim();
    case 'login_required':
      return `${county}: portal located at ${s.url} but it requires a login we do not have. Reachable, not readable.`;
    case 'paywalled':
      return `${county}: records exist behind a paywall (${s.url}). The absence of ACCESS, not the absence of records.`;
    case 'no_online_portal':
      // A conclusion, not a gap in our effort — but still says nothing about whether deeds exist.
      return (
        `${county}: this county appears to publish NO land records online. The records exist on paper ` +
        `at the courthouse, and TexasFile indexes them. Never report a search here as "no records".`
      );
    default:
      return `${county}: no portal located yet. This is an unfinished search, NOT a county without records.`;
  }
}
