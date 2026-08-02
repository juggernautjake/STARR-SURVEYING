// lib/research/fact-review.ts — accepted, rejected, corrected, or nobody has looked (plan R23).
//
// ── THE GAP ─────────────────────────────────────────────────────────────────────────────────────
//
// `extracted_data_points` has carried a confidence score since seed 090 and no human verdict at all.
// So a value read correctly off a deed and a value the model invented look identical to the next
// reader and to every downstream stage — the boundary computation, the drawing, the packet. A
// reviewer who spotted a wrong bearing had nowhere to put that knowledge.
//
// R17 made it visible whether a fact has EVIDENCE. This is the other axis: whether a person has
// LOOKED. They are independent — a quoted fact can still be misread, and an unevidenced one can be
// confirmed by a surveyor who knows the property — so they are two states, not one scale.
//
// ── REJECTED IS NOT DELETED ─────────────────────────────────────────────────────────────────────
//
// A rejected fact stays in the table. Deleting it would make the extraction look like it never
// produced the error, which is the record R9's self-healing checks need most: the pair of (what we
// extracted, what it should have been) is a test case, and an absence is not.

export type ReviewStatus = 'unreviewed' | 'accepted' | 'rejected' | 'corrected';

export interface ReviewableFact {
  id: string;
  raw_value: string;
  display_value?: string | null;
  review_status?: ReviewStatus | null;
  corrected_value?: string | null;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface ReviewMeta {
  status: ReviewStatus;
  /** What downstream should actually use. A rejected fact yields null — it must drop out of the
   *  computation rather than quietly continue as its original value. */
  effectiveValue: string | null;
  label: string;
  detail: string;
  /** Does this fact still need a person? */
  needsReview: boolean;
  /** Should a boundary computation, drawing or packet consume it? */
  usable: boolean;
}

export function reviewMeta(f: ReviewableFact): ReviewMeta {
  const status: ReviewStatus = f.review_status ?? 'unreviewed';
  const who = f.reviewed_by ? ` by ${f.reviewed_by}` : '';
  const when = f.reviewed_at ? ` on ${f.reviewed_at.slice(0, 10)}` : '';
  const original = f.display_value || f.raw_value;

  switch (status) {
    case 'accepted':
      return {
        status, effectiveValue: original, label: 'accepted', needsReview: false, usable: true,
        detail: `Checked against the source and accepted${who}${when}.`,
      };
    case 'corrected':
      return {
        status,
        // The correction is what downstream uses; the original stays on the row.
        effectiveValue: f.corrected_value ?? original,
        label: 'corrected', needsReview: false, usable: true,
        detail:
          `Corrected${who}${when}: the extraction read "${original}", the document says ` +
          `"${f.corrected_value ?? '(no value recorded)'}".` +
          (f.review_note ? ` ${f.review_note}` : ''),
      };
    case 'rejected':
      return {
        status, effectiveValue: null, label: 'rejected', needsReview: false, usable: false,
        detail:
          `Rejected${who}${when} — this value is not in the document.` +
          (f.review_note ? ` ${f.review_note}` : '') +
          ' It is kept rather than deleted, so the extraction error stays on the record.',
      };
    case 'unreviewed':
    default:
      return {
        status, effectiveValue: original, label: 'unchecked', needsReview: true,
        // Deliberately still usable: refusing to compute anything until every fact is hand-checked
        // would make the pipeline useless. But it must be VISIBLY unchecked wherever it is used.
        usable: true,
        detail: 'Nobody has checked this value against the source document yet.',
      };
  }
}

export interface ReviewProgress {
  total: number;
  unreviewed: number;
  accepted: number;
  rejected: number;
  corrected: number;
  /** Fraction checked, 0–1. Null when there is nothing to check — never 1, which would read as
   *  "fully reviewed". */
  fractionReviewed: number | null;
  headline: string;
}

export function reviewProgress(facts: ReviewableFact[]): ReviewProgress {
  const counts = { unreviewed: 0, accepted: 0, rejected: 0, corrected: 0 };
  for (const f of facts) counts[reviewMeta(f).status]++;

  const total = facts.length;
  const reviewed = counts.accepted + counts.rejected + counts.corrected;
  const fractionReviewed = total === 0 ? null : reviewed / total;

  const headline = total === 0
    ? 'No facts have been extracted yet, so there is nothing to review.'
    : counts.unreviewed === 0
      ? `All ${total} facts have been checked — ${counts.accepted} accepted, ${counts.corrected} corrected, ${counts.rejected} rejected.`
      : `${reviewed} of ${total} facts checked. ${counts.unreviewed} still unchecked` +
        (counts.rejected + counts.corrected > 0
          ? `, and ${counts.rejected + counts.corrected} of those checked were wrong — the rest deserve the same scrutiny.`
          : '.');

  return { total, ...counts, fractionReviewed, headline };
}

// ── Corrections as golden-record candidates ─────────────────────────────────────────────────────

export interface GoldenCandidate {
  dataPointId: string;
  extracted: string;
  shouldBe: string;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** Corrections, in the shape R9's canary golden records consume.
 *
 *  A correction is a test case the business paid a surveyor to produce: somebody read the document
 *  and said what the answer actually is. Throwing that away after fixing one project is the most
 *  expensive way to run an extraction pipeline — the same misread returns on the next property with
 *  nothing to catch it. */
export function goldenCandidates(facts: ReviewableFact[]): GoldenCandidate[] {
  return facts
    .filter((f) => f.review_status === 'corrected' && f.corrected_value)
    .map((f) => ({
      dataPointId: f.id,
      extracted: f.display_value || f.raw_value,
      shouldBe: f.corrected_value!,
      note: f.review_note ?? null,
      reviewedBy: f.reviewed_by ?? null,
      reviewedAt: f.reviewed_at ?? null,
    }));
}

/** Validate a review before it is written.
 *
 *  Returns an error string, or null. A `corrected` with no value is the one that matters: it is a
 *  status nobody can act on, and it silently degrades to "unchanged" everywhere downstream. */
export function validateReview(
  status: ReviewStatus,
  correctedValue: string | null | undefined,
): string | null {
  if (!['unreviewed', 'accepted', 'rejected', 'corrected'].includes(status)) {
    return `"${status}" is not a review status.`;
  }
  if (status === 'corrected' && !correctedValue?.trim()) {
    return 'A correction needs the corrected value — otherwise there is nothing to correct it to.';
  }
  if (status !== 'corrected' && correctedValue?.trim()) {
    return 'A corrected value was supplied but the status is not "corrected". Set the status to corrected, or clear the value.';
  }
  return null;
}
