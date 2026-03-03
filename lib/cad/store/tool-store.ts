// lib/cad/store/tool-store.ts — Active tool state
import { create } from 'zustand';
import type { ToolType, ToolState, Point2D } from '../types';

interface ToolStore {
  state: ToolState;

  setTool: (tool: ToolType) => void;
  addDrawingPoint: (point: Point2D) => void;
  setPreviewPoint: (point: Point2D | null) => void;
  clearDrawingPoints: () => void;
  setBasePoint: (point: Point2D) => void;
  setDisplacement: (point: Point2D) => void;
  setRotateCenter: (point: Point2D) => void;
  setRotateAngle: (angle: number) => void;
  setBoxSelect: (start: Point2D | null, end: Point2D | null, active: boolean) => void;
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
  boxStart: null,
  boxEnd: null,
  isBoxSelecting: false,
};

export const useToolStore = create<ToolStore>((set) => ({
  state: { ...defaultToolState },

  setTool: (tool) =>
    set((s) => ({
      state: { ...defaultToolState, activeTool: tool },
    })),

  addDrawingPoint: (point) =>
    set((s) => ({
      state: { ...s.state, drawingPoints: [...s.state.drawingPoints, point] },
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

  resetToolState: () =>
    set((s) => ({ state: { ...defaultToolState, activeTool: s.state.activeTool } })),
}));
