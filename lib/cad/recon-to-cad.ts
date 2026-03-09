// lib/cad/recon-to-cad.ts — Convert RECON DrawingElements to a CAD DrawingDocument
//
// This module bridges the STARR RECON research pipeline and the STARR CAD editor.
// It takes the AI-derived drawing elements produced by the research geometry engine
// and converts them into a fully-formed DrawingDocument that can be loaded directly
// into the CAD editor for professional editing and annotation.

import { generateId } from './types';
import type {
  DrawingDocument,
  Feature,
  FeatureGeometry,
  FeatureStyle,
  FeatureType,
  ArcGeometry,
  Point2D,
} from './types';
import { DEFAULT_DRAWING_SETTINGS } from './constants';
import {
  DEFAULT_LAYER_GROUPS,
  getDefaultLayersRecord,
  getDefaultLayerOrder,
} from './styles/default-layers';
import { DEFAULT_GLOBAL_STYLE_CONFIG } from './styles/types';
import type { DrawingElement, RenderedDrawing, FeatureClass, ElementGeometry } from '@/types/research';

// ── Layer mapping ──────────────────────────────────────────────────────────────

/** Maps RECON FeatureClass values to the matching built-in CAD layer IDs. */
const FEATURE_CLASS_TO_LAYER_ID: Record<FeatureClass, string> = {
  property_boundary: 'BOUNDARY',
  lot_line:          'BOUNDARY',
  easement:          'EASEMENT',
  setback:           'BUILDING-LINE',
  right_of_way:      'ROW',
  road:              'TRANSPORTATION',
  concrete:          'STRUCTURES',
  building:          'STRUCTURES',
  fence:             'FENCE',
  utility:           'UTILITY-WATER',
  water_feature:     'WATER-FEATURES',
  tree_line:         'VEGETATION',
  contour:           'TOPO',
  centerline:        'TRANSPORTATION',
  monument:          'BOUNDARY-MON',
  control_point:     'CONTROL',
  annotation:        'ANNOTATION',
  title_block:       'TITLE-BLOCK',
  other:             'MISC',
};

// ── Style conversion ──────────────────────────────────────────────────────────

/**
 * Infer a CAD lineTypeId from a CSS stroke-dasharray string.
 * Returns a built-in line type ID string.
 */
function dashArrayToLineType(dashArray?: string): string {
  if (!dashArray || dashArray === 'none' || dashArray === '') return 'SOLID';
  // Count comma-separated segments to classify the pattern
  const parts = dashArray.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 4) return 'DASH_DOT';
  if (parts.length === 2) return 'DASHED';
  return 'SOLID';
}

/** Convert an RECON ElementStyle to a CAD FeatureStyle. */
function convertElementStyle(
  elStyle: DrawingElement['style'],
  feetPerPixel: number,
): FeatureStyle {
  // Stroke width: canvas pixels → approximate line weight in mm (survey drawing convention)
  // 1 ft = 304.8 mm; at a typical 1"=50' scale (96 px/in), 1 px ≈ 0.52 ft ≈ 158 mm in world space.
  // We store lineWeight in survey drawing mm (effectively a display weight), clamping to sensible range.
  const rawLineWeight = elStyle.strokeWidth * feetPerPixel * 0.35;
  const lineWeight = Math.max(0.1, Math.min(2.5, +rawLineWeight.toFixed(2)));

  return {
    color: elStyle.stroke || null,
    lineWeight,
    opacity: typeof elStyle.opacity === 'number' ? elStyle.opacity : 1,
    lineTypeId: dashArrayToLineType(elStyle.strokeDasharray),
    symbolId: null,
    symbolSize: null,
    symbolRotation: typeof elStyle.rotation === 'number' ? elStyle.rotation : 0,
    labelVisible: null,
    labelFormat: null,
    labelOffset: { x: 0, y: 0 },
    isOverride: true,
  };
}

// ── Geometry conversion ───────────────────────────────────────────────────────

/**
 * Convert an [x, y] canvas-pixel tuple to a survey-space Point2D.
 *
 * Canvas convention:  origin at top-left, Y increases downward.
 * Survey convention:  origin at centre of bounding box, Y increases upward (north).
 */
function canvasToSurvey(
  cx: number,
  cy: number,
  originX: number,
  originY: number,
  feetPerPixel: number,
): Point2D {
  return {
    x: (cx - originX) * feetPerPixel,
    y: -(cy - originY) * feetPerPixel, // flip Y
  };
}

/**
 * Convert an RECON ElementGeometry to a CAD FeatureGeometry.
 * Returns null for element types that cannot be mapped.
 */
function convertGeometry(
  elemGeom: ElementGeometry,
  featureType: FeatureType,
  originX: number,
  originY: number,
  feetPerPixel: number,
): FeatureGeometry | null {
  switch (elemGeom.type) {
    case 'line': {
      const start = canvasToSurvey(elemGeom.start[0], elemGeom.start[1], originX, originY, feetPerPixel);
      const end   = canvasToSurvey(elemGeom.end[0],   elemGeom.end[1],   originX, originY, feetPerPixel);
      return { type: 'LINE', start, end };
    }

    case 'polygon': {
      if (elemGeom.points.length < 2) return null;
      const vertices = elemGeom.points.map(([px, py]) =>
        canvasToSurvey(px, py, originX, originY, feetPerPixel),
      );
      return { type: featureType === 'POLYLINE' ? 'POLYLINE' : 'POLYGON', vertices };
    }

    case 'point': {
      const point = canvasToSurvey(
        elemGeom.position[0], elemGeom.position[1],
        originX, originY, feetPerPixel,
      );
      return { type: 'POINT', point };
    }

    case 'curve': {
      // RECON stores angles in SVG/math convention (radians, measured from east, CCW positive).
      // CAD ArcGeometry uses the same convention.
      const center = canvasToSurvey(
        elemGeom.center[0], elemGeom.center[1],
        originX, originY, feetPerPixel,
      );
      const radius = elemGeom.radius * feetPerPixel;
      // Flip start/end angles when converting from SVG (Y-down) to survey (Y-up):
      //   In SVG space CW becomes CCW in math space.
      //   SVG angle → survey angle = -(SVG angle)
      const startAngle = -elemGeom.endAngle;   // swap and negate
      const endAngle   = -elemGeom.startAngle;
      const anticlockwise = elemGeom.direction === 'cw'; // cw in SVG = ccw in survey
      const arc: ArcGeometry = { center, radius, startAngle, endAngle, anticlockwise };
      return { type: 'ARC', arc };
    }

    case 'label': {
      const point = canvasToSurvey(
        elemGeom.position[0], elemGeom.position[1],
        originX, originY, feetPerPixel,
      );
      return { type: 'TEXT', point };
    }

    default:
      return null;
  }
}

/** Map an RECON element_type (+ geometry type) to the corresponding CAD FeatureType. */
function resolveFeatureType(elementType: string, geomType: string): FeatureType {
  if (elementType === 'point' || geomType === 'point')    return 'POINT';
  if (elementType === 'curve' || geomType === 'curve')    return 'ARC';
  if (elementType === 'label'
    || elementType === 'callout'
    || elementType === 'dimension') return 'TEXT';
  if (geomType === 'polygon')                             return 'POLYGON';
  if (geomType === 'line')                                return 'LINE';
  // fallback
  return 'LINE';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a RECON research drawing into a CAD DrawingDocument.
 *
 * The resulting document:
 * - Uses all standard survey layers (BOUNDARY, BOUNDARY-MON, EASEMENT, ROW, …)
 * - Preserves element geometry with coordinate system conversion
 * - Carries forward visual style (color, line weight, opacity, dash pattern)
 * - Populates the title block with the project name
 * - Can be passed directly to `drawingStore.loadDocument()` in the CAD editor
 *
 * @param drawing      The RECON RenderedDrawing record (canvas config, metadata)
 * @param elements     The drawing_elements rows for that drawing
 * @param projectName  Optional display name for the title block
 */
export function convertReconToCAD(
  drawing: RenderedDrawing,
  elements: DrawingElement[],
  projectName?: string,
): DrawingDocument {
  const now = new Date().toISOString();

  // ── Coordinate-system conversion factor ─────────────────────────────────────
  // canvas_config.scale = displayScale = ft per screen-inch at 96 DPI
  //   → feetPerPixel = displayScale / 96
  const displayScale = drawing.canvas_config?.scale ?? 50;
  const feetPerPixel = displayScale / 96;
  const originX = drawing.canvas_config?.origin?.[0] ?? 0;
  const originY = drawing.canvas_config?.origin?.[1] ?? 0;

  // ── Build features ───────────────────────────────────────────────────────────
  const features: Record<string, Feature> = {};

  for (const el of elements) {
    if (!el.visible) continue;

    const featureType = resolveFeatureType(el.element_type, el.geometry?.type ?? '');
    const geom = convertGeometry(el.geometry, featureType, originX, originY, feetPerPixel);
    if (!geom) continue;

    const layerId = FEATURE_CLASS_TO_LAYER_ID[el.feature_class] ?? 'MISC';
    const style = convertElementStyle(el.style, feetPerPixel);

    // Carry through text content for label/callout/dimension elements
    let textContent: string | undefined;
    if (featureType === 'TEXT') {
      textContent =
        typeof el.attributes?.text === 'string' ? el.attributes.text
        : typeof el.attributes?.label === 'string' ? el.attributes.label
        : typeof el.attributes?.content === 'string' ? el.attributes.content
        : '';
      if (textContent) {
        geom.textContent = textContent;
        if (typeof el.style.rotation === 'number') {
          geom.textRotation = (el.style.rotation * Math.PI) / 180;
        }
      }
    }

    const feature: Feature = {
      id: el.id,
      type: featureType,
      geometry: geom,
      layerId,
      style,
      properties: {
        recon_element_id:    el.id,
        feature_class:       el.feature_class,
        confidence_score:    el.confidence_score,
        user_modified:       el.user_modified ? 1 : 0,
        ...(el.user_notes ? { user_notes: el.user_notes } : {}),
      },
    };

    features[feature.id] = feature;
  }

  // ── Build layer records from the standard set ────────────────────────────────
  const layers = getDefaultLayersRecord();
  const layerOrder = getDefaultLayerOrder();

  // ── Assemble title block metadata from project name ──────────────────────────
  const nameParts = (projectName ?? '').split(/[,\n]/).map(s => s.trim());
  const projectTitle = nameParts[0] || 'RECON Survey';
  const clientLine   = nameParts.slice(1).join(', ') || '';

  // ── Compose final DrawingDocument ────────────────────────────────────────────
  const doc: DrawingDocument = {
    id: generateId(),
    name: drawing.name || projectTitle,
    created: drawing.created_at || now,
    modified: now,
    author: 'STARR RECON',

    features,
    layers,
    layerOrder,
    featureGroups: {},
    layerGroups: Object.fromEntries(DEFAULT_LAYER_GROUPS.map(g => [g.id, g])),
    layerGroupOrder: DEFAULT_LAYER_GROUPS.map(g => g.id),
    customSymbols: [],
    customLineTypes: [],
    codeStyleOverrides: {},
    globalStyleConfig: { ...DEFAULT_GLOBAL_STYLE_CONFIG },
    projectImages: {},

    settings: {
      ...DEFAULT_DRAWING_SETTINGS,
      titleBlock: {
        ...DEFAULT_DRAWING_SETTINGS.titleBlock,
        visible: true,
        projectName: projectTitle,
        clientName: clientLine,
        surveyType: 'BOUNDARY SURVEY',
        scaleLabel: `1" = ${Math.round(displayScale)}'`,
      },
    },
  };

  return doc;
}

// ── Utility: check if a research project has usable elements ──────────────────

/** Returns true when the elements list contains at least one geometry-bearing element. */
export function hasConvertibleElements(elements: DrawingElement[]): boolean {
  return elements.some(el => el.visible && el.geometry?.type);
}
