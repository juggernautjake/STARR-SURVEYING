// worker/src/services/finding-confidence.ts — how sure are we of THIS number, not of this document.
//
// The owner's ask, close to verbatim:
//
//   *"We should have confidence ratings per finding on each document. If we collect a survey that is
//   clear and recent and the analysis can clearly read the results, each of the bearings and lines
//   and distances and curves will all get a high confidence rating. That would also mean that the
//   confidence rating for the analysis for the entire document would be high. If the analysis is not
//   so certain about some of the numbers and what they go to, it should rate those lower."*
//
// The important word is **per finding**. A document-level score is an average, and an average hides
// the one call that is wrong — which is the only call that matters, because a boundary is only as
// good as its weakest course. So the document score is DERIVED from the findings and never set
// independently, and it is derived pessimistically.
//
// ── WHERE CONFIDENCE ACTUALLY COMES FROM ────────────────────────────────────────────────────────
//
// Not from asking a model how sure it is. A model's self-report is a fluency measure, and it is
// confidently wrong in exactly the case that matters — a marginal 14 px bearing that OCR resolves
// into something *plausible*. Every signal here is external to the model's opinion:
//
//   legibility   can the capture physically contain this text? (`ocr-legibility`)
//   agreement    did a second pass, or a second source, read the same thing?
//   derivation   was this value READ, or computed by us from other values?
//   self-check   does the value survive its own geometry — a curve's chord against its radius,
//                a traverse's closure, a bearing that is a legal quadrant?
//   inference    did it come from a ditto mark rather than from ink on the page?
//
// The last one is why this module and `plat-notation` were written together: a dittoed distance is
// exactly as good as the value it repeats and no better, and nothing else in the pipeline knew that.

export type FindingKind = 'bearing' | 'distance' | 'curve' | 'monument' | 'area' | 'feature' | 'other';

/** Bands, because a number pretends to a precision this does not have. */
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'unusable';

export interface ConfidenceSignals {
  /** Verdict from `ocr-legibility` for the capture this was read from. */
  legibility?: 'good' | 'marginal' | 'unreadable' | null;
  /** How many independent readings agreed. 1 = read once, nobody checked. */
  agreeingSources?: number;
  /** A reading disagreed and we picked one. Materially worse than never having checked. */
  contradicted?: boolean;
  /** We computed this rather than reading it (a derived chord, an inferred bearing). */
  derived?: boolean;
  /** It came from a ditto mark — as good as the value above, no better. */
  fromDitto?: boolean;
  /** The value failed a check it should have passed (curve inconsistent, bearing over 90°). */
  failedSelfCheck?: boolean;
  /** The value passed a real arithmetic check. */
  passedSelfCheck?: boolean;
  /** Nothing in the document says what this value belongs to. The owner's "not so certain … what
   *  they go to" — a number whose OWNER is unknown is not usable even when the digits are perfect. */
  unattributed?: boolean;
}

export interface Finding {
  kind: FindingKind;
  /** What was read, verbatim. */
  raw: string;
  /** Where on the document, when known. */
  page?: number | null;
  signals: ConfidenceSignals;
}

export interface ScoredFinding extends Finding {
  score: number;            // 0–100
  band: ConfidenceBand;
  /** Why, in the terms a surveyor would use. Never just a number. */
  reasons: string[];
}

const BASE = 70;

/** Score one finding.
 *
 *  Deliberately additive from a middling base rather than multiplicative from 100: a value read once
 *  off a legible document, agreeing with nothing and checked by nothing, is *ordinary* — neither
 *  trustworthy nor suspect — and starting at 100 would make the common case look verified. */
export function scoreFinding(f: Finding): ScoredFinding {
  const s = f.signals;
  const reasons: string[] = [];
  let score = BASE;

  if (s.legibility === 'good') { score += 10; reasons.push('the capture is legible enough for fine text'); }
  else if (s.legibility === 'marginal') {
    score -= 20;
    reasons.push('the capture is MARGINAL — at this resolution OCR does not fail, it guesses, and a wrong digit looks like a real value');
  } else if (s.legibility === 'unreadable') {
    score -= 55;
    reasons.push('the capture cannot physically contain text this small, so any value read from it is invention');
  }

  const agree = s.agreeingSources ?? 1;
  if (agree >= 3) { score += 18; reasons.push(`${agree} independent readings agree`); }
  else if (agree === 2) { score += 12; reasons.push('a second reading agrees'); }
  else reasons.push('read once — nothing has checked it');

  if (s.contradicted) {
    score -= 25;
    reasons.push('another reading DISAGREED and one was chosen — the other may have been right');
  }
  if (s.passedSelfCheck) { score += 12; reasons.push('it survives its own geometry'); }
  if (s.failedSelfCheck) {
    score -= 35;
    reasons.push('it FAILS its own geometry — the document disagrees with itself here');
  }
  if (s.derived) {
    score -= 15;
    reasons.push('computed by us from other values rather than read from the document — if those are wrong, so is this, and nothing else flags it');
  }
  if (s.fromDitto) {
    score -= 8;
    reasons.push('taken from a ditto mark: exactly as reliable as the value it repeats, and no more');
  }
  if (s.unattributed) {
    score -= 30;
    reasons.push('nothing on the document says which line or corner this belongs to — the digits may be right and still unusable');
  }

  score = Math.max(0, Math.min(100, score));
  return { ...f, score, band: bandFor(score), reasons };
}

export function bandFor(score: number): ConfidenceBand {
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  if (score >= 40) return 'low';
  return 'unusable';
}

export interface DocumentConfidence {
  band: ConfidenceBand;
  score: number;
  findings: ScoredFinding[];
  counts: Record<ConfidenceBand, number>;
  statement: string;
}

/** Roll findings up into a document score — pessimistically, and never independently.
 *
 *  The mean is the wrong statistic. Twenty good bearings and one unusable one average to "high", and
 *  the unusable one is the whole story: a traverse with one bad course does not close, and a boundary
 *  is only as good as its weakest call. So the document is capped by its worst findings, and the
 *  statement names them rather than burying them in an average. */
export function scoreDocument(findings: Finding[]): DocumentConfidence {
  if (findings.length === 0) {
    return {
      band: 'unusable', score: 0, findings: [],
      counts: { high: 0, medium: 0, low: 0, unusable: 0 },
      statement:
        'Nothing was extracted from this document, so there is no confidence to report. That is not ' +
        'a finding that the document is empty — it is a statement that we read nothing from it.',
    };
  }

  const scored = findings.map(scoreFinding);
  const counts: Record<ConfidenceBand, number> = { high: 0, medium: 0, low: 0, unusable: 0 };
  for (const f of scored) counts[f.band] += 1;

  const mean = scored.reduce((n, f) => n + f.score, 0) / scored.length;
  // The cap is the point. A single unusable finding holds the whole document below 'medium'
  // regardless of how many good ones surround it.
  const worstBandCap = counts.unusable > 0 ? 55 : counts.low > 0 ? 75 : 100;
  const score = Math.round(Math.min(mean, worstBandCap));

  const parts = [
    `${scored.length} finding(s): ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ` +
    `${counts.unusable} unusable.`,
  ];
  if (counts.unusable > 0) {
    parts.push(
      `The document is held below its average because ${counts.unusable} finding(s) cannot be used ` +
      `at all. A boundary is only as good as its weakest call, so an average would describe a ` +
      `document nobody is holding.`,
    );
  } else if (counts.low > 0) {
    parts.push(`${counts.low} finding(s) are low-confidence and cap the document below high.`);
  } else if (counts.high === scored.length) {
    parts.push('Every finding is high-confidence: legible capture, agreeing readings, and checks that passed.');
  }

  return { band: bandFor(score), score, findings: scored, counts, statement: parts.join(' ') };
}
