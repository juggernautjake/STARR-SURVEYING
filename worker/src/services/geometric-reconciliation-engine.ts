// worker/src/services/geometric-reconciliation-engine.ts — Phase 7 Orchestrator
// The GeometricReconciliationEngine is the convergence point for the entire
// STARR RECON pipeline. It consumes outputs from Phases 3-6, treats each as
// an independent "reading" of every boundary call, and produces a single
// reconciled boundary description with source provenance and closure optimization.
//
// Spec §7.1–7.7 — Phase 7: Geometric Reconciliation & Multi-Source Cross-Validation
//
// Error Handling Strategy:
//   - Phase 3 intelligence is REQUIRED; returns failed model if missing.
//   - Phases 4-6 are OPTIONAL; gracefully omitted when files are missing.
//   - Empty / unsafe projectId values are rejected before any file I/O.
//   - All JSON parse errors are caught and recorded in the errors[] array.
//   - The engine always returns a valid ReconciledBoundaryModel — never throws.

import fs from 'fs';
import path from 'path';
import {
  ReadingAggregator,
  type IntelligenceInput,
  type SubdivisionInput,
  type CrossValidationInput,
  type ROWReportInput,
} from './reading-aggregator.js';
import { SourceWeighter } from './source-weighting.js';
import { ReconciliationAlgorithm } from './reconciliation-algorithm.js';
import { TraverseComputation, type TraverseCall } from './traverse-closure.js';
import { PipelineLogger } from '../lib/logger.js';
import type {
  PhasePaths,
  ReconciledBoundaryModel,
  ReconciledPerimeter,
  ReconciledLot,
  ReconciledCall,
  ReadingSource,
  SourceContribution,
  ClosureOptimization,
  UnresolvedConflict,
  ClosureResult,
} from '../types/reconciliation.js';

// ── Engine ───────────────────────────────────────────────────────────────────

export class GeometricReconciliationEngine {

  async reconcile(
    projectId: string,
    phasePaths: PhasePaths,
  ): Promise<ReconciledBoundaryModel> {
    const startTime = Date.now();
    const errors: string[] = [];

    // ── Validate projectId ───────────────────────────────────────────────
    // Must be non-empty and safe for use in file paths. The route handler also
    // validates this, but the engine is callable directly from tests/CLI.
    if (!projectId || projectId.trim() === '') {
      return this.failedModel('projectId is required and may not be empty', startTime);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      return this.failedModel(
        'projectId may only contain alphanumeric characters, hyphens, and underscores',
        startTime,
      );
    }

    const logger = new PipelineLogger(projectId);
    logger.info('Reconcile', `Starting Phase 7 reconciliation for ${projectId}`);

    // ── Load Phase Outputs ───────────────────────────────────────────────

    const intelligence = this.loadJSON<IntelligenceInput>(
      phasePaths.intelligence,
      'Phase 3 intelligence',
      errors,
    );
    if (!intelligence) {
      return this.failedModel(
        'Phase 3 intelligence file is required but could not be loaded',
        startTime,
      );
    }

    const subdivisionModel = phasePaths.subdivision
      ? this.loadJSON<SubdivisionInput>(
          phasePaths.subdivision,
          'Phase 4 subdivision',
          errors,
        )
      : null;

    const crossValidation = phasePaths.crossValidation
      ? this.loadJSON<CrossValidationInput>(
          phasePaths.crossValidation,
          'Phase 5 cross-validation',
          errors,
        )
      : null;

    const rowReport = phasePaths.rowReport
      ? this.loadJSON<ROWReportInput>(
          phasePaths.rowReport,
          'Phase 6 ROW report',
          errors,
        )
      : null;

    const sourcesLoaded = [
      'Phase 3 (intelligence)',
      subdivisionModel ? 'Phase 4 (subdivision)' : null,
      crossValidation ? 'Phase 5 (cross-validation)' : null,
      rowReport ? 'Phase 6 (TxDOT ROW)' : null,
    ].filter(Boolean);
    logger.info(
      'Reconcile',
      `Loaded ${sourcesLoaded.length} sources: ${sourcesLoaded.join(', ')}`,
    );

    // ── STEP 1: Reading Aggregation ──────────────────────────────────────

    logger.info('Reconcile', 'Step 1: Aggregating readings from all sources...');
    const aggregator = new ReadingAggregator();
    const readingSets = aggregator.aggregate(
      intelligence,
      subdivisionModel,
      crossValidation,
      rowReport,
    );

    const totalReadings = Array.from(readingSets.values()).reduce(
      (s, set) => s + set.readings.length,
      0,
    );
    logger.info(
      'Reconcile',
      `Aggregated ${totalReadings} readings across ${readingSets.size} calls`,
    );

    // ── STEP 2: Source Weighting ─────────────────────────────────────────

    logger.info('Reconcile', 'Step 2: Weighting sources by reliability...');
    const weighter = new SourceWeighter();
    const weightedSets = new Map<string, ReturnType<typeof weighter.weightReadings>>();

    for (const [callId, set] of readingSets) {
      weightedSets.set(callId, weighter.weightReadings(set));
    }

    // ── STEP 3: Reconciliation ───────────────────────────────────────────

    logger.info('Reconcile', 'Step 3: Reconciling calls (weighted consensus / authoritative override)...');
    const algorithm = new ReconciliationAlgorithm();
    const reconciledCalls: ReconciledCall[] = [];

    for (const [callId, set] of readingSets) {
      const weighted = weightedSets.get(callId)!;
      try {
        const reconciled = algorithm.reconcileCall(set, weighted);
        reconciledCalls.push(reconciled);
      } catch (err) {
        // Defensive: catch any unexpected error per-call and continue
        const msg = `Error reconciling call ${callId}: ${err}`;
        errors.push(msg);
        logger.warn('Reconcile', msg);
      }
    }

    logger.info('Reconcile', `Reconciled ${reconciledCalls.length} calls`);

    // ── Separate perimeter and lot calls ─────────────────────────────────

    // Perimeter calls are those from Phase 3 extraction or plat perimeter.
    // Lot calls are from Phase 4 subdivision interior lots.
    const perimeterCalls = this.identifyPerimeterCalls(
      reconciledCalls,
      intelligence,
    );
    const lotCalls = this.identifyLotCalls(
      reconciledCalls,
      intelligence,
      subdivisionModel,
    );

    // ── STEP 4: Traverse Closure — Before Reconciliation ─────────────────

    logger.info('Reconcile', 'Step 4: Computing traverse closure...');
    const traverse = new TraverseComputation();

    // Pre-reconciliation closure (using Phase 3 plat_segment readings only)
    const preCalls = this.buildPreReconciliationTraverse(intelligence);
    const preClosure = traverse.computeTraverse(preCalls);

    // Post-reconciliation closure (using reconciled values)
    const postCalls = this.reconciledToTraverseCalls(perimeterCalls);
    const postClosure = traverse.computeTraverse(postCalls);

    logger.info(
      'Reconcile',
      `Closure: ${preClosure.closureRatio} → ${postClosure.closureRatio}`,
    );

    // ── STEP 5: Compass Rule Adjustment ──────────────────────────────────

    logger.info('Reconcile', 'Step 5: Applying Compass Rule (Bowditch) adjustment...');
    const compassResult = traverse.applyCompassRule(postCalls, postClosure);

    // ── Build Reconciled Perimeter ────────────────────────────────────────

    const avgConfidence =
      perimeterCalls.length > 0
        ? Math.round(
            perimeterCalls.reduce((s, c) => s + c.finalConfidence, 0) /
              perimeterCalls.length,
          )
        : 0;
    const prevAvgConfidence =
      perimeterCalls.length > 0
        ? Math.round(
            perimeterCalls.reduce((s, c) => s + c.previousConfidence, 0) /
              perimeterCalls.length,
          )
        : 0;

    const reconciledPerimeter: ReconciledPerimeter = {
      calls: perimeterCalls,
      closure: {
        ...postClosure,
        previousClosureRatio: preClosure.closureRatio,
        improvementNotes: this.describeClosureImprovement(
          preClosure,
          postClosure,
        ),
      },
      totalCalls: perimeterCalls.length,
      reconciledCalls: perimeterCalls.filter(
        (c) => c.reconciliation.method !== 'unresolved',
      ).length,
      averageConfidence: avgConfidence,
      previousAverageConfidence: prevAvgConfidence,
    };

    // ── Build Reconciled Lots ────────────────────────────────────────────

    const reconciledLots: ReconciledLot[] = [];
    for (const [lotId, calls] of Object.entries(lotCalls)) {
      const lotTraverseCalls = this.reconciledToTraverseCalls(calls);
      const lotClosure = traverse.computeTraverse(lotTraverseCalls);

      const lotAvg =
        calls.length > 0
          ? Math.round(
              calls.reduce((s, c) => s + c.finalConfidence, 0) / calls.length,
            )
          : 0;
      const lotPrevAvg =
        calls.length > 0
          ? Math.round(
              calls.reduce((s, c) => s + c.previousConfidence, 0) /
                calls.length,
            )
          : 0;

      // Compute acreage from closure if possible
      const acreage = this.computeAcreageFromPoints(lotClosure);

      reconciledLots.push({
        lotId,
        name: lotId,
        reconciledCalls: calls.filter((c) => c.type === 'straight'),
        reconciledCurves: calls.filter((c) => c.type === 'curve'),
        closure: {
          errorDistance: lotClosure.errorDistance,
          closureRatio: lotClosure.closureRatio,
          status: lotClosure.status,
        },
        reconciledAcreage: acreage,
        averageConfidence: lotAvg,
        previousAverageConfidence: lotPrevAvg,
      });
    }

    // ── Source Contribution Statistics ────────────────────────────────────

    const sourceContributions = this.computeSourceContributions(
      reconciledCalls,
    );

    // ── Closure Optimization Report ──────────────────────────────────────

    const closureOptimization: ClosureOptimization = {
      beforeReconciliation: preClosure.closureRatio,
      afterReconciliation: postClosure.closureRatio,
      afterCompassRule: compassResult.closureRatio,
      compassRuleApplied: compassResult.compassRuleApplied,
      compassRuleAdjustments: compassResult.adjustments.map((adj) => ({
        callId: adj.callId,
        bearingAdj: this.formatSmallAngle(adj.dN, adj.dE),
        distanceAdj: Math.round(Math.sqrt(adj.dN ** 2 + adj.dE ** 2) * 10000) / 10000,
      })),
    };

    // ── Unresolved Conflicts ─────────────────────────────────────────────

    const unresolvedConflicts = this.identifyUnresolvedConflicts(
      reconciledCalls,
    );

    // ── Assemble Final Model ─────────────────────────────────────────────

    const totalMs = Date.now() - startTime;
    logger.info(
      'Reconcile',
      `Complete: ${reconciledCalls.length} calls reconciled, ` +
        `closure ${preClosure.closureRatio} → ${compassResult.closureRatio}, ` +
        `confidence ${prevAvgConfidence}% → ${avgConfidence}% ` +
        `in ${(totalMs / 1000).toFixed(1)}s`,
    );

    const model: ReconciledBoundaryModel = {
      status: unresolvedConflicts.length === 0 && errors.length === 0
        ? 'complete'
        : 'partial',
      reconciledPerimeter,
      reconciledLots,
      sourceContributions,
      closureOptimization,
      unresolvedConflicts,
      timing: { totalMs },
      aiCalls: 0, // Phase 7 is pure computation — no AI calls
      errors,
    };

    // ── Persist result ───────────────────────────────────────────────────

    const outputDir = path.dirname(phasePaths.intelligence);
    const outputPath = path.join(outputDir, 'reconciled_boundary.json');
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));
      logger.info('Reconcile', `Saved to ${outputPath}`);
    } catch (e) {
      const msg = `Failed to save reconciled model: ${e}`;
      errors.push(msg);
      logger.error('Reconcile', msg, e);
    }

    return model;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private loadJSON<T>(
    filePath: string,
    label: string,
    errors: string[],
  ): T | null {
    try {
      if (!fs.existsSync(filePath)) {
        errors.push(`${label} file not found: ${filePath}`);
        return null;
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      errors.push(`Failed to parse ${label}: ${e}`);
      return null;
    }
  }

  private identifyPerimeterCalls(
    allCalls: ReconciledCall[],
    intel: IntelligenceInput,
  ): ReconciledCall[] {
    // If Phase 3 extraction has perimeter calls, use those call IDs
    const perimeterCallIds = new Set<string>();

    if (intel.extraction?.calls) {
      for (const call of intel.extraction.calls) {
        perimeterCallIds.add(call.callId ?? `call_${call.sequence}`);
      }
    }

    if (intel.platAnalysis?.perimeter?.calls) {
      for (const call of intel.platAnalysis.perimeter.calls) {
        perimeterCallIds.add(call.callId ?? `call_${call.sequence}`);
      }
    }

    if (perimeterCallIds.size > 0) {
      return allCalls.filter((c) => perimeterCallIds.has(c.callId));
    }

    // Fallback: all calls are perimeter
    return allCalls;
  }

  private identifyLotCalls(
    allCalls: ReconciledCall[],
    intel: IntelligenceInput,
    subModel: SubdivisionInput | null,
  ): Record<string, ReconciledCall[]> {
    const lotCallMap: Record<string, ReconciledCall[]> = {};

    // Build a mapping from call IDs to lot IDs
    const callToLot = new Map<string, string>();

    if (intel.platAnalysis?.lots) {
      for (const lot of intel.platAnalysis.lots) {
        for (const call of [...lot.boundaryCalls, ...lot.curves]) {
          const callId = call.callId ?? `call_${call.sequence}`;
          callToLot.set(callId, lot.lotId);
        }
      }
    }

    if (subModel?.lots) {
      for (const lot of subModel.lots) {
        for (const call of lot.boundaryCalls) {
          const callId = call.callId ?? `call_${(call as any).sequence}`;
          callToLot.set(callId, lot.lotId);
        }
      }
    }

    for (const call of allCalls) {
      const lotId = callToLot.get(call.callId);
      if (lotId) {
        if (!lotCallMap[lotId]) lotCallMap[lotId] = [];
        lotCallMap[lotId].push(call);
      }
    }

    return lotCallMap;
  }

  private buildPreReconciliationTraverse(
    intel: IntelligenceInput,
  ): TraverseCall[] {
    const calls = intel.extraction?.calls || intel.platAnalysis?.perimeter?.calls || [];
    return calls.map((c) => ({
      callId: c.callId ?? `call_${c.sequence}`,
      bearing: c.bearing?.raw ?? null,
      distance: c.distance?.value ?? null,
      type: (c.curve ? 'curve' : 'straight') as 'straight' | 'curve',
      curve: c.curve
        ? {
            chordBearing: c.curve.chordBearing?.raw,
            chordDistance: c.curve.chordDistance?.value,
            arcLength: c.curve.arcLength?.value,
          }
        : undefined,
    }));
  }

  private reconciledToTraverseCalls(calls: ReconciledCall[]): TraverseCall[] {
    return calls.map((c) => ({
      callId: c.callId,
      bearing: c.reconciledBearing,
      distance: c.reconciledDistance,
      type: c.type,
      curve: c.reconciledCurve
        ? {
            chordBearing: c.reconciledCurve.chordBearing,
            chordDistance: c.reconciledCurve.chordDistance,
            arcLength: c.reconciledCurve.arcLength,
          }
        : undefined,
    }));
  }

  private computeAcreageFromPoints(closure: ClosureResult): number | null {
    if (closure.points.length < 3) return null;

    // Shoelace formula
    let area = 0;
    const pts = closure.points;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].easting * pts[j].northing;
      area -= pts[j].easting * pts[i].northing;
    }
    const sqft = Math.abs(area) / 2;
    const acres = sqft / 43560;
    return Math.round(acres * 1000) / 1000;
  }

  private computeSourceContributions(
    calls: ReconciledCall[],
  ): Record<ReadingSource, SourceContribution> {
    const sources: ReadingSource[] = [
      'plat_segment',
      'plat_geometric',
      'plat_overview',
      'deed_extraction',
      'subdivision_interior',
      'adjacent_reversed',
      'adjacent_chain',
      'txdot_row',
      'county_road_default',
    ];

    const result: Record<string, SourceContribution> = {};

    for (const source of sources) {
      let contributed = 0;
      let chosen = 0;
      let totalWeight = 0;
      let weightCount = 0;

      for (const call of calls) {
        const fromSource = call.readings.filter((r) => r.source === source);
        if (fromSource.length > 0) {
          contributed++;
          totalWeight += fromSource.reduce((s, r) => s + r.weight, 0);
          weightCount += fromSource.length;
        }
        if (call.reconciliation.dominantSource === source) {
          chosen++;
        }
      }

      if (contributed > 0 || chosen > 0) {
        result[source] = {
          callsContributed: contributed,
          timesChosen: chosen,
          averageWeight:
            weightCount > 0
              ? Math.round((totalWeight / weightCount) * 100) / 100
              : 0,
        };
      }
    }

    return result as Record<ReadingSource, SourceContribution>;
  }

  private identifyUnresolvedConflicts(
    calls: ReconciledCall[],
  ): UnresolvedConflict[] {
    const conflicts: UnresolvedConflict[] = [];

    for (const call of calls) {
      if (call.reconciliation.method === 'unresolved') {
        conflicts.push({
          callId: call.callId,
          description: `Cannot reconcile ${call.readings.length} conflicting readings`,
          bearingDifference: call.reconciliation.bearingSpread,
          distanceDifference: call.reconciliation.distanceSpread,
          possibleCauses: [
            'Watermark obscuring critical digits in plat reading',
            'Different survey monuments used as basis of bearing',
            'NAD27 → NAD83 datum shift in older documents',
          ],
          recommendedAction:
            'Purchase unwatermarked plat to confirm reading',
          impactOnClosure: 'moderate',
        });
      } else if (call.reconciliation.agreement === 'weak') {
        // Weak agreement — still resolved but flag for attention
        const readings = call.readings.filter(
          (r) => r.bearing && r.type === 'straight',
        );
        if (readings.length >= 2) {
          const bearings = readings.map((r) => r.bearing!);
          const distances = readings
            .filter((r) => r.distance != null)
            .map((r) => r.distance!);
          const distSpread =
            distances.length > 0
              ? Math.max(...distances) - Math.min(...distances)
              : 0;

          if (distSpread > 2.0) {
            conflicts.push({
              callId: call.callId,
              description: `Weak agreement: ${readings.length} sources with ${distSpread.toFixed(2)}' distance spread`,
              bearingDifference: call.reconciliation.bearingSpread,
              distanceDifference: distSpread,
              possibleCauses: [
                'Source measurements from different survey epochs',
                'Possible monument displacement over time',
              ],
              recommendedAction:
                'Field verification recommended to confirm dimensions',
              impactOnClosure: distSpread > 5.0 ? 'severe' : 'minor',
            });
          }
        }
      }
    }

    return conflicts;
  }

  private describeClosureImprovement(
    before: ClosureResult,
    after: ClosureResult,
  ): string {
    if (before.errorDistance === 0 && after.errorDistance === 0) {
      return 'Both pre- and post-reconciliation closures are exact';
    }

    const beforeRatio = this.parseRatio(before.closureRatio);
    const afterRatio = this.parseRatio(after.closureRatio);

    if (afterRatio > beforeRatio) {
      const improvement = Math.round((afterRatio / beforeRatio) * 100) / 100;
      return `Reconciliation improved closure from ${before.closureRatio} to ${after.closureRatio} (${improvement}x improvement)`;
    } else if (afterRatio === beforeRatio) {
      return `Closure unchanged at ${after.closureRatio}`;
    } else {
      return `Warning: Reconciliation degraded closure from ${before.closureRatio} to ${after.closureRatio} — review reconciled values`;
    }
  }

  private parseRatio(ratio: string): number {
    if (ratio === '1:∞') return Infinity;
    const m = ratio.match(/1:(\d+)/);
    return m ? parseInt(m[1]) : 0;
  }

  private formatSmallAngle(dN: number, dE: number): string {
    const angleDeg = Math.abs(Math.atan2(dE, dN) * (180 / Math.PI));
    const deg = Math.floor(angleDeg);
    const minF = (angleDeg - deg) * 60;
    const min = Math.floor(minF);
    const sec = ((minF - min) * 60).toFixed(1);
    return `${deg}°${String(min).padStart(2, '0')}'${sec}"`;
  }

  private failedModel(
    reason: string,
    startTime: number,
  ): ReconciledBoundaryModel {
    return {
      status: 'failed',
      reconciledPerimeter: {
        calls: [],
        closure: {
          errorNorthing: 0,
          errorEasting: 0,
          errorDistance: 0,
          closureRatio: 'n/a',
          status: 'poor',
          perimeterLength: 0,
          points: [],
          previousClosureRatio: 'n/a',
          improvementNotes: reason,
        },
        totalCalls: 0,
        reconciledCalls: 0,
        averageConfidence: 0,
        previousAverageConfidence: 0,
      },
      reconciledLots: [],
      sourceContributions: {} as Record<ReadingSource, SourceContribution>,
      closureOptimization: {
        beforeReconciliation: 'n/a',
        afterReconciliation: 'n/a',
        afterCompassRule: 'n/a',
        compassRuleApplied: false,
        compassRuleAdjustments: [],
      },
      unresolvedConflicts: [],
      timing: { totalMs: Date.now() - startTime },
      aiCalls: 0,
      errors: [reason],
    };
  }
}
