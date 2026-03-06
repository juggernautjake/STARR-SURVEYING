// worker/src/services/surveyor-decision-matrix.ts — Phase 8 Step 7
// Builds the surveyor's go/no-go decision: is this data good enough
// for field work, or should documents be purchased first?
//
// Spec §8.7 — Surveyor Decision Matrix

import type {
  CallConfidenceScore,
  BoundarySideConfidence,
  DiscrepancyReport,
  PurchaseRecommendation,
  SurveyorDecision,
} from '../types/confidence.js';

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_CONFIDENCE_FOR_FIELD = 60;
const MAX_FIELD_CHECKS = 10;

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildSurveyorDecision(
  overallConfidence: number,
  callScores: Map<string, CallConfidenceScore>,
  boundarySides: BoundarySideConfidence[],
  discrepancies: DiscrepancyReport[],
  purchaseRecs: PurchaseRecommendation[],
): SurveyorDecision {
  const caveats: string[] = [];
  const fieldChecks: { location: string; reason: string }[] = [];

  // Check if ready
  const readyForField = overallConfidence >= MIN_CONFIDENCE_FOR_FIELD;

  // Caveats for weak sides
  for (const side of boundarySides) {
    if (side.score < 60) {
      const sideName =
        side.side.charAt(0).toUpperCase() + side.side.slice(1);
      caveats.push(
        `${sideName} boundary (score: ${side.score}) requires field verification — GPS observation recommended`,
      );
      fieldChecks.push({
        location: `${sideName} boundary corners`,
        reason: side.risk || `Low confidence (${side.score})`,
      });
    }
  }

  // Caveats for unresolved critical discrepancies
  const criticals = discrepancies.filter(
    (d) => d.severity === 'critical' && d.status === 'unresolved',
  );
  for (const disc of criticals) {
    caveats.push(
      `Critical discrepancy on ${disc.affectedCalls.join(', ')} — verify in field before relying on data`,
    );
    fieldChecks.push({
      location: `Corner at end of ${disc.affectedCalls[0]}`,
      reason: disc.title,
    });
  }

  // Moderate discrepancies get a softer caveat
  const moderates = discrepancies.filter(
    (d) => d.severity === 'moderate' && d.status === 'unresolved',
  );
  if (moderates.length > 0) {
    caveats.push(
      `${moderates.length} moderate discrepanc${moderates.length === 1 ? 'y' : 'ies'} — field check recommended but not blocking`,
    );
  }

  // Low-confidence calls warrant field checks
  for (const [callId, score] of callScores) {
    if (score.score < 40 && score.riskLevel === 'critical') {
      fieldChecks.push({
        location: `Corner at end of ${callId}`,
        reason: `Critical risk — only ${score.sourceCount} source(s), score=${score.score}`,
      });
    }
  }

  // Estimate confidence after purchasing recommended documents
  let afterDocPurchase = overallConfidence;
  for (const rec of purchaseRecs) {
    const impactMatch = rec.confidenceImpact?.match(/\+(\d+)/);
    if (impactMatch) {
      afterDocPurchase += parseInt(impactMatch[1]);
    }
  }
  afterDocPurchase = Math.min(98, afterDocPurchase);

  // If not ready but doc purchase would make it ready, note that
  if (!readyForField && afterDocPurchase >= MIN_CONFIDENCE_FOR_FIELD) {
    caveats.push(
      `Purchasing recommended documents would raise confidence to ${afterDocPurchase}% — sufficient for field work`,
    );
  }

  // If already field-ready with high confidence, add positive note
  if (readyForField && overallConfidence >= 80 && criticals.length === 0) {
    caveats.push(
      'Data quality is strong — proceed to field with standard verification protocols',
    );
  }

  return {
    readyForField,
    caveats,
    recommendedFieldChecks: fieldChecks.slice(0, MAX_FIELD_CHECKS),
    minConfidenceForField: MIN_CONFIDENCE_FOR_FIELD,
    currentConfidence: overallConfidence,
    afterDocPurchase,
  };
}
