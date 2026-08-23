// lib/design/search/index.ts — finding an element among thousands.
//
// Slice C8d of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"if I type 'date' into the element search bar, every element that deals with scheduling
// and dates and calendars and maybe even clocks and timers should show up… I want to create a
// completely robust and functional and helpful search feature."*
//
// ── HOW IT WORKS, IN ONE PARAGRAPH ──────────────────────────────────────────────────────────────
//
// A query is split into terms and filters (`category:input`). Each term is matched against every
// entry's four vocabularies — label, keywords/synonyms, concepts, and derived tokens (its real class
// names, routes and tag) — in TIERS, so an exact label hit outranks a fuzzy description hit by an
// order of magnitude rather than by a rounding error. Each term also EXPANDS through the concept
// graph, so `date` reaches the calendar, the deadline chip and the timer, scored below the literal
// matches. Multiple terms AND together. Every result carries the reason it matched, because a search
// you cannot reason about is one you stop trusting the first time it surprises you.
//
// Pure, dependency-free and unit-tested in `__tests__/design/search.test.ts`.

import type { CatalogueEntry } from '../catalogue/types';
import { conceptsForTerm, CONCEPT_BY_ID } from './concepts';

export interface SearchHit {
  entry: CatalogueEntry;
  score: number;
  /** Human-readable, shown on hover: `matched: keyword "deadline" · concept time`. */
  reasons: string[];
}

export interface SearchOptions {
  /** Restrict to these categories / areas regardless of the query. */
  categories?: string[];
  areas?: string[];
  limit?: number;
}

/** Field weights. Label is worth more than everything else because if the label matches, that is
 *  the thing. */
const WEIGHT = {
  labelExact: 100,
  labelPrefix: 60,
  labelWord: 40,
  keyword: 30,
  synonym: 30,
  keywordPrefix: 18,
  concept: 12,
  description: 8,
  derived: 6,
  fuzzy: 4,
} as const;

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'with']);

export interface ParsedQuery {
  terms: string[];
  phrases: string[];
  negations: string[];
  filters: Record<string, string[]>;
}

/**
 * Split a raw query into its parts.
 *
 *   date range              → two terms
 *   "date range"            → one phrase
 *   category:input date     → a filter and a term
 *   date -icon              → a term and a negation
 */
export function parseQuery(raw: string): ParsedQuery {
  const terms: string[] = [];
  const phrases: string[] = [];
  const negations: string[] = [];
  const filters: Record<string, string[]> = {};

  const pattern = /"([^"]+)"|(\S+)/g;
  for (const match of raw.matchAll(pattern)) {
    const phrase = match[1];
    if (phrase) {
      phrases.push(phrase.toLowerCase().trim());
      continue;
    }
    let token = match[2];
    if (!token) continue;
    if (token.startsWith('-') && token.length > 1) {
      negations.push(token.slice(1).toLowerCase());
      continue;
    }
    const colon = token.indexOf(':');
    if (colon > 0) {
      const key = token.slice(0, colon).toLowerCase();
      const value = token.slice(colon + 1).toLowerCase();
      if (value) {
        filters[key] = [...(filters[key] ?? []), value];
        continue;
      }
      token = token.slice(0, colon);
    }
    const clean = token.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (clean && !STOPWORDS.has(clean)) terms.push(clean);
  }
  return { terms, phrases, negations, filters };
}

/** Levenshtein, capped — beyond the cap the exact distance does not matter, only that it is too far. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(value);
      if (value < best) best = value;
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

/** Words worth matching against, from a string. */
function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w));
}

/** The searchable surface of an entry, built once per search rather than per term. */
interface Indexed {
  entry: CatalogueEntry;
  label: string;
  labelWords: string[];
  keywords: Set<string>;
  synonyms: Set<string>;
  concepts: Set<string>;
  descriptionWords: Set<string>;
  derived: Set<string>;
  /** Every word anywhere, for fuzzy matching. */
  all: string[];
}

export function buildIndex(entries: CatalogueEntry[]): Indexed[] {
  return entries.map((entry) => {
    const keywords = new Set(entry.keywords.map((k) => k.toLowerCase()));
    const synonyms = new Set(entry.synonyms.map((s) => s.toLowerCase()));
    const concepts = new Set(entry.concepts.map((c) => c.toLowerCase()));
    const descriptionWords = new Set(words(entry.description));
    const derived = new Set<string>([
      ...entry.classes.map((c) => c.toLowerCase()),
      ...entry.classes.flatMap((c) => words(c)),
      ...entry.usage.map((u) => u.route.toLowerCase()),
      entry.category,
      ...entry.areas,
      entry.id.toLowerCase(),
      ...words(entry.id),
    ]);
    const all = [
      ...words(entry.label),
      ...[...keywords].flatMap(words),
      ...[...synonyms].flatMap(words),
      ...descriptionWords,
    ];
    return {
      entry,
      label: entry.label.toLowerCase(),
      labelWords: words(entry.label),
      keywords,
      synonyms,
      concepts,
      descriptionWords,
      derived,
      all,
    };
  });
}

function scoreTerm(item: Indexed, term: string): { score: number; reason?: string } {
  if (item.label === term) return { score: WEIGHT.labelExact, reason: `label "${item.entry.label}"` };
  if (item.label.startsWith(term)) return { score: WEIGHT.labelPrefix, reason: `label "${item.entry.label}"` };
  if (item.labelWords.includes(term)) return { score: WEIGHT.labelWord, reason: `label "${item.entry.label}"` };
  if (item.keywords.has(term)) return { score: WEIGHT.keyword, reason: `keyword "${term}"` };
  if (item.synonyms.has(term)) return { score: WEIGHT.synonym, reason: `also called "${term}"` };

  for (const keyword of item.keywords) {
    if (keyword.startsWith(term) || keyword.split(' ').some((w) => w.startsWith(term))) {
      return { score: WEIGHT.keywordPrefix, reason: `keyword "${keyword}"` };
    }
  }
  if (item.descriptionWords.has(term)) return { score: WEIGHT.description, reason: 'description' };
  if (item.derived.has(term)) return { score: WEIGHT.derived, reason: `class or route "${term}"` };

  // Concept expansion: the term belongs to a concept this entry is in.
  for (const conceptId of conceptsForTerm(term)) {
    if (item.concepts.has(conceptId)) {
      return { score: WEIGHT.concept, reason: `concept ${CONCEPT_BY_ID[conceptId]?.label ?? conceptId}` };
    }
  }
  // Or: a word in the entry belongs to the same concept as the term. This is what makes `date` find
  // an entry whose keywords say "calendar" without either word appearing in the other.
  const termConcepts = new Set(conceptsForTerm(term));
  if (termConcepts.size) {
    for (const word of item.all) {
      if (conceptsForTerm(word).some((c) => termConcepts.has(c))) {
        const shared = conceptsForTerm(word).find((c) => termConcepts.has(c))!;
        return { score: WEIGHT.concept - 2, reason: `concept ${CONCEPT_BY_ID[shared]?.label ?? shared} (via "${word}")` };
      }
    }
  }

  // Fuzzy, last: `calender`, `buton`. Only for terms long enough that a typo is likelier than a
  // different word — at three characters, everything is within two edits of everything.
  if (term.length >= 5) {
    for (const word of item.all) {
      if (Math.abs(word.length - term.length) > 2) continue;
      if (editDistance(term, word, 2) <= 2) return { score: WEIGHT.fuzzy, reason: `close to "${word}"` };
    }
  }
  return { score: 0 };
}

/** Log-scaled usage boost: 274 usages should outrank 2, without a single popular entry burying
 *  everything else. */
function usageBoost(entry: CatalogueEntry): number {
  return Math.log10(1 + entry.usageCount) * 4;
}

function passesFilters(entry: CatalogueEntry, query: ParsedQuery, options: SearchOptions): boolean {
  if (options.categories?.length && !options.categories.includes(entry.category)) return false;
  if (options.areas?.length && !entry.areas.some((a) => options.areas!.includes(a))) return false;

  for (const [key, values] of Object.entries(query.filters)) {
    const ok = values.some((value) => {
      switch (key) {
        case 'category': return entry.category === value;
        case 'area': return entry.areas.includes(value as CatalogueEntry['areas'][number]);
        case 'state': return entry.states.includes(value as CatalogueEntry['states'][number]);
        case 'concept': return entry.concepts.includes(value);
        case 'class': return entry.classes.some((c) => c.toLowerCase().includes(value));
        case 'route': return entry.usage.some((u) => u.route.toLowerCase().includes(value));
        case 'is':
          if (value === 'interactive') return entry.states.length > 1;
          if (value === 'annotation') return entry.id.startsWith('shape.');
          return true;
        case 'has':
          if (value === 'icon') return entry.slots.some((s) => s.kind === 'icon');
          if (value === 'label') return entry.slots.some((s) => s.kind === 'text');
          return true;
        default:
          return true;    // an unknown filter narrows nothing rather than returning zero results
      }
    });
    if (!ok) return false;
  }

  for (const negated of query.negations) {
    const haystack = `${entry.label} ${entry.keywords.join(' ')} ${entry.id}`.toLowerCase();
    if (haystack.includes(negated)) return false;
  }
  return true;
}

/**
 * Search.
 *
 * An empty query is not an empty result — it is everything, ranked by real usage, which is the most
 * useful thing to show somebody who has just opened the panel.
 */
export function search(index: Indexed[], raw: string, options: SearchOptions = {}): SearchHit[] {
  const query = parseQuery(raw);
  const limit = options.limit ?? 60;

  const candidates = index.filter((item) => passesFilters(item.entry, query, options));

  if (!query.terms.length && !query.phrases.length) {
    return candidates
      .map((item) => ({ entry: item.entry, score: usageBoost(item.entry), reasons: [] }))
      .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
      .slice(0, limit);
  }

  const hits: SearchHit[] = [];
  for (const item of candidates) {
    let total = 0;
    const reasons: string[] = [];
    let matchedEvery = true;

    for (const phrase of query.phrases) {
      const haystack = `${item.label} ${[...item.keywords].join(' ')} ${item.entry.description.toLowerCase()}`;
      if (haystack.includes(phrase)) {
        total += WEIGHT.keyword;
        reasons.push(`phrase "${phrase}"`);
      } else {
        matchedEvery = false;
        break;
      }
    }
    if (!matchedEvery) continue;

    for (const term of query.terms) {
      const { score, reason } = scoreTerm(item, term);
      if (score === 0) { matchedEvery = false; break; }
      total += score;
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    }
    if (!matchedEvery || total === 0) continue;

    hits.push({ entry: item.entry, score: total + usageBoost(item.entry), reasons });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
    .slice(0, limit);
}

/**
 * Search that never dead-ends.
 *
 * If the query finds nothing, fall back to the concepts its terms belong to and say so. "Nothing
 * matched 'chronometer' — showing 12 results for the concept Time & scheduling" is a search that
 * helped; an empty panel is one that did not.
 */
export function searchWithFallback(
  index: Indexed[],
  raw: string,
  options: SearchOptions = {},
): { hits: SearchHit[]; note?: string } {
  const hits = search(index, raw, options);
  if (hits.length || !raw.trim()) return { hits };

  const query = parseQuery(raw);
  const conceptIds = [...new Set(query.terms.flatMap(conceptsForTerm))];
  if (conceptIds.length) {
    const byConcept = index
      .filter((item) => item.entry.concepts.some((c) => conceptIds.includes(c)))
      .filter((item) => passesFilters(item.entry, { ...query, terms: [], phrases: [] }, options))
      .map((item) => ({ entry: item.entry, score: usageBoost(item.entry), reasons: ['related concept'] }))
      .sort((a, b) => b.score - a.score);
    if (byConcept.length) {
      const labels = conceptIds.map((c) => CONCEPT_BY_ID[c]?.label ?? c).join(', ');
      return {
        hits: byConcept.slice(0, options.limit ?? 60),
        note: `Nothing matched “${raw.trim()}” exactly — showing ${byConcept.length} result${byConcept.length === 1 ? '' : 's'} for ${labels}.`,
      };
    }
  }
  return { hits: [], note: `Nothing matched “${raw.trim()}”. Try a category, a colour, or what the thing does.` };
}
