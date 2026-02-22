// lib/research/drawing.service.ts — Drawing creation and element management
// Orchestrates: traverse computation → element building → confidence scoring → AI reports → DB save
import { supabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import type {
  ExtractedDataPoint,
  Discrepancy,
  RenderedDrawing,
  DrawingElement,
  CanvasConfig,
} from '@/types/research';
import type { NormalizedCall } from './normalization';
import {
  computeTraverse,
  buildElementsFromAnalysis,
  computeBoundingBox,
  computeScale,
  type DrawingElementInput,
  type DrawingConfig,
  DEFAULT_DRAWING_CONFIG,
} from './geometry.engine';
import {
  computeConfidenceFactors,
  computeElementConfidence,
} from './confidence';

// ── Create Drawing ───────────────────────────────────────────────────────────

/**
 * Create a new drawing for a research project.
 * 1. Load analyzed data points and discrepancies
 * 2. Build NormalizedCall array from call data points
 * 3. Compute traverse (geometry engine)
 * 4. Build drawing elements with confidence scores
 * 5. Generate AI reports for each element
 * 6. Save to rendered_drawings + drawing_elements tables
 */
export async function createDrawing(
  projectId: string,
  options: {
    name?: string;
    drawingTemplateId?: string;
    config?: Partial<DrawingConfig>;
  } = {}
): Promise<{ drawingId: string; elementCount: number }> {
  // 1. Load project data
  const [dataPointsResult, discrepanciesResult, templateResult] = await Promise.all([
    supabaseAdmin
      .from('extracted_data_points')
      .select('*')
      .eq('research_project_id', projectId)
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('discrepancies')
      .select('*')
      .eq('research_project_id', projectId),
    options.drawingTemplateId
      ? supabaseAdmin.from('drawing_templates').select('*').eq('id', options.drawingTemplateId).single()
      : supabaseAdmin.from('drawing_templates').select('*').eq('is_default', true).limit(1).single(),
  ]);

  const dataPoints: ExtractedDataPoint[] = dataPointsResult.data || [];
  const discrepancies: Discrepancy[] = discrepanciesResult.data || [];
  const template = templateResult.data;

  // 2. Extract NormalizedCall sequence from call data points
  const calls = buildCallSequence(dataPoints);

  // 3. Compute traverse
  const traverseResult = computeTraverse(calls);

  // Merge config from template and options
  const drawingConfig: DrawingConfig = {
    ...DEFAULT_DRAWING_CONFIG,
    ...(template?.label_config ? { label_config: { ...DEFAULT_DRAWING_CONFIG.label_config, ...template.label_config } } : {}),
    ...(template?.feature_styles ? { feature_styles: { ...DEFAULT_DRAWING_CONFIG.feature_styles, ...template.feature_styles } } : {}),
    ...options.config,
  };

  // 4. Build drawing elements
  const elements = buildElementsFromAnalysis(
    traverseResult,
    dataPoints,
    discrepancies,
    drawingConfig
  );

  // 5. Update confidence scores with closure data
  const closurePrecision = traverseResult.closure.precision_ratio;
  for (const el of elements) {
    const relatedDps = dataPoints.filter(dp => el.data_point_ids.includes(dp.id));
    const relatedDisc = discrepancies.filter(d => el.discrepancy_ids.includes(d.id));

    el.confidence_factors = computeConfidenceFactors(relatedDps, relatedDisc, {
      closurePrecision,
      multiDocumentMatch: hasMultiDocumentMatch(relatedDps),
    });
    el.confidence_score = computeElementConfidence(el.confidence_factors);
  }

  // 6. Generate AI reports (batch)
  await generateElementReports(elements, dataPoints, discrepancies);

  // 7. Compute canvas configuration
  const bbox = computeBoundingBox(traverseResult.points);
  const canvasWidth = 3600;
  const canvasHeight = 2400;
  const scale = computeScale(traverseResult.points, canvasWidth, canvasHeight);

  const canvasConfig: CanvasConfig = {
    width: canvasWidth,
    height: canvasHeight,
    scale: Math.round(1 / scale),
    units: 'feet',
    origin: [Math.round(-bbox.minX * scale + 100), Math.round(bbox.maxY * scale + 100)],
    background: '#FFFFFF',
  };

  // 8. Get next version number
  const { count: existingCount } = await supabaseAdmin
    .from('rendered_drawings')
    .select('id', { count: 'exact', head: true })
    .eq('research_project_id', projectId);

  const version = (existingCount || 0) + 1;

  // 9. Save drawing
  const { data: drawing, error: drawingError } = await supabaseAdmin
    .from('rendered_drawings')
    .insert({
      research_project_id: projectId,
      drawing_template_id: options.drawingTemplateId || template?.id || null,
      name: options.name || `Drawing v${version}`,
      version,
      status: 'rendering',
      canvas_config: canvasConfig,
      title_block: template?.title_block || {},
      overall_confidence: null,
      confidence_breakdown: null,
      comparison_notes: null,
    })
    .select('id')
    .single();

  if (drawingError || !drawing) {
    throw new Error(`Failed to create drawing: ${drawingError?.message || 'unknown error'}`);
  }

  const drawingId = drawing.id;

  // 10. Save all elements
  const elementRows = elements.map((el, idx) => ({
    drawing_id: drawingId,
    element_type: el.element_type,
    feature_class: el.feature_class,
    geometry: el.geometry,
    svg_path: el.svg_path || null,
    attributes: el.attributes,
    style: el.feature_class in drawingConfig.feature_styles
      ? {
          stroke: drawingConfig.feature_styles[el.feature_class]?.stroke || '#000000',
          strokeWidth: drawingConfig.feature_styles[el.feature_class]?.strokeWidth || 1,
          strokeDasharray: drawingConfig.feature_styles[el.feature_class]?.dasharray || '',
          fill: drawingConfig.feature_styles[el.feature_class]?.fill || 'none',
          opacity: 1,
        }
      : { stroke: '#000000', strokeWidth: 1, strokeDasharray: '', fill: 'none', opacity: 1 },
    layer: el.layer,
    z_index: el.z_index,
    visible: el.visible,
    locked: el.locked,
    confidence_score: el.confidence_score,
    confidence_factors: el.confidence_factors,
    ai_report: el.ai_report || null,
    source_references: el.source_references,
    data_point_ids: el.data_point_ids,
    discrepancy_ids: el.discrepancy_ids,
    user_modified: false,
    user_notes: null,
  }));

  // Insert in batches of 50
  for (let i = 0; i < elementRows.length; i += 50) {
    const batch = elementRows.slice(i, i + 50);
    const { error: elError } = await supabaseAdmin
      .from('drawing_elements')
      .insert(batch);

    if (elError) {
      console.error(`[Drawing Service] Error inserting element batch ${i}:`, elError.message);
    }
  }

  // 11. Compute overall confidence and update drawing
  const overallConfidence = elements.length > 0
    ? Math.round(elements.reduce((sum, el) => sum + el.confidence_score, 0) / elements.length)
    : 0;

  const confidenceBreakdown: Record<string, number> = {};
  const featureGroups: Record<string, number[]> = {};
  for (const el of elements) {
    if (!featureGroups[el.feature_class]) featureGroups[el.feature_class] = [];
    featureGroups[el.feature_class].push(el.confidence_score);
  }
  for (const [fc, scores] of Object.entries(featureGroups)) {
    confidenceBreakdown[fc] = Math.round(
      scores.reduce((a, b) => a + b, 0) / scores.length
    );
  }

  await supabaseAdmin
    .from('rendered_drawings')
    .update({
      status: 'rendered',
      overall_confidence: overallConfidence,
      confidence_breakdown: confidenceBreakdown,
      comparison_notes: `Traverse closure: 1:${Math.round(traverseResult.closure.precision_ratio)} (${traverseResult.closure.misclosure_ft.toFixed(3)} ft misclosure). Area: ${traverseResult.area_acres.toFixed(4)} acres (${Math.round(traverseResult.area_sq_ft).toLocaleString()} sq ft). ${elements.length} elements generated.`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', drawingId);

  return { drawingId, elementCount: elements.length };
}

// ── Call Sequence Builder ────────────────────────────────────────────────────

/**
 * Build NormalizedCall array from extracted data points.
 * Looks for 'call' category data points with normalized_value containing
 * bearing/distance or curve data.
 */
function buildCallSequence(dataPoints: ExtractedDataPoint[]): NormalizedCall[] {
  const callDps = dataPoints
    .filter(dp => dp.data_category === 'call' && dp.normalized_value)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));

  const calls: NormalizedCall[] = [];

  for (const dp of callDps) {
    const nv = dp.normalized_value as Record<string, unknown>;

    if (nv.curve) {
      // Curve call
      calls.push({
        type: 'curve',
        curve: nv.curve as NormalizedCall['curve'],
      });
    } else {
      // Line call
      calls.push({
        type: 'line',
        bearing: nv.bearing as NormalizedCall['bearing'],
        distance: nv.distance as NormalizedCall['distance'],
        monument_at_end: nv.monument_at_end as NormalizedCall['monument_at_end'],
        to_description: nv.to_description as string | undefined,
      });
    }
  }

  return calls;
}

// ── Multi-Document Match Check ───────────────────────────────────────────────

function hasMultiDocumentMatch(dataPoints: ExtractedDataPoint[]): boolean {
  const docs = new Set(dataPoints.map(dp => dp.document_id));
  return docs.size > 1;
}

// ── AI Report Generation ─────────────────────────────────────────────────────

/**
 * Generate AI-written reports for each element in a batch call.
 * Each element gets a 2-5 sentence report explaining its data provenance
 * and confidence factors.
 */
async function generateElementReports(
  elements: DrawingElementInput[],
  dataPoints: ExtractedDataPoint[],
  discrepancies: Discrepancy[]
): Promise<void> {
  // Only generate reports for substantive elements (not labels)
  const reportableElements = elements.filter(
    el => el.element_type !== 'label' || el.feature_class !== 'annotation'
  );

  if (reportableElements.length === 0) return;

  // Batch into chunks of 30 to avoid oversized prompts
  const chunkSize = 30;
  for (let i = 0; i < reportableElements.length; i += chunkSize) {
    const chunk = reportableElements.slice(i, i + chunkSize);

    try {
      const result = await callAI({
        promptKey: 'ELEMENT_REPORT_WRITER',
        userContent: JSON.stringify({
          elements: chunk.map(e => ({
            type: e.element_type,
            feature: e.feature_class,
            attributes: e.attributes,
            confidence: e.confidence_score,
            confidence_factors: e.confidence_factors,
            sources: e.source_references,
            discrepancies: e.discrepancy_ids.length,
          })),
        }),
        maxTokens: 4096,
      });

      const data = result.response as { reports?: string[] };
      if (data?.reports && Array.isArray(data.reports)) {
        chunk.forEach((el, idx) => {
          if (data.reports![idx]) {
            el.ai_report = data.reports![idx];
          }
        });
      }
    } catch (err) {
      console.error('[Drawing Service] Error generating element reports:', err);
      // Non-fatal — elements still get created without reports
    }
  }
}

// ── Get Drawing with Elements ────────────────────────────────────────────────

/**
 * Load a drawing and all its elements from the database.
 */
export async function getDrawingWithElements(
  drawingId: string
): Promise<{ drawing: RenderedDrawing; elements: DrawingElement[] } | null> {
  const [drawingResult, elementsResult] = await Promise.all([
    supabaseAdmin
      .from('rendered_drawings')
      .select('*')
      .eq('id', drawingId)
      .single(),
    supabaseAdmin
      .from('drawing_elements')
      .select('*')
      .eq('drawing_id', drawingId)
      .order('z_index', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  if (drawingResult.error || !drawingResult.data) return null;

  return {
    drawing: drawingResult.data as RenderedDrawing,
    elements: (elementsResult.data || []) as DrawingElement[],
  };
}

// ── List Drawings ────────────────────────────────────────────────────────────

export async function listDrawings(
  projectId: string
): Promise<(RenderedDrawing & { element_count: number })[]> {
  const { data: drawings, error } = await supabaseAdmin
    .from('rendered_drawings')
    .select('*')
    .eq('research_project_id', projectId)
    .order('version', { ascending: false });

  if (error || !drawings) return [];

  // Get element counts
  const drawingIds = drawings.map(d => d.id);
  const results: (RenderedDrawing & { element_count: number })[] = [];

  for (const drawing of drawings) {
    const { count } = await supabaseAdmin
      .from('drawing_elements')
      .select('id', { count: 'exact', head: true })
      .eq('drawing_id', drawing.id);

    results.push({
      ...(drawing as RenderedDrawing),
      element_count: count || 0,
    });
  }

  return results;
}
