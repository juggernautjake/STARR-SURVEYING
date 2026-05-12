// lib/research/geometry.engine.ts — Geometry engine for converting surveying calls to drawing elements
// Pure math — no AI calls. All functions must be deterministic.

import type {
  ExtractedDataPoint,
  Discrepancy,
  ConfidenceFactors,
  SourceReference,
  ElementGeometry,
  FeatureClass,
} from '@/types/research';
import type { NormalizedCall, NormalizedCurveData, NormalizedBearing, NormalizedDistance } from './normalization';
import {
  computeNextPoint,
  computeAreaSqFt,
  sqFtToAcres,
  formatBearing,
  formatDistance,
  type TraversePoint,
} from './normalization';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DrawingElementInput {
  element_type: string;
  feature_class: FeatureClass;
  geometry: ElementGeometry;
  svg_path?: string;
  attributes: Record<string, unknown>;
  style?: Record<string, unknown>;
  layer: string;
  z_index: number;
  visible: boolean;
  locked: boolean;
  confidence_score: number;
  confidence_factors: ConfidenceFactors;
  ai_report?: string;
  source_references: SourceReference[];
  data_point_ids: string[];
  discrepancy_ids: string[];
  user_modified: boolean;
}

export interface TraverseResult {
  points: TraversePoint[];
  elements: DrawingElementInput[];
  closure: {
    misclosure_ft: number;
    precision_ratio: number;
    adjusted_points?: TraversePoint[];
    total_distance: number;
  };
  area_sq_ft: number;
  area_acres: number;
}

export interface DrawingConfig {
  label_config: {
    show_bearings: boolean;
    show_distances: boolean;
    show_monuments: boolean;
    show_lot_labels: boolean;
    bearing_precision: number;
    distance_precision: number;
    font_family: string;
    font_size: number;
  };
  feature_styles: Record<string, { stroke: string; strokeWidth: number; dasharray?: string; fill?: string; fontSize?: number }>;
}

// ── Default Config ───────────────────────────────────────────────────────────

export const DEFAULT_DRAWING_CONFIG: DrawingConfig = {
  label_config: {
    show_bearings: true,
    show_distances: true,
    show_monuments: true,
    show_lot_labels: true,
    bearing_precision: 0,
    distance_precision: 2,
    font_family: 'Arial',
    font_size: 8,
  },
  feature_styles: {
    property_boundary: { stroke: '#000000', strokeWidth: 2 },
    easement:          { stroke: '#CC0000', strokeWidth: 1.5, dasharray: '10,5', fill: 'none' },
    setback:           { stroke: '#0066CC', strokeWidth: 1, dasharray: '5,5' },
    right_of_way:      { stroke: '#666666', strokeWidth: 1.5, dasharray: '15,5,5,5' },
    monument:          { stroke: '#CC0000', strokeWidth: 1.5, fill: '#CC0000' },
    annotation:        { stroke: '#000000', strokeWidth: 0.5, fontSize: 10 },
    // boundary_fill: light blue semi-transparent polygon for property interior
    boundary_fill:     { stroke: '#000000', strokeWidth: 0, fill: '#E8F4FD' },
  },
};

// ── Full Traverse Computation ────────────────────────────────────────────────

/**
 * Compute a full traverse from NormalizedCall data, including:
 * - Point computation for lines and curves
 * - Closure calculation
 * - Compass Rule adjustment (if precision > 1:5000)
 * - Drawing element generation
 */
export function computeTraverse(
  calls: NormalizedCall[],
  pob: TraversePoint = { x: 0, y: 0 }
): TraverseResult {
  const rawPoints: TraversePoint[] = [pob];
  let current = { ...pob };

  for (const call of calls) {
    if (call.type === 'line' && call.bearing && call.distance) {
      current = computeNextPoint(current, call.bearing.azimuth, call.distance.value_in_feet);
      rawPoints.push({ ...current });
    } else if (call.type === 'curve' && call.curve) {
      const curveResult = computeCurvePoints(current, call.curve);
      rawPoints.push(curveResult.endpoint);
      current = curveResult.endpoint;
    }
  }

  // Calculate closure
  const dx = pob.x - current.x;
  const dy = pob.y - current.y;
  const misclosure = Math.sqrt(dx * dx + dy * dy);
  const totalDistance = calculatePerimeter(calls);
  const ratio = misclosure > 0 ? totalDistance / misclosure : Infinity;

  // Apply Compass Rule if precision is better than 1:5000
  let adjustedPoints: TraversePoint[] | undefined;
  if (ratio > 5000 && misclosure > 0.001) {
    adjustedPoints = applyCompassRule(rawPoints, dx, dy, calls);
  }

  const finalPoints = adjustedPoints || rawPoints;
  const areaSqFt = computeAreaSqFt(finalPoints);

  return {
    points: finalPoints,
    elements: [], // populated later by buildElementsFromAnalysis
    closure: {
      misclosure_ft: misclosure,
      precision_ratio: ratio,
      adjusted_points: adjustedPoints,
      total_distance: totalDistance,
    },
    area_sq_ft: areaSqFt,
    area_acres: sqFtToAcres(areaSqFt),
  };
}

// ── Curve Point Computation ──────────────────────────────────────────────────

/**
 * Compute intermediate points along a curve for smooth rendering.
 * Returns the endpoint and intermediate arc points.
 */
export function computeCurvePoints(
  startPoint: TraversePoint,
  curve: NormalizedCurveData
): { intermediatePoints: TraversePoint[]; endpoint: TraversePoint } {
  const chordAzRad = (curve.chord_bearing.azimuth * Math.PI) / 180;
  const deltaRad = (curve.delta_angle.decimal_degrees * Math.PI) / 180;
  const radius = curve.radius;

  // Compute the center of the arc
  // The center is offset from the chord midpoint perpendicular to the chord
  const halfDelta = deltaRad / 2;

  // Direction of center offset depends on curve direction
  const centerOffsetAngle = curve.direction === 'right'
    ? chordAzRad - Math.PI / 2
    : chordAzRad + Math.PI / 2;

  // The start point tangent is perpendicular to the radius at the start
  // We can compute the center from the start point and the radius direction
  const tangentAzimuth = curve.direction === 'right'
    ? chordAzRad - halfDelta
    : chordAzRad + halfDelta;

  const radiusToCenter = curve.direction === 'right'
    ? tangentAzimuth + Math.PI / 2
    : tangentAzimuth - Math.PI / 2;

  const center: TraversePoint = {
    x: startPoint.x + radius * Math.sin(radiusToCenter),
    y: startPoint.y + radius * Math.cos(radiusToCenter),
  };

  // Angle from center to start point
  const startAngle = Math.atan2(startPoint.x - center.x, startPoint.y - center.y);

  // Generate intermediate points
  const numSegments = Math.max(8, Math.ceil(curve.delta_angle.decimal_degrees / 5));
  const points: TraversePoint[] = [];

  for (let i = 1; i <= numSegments; i++) {
    const fraction = i / numSegments;
    const sweepAngle = curve.direction === 'right'
      ? startAngle + deltaRad * fraction
      : startAngle - deltaRad * fraction;

    points.push({
      x: center.x + radius * Math.sin(sweepAngle),
      y: center.y + radius * Math.cos(sweepAngle),
    });
  }

  const endpoint = points[points.length - 1];

  return {
    intermediatePoints: points.slice(0, -1),
    endpoint,
  };
}

// ── Compass Rule Adjustment ──────────────────────────────────────────────────

/**
 * Compass Rule distributes closure error proportionally across all traverse legs.
 * Each point is adjusted by a fraction of the total error proportional to the
 * cumulative distance to that point divided by total traverse distance.
 */
function applyCompassRule(
  points: TraversePoint[],
  closingDx: number,
  closingDy: number,
  calls: NormalizedCall[]
): TraversePoint[] {
  const totalDistance = calculatePerimeter(calls);
  let cumulativeDistance = 0;

  return points.map((point, i) => {
    if (i === 0) return point; // POB stays fixed

    const callDist = getCallDistance(calls[i - 1]);
    cumulativeDistance += callDist;
    const proportion = cumulativeDistance / totalDistance;

    return {
      x: point.x + closingDx * proportion,
      y: point.y + closingDy * proportion,
    };
  });
}

// ── Perimeter & Distance Helpers ─────────────────────────────────────────────

function calculatePerimeter(calls: NormalizedCall[]): number {
  let total = 0;
  for (const call of calls) {
    total += getCallDistance(call);
  }
  return total;
}

function getCallDistance(call: NormalizedCall): number {
  if (call.type === 'line' && call.distance) {
    return call.distance.value_in_feet;
  } else if (call.type === 'curve' && call.curve) {
    return call.curve.arc_length;
  }
  return 0;
}

// ── Element Building ─────────────────────────────────────────────────────────

/**
 * Compute the centroid of a traverse polygon (from traverse points).
 * Falls back to (0,0) for an empty array, logging a warning to aid debugging.
 */
function computeCentroid(points: TraversePoint[]): TraversePoint {
  if (points.length === 0) {
    console.warn('[Geometry Engine] computeCentroid called with empty points array; defaulting to (0,0)');
    return { x: 0, y: 0 };
  }
  const n = points.length;
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  return { x: cx / n, y: cy / n };
}

/**
 * Compute the rotation angle (degrees) for a label on a line, in survey space.
 * Returns an angle suitable for SVG rotate(), clamped to [-90, 90] so text is never upside-down.
 * Note: survey y-axis points up; canvas (SVG) y-axis points down.
 * Flipping dy is achieved by reversing the subtraction order: (start[1] - end[1]).
 */
function computeLabelRotation(
  start: [number, number],
  end: [number, number]
): number {
  const dx = end[0] - start[0];
  const dy = start[1] - end[1]; // reversed subtraction order flips y for SVG canvas space
  let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  // Clamp to [-90, 90] so text is never upside-down
  if (angleDeg > 90) angleDeg -= 180;
  if (angleDeg < -90) angleDeg += 180;
  return Math.round(angleDeg * 10) / 10;
}

/** Data categories that represent 'other considerations' on a plat drawing */
const OTHER_CONSIDERATION_CATEGORIES = ['setback', 'right_of_way', 'utility_info', 'annotation', 'other'] as const;
/** Maximum number of 'other consideration' callouts to place on the drawing */
const MAX_OTHER_CONSIDERATIONS_ON_DRAWING = 8;

/**
 * Build drawing elements from analyzed data points using traverse results.
 * Each boundary leg, monument, label, and annotation becomes a DrawingElementInput.
 */
export function buildElementsFromAnalysis(
  traverseResult: TraverseResult,
  dataPoints: ExtractedDataPoint[],
  discrepancies: Discrepancy[],
  config: DrawingConfig = DEFAULT_DRAWING_CONFIG
): DrawingElementInput[] {
  const elements: DrawingElementInput[] = [];
  const points = traverseResult.points;

  // 0. Boundary fill polygon (semi-transparent interior) — drawn first (lowest z-index)
  if (points.length >= 3) {
    // Close the polygon if not already closed
    const polyPts = [...points];
    const first = polyPts[0];
    const last = polyPts[polyPts.length - 1];
    const isClosed = Math.abs(first.x - last.x) < 0.1 && Math.abs(first.y - last.y) < 0.1;
    if (!isClosed) polyPts.push({ ...first }); // close it

    elements.push({
      element_type: 'polygon',
      feature_class: 'property_boundary',
      geometry: {
        type: 'polygon',
        points: polyPts.map(p => [p.x, p.y] as [number, number]),
      },
      attributes: {
        area_sq_ft: traverseResult.area_sq_ft,
        area_acres: traverseResult.area_acres,
        fill_type: 'boundary_fill',
      },
      layer: 'boundary_fill',
      z_index: 2,
      visible: true,
      locked: true,
      confidence_score: 90,
      confidence_factors: computeDefaultConfidenceFactors(undefined, []),
      source_references: [],
      data_point_ids: [],
      discrepancy_ids: [],
      user_modified: false,
    });
  }

  // 1. Boundary lines from traverse
  const callDataPoints = dataPoints
    .filter(dp => dp.data_category === 'call')
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));

  for (let i = 1; i < points.length; i++) {
    const call = callDataPoints[i - 1];
    const start = points[i - 1];
    const end = points[i];

    const relatedDiscrepancies = call
      ? findRelatedDiscrepancies(call.id, discrepancies)
      : [];

    elements.push({
      element_type: 'line',
      feature_class: 'property_boundary',
      geometry: {
        type: 'line',
        start: [start.x, start.y],
        end: [end.x, end.y],
      },
      svg_path: `M ${start.x} ${-start.y} L ${end.x} ${-end.y}`,
      attributes: {
        bearing: call?.normalized_value?.bearing,
        distance: call?.normalized_value?.distance,
        call_index: i,
        sequence_group: call?.sequence_group,
      },
      layer: 'boundary',
      z_index: 10,
      visible: true,
      locked: false,
      confidence_score: call?.extraction_confidence ?? 0,
      confidence_factors: computeDefaultConfidenceFactors(call, relatedDiscrepancies),
      source_references: call ? buildSourceReferences(call) : [],
      data_point_ids: call ? [call.id] : [],
      discrepancy_ids: relatedDiscrepancies,
      user_modified: false,
    });
  }

  // 2. Monuments at traverse points
  const monuments = dataPoints.filter(dp => dp.data_category === 'monument');
  for (const mon of monuments) {
    const pointIndex = mon.sequence_order;
    if (pointIndex !== undefined && pointIndex !== null && points[pointIndex]) {
      const pt = points[pointIndex];
      const relDisc = findRelatedDiscrepancies(mon.id, discrepancies);

      elements.push({
        element_type: 'point',
        feature_class: 'monument',
        geometry: {
          type: 'point',
          position: [pt.x, pt.y],
        },
        attributes: {
          ...mon.normalized_value,
          display: mon.display_value,
        },
        layer: 'monuments',
        z_index: 20,
        visible: true,
        locked: false,
        confidence_score: mon.extraction_confidence ?? 0,
        confidence_factors: computeDefaultConfidenceFactors(mon, relDisc),
        source_references: buildSourceReferences(mon),
        data_point_ids: [mon.id],
        discrepancy_ids: relDisc,
        user_modified: false,
      });
    }
  }

  // 3. Bearing & distance labels on boundary lines — with rotation to be parallel to line
  const boundaryLines = elements.filter(
    e => e.element_type === 'line' && e.feature_class === 'property_boundary'
  );

  for (const lineEl of boundaryLines) {
    const geom = lineEl.geometry as { type: 'line'; start: [number, number]; end: [number, number] };
    const midX = (geom.start[0] + geom.end[0]) / 2;
    const midY = (geom.start[1] + geom.end[1]) / 2;

    // Calculate label offset perpendicular to line direction
    const dx = geom.end[0] - geom.start[0];
    const dy = geom.end[1] - geom.start[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    const offsetDist = Math.max(2, len * 0.06);
    const perpX = len > 0 ? -(dy / len) * offsetDist : 0;
    const perpY = len > 0 ? (dx / len) * offsetDist : offsetDist;

    // Rotation angle for text to be parallel to the line (in survey/canvas frame)
    const labelRotation = computeLabelRotation(geom.start, geom.end);

    if (config.label_config.show_bearings && lineEl.attributes.bearing) {
      const bearing = lineEl.attributes.bearing as {
        quadrant: string; degrees: number; minutes: number; seconds: number;
        decimal_degrees: number; azimuth: number; raw_text: string;
      };

      elements.push({
        element_type: 'label',
        feature_class: 'annotation',
        geometry: {
          type: 'label',
          position: [midX + perpX, midY + perpY],
          anchor: 'middle',
        },
        attributes: {
          text: formatBearing(bearing as NormalizedBearing),
          label_type: 'bearing',
          rotation: labelRotation,
          for_element_index: elements.indexOf(lineEl),
        },
        layer: 'labels',
        z_index: 30,
        visible: true,
        locked: false,
        confidence_score: lineEl.confidence_score,
        confidence_factors: lineEl.confidence_factors,
        source_references: lineEl.source_references,
        data_point_ids: lineEl.data_point_ids,
        discrepancy_ids: [],
        user_modified: false,
      });
    }

    if (config.label_config.show_distances && lineEl.attributes.distance) {
      const distance = lineEl.attributes.distance as NormalizedDistance;

      elements.push({
        element_type: 'label',
        feature_class: 'annotation',
        geometry: {
          type: 'label',
          position: [midX - perpX, midY - perpY],
          anchor: 'middle',
        },
        attributes: {
          text: formatDistance(distance),
          label_type: 'distance',
          rotation: labelRotation,
          for_element_index: elements.indexOf(lineEl),
        },
        layer: 'labels',
        z_index: 30,
        visible: true,
        locked: false,
        confidence_score: lineEl.confidence_score,
        confidence_factors: lineEl.confidence_factors,
        source_references: lineEl.source_references,
        data_point_ids: lineEl.data_point_ids,
        discrepancy_ids: [],
        user_modified: false,
      });
    }
  }

  // 4. Easement callouts — positioned relative to property centroid
  //    Since easements rarely have explicit traversal coordinates, we render them
  //    as labeled horizontal lines spaced below the centroid, inside the property.
  const centroid = computeCentroid(points.length > 0 ? points : [{ x: 0, y: 0 }]);
  const easements = dataPoints.filter(dp => dp.data_category === 'easement');

  for (let eIdx = 0; eIdx < easements.length; eIdx++) {
    const easement = easements[eIdx];
    const relDisc = findRelatedDiscrepancies(easement.id, discrepancies);
    const nv = easement.normalized_value as Record<string, unknown> | null;

    // Compute the traversal width so easements stack vertically inside the property
    // (each one spaced ~30 survey units apart from centroid)
    const bbox = computeBoundingBox(points, 0);
    const spacing = Math.max(15, bbox.height * 0.08);
    const lineHalfLen = Math.max(20, bbox.width * 0.15);

    // Place easement line at centroid + vertical offset per easement
    const cy = centroid.y - spacing * eIdx; // offset downward in survey space (canvas up)
    const cx = centroid.x;

    const easTypeRaw = (nv?.type as string) || easement.display_value || easement.raw_value;
    const easWidth = nv?.width ? ` (${nv.width}' wide)` : '';
    const easLabel = `${easTypeRaw}${easWidth}`.substring(0, 60);

    // Dashed line representing easement extent
    elements.push({
      element_type: 'line',
      feature_class: 'easement',
      geometry: {
        type: 'line',
        start: [cx - lineHalfLen, cy],
        end: [cx + lineHalfLen, cy],
      },
      attributes: {
        description: easement.raw_value,
        normalized: easement.normalized_value,
        display: easement.display_value,
        width: nv?.width,
        type: nv?.type,
      },
      layer: 'easements',
      z_index: 5,
      visible: true,
      locked: false,
      confidence_score: easement.extraction_confidence ?? 0,
      confidence_factors: computeDefaultConfidenceFactors(easement, relDisc),
      source_references: buildSourceReferences(easement),
      data_point_ids: [easement.id],
      discrepancy_ids: relDisc,
      user_modified: false,
    });

    // Easement label above the line
    elements.push({
      element_type: 'label',
      feature_class: 'easement',
      geometry: {
        type: 'label',
        position: [cx, cy + Math.max(5, spacing * 0.3)],
        anchor: 'middle',
      },
      attributes: {
        text: easLabel,
        label_type: 'easement',
        rotation: 0,
      },
      layer: 'easement_labels',
      z_index: 31,
      visible: true,
      locked: false,
      confidence_score: easement.extraction_confidence ?? 0,
      confidence_factors: computeDefaultConfidenceFactors(easement, relDisc),
      source_references: buildSourceReferences(easement),
      data_point_ids: [easement.id],
      discrepancy_ids: relDisc,
      user_modified: false,
    });
  }

  // 5. Other consideration callouts (setbacks, ROW, utilities, annotations)
  //    Displayed as small text labels at the top of the property interior
  const otherDPs = dataPoints.filter(dp =>
    (OTHER_CONSIDERATION_CATEGORIES as readonly string[]).includes(dp.data_category)
  );

  for (let oIdx = 0; oIdx < Math.min(otherDPs.length, MAX_OTHER_CONSIDERATIONS_ON_DRAWING); oIdx++) {
    const dp = otherDPs[oIdx];
    const shortText = (dp.display_value || dp.raw_value).substring(0, 55);
    const bbox = computeBoundingBox(points, 0);
    const topY = bbox.maxY - bbox.height * 0.1; // near top of property in survey space
    const offsetY = oIdx * Math.max(8, bbox.height * 0.06);

    elements.push({
      element_type: 'label',
      feature_class: 'annotation',
      geometry: {
        type: 'label',
        position: [centroid.x, topY - offsetY],
        anchor: 'middle',
      },
      attributes: {
        text: shortText,
        label_type: `note_${dp.data_category}`,
        category: dp.data_category,
        rotation: 0,
      },
      layer: 'annotations',
      z_index: 32,
      visible: true,
      locked: false,
      confidence_score: dp.extraction_confidence ?? 50,
      confidence_factors: computeDefaultConfidenceFactors(dp, []),
      source_references: buildSourceReferences(dp),
      data_point_ids: [dp.id],
      discrepancy_ids: [],
      user_modified: false,
    });
  }

  // 6. Point of Beginning label
  const pobDataPoints = dataPoints.filter(dp => dp.data_category === 'point_of_beginning');
  if (points.length > 0) {
    const pobDp = pobDataPoints[0];
    const pobPt = points[0];

    elements.push({
      element_type: 'label',
      feature_class: 'annotation',
      geometry: {
        type: 'label',
        position: [pobPt.x, pobPt.y + 15],  // Offset below POB point (Y-up in survey space; transform will flip)
        anchor: 'middle',
      },
      attributes: {
        text: 'P.O.B.',
        label_type: 'pob',
        description: pobDp ? (pobDp.display_value || pobDp.raw_value) : 'Point of Beginning',
      },
      layer: 'labels',
      z_index: 35,
      visible: true,
      locked: false,
      confidence_score: pobDp?.extraction_confidence ?? 80,
      confidence_factors: computeDefaultConfidenceFactors(pobDp, []),
      source_references: pobDp ? buildSourceReferences(pobDp) : [],
      data_point_ids: pobDp ? [pobDp.id] : [],
      discrepancy_ids: [],
      user_modified: false,
    });
  }

  // 7. Coordinate labels at traverse vertices (station points)
  //    Show point number and (x, y) offset from POB so users can see the coordinate grid
  if (points.length > 1 && config.label_config.show_monuments) {
    // Only label corners that don't already have a monument symbol
    const monumentedIndices = new Set<number>();
    for (const mon of dataPoints.filter(dp => dp.data_category === 'monument')) {
      if (mon.sequence_order !== undefined && mon.sequence_order !== null) {
        monumentedIndices.add(mon.sequence_order);
      }
    }

    for (let i = 1; i < points.length; i++) {
      // Skip last point if it closes back to POB (within 1 ft)
      const pt = points[i];
      const pobPt = points[0];
      const isClosure = i === points.length - 1 &&
        Math.abs(pt.x - pobPt.x) < 1 && Math.abs(pt.y - pobPt.y) < 1;
      if (isClosure) continue;

      // Offset the label to the upper-right of the point
      const offsetX = 8;
      const offsetY = -12;

      elements.push({
        element_type: 'label',
        feature_class: 'annotation',
        geometry: {
          type: 'label',
          position: [pt.x + offsetX, pt.y + offsetY],
          anchor: 'start',
        },
        attributes: {
          text: `P${i} (${formatCoordinate(pt.x)}, ${formatCoordinate(pt.y)})`,
          label_type: 'coordinate',
          point_index: i,
          coord_x: pt.x,
          coord_y: pt.y,
        },
        layer: 'coordinates',
        z_index: 25,
        visible: true,
        locked: false,
        confidence_score: 100,
        confidence_factors: computeDefaultConfidenceFactors(undefined, []),
        source_references: [],
        data_point_ids: [],
        discrepancy_ids: [],
        user_modified: false,
      });
    }
  }

  return elements;
}

// ── Source Reference Building ─────────────────────────────────────────────────

function buildSourceReferences(dp: ExtractedDataPoint): SourceReference[] {
  return [{
    document_id: dp.document_id,
    document_label: dp.document_id, // label resolved at display time
    page: dp.source_page ?? 1,
    location: dp.source_location ?? '',
    excerpt: dp.source_text_excerpt ?? dp.raw_value.substring(0, 200),
    bounding_box: dp.source_bounding_box ?? undefined,
  }];
}

// ── Coordinate Formatting ────────────────────────────────────────────────────

/**
 * Format a survey coordinate value with sign for display on drawings.
 * Positive values show '+', negative values show '-'.
 */
function formatCoordinate(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}`;
}

// ── Discrepancy Lookup ───────────────────────────────────────────────────────

function findRelatedDiscrepancies(dataPointId: string, discrepancies: Discrepancy[]): string[] {
  return discrepancies
    .filter(d => d.data_point_ids.includes(dataPointId))
    .map(d => d.id);
}

// ── Default Confidence Factors ───────────────────────────────────────────────

function computeDefaultConfidenceFactors(
  dp: ExtractedDataPoint | undefined,
  relatedDiscrepancyIds: string[]
): ConfidenceFactors {
  const confidence = dp?.extraction_confidence ?? 50;
  const hasDiscrepancies = relatedDiscrepancyIds.length > 0;

  return {
    source_quality: Math.min(100, confidence + 10),
    extraction_certainty: confidence,
    cross_reference_match: hasDiscrepancies ? Math.max(20, confidence - 30) : Math.min(100, confidence + 15),
    geometric_consistency: 75, // default — updated after traverse closure check
    closure_contribution: 80, // default — updated after full closure analysis
  };
}

// ── SVG Path Generation ──────────────────────────────────────────────────────

/**
 * Generate an SVG path for a curve element using intermediate points.
 */
export function generateCurveSvgPath(
  startPoint: TraversePoint,
  curve: NormalizedCurveData
): string {
  const { intermediatePoints, endpoint } = computeCurvePoints(startPoint, curve);
  const allPoints = [startPoint, ...intermediatePoints, endpoint];

  // Build SVG path with line segments approximating the arc
  let path = `M ${allPoints[0].x} ${-allPoints[0].y}`;
  for (let i = 1; i < allPoints.length; i++) {
    path += ` L ${allPoints[i].x} ${-allPoints[i].y}`;
  }

  return path;
}

/**
 * Generate an SVG arc path (more compact than polyline approximation).
 */
export function generateArcSvgPath(
  startPoint: TraversePoint,
  curve: NormalizedCurveData
): string {
  const { endpoint } = computeCurvePoints(startPoint, curve);
  const radius = curve.radius;
  const largeArc = curve.delta_angle.decimal_degrees > 180 ? 1 : 0;
  const sweep = curve.direction === 'right' ? 1 : 0;

  return `M ${startPoint.x} ${-startPoint.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endpoint.x} ${-endpoint.y}`;
}

// ── Bounding Box ─────────────────────────────────────────────────────────────

/**
 * Compute the bounding box of a set of traverse points.
 * Adds padding for labels and title block.
 */
export function computeBoundingBox(
  points: TraversePoint[],
  padding: number = 50
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  if (points.length === 0) {
    return { minX: -padding, minY: -padding, maxX: padding, maxY: padding, width: 2 * padding || 100, height: 2 * padding || 100 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  // Ensure minimum dimensions to avoid division-by-zero during scale computation
  const width = maxX - minX;
  const height = maxY - minY;
  const minDim = padding > 0 ? padding * 2 : 100;
  if (width < minDim) {
    const cx = (minX + maxX) / 2;
    minX = cx - minDim / 2;
    maxX = cx + minDim / 2;
  }
  if (height < minDim) {
    const cy = (minY + maxY) / 2;
    minY = cy - minDim / 2;
    maxY = cy + minDim / 2;
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Calculate appropriate scale for fitting traverse into canvas.
 */
export function computeScale(
  points: TraversePoint[],
  canvasWidth: number,
  canvasHeight: number,
  margin: number = 100
): number {
  const bbox = computeBoundingBox(points, 0);
  const availableWidth = Math.max(1, canvasWidth - 2 * margin);
  const availableHeight = Math.max(1, canvasHeight - 2 * margin);

  // Guard against degenerate bbox
  if (bbox.width <= 0 || bbox.height <= 0) return 1;

  const scaleX = availableWidth / bbox.width;
  const scaleY = availableHeight / bbox.height;

  const scale = Math.min(scaleX, scaleY);
  // Clamp to a finite, positive value
  return isFinite(scale) && scale > 0 ? scale : 1;
}
