// lib/cad/store/viewport-store.ts — Pan/zoom camera state
import { create } from 'zustand';
import type { BoundingBox, Point2D } from '../types';
import { MIN_ZOOM, MAX_ZOOM } from '../constants';

interface ViewportStore {
  centerX: number;
  centerY: number;
  zoom: number; // Pixels per world unit
  screenWidth: number;
  screenHeight: number;
  cursorWorld: Point2D; // World coordinates at cursor (updated by CanvasViewport)

  pan: (screenDx: number, screenDy: number) => void;
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
  zoomToExtents: (bounds: BoundingBox, padding?: number) => void;
  zoomToRect: (worldBounds: BoundingBox) => void;
  setZoom: (zoom: number) => void;
  setScreenSize: (width: number, height: number) => void;
  setCursorWorld: (pt: Point2D) => void;

  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  screenToWorld: (sx: number, sy: number) => { wx: number; wy: number };
  getWorldBounds: () => BoundingBox;
}

export const useViewportStore = create<ViewportStore>((set, get) => ({
  centerX: 0,
  centerY: 0,
  zoom: 1,
  screenWidth: 800,
  screenHeight: 600,
  cursorWorld: { x: 0, y: 0 },

  pan: (screenDx, screenDy) =>
    set((state) => ({
      centerX: state.centerX - screenDx / state.zoom,
      centerY: state.centerY + screenDy / state.zoom,
    })),

  zoomAt: (screenX, screenY, factor) =>
    set((state) => {
      const { wx, wy } = state.screenToWorld(screenX, screenY);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoom * factor));
      const newCenterX = wx - (screenX - state.screenWidth / 2) / newZoom;
      const newCenterY = wy + (screenY - state.screenHeight / 2) / newZoom;
      return { zoom: newZoom, centerX: newCenterX, centerY: newCenterY };
    }),

  zoomToExtents: (bounds, padding = 0.1) =>
    set((state) => {
      const w = bounds.maxX - bounds.minX;
      const h = bounds.maxY - bounds.minY;
      if (w === 0 && h === 0) return state;
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      const zoomX = state.screenWidth / (w * (1 + padding * 2));
      const zoomY = state.screenHeight / (h * (1 + padding * 2));
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zoomX, zoomY)));
      return { centerX: cx, centerY: cy, zoom };
    }),

  zoomToRect: (worldBounds) => {
    get().zoomToExtents(worldBounds, 0);
  },

  setZoom: (newZoom) =>
    set(() => ({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)) })),

  setScreenSize: (width, height) => set({ screenWidth: width, screenHeight: height }),

  setCursorWorld: (pt) => set({ cursorWorld: pt }),

  worldToScreen: (wx, wy) => {
    const { centerX, centerY, zoom, screenWidth, screenHeight } = get();
    return {
      sx: (wx - centerX) * zoom + screenWidth / 2,
      sy: -(wy - centerY) * zoom + screenHeight / 2,
    };
  },

  screenToWorld: (sx, sy) => {
    const { centerX, centerY, zoom, screenWidth, screenHeight } = get();
    return {
      wx: (sx - screenWidth / 2) / zoom + centerX,
      wy: -(sy - screenHeight / 2) / zoom + centerY,
    };
  },

  getWorldBounds: () => {
    const { centerX, centerY, zoom, screenWidth, screenHeight } = get();
    const halfW = screenWidth / 2 / zoom;
    const halfH = screenHeight / 2 / zoom;
    return {
      minX: centerX - halfW,
      maxX: centerX + halfW,
      minY: centerY - halfH,
      maxY: centerY + halfH,
    };
  },
}));
