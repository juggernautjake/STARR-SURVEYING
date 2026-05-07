// lib/cad/store/tool-store.ts — Active tool state
import { create } from 'zustand';
import type { ToolType, ToolState, Point2D } from '../types';

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
  setOffsetMode: (mode: 'PARALLEL' | 'SCALE') => void;
  setOffsetScaleFactor: (factor: number) => void;
  setOffsetScaleLineWeight: (enabled: boolean) => void;
  setOffsetSegmentMode: (mode: 'WHOLE' | 'SEGMENT') => void;
  setOffsetSourceSegmentIndex: (index: number | null) => void;
  setMirrorAxisMode: (mode: 'TWO_POINTS' | 'PICK_LINE' | 'ANGLE') => void;
  setMirrorAngle: (deg: number) => void;
  setFlipDirection: (dir: 'H' | 'V' | 'D1' | 'D2') => void;
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
  mirrorAxisMode: 'TWO_POINTS',
  mirrorAngle: 0,
  flipDirection: 'H',
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
        mirrorAxisMode: s.state.mirrorAxisMode,
        mirrorAngle: s.state.mirrorAngle,
        flipDirection: s.state.flipDirection,
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
        mirrorAxisMode: s.state.mirrorAxisMode,
        mirrorAngle: s.state.mirrorAngle,
        flipDirection: s.state.flipDirection,
      },
    })),
}));
