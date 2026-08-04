// lib/cad/compare/comparison-overlay.ts — CAD_AUDIT Slice S9c.
//
// Put the OTHER survey on the canvas, beside the one you are drawing.
//
// ── WHY THIS IS A LAYER AND NOT A BESPOKE OVERLAY ───────────────────────────────────────────────
//
// S9b compares two readings and reports the difference in a dialog, leading with the basis rotation
// so a change of frame is not presented as eighteen errors. S9c is the half that was left: seeing
// the two figures together, because a surveyor reading "course 7 differs by 0.4 ft" wants to know
// WHERE, and a list cannot answer that.
//
// The obvious implementation is a custom render pass in `CanvasViewport`. This is not that, and the
// reason is not caution — it is that a real layer is **better**, not merely cheaper:
//
//   * it zooms, pans and prints with the drawing, for free and correctly;
//   * it can be toggled from the layer panel the surveyor already uses, so hiding the reference is
//     where they would look for it;
//   * it can be SNAPPED to and measured against, which is most of why you want the prior survey
//     on screen at all;
//   * and it survives save/load, so the comparison is still there tomorrow.
//
// A bespoke overlay would have to reimplement each of those, and would get the fourth wrong by
// default.
//
// ── LOCKED, AND NAMED AFTER ITS SOURCE ──────────────────────────────────────────────────────────
//
// The layer is created `locked: true`. A reference figure that can be dragged is a reference figure
// that will eventually be edited by accident and then believed — the failure this codebase spends
// most of its guards preventing, in the one place where the wrong line is somebody else's survey.
//
// The id carries the source's name so two comparisons do not collide, and so the layer panel says
// which record is on screen rather than "COMPARE".

import type { Feature, Layer } from '../types';
import { featuresFromSurveyReading, type SurveyReadingLike, type DrawFromReadingResult } from '../import/from-survey-reading';

/** A colour no default layer uses, so the reference reads as "not mine" at a glance. */
export const COMPARISON_COLOR = '#c026d3';

export interface ComparisonOverlay {
  /** The one layer every feature below sits on. */
  layer: Layer;
  features: Feature[];
  /** Carried through from the import so the caller can state what the reference could NOT show. */
  notDrawn: DrawFromReadingResult['notDrawn'];
  closed: boolean;
}

/** Stable, collision-free layer id for a named source. */
export function comparisonLayerId(sourceName: string): string {
  const slug = sourceName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase().slice(0, 24);
  return `COMPARE-${slug || 'SURVEY'}`;
}

/**
 * Turn a prior survey reading into one locked, distinctly-coloured reference layer.
 *
 * Reuses `featuresFromSurveyReading` rather than re-deriving geometry — the import path is the one
 * that has been driven against real readings, and a second implementation of "reading → geometry"
 * is how the two would come to disagree about the same deed.
 *
 * Every feature is retargeted onto the single comparison layer. The import normally spreads geometry
 * across RESEARCH_BOUNDARY and RESEARCH_MONUMENTS, which is right for a drawing you are building and
 * wrong for a reference you want to hide with one click.
 */
export function comparisonOverlay(
  reading: SurveyReadingLike,
  sourceName: string,
  sortOrder: number,
): ComparisonOverlay {
  const drawn = featuresFromSurveyReading(reading);
  const id = comparisonLayerId(sourceName);

  const layer: Layer = {
    id,
    name: `Compare: ${sourceName}`,
    visible: true,
    // The whole point. See the header.
    locked: true,
    frozen: false,
    color: COMPARISON_COLOR,
    lineWeight: 0.35,
    lineTypeId: 'DASHED',
    opacity: 0.85,
    groupId: null,
    sortOrder,
    isDefault: false,
    isProtected: false,
    autoAssignCodes: [],
  };

  return {
    layer,
    // Retargeted onto the one layer, and the colour is forced in the feature's STYLE — not as a
    // top-level `color`, which `Feature` does not have. A first version wrote `{ ...f, color }`;
    // `tsc` rejected it in the test that read the field back, which is the only reason it was not
    // shipped as a silently-ignored property. The import sets a boundary colour of its own, and a
    // feature's style overrides the layer's, so without this the reference would draw in the
    // research-boundary colour and read as the surveyor's own work.
    features: drawn.features.map((f) => ({
      ...f,
      layerId: id,
      style: { ...f.style, color: COMPARISON_COLOR, lineTypeId: 'DASHED' },
    })),
    notDrawn: drawn.notDrawn,
    closed: drawn.closed,
  };
}
