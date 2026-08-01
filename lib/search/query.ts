// lib/search/query.ts — turning what somebody typed into something Postgres can rank (§3b).
//
// Owner objective: *"search using key words and matching spellings"*. Those are two different
// mechanisms and this module keeps both, because each fails where the other works:
//
//   · **Trigram similarity** (`pg_trgm`) survives a typo — "Waggner" finds "Waggoner", "esment" finds
//     "easement". It is how you find a thing whose name you half-remember. It is also blind to word
//     order and hopeless on long text: a 40-page deed's `extracted_text` is similar to nothing.
//   · **Full-text search** (`tsvector`) handles long text, stemming and multi-word phrases — "recorded
//     easements" matches "easement recording". It is unforgiving of spelling: one wrong letter and the
//     lexeme simply does not exist, so the match is not weaker, it is absent.
//
// Surveying data needs both at once. It is dense with proper nouns nobody spells right the first time
// (Waggoner, Killeen, Nolanville, abstract names, surveyor surnames) sitting inside long OCR'd legal
// text. A search that only stems finds nothing for a misspelled subdivision; one that only fuzzes
// finds nothing inside a deed body.
//
// So the score is a COMBINATION, and the weights below are the design, not an accident.

/** A parsed query. Deliberately a value, not a string, so the route cannot forget to sanitise. */
export interface ParsedQuery {
  /** The raw input, trimmed. */
  raw: string;
  /** Individual terms, lowercased, punctuation stripped, stop-words kept (they matter in addresses:
   *  "the" in "The Reserve at Nolan Creek" is part of the name). */
  terms: string[];
  /** A `tsquery`-safe expression: terms AND-ed, each with a prefix match so partial typing works. */
  tsquery: string;
  /** True when the input is too short to search usefully. */
  tooShort: boolean;
}

/** Two characters cannot produce a meaningful trigram and matches half the database. Below this we
 *  refuse rather than return noise — an unusable result set reads as a broken search. */
export const MIN_QUERY_LENGTH = 2;

/** Postgres `to_tsquery` treats these as operators; unescaped they are a syntax error, which would
 *  turn a customer name like "Smith & Sons (Texas)" into a 500. */
const TSQUERY_SPECIALS = /[&|!()<>:*'"\\]/g;

export function parseQuery(input: string): ParsedQuery {
  const raw = (input ?? '').trim();

  const terms = raw
    .toLowerCase()
    // Keep digits and letters; job numbers, lot numbers and abstract numbers are all searchable.
    // Hyphens split rather than join, so "24-0117" finds a job stored as "24 0117" too.
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  const tsquery = terms
    .map((t) => t.replace(TSQUERY_SPECIALS, ''))
    .filter(Boolean)
    // `:*` = prefix match, so results appear while the user is still typing rather than only on the
    // last keystroke of a complete word.
    .map((t) => `${t}:*`)
    .join(' & ');

  return { raw, terms, tsquery, tooShort: raw.length < MIN_QUERY_LENGTH };
}

// ── Scoring ────────────────────────────────────────────────────────────────────────────────────
//
// One number, so results from eleven tables can be ordered against each other. Without a shared
// scale, "search everything" degenerates into eleven lists stacked by table order, and the thing you
// wanted is under a heading you did not read.

export interface ScoreInput {
  /** Best trigram similarity across the title columns, 0–1. */
  titleSimilarity: number;
  /** Best trigram similarity across the body columns, 0–1. */
  bodySimilarity: number;
  /** `ts_rank_cd` over the full-text vector, unbounded but typically 0–1. */
  textRank: number;
  /** True when a title column equals the query exactly (case-insensitive). */
  exactTitle: boolean;
  /** Age of the row's most meaningful date, in days. Negative or NaN is treated as unknown. */
  ageDays: number;
}

/** A title match beats a body match, hard. Somebody typing "Waggoner" wants the document CALLED
 *  Waggoner, not the twelve deeds that mention a Waggoner Drive in passing. Weighting these equally
 *  is the single fastest way to make a search feel useless on a corpus with long text fields. */
export const WEIGHT_TITLE = 3;
export const WEIGHT_BODY = 1;
export const WEIGHT_TEXT = 2;
/** An exact title match should not be beatable by a pile of weak partials. */
export const EXACT_TITLE_BONUS = 5;

export function scoreHit(s: ScoreInput): number {
  const base =
    s.titleSimilarity * WEIGHT_TITLE +
    s.bodySimilarity * WEIGHT_BODY +
    s.textRank * WEIGHT_TEXT +
    (s.exactTitle ? EXACT_TITLE_BONUS : 0);

  return base * recencyMultiplier(s.ageDays);
}

/** Recency TILTS, it does not sort.
 *
 *  A 1974 deed is often exactly what somebody wants, so recency must never bury it — but between two
 *  equally-matching job files, the one from this month is nearly always the one being looked for. A
 *  multiplier bounded in [0.75, 1] expresses "prefer recent, honour old"; a date sort would express
 *  "the archive does not exist". */
export function recencyMultiplier(ageDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays < 0) return 1; // unknown date — do not penalise
  const YEAR = 365;
  if (ageDays <= 30) return 1;
  if (ageDays >= 5 * YEAR) return 0.75;
  // Linear between one month and five years.
  const span = 5 * YEAR - 30;
  return 1 - 0.25 * ((ageDays - 30) / span);
}

// ── Filters ────────────────────────────────────────────────────────────────────────────────────

export interface SearchFilters {
  /** Corpus ids to search. Empty/undefined = every corpus the user may see. */
  corpora?: string[];
  /** Document/record type values (e.g. `deed`, `plat`), matched against each corpus's type column. */
  types?: string[];
  /** Which date the range applies to. Defaults to `created`, but `effective` is what somebody means
   *  by "deeds from the 1970s". */
  dateRole?: 'created' | 'modified' | 'effective';
  /** Inclusive ISO date bounds. */
  from?: string;
  to?: string;
  limit?: number;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** Validates and normalises untrusted filter input. Returns the filters plus any problems, rather
 *  than throwing — a bad date should narrow nothing and SAY so, not wipe the result set silently. */
export function normaliseFilters(raw: SearchFilters): {
  filters: Required<Pick<SearchFilters, 'dateRole' | 'limit'>> & SearchFilters;
  problems: string[];
} {
  const problems: string[] = [];

  const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v) && !Number.isNaN(Date.parse(v));

  let from = raw.from;
  let to = raw.to;
  if (from && !isIsoDate(from)) { problems.push(`Ignored an unreadable "from" date: ${from}`); from = undefined; }
  if (to && !isIsoDate(to)) { problems.push(`Ignored an unreadable "to" date: ${to}`); to = undefined; }

  if (from && to && Date.parse(from) > Date.parse(to)) {
    // Swapping beats returning nothing: an inverted range is always a slip, and an empty result set
    // would be read as "there are no documents" rather than "your dates are backwards".
    problems.push('The date range was backwards, so it was swapped.');
    [from, to] = [to, from];
  }

  const limit = Math.min(Math.max(1, Math.floor(raw.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);

  return {
    filters: { ...raw, from, to, dateRole: raw.dateRole ?? 'created', limit },
    problems,
  };
}
