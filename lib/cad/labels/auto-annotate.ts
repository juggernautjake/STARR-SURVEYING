// lib/cad/labels/auto-annotate.ts — Auto-generate annotations for a survey drawing
import type { Feature, SurveyPoint, Point2D } from '../types';
import type { Traverse } from '../types';
import type { AnnotationBase } from './annotation-types';
import { createBearingDimension, DEFAULT_BEARING_DIM_CONFIG } from './bearing-dim';
import type { BearingDimConfig } from './bearing-dim';
import { createCurveDataAnnotation, DEFAULT_CURVE_DATA_CONFIG } from './curve-label';
import type { CurveDataConfig } from './curve-label';
import { createMonumentLabel, DEFAULT_MONUMENT_LABEL_CONFIG } from './monument-label';
import type { MonumentLabelConfig } from './monument-label';
import { createAreaAnnotation, DEFAULT_AREA_LABEL_CONFIG } from './area-label';
import type { AreaLabelConfig } from './area-label';
import { inverseBearingDistance } from '../geometry/bearing';

export interface AutoAnnotateConfig {
  bearingDim: BearingDimConfig;
  curveData: CurveDataConfig;
  monumentLabel: MonumentLabelConfig;
  areaLabel: AreaLabelConfig;
  generateBearingDims: boolean;
  generateCurveData: boolean;
  generateMonumentLabels: boolean;
  generateAreaLabels: boolean;
  boundaryLayerIds: string[];
  monumentLayerIds: string[];
}

export const DEFAULT_AUTO_ANNOTATE_CONFIG: AutoAnnotateConfig = {
  bearingDim: DEFAULT_BEARING_DIM_CONFIG,
  curveData: DEFAULT_CURVE_DATA_CONFIG,
  monumentLabel: DEFAULT_MONUMENT_LABEL_CONFIG,
  areaLabel: DEFAULT_AREA_LABEL_CONFIG,
  generateBearingDims: true,
  generateCurveData: true,
  generateMonumentLabels: true,
  generateAreaLabels: true,
  boundaryLayerIds: ['BOUNDARY', 'EASEMENT', 'ROW', 'BUILDING-LINE'],
  monumentLayerIds: ['BOUNDARY-MON'],
};

function getFeatureVertices(feature: Feature): Point2D[] | null {
  const geom = feature.geometry;
  switch (geom.type) {
    case 'LINE':     return geom.start && geom.end ? [geom.start, geom.end] : null;
    case 'POLYLINE':
    case 'POLYGON':  return geom.vertices ?? null;
    default:         return null;
  }
}

/**
 * Auto-annotate: generate bearing/distance dims, curve data, monument labels,
 * and area labels for a complete survey drawing.
 */
export function autoAnnotate(
  features: Feature[],
  points: SurveyPoint[],
  traverses: Traverse[],
  config: AutoAnnotateConfig,
): AnnotationBase[] {
  const annotations: AnnotationBase[] = [];

  // 1. Bearing/distance on boundary lines
  if (config.generateBearingDims) {
    for (const feature of features) {
      if (!config.boundaryLayerIds.includes(feature.layerId)) continue;
      const verts = getFeatureVertices(feature);
      if (!verts || verts.length < 2) continue;

      for (let i = 0; i < verts.length - 1; i++) {
        annotations.push(
          createBearingDimension(verts[i], verts[i + 1], config.bearingDim, feature.id, i),
        );
      }
      // Close polygon boundary
      if (feature.type === 'POLYGON' && verts.length >= 3) {
        annotations.push(
          createBearingDimension(
            verts[verts.length - 1],
            verts[0],
            config.bearingDim,
            feature.id,
            verts.length - 1,
          ),
        );
      }
    }
  }

  // 2. Curve data on arcs
  if (config.generateCurveData) {
    for (const feature of features) {
      if (feature.geometry.type === 'ARC' && feature.geometry.arc) {
        const arc = feature.geometry.arc;
        const delta = Math.abs(arc.endAngle - arc.startAngle);
        const L = arc.radius * delta;
        const C = 2 * arc.radius * Math.sin(delta / 2);
        const T = arc.radius * Math.tan(delta / 2);
        // Compute chord bearing (azimuth) from PC → PT
        const pcPt: Point2D = {
          x: arc.center.x + arc.radius * Math.cos(arc.startAngle),
          y: arc.center.y + arc.radius * Math.sin(arc.startAngle),
        };
        const ptPt: Point2D = {
          x: arc.center.x + arc.radius * Math.cos(arc.endAngle),
          y: arc.center.y + arc.radius * Math.sin(arc.endAngle),
        };
        const CB = inverseBearingDistance(pcPt, ptPt).azimuth;
        const roughParams = {
          R: arc.radius,
          delta,
          L,
          C,
          CB,
          T,
          E: arc.radius * (1 / Math.cos(delta / 2) - 1),
          M: arc.radius * (1 - Math.cos(delta / 2)),
          D: (180 / Math.PI) * (100 / arc.radius),
          direction: 'LEFT' as const,
          pc: pcPt,
          pt: ptPt,
          pi: arc.center,
          rp: arc.center,
          mpc: {
            x: arc.center.x + arc.radius * Math.cos((arc.startAngle + arc.endAngle) / 2),
            y: arc.center.y + arc.radius * Math.sin((arc.startAngle + arc.endAngle) / 2),
          },
          tangentInBearing: arc.startAngle * (180 / Math.PI),
          tangentOutBearing: arc.endAngle * (180 / Math.PI),
        };
        annotations.push(createCurveDataAnnotation(roughParams, feature.id, config.curveData));
      }
    }
  }

  // 3. Monument labels
  if (config.generateMonumentLabels) {
    for (const point of points) {
      if (!point.codeDefinition || point.codeDefinition.category !== 'BOUNDARY_CONTROL') continue;
      annotations.push(createMonumentLabel(point, config.monumentLabel));
    }
  }

  // 4. Area labels for closed traverses
  if (config.generateAreaLabels) {
    for (const traverse of traverses) {
      if (!traverse.isClosed || !traverse.area) continue;
      const verts = traverse.pointIds
        .map((id) => {
          const pt = points.find((p) => p.id === id);
          return pt ? { x: pt.easting, y: pt.northing } : null;
        })
        .filter((p): p is Point2D => p !== null);
      if (verts.length < 3) continue;
      annotations.push(createAreaAnnotation(traverse.id, verts, config.areaLabel));
    }
  }

  return annotations;
}
