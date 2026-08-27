// lib/research/announcement-watch.ts — "has somebody announced a change?", once
//
// ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────────────────────────
//
// TODAY THIS HAS EXACTLY ONE CONSUMER: the county portal watch (§I3.3). It was extracted anyway,
// before the second one exists, because the second one is already specified — the regulatory watch
// in §I3.5 (TBPELS rule changes, county filing fees, FEMA map revisions) asks the identical question
// of a different subject: has an authority announced a change that will break something we depend on.
//
// Extracting after the fact is the move that never happens. The plan doc these came from records
// `prioritized-pipeline.ts` — 764 lines existing TWICE with no callers, where nobody can now tell
// which copy was real. That is what two watchers written independently become.
//
// So the logic lives here once and each watch is a `WatchProfile`. If §I3.5 is never built, this is
// one indirection too many and should be folded back into portal-watch — say so rather than leaving
// a generic layer standing over a single caller forever.
//
// So the logic lives here once, and each watch is a `WatchProfile`: what names the subject, what
// counts as change vocabulary, and whose pages are selling rather than announcing.
//
// ── THE FALSE-POSITIVE PROBLEM IS THE WHOLE PROBLEM ─────────────────────────────────────────────
//
// A query like "<county> clerk records portal new system" or "TBPELS rule change surveying" ALWAYS
// returns something, and almost all of it is wrong in three predictable ways:
//
//   • **Sellers match perfectly.** The vendors sell records portals; the CE providers sell rule-change
//     courses. Their marketing names the subject and uses every change word, and means nothing.
//   • **Evergreen pages match forever.** "Search records online", "Texas surveying regulations" — the
//     everyday vocabulary of the thing, published once and true always.
//   • **Old announcements read like new ones.** A 2019 notice and last week's are the same page
//     without a date.
//
// A watcher that promotes those gets muted inside a fortnight, which leaves the system WORSE than
// having no watcher: now there is an alert everyone has learned to skip. Every rule below is
// therefore a way of saying no, and `likely` requires all of them to agree at once.
//
// Nothing here concludes a change IS happening. The output is a ranked "worth ten minutes" list with
// the triggering sentence quoted, because the judgement belongs to a person and the costs are
// asymmetric: a missed change costs one broken run, a cried-wolf alert costs the alert.

import { tavilySearch, type OpenWebResult, type TavilySearchOptions } from '@/lib/research/open-web';

// ── Profile ─────────────────────────────────────────────────────────────────────────────────────

export interface WatchProfile {
  /** For UI and for the `names <label>` reason string. */
  label: string;
  /** Prefix for run-log lines. Each watch keeps its own so logs stay greppable per watch. */
  logPrefix: string;
  /**
   * Does this result name the subject? Given the lower-cased title+content.
   *
   * A predicate rather than a string because the subjects differ in kind: a county is one name with
   * a known variant ("Bell" / "Bell County"), while a regulatory topic is a set of any-of terms.
   */
  namesSubject: (lowerText: string) => boolean;
  /** Words that mean something is CHANGING. Must exclude the everyday vocabulary of the subject. */
  changeWords: readonly string[];
  /** How the reason string names that vocabulary. A county portal announces a "migration"; a rule
   *  book announces an "amendment". The generic word would read as machine output in both. */
  changeLabel?: string;
  /** Hosts that sell into this subject. Their pages match every query and announce nothing. */
  sellerHosts: readonly string[];
  /** Anything older than this is demoted. Portal migrations go stale fast; rule changes do not. */
  staleAfterYears: number;
  /** `domainAuthority` at or above this counts as an official source. */
  officialAuthority?: number;
}

export interface WatchQuery {
  query: string;
  /** For the run log. A query nobody can explain is a query nobody will maintain. */
  rationale: string;
}

// ── Shared vocabulary and patterns ──────────────────────────────────────────────────────────────

/** ISO, US numeric, and "October 1, 2026" — enough to know a page is about a specific moment rather
 *  than describing something in the abstract. */
const DATE_PATTERNS = [
  /\b(19|20)\d{2}-\d{2}-\d{2}\b/,
  /\b\d{1,2}\/\d{1,2}\/(19|20)?\d{2}\b/,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+(19|20)\d{2}\b/i,
  /\b(19|20)\d{2}\b/,
];

const DEFAULT_OFFICIAL_AUTHORITY = 0.7;

/** Below this a result is topical noise. Matches `open-web.ts` so the two do not drift into
 *  different notions of "close". */
const MIN_SCORE = 0.35;

// ── Verdicts ────────────────────────────────────────────────────────────────────────────────────

export type WatchVerdict =
  /** Subject named, change language, a date, an official source, and not a seller. Read this one. */
  | 'likely'
  /** Some of the above. Worth a glance if you have a minute. */
  | 'possible'
  /** Matched the search and nothing else. The default, and correctly the most common. */
  | 'noise';

export interface WatchHit {
  url: string;
  title: string;
  verdict: WatchVerdict;
  /** Why it was rated that way, in phrases. Shown so the reader can disagree with the machine. */
  reasons: string[];
  /** The sentence that triggered it, so triage does not need the page open. */
  excerpt: string | null;
  /** Most recent year mentioned, when there was one. */
  year: number | null;
}

// ── Helpers, exported because they are separately testable ──────────────────────────────────────

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

/** Is this a seller's own site? Matched on HOST — a subject page that merely mentions a vendor is
 *  still a subject page, and demoting it would throw away the most common genuine hit. */
export function isSellerPage(url: string, sellerHosts: readonly string[]): boolean {
  const host = hostOf(url);
  return sellerHosts.some((v) => host.includes(v));
}

/** Latest four-digit year mentioned. Crude on purpose — the question is "is this about now or about
 *  2018", not exact date extraction. */
export function latestYear(text: string): number | null {
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const plausible = years.filter((y) => y >= 1990 && y <= 2100);
  return plausible.length ? Math.max(...plausible) : null;
}

/** The first sentence carrying a change word — what a person would quote when forwarding this. */
export function changeExcerpt(text: string, changeWords: readonly string[]): string | null {
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    const lower = s.toLowerCase();
    if (changeWords.some((w) => lower.includes(w))) return s.trim().slice(0, 300);
  }
  return null;
}

// ── Classification ──────────────────────────────────────────────────────────────────────────────

export interface ClassifyOptions {
  /** Injected so the recency rule is testable without waiting a year. */
  currentYear?: number;
  /** Overrides the profile's window. */
  staleAfterYears?: number;
}

/**
 * Rate one search result against a profile.
 *
 * Reads title and content together: the date is usually in the body while the subject is in the
 * title, and requiring both in one field would reject the clearest hits.
 */
export function classifyAnnouncement(
  result: Pick<OpenWebResult, 'url' | 'title' | 'content' | 'score' | 'authority'>,
  profile: WatchProfile,
  opts: ClassifyOptions = {},
): WatchHit {
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const staleAfter = opts.staleAfterYears ?? profile.staleAfterYears;
  const officialAt = profile.officialAuthority ?? DEFAULT_OFFICIAL_AUTHORITY;

  const text = `${result.title}\n${result.content}`;
  const lower = text.toLowerCase();

  const namesSubject = profile.namesSubject(lower);
  const hasChangeWord = profile.changeWords.some((w) => lower.includes(w));
  const hasDate = DATE_PATTERNS.some((p) => p.test(text));
  const seller = isSellerPage(result.url, profile.sellerHosts);
  const year = latestYear(text);
  const stale = year !== null && currentYear - year > staleAfter;

  const reasons: string[] = [];
  if (namesSubject) reasons.push(`names ${profile.label}`);
  if (hasChangeWord) reasons.push((profile.changeLabel ?? 'change') + ' language');
  if (hasDate) reasons.push('carries a date');
  if (result.authority >= officialAt) reasons.push('official source');
  if (seller) reasons.push('vendor marketing — demoted');
  if (stale) reasons.push(`newest year is ${year} — demoted as stale`);
  if (!hasDate) reasons.push('no date — cannot tell new from old');

  let verdict: WatchVerdict;
  if (result.score < MIN_SCORE) {
    verdict = 'noise';
  } else if (seller || stale) {
    // A seller's page or an old announcement can still be worth a glance — a 2023 contract award does
    // predict a 2026 cutover — but neither may ever be the thing that pages somebody.
    verdict = namesSubject && hasChangeWord ? 'possible' : 'noise';
  } else if (namesSubject && hasChangeWord && hasDate && result.authority >= officialAt) {
    verdict = 'likely';
  } else if (namesSubject && hasChangeWord) {
    verdict = 'possible';
  } else {
    verdict = 'noise';
  }

  return { url: result.url, title: result.title, verdict, reasons, excerpt: changeExcerpt(text, profile.changeWords), year };
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────

export interface WatchReport {
  subject: string;
  hits: WatchHit[];
  counts: Record<WatchVerdict, number>;
  /** True when at least one `likely`. The one boolean a caller should act on — `possible` must never
   *  page anybody, or the alert stops being read. */
  actionable: boolean;
}

const VERDICT_ORDER: Record<WatchVerdict, number> = { likely: 0, possible: 1, noise: 2 };

/**
 * Rank and summarise.
 *
 * NOISE IS KEPT, not discarded. Somebody checking why a watch stayed quiet needs to see what it
 * looked at and rejected — a report showing only its hits is indistinguishable from a report produced
 * by a watcher that is not running, which is the failure this codebase keeps rediscovering.
 */
export function buildWatchReport(
  subject: string,
  results: ReadonlyArray<Pick<OpenWebResult, 'url' | 'title' | 'content' | 'score' | 'authority'>>,
  profile: WatchProfile,
  opts: ClassifyOptions = {},
): WatchReport {
  const seen = new Set<string>();
  const hits: WatchHit[] = [];

  for (const r of results) {
    // Queries overlap, so the same announcement arrives more than once. Counting it twice would
    // overstate what was found — the same reasoning as `dedupeAndRank`.
    const key = r.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(classifyAnnouncement(r, profile, opts));
  }

  hits.sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || (b.year ?? 0) - (a.year ?? 0));

  const counts: Record<WatchVerdict, number> = { likely: 0, possible: 0, noise: 0 };
  for (const h of hits) counts[h.verdict]++;

  return { subject, hits, counts, actionable: counts.likely > 0 };
}

/** One line per subject for the run log, and the body of a notification when `actionable`. */
export function describeWatchReport(report: WatchReport): string {
  if (report.counts.likely === 0 && report.counts.possible === 0) {
    // Said out loud. "Nothing" from a watch that ran and "nothing" from a watch that did not are
    // different facts, and only the caller knows which this is.
    return `${report.subject}: nothing announced — ${report.hits.length} result(s) checked and rejected.`;
  }

  const lines = [
    `${report.subject}: ${report.counts.likely} likely, ${report.counts.possible} possible ` +
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

// ── Running ─────────────────────────────────────────────────────────────────────────────────────

export type WatchStatus =
  /** Searched. The report is real. */
  | 'searched'
  /** No `TAVILY_API_KEY`. Nothing was looked at — not the same as nothing being announced. */
  | 'not-configured'
  /** Every query failed. An incident, not a setting. */
  | 'search-failed';

export interface WatchRun {
  status: WatchStatus;
  report: WatchReport | null;
  steps: string[];
}

/**
 * Run a set of queries and report.
 *
 * Every query settles on its own: a rate-limit on one is not a reason to discard what another found.
 * The status is NOT derived from `hits.length`, because a watch that found nothing and a watch that
 * never ran produce the same empty list and only one of them is reassuring.
 */
export async function runWatch(
  subject: string,
  queries: readonly WatchQuery[],
  profile: WatchProfile,
  opts: TavilySearchOptions & ClassifyOptions = {},
): Promise<WatchRun> {
  const settled = await Promise.all(
    queries.map(async (q) => ({ q, outcome: await tavilySearch(q.query, opts) })),
  );

  const steps = settled.map(({ q, outcome }) =>
    outcome.ok
      ? `${profile.logPrefix} ${q.query} → ${outcome.results.length} result(s)`
      : `${profile.logPrefix} ${q.query} → ${outcome.reason}`,
  );

  if (settled.every((s) => !s.outcome.ok && s.outcome.reason === 'not-configured')) {
    return { status: 'not-configured', report: null, steps };
  }
  if (settled.every((s) => !s.outcome.ok)) {
    return { status: 'search-failed', report: null, steps };
  }

  const results = settled.flatMap(({ outcome }) => (outcome.ok ? outcome.results : []));
  return { status: 'searched', report: buildWatchReport(subject, results, profile, opts), steps };
}
