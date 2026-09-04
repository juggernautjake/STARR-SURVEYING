// worker/src/research/plat-search-terms.ts — the plat search recipe (plan C1).
//
// A subdivision is recorded under a name that rarely matches the CAD legal description exactly:
// "OAK ESTATES SECTION 1" on the appraisal roll is filed at the clerk as "OAK ESTATES", and
// "WILLIAMS CRK EST" is recorded "WILLIAMS CREEK ESTATES". A single-string search misses both.
// This turns one subdivision name into the ordered list of terms worth searching — the base name
// first (most specific), then the section/phase/unit suffix stripped, then common recording-form
// expansions — so the plat search asks for the name the county actually filed it under.
//
// Pure and deduplicated. The Bell plat search (repository and clerk) already accepts a name plus
// variants; this is what fills the variants, so no new browser loop is added.

/** Abbreviation → recording form. Applied left-to-right; each is a word-boundary match. */
const EXPANSIONS: Array<[RegExp, string]> = [
  [/\bEST\b/g, 'ESTATES'],
  [/\bADDN?\b/g, 'ADDITION'],
  [/\bSUBD?\b/g, 'SUBDIVISION'],
  [/\bHGTS?\b/g, 'HEIGHTS'],
  [/\bPK\b/g, 'PARK'],
  [/\bVLG\b/g, 'VILLAGE'],
  [/\bCRK\b/g, 'CREEK'],
  [/\bMDWS?\b/g, 'MEADOWS'],
  [/\bRDG\b/g, 'RIDGE'],
];

/** A trailing section / phase / unit / number designator, which the clerk index usually drops. */
const SECTION_SUFFIX =
  /\s+(?:SEC(?:TION)?|PH(?:ASE)?|UNIT|NO\.?|#)\s*(?:\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|[A-Z])\.?$/;

/**
 * The ordered, deduplicated search terms for a subdivision name — most specific first.
 * Returns [] for a name too short to search on.
 */
export function platSearchTerms(name: string | null | undefined): string[] {
  const base = (name ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (base.length < 3) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  const add = (t: string) => {
    const v = t.replace(/\s+/g, ' ').trim();
    if (v.length >= 3 && !seen.has(v)) { seen.add(v); out.push(v); }
  };

  add(base);

  // Strip up to three trailing designators ("... SECTION 1 PHASE 2 UNIT A").
  let stripped = base;
  for (let i = 0; i < 3; i += 1) {
    const s = stripped.replace(SECTION_SUFFIX, '').trim();
    if (s === stripped) break;
    stripped = s;
  }
  add(stripped);

  // Expand recording-form abbreviations on both the full and the stripped name.
  for (const src of [base, stripped]) {
    let expanded = src;
    for (const [re, full] of EXPANSIONS) expanded = expanded.replace(re, full);
    add(expanded);
  }

  return out.slice(0, 6);
}

/** Expand a list of subdivision names into the full, deduplicated (case-insensitive) term list,
 *  each source name's own spelling kept first so the most specific query still runs first. */
export function expandSubdivisionTerms(names: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (t: string | null | undefined) => {
    const v = (t ?? '').replace(/\s+/g, ' ').trim();
    const key = v.toUpperCase();
    if (v.length >= 3 && !seen.has(key)) { seen.add(key); out.push(v); }
  };
  for (const name of names) add(name);                         // originals first, original spelling
  for (const name of names) for (const term of platSearchTerms(name)) add(term);
  return out;
}
