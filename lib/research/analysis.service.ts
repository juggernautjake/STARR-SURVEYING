// lib/research/analysis.service.ts — AI Analysis Engine orchestration
// Coordinates per-document extraction, cross-referencing, normalization, and discrepancy detection.
import { supabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
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
  coordinates: false,
  elevations: false,
  zoning: false,
  flood_zone: false,
  utilities: false,
};

// ── Main Analysis Pipeline ──────────────────────────────────────────────────

/**
 * Run the full analysis pipeline for a research project.
 * This is async and can take several minutes for many documents.
 *
 * Steps:
 * 1. Load all extracted documents
 * 2. Per-document AI extraction
 * 3. Normalize extracted values
 * 4. Cross-reference analysis
 * 5. Mathematical discrepancy detection
 * 6. Store all results
 */
export async function analyzeProject(
  projectId: string,
  config?: Partial<AnalysisConfig>
): Promise<{ dataPointCount: number; discrepancyCount: number }> {
  const extractCategories = config?.extractCategories || DEFAULT_EXTRACT_CONFIG;

  // Update project status to analyzing
  await supabaseAdmin.from('research_projects').update({
    status: 'analyzing',
    analysis_metadata: {
      started_at: new Date().toISOString(),
      extract_config: extractCategories,
    },
    updated_at: new Date().toISOString(),
  }).eq('id', projectId);

  try {
    // 1. Load all documents with extracted text
    const { data: documents } = await supabaseAdmin
      .from('research_documents')
      .select('*')
      .eq('research_project_id', projectId)
      .in('processing_status', ['extracted', 'analyzed'])
      .order('created_at');

    if (!documents || documents.length === 0) {
      throw new Error('No processed documents found for analysis');
    }

    // 2. Per-document extraction
    const allDataPoints: Omit<ExtractedDataPoint, 'id' | 'created_at' | 'updated_at'>[] = [];

    for (const doc of documents) {
      // Mark document as analyzing
      await supabaseAdmin.from('research_documents').update({
        processing_status: 'analyzing',
        updated_at: new Date().toISOString(),
      }).eq('id', doc.id);

      try {
        const extracted = await extractFromDocument(doc, extractCategories);
        allDataPoints.push(...extracted);

        // Mark document as analyzed
        await supabaseAdmin.from('research_documents').update({
          processing_status: 'analyzed',
          updated_at: new Date().toISOString(),
        }).eq('id', doc.id);
      } catch (err) {
        console.error(`[Analysis] Extraction failed for doc ${doc.id}:`, err);
        await supabaseAdmin.from('research_documents').update({
          processing_status: 'error',
          processing_error: `Analysis extraction failed: ${err instanceof Error ? err.message : String(err)}`,
          updated_at: new Date().toISOString(),
        }).eq('id', doc.id);
      }
    }

    // 3. Attempt normalization on extracted values
    for (const dp of allDataPoints) {
      try {
        dp.normalized_value = attemptNormalization(dp.data_category, dp.raw_value, dp.normalized_value);
      } catch {
        // Normalization failure is non-fatal — keep the raw values
      }
    }

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
    }

    // 5. Cross-reference analysis (if we have data from multiple documents)
    const uniqueDocIds = new Set(allDataPoints.map(dp => dp.document_id));
    let aiDiscrepancies: Omit<Discrepancy, 'id' | 'created_at' | 'updated_at'>[] = [];

    if (uniqueDocIds.size > 1 && allDataPoints.length > 0) {
      aiDiscrepancies = await crossReferenceAnalysis(projectId, allDataPoints, documents);
    }

    // 6. Mathematical discrepancy detection
    const mathDiscrepancies = detectMathDiscrepancies(projectId, allDataPoints);

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
    }

    // 8. Update project status to review
    await supabaseAdmin.from('research_projects').update({
      status: 'review',
      analysis_metadata: {
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        extract_config: extractCategories,
        data_point_count: allDataPoints.length,
        discrepancy_count: allDiscrepancies.length,
        documents_analyzed: documents.length,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', projectId);

    return {
      dataPointCount: allDataPoints.length,
      discrepancyCount: allDiscrepancies.length,
    };

  } catch (err) {
    // On failure, set project back to configure so user can retry
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Analysis] Pipeline failed for project ${projectId}:`, errorMsg);

    await supabaseAdmin.from('research_projects').update({
      status: 'configure',
      analysis_metadata: {
        error: errorMsg,
        failed_at: new Date().toISOString(),
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
}> {
  const [projectRes, docsRes, dpRes, discRes] = await Promise.all([
    supabaseAdmin.from('research_projects').select('status, analysis_metadata').eq('id', projectId).single(),
    supabaseAdmin.from('research_documents').select('processing_status').eq('research_project_id', projectId),
    supabaseAdmin.from('extracted_data_points').select('id', { count: 'exact', head: true }).eq('research_project_id', projectId),
    supabaseAdmin.from('discrepancies').select('id', { count: 'exact', head: true }).eq('research_project_id', projectId),
  ]);

  const docs = docsRes.data || [];
  const analyzed = docs.filter(d => d.processing_status === 'analyzed').length;

  return {
    status: projectRes.data?.status || 'unknown',
    documentsTotal: docs.length,
    documentsAnalyzed: analyzed,
    dataPointCount: dpRes.count || 0,
    discrepancyCount: discRes.count || 0,
  };
}
