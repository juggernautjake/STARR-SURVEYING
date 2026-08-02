// lib/research/encumbrance-rollup.ts — what encumbers this property (plan R34).
//
// ── WHY THIS NEEDS THE NEIGHBOURS ───────────────────────────────────────────────────────────────
//
// An easement is usually recorded against ONE of the two tracts it crosses. A utility easement
// granted by the neighbour to the north, running along the common line, is recorded in the
// neighbour's deed and appears nowhere in the subject property's chain — and it still encumbers the
// subject if the line moved, or if the grant was written to the centre of the road.
//
// The same is true of rights-of-way. A county road widening recorded as a taking from the adjoining
// tract tells you where the ROW line now is, which is exactly what a retracement of the subject's
// frontage needs.
//
// So a rollup built only from the subject's own documents is systematically incomplete, and
// incomplete in a direction that matters: the encumbrances it misses are the ones on the boundary.
//
// ── WHAT THIS DOES NOT CLAIM ────────────────────────────────────────────────────────────────────
//
// Whether a neighbour's easement actually burdens the subject is a legal question that depends on
// the grant's words and on where the line really is. This module does not decide it. It surfaces the
// encumbrance, says which tract it was recorded against, and states that the question is open — the
// same treatment R20 gives a conflict.

export type EncumbranceKind = 'easement' | 'right_of_way' | 'setback' | 'restriction' | 'unknown';
export type EncumbranceOrigin = 'subject' | 'adjoiner';

export interface EncumbranceInput {
  id: string;
  /** The data category the extraction assigned. */
  category: string;
  rawValue: string;
  displayValue?: string | null;
  documentId: string | null;
  /** Set when this came from a neighbour's records rather than the subject's. */
  adjoinerId?: string | null;
  adjoinerLabel?: string | null;
  /** Where the neighbour sits relative to the subject, when known. */
  adjoinsWhere?: string | null;
  reviewStatus?: string | null;
  correctedValue?: string | null;
}

export interface Encumbrance {
  id: string;
  kind: EncumbranceKind;
  origin: EncumbranceOrigin;
  /** What it says, using the corrected value where a reviewer supplied one (R23). */
  text: string;
  /** Width in feet where the text states one. */
  widthFt: number | null;
  purpose: string | null;
  documentId: string | null;
  /** For an adjoiner encumbrance: whose records it came from, and where they sit. */
  source: string;
  /** Whether this burdens the subject property. For adjoiner-recorded encumbrances this is an open
   *  question, never an assertion. */
  bearing: string;
  /** True when a reviewer has not checked the underlying fact. */
  unverified: boolean;
}

const KIND_BY_CATEGORY: Record<string, EncumbranceKind> = {
  easement: 'easement',
  right_of_way: 'right_of_way',
  setback: 'setback',
  restrictive_covenant: 'restriction',
};

export function kindOf(category: string, text: string): EncumbranceKind {
  const direct = KIND_BY_CATEGORY[category];
  if (direct) return direct;
  const t = text.toLowerCase();
  if (/right[- ]of[- ]way|\brow\b|road widening|street dedication/.test(t)) return 'right_of_way';
  if (/easement/.test(t)) return 'easement';
  if (/setback|building line/.test(t)) return 'setback';
  if (/restrict|covenant/.test(t)) return 'restriction';
  return 'unknown';
}

/** Width in feet, where the instrument states one. Same forms as R19's easement parser — a stated
 *  width is what turns "there is an easement" into something a crew can stake. */
export function widthOf(text: string): number | null {
  // Up to two words may sit between the unit and the noun — "20 foot **utility** easement" is the
  // commonest form of all, and requiring the noun immediately after the unit misses it.
  //
  // The noun is still REQUIRED, and `right` is spelled out as `right of way`: without that guard,
  // "210.5 feet to the right" in a metes-and-bounds recital parses as a 210-foot easement, which is
  // a fabricated encumbrance on a drawing.
  const m =
    text.match(
      /\b(\d{1,3}(?:\.\d+)?)\s*-?\s*(?:foot|feet|ft\.?|')(?:\s+\w+){0,2}\s+(?:wide|width|easement|strip|right[- ]of[- ]way|row)\b/i,
    ) ??
    text.match(/\bwidth\s+of\s+(\d{1,3}(?:\.\d+)?)\s*(?:foot|feet|ft\.?|')?/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function purposeOf(text: string): string | null {
  return text.match(
    /\b(utility|electric(?:al)?|drainage|access|ingress|egress|pipeline|gas|water|sewer|telephone|communication|slope|sidewalk|roadway|flood)\b/i,
  )?.[1]?.toLowerCase() ?? null;
}

export function rollUpEncumbrances(inputs: EncumbranceInput[]): Encumbrance[] {
  return inputs.map((i) => {
    // A reviewer's correction is what the document says (R23); the raw extraction is not.
    const text = (i.reviewStatus === 'corrected' && i.correctedValue) || i.displayValue || i.rawValue;
    const origin: EncumbranceOrigin = i.adjoinerId ? 'adjoiner' : 'subject';

    const source = origin === 'subject'
      ? "This property's own records"
      : `${i.adjoinerLabel ?? 'a neighbour'}'s records${i.adjoinsWhere ? ` (adjoins on the ${i.adjoinsWhere})` : ''}`;

    const bearing = origin === 'subject'
      ? 'Recorded against this property.'
      : 'Recorded against the NEIGHBOUR, not this property. Whether it burdens this tract depends on ' +
        'the wording of the grant and on where the common line actually falls — read the instrument ' +
        'before excluding it.';

    return {
      id: i.id,
      kind: kindOf(i.category, text),
      origin,
      text,
      widthFt: widthOf(text),
      purpose: purposeOf(text),
      documentId: i.documentId,
      source,
      bearing,
      unverified: !i.reviewStatus || i.reviewStatus === 'unreviewed',
    };
  });
}

export interface EncumbranceSummary {
  total: number;
  fromSubject: number;
  fromAdjoiners: number;
  unverified: number;
  withoutWidth: number;
  headline: string;
  caveats: string[];
}

/** The one-line answer to "what encumbers this property".
 *
 *  Counts the adjoiner-sourced ones separately, because they are the ones a reader will not expect
 *  and the ones most likely to be dismissed as irrelevant — which is exactly the mistake this rollup
 *  exists to prevent. */
export function summariseEncumbrances(list: Encumbrance[]): EncumbranceSummary {
  const fromSubject = list.filter((e) => e.origin === 'subject').length;
  const fromAdjoiners = list.filter((e) => e.origin === 'adjoiner').length;
  const unverified = list.filter((e) => e.unverified).length;
  const withoutWidth = list.filter((e) => e.widthFt == null && (e.kind === 'easement' || e.kind === 'right_of_way')).length;

  const caveats: string[] = [];
  if (fromAdjoiners > 0) {
    caveats.push(
      `${fromAdjoiners} of these were recorded against a neighbouring tract, not this one. An easement ` +
      'is usually recorded against only one of the two tracts it crosses, so these are not automatically ' +
      'irrelevant — read each grant before excluding it.',
    );
  }
  if (withoutWidth > 0) {
    caveats.push(
      `${withoutWidth} easement(s) or right(s)-of-way have no stated width. Without one there is nothing ` +
      'to stake, and the encumbered strip cannot be shown on a drawing.',
    );
  }
  if (unverified > 0) {
    caveats.push(`${unverified} have not been checked against the source document by a person.`);
  }
  // The one this rollup cannot answer, said every time rather than only when it looks relevant.
  caveats.push(
    'Anything recorded against a neighbour whose records were not retrieved is missing from this list. ' +
    'Researching more of the neighbours is what closes that gap.',
  );

  const headline = list.length === 0
    ? 'No easements, rights-of-way or restrictions have been found. That is not the same as there being none — it depends on which documents were retrieved.'
    : `${list.length} encumbrance(s): ${fromSubject} from this property's records` +
      (fromAdjoiners > 0 ? `, ${fromAdjoiners} from a neighbour's` : '') + '.';

  return { total: list.length, fromSubject, fromAdjoiners, unverified, withoutWidth, headline, caveats };
}
