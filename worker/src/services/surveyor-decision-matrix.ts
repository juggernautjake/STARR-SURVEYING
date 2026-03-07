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

  // ── Compute overallRisk ───────────────────────────────────────────────────
  // Risk level is elevated when critical discrepancies exist, regardless of
  // the raw numeric confidence.

  let overallRisk: SurveyorDecision['overallRisk'];
  if (criticals.length > 0 || overallConfidence < 40) {
    overallRisk = 'critical';
  } else if (overallConfidence < 60) {
    overallRisk = 'high';
  } else if (overallConfidence < 80 || moderates.length > 2) {
    overallRisk = 'medium';
  } else {
    overallRisk = 'low';
  }

  // ── Compute pathTo90 ─────────────────────────────────────────────────────
  // A prioritised list of actions that would bring confidence to ≥ 90.
  // null when already there.

  let pathTo90: string | null = null;
  if (overallConfidence < 90) {
    const steps: string[] = [];

    // If purchasing docs helps significantly
    if (purchaseRecs.length > 0) {
      const topRec = purchaseRecs[0];
      // Use a descriptive instrument reference — or tell the surveyor to search if unknown
      const instrumentRef = topRec.instrument !== 'search_required'
        ? topRec.instrument
        : 'search county records';
      steps.push(
        `Purchase ${topRec.documentType} (${instrumentRef}) — expected ${topRec.confidenceImpact}`,
      );
    }

    // Resolve any critical discrepancies
    if (criticals.length > 0) {
      steps.push(
        `Resolve ${criticals.length} critical discrepanc${criticals.length === 1 ? 'y' : 'ies'} via field measurement and cross-validation`,
      );
    }

    // Address weak boundary sides
    const weakSides = boundarySides.filter((s) => s.score < 60);
    if (weakSides.length > 0) {
      steps.push(
        `Obtain GPS observations on ${weakSides.map((s) => s.side).join(', ')} boundar${weakSides.length === 1 ? 'y' : 'ies'} to verify position`,
      );
    }

    if (steps.length > 0) {
      pathTo90 = steps.join('; ');
    } else {
      pathTo90 = `Increase source count on low-confidence calls (target ≥3 sources per call)`;
    }
  }

  // ── Compute estimatedFieldTime ────────────────────────────────────────────

  const fieldCheckCount = fieldChecks.length;
  let estimatedFieldTime: string;
  if (fieldCheckCount === 0 && criticals.length === 0) {
    estimatedFieldTime = '1 day';
  } else if (fieldCheckCount <= 3) {
    estimatedFieldTime = '1-2 days';
  } else if (fieldCheckCount <= 6) {
    estimatedFieldTime = '2-3 days';
  } else {
    estimatedFieldTime = '3-5 days';
  }

  // ── Build human-readable summary ─────────────────────────────────────────

  let summary: string;
  if (!readyForField) {
    summary =
      `Overall confidence of ${overallConfidence}% is below the field-ready threshold (${MIN_CONFIDENCE_FOR_FIELD}%). ` +
      `${purchaseRecs.length > 0 ? `Purchasing recommended documents would raise confidence to ${afterDocPurchase}%. ` : ''}` +
      `${criticals.length > 0 ? `${criticals.length} critical discrepanc${criticals.length === 1 ? 'y' : 'ies'} must be resolved before field work. ` : ''}` +
      `Risk level: ${overallRisk.toUpperCase()}.`;
  } else if (overallConfidence >= 80 && criticals.length === 0) {
    summary =
      `Overall confidence of ${overallConfidence}% (${overallRisk} risk) — property is well-documented and field-ready. ` +
      `${caveats.length > 0 ? `${caveats.length} caveat(s) noted. ` : ''}` +
      `Estimated field time: ${estimatedFieldTime}.`;
  } else {
    summary =
      `Overall confidence of ${overallConfidence}% meets the field-ready threshold but has ${overallRisk} risk. ` +
      `${caveats.length} caveat(s) require attention during field work. ` +
      `Estimated field time: ${estimatedFieldTime}.`;
  }

  return {
    readyForField,
    overallRisk,
    caveats,
    recommendedFieldChecks: fieldChecks.slice(0, MAX_FIELD_CHECKS),
    minConfidenceForField: MIN_CONFIDENCE_FOR_FIELD,
    currentConfidence: overallConfidence,
    afterDocPurchase,
    pathTo90,
    estimatedFieldTime,
    summary,
  };
}
