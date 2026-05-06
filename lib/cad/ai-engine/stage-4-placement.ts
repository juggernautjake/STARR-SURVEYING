// lib/cad/ai-engine/stage-4-placement.ts
//
// Phase 6 Stage 4 — intelligent placement. Picks the paper
// size + orientation + scale + rotation + template that fits
// the survey's feature extents most tightly. Pure function;
// no DB.
//
// Algorithm (mirrors the spec):
//   1. Compute the merged bounding box of every feature.
//   2. Build a candidate list across paper × orientation ×
//      scale × rotation. Rotation candidates: 0° always plus
//      the negative bearing of the longest LINE feature so a
//      long lot frontage runs horizontal on the sheet.
//   3. For each candidate, the rotated survey extents must fit
//      inside the printable area (paper minus margins minus
//      title-block reserved width).
//   4. Score: 1/scale × 10000 + fillRatio × 100 − paperPriority
//      × 50 → prefer larger scale (more detail), better fill,
//      smaller paper.
//   5. Return the highest-scoring config; fall back to a sane
//      default (TABLOID landscape 1"=50') when nothing fits.

import { computeFeaturesBounds } from '../geometry/bounds';
import {
  PAPER_DIMENSIONS,
  type PaperSize,
} from '../templates/types';
import type { DrawingTemplate } from '../templates/types';
import type { Feature } from '../types';

import type { PlacementConfig } from './types';

const PAPER_PRIORITY: PaperSize[] = [
  'TABLOID',
  'ARCH_C',
  'ARCH_D',
  'LETTER',
  'ARCH_E',
];

const SCALE_CANDIDATES: number[] = [
  20, 30, 40, 50, 60, 80, 100, 150, 200,
];

const TITLE_BLOCK_RESERVED_INCHES = 2.5;

interface ScoredCandidate extends PlacementConfig {
  score: number;
}

/**
 * Pick the best paper / orientation / scale / rotation combo
 * for the given feature set. Honors the template&apos;s margins +
 * title-block geometry when one is provided; falls back to
 * conservative defaults when not.
 */
export function computeOptimalPlacement(
  features: Feature[],
  template: DrawingTemplate | null
): PlacementConfig {
  const bounds = computeFeaturesBounds(features);
  if (!bounds) {
    return defaultPlacement(template);
  }
  const surveyWidth = Math.max(0, bounds.maxX - bounds.minX);
  const surveyHeight = Math.max(0, bounds.maxY - bounds.minY);
  if (surveyWidth === 0 && surveyHeight === 0) {
    return defaultPlacement(template);
  }

  // Rotation candidates: 0° + the negative azimuth of the
  // longest LINE feature so a long lot frontage runs horizontal.
  const rotations: number[] = [0];
  const longestBearing = findLongestBoundaryBearing(features);
  if (longestBearing !== null) {
    // Convert azimuth → drawing rotation: a line at azimuth A
    // becomes horizontal when the drawing rotates by -A (CCW
    // positive). Spec uses degrees; we follow.
    rotations.push(-longestBearing);
  }

  const margins = template?.margins ?? {
    top: 0.5,
    right: 0.5,
    bottom: 0.5,
    left: 0.5,
  };
  const titleBlockReserved = template?.titleBlock
    ? TITLE_BLOCK_RESERVED_INCHES
    : 0;

  const candidates: ScoredCandidate[] = [];

  for (const paper of PAPER_PRIORITY) {
    const dims = PAPER_DIMENSIONS[paper];
    for (const orientation of ['LANDSCAPE', 'PORTRAIT'] as const) {
      const pw = orientation === 'LANDSCAPE' ? dims.height : dims.width;
      const ph = orientation === 'LANDSCAPE' ? dims.width : dims.height;
      const drawW =
        pw - margins.left - margins.right - titleBlockReserved;
      const drawH = ph - margins.top - margins.bottom;
      if (drawW <= 0 || drawH <= 0) continue;

      for (const scale of SCALE_CANDIDATES) {
        for (const rotDeg of rotations) {
          const rotRad = (rotDeg * Math.PI) / 180;
          const cos = Math.abs(Math.cos(rotRad));
          const sin = Math.abs(Math.sin(rotRad));
          const rw = surveyWidth * cos + surveyHeight * sin;
          const rh = surveyWidth * sin + surveyHeight * cos;

          const sw = rw / scale;
          const sh = rh / scale;
          if (sw > drawW || sh > drawH) continue;

          const fillRatio = (sw * sh) / (drawW * drawH);
          const paperPriority = PAPER_PRIORITY.indexOf(paper);
          const score =
            (1 / scale) * 10000 + fillRatio * 100 - paperPriority * 50;

          candidates.push({
            paperSize: paper,
            orientation,
            scale,
            rotation: rotDeg,
            centerOffset: { x: 0, y: 0 },
            templateId: template?.id ?? 'default',
            autoSelected: true,
            score,
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return defaultPlacement(template);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { score: _score, ...best } = candidates[0];
  return best;
}

function defaultPlacement(
  template: DrawingTemplate | null
): PlacementConfig {
  return {
    paperSize: 'TABLOID',
    orientation: 'LANDSCAPE',
    scale: 50,
    rotation: 0,
    centerOffset: { x: 0, y: 0 },
    templateId: template?.id ?? 'default',
    autoSelected: true,
  };
}

/**
 * Find the bearing (azimuth degrees) of the single longest
 * LINE feature in the set, or null if no LINE features exist.
 * Used by Stage 4 to align long boundaries horizontally on
 * the sheet.
 */
export function findLongestBoundaryBearing(
  features: Feature[]
): number | null {
  let bestLength = 0;
  let bestBearing: number | null = null;
  for (const f of features) {
    if (f.type !== 'LINE') continue;
    const start = f.geometry.start;
    const end = f.geometry.end;
    if (!start || !end) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= bestLength) continue;

    // Azimuth = angle from north (positive Y), clockwise.
    // atan2(dx, dy) gives that directly in radians (for a
    // standard CAD coordinate system where +Y = north).
    const azRad = Math.atan2(dx, dy);
    let azDeg = (azRad * 180) / Math.PI;
    if (azDeg < 0) azDeg += 360;
    bestLength = length;
    bestBearing = azDeg;
  }
  return bestBearing;
}
