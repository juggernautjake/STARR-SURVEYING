// lib/research/comparison.service.ts — Drawing-to-source comparison & verification
// Combines deterministic math checks with AI semantic comparison to produce
// an overall confidence score and list of persisting issues.

import { supabaseAdmin } from '@/lib/supabase';
import { callAI, AIServiceError } from './ai-client';
import { computeElementConfidence } from './confidence';
import type {
  DrawingElement,
  RenderedDrawing,
  ExtractedDataPoint,
  Discrepancy,
  ComparisonResult,
  MathCheckSummary,
  PersistingIssue,
} from '@/types/research';

// ── Main Comparison Function ────────────────────────────────────────────────

/**
 * Compare a rendered drawing against all source documents.
 * 1. Run deterministic math checks
 * 2. Call AI for semantic comparison
 * 3. Combine into overall confidence + persisting issues
 * 4. Save results to the drawing record
 */
export async function compareDrawingToSources(
  drawingId: string,
  projectId: string
): Promise<ComparisonResult> {
  // 1. Load all data
  const [drawingRes, elementsRes, dataPointsRes, discrepanciesRes, docsRes] = await Promise.all([
    supabaseAdmin.from('rendered_drawings').select('*').eq('id', drawingId).single(),
    supabaseAdmin.from('drawing_elements').select('*').eq('drawing_id', drawingId).order('z_index'),
    supabaseAdmin.from('extracted_data_points').select('*').eq('research_project_id', projectId),
    supabaseAdmin.from('discrepancies').select('*').eq('research_project_id', projectId),
    supabaseAdmin.from('research_documents').select('id, document_label, document_type, processing_status').eq('research_project_id', projectId),
  ]);

  const drawing = drawingRes.data as RenderedDrawing | null;
  const elements = (elementsRes.data || []) as DrawingElement[];
  const dataPoints = (dataPointsRes.data || []) as ExtractedDataPoint[];
  const discrepancies = (discrepanciesRes.data || []) as Discrepancy[];
  const documents = docsRes.data || [];

  if (!drawing) throw new Error('Drawing not found');

  // 2. Run mathematical checks
  const mathChecks = runMathematicalChecks(elements, dataPoints);

  // 3. Run AI semantic comparison
  const aiResult = await runAIComparison(elements, dataPoints, documents, mathChecks);

  // 4. Compute per-category confidence breakdown
  const breakdown = computeConfidenceBreakdown(elements);

  // 5. Compute overall confidence from weighted factors
  const avgElementConfidence = elements.length > 0
    ? elements.reduce((sum, e) => sum + e.confidence_score, 0) / elements.length
    : 50;

  const mathScore = computeMathScore(mathChecks);
  const aiScore = aiResult.confidence_assessment ?? 70;
  const resolutionScore = computeResolutionCompleteness(discrepancies);

  const overallConfidence = Math.round(
    avgElementConfidence * 0.40 +
    mathScore * 0.25 +
    aiScore * 0.20 +
    resolutionScore * 0.15
  );

  const result: ComparisonResult = {
    overall_confidence: overallConfidence,
    confidence_breakdown: breakdown,
    persisting_issues: aiResult.persisting_issues || [],
    comparison_notes: aiResult.notes || '',
    math_checks: mathChecks,
    ran_at: new Date().toISOString(),
  };

  // 6. Save to drawing record
  await supabaseAdmin
    .from('rendered_drawings')
    .update({
      overall_confidence: overallConfidence,
      confidence_breakdown: breakdown,
      comparison_notes: aiResult.notes,
      status: 'verified',
      updated_at: new Date().toISOString(),
    })
    .eq('id', drawingId);

  // 7. Update project status to verifying
  await supabaseAdmin
    .from('research_projects')
    .update({ status: 'verifying', updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return result;
}

// ── Mathematical Checks ─────────────────────────────────────────────────────

function runMathematicalChecks(
  elements: DrawingElement[],
  dataPoints: ExtractedDataPoint[]
): MathCheckSummary {
  // Boundary elements for closure calculation
  const boundaryElements = elements.filter(e =>
    e.feature_class === 'property_boundary' && (e.element_type === 'line' || e.element_type === 'curve')
  );

  // Calculate closure from boundary geometry
  let closurePrecision: number | null = null;
  let closureMisclosure: number | null = null;

  if (boundaryElements.length >= 3) {
    const { misclosure, totalDistance } = calculateClosure(boundaryElements);
    closureMisclosure = misclosure;
    closurePrecision = totalDistance > 0 ? Math.round(totalDistance / Math.max(misclosure, 0.001)) : null;
  }

  // Area comparison
  const areaDataPoints = dataPoints.filter(dp => dp.data_category === 'area');
  const statedArea = areaDataPoints.length > 0
    ? parseAreaAcres(areaDataPoints[0])
    : null;

  const computedArea = boundaryElements.length >= 3
    ? calculateAreaFromElements(boundaryElements)
    : null;

  const areaDiff = statedArea !== null && computedArea !== null
    ? Math.abs(computedArea - statedArea)
    : null;

  // Call verification — count how many source calls appear in drawing
  const callDataPoints = dataPoints.filter(dp =>
    dp.data_category === 'call' || dp.data_category === 'bearing' || dp.data_category === 'distance'
  );
  const callsTotal = callDataPoints.length;
  const callsVerified = countVerifiedCalls(callDataPoints, elements);

  // Continuity — do adjacent boundary lines share endpoints?
  const continuityOk = checkLineContinuity(boundaryElements);

  return {
    closure_precision: closurePrecision,
    closure_misclosure_ft: closureMisclosure,
    area_computed_acres: computedArea,
    area_stated_acres: statedArea,
    area_difference_acres: areaDiff,
    calls_verified: callsVerified,
    calls_total: callsTotal,
    continuity_ok: continuityOk,
  };
}

// ── Math Helpers ────────────────────────────────────────────────────────────

function calculateClosure(boundaryElements: DrawingElement[]): { misclosure: number; totalDistance: number } {
  let totalDistance = 0;
  const lines = boundaryElements.filter(e => e.geometry.type === 'line');

  if (lines.length === 0) return { misclosure: 0, totalDistance: 0 };

  // Sum all line segment lengths
  for (const el of lines) {
    if (el.geometry.type === 'line') {
      const dx = el.geometry.end[0] - el.geometry.start[0];
      const dy = el.geometry.end[1] - el.geometry.start[1];
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
  }

  // Check closure: first point of first line vs last point of last line
  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];
  if (firstLine.geometry.type === 'line' && lastLine.geometry.type === 'line') {
    const dx = lastLine.geometry.end[0] - firstLine.geometry.start[0];
    const dy = lastLine.geometry.end[1] - firstLine.geometry.start[1];
    const misclosure = Math.sqrt(dx * dx + dy * dy);
    return { misclosure, totalDistance };
  }

  return { misclosure: 0, totalDistance };
}

function parseAreaAcres(dp: ExtractedDataPoint): number | null {
  const norm = dp.normalized_value as { value?: number; unit?: string } | null;
  if (!norm || typeof norm.value !== 'number') return null;
  if (norm.unit === 'sqft' || norm.unit === 'square_feet') return norm.value / 43560;
  return norm.value; // assume acres
}

function calculateAreaFromElements(boundaryElements: DrawingElement[]): number | null {
  const lines = boundaryElements.filter(e => e.geometry.type === 'line');
  if (lines.length < 3) return null;

  // Shoelace formula for polygon area
  const points: [number, number][] = [];
  for (const el of lines) {
    if (el.geometry.type === 'line') {
      points.push(el.geometry.start);
    }
  }
  if (points.length < 3) return null;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  area = Math.abs(area) / 2;

  // Convert from drawing units (assumed feet) to acres
  return area / 43560;
}

function countVerifiedCalls(callDataPoints: ExtractedDataPoint[], elements: DrawingElement[]): number {
  // Count data points that have a matching element
  let verified = 0;
  for (const dp of callDataPoints) {
    const hasElement = elements.some(e => e.data_point_ids.includes(dp.id));
    if (hasElement) verified++;
  }
  return verified;
}

function checkLineContinuity(boundaryElements: DrawingElement[]): boolean {
  const lines = boundaryElements.filter(e => e.geometry.type === 'line');
  if (lines.length < 2) return true;

  const TOLERANCE = 0.5; // feet
  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    if (current.geometry.type === 'line' && next.geometry.type === 'line') {
      const dx = current.geometry.end[0] - next.geometry.start[0];
      const dy = current.geometry.end[1] - next.geometry.start[1];
      if (Math.sqrt(dx * dx + dy * dy) > TOLERANCE) return false;
    }
  }
  return true;
}

// ── AI Comparison ───────────────────────────────────────────────────────────

interface AIComparisonResponse {
  confidence_assessment: number;
  persisting_issues: PersistingIssue[];
  notes: string;
}

async function runAIComparison(
  elements: DrawingElement[],
  dataPoints: ExtractedDataPoint[],
  documents: { id: string; document_label: string | null; document_type: string | null }[],
  mathChecks: MathCheckSummary
): Promise<AIComparisonResponse> {
  // Summarize drawing for AI
  const drawingSummary = {
    element_count: elements.length,
    boundary_lines: elements.filter(e => e.feature_class === 'property_boundary').length,
    monuments: elements.filter(e => e.feature_class === 'monument').length,
    easements: elements.filter(e => e.feature_class === 'easement').length,
    labels: elements.filter(e => e.element_type === 'label').length,
    avg_confidence: elements.length > 0
      ? Math.round(elements.reduce((s, e) => s + e.confidence_score, 0) / elements.length)
      : 0,
    low_confidence_elements: elements
      .filter(e => e.confidence_score < 60)
      .map(e => ({
        type: e.element_type,
        feature: e.feature_class,
        confidence: e.confidence_score,
        report: e.ai_report,
      })),
  };

  const sourceSummary = {
    document_count: documents.length,
    documents: documents.map(d => ({ label: d.document_label, type: d.document_type })),
    data_point_count: dataPoints.length,
    call_count: dataPoints.filter(dp => dp.data_category === 'call').length,
    bearing_count: dataPoints.filter(dp => dp.data_category === 'bearing').length,
    monument_count: dataPoints.filter(dp => dp.data_category === 'monument').length,
  };

  try {
    const aiResult = await callAI({
      promptKey: 'DRAWING_COMPARATOR',
      userContent: JSON.stringify({
        drawing_summary: drawingSummary,
        source_data: sourceSummary,
        math_check_results: mathChecks,
      }),
      maxTokens: 4096,
    });

    const resp = aiResult.response as AIComparisonResponse;
    return {
      confidence_assessment: typeof resp?.confidence_assessment === 'number' ? resp.confidence_assessment : 70,
      persisting_issues: Array.isArray(resp?.persisting_issues) ? resp.persisting_issues : [],
      notes: typeof resp?.notes === 'string' ? resp.notes : 'Comparison completed.',
    };
  } catch (err) {
    // Produce a specific fallback message depending on what went wrong
    const isAIError = err instanceof AIServiceError;
    const reasonDetail = isAIError ? err.userMessage : 'An unexpected error occurred.';
    const category = isAIError ? err.category : 'unknown';

    return {
      confidence_assessment: 70,
      persisting_issues: [{
        severity: 'info',
        title: `AI comparison unavailable (${category === 'rate_limited' ? 'rate limited' : category === 'usage_exhausted' ? 'usage limit reached' : category === 'connectivity' ? 'connection issue' : category === 'timeout' ? 'request timed out' : 'service error'})`,
        description: `The AI semantic comparison could not be completed. ${reasonDetail} Mathematical checks were still performed and results below are based on those checks only.`,
        recommendation: category === 'usage_exhausted'
          ? 'Check your Anthropic API billing and usage limits, then re-run verification.'
          : category === 'authentication'
          ? 'Verify the AI API key configuration with your administrator.'
          : 'Try running verification again in a few minutes. If the issue persists, mathematical checks alone may suffice.',
      }],
      notes: `AI comparison unavailable (${category}). Results are based on mathematical checks only.`,
    };
  }
}

// ── Score Computation ───────────────────────────────────────────────────────

function computeMathScore(checks: MathCheckSummary): number {
  let score = 70; // base

  // Closure precision bonus/penalty
  if (checks.closure_precision !== null) {
    if (checks.closure_precision >= 25000) score += 15;
    else if (checks.closure_precision >= 10000) score += 10;
    else if (checks.closure_precision >= 5000) score += 5;
    else if (checks.closure_precision < 2000) score -= 15;
  }

  // Area match bonus/penalty
  if (checks.area_difference_acres !== null) {
    if (checks.area_difference_acres < 0.01) score += 10;
    else if (checks.area_difference_acres < 0.05) score += 5;
    else if (checks.area_difference_acres > 0.1) score -= 10;
  }

  // Call verification
  if (checks.calls_total > 0) {
    const ratio = checks.calls_verified / checks.calls_total;
    if (ratio >= 0.95) score += 5;
    else if (ratio < 0.7) score -= 10;
  }

  // Continuity
  if (!checks.continuity_ok) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function computeResolutionCompleteness(discrepancies: Discrepancy[]): number {
  if (discrepancies.length === 0) return 90; // no issues is good

  const resolved = discrepancies.filter(d =>
    d.resolution_status === 'resolved' || d.resolution_status === 'accepted'
  ).length;
  const ratio = resolved / discrepancies.length;
  return Math.round(ratio * 100);
}

function computeConfidenceBreakdown(elements: DrawingElement[]): ComparisonResult['confidence_breakdown'] {
  const byCategory = (featureClass: string) => {
    const matching = elements.filter(e => e.feature_class === featureClass);
    if (matching.length === 0) return 75; // neutral default
    return Math.round(matching.reduce((s, e) => s + e.confidence_score, 0) / matching.length);
  };

  return {
    boundary_accuracy: byCategory('property_boundary'),
    monument_accuracy: byCategory('monument'),
    easement_accuracy: byCategory('easement'),
    area_accuracy: 75, // computed from math checks, default
    closure_quality: 75, // computed from math checks, default
  };
}
