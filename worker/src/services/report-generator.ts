// worker/src/services/report-generator.ts
// MASTER_VALIDATION_REPORT.txt Generator
//
// Produces a structured text report from ValidationReport + PipelineResult data.
// Output mirrors the format specified in Starr Software Spec v2.0 §7.
//
// Saved to /tmp/property_validation/MASTER_VALIDATION_REPORT.txt on disk
// AND returned as a string for Supabase storage / API response.

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { PipelineResult } from '../types/index.js';
import type { ValidationReport } from './property-validation-pipeline.js';

// ── Formatting helpers ────────────────────────────────────────────────────────

const HR  = '═'.repeat(72);
const HR2 = '─'.repeat(72);
const HR3 = '─'.repeat(40);

function pad(s: string | number | null | undefined, width: number, right = false): string {
  const str = String(s ?? '');
  if (right) return str.padStart(width);
  return str.length >= width ? str.substring(0, width) : str.padEnd(width);
}

function formatCost(low: number, high: number): string {
  if (low === high) return `$${low}`;
  return `$${low}–$${high}`;
}

function symbolBar(counts: Record<string, number>): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return '(no calls)';

  const order: Array<[string, string]> = [
    ['CONFIRMED',   '✓'],
    ['DEDUCED',     '~'],
    ['UNCONFIRMED', '?'],
    ['DISCREPANCY', '✗'],
    ['CRITICAL',    '✗✗'],
  ];

  return order
    .filter(([sym]) => (counts[sym] ?? 0) > 0)
    .map(([sym, disp]) => {
      const n = counts[sym] ?? 0;
      const pct = Math.round((n / total) * 100);
      return `${disp} ${sym.padEnd(13)} ${String(n).padStart(3)}  ${String(pct).padStart(3)}%`;
    })
    .join('\n');
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildPropertySummary(report: ValidationReport, pipeline: PipelineResult): string {
  const lines: string[] = [
    'PROPERTY SUMMARY',
    HR2,
  ];

  if (report.propertyName) {
    lines.push(`  Name:                ${report.propertyName}`);
  }

  if (report.acreage !== null) {
    lines.push(`  Acreage:             ${report.acreage.toFixed(4)} acres`);
  }

  if (report.datum) {
    lines.push(`  Datum:               ${report.datum}`);
  }

  if (report.pobDescription) {
    lines.push(`  POB:                 ${report.pobDescription}`);
  }

  if (report.recordingReferences.length > 0) {
    lines.push(`  Recording Refs:      ${report.recordingReferences.join(', ')}`);
  }

  if (pipeline.propertyId) {
    lines.push(`  Property ID (CAD):   ${pipeline.propertyId}`);
  }

  lines.push(
    `  Overall Confidence:  ${report.overallConfidencePct}% — ${report.overallRating.display} ${report.overallRating.label}`,
    `  Report Generated:    ${report.generatedAt}`,
  );

  return lines.join('\n');
}

function buildPerimeterAnalysis(report: ValidationReport): string {
  const lines: string[] = [
    'PERIMETER ANALYSIS',
    HR2,
    `  ${'Call'.padEnd(5)} ${'Bearing'.padEnd(24)} ${'Distance'.padEnd(15)} ${'Confidence'.padEnd(15)} Note`,
    '  ' + HR3,
  ];

  for (const pcc of report.perCallConfidence) {
    const seq      = pad(pcc.sequence, 4, true);
    const bearing  = pad(pcc.bearing ?? '—', 24);
    const distance = pad(pcc.distance ?? '—', 15);
    const rating   = `${pcc.rating.display} ${pcc.rating.label}`.padEnd(15);
    const note     = pcc.conflictNote ? ` ← ${pcc.conflictNote}` : '';
    lines.push(`  ${seq} ${bearing} ${distance} ${rating}${note}`);
  }

  return lines.join('\n');
}

function buildAdjacentProperties(report: ValidationReport): string {
  const lines: string[] = [
    'ADJACENT PROPERTIES',
    HR2,
  ];

  if (report.adjacentProperties.length === 0) {
    lines.push('  No adjacent properties identified in this run.');
    lines.push('  (Run adjacent property research to populate this section.)');
    return lines.join('\n');
  }

  lines.push(
    `  ${'Owner'.padEnd(30)} ${'Called Acreage'.padEnd(16)} ${'Recording Ref'.padEnd(20)} Direction`,
    '  ' + HR3,
  );

  for (const ap of report.adjacentProperties) {
    const owner  = pad(ap.ownerName, 30);
    const acres  = pad(ap.calledAcreage ?? '—', 16);
    const ref    = pad(ap.recordingReference ?? '—', 20);
    const dir    = ap.direction ?? '—';
    lines.push(`  ${owner} ${acres} ${ref} ${dir}`);
    if (ap.sharedBoundaryCallSeqs.length > 0) {
      lines.push(`  ${''.padEnd(30)} Shared calls: ${ap.sharedBoundaryCallSeqs.join(', ')}`);
    }
  }

  return lines.join('\n');
}

function buildRoads(report: ValidationReport): string {
  const lines: string[] = [
    'ROADS',
    HR2,
  ];

  if (report.roads.length === 0) {
    lines.push('  No roads identified.');
    return lines.join('\n');
  }

  lines.push(
    `  ${'Road Name'.padEnd(24)} ${'Type'.padEnd(20)} ${'Classification'.padEnd(22)} ROW Width`,
    '  ' + HR3,
  );

  for (const road of report.roads) {
    const name  = pad(road.name, 24);
    const type  = pad(road.type.replace(/_/g, '-'), 20);
    const cls   = pad(road.txdotClassification ?? 'Unknown', 22);
    const row   = road.estimatedRowWidth_ft != null ? `${road.estimatedRowWidth_ft}'` : 'Unknown';
    lines.push(`  ${name} ${type} ${cls} ${row}`);
    if (road.notes) lines.push(`    Note: ${road.notes}`);
  }

  return lines.join('\n');
}

function buildEasements(report: ValidationReport): string {
  const lines: string[] = [
    'EASEMENTS',
    HR2,
  ];

  if (report.easements.length === 0) {
    lines.push('  No easements identified.');
    return lines.join('\n');
  }

  for (const e of report.easements) {
    const widthStr = e.width_ft != null ? `${e.width_ft} ft wide` : 'width unknown';
    const refStr   = e.recordingReference ? ` (${e.recordingReference})` : '';
    lines.push(`  • ${e.type.toUpperCase()} EASEMENT — ${widthStr}${refStr}`);
    if (e.notes) lines.push(`    Note: ${e.notes}`);
  }

  return lines.join('\n');
}

function buildDiscrepancyReport(report: ValidationReport): string {
  const lines: string[] = [
    'DISCREPANCY REPORT',
    HR2,
  ];

  if (report.discrepancies.length === 0) {
    lines.push('  No discrepancies found.');
    return lines.join('\n');
  }

  for (let i = 0; i < report.discrepancies.length; i++) {
    const d = report.discrepancies[i];
    const sevLabel = d.severity.toUpperCase().padEnd(8);
    const callStr  = d.callSequence != null ? `Call ${d.callSequence}: ` : '';
    lines.push('');
    lines.push(`  [${sevLabel}] ${callStr}${d.description}`);

    if (d.allReadings.length > 1) {
      lines.push(`  All readings:`);
      for (const r of d.allReadings) {
        lines.push(`    • ${r}`);
      }
    }

    if (d.resolvedValue) {
      lines.push(`  ✓ Resolved value: ${d.resolvedValue}`);
    }

    lines.push(`  → Recommendation: ${d.recommendation}`);
  }

  return lines.join('\n');
}

function buildConfidenceSummary(report: ValidationReport): string {
  const total = Object.values(report.confidenceCounts).reduce((a, b) => a + b, 0);

  const lines: string[] = [
    'CONFIDENCE SUMMARY',
    HR2,
    '',
    symbolBar(report.confidenceCounts),
    '  ' + HR3,
    `  ${'TOTAL'.padEnd(17)} ${String(total).padStart(3)}  100%`,
    '',
    `  Overall: ${report.overallConfidencePct}% — ${report.overallRating.display} ${report.overallRating.label.toUpperCase()}`,
    '',
    '  Legend:',
    '    ✓  CONFIRMED    — Multiple independent sources agree',
    '    ~  DEDUCED      — Single source, reasonable confidence',
    '    ?  UNCONFIRMED  — Single OCR pass, no cross-reference',
    '    ✗  DISCREPANCY  — Sources actively disagree',
    '    ✗✗ CRITICAL     — Major conflict requiring resolution',
  ];

  return lines.join('\n');
}

function buildRecommendedActions(report: ValidationReport): string {
  const lines: string[] = [
    'RECOMMENDED ACTIONS',
    HR2,
    '  Documents to purchase (prioritized to maximize confidence boost per dollar):',
    '',
  ];

  if (report.purchaseRecommendations.length === 0) {
    lines.push('  No document purchases needed to improve confidence.');
    return lines.join('\n');
  }

  for (const rec of report.purchaseRecommendations) {
    lines.push(`  [${rec.priority}] ${rec.documentDescription}`);
    lines.push(`      Source: ${rec.source}`);
    lines.push(`      Cost:   ${formatCost(rec.estimatedCostLow, rec.estimatedCostHigh)}`);
    lines.push(`      Boost:  ${rec.expectedConfidenceBoost}`);
    lines.push(`      Why:    ${rec.reasoning}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Surveyor-specific sections ────────────────────────────────────────────────

/**
 * THE SURVEY ITSELF — monuments, corner-to-corner inverses, curve checks, units, and what the
 * closure says about our READING of the document.
 *
 * `pipeline.surveyReading` is produced at Stage 4 by `readSurvey()`, put on the result, written to
 * the log — and read by NOTHING. Everything Phase I built about the content of a survey stopped one
 * step short of the document a person opens. Wired into the pipeline is not the same as surfaced,
 * and this report is where a surveyor actually looks.
 *
 * The order is deliberate. Monuments come first because finding called-for monuments is most of what
 * a field crew is sent to do; the closure diagnosis comes next because it changes whether the
 * numbers below it can be trusted at all; and the corner-to-corner inverses come last because they
 * are a reference table rather than something read straight through.
 */
function buildSurveyReading(pipeline: PipelineResult): string {
  const s = pipeline.surveyReading;
  const lines: string[] = ['THE SURVEY ITSELF', HR2];

  if (!s) {
    // Distinguished from "nothing to read": a run that predates this section, or one that never
    // reached Stage 4, has not looked — which is not a finding about the property.
    lines.push('  Not computed for this run — the survey reading did not run, which is not the same');
    lines.push('  as a description with nothing in it.');
    return lines.join('\n');
  }

  if (s.notTraversable) {
    lines.push(`  ${s.notTraversable}`);
    return lines.join('\n');
  }

  // ── Monuments ──
  lines.push('  MONUMENTS');
  if (s.monuments.length === 0) {
    lines.push('    None described in the calls. A description that names no monuments is unusual');
    lines.push('    and is worth checking against the document image before relying on it.');
  } else {
    lines.push(`    ${wrapAt(s.monumentSummary.statement, 4)}`);
    for (const m of s.monuments) lines.push(`      · ${wrapAt(m.statement, 8)}`);
    if (s.located.length < s.monuments.length) {
      lines.push(
        `    ${s.monuments.length - s.located.length} of these could NOT be placed on the figure —`,
        '    their positions relative to the others are not known.',
      );
    }
  }

  // ── Closure, as evidence about our reading ──
  lines.push('', '  WHAT THE CLOSURE SAYS ABOUT OUR READING');
  if (s.closure) {
    lines.push(`    ${wrapAt(s.closure.statement, 4)}`);
    if (s.closure.nextStep) lines.push(`    NEXT: ${wrapAt(s.closure.nextStep, 4)}`);
  } else {
    lines.push('    Not assessed.');
  }

  // ── Curves that disagree with themselves ──
  const badCurves = s.curves.filter((c) => c.check.verdict === 'inconsistent');
  if (badCurves.length > 0) {
    lines.push('', '  CURVES THAT DO NOT CHECK OUT');
    for (const c of badCurves) lines.push(`    · Call ${c.callIndex + 1}: ${wrapAt(c.check.statement, 6)}`);
  }

  // ── Corners we positioned ourselves ──
  if (s.derivedChords.length > 0) {
    lines.push('', '  CORNERS POSITIONED FROM A VALUE WE COMPUTED');
    for (const d of s.derivedChords) lines.push(`    · ${wrapAt(d.statement, 6)}`);
  }

  // ── Units ──
  const nonFeet = s.unitsUsed.filter((u) => u.unit !== 'us_survey_feet');
  if (nonFeet.length > 0) {
    lines.push('', '  UNITS');
    for (const u of nonFeet) lines.push(`    · ${u.calls} call(s) in ${u.label}. ${u.inFeet}`);
  }

  // ── Corner to corner ──
  if (s.pairs.length > 0) {
    lines.push('', '  CORNER TO CORNER (computed — the deed states only consecutive corners)');
    for (const p of s.pairs) {
      lines.push(`    · Call ${p.fromCallIndex + 1} → ${p.toCallIndex + 1}:  ${p.bearing}  ${p.distance.toFixed(2)} ft`);
    }
  }

  return lines.join('\n');
}

/**
 * WHAT WE COULD NOT GET, AND WHAT IT COST — retrieval failures and the spending facts.
 *
 * Four fields were being produced and read by nothing, and **two of them were added earlier in this
 * same session**, which is the clearest evidence available that this defect is not carelessness but
 * a shape the codebase invites: you write the field, you write the comment explaining why it must
 * not be silent, and then there is no obvious place to put it, so it goes on the object and stops.
 *
 *   `retrievalFailures`  (PipelineResult) — documents we tried and failed to fetch
 *   `policyPremiums`     (PurchaseReport) — purchases made from a dearer vendor than policy allows
 *   `modeStatement`      (PurchaseReport) — what FREE mode meant for this run
 *   `librarySavings`     (PurchaseReport) — documents we did not have to buy again
 *
 * The first is the one that matters most to a surveyor: a report that never mentions the documents
 * it failed to retrieve reads as complete. The other three are money, and each was written with a
 * comment saying an invisible number is one nobody acts on — while being invisible.
 */
function buildRetrievalAndSpending(
  pipeline: PipelineResult,
  purchases?: PurchaseReportLike | null,
): string {
  const lines: string[] = ['WHAT WE COULD NOT GET, AND WHAT IT COST', HR2];
  let saidSomething = false;

  const failures = pipeline.retrievalFailures ?? [];
  if (failures.length > 0) {
    saidSomething = true;
    lines.push(`  ${failures.length} document retrieval(s) FAILED. These are errands, not absences —`);
    lines.push('  the record may exist and be perfectly findable at the courthouse.');
    for (const f of failures) lines.push(`    · ${wrapAt(f, 6)}`);
  } else if (pipeline.retrievalFailures === undefined) {
    // Undefined and [] mean different things here, and the pipeline is careful to keep them apart.
    lines.push('  Retrieval failures were not recorded for this run.');
    saidSomething = true;
  }

  if (purchases?.modeStatement) {
    saidSomething = true;
    lines.push('', `  ${wrapAt(purchases.modeStatement, 2)}`);
  }

  if (purchases?.policyPremiums?.length) {
    saidSomething = true;
    lines.push('', `  ${purchases.policyPremiums.length} purchase(s) cost more than the cheapest-first policy allows:`);
    for (const p of purchases.policyPremiums) {
      lines.push(`    · ${p.instrument}: ${wrapAt(p.reason, 6)}`);
    }
    lines.push('    A premium nobody records is a premium nobody decides to stop paying.');
  }

  if (purchases?.librarySavings && purchases.librarySavings.reused > 0) {
    saidSomething = true;
    lines.push(
      '',
      `  ${purchases.librarySavings.reused} document(s) were already in the firm's library and were ` +
      `not bought again, saving $${purchases.librarySavings.savedUsd.toFixed(2)}.`,
    );
  }

  if (!saidSomething) {
    lines.push('  Every document this run went after was retrieved, and nothing was purchased');
    lines.push('  outside the cost policy.');
  }

  return lines.join('\n');
}

/** The parts of a purchase report this section reads.
 *
 *  Structural rather than an import of `PurchaseReport`: the report generator should not gain a
 *  dependency on the purchase pipeline to print four facts, and the orchestrator loads this file
 *  from disk as untyped JSON anyway. */
export interface PurchaseReportLike {
  modeStatement?: string;
  policyPremiums?: Array<{ instrument: string; reason: string }>;
  librarySavings?: { reused: number; savedUsd: number };
}

/** Wrap a long sentence to the report's width, indenting continuations.
 *
 *  The statements from `survey-reading` are written as prose for a person and routinely run past
 *  200 characters; printed raw they wrap wherever the terminal decides and the section stops being
 *  readable, which is the failure this whole report exists to avoid. */
function wrapAt(text: string, indent: number, width = 96): string {
  const pad = ' '.repeat(indent);
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if (line.length + w.length + 1 > width) { out.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.join(`\n${pad}`);
}

/**
 * TRAVERSE QUALITY — closure error, precision ratio, area, and quality score
 * from the mathematical boundary validation (Stage 4).
 */
function buildValidationQuality(pipeline: PipelineResult): string {
  const v = pipeline.validation;
  const lines: string[] = [
    'TRAVERSE QUALITY',
    HR2,
  ];

  if (!v || v.overallQuality === 'failed') {
    lines.push('  Traverse check: N/A — no metes-and-bounds calls available for closure computation.');
    return lines.join('\n');
  }

  lines.push(
    `  Quality Score:       ${v.overallQuality.toUpperCase()}`,
    `  Closure Error:       ${v.closureError_ft != null ? `${v.closureError_ft} ft` : 'N/A'}`,
    `  Precision Ratio:     ${v.precisionRatio ?? 'N/A'}`,
  );

  if (v.totalPerimeter_ft != null) {
    lines.push(`  Total Perimeter:     ${v.totalPerimeter_ft.toFixed(2)} ft`);
  }

  if (v.computedArea_acres != null) {
    lines.push(`  Computed Area:       ${v.computedArea_acres.toFixed(4)} ac (${v.computedArea_sqft?.toFixed(0)} sqft)`);
  }

  if (v.cadAcreage != null) {
    const disc = v.areaDiscrepancy_pct;
    lines.push(`  CAD Stated Area:     ${v.cadAcreage.toFixed(4)} ac${disc != null ? `  (${disc}% discrepancy)` : ''}`);
  }

  lines.push(
    `  Bearing Sanity:      ${v.bearingSanity ? '✓ PASS' : '✗ FAIL — one or more bearings exceed 90°'}`,
    `  Distance Sanity:     ${v.distanceSanity ? '✓ PASS' : '✗ FAIL — outlier distance detected'}`,
    `  Reference Complete:  ${v.referenceComplete ? '✓ PASS' : '✗ FAIL — some calls have low confidence'}`,
  );

  if (v.flags.length > 0) {
    lines.push('');
    lines.push(`  Flags (${v.flags.length}):`);
    for (const flag of v.flags) {
      lines.push(`    ⚑ ${flag}`);
    }
  }

  return lines.join('\n');
}

/**
 * TOP ACTIONS — priority-ordered next steps from Call 7 to improve confidence.
 * Displayed first after the confidence summary — most actionable output for
 * a working surveyor.
 */
function buildTopActions(report: ValidationReport): string {
  const lines: string[] = [
    'TOP ACTIONS (PRIORITIZED)',
    HR2,
    '  These are the highest-value steps to increase confidence before field work.',
    '',
  ];

  if (report.topActions.length === 0) {
    lines.push('  No actions needed — confidence is at target or AI call was unavailable.');
    return lines.join('\n');
  }

  for (const action of report.topActions) {
    lines.push(`  [${action.priority}] ${action.action}`);
    lines.push(`      Expected benefit: ${action.expectedBenefit}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * ADJACENT RESEARCH ORDER — ranked list of neighbor property records to pull.
 * Pulling the right adjacent deeds first is how surveyors independently verify
 * shared boundary calls — this section makes that workflow explicit.
 */
function buildAdjacentResearchOrder(report: ValidationReport): string {
  const lines: string[] = [
    'ADJACENT RESEARCH ORDER',
    HR2,
    '  Pull these adjacent property records in rank order to verify shared boundaries.',
    '',
  ];

  if (report.adjacentResearchOrder.length === 0) {
    lines.push('  No adjacent research order generated.');
    lines.push('  (This section populates once adjacent properties are identified and ranked.)');
    return lines.join('\n');
  }

  lines.push(
    `  ${'Rank'.padEnd(5)} ${'Owner'.padEnd(30)} ${'Recording Ref'.padEnd(24)} Rationale`,
    '  ' + HR3,
  );

  for (const entry of report.adjacentResearchOrder) {
    const rank = pad(entry.rank, 4, true);
    const owner = pad(entry.ownerName, 30);
    const ref   = pad(entry.recordingRef ?? '—', 24);
    lines.push(`  ${rank} ${owner} ${ref} ${entry.rationale}`);
  }

  return lines.join('\n');
}

/**
 * DISCREPANCY LOG — every conflict ordered by severity in a compact table.
 * Supplements the existing DISCREPANCY REPORT section (which is narrative)
 * with a machine-readable-style table that is easy to scan on the job site.
 */
function buildDiscrepancyLog(report: ValidationReport): string {
  const lines: string[] = [
    'DISCREPANCY LOG',
    HR2,
  ];

  if (report.discrepancyLog.length === 0) {
    lines.push('  No structured discrepancy log produced in this run.');
    lines.push('  (Check the DISCREPANCY REPORT section above for any narrative findings.)');
    return lines.join('\n');
  }

  // Sort CRITICAL → MODERATE → MINOR
  const order: Record<string, number> = { CRITICAL: 0, MODERATE: 1, MINOR: 2 };
  const sorted = [...report.discrepancyLog].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
  );

  lines.push(
    `  ${'#'.padEnd(4)} ${'Sev'.padEnd(9)} ${'Item'.padEnd(20)} ${'Source A'.padEnd(24)} ${'Source B'.padEnd(24)} Action`,
    '  ' + HR3,
  );

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const num     = pad(i + 1, 3, true);
    const sev     = pad(d.severity, 9);
    const item    = pad(d.item, 20);
    const srcA    = pad(d.sourceA, 24);
    const srcB    = pad(d.sourceB, 24);
    lines.push(`  ${num} ${sev} ${item} ${srcA} ${srcB}`);
    lines.push(`  ${''.padEnd(4)} ${''.padEnd(9)} Action: ${d.actionNeeded}`);
  }

  return lines.join('\n');
}

function buildAnalysisLimitations(report: ValidationReport): string {
  const lines: string[] = [
    'ANALYSIS LIMITATIONS',
    HR2,
  ];

  if (report.analysisLimitations.length === 0) {
    lines.push('  No significant limitations detected in this analysis.');
    return lines.join('\n');
  }

  lines.push(
    '  The following limitations were detected during automated analysis.',
    '  These may affect the accuracy or completeness of the extracted data.',
    '',
  );

  for (let i = 0; i < report.analysisLimitations.length; i++) {
    lines.push(`  ${i + 1}. ${report.analysisLimitations[i]}`);
  }

  return lines.join('\n');
}

// ── Main report builder ───────────────────────────────────────────────────────

/**
 * Build the full MASTER_VALIDATION_REPORT text from a ValidationReport
 * and its originating PipelineResult.
 *
 * Section order is designed for working surveyors:
 *   1. Property Summary (identity + overall confidence)
 *   2. Traverse Quality (closure, precision, area — mathematical ground truth)
 *   3. Confidence Summary (per-symbol breakdown)
 *   4. TOP ACTIONS (what to do next — most actionable)
 *   5. Perimeter Analysis (per-call table)
 *   6. Discrepancy Report (narrative discrepancy detail)
 *   7. Discrepancy Log (compact table for quick reference on site)
 *   8. Adjacent Properties (owners + recording refs)
 *   9. Adjacent Research Order (ranked neighbor records to pull)
 *  10. Roads
 *  11. Easements
 *  12. Recommended Document Purchases
 */
export function buildMasterReport(
  report: ValidationReport,
  pipeline: PipelineResult,
  /** Optional so existing callers compile unchanged. Absent means the spending facts are simply not
   *  printed, which is honest — a run with no purchase phase has none. */
  purchases?: PurchaseReportLike | null,
): string {
  const header = [
    HR,
    '  STARR SURVEYING — PROPERTY VALIDATION REPORT',
    `  ${pipeline.propertyId ? `Property ID: ${pipeline.propertyId}  |  ` : ''}County: Bell, TX`,
    `  Generated: ${report.generatedAt}`,
    HR,
  ].join('\n');

  const sections = [
    buildPropertySummary(report, pipeline),
    buildAnalysisLimitations(report),
    buildValidationQuality(pipeline),
    // Directly after TRAVERSE QUALITY, which reports the closure as a NUMBER. This says what that
    // number means about whether we read the document correctly — the two belong together, and
    // separating them is how a precision ratio ends up looking like a verdict on the survey.
    buildSurveyReading(pipeline),
    buildConfidenceSummary(report),
    buildTopActions(report),
    buildPerimeterAnalysis(report),
    buildDiscrepancyReport(report),
    buildDiscrepancyLog(report),
    buildAdjacentProperties(report),
    buildAdjacentResearchOrder(report),
    buildRoads(report),
    buildEasements(report),
    buildRecommendedActions(report),
    // Last, because it is what the reader takes away as outstanding work rather than as findings.
    buildRetrievalAndSpending(pipeline, purchases),
  ];

  const footer = [
    HR,
    '  END OF REPORT',
    `  Produced by Starr Software — AI Property Research Pipeline`,
    `  This report is for licensed surveyor use only.`,
    `  NEVER fabricates data — every finding references a source.`,
    HR,
  ].join('\n');

  return [header, ...sections, footer].join(`\n\n${HR2}\n\n`);
}

// ── Disk writer ───────────────────────────────────────────────────────────────

/**
 * Write the report to disk at /tmp/property_validation/<projectId>/MASTER_VALIDATION_REPORT.txt
 * and return the file path.
 *
 * Always returns the path even if the write fails — the report is still available as a string.
 */
export async function writeMasterReport(
  reportText: string,
  projectId: string,
): Promise<string> {
  const dir  = join('/tmp', 'property_validation', projectId);
  const path = join(dir, 'MASTER_VALIDATION_REPORT.txt');

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path, reportText, 'utf8');
  } catch (err) {
    console.warn('[ReportGenerator] Could not write report to disk:', err instanceof Error ? err.message : err);
  }

  return path;
}

/**
 * Convenience: build AND write the report, returning both the text and path.
 */
export async function generateAndWriteReport(
  report: ValidationReport,
  pipeline: PipelineResult,
  purchases?: PurchaseReportLike | null,
): Promise<{ text: string; filePath: string }> {
  const text     = buildMasterReport(report, pipeline, purchases);
  const filePath = await writeMasterReport(text, pipeline.projectId);
  return { text, filePath };
}
