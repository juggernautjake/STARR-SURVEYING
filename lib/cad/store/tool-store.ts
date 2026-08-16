// lib/cad/store/tool-store.ts — Active tool state
import { create } from 'zustand';
import type { ToolType, ToolState, Point2D } from '../types';

// ── C14b — "is this tool mid-pick?", answered in ONE place ──────────────────────────────────────
//
// C14 shipped the universal Escape by reading `drawingPoints.length > 0` to tell "abandon the
// half-drawn geometry" from "leave the tool". That is correct for every tool that accumulates
// clicks into `drawingPoints` — and it is the wrong question for the nine tools that park their
// first pick in a field of their own. Pick one line with FILLET and press Escape and you do not
// abandon the pick, you lose the tool; the same for MOVE after a base point, ROTATE after a
// centre, MATCH_PROPERTIES after a source — whose own code comment promises "stays in apply mode
// until the surveyor hits Esc", which is precisely what it did not do.
//
// `getPromptHint` in CommandBar.tsx had the identical blind spot from the other side: written as
// `drawingPointsCount === 0 ? askForFirst : askForSecond`, it sat on stage 1 forever for those
// tools, so the command line kept asking for the pick the surveyor had already made.
//
// Two symptoms, one missing definition. It lives here rather than in either caller because a
// definition kept in two places is how the two drifted apart to begin with — and because a tool
// added later gets both behaviours by adding one line to this list.
//
// Only PENDING state belongs here: a field that means "this tool is part-way through". Option-bar
// settings (fillet radius, divide count, offset distance) deliberately survive — they are the
// surveyor's configuration, not an in-progress operation.

/** The tool-state fields that mean "a pick is pending", with the extra fields each one owns. */
const PENDING_PICK_FIELDS: ReadonlyArray<{
  readonly field: keyof ToolState;
  /** Set back to their defaults alongside `field` when the pick is abandoned. */
  readonly alsoClears?: ReadonlyArray<keyof ToolState>;
}> = [
  { field: 'basePoint', alsoClears: ['displacement'] },
  { field: 'rotateCenter' },
  { field: 'offsetSourceId', alsoClears: ['offsetSourceSegmentIndex'] },
  { field: 'filletPickedLineId', alsoClears: ['filletPickedClickPoint'] },
  { field: 'chamferPickedLineId', alsoClears: ['chamferPickedClickPoint'] },
  { field: 'matchPropertiesSourceId' },
  { field: 'perpStartPoint', alsoClears: ['perpBaseLineId', 'perpBaseDir', 'perpLengthFeet'] },
  { field: 'arrayPolarCenter' },
];

/**
 * True when the active tool is part-way through a multi-click operation.
 *
 * Deliberately includes `drawingPoints`, so this is the whole question rather than "the half C14
 * missed" — a caller that has to remember to ask two questions is a caller that will one day ask
 * only one.
 */
export function hasPendingPick(state: ToolState): boolean {
  if (state.drawingPoints.length > 0) return true;
  return PENDING_PICK_FIELDS.some(({ field }) => state[field] != null);
}

/**
 * The prompt stage the tool is on: 0 before the first pick, 1 after it.
 *
 * `drawingPoints.length` is returned as-is because the variable-length tools count their own
 * vertices in the prompt text ("3 pts — Enter to finish"), and a staged tool that parks one id
 * reads as exactly one pick made.
 */
export function pickStage(state: ToolState): number {
  if (state.drawingPoints.length > 0) return state.drawingPoints.length;
  return PENDING_PICK_FIELDS.some(({ field }) => state[field] != null) ? 1 : 0;
}

interface ToolStore {
  state: ToolState;

  setTool: (tool: ToolType) => void;
  addDrawingPoint: (point: Point2D) => void;
  popDrawingPoint: () => void;
  setPreviewPoint: (point: Point2D | null) => void;
  clearDrawingPoints: () => void;
  setBasePoint: (point: Point2D | null) => void;
  setDisplacement: (point: Point2D) => void;
  setRotateCenter: (point: Point2D | null) => void;
  setRotateAngle: (angle: number) => void;
  setBoxSelect: (start: Point2D | null, end: Point2D | null, active: boolean) => void;
  setRegularPolygonSides: (sides: number) => void;
  setOrthoEnabled: (enabled: boolean) => void;
  setPolarEnabled: (enabled: boolean) => void;
  setPolarAngle: (angle: number) => void;
  setCopyMode: (enabled: boolean) => void;
  setDrawStyle: (style: Partial<ToolState['drawStyle']>) => void;
  setOffsetSourceId: (id: string | null) => void;
  setOffsetDistance: (dist: number) => void;
  setOffsetSide: (side: 'LEFT' | 'RIGHT' | 'BOTH') => void;
  setOffsetCornerHandling: (mode: 'MITER' | 'ROUND' | 'CHAMFER') => void;
  setOffsetMode: (mode: 'PARALLEL' | 'SCALE' | 'TRANSLATE') => void;
  setOffsetScaleFactor: (factor: number) => void;
  setOffsetScaleLineWeight: (enabled: boolean) => void;
  setOffsetSegmentMode: (mode: 'WHOLE' | 'SEGMENT') => void;
  setOffsetSourceSegmentIndex: (index: number | null) => void;
  setOffsetBearingDeg: (deg: number) => void;
  setMirrorAxisMode: (mode: 'TWO_POINTS' | 'PICK_LINE' | 'ANGLE') => void;
  setMirrorAngle: (deg: number) => void;
  setFlipDirection: (dir: 'H' | 'V' | 'D1' | 'D2') => void;
  setArrayMode: (mode: 'RECT' | 'POLAR') => void;
  setArrayRows: (rows: number) => void;
  setArrayCols: (cols: number) => void;
  setArrayRowSpacing: (spacing: number) => void;
  setArrayColSpacing: (spacing: number) => void;
  setArrayPolarCount: (count: number) => void;
  setArrayPolarAngleDeg: (deg: number) => void;
  setArrayPolarRotate: (enabled: boolean) => void;
  setArrayPolarCenter: (center: Point2D | null) => void;
  setFilletRadius: (r: number) => void;
  setFilletPickedLine: (id: string | null, click: Point2D | null) => void;
  setChamferDistance1: (d: number) => void;
  setChamferDistance2: (d: number) => void;
  setChamferPickedLine: (id: string | null, click: Point2D | null) => void;
  setDivideCount: (count: number) => void;
  setMatchPropertiesSourceId: (id: string | null) => void;
  setPointAtDistanceValue: (v: number) => void;
  setPointAtDistanceFromEnd: (v: boolean) => void;
  setPerpAnchor: (baseLineId: string, startPoint: Point2D, baseDir: Point2D) => void;
  setPerpAngleOffDeg: (deg: number) => void;
  setPerpUseAzimuth: (v: boolean) => void;
  setPerpAzimuthDeg: (deg: number) => void;
  setPerpLengthFeet: (feet: number | null) => void;
  clearPerp: () => void;
  /** C14b — abandon whatever pick is pending, staying in the current tool. */
  clearPendingPick: () => void;
  setSimplifyTolerance: (v: number) => void;
  // Slice W11 — DRAW_FREEHAND settings.
  setFreehandSmooth: (v: boolean) => void;
  setFreehandMinSpacingFt: (v: number) => void;
  resetToolState: () => void;
}

const defaultDrawStyle: ToolState['drawStyle'] = {
  color: null,
  lineWeight: null,
  opacity: null,
  lineType: 'SOLID',
};

const defaultToolState: ToolState = {
  activeTool: 'SELECT',
  drawingPoints: [],
  previewPoint: null,
  basePoint: null,
  displacement: null,
  rotateCenter: null,
  rotateAngle: 0,
  scaleFactor: 1,
  regularPolygonSides: 6,
  orthoEnabled: false,
  polarEnabled: false,
  polarAngle: 45,
  copyMode: false,
  boxStart: null,
  boxEnd: null,
  isBoxSelecting: false,
  drawStyle: { ...defaultDrawStyle },
  offsetSourceId: null,
  offsetDistance: 0,
  offsetSide: 'LEFT',
  offsetCornerHandling: 'MITER',
  offsetMode: 'PARALLEL',
  offsetScaleFactor: 1.5,
  offsetScaleLineWeight: false,
  offsetSegmentMode: 'WHOLE',
  offsetSourceSegmentIndex: null,
  offsetBearingDeg: 0,
  mirrorAxisMode: 'TWO_POINTS',
  mirrorAngle: 0,
  flipDirection: 'H',
  arrayMode: 'RECT',
  arrayRows: 2,
  arrayCols: 3,
  arrayRowSpacing: 50,
  arrayColSpacing: 50,
  arrayPolarCount: 6,
  arrayPolarAngleDeg: 360,
  arrayPolarRotate: true,
  arrayPolarCenter: null,
  filletRadius: 5,
  filletPickedLineId: null,
  filletPickedClickPoint: null,
  chamferDistance1: 5,
  chamferDistance2: 5,
  chamferPickedLineId: null,
  chamferPickedClickPoint: null,
  divideCount: 4,
  matchPropertiesSourceId: null,
  pointAtDistanceValue: 50,
  pointAtDistanceFromEnd: false,
  perpBaseLineId: null,
  perpStartPoint: null,
  perpBaseDir: null,
  perpAngleOffDeg: 90,
  perpUseAzimuth: false,
  perpAzimuthDeg: 0,
  perpLengthFeet: null,
  simplifyTolerance: 0.5,
  // Slice W11 — DRAW_FREEHAND defaults.
  freehandSmooth: false,
  freehandMinSpacingFt: 0.5,
};

export const useToolStore = create<ToolStore>((set) => ({
  state: { ...defaultToolState },

  setTool: (tool) =>
    set((s) => ({
      state: {
        ...defaultToolState,
        activeTool: tool,
        // Preserve user mode settings across tool switches
        orthoEnabled: s.state.orthoEnabled,
        polarEnabled: s.state.polarEnabled,
        polarAngle: s.state.polarAngle,
        copyMode: s.state.copyMode,
        regularPolygonSides: s.state.regularPolygonSides,
        drawStyle: s.state.drawStyle, // Preserve draw style across tool switches
        // Preserve offset parameters across tool switches so user settings persist
        offsetDistance: s.state.offsetDistance,
        offsetSide: s.state.offsetSide,
        offsetCornerHandling: s.state.offsetCornerHandling,
        offsetMode: s.state.offsetMode,
        offsetScaleFactor: s.state.offsetScaleFactor,
        offsetScaleLineWeight: s.state.offsetScaleLineWeight,
        offsetSegmentMode: s.state.offsetSegmentMode,
        // Don't preserve segment index across tool switches —
        // it's bound to a specific source pick session.
        offsetBearingDeg: s.state.offsetBearingDeg,
        mirrorAxisMode: s.state.mirrorAxisMode,
        mirrorAngle: s.state.mirrorAngle,
        flipDirection: s.state.flipDirection,
        arrayMode: s.state.arrayMode,
        arrayRows: s.state.arrayRows,
        arrayCols: s.state.arrayCols,
        arrayRowSpacing: s.state.arrayRowSpacing,
        arrayColSpacing: s.state.arrayColSpacing,
        arrayPolarCount: s.state.arrayPolarCount,
        arrayPolarAngleDeg: s.state.arrayPolarAngleDeg,
        arrayPolarRotate: s.state.arrayPolarRotate,
        // arrayPolarCenter resets on tool switch — bound to a single pick session.
        filletRadius: s.state.filletRadius,
        // filletPickedLineId resets on tool switch — bound to a two-click session.
        chamferDistance1: s.state.chamferDistance1,
        chamferDistance2: s.state.chamferDistance2,
        // chamferPickedLineId resets on tool switch.
        divideCount: s.state.divideCount,
        // matchPropertiesSourceId resets on tool switch — bound to a single pick session.
        pointAtDistanceValue: s.state.pointAtDistanceValue,
        pointAtDistanceFromEnd: s.state.pointAtDistanceFromEnd,
        // Perp anchor (baseLineId/startPoint/baseDir) resets on tool switch;
        // numeric prefs persist like other tool options.
        perpAngleOffDeg: s.state.perpAngleOffDeg,
        perpUseAzimuth: s.state.perpUseAzimuth,
        perpAzimuthDeg: s.state.perpAzimuthDeg,
        perpLengthFeet: s.state.perpLengthFeet,
        simplifyTolerance: s.state.simplifyTolerance,
        // Slice W11 — preserve DRAW_FREEHAND settings across tool switches.
        freehandSmooth: s.state.freehandSmooth,
        freehandMinSpacingFt: s.state.freehandMinSpacingFt,
      },
    })),

  addDrawingPoint: (point) =>
    set((s) => ({
      state: { ...s.state, drawingPoints: [...s.state.drawingPoints, point] },
    })),

  popDrawingPoint: () =>
    set((s) => ({
      state: {
        ...s.state,
        drawingPoints: s.state.drawingPoints.slice(0, -1),
      },
    })),

  setPreviewPoint: (point) =>
    set((s) => ({ state: { ...s.state, previewPoint: point } })),

  clearDrawingPoints: () =>
    set((s) => ({ state: { ...s.state, drawingPoints: [], previewPoint: null } })),

  setBasePoint: (point) =>
    set((s) => ({ state: { ...s.state, basePoint: point } })),

  setDisplacement: (point) =>
    set((s) => ({ state: { ...s.state, displacement: point } })),

  setRotateCenter: (point) =>
    set((s) => ({ state: { ...s.state, rotateCenter: point } })),

  setRotateAngle: (angle) =>
    set((s) => ({ state: { ...s.state, rotateAngle: angle } })),

  setBoxSelect: (start, end, active) =>
    set((s) => ({
      state: { ...s.state, boxStart: start, boxEnd: end, isBoxSelecting: active },
    })),

  setRegularPolygonSides: (sides) =>
    set((s) => ({ state: { ...s.state, regularPolygonSides: Math.max(3, Math.min(20, sides)) } })),

  setOrthoEnabled: (enabled) =>
    set((s) => ({ state: { ...s.state, orthoEnabled: enabled, polarEnabled: enabled ? false : s.state.polarEnabled } })),

  setPolarEnabled: (enabled) =>
    set((s) => ({ state: { ...s.state, polarEnabled: enabled, orthoEnabled: enabled ? false : s.state.orthoEnabled } })),

  setPolarAngle: (angle) =>
    set((s) => ({ state: { ...s.state, polarAngle: Math.max(1, Math.min(90, angle)) } })),

  setCopyMode: (enabled) =>
    set((s) => ({ state: { ...s.state, copyMode: enabled } })),

  setDrawStyle: (style) =>
    set((s) => ({ state: { ...s.state, drawStyle: { ...s.state.drawStyle, ...style } } })),

  setOffsetSourceId: (id) =>
    set((s) => ({ state: { ...s.state, offsetSourceId: id } })),

  setOffsetDistance: (dist) =>
    set((s) => ({ state: { ...s.state, offsetDistance: Math.max(0, dist) } })),

  setOffsetSide: (side) =>
    set((s) => ({ state: { ...s.state, offsetSide: side } })),

  setOffsetCornerHandling: (mode) =>
    set((s) => ({ state: { ...s.state, offsetCornerHandling: mode } })),

  setOffsetMode: (mode) =>
    set((s) => ({ state: { ...s.state, offsetMode: mode } })),

  setOffsetScaleFactor: (factor) =>
    set((s) => ({
      state: {
        ...s.state,
        offsetScaleFactor: Number.isFinite(factor) && factor > 0 ? factor : 1,
      },
    })),

  setOffsetScaleLineWeight: (enabled) =>
    set((s) => ({ state: { ...s.state, offsetScaleLineWeight: enabled } })),

  setOffsetSegmentMode: (mode) =>
    set((s) => ({ state: { ...s.state, offsetSegmentMode: mode } })),

  setOffsetSourceSegmentIndex: (index) =>
    set((s) => ({ state: { ...s.state, offsetSourceSegmentIndex: index } })),

  setOffsetBearingDeg: (deg) =>
    set((s) => ({
      state: {
        ...s.state,
        // Normalise to [0, 360) so toolbar input always lands
        // in a canonical range — survey azimuths wrap on full
        // turns; we collapse multiples of 360 here.
        offsetBearingDeg: Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : 0,
      },
    })),

  setMirrorAxisMode: (mode) =>
    set((s) => ({ state: { ...s.state, mirrorAxisMode: mode } })),

  setMirrorAngle: (deg) =>
    set((s) => ({
      state: {
        ...s.state,
        // Clamp to a sensible 0–179 range — angles 180+ wrap
        // back to the same axis (180 = 0, 270 = 90, etc.).
        mirrorAngle: Number.isFinite(deg) ? ((deg % 180) + 180) % 180 : 0,
      },
    })),

  setFlipDirection: (dir) =>
    set((s) => ({ state: { ...s.state, flipDirection: dir } })),

  setArrayRows: (rows) =>
    set((s) => ({
      state: {
        ...s.state,
        arrayRows: Math.max(1, Math.min(100, Math.floor(Number.isFinite(rows) ? rows : 1))),
      },
    })),

  setArrayCols: (cols) =>
    set((s) => ({
      state: {
        ...s.state,
        arrayCols: Math.max(1, Math.min(100, Math.floor(Number.isFinite(cols) ? cols : 1))),
      },
    })),

  setArrayRowSpacing: (spacing) =>
    set((s) => ({
      state: {
        ...s.state,
        arrayRowSpacing: Number.isFinite(spacing) ? spacing : 0,
      },
    })),

  setArrayColSpacing: (spacing) =>
    set((s) => ({
      state: {
        ...s.state,
        arrayColSpacing: Number.isFinite(spacing) ? spacing : 0,
      },
    })),

  setArrayMode: (mode) =>
    set((s) => ({ state: { ...s.state, arrayMode: mode } })),

  setArrayPolarCount: (count) =>
    set((s) => ({
      state: {
        ...s.state,
        arrayPolarCount: Math.max(2, Math.min(360, Math.floor(Number.isFinite(count) ? count : 2))),
      },
    })),

  setArrayPolarAngleDeg: (deg) =>
    set((s) => ({
      state: {
        ...s.state,
        // Allow negative for CW sweeps; cap magnitude at 360.
        arrayPolarAngleDeg: Number.isFinite(deg) ? Math.max(-360, Math.min(360, deg)) : 360,
      },
    })),

  setArrayPolarRotate: (enabled) =>
    set((s) => ({ state: { ...s.state, arrayPolarRotate: enabled } })),

  setArrayPolarCenter: (center) =>
    set((s) => ({ state: { ...s.state, arrayPolarCenter: center } })),

  setFilletRadius: (r) =>
    set((s) => ({
      state: {
        ...s.state,
        filletRadius: Number.isFinite(r) && r > 0 ? r : 0.01,
      },
    })),

  setFilletPickedLine: (id, click) =>
    set((s) => ({
      state: {
        ...s.state,
        filletPickedLineId: id,
        filletPickedClickPoint: click,
      },
    })),

  setChamferDistance1: (d) =>
    set((s) => ({
      state: {
        ...s.state,
        chamferDistance1: Number.isFinite(d) && d > 0 ? d : 0.01,
      },
    })),

  setChamferDistance2: (d) =>
    set((s) => ({
      state: {
        ...s.state,
        chamferDistance2: Number.isFinite(d) && d > 0 ? d : 0.01,
      },
    })),

  setChamferPickedLine: (id, click) =>
    set((s) => ({
      state: {
        ...s.state,
        chamferPickedLineId: id,
        chamferPickedClickPoint: click,
      },
    })),

  setDivideCount: (count) =>
    set((s) => ({
      state: {
        ...s.state,
        divideCount: Math.max(2, Math.min(100, Math.floor(Number.isFinite(count) ? count : 4))),
      },
    })),

  setMatchPropertiesSourceId: (id) =>
    set((s) => ({ state: { ...s.state, matchPropertiesSourceId: id } })),

  setPointAtDistanceValue: (v) =>
    set((s) => ({
      state: {
        ...s.state,
        pointAtDistanceValue: Number.isFinite(v) && v >= 0 ? v : 0,
      },
    })),

  setPointAtDistanceFromEnd: (v) =>
    set((s) => ({ state: { ...s.state, pointAtDistanceFromEnd: v } })),

  setPerpAnchor: (baseLineId, startPoint, baseDir) =>
    set((s) => ({
      state: { ...s.state, perpBaseLineId: baseLineId, perpStartPoint: startPoint, perpBaseDir: baseDir },
    })),
  setPerpAngleOffDeg: (deg) =>
    set((s) => ({ state: { ...s.state, perpAngleOffDeg: deg } })),
  setPerpUseAzimuth: (v) =>
    set((s) => ({ state: { ...s.state, perpUseAzimuth: v } })),
  setPerpAzimuthDeg: (deg) =>
    set((s) => ({ state: { ...s.state, perpAzimuthDeg: deg } })),
  setPerpLengthFeet: (feet) =>
    set((s) => ({ state: { ...s.state, perpLengthFeet: feet } })),
  clearPerp: () =>
    set((s) => ({
      state: { ...s.state, perpBaseLineId: null, perpStartPoint: null, perpBaseDir: null, perpLengthFeet: null },
    })),

  // C14b — the counterpart to `hasPendingPick`. Clears every pending field and the drawing points
  // together, and touches nothing else: the surveyor keeps the tool, the option-bar settings and
  // the ortho/polar modes they were working with. Built from PENDING_PICK_FIELDS rather than a
  // hand-written object literal so a field added to that list cannot be forgotten here — the drift
  // between the prompt and the Escape handler is the exact failure this slice is repairing.
  clearPendingPick: () =>
    set((s) => {
      const next: ToolState = { ...s.state, drawingPoints: [], previewPoint: null };
      const writable = next as unknown as Record<string, unknown>;
      for (const { field, alsoClears } of PENDING_PICK_FIELDS) {
        writable[field] = null;
        for (const extra of alsoClears ?? []) writable[extra] = null;
      }
      return { state: next };
    }),

  setSimplifyTolerance: (v) =>
    set((s) => ({
      state: {
        ...s.state,
        simplifyTolerance: Number.isFinite(v) && v > 0 ? v : 0.01,
      },
    })),

  // Slice W11 — DRAW_FREEHAND settings.
  setFreehandSmooth: (v) =>
    set((s) => ({ state: { ...s.state, freehandSmooth: !!v } })),
  setFreehandMinSpacingFt: (v) =>
    set((s) => ({
      state: {
        ...s.state,
        freehandMinSpacingFt: Number.isFinite(v) && v > 0 ? v : 0.5,
      },
    })),

  resetToolState: () =>
    set((s) => ({
      state: {
        ...defaultToolState,
        activeTool: s.state.activeTool,
        orthoEnabled: s.state.orthoEnabled,
        polarEnabled: s.state.polarEnabled,
        polarAngle: s.state.polarAngle,
        regularPolygonSides: s.state.regularPolygonSides,
        drawStyle: s.state.drawStyle,
        offsetDistance: s.state.offsetDistance,
        offsetSide: s.state.offsetSide,
        offsetCornerHandling: s.state.offsetCornerHandling,
        offsetMode: s.state.offsetMode,
        offsetScaleFactor: s.state.offsetScaleFactor,
        offsetScaleLineWeight: s.state.offsetScaleLineWeight,
        offsetSegmentMode: s.state.offsetSegmentMode,
        // Reset segment index — picking a new source restarts the segment selection.
        offsetSourceSegmentIndex: null,
        offsetBearingDeg: s.state.offsetBearingDeg,
        mirrorAxisMode: s.state.mirrorAxisMode,
        mirrorAngle: s.state.mirrorAngle,
        flipDirection: s.state.flipDirection,
        arrayMode: s.state.arrayMode,
        arrayRows: s.state.arrayRows,
        arrayCols: s.state.arrayCols,
        arrayRowSpacing: s.state.arrayRowSpacing,
        arrayColSpacing: s.state.arrayColSpacing,
        arrayPolarCount: s.state.arrayPolarCount,
        arrayPolarAngleDeg: s.state.arrayPolarAngleDeg,
        arrayPolarRotate: s.state.arrayPolarRotate,
        arrayPolarCenter: null, // resets on tool reset
        filletRadius: s.state.filletRadius,
        filletPickedLineId: null,
        filletPickedClickPoint: null,
        chamferDistance1: s.state.chamferDistance1,
        chamferDistance2: s.state.chamferDistance2,
        chamferPickedLineId: null,
        chamferPickedClickPoint: null,
        divideCount: s.state.divideCount,
        matchPropertiesSourceId: null,
        pointAtDistanceValue: s.state.pointAtDistanceValue,
        pointAtDistanceFromEnd: s.state.pointAtDistanceFromEnd,
        perpBaseLineId: null,
        perpStartPoint: null,
        perpBaseDir: null,
        perpAngleOffDeg: s.state.perpAngleOffDeg,
        perpUseAzimuth: s.state.perpUseAzimuth,
        perpAzimuthDeg: s.state.perpAzimuthDeg,
        perpLengthFeet: s.state.perpLengthFeet,
        simplifyTolerance: s.state.simplifyTolerance,
        // Slice W11 — DRAW_FREEHAND settings persist through resetToolState.
        freehandSmooth: s.state.freehandSmooth,
        freehandMinSpacingFt: s.state.freehandMinSpacingFt,
      },
    })),
}));
