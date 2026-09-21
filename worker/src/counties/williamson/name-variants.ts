/**
 * Williamson clerk — asking the county how IT spells a name.
 *
 * ── THE PROBLEM, AND WHY GUESSING AT IT FAILS ───────────────────────────────────────────────────
 *
 * The clerk's own disclaimer says it plainly: *"The user is advised to search all possible spelling
 * variations of names, as well as other search criteria, to maximize search results."*
 *
 * That is not boilerplate. Asking the county's index for "ROUND ROCK HOUSING" on 2026-09-21
 * returned four separate entries, and asking for "HOUSING AUTHORITY" returned these among
 * thirty-two:
 *
 *     ROUND ROCK HOUSING AUTHORITY          HOUSING AUTHORITY CITY OF ROUND ROCK
 *     ROUND ROCK HOUSING AUTH               HOUSING AUTHORITY OF CITY OF ROUND ROCK
 *     ROUND ROCK HOUSING AUTHORIT           HOUSING AUTHORITY OF CITY ROUND ROCK
 *
 * **Six spellings of one entity**, including a truncated "AUTHORIT" — a field-width casualty from
 * whenever that book was indexed. A run that searches the one spelling somebody typed finds a
 * fraction of the documents and reports it as the whole.
 *
 * ── THE INSIGHT ─────────────────────────────────────────────────────────────────────────────────
 *
 * The chip list's suggestion endpoint is not just a UI convenience — it is a **query against the
 * county's actual name index**. So the variants do not have to be guessed. They can be ASKED FOR,
 * and the answer is authoritative because it is the same index the search runs against.
 *
 * And because the field is a chip list, every variant can ride in ONE search. Selecting all four
 * "ROUND ROCK HOUSING*" entries returned 18 documents in a single query rather than four queries
 * to be merged and deduplicated.
 *
 * Verified end to end: four variants, one search, 18 documents, spanning 1982 to 1998 with grantor,
 * grantee, book/page and legal description on every row.
 */

import { WILLIAMSON_ENDPOINTS } from './config/endpoints.js';
import type { NameField } from './clerk.js';

/** How many suggestions to ask for. The UI asks for 1000; that is plenty and costs nothing extra. */
export const MAX_SUGGESTIONS = 1000;

export interface VariantLookup {
  /** What was asked. */
  stem: string;
  /** What the county's index actually contains, in its own spelling. */
  variants: string[];
  error: string | null;
}

/**
 * The shortest stem worth asking with.
 *
 * "ROUND ROCK HOUSING AUTHORITY" finds only the exact entry; "ROUND ROCK HOUSING" finds all four
 * spellings including the truncated one. So a stem is built by dropping the ENTITY DESIGNATOR — the
 * word most likely to have been abbreviated or cut off by a field width — and that is also the word
 * that carries the least identifying information.
 *
 * "SMITH JAMES" has no designator and is returned unchanged; a personal name has nothing safe to
 * trim, and shortening it to "SMITH" would pull in every Smith in the county.
 */
export function variantStem(name: string): string {
  const n = (name ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!n) return '';

  // ── ONE TRAILING TOKEN, NOT THE WHOLE PHRASE ────────────────────────────────────────────────
  //
  // The first version stripped multi-word designators as units, so "HOUSING AUTHORITY" came off
  // together and left "ROUND ROCK". The live index says that is too short: the stem that actually
  // found all four spellings — including the truncated "AUTHORIT" — is "ROUND ROCK HOUSING".
  //
  // The reason is that only the LAST word gets mangled. An index truncates at a field width and
  // abbreviates the final designator; it does not drop a meaningful noun from the middle. So the
  // right move is to remove exactly one trailing token and keep everything that identifies the
  // entity.
  const designators = [
    'AUTHORITY', 'ASSOCIATION', 'CORPORATION', 'PARTNERSHIP', 'PARTNERS', 'PROPERTIES',
    'ENTERPRISES', 'INVESTMENTS', 'HOLDINGS', 'INCORPORATED', 'COMPANY', 'TRUST', 'DISTRICT',
    'LLC', 'INC', 'CORP', 'LTD', 'LP', 'LLP', 'PLLC', 'CO',
  ];

  const words = n.split(' ');
  const last = words[words.length - 1]!.replace(/[.]/g, '');
  if (designators.includes(last) && words.length >= 3) {
    // Three words minimum, so "ACME LLC" is left whole — trimming it to "ACME" would pull in every
    // Acme in the county, which is the same mistake as shortening a personal name.
    return words.slice(0, -1).join(' ');
  }
  return n;
}

/**
 * Ask the county's index which spellings it holds.
 *
 * POST, despite reading like a GET — that is how the page calls it. The response shape is not
 * documented anywhere, so several plausible envelopes are accepted rather than one being assumed:
 * an array of strings, an array of objects, or a wrapper with `suggestions`/`data`/`results`.
 * Guessing one and being wrong would return an empty variant list, which looks exactly like a name
 * the county has never recorded.
 */
export async function lookupNameVariants(
  name: string,
  opts: { field?: NameField; fetchImpl?: typeof fetch; max?: number } = {},
): Promise<VariantLookup> {
  const stem = variantStem(name);
  if (!stem) return { stem: '', variants: [], error: 'no name to look up' };

  const field: NameField = opts.field ?? 'BothNamesID';
  const base = WILLIAMSON_ENDPOINTS.clerk.home.replace(/\/$/, '');
  const url = new URL(`${base}/search/suggest/${field}`);
  url.searchParams.set('searchText', stem);
  url.searchParams.set('maxValues', String(opts.max ?? MAX_SUGGESTIONS));

  try {
    const res = await (opts.fetchImpl ?? fetch)(url.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { stem, variants: [], error: `suggest returned ${res.status}` };

    const body: unknown = await res.json().catch(() => null);
    return { stem, variants: readSuggestions(body), error: null };
  } catch (e) {
    return { stem, variants: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pull names out of whatever envelope the endpoint used. Exported so it can be tested alone. */
export function readSuggestions(body: unknown): string[] {
  if (!body) return [];
  const rows: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { suggestions?: unknown }).suggestions)
      ? (body as { suggestions: unknown[] }).suggestions
      : Array.isArray((body as { data?: unknown }).data)
        ? (body as { data: unknown[] }).data
        : Array.isArray((body as { results?: unknown }).results)
          ? (body as { results: unknown[] }).results
          : [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const v = typeof r === 'string'
      ? r
      : (r && typeof r === 'object')
        ? String((r as Record<string, unknown>).value
          ?? (r as Record<string, unknown>).name
          ?? (r as Record<string, unknown>).text
          ?? '')
        : '';
    const n = v.replace(/\s+/g, ' ').trim();
    if (!n) continue;
    const key = n.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/**
 * Which of the county's spellings are plausibly the entity we asked about.
 *
 * The stem trick widens the net on purpose, and a wide net catches strangers: asking for
 * "VILLAGE GREEN" returns the brewery and the events venue alongside the subdivision. Selecting all
 * of them is not wrong — they are separate index entries and the search is cheap — but a run should
 * be able to say which ones it believes in.
 *
 * The test is containment of the significant words, not string distance. "ROUND ROCK HOUSING
 * AUTHORIT" and "HOUSING AUTHORITY OF CITY OF ROUND ROCK" are the same entity with the words in a
 * different order, and no edit-distance threshold treats those as close while also rejecting
 * "VILLAGE GREEN BREWERY".
 */
/**
 * Words that restate an entity rather than naming a different one.
 *
 * Connectives, legal designators and the geography this county is in. "HOUSING AUTHORITY **OF THE
 * CITY OF** ROUND ROCK" is the same body as "ROUND ROCK HOUSING AUTHORITY"; "VILLAGE GREEN
 * **BREWERY**" is not the same thing as the Village Green subdivision.
 */
const FILLER_WORDS = new Set([
  'THE', 'AND', 'FOR', 'OF', 'CITY', 'TOWN', 'COUNTY', 'TEXAS', 'STATE',
  'AUTHORITY', 'ASSOCIATION', 'CORPORATION', 'CORP', 'COMPANY', 'INCORPORATED', 'INC',
  'PARTNERSHIP', 'PARTNERS', 'HOLDINGS', 'TRUST', 'LLC', 'LTD', 'LLP', 'PLLC',
]);

export function rankVariants(asked: string, variants: readonly string[]): Array<{ name: string; confident: boolean; why: string }> {
  const words = (s: string) => s.toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length > 2);
  const askedWords = new Set(words(asked));

  return variants.map((v) => {
    const vw = words(v);

    // ── A TRUNCATED WORD IS THE SAME WORD ────────────────────────────────────────────────────
    //
    // The index holds "ROUND ROCK HOUSING AUTHORIT" — the designator cut off by a field width.
    // Comparing words exactly makes "AUTHORIT" an EXTRA word rather than a mangled "AUTHORITY",
    // and the entity gets rejected as a stranger. Caught by the test suite against the live data.
    //
    // Five characters is the shared-prefix threshold: long enough that "ROCK" and "ROCKWALL" do
    // not collapse, short enough to survive the truncations this index actually contains.
    const sameWord = (a: string, b: string) =>
      a === b || (a.length >= 5 && b.startsWith(a.slice(0, 5))) || (b.length >= 5 && a.startsWith(b.slice(0, 5)));
    const known = (w: string) => [...askedWords].some((a) => sameWord(a, w));

    const shared = vw.filter(known).length;
    const extra = vw.filter((w) => !known(w));

    // Every significant word we asked about is present, in some order.
    const coversAsked = [...askedWords].every((w) => vw.some((x) => x.startsWith(w.slice(0, 5))));

    if (coversAsked && extra.length === 0) {
      return { name: v, confident: true, why: 'the same words, exactly' };
    }
    if (coversAsked) {
      // ── EXTRA WORDS ARE NOT ALL ALIKE ──────────────────────────────────────────────────────
      //
      // The first version called any superset a "fuller form", and the live index showed what that
      // costs: asking for "VILLAGE GREEN" returns VILLAGE GREEN BREWERY and VILLAGE GREEN EVENTS
      // VENUE, and both were being accepted as the subdivision.
      //
      // What separates them from a genuine fuller form is the KIND of word added. "HOUSING
      // AUTHORITY OF CITY OF ROUND ROCK" adds connectives and a place; "VILLAGE GREEN BREWERY"
      // adds a business. Connectives and geography restate the same entity — a substantive noun
      // names a different one.
      const filler = extra.filter((w) => !FILLER_WORDS.has(w));
      if (filler.length === 0) {
        return { name: v, confident: true, why: `the same words plus ${extra.join(', ')} — a fuller form of the name` };
      }
      return {
        name: v, confident: false,
        why: `adds ${filler.join(', ')} — a different party that shares a name`,
      };
    }
    // A truncation: the variant is a prefix-ish of what we asked for.
    if (shared >= Math.max(2, askedWords.size - 1)) {
      return { name: v, confident: true, why: 'the same words, one truncated or abbreviated by the index' };
    }
    return { name: v, confident: false, why: `shares only ${shared} word(s) — probably a different party` };
  });
}

/** The names to actually put in the chip list: the confident ones, plus what was asked. */
export function variantsToSearch(asked: string, variants: readonly string[]): string[] {
  // Deduped here as well as in `readSuggestions`, because a caller can hand this a list assembled
  // from several lookups — and "ACME LLC" and "acme llc" are one chip, not two.
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rankVariants(asked, variants)) {
    if (!r.confident) continue;
    const key = r.name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.name);
  }
  const a = (asked ?? '').replace(/\s+/g, ' ').trim();
  // Always include what the operator said, even when the index has no entry for it — its absence
  // from the results is then a finding rather than a step we skipped.
  if (a && !seen.has(a.toUpperCase())) out.push(a);
  return out;
}
