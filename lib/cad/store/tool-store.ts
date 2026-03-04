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
  setBasePoint: (point: Point2D) => void;
  setDisplacement: (point: Point2D) => void;
  setRotateCenter: (point: Point2D) => void;
  setRotateAngle: (angle: number) => void;
  setBoxSelect: (start: Point2D | null, end: Point2D | null, active: boolean) => void;
  setRegularPolygonSides: (sides: number) => void;
  setOrthoEnabled: (enabled: boolean) => void;
  setPolarEnabled: (enabled: boolean) => void;
  setPolarAngle: (angle: number) => void;
  setCopyMode: (enabled: boolean) => void;
  setDrawingStyleOverride: (style: ToolState['drawingStyleOverride']) => void;
  resetToolState: () => void;
}

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
  drawingStyleOverride: null,
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
        drawingStyleOverride: s.state.drawingStyleOverride,
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

  setDrawingStyleOverride: (style) =>
    set((s) => ({ state: { ...s.state, drawingStyleOverride: style } })),

  resetToolState: () =>
    set((s) => ({
      state: {
        ...defaultToolState,
        activeTool: s.state.activeTool,
        orthoEnabled: s.state.orthoEnabled,
        polarEnabled: s.state.polarEnabled,
        polarAngle: s.state.polarAngle,
        regularPolygonSides: s.state.regularPolygonSides,
      },
    })),
}));
