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

// ── Main report builder ───────────────────────────────────────────────────────

/**
 * Build the full MASTER_VALIDATION_REPORT text from a ValidationReport
 * and its originating PipelineResult.
 */
export function buildMasterReport(
  report: ValidationReport,
  pipeline: PipelineResult,
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
    buildPerimeterAnalysis(report),
    buildAdjacentProperties(report),
    buildRoads(report),
    buildEasements(report),
    buildDiscrepancyReport(report),
    buildConfidenceSummary(report),
    buildRecommendedActions(report),
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
): Promise<{ text: string; filePath: string }> {
  const text     = buildMasterReport(report, pipeline);
  const filePath = await writeMasterReport(text, pipeline.projectId);
  return { text, filePath };
}
