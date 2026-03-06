// lib/cad/labels/generate-labels.ts — Generate text labels for features based on layer display preferences
import type { Feature, Layer, TextLabel, LayerDisplayPreferences, Point2D, DisplayPreferences } from '../types';
import { generateId } from '../types';
import { DEFAULT_LAYER_DISPLAY_PREFERENCES, DEFAULT_TEXT_LABEL_STYLE } from '../constants';
import { inverseBearingDistance, formatBearing, formatAzimuth } from '../geometry/bearing';
import { computeAreaFromPoints2D } from '../geometry/area';

/**
 * Format a distance value according to display preferences.
 */
export function formatDistance(dist: number, prefs: DisplayPreferences): string {
  const converted = convertLinear(dist, prefs.linearUnit);
  if (prefs.linearFormat === 'FRACTION') {
    return formatFraction(converted, prefs.linearUnit);
  }
  return `${converted.toFixed(prefs.linearDecimalPlaces)} ${unitAbbrev(prefs.linearUnit)}`;
}

/**
 * Format a bearing according to display preferences.
 */
export function formatBearingForDisplay(azimuthDeg: number, prefs: DisplayPreferences): string {
  if (prefs.bearingFormat === 'AZIMUTH') {
    return formatAzimuth(azimuthDeg);
  }
  return formatBearing(azimuthDeg);
}

/**
 * Format an area according to display preferences.
 */
export function formatArea(sqft: number, prefs: DisplayPreferences): string {
  switch (prefs.areaUnit) {
    case 'ACRES': return `${(sqft / 43560).toFixed(prefs.linearDecimalPlaces)} ac`;
    case 'SQ_M': return `${(sqft * 0.09290304).toFixed(prefs.linearDecimalPlaces)} m²`;
    case 'HECTARES': return `${(sqft * 0.09290304 / 10000).toFixed(prefs.linearDecimalPlaces)} ha`;
    default: return `${sqft.toFixed(prefs.linearDecimalPlaces)} sq ft`;
  }
}

/**
 * Format coordinates according to display preferences.
 */
export function formatCoordinates(pt: Point2D, prefs: DisplayPreferences): string {
  const n = (pt.y + prefs.originNorthing).toFixed(prefs.linearDecimalPlaces);
  const e = (pt.x + prefs.originEasting).toFixed(prefs.linearDecimalPlaces);
  if (prefs.coordMode === 'XY') {
    return `X: ${e}, Y: ${n}`;
  }
  return `N: ${n}, E: ${e}`;
}

function convertLinear(feet: number, unit: string): number {
  switch (unit) {
    case 'IN': return feet * 12;
    case 'MILE': return feet / 5280;
    case 'M': return feet * 0.3048;
    case 'CM': return feet * 30.48;
    case 'MM': return feet * 304.8;
    default: return feet;
  }
}

function unitAbbrev(unit: string): string {
  switch (unit) {
    case 'IN': return 'in';
    case 'MILE': return 'mi';
    case 'M': return 'm';
    case 'CM': return 'cm';
    case 'MM': return 'mm';
    default: return 'ft';
  }
}

function formatFraction(value: number, unit: string): string {
  const whole = Math.floor(value);
  const frac = value - whole;
  if (frac < 0.001) return `${whole} ${unitAbbrev(unit)}`;
  // Find nearest 1/16th
  const sixteenths = Math.round(frac * 16);
  if (sixteenths === 16) return `${whole + 1} ${unitAbbrev(unit)}`;
  // Simplify fraction
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(sixteenths, 16);
  return `${whole} ${sixteenths / g}/${16 / g} ${unitAbbrev(unit)}`;
}

/**
 * Generate all text labels for a feature based on its layer's display preferences.
 * Preserves any user-positioned labels (ones that were manually moved).
 */
/**
 * Resolve display preferences for a layer, applying any per-layer overrides
 * on top of the drawing-level display preferences.
 */
export function resolveLayerDisplayPrefs(
  drawingPrefs: DisplayPreferences,
  layerPrefs: LayerDisplayPreferences,
): DisplayPreferences {
  return {
    ...drawingPrefs,
    bearingFormat: layerPrefs.bearingFormatOverride ?? drawingPrefs.bearingFormat,
    angleFormat: layerPrefs.angleFormatOverride ?? drawingPrefs.angleFormat,
    linearUnit: layerPrefs.linearUnitOverride ?? drawingPrefs.linearUnit,
    linearFormat: layerPrefs.linearFormatOverride ?? drawingPrefs.linearFormat,
    linearDecimalPlaces: layerPrefs.linearDecimalPlacesOverride ?? drawingPrefs.linearDecimalPlaces,
    areaUnit: layerPrefs.areaUnitOverride ?? drawingPrefs.areaUnit,
    coordMode: layerPrefs.coordModeOverride ?? drawingPrefs.coordMode,
  };
}

export function generateLabelsForFeature(
  feature: Feature,
  layer: Layer,
  displayPrefs: DisplayPreferences,
): TextLabel[] {
  const layerPrefs = layer.displayPreferences ?? DEFAULT_LAYER_DISPLAY_PREFERENCES;
  // Apply per-layer format overrides
  const resolvedPrefs = resolveLayerDisplayPrefs(displayPrefs, layerPrefs);
  const existing = feature.textLabels ?? [];
  const result: TextLabel[] = [];

  // Keep user-positioned labels as-is
  const userPositioned = new Map<string, TextLabel>();
  for (const label of existing) {
    if (label.userPositioned) {
      userPositioned.set(`${label.kind}:${label.featureId}`, label);
    }
  }

  function addOrKeep(kind: TextLabel['kind'], text: string, offset: Point2D, rotation: number | null, styleKey: keyof LayerDisplayPreferences): TextLabel {
    const key = `${kind}:${feature.id}`;
    const userLabel = userPositioned.get(key);
    if (userLabel) {
      // Update text but keep user's position/rotation/scale
      return { ...userLabel, text };
    }
    const style = (layerPrefs[styleKey] as TextLabel['style']) ?? { ...DEFAULT_TEXT_LABEL_STYLE };
    return {
      id: generateId(),
      featureId: feature.id,
      kind,
      text,
      offset,
      rotation,
      style,
      visible: true,
      scale: 1,
      userPositioned: false,
    };
  }

  // ── Point labels ──
  if (feature.type === 'POINT' && feature.geometry.point) {
    const pt = feature.geometry.point;
    const baseOffset = layerPrefs.pointLabelOffset;
    let yStep = 0;

    if (layerPrefs.showPointNames) {
      const name = String(feature.properties.name ?? feature.properties.pointNumber ?? '');
      if (name) {
        result.push(addOrKeep('POINT_NAME', name, { x: baseOffset.x, y: baseOffset.y + yStep }, null, 'pointNameTextStyle'));
        yStep -= 12;
      }
    }

    if (layerPrefs.showPointDescriptions) {
      const desc = String(feature.properties.description ?? feature.properties.code ?? '');
      if (desc) {
        result.push(addOrKeep('POINT_DESCRIPTION', desc, { x: baseOffset.x, y: baseOffset.y + yStep }, null, 'pointDescriptionTextStyle'));
        yStep -= 12;
      }
    }

    if (layerPrefs.showPointElevations) {
      const elev = feature.properties.elevation;
      if (elev !== undefined && elev !== null && elev !== '') {
        result.push(addOrKeep('POINT_ELEVATION', `El: ${Number(elev).toFixed(resolvedPrefs.linearDecimalPlaces)}`, { x: baseOffset.x, y: baseOffset.y + yStep }, null, 'pointElevationTextStyle'));
        yStep -= 12;
      }
    }

    if (layerPrefs.showPointCoordinates) {
      result.push(addOrKeep('POINT_COORDINATES', formatCoordinates(pt, resolvedPrefs), { x: baseOffset.x, y: baseOffset.y + yStep }, null, 'pointCoordinateTextStyle'));
    }
  }

  // ── Line labels (bearing/distance) ──
  if (feature.type === 'LINE' && feature.geometry.start && feature.geometry.end) {
    const { azimuth, distance } = inverseBearingDistance(feature.geometry.start, feature.geometry.end);
    const midX = (feature.geometry.start.x + feature.geometry.end.x) / 2;
    const midY = (feature.geometry.start.y + feature.geometry.end.y) / 2;

    // Line angle for text orientation (in radians)
    const dx = feature.geometry.end.x - feature.geometry.start.x;
    const dy = feature.geometry.end.y - feature.geometry.start.y;
    let lineAngle = Math.atan2(dy, dx);
    // Keep text readable (not upside down)
    if (lineAngle > Math.PI / 2 || lineAngle < -Math.PI / 2) {
      lineAngle += Math.PI;
    }

    if (layerPrefs.showBearings) {
      const bearingText = formatBearingForDisplay(azimuth, resolvedPrefs);
      result.push(addOrKeep('BEARING', bearingText, { x: 0, y: layerPrefs.bearingTextGap }, lineAngle, 'bearingTextStyle'));
    }

    if (layerPrefs.showDistances) {
      const distText = formatDistance(distance, resolvedPrefs);
      result.push(addOrKeep('DISTANCE', distText, { x: 0, y: -layerPrefs.distanceTextGap }, lineAngle, 'distanceTextStyle'));
    }
  }

  // ── Polyline labels (bearing/distance per segment) ──
  if (feature.type === 'POLYLINE' && feature.geometry.vertices && feature.geometry.vertices.length >= 2) {
    const verts = feature.geometry.vertices;
    for (let i = 0; i < verts.length - 1; i++) {
      const from = verts[i];
      const to = verts[i + 1];
      const { azimuth, distance } = inverseBearingDistance(from, to);

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      let lineAngle = Math.atan2(dy, dx);
      if (lineAngle > Math.PI / 2 || lineAngle < -Math.PI / 2) lineAngle += Math.PI;

      if (layerPrefs.showBearings) {
        const bearingText = formatBearingForDisplay(azimuth, resolvedPrefs);
        result.push({
          id: generateId(),
          featureId: feature.id,
          kind: 'BEARING',
          text: bearingText,
          offset: { x: 0, y: layerPrefs.bearingTextGap },
          rotation: lineAngle,
          style: layerPrefs.bearingTextStyle ?? { ...DEFAULT_TEXT_LABEL_STYLE },
          visible: true,
          scale: 1,
          userPositioned: false,
        });
      }

      if (layerPrefs.showDistances) {
        const distText = formatDistance(distance, resolvedPrefs);
        result.push({
          id: generateId(),
          featureId: feature.id,
          kind: 'DISTANCE',
          text: distText,
          offset: { x: 0, y: -layerPrefs.distanceTextGap },
          rotation: lineAngle,
          style: layerPrefs.distanceTextStyle ?? { ...DEFAULT_TEXT_LABEL_STYLE },
          visible: true,
          scale: 1,
          userPositioned: false,
        });
      }
    }
  }

  // ── Polygon labels (area, perimeter, segment labels) ──
  if (feature.type === 'POLYGON' && feature.geometry.vertices && feature.geometry.vertices.length >= 3) {
    const verts = feature.geometry.vertices;

    // Per-segment labels same as polyline
    for (let i = 0; i < verts.length; i++) {
      const from = verts[i];
      const to = verts[(i + 1) % verts.length];
      const { azimuth, distance } = inverseBearingDistance(from, to);

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      let lineAngle = Math.atan2(dy, dx);
      if (lineAngle > Math.PI / 2 || lineAngle < -Math.PI / 2) lineAngle += Math.PI;

      if (layerPrefs.showBearings) {
        result.push({
          id: generateId(),
          featureId: feature.id,
          kind: 'BEARING',
          text: formatBearingForDisplay(azimuth, resolvedPrefs),
          offset: { x: 0, y: layerPrefs.bearingTextGap },
          rotation: lineAngle,
          style: layerPrefs.bearingTextStyle ?? { ...DEFAULT_TEXT_LABEL_STYLE },
          visible: true,
          scale: 1,
          userPositioned: false,
        });
      }

      if (layerPrefs.showDistances) {
        result.push({
          id: generateId(),
          featureId: feature.id,
          kind: 'DISTANCE',
          text: formatDistance(distance, resolvedPrefs),
          offset: { x: 0, y: -layerPrefs.distanceTextGap },
          rotation: lineAngle,
          style: layerPrefs.distanceTextStyle ?? { ...DEFAULT_TEXT_LABEL_STYLE },
          visible: true,
          scale: 1,
          userPositioned: false,
        });
      }
    }

    // Area label at centroid
    if (layerPrefs.showArea) {
      const area = computeAreaFromPoints2D(verts);
      const areaText = formatArea(area.squareFeet, resolvedPrefs);
      // Compute centroid
      const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
      const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
      result.push(addOrKeep('AREA', areaText, { x: 0, y: 0 }, null, 'areaTextStyle'));
    }

    if (layerPrefs.showPerimeter) {
      let perimeter = 0;
      for (let i = 0; i < verts.length; i++) {
        const from = verts[i];
        const to = verts[(i + 1) % verts.length];
        perimeter += Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
      }
      const perimText = `P: ${formatDistance(perimeter, resolvedPrefs)}`;
      result.push(addOrKeep('PERIMETER', perimText, { x: 0, y: -15 }, null, 'areaTextStyle'));
    }
  }

  return result;
}

/**
 * Regenerate labels for all features on a given layer.
 * Returns a map of featureId -> new TextLabel[].
 */
export function regenerateLayerLabels(
  features: Feature[],
  layer: Layer,
  displayPrefs: DisplayPreferences,
): Map<string, TextLabel[]> {
  const result = new Map<string, TextLabel[]>();
  for (const feature of features) {
    if (feature.layerId === layer.id) {
      result.set(feature.id, generateLabelsForFeature(feature, layer, displayPrefs));
    }
  }
  return result;
}
