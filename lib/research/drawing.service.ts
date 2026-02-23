// lib/research/drawing.service.ts — Drawing creation and element management
// Orchestrates: traverse computation → element building → confidence scoring → AI reports → DB save
import { supabaseAdmin } from '@/lib/supabase';
import { callAI, AIServiceError } from './ai-client';
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
  // 1. Load project data (data points, discrepancies, template, and documents for context)
  const [dataPointsResult, discrepanciesResult, templateResult, documentsResult] = await Promise.all([
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
    supabaseAdmin
      .from('research_documents')
      .select('id, document_type, recorded_date, ocr_confidence, source_type')
      .eq('research_project_id', projectId),
  ]);

  const dataPoints: ExtractedDataPoint[] = dataPointsResult.data || [];
  const discrepancies: Discrepancy[] = discrepanciesResult.data || [];
  const template = templateResult.data;

  // Build document metadata lookup for confidence scoring
  type DocMeta = { document_type: string | null; recorded_date: string | null; ocr_confidence: number | null; source_type: string };
  const docMetaMap = new Map<string, DocMeta>();
  for (const doc of (documentsResult.data || []) as DocMeta[]) {
    docMetaMap.set((doc as unknown as { id: string }).id, doc);
  }

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

  // 5. Update confidence scores with closure data AND document metadata
  const closurePrecision = traverseResult.closure.precision_ratio;
  for (const el of elements) {
    const relatedDps = dataPoints.filter(dp => el.data_point_ids.includes(dp.id));
    const relatedDisc = discrepancies.filter(d => el.discrepancy_ids.includes(d.id));

    // Gather document metadata for the data points backing this element
    const relatedDocIds = new Set(relatedDps.map(dp => dp.document_id));
    const relatedDocs = [...relatedDocIds].map(id => docMetaMap.get(id)).filter(Boolean) as DocMeta[];

    el.confidence_factors = computeConfidenceFactors(relatedDps, relatedDisc, {
      closurePrecision,
      multiDocumentMatch: hasMultiDocumentMatch(relatedDps),
      documentTypes: relatedDocs.map(d => d.document_type),
      documentDates: relatedDocs.map(d => d.recorded_date),
      ocrConfidences: relatedDocs.map(d => d.ocr_confidence),
      sourceTypes: relatedDocs.map(d => d.source_type),
    });
    el.confidence_score = computeElementConfidence(el.confidence_factors);
  }

  // 6. Generate AI reports (batch)
  await generateElementReports(elements, dataPoints, discrepancies);

  // 7. Compute canvas configuration and transform coordinates
  const canvasWidth = 3600;
  const canvasHeight = 2400;
  const margin = 200; // generous margin for labels, title block, north arrow
  const bbox = computeBoundingBox(traverseResult.points, 0);
  const scaleVal = computeScale(traverseResult.points, canvasWidth, canvasHeight, margin);

  // Guard: ensure scale is finite and positive
  const safeScale = isFinite(scaleVal) && scaleVal > 0 ? scaleVal : 1;

  // Compute transform from survey feet to canvas pixels
  const fittedW = bbox.width * safeScale;
  const fittedH = bbox.height * safeScale;
  const offsetX = (canvasWidth - fittedW) / 2;
  const offsetY = (canvasHeight - fittedH) / 2;

  // Survey coord (x_s, y_s) → canvas pixel (px, py):
  //   px = offsetX + (x_s - bbox.minX) * safeScale
  //   py = offsetY + (bbox.maxY - y_s) * safeScale   (flip Y: north=up → SVG y-down)
  let warnedNaN = false;
  function surveyToCanvas(x: number, y: number): [number, number] {
    const px = offsetX + (x - bbox.minX) * safeScale;
    const py = offsetY + (bbox.maxY - y) * safeScale;
    if ((!isFinite(px) || !isFinite(py)) && !warnedNaN) {
      console.warn('[Drawing Service] surveyToCanvas produced non-finite value', { x, y, px, py, safeScale, bbox });
      warnedNaN = true;
    }
    return [
      isFinite(px) ? Math.round(px * 10) / 10 : canvasWidth / 2,
      isFinite(py) ? Math.round(py * 10) / 10 : canvasHeight / 2,
    ];
  }

  // Transform all element coordinates from survey space to canvas pixel space
  transformElements(elements, surveyToCanvas);

  // Map scale: 1 inch (on screen) = N feet (96 DPI assumption)
  const rawDisplayScale = safeScale > 0 ? Math.round((1 / safeScale) * 96) : 100;
  const displayScale = rawDisplayScale > 0 && isFinite(rawDisplayScale) ? rawDisplayScale : 100;
  const canvasConfig: CanvasConfig = {
    width: canvasWidth,
    height: canvasHeight,
    scale: displayScale,
    units: 'feet',
    origin: [Math.round(offsetX), Math.round(offsetY)],
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

  // 10. Save all elements — scale strokes for canvas visibility
  const strokeScale = Math.max(1, canvasWidth / 1200);
  const elementRows = elements.map((el, idx) => {
    const featureStyle = drawingConfig.feature_styles[el.feature_class];
    const baseStrokeWidth = featureStyle?.strokeWidth || 1;
    const baseFontSize = featureStyle?.fontSize || drawingConfig.label_config.font_size || 10;

    return {
    drawing_id: drawingId,
    element_type: el.element_type,
    feature_class: el.feature_class,
    geometry: el.geometry,
    svg_path: el.svg_path || null,
    attributes: el.attributes,
    style: featureStyle
      ? {
          stroke: featureStyle.stroke || '#000000',
          strokeWidth: Math.round(baseStrokeWidth * strokeScale * 10) / 10,
          strokeDasharray: featureStyle.dasharray
            ? featureStyle.dasharray.split(',').map(v => String(Math.round(parseFloat(v) * strokeScale))).join(',')
            : '',
          fill: featureStyle.fill || 'none',
          opacity: 1,
          fontSize: Math.round(baseFontSize * strokeScale),
        }
      : {
          stroke: '#000000',
          strokeWidth: Math.round(1 * strokeScale * 10) / 10,
          strokeDasharray: '',
          fill: 'none',
          opacity: 1,
          fontSize: Math.round(10 * strokeScale),
        },
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
  };});

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

  // Compute max extent of traverse for scale note
  const pts = traverseResult.points;
  let maxDist = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxDist) maxDist = d;
    }
  }
  const extentNote = maxDist > 0 ? ` Max extent: ${maxDist.toFixed(1)} ft (${(maxDist / 5280).toFixed(3)} mi).` : '';

  const closureRatio = Math.round(traverseResult.closure.precision_ratio);
  const misclosureFt = traverseResult.closure.misclosure_ft.toFixed(3);
  const areaAcres = traverseResult.area_acres.toFixed(4);
  const areaSqFt = Math.round(traverseResult.area_sq_ft).toLocaleString();
  const comparisonNotes = [
    `Traverse closure: 1:${closureRatio} (${misclosureFt} ft misclosure).`,
    `Area: ${areaAcres} acres (${areaSqFt} sq ft).`,
    extentNote.trim(),
    `${elements.length} elements generated.`,
  ].filter(Boolean).join(' ');

  await supabaseAdmin
    .from('rendered_drawings')
    .update({
      status: 'rendered',
      overall_confidence: overallConfidence,
      confidence_breakdown: confidenceBreakdown,
      comparison_notes: comparisonNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', drawingId);

  return { drawingId, elementCount: elements.length };
}

// ── Call Sequence Builder ────────────────────────────────────────────────────

/**
 * Build NormalizedCall array from extracted data points.
 *
 * Strategy:
 * 1. First, look for 'call' category data points (combined bearing+distance)
 * 2. If none found, try to synthesize calls by pairing 'bearing' + 'distance'
 *    data points that share the same sequence_order
 * 3. If still none, try pairing bearings and distances in order
 */
function buildCallSequence(dataPoints: ExtractedDataPoint[]): NormalizedCall[] {
  // Strategy 1: Look for explicit 'call' data points
  const callDps = dataPoints
    .filter(dp => dp.data_category === 'call' && dp.normalized_value)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));

  if (callDps.length > 0) {
    const calls: NormalizedCall[] = [];
    for (const dp of callDps) {
      const nv = dp.normalized_value as Record<string, unknown>;

      if (nv.curve) {
        calls.push({
          type: 'curve',
          curve: nv.curve as NormalizedCall['curve'],
        });
      } else if (nv.bearing && nv.distance) {
        calls.push({
          type: 'line',
          bearing: nv.bearing as NormalizedCall['bearing'],
          distance: nv.distance as NormalizedCall['distance'],
          monument_at_end: nv.monument_at_end as NormalizedCall['monument_at_end'],
          to_description: nv.to_description as string | undefined,
        });
      } else {
        // Call data point missing bearing or distance — try to normalize from raw_value
        const call = tryNormalizeCallFromRaw(dp);
        if (call) calls.push(call);
      }
    }
    if (calls.length > 0) return calls;
  }

  // Strategy 2: Synthesize from separate bearing + distance data points by sequence_order
  console.log('[Drawing Service] No call data points found. Attempting to synthesize from bearings + distances.');
  const bearingDps = dataPoints
    .filter(dp => dp.data_category === 'bearing' && dp.normalized_value)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
  const distanceDps = dataPoints
    .filter(dp => dp.data_category === 'distance' && dp.normalized_value)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));

  if (bearingDps.length > 0 && distanceDps.length > 0) {
    // Try matching by sequence_order first
    const matchedByOrder: NormalizedCall[] = [];
    const usedDistances = new Set<number>();

    for (const bdp of bearingDps) {
      const matchingDist = distanceDps.findIndex((ddp, idx) =>
        !usedDistances.has(idx) && ddp.sequence_order === bdp.sequence_order && ddp.sequence_order != null
      );
      if (matchingDist >= 0) {
        usedDistances.add(matchingDist);
        const bearing = bdp.normalized_value as unknown as NormalizedCall['bearing'];
        const distance = distanceDps[matchingDist].normalized_value as unknown as NormalizedCall['distance'];
        matchedByOrder.push({
          type: 'line',
          bearing,
          distance,
        });
      }
    }

    if (matchedByOrder.length > 0) return matchedByOrder;

    // Strategy 3: Pair bearings and distances in order (1:1)
    const count = Math.min(bearingDps.length, distanceDps.length);
    const pairedCalls: NormalizedCall[] = [];
    for (let i = 0; i < count; i++) {
      const bearing = bearingDps[i].normalized_value as unknown as NormalizedCall['bearing'];
      const distance = distanceDps[i].normalized_value as unknown as NormalizedCall['distance'];
      pairedCalls.push({
        type: 'line',
        bearing,
        distance,
      });
    }
    if (pairedCalls.length > 0) {
      console.log(`[Drawing Service] Synthesized ${pairedCalls.length} calls from paired bearings + distances.`);
      return pairedCalls;
    }
  }

  console.warn('[Drawing Service] No call sequence could be built. Drawing will have template elements only.');
  return [];
}

/**
 * Try to parse a NormalizedCall from a call data point's raw_value
 * when the normalized_value is incomplete.
 */
function tryNormalizeCallFromRaw(dp: ExtractedDataPoint): NormalizedCall | null {
  try {
    const raw = dp.raw_value || '';
    // Try to find bearing pattern: N/S dd° mm' ss" E/W
    const bearingMatch = raw.match(/([NS])\s*(\d+)\s*[°\s\-]+\s*(\d+)\s*['\s\-]+\s*(\d+(?:\.\d+)?)\s*["″]?\s*([EW])/i);
    // Try to find distance pattern
    const distMatch = raw.match(/(\d+(?:\.\d+)?)\s*(feet|foot|ft|'|varas|chains|meters)/i);

    if (!bearingMatch || !distMatch) return null;

    const ns = bearingMatch[1].toUpperCase();
    const degrees = parseInt(bearingMatch[2], 10);
    const minutes = parseInt(bearingMatch[3], 10);
    const seconds = parseFloat(bearingMatch[4]);
    const ew = bearingMatch[5].toUpperCase();
    const quadrant = `${ns}${ew}` as 'NE' | 'NW' | 'SE' | 'SW';
    const decimal_degrees = degrees + minutes / 60 + seconds / 3600;
    let azimuth: number;
    switch (quadrant) {
      case 'NE': azimuth = decimal_degrees; break;
      case 'SE': azimuth = 180 - decimal_degrees; break;
      case 'SW': azimuth = 180 + decimal_degrees; break;
      case 'NW': azimuth = 360 - decimal_degrees; break;
    }

    const distValue = parseFloat(distMatch[1]);
    const distUnit = distMatch[2].toLowerCase();
    let valueFeet = distValue;
    let unit: 'feet' | 'meters' | 'chains' | 'varas' | 'rods' = 'feet';
    if (['meters', 'm'].includes(distUnit)) { unit = 'meters'; valueFeet = distValue * 3.28084; }
    else if (['chains', 'ch'].includes(distUnit)) { unit = 'chains'; valueFeet = distValue * 66; }
    else if (['varas', 'vara'].includes(distUnit)) { unit = 'varas'; valueFeet = distValue * 2.777778; }

    return {
      type: 'line',
      bearing: { quadrant, degrees, minutes, seconds, decimal_degrees, azimuth, raw_text: bearingMatch[0] },
      distance: { value: distValue, unit, value_in_feet: valueFeet, raw_text: distMatch[0] },
    };
  } catch {
    return null;
  }
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
      const isAIError = err instanceof AIServiceError;
      console.error(`[Drawing Service] Element report generation failed [${isAIError ? err.category : 'unknown'}]:`, err instanceof Error ? err.message : err);
      // Non-fatal — elements still get created without AI reports
      // Mark elements with a note that reports were unavailable
      for (const el of chunk) {
        if (!el.ai_report) {
          el.ai_report = isAIError
            ? `AI report unavailable: ${err.userMessage}`
            : 'AI report generation failed. Element data is still available for manual review.';
        }
      }
      // If this is auth/usage, don't keep trying remaining chunks
      if (isAIError && (err.category === 'authentication' || err.category === 'usage_exhausted')) {
        break;
      }
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
    .is('archived_at', null)
    .order('version', { ascending: false });

  if (error || !drawings) return [];

  // Get element counts
  const drawingIds = (drawings as RenderedDrawing[]).map(d => d.id);
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

// ── Coordinate Transformation ────────────────────────────────────────────────

/**
 * Transform all element coordinates from survey space (feet) to canvas pixel space.
 * Also scales stroke widths and font sizes proportionally.
 */
function transformElements(
  elements: DrawingElementInput[],
  surveyToCanvas: (x: number, y: number) => [number, number],
): void {
  for (const el of elements) {
    const geom = el.geometry as Record<string, unknown>;

    switch (geom.type) {
      case 'line': {
        const g = geom as { type: 'line'; start: [number, number]; end: [number, number] };
        g.start = surveyToCanvas(g.start[0], g.start[1]);
        g.end = surveyToCanvas(g.end[0], g.end[1]);
        // Regenerate svg_path with transformed coords
        el.svg_path = `M ${g.start[0].toFixed(1)} ${g.start[1].toFixed(1)} L ${g.end[0].toFixed(1)} ${g.end[1].toFixed(1)}`;
        break;
      }
      case 'point': {
        const g = geom as { type: 'point'; position: [number, number] };
        g.position = surveyToCanvas(g.position[0], g.position[1]);
        break;
      }
      case 'label': {
        const g = geom as { type: 'label'; position: [number, number]; anchor: string };
        g.position = surveyToCanvas(g.position[0], g.position[1]);
        break;
      }
      case 'polygon': {
        const g = geom as { type: 'polygon'; points: [number, number][] };
        g.points = g.points.map(p => surveyToCanvas(p[0], p[1]));
        break;
      }
    }
    // Note: styles are created fresh from drawingConfig in createDrawing(),
    // so no style scaling is needed here.
  }
}
