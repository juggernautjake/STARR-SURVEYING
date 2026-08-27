// lib/research/portal-watch.ts — hearing that a county portal is moving BEFORE a run hits the wall
//
// Plan §I3 item 3. The self-heal sweep already answers "did an adapter break?" — it probes, compares
// a DOM fingerprint against a canary, and classifies the result. That is a **lagging** signal by
// construction: something has to break before it can say so, and by then a research run has already
// failed and somebody is reading a stack trace.
//
// Counties announce these migrations. "Bell County Clerk will transition to a new records search
// system effective October 1" sits on a .gov page for weeks before the old URL stops answering. This
// module is the **leading** half: same question, asked earlier, so an adapter update can be planned
// instead of triaged.
//
// ── THE ONLY HARD PROBLEM HERE IS FALSE POSITIVES ───────────────────────────────────────────────
//
// Searching "<county> clerk records portal new system" ALWAYS returns something. The vendors sell
// exactly this product, so their marketing pages match every query perfectly; every county has a
// generic "Records Search" landing page; and an announcement from 2019 reads identically to one from
// last week. A watcher that reports all of those as "migration detected" is a false-positive machine,
// and a false-positive machine gets ignored within a fortnight — which leaves the system worse off
// than having no watcher, because now there is an alert everyone has learned to skip.
//
// So the classification below is deliberately strict, and every rule is a way of saying no:
//
//   1. **The county must be named.** A page about migrations in general is not about this county.
//   2. **Migration vocabulary must appear**, not merely records-portal vocabulary. "Search records
//      online" is what a portal says every day of its life; "transitioning to", "effective", "will
//      replace" is what one says when it is about to move.
//   3. **A vendor's own domain is evidence of marketing, not of a migration.** Kofile's product page
//      names counties, uses migration words, and means nothing. Demoted, never promoted.
//   4. **A date must be present, and old dates are demoted.** An announcement with no date cannot be
//      told apart from an announcement from six years ago.
//
// Nothing here concludes that a migration IS happening. The output is a ranked "worth ten minutes"
// list with the sentence that triggered it, because the judgement is a person's and the cost of
// being wrong is asymmetric: a missed migration costs a failed run, and a cried-wolf alert costs the
// alert.

import { tavilySearch, type OpenWebResult, type TavilySearchOptions } from '@/lib/research/open-web';

// ── Queries ─────────────────────────────────────────────────────────────────────────────────────

export interface PortalWatchTarget {
  /** "Bell" — not "Bell County"; the suffix is added where it belongs. */
  county: string;
  state?: string;
  /** The vendor currently serving this county, when known. Lets the watch ask the sharper question:
   *  not "is something changing" but "is this county leaving Kofile". */
  currentVendor?: string;
}

export interface PortalWatchQuery {
  query: string;
  /** For the run log. A query nobody can explain is a query nobody will maintain. */
  rationale: string;
}

/**
 * Build the searches for one county.
 *
 * Three angles, because a migration surfaces in three different registers: the county says it, the
 * local paper says it, and the commissioners' court minutes say it first.
 */
export function buildPortalWatchQueries(target: PortalWatchTarget): PortalWatchQuery[] {
  const county = `${target.county} County`;
  const state = target.state ?? 'Texas';

  const queries: PortalWatchQuery[] = [
    {
      query: `"${county}" ${state} clerk official records search new system transition`,
      rationale: 'The county announcing it itself — usually a banner on the clerk\'s own page.',
    },
    {
      query: `"${county}" ${state} county clerk records portal upgrade effective date`,
      rationale: 'Announcements almost always carry a go-live date; the date is what makes it actionable.',
    },
    {
      query: `"${county}" ${state} commissioners court agenda clerk records software contract`,
      rationale: 'The contract is approved in open court months before anything visibly changes.',
    },
  ];

  if (target.currentVendor) {
    queries.push({
      query: `"${county}" ${state} clerk records replacing ${target.currentVendor}`,
      rationale: `Named the incumbent (${target.currentVendor}) so a switch AWAY from it surfaces directly.`,
    });
  }

  return queries;
}

// ── Vocabulary ──────────────────────────────────────────────────────────────────────────────────

/** Words that mean something is CHANGING. Deliberately excludes the everyday vocabulary of a records
 *  portal — "search", "online", "records", "index" — which matches every portal every day. */
const MIGRATION_WORDS = [
  'transition', 'transitioning', 'migrating', 'migration', 'new system', 'new portal',
  'new website', 'replacing', 'will replace', 'upgrade to', 'upgrading to', 'go-live',
  'go live', 'effective', 'no longer be available', 'discontinued', 'decommission',
  'switching to', 'moved to', 'has moved', 'now available at', 'beginning',
];

/** The vendors selling records portals in Texas. Their own pages match every query in this module
 *  perfectly and mean nothing — see rule 3. */
const VENDOR_HOSTS = ['kofile', 'tylertech', 'tyler', 'idocket', 'henschen', 'fidlar', 'avenu', 'govos', 'granicus'];

/** ISO dates, US dates, and "October 1, 2026" — enough to know a page is talking about a specific
 *  moment rather than describing a service in the abstract. */
const DATE_PATTERNS = [
  /\b(19|20)\d{2}-\d{2}-\d{2}\b/,
  /\b\d{1,2}\/\d{1,2}\/(19|20)?\d{2}\b/,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+(19|20)\d{2}\b/i,
  /\b(19|20)\d{2}\b/,
];

// ── Classification ──────────────────────────────────────────────────────────────────────────────

export type WatchVerdict =
  /** County named, migration language, a date, and not a vendor page. Read this one. */
  | 'likely'
  /** Some of the above. Worth a glance if you have a minute. */
  | 'possible'
  /** Matched the search and nothing else. The default, and correctly the most common. */
  | 'noise';

export interface PortalWatchHit {
  url: string;
  title: string;
  verdict: WatchVerdict;
  /** Why it was rated that way, in a phrase. Shown so the reader can disagree with the machine. */
  reasons: string[];
  /** The sentence that triggered it, so the reader does not have to open the page to triage. */
  excerpt: string | null;
  /** The most recent year mentioned, when there was one. */
  year: number | null;
}

/** Below this, a result is topical noise. Matches `open-web.ts`'s floor so the two do not drift into
 *  different notions of "close". */
const MIN_SCORE = 0.35;

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

/** Is this the vendor's own site? Their marketing names counties and uses every migration word. */
export function isVendorPage(url: string): boolean {
  const host = hostOf(url);
  return VENDOR_HOSTS.some((v) => host.includes(v));
}

/** Latest four-digit year mentioned anywhere in the text. Crude on purpose — the goal is "is this
 *  about now or about 2018", not exact date extraction. */
export function latestYear(text: string): number | null {
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const plausible = years.filter((y) => y >= 1990 && y <= 2100);
  return plausible.length ? Math.max(...plausible) : null;
}

/** The first sentence carrying a migration word — what a person would quote when forwarding this. */
export function migrationExcerpt(text: string): string | null {
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const lower = s.toLowerCase();
    if (MIGRATION_WORDS.some((w) => lower.includes(w))) return s.trim().slice(0, 300);
  }
  return null;
}

export interface ClassifyOptions {
  /** Anything older than this many years is demoted regardless of how well it matches. */
  staleAfterYears?: number;
  /** Injected so the "is this announcement recent" rule is testable without waiting a year. */
  currentYear?: number;
}

/**
 * Rate one search result.
 *
 * Reads title and content together: an announcement's date is often in the body while the county's
 * name is in the title, and requiring both in one field would reject the clearest hits.
 */
export function classifyWatchResult(
  result: Pick<OpenWebResult, 'url' | 'title' | 'content' | 'score' | 'authority'>,
  county: string,
  opts: ClassifyOptions = {},
): PortalWatchHit {
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const staleAfter = opts.staleAfterYears ?? 2;

  const text = `${result.title}\n${result.content}`;
  const lower = text.toLowerCase();
  const countyLower = county.toLowerCase().replace(/\s+county$/, '');

  const reasons: string[] = [];

  const namesCounty = lower.includes(countyLower);
  const hasMigrationWord = MIGRATION_WORDS.some((w) => lower.includes(w));
  const hasDate = DATE_PATTERNS.some((p) => p.test(text));
  const vendor = isVendorPage(result.url);
  const year = latestYear(text);
  const stale = year !== null && currentYear - year > staleAfter;

  if (namesCounty) reasons.push(`names ${county}`);
  if (hasMigrationWord) reasons.push('migration language');
  if (hasDate) reasons.push('carries a date');
  if (result.authority >= 0.7) reasons.push('official source');
  if (vendor) reasons.push('vendor marketing — demoted');
  if (stale) reasons.push(`newest year is ${year} — demoted as stale`);
  if (!hasDate) reasons.push('no date — cannot tell new from old');

  // Every rule below is a way of saying no. `likely` requires all four to line up; anything less is
  // an invitation to glance, not a claim.
  let verdict: WatchVerdict;
  if (result.score < MIN_SCORE) {
    verdict = 'noise';
  } else if (vendor || stale) {
    // A vendor page or an old announcement can still be worth a glance — a 2023 contract award does
    // predict a 2026 cutover — but neither may ever be the thing that pages somebody.
    verdict = namesCounty && hasMigrationWord ? 'possible' : 'noise';
  } else if (namesCounty && hasMigrationWord && hasDate && result.authority >= 0.7) {
    verdict = 'likely';
  } else if (namesCounty && hasMigrationWord) {
    verdict = 'possible';
  } else {
    verdict = 'noise';
  }

  return { url: result.url, title: result.title, verdict, reasons, excerpt: migrationExcerpt(text), year };
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────

export interface PortalWatchReport {
  county: string;
  hits: PortalWatchHit[];
  /** Counts by verdict — what a dashboard shows without re-deriving it. */
  counts: Record<WatchVerdict, number>;
  /** True when at least one `likely`. The one boolean a caller should act on. */
  actionable: boolean;
}

const VERDICT_ORDER: Record<WatchVerdict, number> = { likely: 0, possible: 1, noise: 2 };

/**
 * Rank results for one county and summarise.
 *
 * Noise is KEPT, not discarded. Somebody checking why the watch stayed quiet needs to see what it
 * looked at and rejected — a watch that shows only its hits is indistinguishable from a watch that
 * is not running, which is the failure mode this codebase keeps rediscovering.
 */
export function buildWatchReport(
  county: string,
  results: ReadonlyArray<Pick<OpenWebResult, 'url' | 'title' | 'content' | 'score' | 'authority'>>,
  opts: ClassifyOptions = {},
): PortalWatchReport {
  const seen = new Set<string>();
  const hits: PortalWatchHit[] = [];

  for (const r of results) {
    // The angles overlap, so the same announcement arrives more than once. Showing it twice would
    // overstate how much was found — the same reasoning as `dedupeAndRank`.
    const key = r.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(classifyWatchResult(r, county, opts));
  }

  hits.sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || (b.year ?? 0) - (a.year ?? 0));

  const counts: Record<WatchVerdict, number> = { likely: 0, possible: 0, noise: 0 };
  for (const h of hits) counts[h.verdict]++;

  return { county, hits, counts, actionable: counts.likely > 0 };
}

/** One line per county for the run log, and the body of a notification when `actionable`. */
export function describeWatchReport(report: PortalWatchReport): string {
  if (report.counts.likely === 0 && report.counts.possible === 0) {
    // Said explicitly. "Nothing" from a watch that ran and "nothing" from a watch that did not are
    // different facts, and only the caller knows which this is.
    return `${report.county}: nothing announced — ${report.hits.length} result(s) checked and rejected.`;
  }

  const lines = [
    `${report.county}: ${report.counts.likely} likely, ${report.counts.possible} possible ` +
    `(${report.hits.length} checked).`,
  ];

  for (const h of report.hits.filter((x) => x.verdict !== 'noise')) {
    lines.push(`  [${h.verdict}] ${h.title}`);
    lines.push(`    ${h.url}`);
    if (h.excerpt) lines.push(`    "${h.excerpt}"`);
    lines.push(`    ${h.reasons.join('; ')}`);
  }

  return lines.join('\n');
}

// ── Running it ──────────────────────────────────────────────────────────────────────────────────

export type WatchStatus =
  /** Searched. The report below is real. */
  | 'searched'
  /** No `TAVILY_API_KEY`. Nothing was looked at — which is not the same as nothing being announced. */
  | 'not-configured'
  /** Every query failed. An incident, not a setting. */
  | 'search-failed';

export interface PortalWatchRun {
  status: WatchStatus;
  report: PortalWatchReport | null;
  /** One line per query, for the run log. */
  steps: string[];
}

/**
 * Watch one county.
 *
 * Every query settles on its own: a rate-limit on the commissioners-court search is not a reason to
 * discard what the clerk's own page said. Same reasoning as `searchOpenWeb`, and the same reason the
 * status is not derived from `hits.length` — a watch that found nothing and a watch that never ran
 * produce the same empty list, and only one of them is reassuring.
 */
export async function runPortalWatch(
  target: PortalWatchTarget,
  opts: TavilySearchOptions & ClassifyOptions = {},
): Promise<PortalWatchRun> {
  const queries = buildPortalWatchQueries(target);

  const settled = await Promise.all(
    queries.map(async (q) => ({ q, outcome: await tavilySearch(q.query, opts) })),
  );

  const steps = settled.map(({ q, outcome }) =>
    outcome.ok
      ? `[portal-watch] ${q.query} → ${outcome.results.length} result(s)`
      : `[portal-watch] ${q.query} → ${outcome.reason}`,
  );

  if (settled.every((s) => !s.outcome.ok && s.outcome.reason === 'not-configured')) {
    return { status: 'not-configured', report: null, steps };
  }
  if (settled.every((s) => !s.outcome.ok)) {
    return { status: 'search-failed', report: null, steps };
  }

  const results = settled.flatMap(({ outcome }) => (outcome.ok ? outcome.results : []));
  return { status: 'searched', report: buildWatchReport(target.county, results, opts), steps };
}
