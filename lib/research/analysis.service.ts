// lib/research/analysis.service.ts — AI Analysis Engine orchestration
// Coordinates per-document extraction, cross-referencing, normalization, and discrepancy detection.
import { supabaseAdmin } from '@/lib/supabase';
import { callAI, AIServiceError } from './ai-client';
import {
  normalizeBearing,
  normalizeDistance,
  parseDMS,
  calculateTraverseClosure,
  validateCurveData,
  bearingDifferenceArcSeconds,
  bearingsOpposite,
  parseArea,
  computeAreaSqFt,
  sqFtToAcres,
  NormalizationError,
  type NormalizedBearing,
  type NormalizedDistance,
  type NormalizedCurveData,
  type NormalizedCall,
  type TraversePoint,
} from './normalization';
import type {
  ResearchDocument,
  ExtractedDataPoint,
  Discrepancy,
  DiscrepancySeverity,
  ProbableCause,
  DataCategory,
} from '@/types/research';

// ── Analysis Configuration ──────────────────────────────────────────────────

export interface AnalysisConfig {
  extractCategories: Record<string, boolean>;
  templateId?: string;
}

const DEFAULT_EXTRACT_CONFIG: Record<string, boolean> = {
  bearings_distances: true,
  monuments: true,
  curve_data: true,
  point_of_beginning: true,
  easements: true,
  setbacks: true,
  right_of_way: true,
  adjoiners: true,
  area_calculations: true,
  recording_references: true,
  surveyor_info: true,
  legal_description: true,
  lot_block_subdivision: true,
  coordinates: true,
  elevations: true,
  zoning: true,
  flood_zone: true,
  utilities: true,
};

// ── Log Entry ────────────────────────────────────────────────────────────────

export interface AnalysisLogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  detail?: string;
}

// ── Abort Error ───────────────────────────────────────────────────────────────

class AnalysisAbortError extends Error {
  constructor() { super('Analysis aborted by user'); this.name = 'AnalysisAbortError'; }
}

// ── Analysis timeouts ─────────────────────────────────────────────────────────

/** Maximum time in milliseconds to wait for a single document to be analyzed.
 *  3 minutes is enough for any reasonable document; shorter = faster freeze detection. */
export const DOCUMENT_ANALYSIS_TIMEOUT_MS = 3 * 60 * 1000;

/** Overall pipeline watchdog — 30 minutes covers even the largest projects. */
export const PIPELINE_WATCHDOG_MS = 30 * 60 * 1000;

/** Heartbeat interval — keeps updated_at fresh so staleness detection works. */
const HEARTBEAT_INTERVAL_MS = 12_000;

/** A project is considered "frozen" when its updated_at hasn't changed in this long. */
export const FROZEN_THRESHOLD_MS = 90_000; // 90 seconds

function withDocumentTimeout<T>(promise: Promise<T>, docLabel: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Document analysis timed out after 3 minutes: "${docLabel}"`)),
        DOCUMENT_ANALYSIS_TIMEOUT_MS,
      )
    ),
  ]);
}

// ── Main Analysis Pipeline ──────────────────────────────────────────────────

/**
 * Run the full analysis pipeline for a research project.
 * This is async and can take several minutes for many documents.
 *
 * Steps:
 * 1. Load all extracted documents
 * 2. Per-document AI extraction (with 5-min timeout + abort checks)
 * 3. Normalize extracted values
 * 4. Cross-reference analysis
 * 5. Mathematical discrepancy detection
 * 6. Store all results
 * 7. Save analysis log to project metadata
 */
export async function analyzeProject(
  projectId: string,
  config?: Partial<AnalysisConfig> & { resume?: boolean }
): Promise<{ dataPointCount: number; discrepancyCount: number }> {
  const extractCategories = config?.extractCategories || DEFAULT_EXTRACT_CONFIG;
  const resumeMode = config?.resume === true;

  // In resume mode, carry over logs from the previous (frozen/aborted) run so the
  // complete history is visible in the UI.
  let logs: AnalysisLogEntry[] = [];
  if (resumeMode) {
    try {
      const { data: prev } = await supabaseAdmin
        .from('research_projects')
        .select('analysis_metadata')
        .eq('id', projectId)
        .single();
      const prevMeta = prev?.analysis_metadata as Record<string, unknown> | null;
      if (Array.isArray(prevMeta?.logs)) {
        logs = prevMeta.logs as AnalysisLogEntry[];
      }
    } catch { /* non-fatal — start with empty log */ }
  }
  function addLog(level: AnalysisLogEntry['level'], message: string, detail?: string) {
    const entry: AnalysisLogEntry = { ts: new Date().toISOString(), level, message, ...(detail ? { detail } : {}) };
    logs.push(entry);
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[Analysis][${level.toUpperCase()}] ${message}${detail ? ` — ${detail}` : ''}`);
  }

  async function persistLogs(extraMeta?: Record<string, unknown>) {
    const { data: current } = await supabaseAdmin
      .from('research_projects')
      .select('analysis_metadata')
      .eq('id', projectId)
      .single();
    const existing = (current?.analysis_metadata as Record<string, unknown>) || {};
    await supabaseAdmin.from('research_projects').update({
      analysis_metadata: { ...existing, ...extraMeta, logs },
      updated_at: new Date().toISOString(),
    }).eq('id', projectId);
  }

  async function checkAbort(): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('research_projects')
      .select('status, analysis_metadata')
      .eq('id', projectId)
      .single();
    // Abort if: flag was set OR the DELETE route already reset the status to 'configure'
    if (data?.status === 'configure') return true;
    const meta = data?.analysis_metadata as Record<string, unknown> | null;
    return meta?.abort_requested === true;
  }

  // Update project status to analyzing
  const analysisStartedAt = new Date().toISOString();
  if (resumeMode) {
    addLog('info', 'Analysis resumed — skipping already-analyzed documents', `Carrying ${logs.length} log entries from previous run`);
  } else {
    addLog('info', 'Analysis pipeline started', `Extracting: ${Object.keys(extractCategories).filter(k => extractCategories[k]).join(', ')}`);
  }

  await supabaseAdmin.from('research_projects').update({
    status: 'analyzing',
    analysis_metadata: {
      started_at: analysisStartedAt,
      extract_config: extractCategories,
      abort_requested: false,
      resumed: resumeMode,
      logs,
    },
    updated_at: new Date().toISOString(),
  }).eq('id', projectId);

  // ── Heartbeat: touch updated_at every 12 s so freeze detection works ──────
  // The status poller flags the analysis as frozen when updated_at hasn't moved
  // for FROZEN_THRESHOLD_MS. This interval keeps it alive between DB writes.
  const heartbeatTimer = setInterval(async () => {
    await supabaseAdmin
      .from('research_projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('status', 'analyzing') // only write while still analyzing
      .then(() => null)
      .catch(() => null);
  }, HEARTBEAT_INTERVAL_MS);

  // ── Overall watchdog: hard-fail if the entire pipeline exceeds 30 minutes ──
  let watchdogFired = false;
  const watchdogTimer = setTimeout(() => {
    watchdogFired = true;
  }, PIPELINE_WATCHDOG_MS);

  try {
    // In resume mode, reset any document stuck in 'analyzing' back to 'extracted'
    // so it will be re-processed in this run.
    if (resumeMode) {
      await supabaseAdmin
        .from('research_documents')
        .update({ processing_status: 'extracted', updated_at: new Date().toISOString() })
        .eq('research_project_id', projectId)
        .eq('processing_status', 'analyzing');
    }

    // 1. Load all documents with extracted text
    const { data: allDocuments } = await supabaseAdmin
      .from('research_documents')
      .select('*')
      .eq('research_project_id', projectId)
      .in('processing_status', ['extracted', 'analyzed'])
      .order('created_at');

    if (!allDocuments || allDocuments.length === 0) {
      addLog('error', 'No processed documents found for analysis', 'Documents must be in "extracted" or "analyzed" status before analysis can run.');
      await persistLogs();
      throw new Error('No processed documents found for analysis');
    }

    // In resume mode, skip documents already successfully analyzed in a previous run.
    // Non-resume mode re-analyzes everything for a fully fresh result.
    const documents = resumeMode
      ? allDocuments.filter((d: { processing_status: string }) => d.processing_status !== 'analyzed')
      : allDocuments;

    const skippedCount = allDocuments.length - documents.length;
    if (resumeMode && skippedCount > 0) {
      addLog('info', `Resume mode: skipping ${skippedCount} already-analyzed document(s) — processing ${documents.length} remaining`);
    } else {
      addLog('info', `Found ${documents.length} document(s) to analyze`);
    }

    // Helper: race a promise against a recurring abort check so that a long-running
    // AI call can be interrupted within ~3 seconds of the user requesting abort.
    // Also checks the pipeline watchdog so a runaway analysis self-terminates.
    async function raceWithAbort<T>(fn: Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const scheduleCheck = () => {
          timer = setTimeout(async () => {
            try {
              if (watchdogFired) {
                reject(new Error('Analysis pipeline exceeded the 30-minute watchdog limit and was stopped automatically.'));
                return;
              }
              if (await checkAbort()) {
                reject(new AnalysisAbortError());
              } else {
                scheduleCheck();
              }
            } catch (dbErr) {
              console.warn('[raceWithAbort] DB error during abort check — continuing:', dbErr);
              scheduleCheck(); // DB error — keep running
            }
          }, 3000);
        };
        scheduleCheck();
        fn.then(result => { clearTimeout(timer); resolve(result); })
          .catch(err => { clearTimeout(timer); reject(err); });
      });
    }

    // 2. Per-document extraction
    const allDataPoints: Omit<ExtractedDataPoint, 'id' | 'created_at' | 'updated_at'>[] = [];

    // In resume mode also collect data points already stored from the previous partial run
    if (resumeMode && skippedCount > 0) {
      const { data: prevPoints } = await supabaseAdmin
        .from('extracted_data_points')
        .select('*')
        .eq('research_project_id', projectId);
      if (prevPoints?.length) {
        addLog('info', `Resume: carrying over ${prevPoints.length} data point(s) from previous run`);
        // These are already in the DB — track them so discrepancy detection sees them,
        // but don't re-insert (use a flag to skip the delete-and-reinsert step later).
      }
    }

    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
      const doc = documents[docIndex];
      const docLabel = doc.document_label || doc.original_filename || `Document ${docIndex + 1}`;

      // Check watchdog first (synchronous — no DB call needed)
      if (watchdogFired) {
        addLog('error', `Pipeline watchdog triggered after 30 minutes — stopping at document ${docIndex + 1} of ${documents.length}`);
        await persistLogs();
        throw new Error('Analysis pipeline exceeded the 30-minute watchdog limit and was stopped automatically.');
      }

      // Check for abort request between documents
      if (await checkAbort()) {
        addLog('warn', `Analysis aborted by user after ${docIndex} of ${documents.length} documents`);
        await persistLogs({ abort_completed: true, aborted_at: new Date().toISOString() });
        throw new AnalysisAbortError();
      }

      addLog('info', `Processing document ${docIndex + 1}/${documents.length}: "${docLabel}"`, `Type: ${doc.document_type || 'unknown'}, Size: ${doc.extracted_text?.length || 0} chars`);

      // Mark document as analyzing
      await supabaseAdmin.from('research_documents').update({
        processing_status: 'analyzing',
        updated_at: new Date().toISOString(),
      }).eq('id', doc.id);

      try {
        const extracted = await raceWithAbort(
          withDocumentTimeout(
            extractFromDocument(doc, extractCategories),
            docLabel
          )
        );
        allDataPoints.push(...extracted);

        addLog('success', `Extracted ${extracted.length} data points from "${docLabel}"`);

        // Mark document as analyzed
        await supabaseAdmin.from('research_documents').update({
          processing_status: 'analyzed',
          updated_at: new Date().toISOString(),
        }).eq('id', doc.id);

        // Persist logs incrementally so status polling can show them
        await persistLogs();
      } catch (err) {
        const isTimeout = err instanceof Error && err.message.includes('timed out');
        const isAIError = err instanceof AIServiceError;
        const userMsg = isAIError ? err.userMessage : (err instanceof Error ? err.message : String(err));

        addLog('error', `Failed to analyze "${docLabel}"`, userMsg);

        await supabaseAdmin.from('research_documents').update({
          processing_status: 'error',
          processing_error: `Analysis extraction failed: ${userMsg}`,
          updated_at: new Date().toISOString(),
        }).eq('id', doc.id);

        if (isTimeout) {
          addLog('warn', `Document "${docLabel}" was skipped due to timeout — continuing with remaining documents`);
          await persistLogs();
          // Timeouts are non-fatal — skip this document and continue
          continue;
        }

        // If this is a non-transient AI error (auth, usage exhausted), abort the entire pipeline
        if (isAIError && (err.category === 'authentication' || err.category === 'usage_exhausted')) {
          addLog('error', `Fatal AI error [${err.category}] — stopping analysis`, err.userMessage);
          await persistLogs();
          throw err;
        }

        addLog('warn', `Document "${docLabel}" had an error but analysis will continue with remaining documents`);
        await persistLogs();
      }
    }

    addLog('info', `Document extraction complete — ${allDataPoints.length} total data points from ${documents.length} document(s)`);

    // 3. Attempt normalization on extracted values
    let normalizedCount = 0;
    for (const dp of allDataPoints) {
      try {
        dp.normalized_value = attemptNormalization(dp.data_category, dp.raw_value, dp.normalized_value);
        normalizedCount++;
      } catch {
        // Normalization failure is non-fatal — keep the raw values
      }
    }
    addLog('info', `Normalized ${normalizedCount} data points`);

    // 4. Store extracted data points
    if (allDataPoints.length > 0) {
      // Delete previous data points for this project
      await supabaseAdmin
        .from('extracted_data_points')
        .delete()
        .eq('research_project_id', projectId);

      // Insert in batches of 50
      for (let i = 0; i < allDataPoints.length; i += 50) {
        const batch = allDataPoints.slice(i, i + 50);
        await supabaseAdmin.from('extracted_data_points').insert(batch);
      }
      addLog('success', `Saved ${allDataPoints.length} data points to database`);
    } else {
      addLog('warn', 'No data points were extracted from any document');
    }

    // 5. Cross-reference analysis (if we have data from multiple documents)
    const uniqueDocIds = new Set(allDataPoints.map(dp => dp.document_id));
    let aiDiscrepancies: Omit<Discrepancy, 'id' | 'created_at' | 'updated_at'>[] = [];

    if (uniqueDocIds.size > 1 && allDataPoints.length > 0) {
      addLog('info', `Running cross-reference analysis across ${uniqueDocIds.size} documents`);
      try {
        aiDiscrepancies = await crossReferenceAnalysis(projectId, allDataPoints, documents);
        addLog('info', `Cross-reference analysis found ${aiDiscrepancies.length} discrepanc${aiDiscrepancies.length === 1 ? 'y' : 'ies'}`);
      } catch (err) {
        addLog('warn', 'Cross-reference analysis failed — continuing without it', err instanceof Error ? err.message : String(err));
      }
    } else {
      addLog('info', 'Skipping cross-reference analysis (requires data from 2+ documents)');
    }

    // 6. Mathematical discrepancy detection
    const mathDiscrepancies = detectMathDiscrepancies(projectId, allDataPoints);
    addLog('info', `Mathematical checks found ${mathDiscrepancies.length} discrepanc${mathDiscrepancies.length === 1 ? 'y' : 'ies'}`);

    // 7. Store discrepancies
    const allDiscrepancies = [...aiDiscrepancies, ...mathDiscrepancies];
    if (allDiscrepancies.length > 0) {
      // Delete previous discrepancies
      await supabaseAdmin
        .from('discrepancies')
        .delete()
        .eq('research_project_id', projectId);

      for (let i = 0; i < allDiscrepancies.length; i += 50) {
        const batch = allDiscrepancies.slice(i, i + 50);
        await supabaseAdmin.from('discrepancies').insert(batch);
      }
      addLog('success', `Saved ${allDiscrepancies.length} discrepancies to database`);
    }

    const completedAt = new Date().toISOString();
    addLog('success', `Analysis complete — ${allDataPoints.length} data points, ${allDiscrepancies.length} discrepancies`, `Duration: ${Math.round((new Date(completedAt).getTime() - new Date(analysisStartedAt).getTime()) / 1000)}s`);

    // 8. Update project status to review
    await supabaseAdmin.from('research_projects').update({
      status: 'review',
      analysis_metadata: {
        started_at: analysisStartedAt,
        completed_at: completedAt,
        extract_config: extractCategories,
        data_point_count: allDataPoints.length,
        discrepancy_count: allDiscrepancies.length,
        documents_analyzed: allDocuments.length,
        logs,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', projectId);

    clearInterval(heartbeatTimer);
    clearTimeout(watchdogTimer);

    return {
      dataPointCount: allDataPoints.length,
      discrepancyCount: allDiscrepancies.length,
    };

  } catch (err) {
    clearInterval(heartbeatTimer);
    clearTimeout(watchdogTimer);

    // Handle abort gracefully
    if (err instanceof AnalysisAbortError) {
      console.log(`[Analysis] User aborted analysis for project ${projectId}`);
      // The DELETE route may have already reset the project to 'configure' and cleared data.
      // Only update if the project is still in 'analyzing' state (i.e., abort was internal).
      const { data: currentState } = await supabaseAdmin
        .from('research_projects')
        .select('status')
        .eq('id', projectId)
        .single();
      if (currentState?.status === 'analyzing') {
        // Internal abort (e.g., between documents) — reset cleanly ourselves
        await Promise.all([
          supabaseAdmin.from('research_projects').update({
            status: 'configure',
            analysis_metadata: { aborted_at: new Date().toISOString(), abort_requested: true },
            updated_at: new Date().toISOString(),
          }).eq('id', projectId),
          supabaseAdmin.from('extracted_data_points').delete().eq('research_project_id', projectId),
          supabaseAdmin.from('discrepancies').delete().eq('research_project_id', projectId),
          supabaseAdmin
            .from('research_documents')
            .update({ processing_status: 'extracted', updated_at: new Date().toISOString() })
            .eq('research_project_id', projectId)
            .eq('processing_status', 'analyzing'),
        ]);
      }
      // If already 'configure', the DELETE route handled it — nothing more to do.
      return { dataPointCount: 0, discrepancyCount: 0 };
    }

    // On failure, set project back to configure so user can retry
    const isAIError = err instanceof AIServiceError;
    const errorMsg = isAIError ? err.userMessage : (err instanceof Error ? err.message : String(err));
    const errorCategory = isAIError ? err.category : 'unknown';
    const technicalMsg = err instanceof Error ? err.message : String(err);

    addLog('error', `Analysis pipeline failed [${errorCategory}]`, technicalMsg);
    console.error(`[Analysis] Pipeline failed for project ${projectId} [${errorCategory}]:`, technicalMsg);

    await supabaseAdmin.from('research_projects').update({
      status: 'configure',
      analysis_metadata: {
        error: errorMsg,
        error_category: errorCategory,
        technical_error: technicalMsg,
        failed_at: new Date().toISOString(),
        logs,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', projectId);

    throw err;
  }
}

// ── Per-Document Extraction ─────────────────────────────────────────────────

async function extractFromDocument(
  doc: ResearchDocument,
  extractCategories: Record<string, boolean>
): Promise<Omit<ExtractedDataPoint, 'id' | 'created_at' | 'updated_at'>[]> {
  const text = doc.extracted_text;
  if (!text || text.trim().length < 20) return [];

  // Build config description for the AI
  const enabledCategories = Object.entries(extractCategories)
    .filter(([, v]) => v)
    .map(([k]) => k.replace(/_/g, ' '))
    .join(', ');

  const userContent = `Document type: ${doc.document_type || 'unknown'}
Document label: ${doc.document_label || doc.original_filename || 'Untitled'}
Extract these categories: ${enabledCategories}

DOCUMENT TEXT:
${text.substring(0, 15000)}`;

  const result = await callAI({
    promptKey: 'DATA_EXTRACTOR',
    userContent,
    maxTokens: 8192,
  });

  const data = result.response as {
    data_points?: Array<{
      data_category?: string;
      raw_value?: string;
      normalized_value?: Record<string, unknown>;
      display_value?: string;
      source_page?: number;
      source_location?: string;
      source_text_excerpt?: string;
      sequence_order?: number;
      sequence_group?: string;
      extraction_confidence?: number;
      confidence_reasoning?: string;
    }>;
  };

  if (!data?.data_points || !Array.isArray(data.data_points)) return [];

  return data.data_points.map((dp, idx) => ({
    research_project_id: doc.research_project_id,
    document_id: doc.id,
    data_category: (dp.data_category || 'other') as DataCategory,
    raw_value: dp.raw_value || '',
    normalized_value: dp.normalized_value || null,
    display_value: dp.display_value || dp.raw_value || '',
    unit: null,
    source_page: dp.source_page || null,
    source_location: dp.source_location || null,
    source_bounding_box: null,
    source_text_excerpt: dp.source_text_excerpt || null,
    sequence_order: dp.sequence_order ?? idx,
    sequence_group: dp.sequence_group || null,
    extraction_confidence: dp.extraction_confidence ?? null,
    confidence_reasoning: dp.confidence_reasoning || null,
  }));
}

// ── Normalization Attempt ───────────────────────────────────────────────────

function attemptNormalization(
  category: DataCategory,
  rawValue: string,
  existingNormalized: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  // If the AI already gave us a normalized_value, try to enhance it with code normalization
  const existing = existingNormalized || {};

  try {
    switch (category) {
      case 'bearing': {
        const normalized = normalizeBearing(rawValue);
        return { ...existing, ...normalized };
      }
      case 'distance': {
        const normalized = normalizeDistance(rawValue);
        return { ...existing, ...normalized };
      }
      case 'call': {
        // Calls are complex — try to parse bearing+distance from raw
        const result: Record<string, unknown> = { ...existing };
        try {
          // Try to find bearing in the raw text
          const bearingMatch = rawValue.match(/[NS]\s*\d+.*?[EW]/i);
          if (bearingMatch) {
            result.bearing = normalizeBearing(bearingMatch[0]);
          }
        } catch { /* ignore */ }
        try {
          // Try to find distance in the raw text
          const distMatch = rawValue.match(/(\d+(?:\.\d+)?)\s*(feet|foot|ft|'|varas|chains)/i);
          if (distMatch) {
            result.distance = normalizeDistance(distMatch[0]);
          }
        } catch { /* ignore */ }
        return result;
      }
      case 'curve_data': {
        // Try to parse delta angle if present
        const result: Record<string, unknown> = { ...existing };
        try {
          const deltaMatch = rawValue.match(/delta.*?(\d+\s*[°\s-]+\s*\d+\s*['\s-]+\s*\d+(?:\.\d+)?)/i);
          if (deltaMatch) {
            result.delta_angle = parseDMS(deltaMatch[1]);
          }
        } catch { /* ignore */ }
        return result;
      }
      case 'area': {
        try {
          const parsed = parseArea(rawValue);
          return { ...existing, ...parsed };
        } catch {
          return existing;
        }
      }
      default:
        return existingNormalized || null;
    }
  } catch {
    return existingNormalized || null;
  }
}

// ── Cross-Reference Analysis ────────────────────────────────────────────────

async function crossReferenceAnalysis(
  projectId: string,
  dataPoints: Omit<ExtractedDataPoint, 'id' | 'created_at' | 'updated_at'>[],
  documents: ResearchDocument[]
): Promise<Omit<Discrepancy, 'id' | 'created_at' | 'updated_at'>[]> {
  // Build a summary grouped by data category
  const docMap = new Map(documents.map(d => [d.id, d.document_label || d.original_filename || 'Untitled']));

  const summary = dataPoints.reduce((acc, dp) => {
    if (!acc[dp.data_category]) acc[dp.data_category] = [];
    acc[dp.data_category].push({
      document: docMap.get(dp.document_id) || 'Unknown',
      document_id: dp.document_id,
      raw_value: dp.raw_value,
      normalized_value: dp.normalized_value,
      sequence_order: dp.sequence_order,
      sequence_group: dp.sequence_group,
    });
    return acc;
  }, {} as Record<string, unknown[]>);

  // Truncate the summary to fit in context
  const summaryStr = JSON.stringify(summary).substring(0, 12000);

  const result = await callAI({
    promptKey: 'CROSS_REFERENCE_ANALYZER',
    userContent: `Compare these extractions from ${documents.length} documents and identify any discrepancies, contradictions, or confirmations:\n\n${summaryStr}`,
    maxTokens: 8192,
  });

  const data = result.response as {
    discrepancies?: Array<{
      severity?: string;
      probable_cause?: string;
      title?: string;
      description?: string;
      ai_recommendation?: string;
      affects_boundary?: boolean;
      affects_area?: boolean;
      affects_closure?: boolean;
      estimated_impact?: string;
      data_point_ids?: string[];
      document_ids?: string[];
    }>;
  };

  if (!data?.discrepancies || !Array.isArray(data.discrepancies)) return [];

  return data.discrepancies.map(d => ({
    research_project_id: projectId,
    severity: (d.severity || 'info') as DiscrepancySeverity,
    probable_cause: (d.probable_cause || 'unknown') as ProbableCause,
    title: d.title || 'Untitled discrepancy',
    description: d.description || '',
    ai_recommendation: d.ai_recommendation || null,
    data_point_ids: d.data_point_ids || [],
    document_ids: d.document_ids || [],
    affects_boundary: d.affects_boundary ?? false,
    affects_area: d.affects_area ?? false,
    affects_closure: d.affects_closure ?? false,
    estimated_impact: d.estimated_impact || null,
    resolution_status: 'open' as const,
    resolved_by: null,
    resolution_notes: null,
    resolved_value: null,
    resolved_at: null,
  }));
}

// ── Mathematical Discrepancy Detection ──────────────────────────────────────

function detectMathDiscrepancies(
  projectId: string,
  dataPoints: Omit<ExtractedDataPoint, 'id' | 'created_at' | 'updated_at'>[]
): Omit<Discrepancy, 'id' | 'created_at' | 'updated_at'>[] {
  const discrepancies: Omit<Discrepancy, 'id' | 'created_at' | 'updated_at'>[] = [];

  // ── Check traverse closure ──
  const callPoints = dataPoints
    .filter(dp => dp.data_category === 'call' && dp.normalized_value)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));

  if (callPoints.length >= 3) {
    try {
      const calls = callPoints.map(cp => cp.normalized_value as unknown as NormalizedCall).filter(Boolean);
      if (calls.length >= 3) {
        const closure = calculateTraverseClosure(calls);

        if (closure.misclosure > 0.1) {
          const ratio = Math.round(closure.ratio);
          let severity: DiscrepancySeverity = 'info';
          let probableCause: ProbableCause = 'rounding_difference';

          if (ratio < 10000) {
            severity = 'error';
            probableCause = 'surveying_error';
          } else if (ratio < 25000) {
            severity = 'discrepancy';
            probableCause = 'rounding_difference';
          }

          discrepancies.push({
            research_project_id: projectId,
            severity,
            probable_cause: probableCause,
            title: `Traverse misclosure: ${closure.misclosure.toFixed(3)} ft (1:${ratio})`,
            description: `The boundary calls do not close. Misclosure distance is ${closure.misclosure.toFixed(3)} feet with a precision ratio of 1:${ratio}. Texas minimum standard for rural surveys is 1:10,000; for urban surveys 1:25,000.`,
            ai_recommendation: ratio < 10000
              ? 'This closure exceeds the minimum Texas standard. Review all bearing and distance values for transposition or transcription errors.'
              : 'Closure is within acceptable limits but notable. Verify the most uncertain calls.',
            data_point_ids: [],
            document_ids: [],
            affects_boundary: true,
            affects_area: true,
            affects_closure: true,
            estimated_impact: `Misclosure: ${closure.misclosure.toFixed(3)} ft`,
            resolution_status: 'open',
            resolved_by: null,
            resolution_notes: null,
            resolved_value: null,
            resolved_at: null,
          });
        }
      }
    } catch (err) {
      // Closure check failed — not a fatal error
      console.warn('[Analysis] Traverse closure check failed:', err);
    }
  }

  // ── Check curve data consistency ──
  const curvePoints = dataPoints.filter(dp => dp.data_category === 'curve_data' && dp.normalized_value);
  for (const cp of curvePoints) {
    try {
      const curve = cp.normalized_value as unknown as NormalizedCurveData;
      if (curve.radius && curve.arc_length && curve.delta_angle) {
        const check = validateCurveData(curve);
        if (!check.valid) {
          discrepancies.push({
            research_project_id: projectId,
            severity: 'discrepancy',
            probable_cause: 'rounding_difference',
            title: 'Curve data inconsistency',
            description: `Arc length ${curve.arc_length} doesn't match computed arc from radius (${curve.radius}) and delta angle (${check.computedArc.toFixed(2)}). Difference: ${check.discrepancy.toFixed(3)} feet.`,
            ai_recommendation: 'Verify the radius, arc length, and delta angle. One of these values may have a transcription error.',
            data_point_ids: [],
            document_ids: [cp.document_id],
            affects_boundary: true,
            affects_area: false,
            affects_closure: true,
            estimated_impact: `${check.discrepancy.toFixed(3)} ft difference`,
            resolution_status: 'open',
            resolved_by: null,
            resolution_notes: null,
            resolved_value: null,
            resolved_at: null,
          });
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // ── Check bearing consistency across documents ──
  const bearingsByGroup = new Map<string, typeof dataPoints>();
  for (const dp of dataPoints.filter(d => d.data_category === 'bearing' && d.normalized_value)) {
    const group = dp.sequence_group || 'main';
    const key = `${group}:${dp.sequence_order ?? 0}`;
    if (!bearingsByGroup.has(key)) bearingsByGroup.set(key, []);
    bearingsByGroup.get(key)!.push(dp);
  }

  for (const [key, group] of bearingsByGroup) {
    if (group.length < 2) continue;

    try {
      const bearings = group
        .map(dp => {
          const nv = dp.normalized_value as Record<string, unknown> | null;
          if (nv && typeof nv.azimuth === 'number') return nv as unknown as NormalizedBearing;
          try { return normalizeBearing(dp.raw_value); } catch { return null; }
        })
        .filter(Boolean) as NormalizedBearing[];

      if (bearings.length < 2) continue;

      for (let i = 1; i < bearings.length; i++) {
        const diff = bearingDifferenceArcSeconds(bearings[0], bearings[i]);

        if (bearingsOpposite(bearings[0], bearings[i])) {
          discrepancies.push({
            research_project_id: projectId,
            severity: 'error',
            probable_cause: 'clerical_error',
            title: `Bearing direction error at call ${key}`,
            description: `Two documents show the same bearing magnitude but in opposite directions: ${bearings[0].raw_text} vs ${bearings[i].raw_text}. This is likely a transcription error.`,
            ai_recommendation: 'One document has the bearing direction wrong. Check the original source documents to determine which is correct.',
            data_point_ids: [],
            document_ids: group.map(g => g.document_id),
            affects_boundary: true,
            affects_area: true,
            affects_closure: true,
            estimated_impact: 'Boundary direction reversed at this call',
            resolution_status: 'open',
            resolved_by: null,
            resolution_notes: null,
            resolved_value: null,
            resolved_at: null,
          });
        } else if (diff > 5) {
          const severity: DiscrepancySeverity = diff > 60 ? 'discrepancy' : 'info';
          discrepancies.push({
            research_project_id: projectId,
            severity,
            probable_cause: diff > 60 ? 'clerical_error' : 'rounding_difference',
            title: `Bearing mismatch at call ${key}: ${diff.toFixed(1)}" difference`,
            description: `Documents show different bearings: ${bearings[0].raw_text} vs ${bearings[i].raw_text}. Difference: ${diff.toFixed(1)} arc-seconds.`,
            ai_recommendation: severity === 'discrepancy'
              ? 'Verify the correct bearing by checking the original source documents.'
              : 'Minor rounding difference, likely not significant.',
            data_point_ids: [],
            document_ids: group.map(g => g.document_id),
            affects_boundary: severity === 'discrepancy',
            affects_area: severity === 'discrepancy',
            affects_closure: severity === 'discrepancy',
            estimated_impact: `${diff.toFixed(1)} arc-seconds`,
            resolution_status: 'open',
            resolved_by: null,
            resolution_notes: null,
            resolved_value: null,
            resolved_at: null,
          });
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return discrepancies;
}

// ── Analysis Status Check ───────────────────────────────────────────────────

export async function getAnalysisStatus(projectId: string): Promise<{
  status: string;
  documentsTotal: number;
  documentsAnalyzed: number;
  dataPointCount: number;
  discrepancyCount: number;
  frozen: boolean;
  error?: string;
  errorCategory?: string;
  logs?: AnalysisLogEntry[];
}> {
  const [projectRes, docsRes, dpRes, discRes] = await Promise.all([
    supabaseAdmin.from('research_projects').select('status, analysis_metadata, updated_at').eq('id', projectId).single(),
    supabaseAdmin.from('research_documents').select('processing_status').eq('research_project_id', projectId),
    supabaseAdmin.from('extracted_data_points').select('id', { count: 'exact', head: true }).eq('research_project_id', projectId),
    supabaseAdmin.from('discrepancies').select('id', { count: 'exact', head: true }).eq('research_project_id', projectId),
  ]);

  const docs: { processing_status: string }[] = docsRes.data || [];
  const analyzed = docs.filter(d => d.processing_status === 'analyzed').length;

  const metadata = projectRes.data?.analysis_metadata as Record<string, unknown> | null;
  const status = projectRes.data?.status || 'unknown';

  // Freeze detection: if still analyzing but updated_at hasn't moved in 90 s,
  // the background process has likely crashed or is stuck on an AI call.
  let frozen = false;
  if (status === 'analyzing' && projectRes.data?.updated_at) {
    const ageMs = Date.now() - new Date(String(projectRes.data.updated_at)).getTime();
    frozen = ageMs > FROZEN_THRESHOLD_MS;
  }

  return {
    status,
    documentsTotal: docs.length,
    documentsAnalyzed: analyzed,
    dataPointCount: dpRes.count || 0,
    discrepancyCount: discRes.count || 0,
    frozen,
    ...(metadata?.error ? { error: String(metadata.error) } : {}),
    ...(metadata?.error_category ? { errorCategory: String(metadata.error_category) } : {}),
    ...(Array.isArray(metadata?.logs) ? { logs: metadata.logs as AnalysisLogEntry[] } : {}),
  };
}
