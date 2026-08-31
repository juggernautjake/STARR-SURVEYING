// lib/research/county-input.ts — is what somebody typed actually a Texas county?
//
// ── THE RUN THIS EXISTS FOR ─────────────────────────────────────────────────────────────────────
//
// On 2026-08-30 the owner filled in the New Research Project form for the Bell County Courthouse
// and typed **"Texas"** in the County field, with "TX" in State beside it. It is an entirely
// reasonable thing to type — the label says County, the property is in Texas — and nothing on the
// screen said otherwise.
//
// County is not a label here. It is the routing key: `getClerkSystem()` uses it to choose the
// portal, and Bell routes to Kofile (free) while a county with no adapter falls through to
// TexasFile at roughly $1-3 a document. A county that matches nothing routes nowhere, so the run
// either fails address validation twenty minutes in or produces a report about no property at all.
//
// The cost of catching it here is one comparison against a list we already ship. The cost of not
// catching it is a wasted run, and — in a TexasFile county — wasted money.
//
// ── WHY A WARNING AND NOT A BLOCK ───────────────────────────────────────────────────────────────
//
// The list is authoritative for Texas and this firm works in Texas, so a hard block is tempting.
// It is still wrong: this check runs on a string a human is halfway through typing, and a form that
// refuses to submit because you have got as far as "Bel" teaches people to fight the form. The
// server does the real validation against the same data, and the address check catches a mismatch
// that is spelled correctly but wrong.
//
// So: say clearly that it does not match, name the nearest real counties, and let the operator
// decide. Being unmissable and being obstructive are different things.
//
// ── AND "TEXAS" GETS ITS OWN ANSWER ─────────────────────────────────────────────────────────────
//
// "No match, did you mean Bexar?" would be a terrible reply to "Texas". The mistake is not a
// misspelling, it is a category error, and the useful response says so. A suggestion list computed
// by edit distance cannot tell the two apart — that is why this is a separate branch and not a
// tuning parameter.

import { TEXAS_COUNTIES } from '@/worker/src/lib/county-fips';

export type CountyCheck =
  /** Matches a real Texas county. `canonical` is the correctly-cased name to store. */
  | { kind: 'ok'; canonical: string }
  /** Nothing typed yet. Not an error — the field is optional until you run. */
  | { kind: 'empty' }
  /** The state name, or its abbreviation, in the county box. Its own mistake, its own message. */
  | { kind: 'is-state'; message: string }
  /** Typed something that is not a Texas county. `suggestions` may be empty. */
  | { kind: 'unknown'; message: string; suggestions: string[] };

/**
 * Fold a typed county to something comparable.
 *
 * Strips a trailing "County" (people type "Bell County" as often as "Bell"), lowercases, and drops
 * everything that is not a letter or digit. That last step is what makes "DeWitt", "De Witt" and
 * "de-witt" the same key, and it is why the comparison is done on this rather than on the raw
 * string: Texas county names contain spaces, periods and capitals in inconsistent places, and the
 * operator should not have to guess which spelling we chose.
 */
export function normalizeCounty(input: string): string {
  return input
    .replace(/\bcounty\b/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const BY_KEY = new Map<string, string>(
  TEXAS_COUNTIES.map((c) => [normalizeCounty(c.name), c.name]),
);

/** Levenshtein distance, capped — we only care whether it is small. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/**
 * Nearest real county names to something that did not match.
 *
 * Prefix matches first and unconditionally — somebody who typed "Will" wants Williamson or Wilson,
 * and no distance metric should be allowed to outrank that. Then close misspellings.
 */
export function suggestCounties(typed: string, limit = 3): string[] {
  const key = normalizeCounty(typed);
  if (!key) return [];

  const prefix = TEXAS_COUNTIES
    .filter((c) => normalizeCounty(c.name).startsWith(key))
    .map((c) => c.name);

  const near = TEXAS_COUNTIES
    .map((c) => ({ name: c.name, d: editDistance(key, normalizeCounty(c.name)) }))
    // Scaled to the length of what was typed: one wrong letter in "Bell" is a different kind of
    // wrong from one letter in "Nacogdoches", and a fixed threshold treats them the same.
    .filter((c) => c.d <= Math.max(1, Math.floor(key.length / 3)))
    .sort((a, b) => a.d - b.d || a.name.localeCompare(b.name))
    .map((c) => c.name);

  return [...new Set([...prefix, ...near])].slice(0, limit);
}

/** State names and abbreviations that mean "this is not a county at all". */
const STATE_WORDS = new Set(['texas', 'tx', 'tex']);

/**
 * Classify what is in the County box.
 *
 * Pure, and deliberately not a React hook: the interesting behaviour is a mapping from a string to
 * advice, and it should be testable without a DOM.
 */
export function checkCounty(input: string | null | undefined): CountyCheck {
  const raw = (input ?? '').trim();
  if (!raw) return { kind: 'empty' };

  const key = normalizeCounty(raw);
  if (!key) return { kind: 'empty' };

  const canonical = BY_KEY.get(key);
  if (canonical) return { kind: 'ok', canonical };

  if (STATE_WORDS.has(key)) {
    return {
      kind: 'is-state',
      message:
        'That is the state, not the county. Enter the Texas county the property sits in — for example Bell for Belton, or Travis for Austin.',
    };
  }

  const suggestions = suggestCounties(raw);
  return {
    kind: 'unknown',
    message: suggestions.length
      ? `"${raw}" is not a Texas county.`
      : `"${raw}" is not one of the 254 Texas counties. Check the spelling — the county decides which clerk portal the run uses.`,
    suggestions,
  };
}
