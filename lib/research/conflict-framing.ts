// lib/research/conflict-framing.ts — a conflict is a question, not a verdict (plan R20).
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `DiscrepancyCard` renders the AI's `title`, `description` and `ai_recommendation` — prose. The
// `document_ids` and `data_point_ids` that every discrepancy carries are **never rendered at all**.
// So "the deed calls 210.5 feet but the plat shows 210.0" arrives as something the model said, with
// no route to the deed or the plat. That is R17's problem one level up: the conflict is the most
// consequential claim in the packet and it is the one with no visible sources.
//
// And `ai_recommendation` is free text. Sometimes it names a field check; sometimes it picks a
// winner; sometimes it hedges. A recommendation that quietly resolves a conflict is worse than no
// recommendation, because the reviewer never learns there was one.
//
// ── SURVEYOR'S LANGUAGE MEANS THE DIGNITY OF CALLS ──────────────────────────────────────────────
//
// The plan asks for the conflict "in surveyor's language". In Texas boundary retracement that has a
// specific meaning: when the calls of a deed conflict, they are given weight in a settled order of
// dignity (Stafford v. King and its line of cases) —
//
//   natural monuments > artificial monuments > adjoiner calls > course > distance > quantity
//
// This module does NOT apply that hierarchy to decide the conflict. It uses it to say what KIND of
// conflict this is and what evidence would settle it, which is the difference between "the deed
// wins" and "if the called iron rod is recovered, it controls over both recited distances". The
// second is something a crew can act on; the first is a decision nobody asked us to make.

import type { Discrepancy } from '@/types/research';

// ── The hierarchy ───────────────────────────────────────────────────────────────────────────────

export type CallKind =
  | 'natural_monument' | 'artificial_monument' | 'adjoiner'
  | 'course' | 'distance' | 'quantity' | 'unknown';

/** Lower number = higher dignity. Used to describe, never to decide. */
export const CALL_DIGNITY: Record<CallKind, number> = {
  natural_monument: 1,
  artificial_monument: 2,
  adjoiner: 3,
  course: 4,
  distance: 5,
  quantity: 6,
  unknown: 99,
};

export const CALL_LABEL: Record<CallKind, string> = {
  natural_monument: 'a natural monument',
  artificial_monument: 'an artificial monument',
  adjoiner: 'an adjoiner call',
  course: 'a course (bearing)',
  distance: 'a distance',
  quantity: 'a quantity (area)',
  unknown: 'an unclassified call',
};

/** What kind of call is in dispute, from the data category the conflict touches. */
export function callKindFor(category: string | null | undefined): CallKind {
  switch (category) {
    case 'monument':            return 'artificial_monument';
    case 'point_of_beginning':  return 'artificial_monument';
    case 'adjoiner':            return 'adjoiner';
    case 'bearing':             return 'course';
    case 'distance':            return 'distance';
    case 'curve_data':          return 'course';
    case 'area':                return 'quantity';
    case 'call':                return 'distance';
    default:                    return 'unknown';
  }
}

/** Natural monuments are called for by description, not by category — a creek, a river, a bluff, a
 *  live oak. Worth detecting because they sit at the top of the hierarchy and change the answer to
 *  "what would settle this". */
export function detectNaturalMonument(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\b(creek|branch|river|bayou|draw|slough|lake|pond|spring|bluff|ridge|rock outcrop|live oak|post oak|pecan|elm|hackberry|cedar|mesquite)\b/i.test(text);
}

// ── Both sides, shown ───────────────────────────────────────────────────────────────────────────

export interface ConflictSide {
  /** "the 1968 deed", "the 1998 replat" — what a surveyor would call it. */
  sourceLabel: string;
  /** The value this source asserts, as written. */
  value: string;
  /** Document to open. */
  documentId: string | null;
  /** The extracted fact, so the reviewer lands on the line rather than the file. */
  dataPointId: string | null;
}

export interface FramedConflict {
  /** The conflict phrased as a question. A question invites a reading; a statement invites belief. */
  question: string;
  /** Both positions. Empty when the discrepancy carries no source ids — which is itself worth
   *  showing, because a conflict with no sources is a claim, not a finding. */
  sides: ConflictSide[];
  /** What kind of call is in dispute, in the surveyor's own vocabulary. */
  callKind: CallKind;
  /** What evidence would settle it. Names the principle without applying it. */
  fieldCheck: string;
  /** True when the discrepancy has no document or data-point references at all. */
  unsourced: boolean;
  /** Set when the AI's recommendation reads as a decision rather than a check — surfaced so a
   *  reviewer knows a winner was proposed rather than absorbing it as fact. */
  recommendationPicksAWinner: boolean;
}

/** Phrases that mean the model resolved the conflict instead of framing it. */
const VERDICT_PHRASES = [
  /\buse the\b/i, /\brely on\b/i, /\bthe .{0,20}(?:deed|plat|survey) (?:controls|governs|prevails|is correct)\b/i,
  /\bdisregard\b/i, /\bignore the\b/i, /\bcorrect value is\b/i, /\bshould be taken as\b/i,
];

export function readsAsVerdict(recommendation: string | null | undefined): boolean {
  if (!recommendation) return false;
  return VERDICT_PHRASES.some((re) => re.test(recommendation));
}

export interface FramingContext {
  /** Category of the data points in conflict, when known. */
  category?: string | null;
  /** Human labels for the referenced documents, keyed by id. */
  documentLabels?: Record<string, string>;
  /** Values in conflict, keyed by data point id. */
  dataPointValues?: Record<string, string>;
}

/** What would settle this, in the field.
 *
 *  Grounded in the order of dignity so it is a surveyor's answer rather than a generic "verify on
 *  site". Deliberately never says which recital wins: it says what evidence outranks both. */
export function fieldCheckFor(kind: CallKind, natural: boolean): string {
  if (natural) {
    return 'Locate the natural monument called for. A natural object controls over every recited course, distance and area, so recovering it settles the conflict regardless of which document reads better.';
  }
  switch (kind) {
    case 'artificial_monument':
      return 'Search for the called monument at both recited positions. A recovered original monument controls over the courses and distances on either document — find it before deciding anything from the numbers.';
    case 'adjoiner':
      return "Retrace the adjoiner's boundary and locate the common line as occupied and as called. An adjoiner call outranks course and distance, so the neighbour's established line settles this.";
    case 'course':
      return 'Occupy the found corners at each end of the disputed line and measure the actual bearing, correcting both documents to a common basis. Bearings from different eras rarely share a meridian, and that alone explains many apparent conflicts.';
    case 'distance':
      return 'Measure between the recovered monuments at each end of the line. Distance yields to monuments, so what the tape says between two found corners settles this without choosing between the recitals.';
    case 'quantity':
      return 'Compute the area from the retraced boundary. Quantity is the weakest call — it is a consequence of the boundary, not evidence of it, so neither recited acreage settles anything on its own.';
    case 'unknown':
    default:
      return 'Identify which kind of call is in dispute before going to the field — the evidence that settles a monument conflict is not the evidence that settles a distance conflict.';
  }
}

export function frameConflict(d: Discrepancy, ctx: FramingContext = {}): FramedConflict {
  const labels = ctx.documentLabels ?? {};
  const values = ctx.dataPointValues ?? {};

  const sides: ConflictSide[] = [];
  const docs = d.document_ids ?? [];
  const dps = d.data_point_ids ?? [];
  const n = Math.max(docs.length, dps.length);
  for (let i = 0; i < n; i++) {
    const docId = docs[i] ?? null;
    const dpId = dps[i] ?? null;
    sides.push({
      sourceLabel: (docId && labels[docId]) || (docId ? 'an unnamed document' : 'an unattributed source'),
      value: (dpId && values[dpId]) || '(value not recorded)',
      documentId: docId,
      dataPointId: dpId,
    });
  }

  const natural = detectNaturalMonument(`${d.title} ${d.description}`);
  const kind: CallKind = natural ? 'natural_monument' : callKindFor(ctx.category);

  // The question form. A statement of the conflict invites belief; a question invites a reading.
  const question = sides.length >= 2
    ? `Which controls — ${sides[0]!.sourceLabel} at ${sides[0]!.value}, or ${sides[1]!.sourceLabel} at ${sides[1]!.value}?`
    : sides.length === 1
      ? `${d.title} — only one source is recorded for this conflict (${sides[0]!.sourceLabel}). What does the other document say?`
      : `${d.title} — which sources disagree here? None are recorded on this finding.`;

  return {
    question,
    sides,
    callKind: kind,
    fieldCheck: fieldCheckFor(kind, natural),
    unsourced: sides.length === 0,
    recommendationPicksAWinner: readsAsVerdict(d.ai_recommendation),
  };
}

export interface ConflictTotals {
  total: number;
  unsourced: number;
  verdicts: number;
  headline: string;
}

/** Leads with the conflicts that have no sources, because those are claims rather than findings and
 *  a reviewer should know how many of them they are being asked to accept on trust. */
export function conflictTotals(framed: FramedConflict[]): ConflictTotals {
  const unsourced = framed.filter((f) => f.unsourced).length;
  const verdicts = framed.filter((f) => f.recommendationPicksAWinner).length;

  const parts: string[] = [];
  if (unsourced > 0) parts.push(`${unsourced} with no source documents recorded`);
  if (verdicts > 0) parts.push(`${verdicts} where the AI proposed a winner rather than a check`);

  const headline = framed.length === 0
    ? 'No conflicts were found between the sources.'
    : parts.length > 0
      ? `${framed.length} conflict(s) — ${parts.join(', ')}.`
      : `${framed.length} conflict(s), each with both sources recorded.`;

  return { total: framed.length, unsourced, verdicts, headline };
}
