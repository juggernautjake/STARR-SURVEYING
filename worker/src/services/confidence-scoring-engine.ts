// worker/src/services/confidence-scoring-engine.ts — Phase 8 Orchestrator
// Consumes the ReconciledBoundaryModel from Phase 7 and produces a
// comprehensive, hierarchical ConfidenceReport with call-level, lot-level,
// boundary-side, and overall confidence scoring plus discrepancy intelligence.
//
// Spec §8.1–8.9 — Phase 8: Confidence Scoring & Discrepancy Intelligence

import fs from 'fs';
import path from 'path';
import { CallConfidenceScorer, scoreToGrade } from './call-confidence-scorer.js';
import { LotConfidenceScorer } from './lot-confidence-scorer.js';
import { DiscrepancyAnalyzer } from './discrepancy-analyzer.js';
import { PurchaseRecommender } from './purchase-recommender.js';
import { buildSurveyorDecision } from './surveyor-decision-matrix.js';
import type {
  ReconciledBoundaryModel,
  ReconciledCall,
} from '../types/reconciliation.js';
import type {
  ConfidenceReport,
  OverallConfidence,
  CallConfidenceScore,
  LotConfidenceScore,
  BoundarySideConfidence,
  DiscrepancyReport,
  DiscrepancySummary,
  PurchaseRecommendation,
  SurveyorDecision,
} from '../types/confidence.js';

// ── Property Context (loaded from intelligence or subdivision JSON) ──────────

interface PropertyContext {
  county: string;
  surveyDate?: string;
  subdivisionName?: string;
  knownDocuments: {
    instrument: string;
    type: string;
    source: string;
    pages: number;
  }[];
  resolvedDiscrepancies: Record<string, unknown>[];
  lotAcreages: Record<string, { stated: number; computed: number }>;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class ConfidenceScoringEngine {

  async score(
    projectId: string,
    reconciledPath: string,
  ): Promise<ConfidenceReport> {
    const startTime = Date.now();
    const errors: string[] = [];
    let aiCalls = 0;

    console.log(`[Confidence] Starting scoring for ${projectId}`);

    // ── Load reconciled model ────────────────────────────────────────────

    if (!fs.existsSync(reconciledPath)) {
      return this.failedReport(
        `Reconciled boundary file not found: ${reconciledPath}`,
        startTime,
      );
    }

    let model: ReconciledBoundaryModel;
    try {
      model = JSON.parse(fs.readFileSync(reconciledPath, 'utf-8'));
    } catch (e) {
      return this.failedReport(`Failed to parse reconciled JSON: ${e}`, startTime);
    }

    if (model.status === 'failed') {
      return this.failedReport(
        'Reconciled model has failed status — cannot score',
        startTime,
      );
    }

    const allCalls = model.reconciledPerimeter?.calls || [];
    if (allCalls.length === 0) {
      return this.failedReport('No reconciled calls to score', startTime);
    }

    // ── Load property context ────────────────────────────────────────────

    const context = this.loadPropertyContext(reconciledPath, projectId);

    // ── STEP 1: Per-Call Confidence Scoring ───────────────────────────────

    console.log('[Confidence] Step 1: Scoring individual calls...');
    const callScorer = new CallConfidenceScorer();
    const callScores = callScorer.scoreAllCalls(allCalls);

    const callConfidence = [...callScores.values()];
    console.log(
      `[Confidence] Scored ${callConfidence.length} calls, ` +
        `avg=${Math.round(callConfidence.reduce((s, c) => s + c.score, 0) / callConfidence.length)}`,
    );

    // ── STEP 2: Per-Lot Confidence Scoring ───────────────────────────────

    console.log('[Confidence] Step 2: Scoring lots...');
    const lotScorer = new LotConfidenceScorer();
    const lotConfidence: LotConfidenceScore[] = [];

    for (const lot of model.reconciledLots || []) {
      const lotCalls = [...lot.reconciledCalls, ...lot.reconciledCurves];
      const acreages = context.lotAcreages[lot.lotId] || {
        stated: 0,
        computed: lot.reconciledAcreage || 0,
      };

      const lotScore = lotScorer.scoreLot(
        lot.lotId,
        lot.name,
        lotCalls,
        callScores,
        lot.closure?.closureRatio || 'n/a',
        lot.closure?.status || 'unknown',
        acreages.stated,
        acreages.computed,
      );
      lotConfidence.push(lotScore);
    }

    // If no lots, score the perimeter as a single "lot"
    if (lotConfidence.length === 0 && allCalls.length > 0) {
      const perimScore = lotScorer.scoreLot(
        'perimeter',
        'Property Perimeter',
        allCalls,
        callScores,
        model.reconciledPerimeter.closure?.closureRatio || 'n/a',
        model.reconciledPerimeter.closure?.status || 'unknown',
        0,
        0,
      );
      lotConfidence.push(perimScore);
    }

    // ── STEP 3: Per-Boundary-Side Confidence ─────────────────────────────

    console.log('[Confidence] Step 3: Scoring boundary sides...');
    const callDirections = this.inferCallDirections(allCalls);
    const boundaryConfidence = lotScorer.scoreBoundarySides(
      callScores,
      callDirections,
    );

    // ── STEP 4: Overall Property Confidence ──────────────────────────────

    console.log('[Confidence] Step 4: Computing overall confidence...');
    const overallConfidence = this.computeOverallConfidence(
      callConfidence,
      lotConfidence,
      boundaryConfidence,
      model,
    );

    // ── STEP 5: Discrepancy Analysis ─────────────────────────────────────

    console.log('[Confidence] Step 5: Analyzing discrepancies...');
    const discAnalyzer = new DiscrepancyAnalyzer();
    const { reports: discrepancies, aiCalls: discAiCalls } =
      await discAnalyzer.analyzeDiscrepancies(
        allCalls,
        callScores,
        context.resolvedDiscrepancies,
        {
          county: context.county,
          surveyDate: context.surveyDate,
          subdivisionName: context.subdivisionName,
        },
      );
    aiCalls += discAiCalls;

    // Build discrepancy summary
    const discrepancySummary = this.buildDiscrepancySummary(discrepancies);

    // ── STEP 6: Document Purchase Recommendations ────────────────────────

    console.log('[Confidence] Step 6: Computing purchase recommendations...');
    const purchaser = new PurchaseRecommender();
    const purchaseRecs = purchaser.recommend(
      discrepancies,
      callScores,
      context.knownDocuments,
      overallConfidence.score,
    );

    // ── STEP 7: Surveyor Decision Matrix ─────────────────────────────────

    console.log('[Confidence] Step 7: Building decision matrix...');
    const surveyorDecision = buildSurveyorDecision(
      overallConfidence.score,
      callScores,
      boundaryConfidence,
      discrepancies,
      purchaseRecs,
    );

    // ── Assemble Final Report ────────────────────────────────────────────

    const totalMs = Date.now() - startTime;
    console.log(
      `[Confidence] Complete: Overall ${overallConfidence.score} (${overallConfidence.grade}), ` +
        `${discrepancySummary.unresolved} unresolved discrepancies, ` +
        `${surveyorDecision.readyForField ? '✓ READY' : '✗ NOT READY'} ` +
        `in ${(totalMs / 1000).toFixed(1)}s`,
    );

    const report: ConfidenceReport = {
      status: errors.length === 0 ? 'complete' : 'partial',
      overallConfidence,
      callConfidence,
      lotConfidence,
      boundaryConfidence,
      discrepancies,
      discrepancySummary,
      documentPurchaseRecommendations: purchaseRecs,
      surveyorDecisionMatrix: surveyorDecision,
      timing: { totalMs },
      aiCalls,
      errors,
    };

    // ── Persist result ───────────────────────────────────────────────────

    const outputDir = path.dirname(reconciledPath);
    const outputPath = path.join(outputDir, 'confidence_report.json');
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`[Confidence] Saved to ${outputPath}`);
    } catch (e) {
      console.error(`[Confidence] Failed to save report:`, e);
    }

    return report;
  }

  // ── Overall Confidence Computation ──────────────────────────────────────

  private computeOverallConfidence(
    callScores: CallConfidenceScore[],
    lotScores: LotConfidenceScore[],
    sideScores: BoundarySideConfidence[],
    model: ReconciledBoundaryModel,
  ): OverallConfidence {
    // Base: average of call scores
    const avgCallScore =
      callScores.length > 0
        ? callScores.reduce((s, c) => s + c.score, 0) / callScores.length
        : 50;

    // Lot score average (if available)
    const avgLotScore =
      lotScores.length > 0
        ? lotScores.reduce((s, l) => s + l.score, 0) / lotScores.length
        : avgCallScore;

    // Weighted combination: 60% call average, 40% lot average
    let score = avgCallScore * 0.6 + avgLotScore * 0.4;

    // Closure factor
    const closureRatio = model.reconciledPerimeter?.closure?.closureRatio;
    if (closureRatio) {
      if (closureRatio === '1:∞' || this.parseRatio(closureRatio) >= 50000) {
        score += 5;
      } else if (this.parseRatio(closureRatio) >= 15000) {
        score += 2;
      } else if (this.parseRatio(closureRatio) < 5000) {
        score -= 5;
      }
    }

    // Discrepancy penalty
    const unresolvedConflicts = model.unresolvedConflicts?.length || 0;
    score -= unresolvedConflicts * 3;

    // Source diversity bonus
    const sourceTypes = new Set<string>();
    for (const call of model.reconciledPerimeter?.calls || []) {
      for (const reading of call.readings || []) {
        sourceTypes.add(reading.source);
      }
    }
    if (sourceTypes.size >= 4) score += 5;
    else if (sourceTypes.size >= 3) score += 2;

    // Weakest-side penalty
    const weakestSide = sideScores.length > 0
      ? Math.min(...sideScores.map((s) => s.score))
      : 50;
    if (weakestSide < 40) score -= 5;

    score = Math.min(98, Math.max(5, Math.round(score)));

    const grade = scoreToGrade(score);
    const label = this.gradeLabel(grade);
    const summary = this.buildSummary(
      score,
      grade,
      callScores,
      sideScores,
      sourceTypes.size,
    );

    return { score, grade, label, summary };
  }

  // ── Call Direction Inference ─────────────────────────────────────────────

  private inferCallDirections(
    calls: ReconciledCall[],
  ): Map<string, string> {
    const directions = new Map<string, string>();

    for (const call of calls) {
      const bearing = call.reconciledBearing;
      if (!bearing) {
        // Curves — try to use chord bearing
        const chord = call.reconciledCurve?.chordBearing;
        if (chord) {
          directions.set(call.callId, this.bearingToDirection(chord));
        }
        continue;
      }
      directions.set(call.callId, this.bearingToDirection(bearing));
    }

    return directions;
  }

  private bearingToDirection(bearing: string): string {
    const m = bearing.match(
      /([NS])\s*\d+[°]\s*\d+['"]\s*\d*['""]?\s*([EW])/i,
    );
    if (!m) return 'unknown';

    const ns = m[1].toUpperCase();
    const ew = m[2].toUpperCase();

    // The direction the call GOES toward becomes the side it defines
    // e.g., "N 45° E" goes northeast, defining the east side
    // Simplified: use the dominant direction
    const bearingDec = this.parseBearingDecimal(bearing);
    if (bearingDec === null) return 'unknown';

    // Convert to rough side
    if (ns === 'N' && bearingDec < 45) return 'north';
    if (ns === 'N' && bearingDec >= 45 && ew === 'E') return 'east';
    if (ns === 'N' && bearingDec >= 45 && ew === 'W') return 'west';
    if (ns === 'S' && bearingDec < 45) return 'south';
    if (ns === 'S' && bearingDec >= 45 && ew === 'E') return 'east';
    if (ns === 'S' && bearingDec >= 45 && ew === 'W') return 'west';

    return 'unknown';
  }

  private parseBearingDecimal(bearing: string): number | null {
    const m = bearing.match(
      /[NS]\s*(\d+)[°]\s*(\d+)['"]\s*(\d+)?['""]?\s*[EW]/i,
    );
    if (!m) return null;
    return parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || '0') / 3600;
  }

  // ── Discrepancy Summary ─────────────────────────────────────────────────

  private buildDiscrepancySummary(
    discrepancies: DiscrepancyReport[],
  ): DiscrepancySummary {
    const critical = discrepancies.filter(
      (d) => d.severity === 'critical',
    ).length;
    const moderate = discrepancies.filter(
      (d) => d.severity === 'moderate',
    ).length;
    const minor = discrepancies.filter(
      (d) => d.severity === 'minor',
    ).length;
    const resolved = discrepancies.filter(
      (d) => d.status === 'resolved',
    ).length;
    const unresolved = discrepancies.filter(
      (d) => d.status === 'unresolved',
    ).length;

    // Estimate total resolution cost
    const costs = discrepancies
      .filter((d) => d.status === 'unresolved')
      .map((d) => {
        const m = d.resolution.estimatedCost.match(/\$(\d+)/);
        return m ? parseInt(m[1]) : 5;
      });
    const totalCostLow = costs.reduce((s, c) => s + c, 0);
    const totalCostHigh = Math.round(totalCostLow * 1.8);

    // Estimate confidence after resolving all
    const maxAfter = discrepancies
      .filter((d) => d.status === 'unresolved')
      .reduce(
        (max, d) =>
          Math.max(max, d.resolution.estimatedConfidenceAfterResolution),
        0,
      );

    return {
      total: discrepancies.length,
      critical,
      moderate,
      minor,
      resolved,
      unresolved,
      estimatedResolutionCost:
        totalCostLow > 0
          ? `$${totalCostLow}-${totalCostHigh}`
          : '$0',
      estimatedConfidenceAfterResolution: maxAfter || 0,
    };
  }

  // ── Summary Text ────────────────────────────────────────────────────────

  private buildSummary(
    score: number,
    grade: string,
    callScores: CallConfidenceScore[],
    sideScores: BoundarySideConfidence[],
    sourceCount: number,
  ): string {
    const parts: string[] = [];

    // Source diversity
    if (sourceCount >= 4) {
      parts.push(
        `${sourceCount} independent source types contributed to reconciliation.`,
      );
    } else if (sourceCount <= 2) {
      parts.push(
        `Only ${sourceCount} source type(s) available — additional sources would improve confidence.`,
      );
    }

    // High-confidence calls
    const highConf = callScores.filter((c) => c.score >= 80).length;
    const lowConf = callScores.filter((c) => c.score < 50).length;
    if (highConf > 0) {
      parts.push(
        `${highConf} of ${callScores.length} calls are well-supported (score ≥80).`,
      );
    }
    if (lowConf > 0) {
      parts.push(
        `${lowConf} call(s) have low confidence and need attention.`,
      );
    }

    // Weak sides
    const weakSides = sideScores.filter((s) => s.score < 60);
    if (weakSides.length > 0) {
      parts.push(
        `${weakSides.map((s) => s.side).join(' and ')} boundar${weakSides.length === 1 ? 'y is' : 'ies are'} weak — field verification recommended.`,
      );
    }

    return parts.join(' ');
  }

  // ── Grade Label ─────────────────────────────────────────────────────────

  private gradeLabel(grade: string): string {
    if (grade.startsWith('A')) return 'Excellent — High confidence, field-ready';
    if (grade === 'B+' || grade === 'B')
      return 'Good — Field-ready with caveats';
    if (grade === 'B-' || grade === 'C+')
      return 'Acceptable — Some verification needed';
    if (grade.startsWith('C'))
      return 'Fair — Multiple items need attention';
    if (grade.startsWith('D'))
      return 'Poor — Purchase documents before field work';
    return 'Insufficient — Significant data gaps';
  }

  // ── Property Context Loader ─────────────────────────────────────────────

  private loadPropertyContext(
    reconciledPath: string,
    projectId: string,
  ): PropertyContext {
    const dir = path.dirname(reconciledPath);
    const context: PropertyContext = {
      county: 'Unknown',
      knownDocuments: [],
      resolvedDiscrepancies: [],
      lotAcreages: {},
    };

    // Try to load intelligence for county/survey info
    const intelPath = path.join(dir, 'property_intelligence.json');
    if (fs.existsSync(intelPath)) {
      try {
        const intel = JSON.parse(fs.readFileSync(intelPath, 'utf-8'));
        context.county = intel.property?.county || 'Unknown';
        context.subdivisionName = intel.property?.subdivisionName;

        // Extract known documents from deed references
        if (intel.property?.deedReferences) {
          for (const ref of intel.property.deedReferences) {
            context.knownDocuments.push({
              instrument: ref.instrumentNumber || ref.instrument || '',
              type: ref.type || 'deed',
              source: `${context.county} County Clerk`,
              pages: ref.pages || 2,
            });
          }
        }

        // Extract survey date from plat analysis
        if (intel.platAnalysis?.surveyor?.surveyDate) {
          context.surveyDate = intel.platAnalysis.surveyor.surveyDate;
        }
      } catch {
        // Silently continue
      }
    }

    // Try to load subdivision model for lot acreages
    const subPath = path.join(dir, 'subdivision_model.json');
    if (fs.existsSync(subPath)) {
      try {
        const sub = JSON.parse(fs.readFileSync(subPath, 'utf-8'));
        if (sub.lots) {
          for (const lot of sub.lots) {
            context.lotAcreages[lot.lotId] = {
              stated: lot.acreage || 0,
              computed: 0,
            };
          }
        }
      } catch {
        // Silently continue
      }
    }

    // Try to load ROW report for resolved discrepancies
    const rowPath = path.join(dir, 'row_report.json');
    if (fs.existsSync(rowPath)) {
      try {
        const row = JSON.parse(fs.readFileSync(rowPath, 'utf-8'));
        if (row.resolvedConflicts) {
          context.resolvedDiscrepancies = row.resolvedConflicts;
        }
      } catch {
        // Silently continue
      }
    }

    return context;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private parseRatio(ratio: string): number {
    if (ratio === '1:∞') return Infinity;
    const m = ratio.match(/1:(\d+)/);
    return m ? parseInt(m[1]) : 0;
  }

  private failedReport(
    reason: string,
    startTime: number,
  ): ConfidenceReport {
    return {
      status: 'failed',
      overallConfidence: {
        score: 0,
        grade: 'F',
        label: 'Failed — Cannot score',
        summary: reason,
      },
      callConfidence: [],
      lotConfidence: [],
      boundaryConfidence: [],
      discrepancies: [],
      discrepancySummary: {
        total: 0,
        critical: 0,
        moderate: 0,
        minor: 0,
        resolved: 0,
        unresolved: 0,
        estimatedResolutionCost: '$0',
        estimatedConfidenceAfterResolution: 0,
      },
      documentPurchaseRecommendations: [],
      surveyorDecisionMatrix: {
        readyForField: false,
        caveats: [reason],
        recommendedFieldChecks: [],
        minConfidenceForField: 60,
        currentConfidence: 0,
        afterDocPurchase: 0,
      },
      timing: { totalMs: Date.now() - startTime },
      aiCalls: 0,
      errors: [reason],
    };
  }
}
