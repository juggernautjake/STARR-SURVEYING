// lib/research/open-web.ts — the open web, searched on purpose (plan R1).
//
// Owner objective: *"enter the property information and it will thoroughly research everything it
// can find about that property."*
//
// ── WHAT THIS EXISTS TO CLOSE ───────────────────────────────────────────────────────────────────
//
// The research pipeline is excellent at the places it already knows: 108 county appraisal portals,
// 21 clerk/deed systems, ten government data APIs. Every one of those is a source we point at.
//
// The things that sink a survey are frequently not in any of them. A boundary dispute that made the
// local paper. A subdivision plat argued over at a planning commission meeting. A lien recorded
// against the owner rather than the parcel. A pipeline easement negotiated ten years ago and
// discussed in a utility filing. None of that is in a CAD portal, and no adapter will ever find it,
// because an adapter has to be told where to look.
//
// `TAVILY_API_KEY` has been configured for a while and does exactly one job today: guessing county
// CAD URLs, as "Method 9" in `boundary-fetch.service.ts`. That is a search engine being used as a
// URL lookup. This module uses it as a search engine.
//
// ── ONE SEARCH PER ANGLE, NOT ONE SEARCH ────────────────────────────────────────────────────────
//
// The tempting implementation is a single query with everything in it. It returns one topic's worth
// of results — whichever the ranker liked — and silently answers none of the other questions.
//
// So each ANGLE is its own search with its own query, and each is reported separately. A run that
// finds three liens and no news is a different answer from a run that finds nothing, and a caller
// that cannot tell them apart will present the first as the second.
//
// ── AN ANGLE WITH NOTHING TO ASK IS SKIPPED, NOT GUESSED ────────────────────────────────────────
//
// Searching for liens without an owner name returns the county's general lien page. That is worse
// than no result: it is a plausible-looking finding that answers a question nobody asked, and it
// will be read as "we checked and found nothing specific". Angles declare what they require, and an
// angle whose inputs are missing reports `skipped: 'insufficient-subject'`.
//
// ── AND IT SAYS WHY IT DID NOTHING ──────────────────────────────────────────────────────────────
//
// Shaped deliberately after `lib/search/semantic.ts`. "The search did not run" and "the search ran
// and found nothing" are different facts, and collapsing them into an empty array is how a feature
// stays broken for months while looking like an empty archive. Every non-result here carries a
// reason the caller must handle.

/** Everything known about the property when the search is built. All optional — most runs start thin. */
export interface OpenWebSubject {
  address?: string;
  county?: string;
  /** Current or prior owner. Unlocks the encumbrance angle, which is the highest-value one. */
  ownerName?: string;
  /** e.g. "Lot 4, Block 2, ASH FAMILY TRUST 12.358 ACRE ADDITION" */
  legalDescription?: string;
  subdivision?: string;
  parcelId?: string;
}

export type OpenWebAngle =
  /** Liens, judgments, probate, foreclosure, business filings against the OWNER rather than the parcel. */
  | 'owner-encumbrance'
  /** Building permits, planning commission agendas, zoning changes, code enforcement. */
  | 'permits-planning'
  /** Local news and litigation naming the property or the subdivision — boundary disputes surface here. */
  | 'news-disputes'
  /** Plat filings, subdivision history, replats, vacations. */
  | 'plat-subdivision'
  /** Pipelines, utility easements, environmental filings, oil & gas activity. */
  | 'environmental-utility';

export interface OpenWebQuery {
  angle: OpenWebAngle;
  query: string;
  /** Written for the run log, so a human reading the report knows what was asked and why. */
  rationale: string;
}

export interface OpenWebResult {
  angle: OpenWebAngle;
  url: string;
  title: string;
  /** Tavily's extracted page content, trimmed. This is the evidence, not a pointer to it. */
  content: string;
  /** Tavily's own relevance score, 0–1. */
  score: number;
  /** Our trust weighting for the domain — see `domainAuthority`. */
  authority: number;
}

export type OpenWebSkip =
  /** No `TAVILY_API_KEY`. Built and switched off. */
  | 'not-configured'
  /** The subject had none of the fields this angle needs. Not a failure — a question we cannot ask. */
  | 'insufficient-subject'
  /** Tavily refused, rate-limited, or timed out. An incident, not a setting — and telling an
   *  operator "not configured" during an outage sends them to change a setting that is correct. */
  | 'search-failed';

export interface OpenWebAngleReport {
  angle: OpenWebAngle;
  query: string | null;
  results: OpenWebResult[];
  /** `null` means the angle genuinely ran. Otherwise, why it did not. */
  skipped: OpenWebSkip | null;
}

export interface OpenWebReport {
  angles: OpenWebAngleReport[];
  /** Flattened, deduped and ranked across every angle — what a report should actually show. */
  topResults: OpenWebResult[];
  /** One line per angle for the run log. */
  steps: string[];
}

/** Results below this are topical noise rather than answers. Matches the floor used by
 *  `lib/search/semantic.ts` so the two do not drift into different notions of "close". */
export const MIN_SCORE = 0.35;
export const MAX_RESULTS_PER_ANGLE = 6;
export const MAX_TOP_RESULTS = 20;

// ── Domain authority ────────────────────────────────────────────────────────────────────────────
//
// A `.gov` page saying a permit exists and a content farm saying a permit exists are not equally
// good, and Tavily's relevance score does not know the difference — it measures topical match, not
// trustworthiness. Ranking on score alone puts real-estate lead-gen sites above the county.
//
// This is a weighting, not a filter. A blog post about a boundary dispute may be the only public
// record of it, and discarding it would lose the finding entirely.

/** 1.0 = government record. 0.2 = the open web with no provenance. */
export function domainAuthority(url: string): number {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 0.2; // unparseable — treat as untrusted rather than throwing
  }

  if (host.endsWith('.gov') || host.endsWith('.us') || host.includes('.gov.')) return 1.0;
  if (host.endsWith('.edu')) return 0.8;
  // The records vendors the pipeline already pays for; not government, but primary sources.
  if (/(?:idocket|kofile|texasfile|courthousedirect|publicsearch|landex|fidlar)\./.test(host)) return 0.8;
  if (/(?:cad|appraisal)\w*\.(?:org|com|net)$/.test(host)) return 0.75;
  if (/(?:news|herald|tribune|statesman|chronicle|telegram|reporter)/.test(host)) return 0.5;
  return 0.2;
}

/** Score and authority combined into one ordering. Authority is weighted heavily enough that a
 *  government page beats a marginally more "relevant" content farm, without silencing the farm. */
export function rankScore(r: { score: number; authority: number }): number {
  return r.score * 0.6 + r.authority * 0.4;
}

// ── Query construction ──────────────────────────────────────────────────────────────────────────

interface AngleSpec {
  angle: OpenWebAngle;
  /** Returns null when the subject cannot support this angle. */
  build: (s: OpenWebSubject) => { query: string; rationale: string } | null;
}

/** Quote a phrase so the engine treats it as one term. Embedded quotes would break the phrase. */
function phrase(value: string): string {
  return `"${value.replace(/"/g, '')}"`;
}

const ANGLE_SPECS: AngleSpec[] = [
  {
    angle: 'owner-encumbrance',
    // Requires a NAME. Without one this degenerates into the county's general lien page, which
    // reads as "we checked" and checked nothing.
    build: (s) => {
      if (!s.ownerName?.trim()) return null;
      const where = s.county ? ` ${s.county} County Texas` : ' Texas';
      return {
        query: `${phrase(s.ownerName.trim())}${where} lien OR judgment OR lawsuit OR foreclosure OR probate`,
        rationale: 'Encumbrances recorded against the owner rather than the parcel — invisible to a CAD portal.',
      };
    },
  },
  {
    angle: 'permits-planning',
    build: (s) => {
      const subject = s.address?.trim() || s.subdivision?.trim();
      if (!subject) return null;
      const where = s.county ? ` ${s.county} County Texas` : ' Texas';
      return {
        query: `${phrase(subject)}${where} building permit OR planning commission OR zoning OR variance`,
        rationale: 'Permits and planning decisions that change what the parcel may become.',
      };
    },
  },
  {
    angle: 'news-disputes',
    build: (s) => {
      const subject = s.address?.trim() || s.subdivision?.trim() || s.legalDescription?.trim();
      if (!subject) return null;
      return {
        query: `${phrase(subject)} ${s.county ? s.county + ' County ' : ''}Texas boundary dispute OR easement OR survey OR lawsuit`,
        rationale: 'Boundary disputes are frequently reported locally years before they reach a record.',
      };
    },
  },
  {
    angle: 'plat-subdivision',
    build: (s) => {
      const subject = s.subdivision?.trim() || s.legalDescription?.trim();
      if (!subject) return null;
      const where = s.county ? ` ${s.county} County Texas` : ' Texas';
      return {
        query: `${phrase(subject)}${where} plat OR replat OR subdivision filed OR vacated`,
        rationale: 'Replats and vacations change lot geometry and often postdate the recorded deed.',
      };
    },
  },
  {
    angle: 'environmental-utility',
    build: (s) => {
      const subject = s.address?.trim() || s.subdivision?.trim();
      if (!subject) return null;
      const where = s.county ? ` ${s.county} County Texas` : ' Texas';
      return {
        query: `${phrase(subject)}${where} pipeline easement OR utility right-of-way OR TCEQ OR oil gas lease`,
        rationale: 'Linear encumbrances that cross a parcel without appearing in its own record.',
      };
    },
  },
];

/**
 * Build one query per angle the subject can actually support.
 *
 * Pure, so the whole query strategy is testable without a network — which matters because a bad
 * query returns confident, well-formed, irrelevant results.
 */
export function buildOpenWebQueries(subject: OpenWebSubject): OpenWebQuery[] {
  const out: OpenWebQuery[] = [];
  for (const spec of ANGLE_SPECS) {
    const built = spec.build(subject);
    if (built) out.push({ angle: spec.angle, query: built.query, rationale: built.rationale });
  }
  return out;
}

/** Which angles the subject cannot support, and therefore must be reported as skipped rather than
 *  quietly omitted. An omitted angle looks like an angle that found nothing. */
export function unsupportedAngles(subject: OpenWebSubject): OpenWebAngle[] {
  const supported = new Set(buildOpenWebQueries(subject).map((q) => q.angle));
  return ANGLE_SPECS.map((s) => s.angle).filter((a) => !supported.has(a));
}

// ── Result shaping ──────────────────────────────────────────────────────────────────────────────

/**
 * One URL, one entry — keeping the best-ranked sighting.
 *
 * The angles overlap on purpose (a lawsuit surfaces under both `news-disputes` and
 * `owner-encumbrance`), so the same page arriving twice is expected. Showing it twice would
 * overstate how much was found, which is the specific way a research report lies.
 */
export function dedupeAndRank(results: OpenWebResult[], limit = MAX_TOP_RESULTS): OpenWebResult[] {
  const best = new Map<string, OpenWebResult>();
  for (const r of results) {
    const key = canonicalUrl(r.url);
    const existing = best.get(key);
    if (!existing || rankScore(r) > rankScore(existing)) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => rankScore(b) - rankScore(a)).slice(0, limit);
}

/**
 * Render findings as the text of one research document (plan R1b).
 *
 * ── WHY A DOCUMENT AND NOT A SPECIAL CASE ──────────────────────────────────────────────────────
 *
 * The pipeline already knows how to read a `research_documents` row: it extracts data points from
 * it, cross-validates them against every other source, embeds it for AI search, and shows it in the
 * documents list. Handing open-web findings to that machinery costs one insert and inherits all of
 * it. A bespoke "web findings" field would need each of those built again, and would be forgotten by
 * whichever one was written last.
 *
 * ── THE PROVENANCE STAYS ATTACHED, DELIBERATELY ────────────────────────────────────────────────
 *
 * Every entry keeps its URL, its angle and its authority band. A model reading this must be able to
 * tell a county record from a blog post — the ranking already encodes that judgement, and stripping
 * it here would hand the AI a flat list of equally-credible-looking claims. Which is precisely how a
 * confident wrong answer gets written.
 */
export function renderFindingsAsDocument(subject: OpenWebSubject, report: OpenWebReport): string {
  const lines: string[] = [
    'OPEN-WEB RESEARCH FINDINGS',
    '',
    'Sources found by searching the public internet — NOT county records. Each entry carries the',
    'search angle that found it and a provenance band. Weigh them accordingly: a .gov page and a',
    'blog post can both appear here, and they are not equally good evidence.',
    '',
    `Subject: ${subject.address ?? subject.subdivision ?? '(unspecified)'}`,
    subject.county ? `County: ${subject.county}` : '',
    subject.ownerName ? `Owner searched: ${subject.ownerName}` : '',
    '',
  ];

  // The angles that did not run are listed too. An absent angle reads as "nothing found", and the
  // difference between "we could not ask" and "we asked and found nothing" changes what a surveyor
  // does next.
  const skipped = report.angles.filter((a) => a.skipped !== null);
  if (skipped.length) {
    lines.push('ANGLES NOT SEARCHED:');
    for (const a of skipped) lines.push(`  - ${a.angle}: ${a.skipped}`);
    lines.push('');
  }

  if (!report.topResults.length) {
    lines.push('No sources above the relevance floor. This is a result, not an error.');
    return lines.filter((l) => l !== '' || true).join('\n');
  }

  lines.push('FINDINGS:', '');
  for (const [i, r] of report.topResults.entries()) {
    lines.push(
      `[${i + 1}] ${r.title}`,
      `    angle: ${r.angle}   provenance: ${provenanceBand(r.authority)}   relevance: ${r.score.toFixed(2)}`,
      `    url: ${r.url}`,
      `    ${r.content.replace(/\s+/g, ' ').slice(0, 700)}`,
      '',
    );
  }
  return lines.join('\n');
}

/** Words rather than a number, because the number means nothing to a model or a person. */
export function provenanceBand(authority: number): string {
  if (authority >= 1.0) return 'government record';
  if (authority >= 0.75) return 'primary records vendor';
  if (authority >= 0.5) return 'news media';
  return 'open web — unverified';
}

/** Strip the parts of a URL that do not change the page, so two sightings collapse. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|source)/i.test(p)) u.searchParams.delete(p);
    }
    // A trailing slash is the same page.
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// ── The search itself ───────────────────────────────────────────────────────────────────────────

interface TavilyApiResult { title?: string; url?: string; content?: string; score?: number }
interface TavilyApiResponse { results?: TavilyApiResult[] }

export interface SearchOpenWebOptions {
  /** Injected so every rule above is testable without a network or an API key. */
  fetchImpl?: typeof fetch;
  apiKey?: string;
  timeoutMs?: number;
  /** Angles to run. Defaults to all the subject supports — narrow it to control cost. */
  only?: OpenWebAngle[];
}

/**
 * Run every supported angle and return one report.
 *
 * ── ANGLES RUN CONCURRENTLY, AND FAIL INDEPENDENTLY ───────────────────────────────────────────
 *
 * Five sequential searches is five round trips on the critical path of a run that is already 20–30
 * minutes. More importantly, one angle failing must not lose the other four: a rate-limit on the
 * owner search is not a reason to discard the permit findings. So each angle settles on its own and
 * carries its own skip reason.
 */
export async function searchOpenWeb(
  subject: OpenWebSubject,
  opts: SearchOpenWebOptions = {},
): Promise<OpenWebReport> {
  const apiKey = opts.apiKey ?? process.env.TAVILY_API_KEY;
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;

  let queries = buildOpenWebQueries(subject);
  if (opts.only) queries = queries.filter((q) => opts.only!.includes(q.angle));

  // Angles the subject cannot support are reported explicitly. See the header: an omitted angle is
  // indistinguishable from an angle that found nothing.
  const skippedForSubject: OpenWebAngleReport[] = unsupportedAngles(subject)
    .filter((a) => !opts.only || opts.only.includes(a))
    .map((angle) => ({ angle, query: null, results: [], skipped: 'insufficient-subject' as const }));

  if (!apiKey) {
    const angles: OpenWebAngleReport[] = [
      ...queries.map((q) => ({ angle: q.angle, query: q.query, results: [], skipped: 'not-configured' as const })),
      ...skippedForSubject,
    ];
    return {
      angles,
      topResults: [],
      steps: ['[open-web] TAVILY_API_KEY is not set — open-web research did not run.'],
    };
  }

  const settled = await Promise.all(
    queries.map(async (q): Promise<OpenWebAngleReport> => {
      try {
        const res = await doFetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query: q.query,
            search_depth: 'advanced',
            include_answer: false,
            include_raw_content: false,
            max_results: MAX_RESULTS_PER_ANGLE,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { angle: q.angle, query: q.query, results: [], skipped: 'search-failed' };

        const data = (await res.json()) as TavilyApiResponse;
        const results: OpenWebResult[] = (data.results ?? [])
          .filter((r) => r.url && (r.score ?? 0) >= MIN_SCORE)
          .map((r) => ({
            angle: q.angle,
            url: r.url!,
            title: (r.title ?? '').trim() || r.url!,
            // Trimmed because this is fed to Claude alongside four other angles; whole pages would
            // crowd out the findings that matter.
            content: (r.content ?? '').slice(0, 1200),
            score: r.score ?? 0,
            authority: domainAuthority(r.url!),
          }));

        return { angle: q.angle, query: q.query, results, skipped: null };
      } catch {
        // Includes the timeout. Distinct from 'not-configured' on purpose — see OpenWebSkip.
        return { angle: q.angle, query: q.query, results: [], skipped: 'search-failed' };
      }
    }),
  );

  const angles = [...settled, ...skippedForSubject];
  const topResults = dedupeAndRank(settled.flatMap((a) => a.results));

  const steps = angles.map((a) => {
    if (a.skipped === 'insufficient-subject') {
      return `[open-web] ${a.angle}: skipped — the property record lacks the fields this angle needs.`;
    }
    if (a.skipped === 'search-failed') return `[open-web] ${a.angle}: search failed or timed out.`;
    if (a.skipped === 'not-configured') return `[open-web] ${a.angle}: TAVILY_API_KEY not set.`;
    return `[open-web] ${a.angle}: ${a.results.length} result(s) above the relevance floor.`;
  });

  return { angles, topResults, steps };
}
