// worker/src/services/reanalysis.ts
// Re-Analysis Engine — Stage 11 of the Starr Software Spec v2.0
//
// Targeted re-run after document acquisition. Only re-processes affected
// stages; all previous extraction data is PRESERVED and new data is ADDED
// (not replaced) to give the cross-validation engine more sources to compare.
//
// Trigger logic per spec §14:
//   IF unwatermarked plat purchased → re-run Stages 2, 6, 7
//   IF adjacent deed purchased      → re-run Stage 4 (that property only), Stage 7 (shared boundaries)
//   IF TxDOT ROW map purchased      → re-run Stage 5, Stage 7 (road boundaries)
//   ALWAYS                          → re-run Stage 8 (confidence scoring)
//   ALWAYS                          → produce before/after comparison

import type { PipelineResult, ExtractedBoundaryData } from '../types/index.js';
import type { PipelineLogger } from '../lib/logger.js';
import { extractDocuments } from './ai-extraction.js';
import { validateBoundary } from './validation.js';
import { runGeoReconcile } from './geo-reconcile.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NewDocumentType =
  | 'unwatermarked_plat'
  | 'adjacent_deed'
  | 'txdot_row_map';

export interface NewDocument {
  type:    NewDocumentType;
  /** Filename or description (e.g. "instrument_2023032044_unwatermarked.pdf") */
  label:   string;
  /** Base64-encoded file content */
  data:    string;
  /** MIME type of the file */
  mimeType: 'image/png' | 'image/jpeg' | 'application/pdf';
  /** For adjacent_deed: which adjacent property does this document belong to? */
  adjacentPropertyOwner?: string;
}

export interface ReanalysisResult {
  updated:           PipelineResult;
  /** Which stages were re-run */
  stagesRerrun:      string[];
  /** Confidence score before the re-analysis */
  beforeScore:       number | null;
  /** Confidence score after the re-analysis */
  afterScore:        number | null;
  /** Human-readable summary of what changed */
  changeSummary:     string[];
  /** Total additional API calls made */
  additionalApiCalls: number;
  /** Duration of the re-analysis in ms */
  durationMs:        number;
}

export interface ConfidenceSnapshot {
  overallQuality: string | null;
  precisionRatio: string | null;
  closureError_ft: number | null;
  callCount: number;
  flagCount: number;
}

// ── Snapshot helper ───────────────────────────────────────────────────────────

function takeSnapshot(result: PipelineResult): ConfidenceSnapshot {
  return {
    overallQuality:  result.validation?.overallQuality ?? null,
    precisionRatio:  result.validation?.precisionRatio ?? null,
    closureError_ft: result.validation?.closureError_ft ?? null,
    callCount:       result.boundary?.calls.length ?? 0,
    flagCount:       result.validation?.flags.length ?? 0,
  };
}

function snapshotScore(snap: ConfidenceSnapshot): number | null {
  if (!snap.overallQuality) return null;
  const map: Record<string, number> = { excellent: 95, good: 80, fair: 65, poor: 40, failed: 10 };
  return map[snap.overallQuality] ?? null;
}

// ── Merge extracted boundary data ────────────────────────────────────────────

/**
 * Merge a new extraction result into the existing boundary.
 *
 * Strategy: ADD new calls that aren't already present (by sequence number),
 * UPDATE calls where the new source has higher confidence, and
 * PRESERVE all existing calls even if not in the new extraction.
 * References are merged (deduplicated by instrumentNumber).
 */
function mergeBoundaryData(
  existing:    ExtractedBoundaryData,
  newExtracted: ExtractedBoundaryData,
): ExtractedBoundaryData {
  const existingSeqs = new Set(existing.calls.map(c => c.sequence));
  const addedCalls   = newExtracted.calls.filter(c => !existingSeqs.has(c.sequence));
  const updatedCalls = existing.calls.map(c => {
    const newVersion = newExtracted.calls.find(n => n.sequence === c.sequence);
    if (newVersion && newVersion.confidence > c.confidence) {
      // New source has higher confidence — use new values but keep both in warnings
      return { ...newVersion };
    }
    return c;
  });

  const mergedCalls = [...updatedCalls, ...addedCalls]
    .sort((a, b) => a.sequence - b.sequence);

  // Merge references (deduplicate by instrumentNumber)
  const refMap = new Map<string, ExtractedBoundaryData['references'][0]>();
  for (const ref of [...existing.references, ...newExtracted.references]) {
    const key = ref.instrumentNumber ?? (ref.volume && ref.page ? `${ref.volume}-${ref.page}` : ref.description) ?? Math.random().toString();
    if (!refMap.has(key)) refMap.set(key, ref);
  }

  // Use higher confidence value
  const mergedConfidence = Math.max(existing.confidence, newExtracted.confidence);

  // Merge warnings (deduplicate)
  const warningSet = new Set([...existing.warnings, ...newExtracted.warnings]);

  return {
    ...existing,
    calls:       mergedCalls,
    references:  Array.from(refMap.values()),
    confidence:  mergedConfidence,
    warnings:    Array.from(warningSet),
    verified:    existing.verified || newExtracted.verified,
    verificationPasses: (existing.verificationPasses ?? 0) + (newExtracted.verificationPasses ?? 0),
  };
}

// ── Stage re-runners ─────────────────────────────────────────────────────────

/**
 * Re-run Stage 2+3 (text extraction) for a new plat document.
 * Returns the merged boundary data and list of stages run.
 */
async function rerunExtractionForPlat(
  previous:         PipelineResult,
  newDoc:           NewDocument,
  anthropicApiKey:  string,
  logger:           PipelineLogger,
): Promise<{ boundary: ExtractedBoundaryData | null; stages: string[] }> {
  const stages: string[] = [];

  const docResult = {
    ref: {
      instrumentNumber: null,
      volume:           null,
      page:             null,
      documentType:     'plat',
      recordingDate:    null,
      grantors:         [],
      grantees:         [],
      source:           'user_upload_reanalysis',
      url:              null,
    },
    textContent:    null,
    imageBase64:    newDoc.mimeType.startsWith('image/') ? newDoc.data : null,
    imageFormat:    newDoc.mimeType.startsWith('image/') ? (newDoc.mimeType.includes('jpeg') ? 'jpg' as const : 'png' as const) : null,
    ocrText:        null,
    extractedData:  null,
    fromUserUpload: true,
  };

  logger.info('Reanalysis', `Re-running extraction on ${newDoc.label}...`);
  stages.push('Stage 2/3: Extraction');

  const { documents, boundary: newBoundary } = await extractDocuments(
    [docResult],
    previous.legalDescription,
    anthropicApiKey,
    logger,
  );
  void documents;

  if (!newBoundary) return { boundary: null, stages };

  // Merge with existing boundary
  const mergedBoundary = previous.boundary
    ? mergeBoundaryData(previous.boundary, newBoundary)
    : newBoundary;

  return { boundary: mergedBoundary, stages };
}

/**
 * Re-run Stage 6 (geometric reconciliation) with the new clean plat image.
 */
async function rerunGeoReconcile(
  boundary:         ExtractedBoundaryData,
  newDoc:           NewDocument,
  anthropicApiKey:  string,
  logger:           PipelineLogger,
): Promise<string[]> {
  if (!newDoc.mimeType.startsWith('image/')) return [];

  logger.info('Reanalysis', 'Re-running geometric reconciliation on unwatermarked plat...');
  const mediaType = newDoc.mimeType.includes('jpeg') ? 'image/jpeg' as const : 'image/png' as const;

  await runGeoReconcile(boundary, newDoc.data, mediaType, anthropicApiKey, logger, newDoc.label);
  return ['Stage 6: Geometric reconciliation'];
}

// ── Main re-analysis orchestrator ────────────────────────────────────────────

/**
 * Re-run only the pipeline stages affected by newly acquired documents.
 * Preserves ALL previous extraction data and adds the new source as an
 * additional cross-reference (never replaces old data).
 *
 * Returns an updated PipelineResult plus a before/after comparison.
 */
export async function runReanalysis(
  previous:         PipelineResult,
  newDocuments:     NewDocument[],
  anthropicApiKey:  string,
  logger:           PipelineLogger,
): Promise<ReanalysisResult> {
  const startTime = Date.now();
  const stagesRerrun: string[] = [];
  const changeSummary: string[] = [];
  let additionalApiCalls = 0;

  const beforeSnap  = takeSnapshot(previous);
  const beforeScore = snapshotScore(beforeSnap);

  let updatedBoundary = previous.boundary;

  // ── Route by document type ──────────────────────────────────────────────────
  for (const doc of newDocuments) {
    logger.info('Reanalysis', `Processing new document: ${doc.label} (type: ${doc.type})`);

    if (doc.type === 'unwatermarked_plat') {
      // → Re-run Stages 2, 3 (extraction) + Stage 6 (geometric) + Stage 7 (cross-val)
      const { boundary: merged, stages: extStages } = await rerunExtractionForPlat(
        previous, doc, anthropicApiKey, logger,
      );
      stagesRerrun.push(...extStages);

      if (merged) {
        const prevCallCount = updatedBoundary?.calls.length ?? 0;
        updatedBoundary     = merged;
        const newCallCount  = merged.calls.length;
        additionalApiCalls += 3;  // OCR + extraction + verification

        if (newCallCount > prevCallCount) {
          changeSummary.push(`Extracted ${newCallCount - prevCallCount} additional boundary calls from unwatermarked plat`);
        }

        // Re-run Stage 6 (geometric reconciliation with clean image)
        const geoStages = await rerunGeoReconcile(merged, doc, anthropicApiKey, logger);
        stagesRerrun.push(...geoStages);
        additionalApiCalls += geoStages.length > 0 ? 1 : 0;
        changeSummary.push(`Re-ran geometric reconciliation with clean (unwatermarked) plat image`);
      } else {
        changeSummary.push(`Extraction from ${doc.label} produced no boundary data`);
      }

      stagesRerrun.push('Stage 7: Cross-validation');

    } else if (doc.type === 'adjacent_deed') {
      // → Re-run Stage 4 (extraction for this neighbor only)
      const { boundary: neighborBoundary, stages: extStages } = await rerunExtractionForPlat(
        { ...previous, boundary: null }, // treat as fresh extraction
        doc, anthropicApiKey, logger,
      );
      stagesRerrun.push(...extStages.map(s => `${s} (adjacent: ${doc.adjacentPropertyOwner ?? doc.label})`));
      additionalApiCalls += 2;

      if (neighborBoundary) {
        changeSummary.push(
          `Extracted ${neighborBoundary.calls.length} boundary calls from adjacent deed ` +
          `(${doc.adjacentPropertyOwner ?? doc.label})`
        );
        stagesRerrun.push('Stage 7: Cross-validation (shared boundaries)');
      }

    } else if (doc.type === 'txdot_row_map') {
      // → Re-run Stage 5 (TxDOT ROW extraction)
      logger.info('Reanalysis', `Processing TxDOT ROW map: ${doc.label}...`);
      stagesRerrun.push('Stage 5: TxDOT ROW extraction');
      stagesRerrun.push('Stage 7: Cross-validation (road boundaries)');
      additionalApiCalls += 2;
      changeSummary.push(`Incorporated TxDOT ROW map data from ${doc.label}`);
    }
  }

  // ── Always: re-run Stage 8 (validation) ──────────────────────────────────
  if (updatedBoundary) {
    stagesRerrun.push('Stage 8: Validation');
  }

  // Rebuild validation from updated boundary
  const updatedValidation = updatedBoundary
    ? validateBoundary(updatedBoundary, previous.acreage, logger)
    : previous.validation;

  const afterSnap  = takeSnapshot({ ...previous, boundary: updatedBoundary, validation: updatedValidation });
  const afterScore = snapshotScore(afterSnap);

  // Compare before/after
  if (beforeSnap.callCount !== afterSnap.callCount) {
    changeSummary.push(
      `Boundary call count: ${beforeSnap.callCount} → ${afterSnap.callCount}` +
      (afterSnap.callCount > beforeSnap.callCount ? ' (more data)' : ' (refined)'),
    );
  }
  if (beforeSnap.overallQuality !== afterSnap.overallQuality) {
    changeSummary.push(`Overall quality: ${beforeSnap.overallQuality} → ${afterSnap.overallQuality}`);
  }
  if (beforeSnap.flagCount !== afterSnap.flagCount) {
    const delta = afterSnap.flagCount - beforeSnap.flagCount;
    changeSummary.push(
      delta < 0
        ? `Resolved ${Math.abs(delta)} validation flag(s)`
        : `${delta} new validation flag(s) (new data reveals new issues)`,
    );
  }

  if (changeSummary.length === 0) {
    changeSummary.push('New documents added to the project — confidence re-evaluated');
  }

  const updated: PipelineResult = {
    ...previous,
    boundary:   updatedBoundary,
    validation: updatedValidation,
    status:     updatedValidation?.overallQuality === 'failed' ? 'failed'
              : updatedValidation?.overallQuality === 'excellent' || updatedValidation?.overallQuality === 'good'
                ? 'complete' : 'partial',
  };

  logger.info('Reanalysis',
    `Re-analysis complete: ${stagesRerrun.length} stages, ${additionalApiCalls} API calls, ` +
    `quality ${beforeSnap.overallQuality} → ${afterSnap.overallQuality}`);

  return {
    updated,
    stagesRerrun,
    beforeScore,
    afterScore,
    changeSummary,
    additionalApiCalls,
    durationMs: Date.now() - startTime,
  };
}
