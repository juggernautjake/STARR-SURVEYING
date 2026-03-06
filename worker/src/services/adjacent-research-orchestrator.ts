// worker/src/services/adjacent-research-orchestrator.ts — Phase 5 Orchestrator
// Ties together Steps 1-4 to produce a FullCrossValidationReport.
// Reads Phase 3 (PropertyIntelligence) and Phase 4 (SubdivisionModel) outputs,
// researches every adjacent property, cross-validates shared boundaries, and
// saves the result to /tmp/analysis/{projectId}/cross_validation_report.json.
//
// Spec §5.6 — Adjacent Research Orchestrator
// Output consumed by Phase 7 (Geometric Reconciliation).
//
// REQUIREMENTS:
//   - ANTHROPIC_API_KEY must be set for AI deed selection & boundary extraction
//   - County clerk must be reachable and have a KofileClerkAdapter implementation
//   - Phase 3 intelligence.json must exist at intelligencePath
//   - Phase 4 subdivision_model.json is optional but improves adjacency detection

import * as fs from 'fs';
import * as path from 'path';
import { AdjacentQueueBuilder } from './adjacent-queue-builder.js';
import { AdjacentResearchWorker, type AdjacentResearchResult } from './adjacent-research-worker.js';
import { CrossValidationEngine, type CrossValidationResult } from './cross-validation-engine.js';
import { KofileClerkAdapter } from '../adapters/kofile-clerk-adapter.js';
import type { PropertyIntelligence, P3BoundaryCall } from '../models/property-intelligence.js';
import type { AdjacentResearchTask } from './adjacent-queue-builder.js';

// ── Report Types ─────────────────────────────────────────────────────────────

/** Full cross-validation report — Phase 5 deliverable, saved as cross_validation_report.json */
export interface FullCrossValidationReport {
  status: 'complete' | 'partial' | 'failed';
  adjacentProperties: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[];
  crossValidationSummary: {
    totalAdjacentProperties: number;
    successfullyResearched: number;
    failedResearch: number;
    totalSharedCalls: number;
    confirmedCalls: number;
    closeMatchCalls: number;
    marginalCalls: number;
    unverifiedCalls: number;
    discrepancyCalls: number;
    overallBoundaryConfidence: number;
  };
  timing: { totalMs: number };
  aiCalls: number;
  errors: string[];
}

// ── AdjacentResearchOrchestrator ─────────────────────────────────────────────

export class AdjacentResearchOrchestrator {

  /**
   * Main entry point. Takes Phase 3/4 data, researches all adjacent properties,
   * cross-validates shared boundaries, and returns a FullCrossValidationReport.
   *
   * @param projectId     Project identifier (used for output file path)
   * @param intelligence  Phase 3 PropertyIntelligence object
   * @param subdivisionModel  Optional Phase 4 SubdivisionModel (for adjacency matrix)
   */
  async research(
    projectId: string,
    intelligence: PropertyIntelligence,
    subdivisionModel?: Record<string, unknown>,
  ): Promise<FullCrossValidationReport> {
    const startTime = Date.now();
    const errors: string[] = [];
    let totalAICalls = 0;

    console.log(`[Adjacent] Starting Phase 5 for project: ${projectId}`);

    // ── Step 1: Build research queue ─────────────────────────────────────────
    const queueBuilder = new AdjacentQueueBuilder();
    const queue = queueBuilder.buildQueue(intelligence, subdivisionModel);

    console.log(`[Adjacent] ${queue.length} adjacent properties to research`);
    for (const task of queue) {
      console.log(
        `[Adjacent]   #${task.priority} ${task.owner} ` +
        `(${task.sharedDirection}, ~${task.estimatedSharedLength.toFixed(0)}' shared, ` +
        `${task.instrumentHints.length} instrument hint(s))`,
      );
    }

    if (queue.length === 0) {
      console.log('[Adjacent] No adjacent properties identified — check Phase 3 output for adjacentProperties');
      return this.buildReport('complete', [], queue, startTime, 0, []);
    }

    // ── Validate required dependencies ───────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      const errMsg = 'ANTHROPIC_API_KEY is not set — cannot run AI extraction in Phase 5';
      console.error(`[Adjacent] ${errMsg}`);
      errors.push(errMsg);
      // Continue without AI — worker will report partial results
    }

    // Resolve county FIPS for clerk adapter
    // The countyFIPS field is set by Phase 1 (PropertyIdentity) on the property object.
    // Without the correct FIPS, we would be searching the wrong county's clerk.
    const countyFIPS = (intelligence as unknown as Record<string, unknown>).countyFIPS as string
      ?? (intelligence.property as unknown as Record<string, unknown>)?.countyFIPS as string;
    if (!countyFIPS) {
      const errMsg =
        'intelligence.countyFIPS (or intelligence.property.countyFIPS) is required ' +
        'but missing — ensure Phase 1 ran successfully';
      console.error(`[Adjacent] ${errMsg}`);
      errors.push(errMsg);
      return this.buildReport('failed', [], queue, startTime, 0, errors);
    }

    const countyName = intelligence.property?.county ?? 'Unknown';

    // ── Initialize clerk adapter ─────────────────────────────────────────────
    let clerkAdapter: KofileClerkAdapter;
    try {
      clerkAdapter = new KofileClerkAdapter(countyFIPS, countyName);
      await clerkAdapter.initSession();
    } catch (e) {
      const errMsg = `Failed to initialize KofileClerkAdapter for FIPS ${countyFIPS}: ${e}`;
      console.error(`[Adjacent] ${errMsg}`);
      errors.push(errMsg);
      errors.push(
        'NOTE: Non-Kofile counties are not yet supported for Phase 5. ' +
        'Future work: add CountyFusion and Tyler adapter support.',
      );
      return this.buildReport('failed', [], queue, startTime, 0, errors);
    }

    const worker = new AdjacentResearchWorker(clerkAdapter, projectId);
    const crossValidator = new CrossValidationEngine();

    const ourContext = {
      owner:             (intelligence.property as unknown as Record<string, unknown>)?.name as string ?? '',
      subdivisionName:   (intelligence as unknown as Record<string, unknown>).subdivision
        ? ((intelligence as unknown as Record<string, unknown>).subdivision as Record<string, unknown>).name as string
        : undefined,
      instrumentNumbers: (intelligence.deedChain ?? []).map(
        (d) => (d as unknown as Record<string, unknown>).instrument as string,
      ).filter(Boolean),
      sharedCallBearings: this.getSharedCallBearings(intelligence, queue),
    };

    // ── Step 2: Research each adjacent property (sequential to avoid rate limits) ──
    const results: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[] = [];

    for (let i = 0; i < queue.length; i++) {
      const task = queue[i];
      console.log(`[Adjacent] [${i + 1}/${queue.length}] Researching: ${task.owner}`);

      try {
        const result = await worker.researchAdjacentProperty(task, ourContext);
        totalAICalls += 3; // deed selection + extraction + possible chain-of-title

        // ── Step 3: Cross-validate if we got boundary data ─────────────────────
        if (result.extractedBoundary && result.extractedBoundary.totalCalls > 0) {
          const ourSharedCalls = this.getOurCallsForAdjacent(intelligence, task);
          const theirSharedCalls = result.extractedBoundary.metesAndBounds;

          if (ourSharedCalls.length > 0 && theirSharedCalls.length > 0) {
            const cv = crossValidator.validate(
              ourSharedCalls,
              theirSharedCalls,
              task.owner,
              task.sharedDirection,
            );
            (result as AdjacentResearchResult & { crossValidation: CrossValidationResult })
              .crossValidation = cv;
            totalAICalls++;

            console.log(
              `[Adjacent] ${task.owner}: ` +
              `✓${cv.confirmedCalls} ~${cv.closeMatchCalls} ?${cv.marginalCalls} ` +
              `✗${cv.discrepancyCalls} confidence=${cv.sharedBoundaryConfidence}%`,
            );
          } else {
            console.log(
              `[Adjacent] ${task.owner}: ` +
              `${result.extractedBoundary.totalCalls} calls extracted, ` +
              `but no matching shared calls found for cross-validation. ` +
              `Check if Phase 3 captured "along" descriptors for this boundary.`,
            );
          }
        }

        results.push(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Research failed for ${task.owner}: ${msg}`);
        console.error(`[Adjacent] Failed for ${task.owner}:`, error);
        results.push({
          owner:            task.owner,
          researchStatus:   'failed',
          documentsFound:   { deeds: [], plats: [] },
          extractedBoundary: null,
          chainOfTitle:     [],
          searchLog:        [],
          errors:           [msg],
          timing:           { totalMs: 0, searchMs: 0, downloadMs: 0, extractionMs: 0 },
        });
      }
    }

    // Clean up clerk session
    try {
      await clerkAdapter.destroySession();
    } catch (e) {
      console.warn('[Adjacent] Clerk session cleanup failed:', e);
    }

    return this.buildReport('complete', results, queue, startTime, totalAICalls, errors);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Build the final report, compute summary stats, and persist to disk.
   */
  private buildReport(
    rawStatus: 'complete' | 'partial' | 'failed',
    results: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[],
    queue: AdjacentResearchTask[],
    startTime: number,
    totalAICalls: number,
    errors: string[],
  ): FullCrossValidationReport {
    // Collect all call comparisons from cross-validations
    const allComparisons = results
      .filter((r) => r.crossValidation)
      .flatMap((r) => r.crossValidation!.callComparisons);

    const summary = {
      totalAdjacentProperties: queue.length,
      successfullyResearched:  results.filter((r) => r.researchStatus === 'complete').length,
      failedResearch:          results.filter(
        (r) => r.researchStatus === 'failed' || r.researchStatus === 'not_found',
      ).length,
      totalSharedCalls:   allComparisons.length,
      confirmedCalls:     allComparisons.filter((c) => c.status === 'confirmed').length,
      closeMatchCalls:    allComparisons.filter((c) => c.status === 'close_match').length,
      marginalCalls:      allComparisons.filter((c) => c.status === 'marginal').length,
      unverifiedCalls:    allComparisons.filter((c) => c.status === 'unverified').length,
      discrepancyCalls:   allComparisons.filter((c) => c.status === 'discrepancy').length,
      overallBoundaryConfidence: 0,
    };

    // Weighted confidence
    if (allComparisons.length > 0) {
      summary.overallBoundaryConfidence = Math.round(
        (summary.confirmedCalls * 100 +
          summary.closeMatchCalls * 75 +
          summary.marginalCalls * 40 +
          summary.unverifiedCalls * 25) /
          allComparisons.length,
      );
    }

    // Determine status
    let status: FullCrossValidationReport['status'];
    if (rawStatus === 'failed' && results.length === 0) {
      status = 'failed';
    } else if (summary.failedResearch === queue.length && queue.length > 0) {
      status = 'failed';
    } else if (summary.failedResearch > 0 || errors.length > 0) {
      status = 'partial';
    } else {
      status = 'complete';
    }

    const report: FullCrossValidationReport = {
      status,
      adjacentProperties: results,
      crossValidationSummary: summary,
      timing: { totalMs: Date.now() - startTime },
      aiCalls: totalAICalls,
      errors,
    };

    return report;
  }

  /**
   * Get our Phase 3 boundary calls that are on the shared boundary with the given adjacent owner.
   * Looks for calls where the "along" field mentions the adjacent owner's name.
   */
  private getOurCallsForAdjacent(
    intelligence: PropertyIntelligence,
    task: AdjacentResearchTask,
  ): P3BoundaryCall[] {
    const calls: P3BoundaryCall[] = [];
    const ownerUpper = task.owner.toUpperCase();

    // Check per-lot calls
    for (const lot of intelligence.lots ?? []) {
      for (const call of [...(lot.boundaryCalls ?? []), ...(lot.curves ?? [])]) {
        if (call.along && call.along.toUpperCase().includes(ownerUpper)) {
          calls.push(call);
        }
      }
    }

    // Check perimeter boundary calls (if present)
    const perimBoundary = (intelligence as unknown as Record<string, unknown>).perimeterBoundary as
      { calls?: P3BoundaryCall[] } | undefined;
    for (const call of perimBoundary?.calls ?? []) {
      if (call.along && call.along.toUpperCase().includes(ownerUpper)) {
        calls.push(call);
      }
    }

    // Fallback: use sharedCallIds from queue builder
    if (calls.length === 0 && task.sharedCallIds.length > 0) {
      for (const lot of intelligence.lots ?? []) {
        for (const call of [...(lot.boundaryCalls ?? []), ...(lot.curves ?? [])]) {
          if (task.sharedCallIds.includes(call.callId)) {
            calls.push(call);
          }
        }
      }
    }

    return calls;
  }

  private getSharedCallBearings(
    intelligence: PropertyIntelligence,
    queue: AdjacentResearchTask[],
  ): string[] {
    const bearings: string[] = [];
    for (const task of queue) {
      for (const call of this.getOurCallsForAdjacent(intelligence, task)) {
        if (call.bearing) bearings.push(call.bearing);
      }
    }
    return bearings;
  }
}

// ── Standalone runner (used by index.ts API route) ────────────────────────────

/**
 * Run Phase 5 analysis given file paths to Phase 3/4 outputs.
 * Persists the result to /tmp/analysis/{projectId}/cross_validation_report.json.
 */
export async function runAdjacentResearch(
  projectId: string,
  intelligencePath: string,
  subdivisionPath?: string,
): Promise<FullCrossValidationReport> {
  if (!fs.existsSync(intelligencePath)) {
    throw new Error(`Intelligence file not found: ${intelligencePath}`);
  }

  const intelligence = JSON.parse(
    fs.readFileSync(intelligencePath, 'utf-8'),
  ) as PropertyIntelligence;

  let subdivisionModel: Record<string, unknown> | undefined;
  if (subdivisionPath && fs.existsSync(subdivisionPath)) {
    try {
      subdivisionModel = JSON.parse(fs.readFileSync(subdivisionPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      console.warn(`[Adjacent] Could not parse subdivision model at ${subdivisionPath}`);
    }
  }

  const orchestrator = new AdjacentResearchOrchestrator();
  const report = await orchestrator.research(projectId, intelligence, subdivisionModel);

  // Persist output for Phase 7 consumption
  const outputPath = `/tmp/analysis/${projectId}/cross_validation_report.json`;
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[Adjacent] Saved: ${outputPath}`);
  } catch (e) {
    console.error(`[Adjacent] Failed to save report to ${outputPath}:`, e);
  }

  console.log(
    `[Adjacent] COMPLETE: ` +
    `${report.crossValidationSummary.successfullyResearched}/` +
    `${report.crossValidationSummary.totalAdjacentProperties} researched, ` +
    `confidence: ${report.crossValidationSummary.overallBoundaryConfidence}%`,
  );

  return report;
}
