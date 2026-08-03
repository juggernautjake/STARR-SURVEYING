// worker/src/services/plat-notation.ts — how Texas plats and deeds actually write things down.
//
// The owner's ask: *"make sure we can recognize when a drawing is using the double quotation mark to
// show that a distance is duplicated … please make sure we are accounting for all of the different
// methods of notation and drawing over the years for texas."*
//
// ── THE TRAP THAT MAKES A NAIVE DITTO READER WORSE THAN NONE ────────────────────────────────────
//
// On a subdivision plat, a lot table lists a distance once and marks the identical lots below it
// with a ditto — `"` — so twelve lots carry one number and eleven marks. Read the marks as "no
// value" and eleven lots lose their frontage. Read them as the value above and the table is right.
//
// But `"` is ALSO the seconds symbol in a bearing: `N 45°30'15"`. And `'` is both minutes and feet.
// So a reader that treats every `"` as a ditto will corrupt every bearing on the plat — turning a
// correctness fix into a much larger correctness bug, silently, on the one field a boundary depends
// on.
//
// The rule this module uses: **a ditto is a cell that contains a mark and essentially nothing else.**
// A `"` attached to digits is a unit. A `"` sitting alone in a column is a repetition. That is also
// how a human reads the sheet, and it is why `isDitto` tests the WHOLE cell rather than searching
// for a character.
//
// ── AND THE SECOND TRAP: WHAT A DITTO REPEATS ───────────────────────────────────────────────────
//
// A ditto repeats the nearest value ABOVE IT IN THE SAME COLUMN — not the previous row's whole
// content, and not the first row's. Two dittos in a row both mean that same value; a ditto with
// nothing above it means nothing at all and must stay unresolved rather than borrowing from a
// different column.

/** Marks that mean "same as the cell above" on a Texas plat or deed table.
 *
 *  `〃` is the ditto glyph proper; `"` and `''` are what a draughtsman actually inked and what OCR
 *  returns; `do.` and `-do-` are the older written form and appear on 19th-century sheets. */
const DITTO_FORMS = [
  '"', '"', '"', '〃', "''", '‚‚', '„',
  'do', 'do.', '-do-', '—do—', 'ditto', 'same', 'same as above',
];

/** Is this cell a repetition mark rather than a value?
 *
 *  Tests the ENTIRE cell. `"` alone is a ditto; `15"` is fifteen seconds; `N 45°30'15" E` is a
 *  bearing. Anything with a digit in it is a value, because no ditto form contains one. */
export function isDitto(cell: string | null | undefined): boolean {
  const s = (cell ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return false;
  if (/\d/.test(s)) return false;          // a value, or a unit attached to one
  return DITTO_FORMS.includes(s);
}

export interface DittoResolution<T> {
  /** The value, with dittos replaced by what they repeat. */
  values: Array<T | null>;
  /** Which indices were filled from above, so a reader can see what was inferred rather than read. */
  resolvedFrom: Map<number, number>;
  /** Dittos with nothing above them. Left null — a mark at the top of a column repeats nothing. */
  unresolved: number[];
  statement: string;
}

/** Expand ditto marks down one column.
 *
 *  `raw` is the column in table order, top to bottom. Anything `isDitto` takes the nearest resolved
 *  value above it; anything else is parsed by the caller's `parse`.
 *
 *  Column-wise on purpose: a plat's lot table dittos each column independently, and a row-wise
 *  reader would copy a frontage into a depth. */
export function resolveDittoColumn<T>(
  raw: Array<string | null | undefined>,
  parse: (cell: string) => T | null,
): DittoResolution<T> {
  const values: Array<T | null> = [];
  const resolvedFrom = new Map<number, number>();
  const unresolved: number[] = [];
  let lastIndex = -1;

  raw.forEach((cell, i) => {
    if (isDitto(cell)) {
      if (lastIndex === -1) {
        // A ditto in the first populated position repeats nothing. Borrowing from another column
        // or from the row below would be inventing a value.
        values.push(null);
        unresolved.push(i);
        return;
      }
      values.push(values[lastIndex]!);
      resolvedFrom.set(i, lastIndex);
      return;
    }
    const parsed = (cell ?? '').trim() ? parse(cell!.trim()) : null;
    values.push(parsed);
    if (parsed !== null) lastIndex = i;
  });

  const parts: string[] = [];
  if (resolvedFrom.size > 0) {
    parts.push(
      `${resolvedFrom.size} value(s) came from a ditto mark and repeat the cell above rather than ` +
      `being read off the document. They are as reliable as the value they repeat, and no more.`,
    );
  }
  if (unresolved.length > 0) {
    parts.push(
      `${unresolved.length} ditto mark(s) had nothing above them in this column and were left ` +
      `empty — a mark at the top of a column repeats nothing, and guessing would invent a distance.`,
    );
  }
  if (parts.length === 0) parts.push('No ditto marks in this column.');

  return { values, resolvedFrom, unresolved, statement: parts.join(' ') };
}

// ── Distances, as Texas has written them ────────────────────────────────────────────────────────

export interface ParsedDistance {
  /** Always in the unit named, not converted — conversion is `survey-units.ts`'s job. */
  value: number;
  unit: 'feet' | 'varas' | 'chains' | 'rods' | 'links' | 'poles';
  raw: string;
  /** True when the figure was assembled from more than one unit, e.g. "5 chains 50 links". */
  compound: boolean;
}

const UNIT_WORDS: Array<[RegExp, ParsedDistance['unit']]> = [
  [/\b(?:vrs?|varas?|vs)\b/i, 'varas'],
  [/\b(?:chs?|chains?)\b/i, 'chains'],
  [/\b(?:lks?|links?)\b/i, 'links'],
  [/\b(?:rds?|rods?)\b/i, 'rods'],
  [/\b(?:poles?|perch(?:es)?)\b/i, 'poles'],
  [/\b(?:ft|feet|foot|')\b/i, 'feet'],
];

/** Read a distance as a Texas document writes it.
 *
 *  Handles the compound form a 19th-century deed uses — `5 chs 50 lks` — which a plain `parseFloat`
 *  reads as 5, losing two-thirds of the call. Links are a hundredth of a chain, so the compound
 *  collapses to chains rather than being reported as two numbers nobody joins up. */
export function parseDistance(raw: string): ParsedDistance | null {
  const s = raw.trim();
  if (!s) return null;

  // Compound chains + links, the common survey shorthand.
  const compound = /(\d+(?:\.\d+)?)\s*(?:chs?|chains?)\.?\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*(?:lks?|links?)/i.exec(s);
  if (compound) {
    return {
      value: parseFloat(compound[1]!) + parseFloat(compound[2]!) / 100,
      unit: 'chains', raw: s, compound: true,
    };
  }

  // A leading number, optionally with a vulgar fraction: `247½`, `247 1/2`.
  const m = /^(\d+(?:\.\d+)?)\s*(?:(½|¼|¾|⅓|⅔|⅛)|(\d+)\s*\/\s*(\d+))?/.exec(s);
  if (!m) return null;
  let value = parseFloat(m[1]!);
  if (m[2]) value += { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }[m[2]]!;
  else if (m[3] && m[4]) value += parseFloat(m[3]) / parseFloat(m[4]);

  for (const [re, unit] of UNIT_WORDS) if (re.test(s)) return { value, unit, raw: s, compound: false };
  // A bare number in a Texas land description is feet. Stated rather than defaulted silently.
  return { value, unit: 'feet', raw: s, compound: false };
}

// ── What is drawn on the sheet, besides the boundary ────────────────────────────────────────────

export type PlatFeatureKind =
  | 'watercourse'      // river, creek, branch, slough, draw
  | 'waterbody'        // pond, lake, tank
  | 'road'
  | 'right_of_way'
  | 'easement'
  | 'railroad'
  | 'fence';

export interface PlatFeature {
  kind: PlatFeatureKind;
  /** The words that identified it, so a reviewer can check the call. */
  raw: string;
  /** Proper name when the document gives one — "Salado Creek", "FM 436". */
  name: string | null;
  /** Width in feet where stated, which is what makes an easement or ROW actionable. */
  widthFt: number | null;
}

const FEATURE_PATTERNS: Array<[PlatFeatureKind, RegExp]> = [
  // Order matters: "creek" before the generic water words, "right of way" before "road".
  ['watercourse', /\b([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)*)?\s*\b(creek|river|branch|slough|draw|bayou|arroyo|run)\b/i],
  ['waterbody', /\b([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)*)?\s*\b(pond|lake|tank|reservoir)\b/i],
  ['right_of_way', /\b(right[\s-]?of[\s-]?way|r\.?o\.?w\.?)\b/i],
  ['easement', /\b(easement|esm[’']?t\.?|esmt)\b/i],
  ['railroad', /\b(railroad|railway|r\.?r\.?)\b/i],
  ['road', /\b((?:F\.?M\.?|R\.?M\.?|S\.?H\.?|U\.?S\.?|C\.?R\.?|I\.?H\.?)\s?-?\s?\d+|highway|road|street|lane|drive|avenue|boulevard)\b/i],
  ['fence', /\b(fence|fence\s+line|old\s+fence)\b/i],
];

/** Everything the sheet mentions besides the boundary itself.
 *
 *  The owner's ask: *"record if there are rivers, creeks, ponds, lakes … accounting for roads and
 *  ROW's and easements."* These matter for different reasons and the distinction is kept: a
 *  watercourse can be a boundary that MOVES, a road may carry a right of way the deed does not
 *  mention, and an easement is an encumbrance somebody has to be told about. */
export function findPlatFeatures(text: string): PlatFeature[] {
  if (!text?.trim()) return [];
  const out: PlatFeature[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/[\n;]+/)) {
    const l = line.trim();
    if (!l) continue;
    for (const [kind, re] of FEATURE_PATTERNS) {
      const m = re.exec(l);
      if (!m) continue;
      const width = /(\d+(?:\.\d+)?)\s*(?:foot|feet|ft\.?|')\s*(?:wide|width)?/i.exec(l);
      const name = m[1]?.trim() || null;
      const key = `${kind}|${(name ?? '').toLowerCase()}|${m[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind, raw: l.slice(0, 160), name,
        widthFt: width ? parseFloat(width[1]!) : null,
      });
      break;   // one kind per line: the most specific pattern that matched wins
    }
  }
  return out;
}
