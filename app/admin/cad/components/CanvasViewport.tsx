'use client';
// app/admin/cad/components/CanvasViewport.tsx — PixiJS canvas rendering engine

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  useDrawingStore,
  useSelectionStore,
  useToolStore,
  useViewportStore,
  useUndoStore,
  makeAddFeatureEntry,
  makeRemoveFeatureEntry,
  makeBatchEntry,
} from '@/lib/cad/store';
import { findSnapPoint } from '@/lib/cad/geometry/snap';
import { featureBounds, computeBounds } from '@/lib/cad/geometry/bounds';
import { boundsContains, boundsOverlap } from '@/lib/cad/geometry/intersection';
import { pointToSegmentDistance, pointInPolygon } from '@/lib/cad/geometry/point';
import { translate, rotate, mirror, scale, transformFeature } from '@/lib/cad/geometry/transform';
import { generateId } from '@/lib/cad/types';
import type { Feature, Point2D, BoundingBox, FeatureType } from '@/lib/cad/types';
import { DEFAULT_FEATURE_STYLE, SNAP_INDICATOR_STYLES, MIN_ZOOM, MAX_ZOOM } from '@/lib/cad/constants';
import { cadLog } from '@/lib/cad/logger';
import { useKeyboard } from '../hooks/useKeyboard';
import FeatureContextMenu from './FeatureContextMenu';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const HIT_TOLERANCE_PX = 5;
const GRIP_SIZE = 8; // half-size of grip square in pixels
const MAX_GRID_ITERATIONS = 500; // max grid lines per axis to prevent performance issues
// Minimum meaningful segment length in world units before zoom scaling.
// Prevents duplicate zero-length segments on double-click.
const MIN_SEGMENT_LENGTH_BASE = 0.001;

// Number of vertices used to approximate a circle as a polygon
const CIRCLE_VERTS = 64;

// Grid scale multipliers — find smallest that puts lines >= MIN_PX_GRID apart
const GRID_SCALE_MULTIPLIERS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

const SNAP_LABEL: Record<string, string> = {
  ENDPOINT: 'Endpoint',
  MIDPOINT: 'Midpoint',
  INTERSECTION: 'Intersection',
  NEAREST: 'Nearest',
  CENTER: 'Center',
  PERPENDICULAR: 'Perpendicular',
  GRID: 'Grid',
};

// Context menu state
interface ContextMenuState {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  featureId: string | null;
}

// Drawing-mode mini-menu (right-click during DRAW_POLYGON)
interface DrawingMenuState {
  x: number;
  y: number;
  canClose: boolean; // true when >= 3 points collected
}

// ── Tool-specific CSS cursors ─────────────────────────────────────────────────
const TOOL_CURSORS: Partial<Record<string, string>> = {
  SELECT: 'default',
  PAN: 'grab',
  DRAW_POINT: 'cell',
  DRAW_LINE: 'crosshair',
  DRAW_POLYLINE: 'crosshair',
  DRAW_POLYGON: 'crosshair',
  DRAW_RECTANGLE: 'crosshair',
  DRAW_REGULAR_POLYGON: 'crosshair',
  DRAW_CIRCLE: 'crosshair',
  MOVE: 'move',
  COPY: 'copy',
  ROTATE: 'alias',
  MIRROR: 'col-resize',
  SCALE: 'nwse-resize',
  ERASE: 'crosshair',
};

// ─────────────────────────────────────────────
// CanvasViewport Component
// ─────────────────────────────────────────────
export default function CanvasViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiRef = useRef<{
    app: import('pixi.js').Application;
    paperLayer: import('pixi.js').Container;
    gridLayer: import('pixi.js').Container;
    featureLayer: import('pixi.js').Container;
    selectionLayer: import('pixi.js').Container;
    snapLayer: import('pixi.js').Container;
    toolPreviewLayer: import('pixi.js').Container;
    featureGraphics: Map<string, import('pixi.js').Graphics>;
    paperGraphics: import('pixi.js').Graphics;
    gridGraphics: import('pixi.js').Graphics;
    selectionGraphics: import('pixi.js').Graphics;
    snapGraphics: import('pixi.js').Graphics;
    previewGraphics: import('pixi.js').Graphics;
    GraphicsClass: new () => import('pixi.js').Graphics;
  } | null>(null);

  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const toolStore = useToolStore();
  const viewportStore = useViewportStore();
  const undoStore = useUndoStore();

  // Interaction state (not store state)
  const isPanningRef = useRef(false);
  const isSpaceDownRef = useRef(false);
  const isMiddleMouseRef = useRef(false);
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const snapResultRef = useRef<ReturnType<typeof findSnapPoint>>(null);
  const rafRef = useRef<number>(0);
  const gripDragRef = useRef<{
    featureId: string;
    vertexIndex: number;
    type: 'POINT' | 'LINE_START' | 'LINE_END' | 'VERTEX';
  } | null>(null);
  const gripStartRef = useRef<Feature | null>(null);
  const clickHitFeatureRef = useRef(false);
  const hoveredIdRef = useRef<string | null>(null);
  const [cursorStyle, setCursorStyle] = useState('crosshair');
  const [snapLabel, setSnapLabel] = useState<{ sx: number; sy: number; text: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [drawingMenu, setDrawingMenu] = useState<DrawingMenuState | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  // HUD: floating operation info panel near cursor
  const [hud, setHud] = useState<{ sx: number; sy: number; lines: string[] } | null>(null);

  // Polyline group ID tracking — each new polyline drawing gets a fresh UUID
  const polylineGroupIdRef = useRef<string | null>(null);
  // Track last segment feature ID for dblclick cleanup
  const lastPolylineSegmentIdRef = useRef<string | null>(null);

  // Keyboard shortcuts
  useKeyboard();

  // Update cursor when active tool changes
  const activeTool = toolStore.state.activeTool;
  useEffect(() => {
    if (!isPanningRef.current && !isSpaceDownRef.current) {
      setCursorStyle(TOOL_CURSORS[activeTool] ?? 'crosshair');
    }
  }, [activeTool]);

  // ─────────────────────────────────────────────
  // Initialize PixiJS
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !canvasRef.current) return;

    let cancelled = false;

    async function init() {
      try {
        const PIXI = await import('pixi.js');
        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const width = canvas.offsetWidth || 800;
        const height = canvas.offsetHeight || 600;

        const bgColor = parseInt(
          (drawingStore.document.settings.backgroundColor ?? '#FFFFFF').replace('#', ''),
          16,
        );

        const app = new PIXI.Application({
          view: canvas,
          width,
          height,
          background: bgColor,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        const paperLayer = new PIXI.Container();
        const gridLayer = new PIXI.Container();
        const featureLayer = new PIXI.Container();
        const selectionLayer = new PIXI.Container();
        const snapLayer = new PIXI.Container();
        const toolPreviewLayer = new PIXI.Container();

        app.stage.addChild(paperLayer, gridLayer, featureLayer, selectionLayer, snapLayer, toolPreviewLayer);

        const paperGraphics = new PIXI.Graphics();
        paperLayer.addChild(paperGraphics);

        const gridGraphics = new PIXI.Graphics();
        gridLayer.addChild(gridGraphics);

        const selectionGraphics = new PIXI.Graphics();
        selectionLayer.addChild(selectionGraphics);

        const snapGraphics = new PIXI.Graphics();
        snapLayer.addChild(snapGraphics);

        const previewGraphics = new PIXI.Graphics();
        toolPreviewLayer.addChild(previewGraphics);

        pixiRef.current = {
          app,
          paperLayer,
          gridLayer,
          featureLayer,
          selectionLayer,
          snapLayer,
          toolPreviewLayer,
          featureGraphics: new Map(),
          paperGraphics,
          gridGraphics,
          selectionGraphics,
          snapGraphics,
          previewGraphics,
          GraphicsClass: PIXI.Graphics,
        };

        viewportStore.setScreenSize(width, height);
        cadLog.info('CanvasViewport', 'PixiJS canvas initialised successfully');

        // Start render loop
        function renderLoop() {
          if (!pixiRef.current) return;
          try {
            renderAll();
          } catch (err) {
            cadLog.error('CanvasViewport', 'Render loop error — frame skipped', err);
          }
          rafRef.current = requestAnimationFrame(renderLoop);
        }
        rafRef.current = requestAnimationFrame(renderLoop);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cadLog.error('CanvasViewport', 'PixiJS initialisation failed', err);
        setInitError(
          msg.includes('WebGL') || msg.includes('context')
            ? 'WebGL is not available in this browser. Try enabling hardware acceleration in browser settings.'
            : `Canvas failed to initialise: ${msg}`,
        );
      }
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (pixiRef.current) {
        pixiRef.current.app.destroy(false);
        pixiRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────
  // Resize observer
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // Suppress the benign "ResizeObserver loop completed with undelivered
    // notifications" browser error so it cannot reach the React error boundary.
    // This message is consistent across Chromium, Firefox, and Safari.
    const suppressResizeObserverError = (e: ErrorEvent) => {
      if (e.message?.includes('ResizeObserver loop')) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    window.addEventListener('error', suppressResizeObserverError);

    let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !pixiRef.current) return;
      // Defer the resize to the next animation frame to prevent the synchronous
      // layout-recalculation cycle that triggers the ResizeObserver loop error.
      if (rafId !== null) cancelAnimationFrame(rafId);
      const { width, height } = entry.contentRect;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!pixiRef.current) return;
        pixiRef.current.app.renderer.resize(width, height);
        viewportStore.setScreenSize(width, height);
      });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('error', suppressResizeObserverError);
    };
  }, [viewportStore]);

  // ─────────────────────────────────────────────
  // W→S coordinate transforms (called per frame)
  // ─────────────────────────────────────────────
  function w2s(wx: number, wy: number) {
    return viewportStore.worldToScreen(wx, wy);
  }
  function s2w(sx: number, sy: number) {
    return viewportStore.screenToWorld(sx, sy);
  }

  // ─────────────────────────────────────────────
  // Render: Paper background (grey outside paper, white inside)
  // ─────────────────────────────────────────────
  function renderPaper() {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const g = pixi.paperGraphics;
    g.clear();

    const doc = useDrawingStore.getState().document;
    const { paperSize, paperOrientation, drawingScale: scale } = doc.settings;
    const { screenWidth, screenHeight } = useViewportStore.getState();

    const sizeMap: Record<string, [number, number]> = {
      LETTER: [8.5, 11], TABLOID: [11, 17], ARCH_C: [18, 24], ARCH_D: [24, 36], ARCH_E: [36, 48],
    };
    let [w, h] = sizeMap[paperSize ?? 'TABLOID'] ?? [11, 17];
    if (paperOrientation === 'LANDSCAPE') { [w, h] = [h, w]; }
    const paperW = w * (scale ?? 50);
    const paperH = h * (scale ?? 50);

    // Paper corners in screen coords (world: (0,0) = bottom-left, (paperW,paperH) = top-right)
    const tl = w2s(0, paperH);
    const br = w2s(paperW, 0);
    const pLeft = tl.sx;
    const pTop = tl.sy;
    const pWidth = br.sx - tl.sx;
    const pHeight = br.sy - tl.sy;

    // Grey background covering the whole viewport
    g.beginFill(0xa0a0a0, 1);
    g.drawRect(0, 0, screenWidth, screenHeight);
    g.endFill();

    // White paper rectangle
    g.beginFill(0xffffff, 1);
    g.drawRect(pLeft, pTop, pWidth, pHeight);
    g.endFill();

    // Paper border (thin drop-shadow effect)
    g.lineStyle(1, 0x000000, 0.2);
    g.drawRect(pLeft + 2, pTop + 2, pWidth, pHeight); // shadow
    g.lineStyle(0.5, 0x000000, 0.4);
    g.drawRect(pLeft, pTop, pWidth, pHeight); // border
  }

  // ─────────────────────────────────────────────
  // Render: Grid
  // ─────────────────────────────────────────────
  function renderGrid() {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const g = pixi.gridGraphics;
    g.clear();

    const doc = useDrawingStore.getState().document;
    if (!doc.settings.gridVisible) return;

    const { zoom, screenWidth, screenHeight } = useViewportStore.getState();
    const wb = viewportStore.getWorldBounds();
    const baseMajor = doc.settings.gridMajorSpacing;
    const baseMinor = baseMajor / doc.settings.gridMinorDivisions;
    const gridStyle = doc.settings.gridStyle;

    // Use configurable colors (fall back to defaults if not set)
    const majorColorHex = (doc.settings.gridMajorColor ?? '#c8c8c8').replace('#', '');
    const minorColorHex = (doc.settings.gridMinorColor ?? '#e8e8e8').replace('#', '');
    const majorColor = parseInt(majorColorHex, 16);
    const minorColor = parseInt(minorColorHex, 16);

    // Auto-scale: find the smallest "nice" spacing that places lines >= MIN_PX apart
    const MIN_PX = gridStyle === 'DOTS' ? 5 : 8;
    let minorSpacing = baseMinor;
    for (const s of GRID_SCALE_MULTIPLIERS) {
      const candidate = baseMinor * s;
      if (candidate * zoom >= MIN_PX) {
        minorSpacing = candidate;
        break;
      }
    }
    if (minorSpacing * zoom < MIN_PX) {
      // Still too small — fall back to major spacing
      minorSpacing = baseMajor;
    }

    // Major spacing is always a multiple of minor
    const majorSpacing = baseMajor > minorSpacing ? baseMajor : minorSpacing * doc.settings.gridMinorDivisions;
    const drawMinor = minorSpacing < majorSpacing && minorSpacing * zoom >= MIN_PX;

    const spacing = drawMinor ? minorSpacing : majorSpacing;
    const startX = Math.floor(wb.minX / spacing) * spacing;
    const endX = Math.ceil(wb.maxX / spacing) * spacing;
    const startY = Math.floor(wb.minY / spacing) * spacing;
    const endY = Math.ceil(wb.maxY / spacing) * spacing;

    // Clamp loop iterations to avoid hang on extreme zoom-out
    const maxIterX = Math.ceil((endX - startX) / spacing) + 1;
    const maxIterY = Math.ceil((endY - startY) / spacing) + 1;
    if (maxIterX > MAX_GRID_ITERATIONS || maxIterY > MAX_GRID_ITERATIONS) return; // too many lines

    const isMajor = (v: number) =>
      Math.abs(Math.round(v / majorSpacing) * majorSpacing - v) < majorSpacing * 0.001;

    if (gridStyle === 'LINES') {
      // Draw vertical lines
      for (let wx = startX; wx <= endX; wx += spacing) {
        const { sx } = w2s(wx, 0);
        const { sy: syTop } = w2s(wx, wb.maxY);
        const { sy: syBot } = w2s(wx, wb.minY);
        const isMajorLine = isMajor(wx);
        g.lineStyle(isMajorLine ? 0.5 : 0.25, isMajorLine ? majorColor : minorColor, 1);
        g.moveTo(sx, syTop);
        g.lineTo(sx, syBot);
      }
      // Draw horizontal lines
      for (let wy = startY; wy <= endY; wy += spacing) {
        const { sy } = w2s(0, wy);
        const { sx: sxLeft } = w2s(wb.minX, wy);
        const { sx: sxRight } = w2s(wb.maxX, wy);
        const isMajorLine = isMajor(wy);
        g.lineStyle(isMajorLine ? 0.5 : 0.25, isMajorLine ? majorColor : minorColor, 1);
        g.moveTo(sxLeft, sy);
        g.lineTo(sxRight, sy);
      }
    } else {
      for (let wx = startX; wx <= endX; wx += spacing) {
        for (let wy = startY; wy <= endY; wy += spacing) {
          const major = isMajor(wx) && isMajor(wy);
          const color = major ? majorColor : minorColor;
          const { sx, sy } = w2s(wx, wy);

          if (gridStyle === 'DOTS') {
            const r = major ? 1.5 : 0.75;
            g.beginFill(color, 1);
            g.drawCircle(sx, sy, r);
            g.endFill();
          } else if (gridStyle === 'CROSSHAIRS') {
            const size = major ? 4 : 2;
            g.lineStyle(0.5, color, 1);
            g.moveTo(sx - size, sy);
            g.lineTo(sx + size, sy);
            g.moveTo(sx, sy - size);
            g.lineTo(sx, sy + size);
          }
        }
      }
    }

    // Origin marker: red cross at (0,0)
    const origin = w2s(0, 0);
    if (
      origin.sx >= -20 &&
      origin.sx <= screenWidth + 20 &&
      origin.sy >= -20 &&
      origin.sy <= screenHeight + 20
    ) {
      g.lineStyle(1.5, 0xff0000, 0.8);
      g.moveTo(origin.sx - 10, origin.sy);
      g.lineTo(origin.sx + 10, origin.sy);
      g.moveTo(origin.sx, origin.sy - 10);
      g.lineTo(origin.sx, origin.sy + 10);
    }
  }

  // ─────────────────────────────────────────────
  // Render: Features
  // ─────────────────────────────────────────────
  function renderFeatures() {
    const pixi = pixiRef.current;
    if (!pixi) return;

    const visibleFeatures = drawingStore.getVisibleFeatures();
    const visibleIds = new Set(visibleFeatures.map((f) => f.id));

    // Remove graphics for features no longer visible
    for (const [id, g] of pixi.featureGraphics) {
      if (!visibleIds.has(id)) {
        pixi.featureLayer.removeChild(g);
        g.destroy();
        pixi.featureGraphics.delete(id);
      }
    }

    for (const feature of visibleFeatures) {
      let g = pixi.featureGraphics.get(feature.id);
      if (!g) {
        g = new pixi.GraphicsClass();
        pixi.featureGraphics.set(feature.id, g);
        pixi.featureLayer.addChild(g);
      }

      drawFeature(g, feature);
    }
  }

  function drawFeature(g: import('pixi.js').Graphics, feature: Feature) {
    g.clear();
    const color = parseInt((feature.style.color ?? '#000000').replace('#', ''), 16);
    const weight = feature.style.lineWeight ?? 0.25;
    const alpha = feature.style.opacity;
    const geom = feature.geometry;

    switch (geom.type) {
      case 'POINT': {
        const { sx, sy } = w2s(geom.point!.x, geom.point!.y);
        const size = 4;
        g.lineStyle(weight, color, alpha);
        g.moveTo(sx - size, sy);
        g.lineTo(sx + size, sy);
        g.moveTo(sx, sy - size);
        g.lineTo(sx, sy + size);
        break;
      }
      case 'LINE': {
        const s = w2s(geom.start!.x, geom.start!.y);
        const e = w2s(geom.end!.x, geom.end!.y);
        g.lineStyle(weight, color, alpha);
        g.moveTo(s.sx, s.sy);
        g.lineTo(e.sx, e.sy);
        break;
      }
      case 'POLYLINE': {
        const verts = geom.vertices!;
        if (verts.length < 2) break;
        g.lineStyle(weight, color, alpha);
        const first = w2s(verts[0].x, verts[0].y);
        g.moveTo(first.sx, first.sy);
        for (let i = 1; i < verts.length; i++) {
          const v = w2s(verts[i].x, verts[i].y);
          g.lineTo(v.sx, v.sy);
        }
        break;
      }
      case 'POLYGON': {
        const verts = geom.vertices!;
        if (verts.length < 3) break;
        g.lineStyle(weight, color, alpha);
        const first = w2s(verts[0].x, verts[0].y);
        g.moveTo(first.sx, first.sy);
        for (let i = 1; i < verts.length; i++) {
          const v = w2s(verts[i].x, verts[i].y);
          g.lineTo(v.sx, v.sy);
        }
        g.closePath();
        break;
      }
    }
  }

  // ─────────────────────────────────────────────
  // Render: Selection highlights + grip squares
  // ─────────────────────────────────────────────
  function renderSelection() {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const g = pixi.selectionGraphics;
    g.clear();

    const { selectedIds } = useSelectionStore.getState();
    const toolState = useToolStore.getState().state;
    const docSettings = useDrawingStore.getState().document.settings;

    // Draw box selection rectangle
    if (toolState.isBoxSelecting && toolState.boxStart && toolState.boxEnd) {
      const { boxStart, boxEnd } = toolState;
      const isWindow = boxEnd.x > boxStart.x; // left-to-right = window
      const color = isWindow ? 0x0044ff : 0x00aa00;
      g.lineStyle(1, color, 0.8);
      g.beginFill(color, 0.08);
      g.drawRect(
        Math.min(boxStart.x, boxEnd.x),
        Math.min(boxStart.y, boxEnd.y),
        Math.abs(boxEnd.x - boxStart.x),
        Math.abs(boxEnd.y - boxStart.y),
      );
      g.endFill();
    }

    // Draw hover highlight for ANY tool (not just SELECT) when hovering over an element
    const hoveredId = hoveredIdRef.current;
    const hoverColorHex = (docSettings.hoverColor ?? '#66aaff').replace('#', '');
    const hoverColor = parseInt(hoverColorHex, 16);
    const selColorHex = (docSettings.selectionColor ?? '#0088ff').replace('#', '');
    const selColor = parseInt(selColorHex, 16);
    if (hoveredId && !selectedIds.has(hoveredId)) {
      const feature = drawingStore.getFeature(hoveredId);
      if (feature) {
        const geom = feature.geometry;
        g.lineStyle(1.5, hoverColor, 0.6);
        switch (geom.type) {
          case 'POINT': {
            const { sx, sy } = w2s(geom.point!.x, geom.point!.y);
            g.drawRect(sx - 5, sy - 5, 10, 10);
            break;
          }
          case 'LINE': {
            const s = w2s(geom.start!.x, geom.start!.y);
            const e = w2s(geom.end!.x, geom.end!.y);
            g.moveTo(s.sx, s.sy);
            g.lineTo(e.sx, e.sy);
            break;
          }
          case 'POLYLINE': {
            const verts = geom.vertices!;
            if (verts.length < 2) break;
            const first = w2s(verts[0].x, verts[0].y);
            g.moveTo(first.sx, first.sy);
            for (let i = 1; i < verts.length; i++) {
              const v = w2s(verts[i].x, verts[i].y);
              g.lineTo(v.sx, v.sy);
            }
            break;
          }
          case 'POLYGON': {
            const verts = geom.vertices!;
            if (verts.length < 3) break;
            const first = w2s(verts[0].x, verts[0].y);
            g.moveTo(first.sx, first.sy);
            for (let i = 1; i < verts.length; i++) {
              const v = w2s(verts[i].x, verts[i].y);
              g.lineTo(v.sx, v.sy);
            }
            g.closePath();
            break;
          }
        }
      }
    }

    // Draw selection highlights
    for (const featureId of selectedIds) {
      const feature = drawingStore.getFeature(featureId);
      if (!feature) continue;

      // Highlight: selection color outline
      const geom = feature.geometry;
      g.lineStyle(2, selColor, 1);
      switch (geom.type) {
        case 'POINT': {
          const { sx, sy } = w2s(geom.point!.x, geom.point!.y);
          g.drawRect(sx - 5, sy - 5, 10, 10);
          break;
        }
        case 'LINE': {
          const s = w2s(geom.start!.x, geom.start!.y);
          const e = w2s(geom.end!.x, geom.end!.y);
          g.moveTo(s.sx, s.sy);
          g.lineTo(e.sx, e.sy);
          break;
        }
        case 'POLYLINE': {
          const verts = geom.vertices!;
          if (verts.length < 2) break;
          const first = w2s(verts[0].x, verts[0].y);
          g.moveTo(first.sx, first.sy);
          for (let i = 1; i < verts.length; i++) {
            const v = w2s(verts[i].x, verts[i].y);
            g.lineTo(v.sx, v.sy);
          }
          break;
        }
        case 'POLYGON': {
          const verts = geom.vertices!;
          if (verts.length < 3) break;
          const first = w2s(verts[0].x, verts[0].y);
          g.moveTo(first.sx, first.sy);
          for (let i = 1; i < verts.length; i++) {
            const v = w2s(verts[i].x, verts[i].y);
            g.lineTo(v.sx, v.sy);
          }
          g.closePath();
          break;
        }
      }

      // Grip squares at vertices
      g.lineStyle(1, selColor, 1);
      g.beginFill(0xffffff, 1);
      const gripPoints = getFeatureVertices(feature);
      for (const pt of gripPoints) {
        const { sx, sy } = w2s(pt.x, pt.y);
        g.drawRect(sx - 4, sy - 4, 8, 8);
      }
      g.endFill();
    }
  }

  function getFeatureVertices(feature: Feature): Point2D[] {
    const geom = feature.geometry;
    switch (geom.type) {
      case 'POINT':
        return geom.point ? [geom.point] : [];
      case 'LINE':
        return [geom.start!, geom.end!].filter(Boolean);
      case 'POLYLINE':
      case 'POLYGON':
        return geom.vertices ?? [];
      default:
        return [];
    }
  }

  // ─────────────────────────────────────────────
  // Render: Snap indicator
  // ─────────────────────────────────────────────
  function renderSnapIndicator() {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const g = pixi.snapGraphics;
    g.clear();

    const snap = snapResultRef.current;
    if (!snap) return;

    const { sx, sy } = w2s(snap.point.x, snap.point.y);
    const style = SNAP_INDICATOR_STYLES[snap.type];
    const color = parseInt(style.color.replace('#', ''), 16);
    const size = 6;

    g.lineStyle(1.5, color, 1);

    switch (style.shape) {
      case 'square':
        g.drawRect(sx - size, sy - size, size * 2, size * 2);
        break;
      case 'triangle':
        g.moveTo(sx, sy - size);
        g.lineTo(sx + size, sy + size);
        g.lineTo(sx - size, sy + size);
        g.closePath();
        break;
      case 'cross':
        g.moveTo(sx - size, sy);
        g.lineTo(sx + size, sy);
        g.moveTo(sx, sy - size);
        g.lineTo(sx, sy + size);
        break;
      case 'diamond':
        g.moveTo(sx, sy - size);
        g.lineTo(sx + size, sy);
        g.lineTo(sx, sy + size);
        g.lineTo(sx - size, sy);
        g.closePath();
        break;
      case 'circle':
        g.drawCircle(sx, sy, size);
        break;
    }
  }

  // ─────────────────────────────────────────────
  // Render: Tool preview (dashed line)
  // ─────────────────────────────────────────────
  function renderToolPreview() {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const g = pixi.previewGraphics;
    g.clear();

    // Always use getState() to avoid stale closure issues in the render loop
    const toolState = useToolStore.getState().state;
    const { drawingPoints, previewPoint } = toolState;
    const activeTool = toolState.activeTool;

    // Active layer color for drawing previews
    const activeLayerStyle = useDrawingStore.getState().getActiveLayerStyle();
    // Apply draw style overrides for line tools
    const drawStyle = toolState.drawStyle;
    const rawColor = (drawStyle.color ?? activeLayerStyle.color ?? '#0066cc');
    const previewColorHex = rawColor.replace('#', '');
    const previewColor = parseInt(previewColorHex, 16);

    // Configurable selection/hover colors (also used here for preview lines)
    const selColorHex = (useDrawingStore.getState().document.settings.selectionColor ?? '#0088ff').replace('#', '');
    const selColor = parseInt(selColorHex, 16);

    if (!previewPoint) return;

    // For MOVE/COPY: show line from base point to cursor
    if (
      (activeTool === 'MOVE' || activeTool === 'COPY') &&
      toolState.basePoint &&
      !toolState.displacement
    ) {
      const bp = toolState.basePoint;
      const { sx: bx, sy: by } = w2s(bp.x, bp.y);
      const { sx: x2, sy: y2 } = w2s(previewPoint.x, previewPoint.y);
      g.lineStyle(1, selColor, 0.6);
      g.moveTo(bx, by);
      g.lineTo(x2, y2);
      // Base point cross
      g.moveTo(bx - 5, by); g.lineTo(bx + 5, by);
      g.moveTo(bx, by - 5); g.lineTo(bx, by + 5);
      return;
    }

    // For ROTATE: show line from center to cursor + angle arc indicator
    if (activeTool === 'ROTATE' && toolState.rotateCenter) {
      const center = toolState.rotateCenter;
      const { sx: cx, sy: cy } = w2s(center.x, center.y);
      const { sx: x2, sy: y2 } = w2s(previewPoint.x, previewPoint.y);
      g.lineStyle(1.5, 0xff8800, 0.8);
      g.moveTo(cx, cy);
      g.lineTo(x2, y2);
      // Center crosshair
      g.moveTo(cx - 8, cy); g.lineTo(cx + 8, cy);
      g.moveTo(cx, cy - 8); g.lineTo(cx, cy + 8);
      // Circle at cursor tip
      g.beginFill(0xff8800, 0.6);
      g.drawCircle(x2, y2, 4);
      g.endFill();
      return;
    }

    // For SCALE: show line from base point to cursor
    if (activeTool === 'SCALE' && toolState.basePoint) {
      const bp = toolState.basePoint;
      const { sx: bx, sy: by } = w2s(bp.x, bp.y);
      const { sx: x2, sy: y2 } = w2s(previewPoint.x, previewPoint.y);
      g.lineStyle(1.5, 0x00cc66, 0.8);
      g.moveTo(bx, by);
      g.lineTo(x2, y2);
      // Base point cross
      g.moveTo(bx - 8, by); g.lineTo(bx + 8, by);
      g.moveTo(bx, by - 8); g.lineTo(bx, by + 8);
      return;
    }

    // For MIRROR: show mirror line preview
    if (activeTool === 'MIRROR' && drawingPoints.length === 1) {
      const lineA = drawingPoints[0];
      const { sx: ax, sy: ay } = w2s(lineA.x, lineA.y);
      const { sx: bx, sy: by } = w2s(previewPoint.x, previewPoint.y);
      g.lineStyle(1.5, 0xff00ff, 0.7);
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      return;
    }

    const isDrawing =
      activeTool === 'DRAW_LINE' ||
      activeTool === 'DRAW_POLYLINE' ||
      activeTool === 'DRAW_POLYGON';

    if (!isDrawing || drawingPoints.length === 0) {
      // Rectangle preview — show solid rectangle with light fill
      if (activeTool === 'DRAW_RECTANGLE' && drawingPoints.length === 1 && previewPoint) {
        const p1 = drawingPoints[0];
        const p2 = previewPoint;
        const corners = [
          w2s(p1.x, p1.y),
          w2s(p2.x, p1.y),
          w2s(p2.x, p2.y),
          w2s(p1.x, p2.y),
        ];
        g.lineStyle(1.5, previewColor, 0.9);
        g.beginFill(previewColor, 0.08);
        g.moveTo(corners[0].sx, corners[0].sy);
        for (let i = 1; i < corners.length; i++) g.lineTo(corners[i].sx, corners[i].sy);
        g.closePath();
        g.endFill();
        // Start corner dot
        g.beginFill(previewColor, 0.9);
        g.drawCircle(corners[0].sx, corners[0].sy, 3);
        g.endFill();
        return;
      }
      // Regular polygon preview
      if (activeTool === 'DRAW_REGULAR_POLYGON' && drawingPoints.length === 1 && previewPoint) {
        const center = drawingPoints[0];
        const radius = Math.hypot(previewPoint.x - center.x, previewPoint.y - center.y);
        if (radius > 0) {
          const startAngle = Math.atan2(previewPoint.y - center.y, previewPoint.x - center.x);
          const sides = toolStore.state.regularPolygonSides;
          const pts = Array.from({ length: sides }, (_, i) => {
            const angle = startAngle + (2 * Math.PI * i) / sides;
            return w2s(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle));
          });
          g.lineStyle(1.5, previewColor, 0.9);
          g.beginFill(previewColor, 0.08);
          g.moveTo(pts[0].sx, pts[0].sy);
          for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].sx, pts[i].sy);
          g.closePath();
          g.endFill();
          // Draw center crosshair
          const { sx: cx, sy: cy } = w2s(center.x, center.y);
          g.lineStyle(1, previewColor, 0.5);
          g.moveTo(cx - 4, cy); g.lineTo(cx + 4, cy);
          g.moveTo(cx, cy - 4); g.lineTo(cx, cy + 4);
          g.beginFill(previewColor, 0.8);
          g.drawCircle(cx, cy, 2.5);
          g.endFill();
        }
        return;
      }
      // Circle preview
      if (activeTool === 'DRAW_CIRCLE' && drawingPoints.length === 1 && previewPoint) {
        const center = drawingPoints[0];
        const radius = Math.hypot(previewPoint.x - center.x, previewPoint.y - center.y);
        if (radius > 0) {
          const pts = Array.from({ length: CIRCLE_VERTS }, (_, i) => {
            const angle = (2 * Math.PI * i) / CIRCLE_VERTS;
            return w2s(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle));
          });
          g.lineStyle(1.5, previewColor, 0.9);
          g.beginFill(previewColor, 0.06);
          g.moveTo(pts[0].sx, pts[0].sy);
          for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].sx, pts[i].sy);
          g.closePath();
          g.endFill();
          // Center crosshair + radius line
          const { sx: cx, sy: cy } = w2s(center.x, center.y);
          const { sx: rx, sy: ry } = w2s(previewPoint.x, previewPoint.y);
          g.lineStyle(1, previewColor, 0.5);
          g.moveTo(cx - 5, cy); g.lineTo(cx + 5, cy);
          g.moveTo(cx, cy - 5); g.lineTo(cx, cy + 5);
          g.lineStyle(0.75, previewColor, 0.35);
          g.moveTo(cx, cy); g.lineTo(rx, ry);
          g.beginFill(previewColor, 0.8);
          g.drawCircle(cx, cy, 2.5);
          g.endFill();
        }
        return;
      }
      // DRAW_RECTANGLE/CIRCLE/POLYGON with no points: show start-point indicator at cursor
      if (
        (activeTool === 'DRAW_RECTANGLE' || activeTool === 'DRAW_CIRCLE' ||
         activeTool === 'DRAW_REGULAR_POLYGON' || activeTool === 'DRAW_POLYGON' ||
         activeTool === 'DRAW_LINE' || activeTool === 'DRAW_POLYLINE') &&
        drawingPoints.length === 0
      ) {
        const { sx, sy } = w2s(previewPoint.x, previewPoint.y);
        g.lineStyle(1, previewColor, 0.5);
        g.moveTo(sx - 6, sy); g.lineTo(sx + 6, sy);
        g.moveTo(sx, sy - 6); g.lineTo(sx, sy + 6);
      }
      return;
    }

    // ── DRAW_LINE / DRAW_POLYLINE / DRAW_POLYGON rubber-band preview ──────────
    const lastPt = drawingPoints[drawingPoints.length - 1];
    const { sx: x1, sy: y1 } = w2s(lastPt.x, lastPt.y);
    const { sx: x2, sy: y2 } = w2s(previewPoint.x, previewPoint.y);

    // Solid preview line in active layer color
    g.lineStyle(1.5, previewColor, 0.85);
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);

    // Draw start-point dot at the first drawing point
    const firstPt = drawingPoints[0];
    const { sx: fx, sy: fy } = w2s(firstPt.x, firstPt.y);
    g.beginFill(previewColor, 0.9);
    g.drawCircle(fx, fy, 3.5);
    g.endFill();

    // Draw anchor dot at last committed point (if different from first)
    if (drawingPoints.length > 1) {
      g.beginFill(previewColor, 0.7);
      g.drawCircle(x1, y1, 2.5);
      g.endFill();
    }

    // For DRAW_POLYGON: also close to first point with a lighter dashed line
    if (activeTool === 'DRAW_POLYGON' && drawingPoints.length >= 2) {
      g.lineStyle(0.75, previewColor, 0.3);
      g.moveTo(x2, y2);
      g.lineTo(fx, fy);
    }
  }

  // ─────────────────────────────────────────────
  // Master render function
  // ─────────────────────────────────────────────
  function renderAll() {
    // The background is now a grey surround with a white paper rectangle (renderPaper).
    // Keep the PixiJS canvas background as the grey tone so it blends seamlessly.
    const pixi = pixiRef.current;
    if (pixi) {
      const bgHex = useDrawingStore.getState().document.settings.backgroundColor ?? '#FFFFFF';
      const bgColor = parseInt(bgHex.replace('#', ''), 16);
      if (pixi.app.renderer.background.color !== bgColor) {
        pixi.app.renderer.background.color = bgColor;
      }
    }
    renderPaper();
    renderGrid();
    renderFeatures();
    renderSelection();
    renderSnapIndicator();
    renderToolPreview();
  }

  // ─────────────────────────────────────────────
  // Hit testing
  // ─────────────────────────────────────────────
  function hitTest(sx: number, sy: number): string | null {
    const { wx, wy } = s2w(sx, sy);
    const worldTol = HIT_TOLERANCE_PX / viewportStore.zoom;
    // Exclude features on locked layers from selection
    const features = drawingStore.getVisibleFeatures().filter((f) => {
      const layer = drawingStore.getLayer(f.layerId);
      return !layer?.locked;
    });

    // Priority: points > line endpoints > lines > polygons
    for (const feature of features) {
      const geom = feature.geometry;
      if (geom.type === 'POINT' && geom.point) {
        const { sx: fx, sy: fy } = w2s(geom.point.x, geom.point.y);
        if (Math.hypot(sx - fx, sy - fy) <= HIT_TOLERANCE_PX) return feature.id;
      }
    }
    for (const feature of features) {
      const geom = feature.geometry;
      if (geom.type === 'LINE' && geom.start && geom.end) {
        const d = pointToSegmentDistance({ x: wx, y: wy }, geom.start, geom.end);
        if (d <= worldTol) return feature.id;
      }
    }
    for (const feature of features) {
      const geom = feature.geometry;
      if (geom.type === 'POLYLINE' && geom.vertices) {
        for (let i = 0; i < geom.vertices.length - 1; i++) {
          const d = pointToSegmentDistance({ x: wx, y: wy }, geom.vertices[i], geom.vertices[i + 1]);
          if (d <= worldTol) return feature.id;
        }
      }
      if (geom.type === 'POLYGON' && geom.vertices) {
        // Check edges
        for (let i = 0; i < geom.vertices.length; i++) {
          const j = (i + 1) % geom.vertices.length;
          const d = pointToSegmentDistance({ x: wx, y: wy }, geom.vertices[i], geom.vertices[j]);
          if (d <= worldTol) return feature.id;
        }
        // Check interior
        if (pointInPolygon({ x: wx, y: wy }, geom.vertices)) return feature.id;
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────
  // Box selection
  // ─────────────────────────────────────────────
  function boxSelectFeatures(start: Point2D, end: Point2D): string[] {
    const isWindow = end.x > start.x; // left-to-right = window
    const { wx: minX, wy: minY } = s2w(Math.min(start.x, end.x), Math.max(start.y, end.y));
    const { wx: maxX, wy: maxY } = s2w(Math.max(start.x, end.x), Math.min(start.y, end.y));
    const selBox: BoundingBox = { minX, minY, maxX, maxY };

    return drawingStore
      .getVisibleFeatures()
      .filter((f) => {
        const layer = drawingStore.getLayer(f.layerId);
        if (layer?.locked) return false;
        const fb = featureBounds(f);
        if (isWindow) {
          return boundsContains(selBox, fb);
        } else {
          return boundsOverlap(selBox, fb);
        }
      })
      .map((f) => f.id);
  }

  // ─────────────────────────────────────────────
  // Create feature helper
  // ─────────────────────────────────────────────
  function createFeature(type: FeatureType, points: Point2D[]): Feature | null {
    const { activeLayerId, getActiveLayerStyle } = drawingStore;
    const layerStyle = getActiveLayerStyle();
    const id = generateId();
    const ds = useToolStore.getState().state.drawStyle;
    // Merge draw style overrides on top of layer style for line/polyline tools
    const isLineType = type === 'LINE' || type === 'POLYLINE';
    const style: typeof DEFAULT_FEATURE_STYLE = {
      ...DEFAULT_FEATURE_STYLE,
      ...layerStyle,
      ...(isLineType && ds.color != null ? { color: ds.color } : {}),
      ...(isLineType && ds.lineWeight != null ? { lineWeight: ds.lineWeight } : {}),
      ...(isLineType && ds.opacity != null ? { opacity: ds.opacity } : {}),
      ...(isLineType && ds.lineType !== 'SOLID' ? { lineTypeId: ds.lineType } : {}),
    };

    switch (type) {
      case 'POINT':
        return {
          id,
          type: 'POINT',
          geometry: { type: 'POINT', point: points[0] },
          layerId: activeLayerId,
          style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
          properties: {},
        };
      case 'LINE':
        if (points.length < 2) return null;
        return {
          id,
          type: 'LINE',
          geometry: { type: 'LINE', start: points[0], end: points[1] },
          layerId: activeLayerId,
          style,
          properties: {},
        };
      case 'POLYLINE':
        if (points.length < 2) return null;
        return {
          id,
          type: 'POLYLINE',
          geometry: { type: 'POLYLINE', vertices: points },
          layerId: activeLayerId,
          style,
          properties: {},
        };
      case 'POLYGON':
        if (points.length < 3) return null;
        return {
          id,
          type: 'POLYGON',
          geometry: { type: 'POLYGON', vertices: points },
          layerId: activeLayerId,
          style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
          properties: {},
        };
      default:
        return null;
    }
  }

  // ─────────────────────────────────────────────
  // Helper: get all segment IDs that share a polylineGroupId
  // ─────────────────────────────────────────────
  function getPolylineGroupIds(groupId: string): string[] {
    return drawingStore
      .getAllFeatures()
      .filter((f) => f.properties.polylineGroupId === groupId)
      .map((f) => f.id);
  }

  // ─────────────────────────────────────────────
  // Create a single LINE segment as part of a polyline group
  // ─────────────────────────────────────────────
  function createPolylineSegment(start: Point2D, end: Point2D, groupId: string): Feature {
    const { activeLayerId, getActiveLayerStyle } = drawingStore;
    const layerStyle = getActiveLayerStyle();
    const ds = useToolStore.getState().state.drawStyle;
    return {
      id: generateId(),
      type: 'LINE',
      geometry: { type: 'LINE', start, end },
      layerId: activeLayerId,
      style: {
        ...DEFAULT_FEATURE_STYLE,
        ...layerStyle,
        ...(ds.color != null ? { color: ds.color } : {}),
        ...(ds.lineWeight != null ? { lineWeight: ds.lineWeight } : {}),
        ...(ds.opacity != null ? { opacity: ds.opacity } : {}),
        ...(ds.lineType !== 'SOLID' ? { lineTypeId: ds.lineType } : {}),
      },
      properties: { polylineGroupId: groupId },
    };
  }

  function finishFeature(type: FeatureType) {
    const { drawingPoints } = toolStore.state;

    if (type === 'POLYLINE') {
      // Polyline: already created as individual LINE segments during drawing.
      // Just reset drawing state; undo is already recorded per segment.
      polylineGroupIdRef.current = null;
      lastPolylineSegmentIdRef.current = null;
      toolStore.clearDrawingPoints();
      return;
    }

    const feature = createFeature(type, drawingPoints);
    if (!feature) return;
    drawingStore.addFeature(feature);
    undoStore.pushUndo(makeAddFeatureEntry(feature));
    toolStore.clearDrawingPoints();
  }

  // ─────────────────────────────────────────────
  // Ortho / Polar constraint helper
  // ─────────────────────────────────────────────
  function applyConstraints(pt: Point2D): Point2D {
    const ts = toolStore.state;
    const { orthoEnabled, polarEnabled, polarAngle, drawingPoints, basePoint, rotateCenter } = ts;
    if (!orthoEnabled && !polarEnabled) return pt;

    // Reference point: last drawn point, or base point for move/rotate, or rotate center
    const refPt = drawingPoints[drawingPoints.length - 1] ?? basePoint ?? rotateCenter;
    if (!refPt) return pt;

    const dx = pt.x - refPt.x;
    const dy = pt.y - refPt.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return pt;

    if (orthoEnabled) {
      // Snap to nearest 90° axis (horizontal/vertical)
      if (Math.abs(dx) >= Math.abs(dy)) {
        return { x: pt.x, y: refPt.y }; // horizontal
      } else {
        return { x: refPt.x, y: pt.y }; // vertical
      }
    }

    if (polarEnabled && polarAngle > 0) {
      const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const snappedDeg = Math.round(rawDeg / polarAngle) * polarAngle;
      const snappedRad = (snappedDeg * Math.PI) / 180;
      return {
        x: refPt.x + dist * Math.cos(snappedRad),
        y: refPt.y + dist * Math.sin(snappedRad),
      };
    }

    return pt;
  }

  // ─────────────────────────────────────────────
  // Get snapped world position
  // ─────────────────────────────────────────────
  function getSnappedWorld(sx: number, sy: number): Point2D {
    const { wx, wy } = s2w(sx, sy);
    const cursor = { x: wx, y: wy };
    const { settings } = drawingStore.document;

    if (settings.snapEnabled) {
      const snap = findSnapPoint(
        cursor,
        drawingStore.getVisibleFeatures(),
        settings.snapRadius,
        viewportStore.zoom,
        settings.snapTypes,
        settings.gridMajorSpacing / settings.gridMinorDivisions,
      );
      snapResultRef.current = snap;
      const snapped = snap ? snap.point : cursor;
      return applyConstraints(snapped);
    } else {
      snapResultRef.current = null;
    }
    return applyConstraints(cursor);
  }

  // ─────────────────────────────────────────────
  // Grip hit testing
  // ─────────────────────────────────────────────
  function hitTestGrip(sx: number, sy: number): { featureId: string; vertexIndex: number } | null {
    const { selectedIds } = selectionStore;
    for (const featureId of selectedIds) {
      const feature = drawingStore.getFeature(featureId);
      if (!feature) continue;
      const verts = getFeatureVertices(feature);
      for (let i = 0; i < verts.length; i++) {
        const { sx: gx, sy: gy } = w2s(verts[i].x, verts[i].y);
        if (Math.abs(sx - gx) <= GRIP_SIZE && Math.abs(sy - gy) <= GRIP_SIZE) {
          return { featureId, vertexIndex: i };
        }
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────
  // Mouse event handlers
  // ─────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      lastMouseRef.current = { x: sx, y: sy };

      // Middle mouse or Space+left → start panning
      if (e.button === 1 || (e.button === 0 && isSpaceDownRef.current)) {
        isPanningRef.current = true;
        isMiddleMouseRef.current = e.button === 1;
        setCursorStyle('grabbing');
        return;
      }

      if (e.button !== 0) return;

      const toolState = toolStore.state;
      const { activeTool } = toolState;

      // PAN tool: left-click-drag pans the viewport
      if (activeTool === 'PAN') {
        isPanningRef.current = true;
        setCursorStyle('grabbing');
        return;
      }

      const worldPt = getSnappedWorld(sx, sy);

      // Check grip first (when SELECT tool active and something selected)
      if (activeTool === 'SELECT' && selectionStore.selectedIds.size > 0) {
        const grip = hitTestGrip(sx, sy);
        if (grip) {
          gripDragRef.current = { featureId: grip.featureId, vertexIndex: grip.vertexIndex, type: 'VERTEX' };
          gripStartRef.current = drawingStore.getFeature(grip.featureId) ?? null;
          return;
        }
      }

      switch (activeTool) {
        case 'SELECT': {
          toolStore.setBoxSelect({ x: sx, y: sy }, { x: sx, y: sy }, true);
          const hit = hitTest(sx, sy);
          if (hit) {
            clickHitFeatureRef.current = true;
            // If clicked feature is part of a polyline group, select entire group
            const hitFeature = drawingStore.getFeature(hit);
            const groupId = hitFeature?.properties?.polylineGroupId as string | undefined;
            if (groupId && !e.shiftKey) {
              // Select all segments of the polyline group
              const groupIds = getPolylineGroupIds(groupId);
              selectionStore.selectMultiple(groupIds, 'REPLACE');
            } else {
              const mode = e.shiftKey ? 'TOGGLE' : 'REPLACE';
              selectionStore.select(hit, mode);
            }
            toolStore.setBoxSelect(null, null, false);
          } else {
            clickHitFeatureRef.current = false;
          }
          break;
        }

        case 'DRAW_POINT': {
          const feature = createFeature('POINT', [worldPt]);
          if (feature) {
            drawingStore.addFeature(feature);
            undoStore.pushUndo(makeAddFeatureEntry(feature));
          }
          break;
        }

        case 'DRAW_LINE': {
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt);
          } else {
            toolStore.addDrawingPoint(worldPt);
            finishFeature('LINE');
          }
          break;
        }

        case 'DRAW_POLYLINE': {
          const prevPoints = toolState.drawingPoints;
          if (prevPoints.length === 0) {
            // First click: start a new polyline group
            polylineGroupIdRef.current = generateId();
            toolStore.addDrawingPoint(worldPt);
          } else {
            const lastPt = prevPoints[prevPoints.length - 1];
            const dist = Math.hypot(worldPt.x - lastPt.x, worldPt.y - lastPt.y);
            // Only create a segment if the new point is meaningfully different
            if (dist > MIN_SEGMENT_LENGTH_BASE / viewportStore.zoom) {
              const segment = createPolylineSegment(lastPt, worldPt, polylineGroupIdRef.current!);
              drawingStore.addFeature(segment);
              undoStore.pushUndo(makeAddFeatureEntry(segment));
              lastPolylineSegmentIdRef.current = segment.id;
              toolStore.addDrawingPoint(worldPt);
            }
          }
          break;
        }

        case 'DRAW_POLYGON': {
          toolStore.addDrawingPoint(worldPt);
          break;
        }

        case 'DRAW_RECTANGLE': {
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt);
          } else {
            const p1 = toolState.drawingPoints[0];
            const p2 = worldPt;
            // Require both dimensions to be non-trivial (reuse the polyline min-length constant
            // as a sensible minimum world-space dimension for any drawn shape)
            if (Math.abs(p2.x - p1.x) < MIN_SEGMENT_LENGTH_BASE || Math.abs(p2.y - p1.y) < MIN_SEGMENT_LENGTH_BASE) {
              toolStore.clearDrawingPoints();
              break;
            }
            const vertices: Point2D[] = [
              { x: p1.x, y: p1.y },
              { x: p2.x, y: p1.y },
              { x: p2.x, y: p2.y },
              { x: p1.x, y: p2.y },
            ];
            const feature: Feature = {
              id: generateId(),
              type: 'POLYGON',
              geometry: { type: 'POLYGON', vertices },
              layerId: drawingStore.activeLayerId,
              style: { ...DEFAULT_FEATURE_STYLE, ...drawingStore.getActiveLayerStyle() },
              properties: { shapeType: 'RECTANGLE' },
            };
            drawingStore.addFeature(feature);
            undoStore.pushUndo(makeAddFeatureEntry(feature));
            toolStore.clearDrawingPoints();
          }
          break;
        }

        case 'DRAW_REGULAR_POLYGON': {
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt); // center
          } else {
            const center = toolState.drawingPoints[0];
            const radius = Math.hypot(worldPt.x - center.x, worldPt.y - center.y);
            if (radius < MIN_SEGMENT_LENGTH_BASE) { toolStore.clearDrawingPoints(); break; }
            const startAngle = Math.atan2(worldPt.y - center.y, worldPt.x - center.x);
            const sides = toolStore.state.regularPolygonSides;
            const vertices: Point2D[] = Array.from({ length: sides }, (_, i) => {
              const angle = startAngle + (2 * Math.PI * i) / sides;
              return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
            });
            const feature: Feature = {
              id: generateId(),
              type: 'POLYGON',
              geometry: { type: 'POLYGON', vertices },
              layerId: drawingStore.activeLayerId,
              style: { ...DEFAULT_FEATURE_STYLE, ...drawingStore.getActiveLayerStyle() },
              properties: { shapeType: 'REGULAR_POLYGON', sides: sides.toString() },
            };
            drawingStore.addFeature(feature);
            undoStore.pushUndo(makeAddFeatureEntry(feature));
            toolStore.clearDrawingPoints();
          }
          break;
        }

        case 'DRAW_CIRCLE': {
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt); // center
          } else {
            const center = toolState.drawingPoints[0];
            const radius = Math.hypot(worldPt.x - center.x, worldPt.y - center.y);
            if (radius < MIN_SEGMENT_LENGTH_BASE) { toolStore.clearDrawingPoints(); break; }
            // Approximate circle as 64-vertex polygon
            const vertices: Point2D[] = Array.from({ length: CIRCLE_VERTS }, (_, i) => {
              const angle = (2 * Math.PI * i) / CIRCLE_VERTS;
              return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
            });
            const feature: Feature = {
              id: generateId(),
              type: 'POLYGON',
              geometry: { type: 'POLYGON', vertices },
              layerId: drawingStore.activeLayerId,
              style: { ...DEFAULT_FEATURE_STYLE, ...drawingStore.getActiveLayerStyle() },
              properties: { shapeType: 'CIRCLE', centerX: center.x.toString(), centerY: center.y.toString(), radius: radius.toString() },
            };
            drawingStore.addFeature(feature);
            undoStore.pushUndo(makeAddFeatureEntry(feature));
            toolStore.clearDrawingPoints();
          }
          break;
        }

        case 'ERASE': {
          const hit = hitTest(sx, sy);
          if (hit) {
            const feature = drawingStore.getFeature(hit);
            if (feature) {
              drawingStore.removeFeature(hit);
              selectionStore.deselectAll();
              undoStore.pushUndo(makeRemoveFeatureEntry(feature));
            }
          }
          break;
        }

        case 'MOVE': {
          // If nothing selected, auto-select the clicked element first
          if (selectionStore.selectedIds.size === 0) {
            const hit = hitTest(sx, sy);
            if (hit) selectionStore.select(hit, 'REPLACE');
            break;
          }
          if (!toolState.basePoint) {
            toolStore.setBasePoint(worldPt);
          } else {
            const dx = worldPt.x - toolState.basePoint.x;
            const dy = worldPt.y - toolState.basePoint.y;
            const selectedIds = Array.from(selectionStore.selectedIds);
            if (selectedIds.length === 0) break;
            const ops = selectedIds.flatMap((id) => {
              const f = drawingStore.getFeature(id);
              if (!f) {
                cadLog.warn('CanvasViewport', `MOVE: feature "${id}" not found — skipped`);
                return [];
              }
              const newF = transformFeature(f, (p) => translate(p, dx, dy));
              drawingStore.updateFeature(id, { geometry: newF.geometry });
              return [{ type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } }];
            });
            if (ops.length > 0) undoStore.pushUndo(makeBatchEntry('Move', ops));
            toolStore.resetToolState();
          }
          break;
        }

        case 'COPY': {
          // If nothing selected, auto-select the clicked element first
          if (selectionStore.selectedIds.size === 0) {
            const hit = hitTest(sx, sy);
            if (hit) selectionStore.select(hit, 'REPLACE');
            break;
          }
          if (!toolState.basePoint) {
            toolStore.setBasePoint(worldPt);
          } else {
            const dx = worldPt.x - toolState.basePoint.x;
            const dy = worldPt.y - toolState.basePoint.y;
            const selectedIds = Array.from(selectionStore.selectedIds);
            if (selectedIds.length === 0) break;
            const newFeatures: Feature[] = [];
            for (const id of selectedIds) {
              const f = drawingStore.getFeature(id);
              if (!f) {
                cadLog.warn('CanvasViewport', `COPY: feature "${id}" not found — skipped`);
                continue;
              }
              const newF = transformFeature(f, (p) => translate(p, dx, dy));
              newF.id = generateId();
              newFeatures.push(newF);
            }
            if (newFeatures.length > 0) {
              drawingStore.addFeatures(newFeatures);
              const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
              undoStore.pushUndo(makeBatchEntry('Copy', ops));
            }
            toolStore.setBasePoint(worldPt); // Allow multiple copies
          }
          break;
        }

        case 'ROTATE': {
          // If nothing selected, auto-select the clicked element first
          if (selectionStore.selectedIds.size === 0) {
            const hit = hitTest(sx, sy);
            if (hit) selectionStore.select(hit, 'REPLACE');
            break;
          }
          if (!toolState.rotateCenter) {
            toolStore.setRotateCenter(worldPt);
          }
          break;
        }

        case 'SCALE': {
          // If nothing selected, auto-select the clicked element first
          if (selectionStore.selectedIds.size === 0) {
            const hit = hitTest(sx, sy);
            if (hit) selectionStore.select(hit, 'REPLACE');
            break;
          }
          if (!toolState.basePoint) {
            toolStore.setBasePoint(worldPt);
          }
          break;
        }

        case 'MIRROR': {
          // If nothing selected, auto-select the clicked element first
          if (selectionStore.selectedIds.size === 0) {
            const hit = hitTest(sx, sy);
            if (hit) selectionStore.select(hit, 'REPLACE');
            break;
          }
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt);
          } else {
            const lineA = toolState.drawingPoints[0];
            const lineB = worldPt;
            const selectedIds = Array.from(selectionStore.selectedIds);
            if (selectedIds.length === 0) break;
            const ops = selectedIds.flatMap((id) => {
              const f = drawingStore.getFeature(id);
              if (!f) {
                cadLog.warn('CanvasViewport', `MIRROR: feature "${id}" not found — skipped`);
                return [];
              }
              const newF = transformFeature(f, (p) => mirror(p, lineA, lineB));
              drawingStore.updateFeature(id, { geometry: newF.geometry });
              return [{ type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } }];
            });
            if (ops.length > 0) undoStore.pushUndo(makeBatchEntry('Mirror', ops));
            toolStore.clearDrawingPoints();
          }
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawingStore, selectionStore, toolStore, viewportStore, undoStore],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (isPanningRef.current) {
        const dx = sx - lastMouseRef.current.x;
        const dy = sy - lastMouseRef.current.y;
        viewportStore.pan(dx, dy);
      }

      lastMouseRef.current = { x: sx, y: sy };

      const worldPt = getSnappedWorld(sx, sy);

      // Grip drag update
      if (gripDragRef.current) {
        const { featureId, vertexIndex } = gripDragRef.current;
        const feature = drawingStore.getFeature(featureId);
        if (feature) {
          const geom = { ...feature.geometry };
          switch (geom.type) {
            case 'POINT':
              geom.point = worldPt;
              break;
            case 'LINE':
              if (vertexIndex === 0) geom.start = worldPt;
              else geom.end = worldPt;
              break;
            case 'POLYLINE':
            case 'POLYGON': {
              const verts = [...(geom.vertices ?? [])];
              verts[vertexIndex] = worldPt;
              geom.vertices = verts;
              break;
            }
          }
          drawingStore.updateFeatureGeometry(featureId, geom);
        }
      }

      toolStore.setPreviewPoint(worldPt);
      viewportStore.setCursorWorld(worldPt);

      // Update hover state for ALL tools — shows highlighted element under cursor
      if (!isPanningRef.current) {
        const hit = hitTest(sx, sy);
        hoveredIdRef.current = hit;
        // Update cursor style for SELECT tool
        if (toolStore.state.activeTool === 'SELECT') {
          if (!gripDragRef.current) {
            const onGrip = hit && selectionStore.selectedIds.has(hit) ? hitTestGrip(sx, sy) : null;
            if (onGrip) {
              setCursorStyle('move');
            } else if (hit) {
              setCursorStyle('pointer');
            } else {
              setCursorStyle('default');
            }
          }
        } else if (hit && !toolStore.state.activeTool.startsWith('DRAW_')) {
          // For modification tools: show pointer cursor when hovering a selectable element
          setCursorStyle('pointer');
        } else {
          const cursor = TOOL_CURSORS[toolStore.state.activeTool] ?? 'crosshair';
          if (!isPanningRef.current) setCursorStyle(cursor);
        }
      } else {
        hoveredIdRef.current = null;
      }

      // Box select: update end point
      const toolState = toolStore.state;
      if (toolState.isBoxSelecting && toolState.boxStart) {
        toolStore.setBoxSelect(toolState.boxStart, { x: sx, y: sy }, true);
      }

      // Update snap label
      const snap = snapResultRef.current;
      if (snap) {
        const { sx: lx, sy: ly } = viewportStore.worldToScreen(snap.point.x, snap.point.y);
        setSnapLabel({ sx: lx, sy: ly, text: SNAP_LABEL[snap.type] ?? snap.type });
      } else {
        setSnapLabel(null);
      }

      // Update floating HUD with operation values
      const ts = toolStore.state;
      const hudLines: string[] = [];
      if (ts.activeTool === 'DRAW_LINE' || ts.activeTool === 'DRAW_POLYLINE') {
        if (ts.drawingPoints.length > 0) {
          const lastPt = ts.drawingPoints[ts.drawingPoints.length - 1];
          const dx = worldPt.x - lastPt.x;
          const dy = worldPt.y - lastPt.y;
          const dist = Math.hypot(dx, dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          hudLines.push(`Len: ${dist.toFixed(3)}`);
          hudLines.push(`∠ ${angle.toFixed(1)}°`);
          hudLines.push(`ΔX: ${dx.toFixed(3)}  ΔY: ${dy.toFixed(3)}`);
        } else {
          hudLines.push(`X: ${worldPt.x.toFixed(3)}`);
          hudLines.push(`Y: ${worldPt.y.toFixed(3)}`);
        }
      } else if (ts.activeTool === 'MOVE' && ts.basePoint) {
        const dx = worldPt.x - ts.basePoint.x;
        const dy = worldPt.y - ts.basePoint.y;
        hudLines.push(`ΔX: ${dx.toFixed(3)}`);
        hudLines.push(`ΔY: ${dy.toFixed(3)}`);
        hudLines.push(`Dist: ${Math.hypot(dx, dy).toFixed(3)}`);
      } else if (ts.activeTool === 'ROTATE' && ts.rotateCenter) {
        const dx = worldPt.x - ts.rotateCenter.x;
        const dy = worldPt.y - ts.rotateCenter.y;
        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        hudLines.push(`Angle: ${angleDeg.toFixed(2)}°`);
        hudLines.push(`Radius: ${Math.hypot(dx, dy).toFixed(3)}`);
      } else if (ts.activeTool === 'SCALE' && ts.basePoint) {
        const dist = Math.hypot(worldPt.x - ts.basePoint.x, worldPt.y - ts.basePoint.y);
        hudLines.push(`Radius: ${dist.toFixed(3)}`);
      } else if (
        (ts.activeTool === 'DRAW_RECTANGLE' || ts.activeTool === 'DRAW_CIRCLE' ||
         ts.activeTool === 'DRAW_REGULAR_POLYGON') &&
        ts.drawingPoints.length > 0
      ) {
        const origin = ts.drawingPoints[0];
        const dx = worldPt.x - origin.x;
        const dy = worldPt.y - origin.y;
        const r = Math.hypot(dx, dy);
        if (ts.activeTool === 'DRAW_RECTANGLE') {
          hudLines.push(`W: ${Math.abs(dx).toFixed(3)}`);
          hudLines.push(`H: ${Math.abs(dy).toFixed(3)}`);
        } else {
          hudLines.push(`Radius: ${r.toFixed(3)}`);
        }
      }

      if (hudLines.length > 0) {
        setHud({ sx: sx + 18, sy: sy - 10, lines: hudLines });
      } else {
        setHud(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewportStore, toolStore, drawingStore],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 1 || (e.button === 0 && isMiddleMouseRef.current)) {
        isPanningRef.current = false;
        isMiddleMouseRef.current = false;
        setCursorStyle(isSpaceDownRef.current ? 'grab' : (TOOL_CURSORS[toolStore.state.activeTool] ?? 'crosshair'));
        return;
      }

      if (e.button !== 0) return;

      const toolState = toolStore.state;
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // PAN tool: stop panning
      if (toolState.activeTool === 'PAN') {
        isPanningRef.current = false;
        setCursorStyle('grab');
        return;
      }

      // Commit grip drag
      if (gripDragRef.current && gripStartRef.current) {
        const { featureId } = gripDragRef.current;
        const before = gripStartRef.current;
        const after = drawingStore.getFeature(featureId);
        if (after) {
          undoStore.pushUndo({
            id: generateId(),
            description: 'Grip edit',
            timestamp: Date.now(),
            operations: [{ type: 'MODIFY_FEATURE', data: { id: featureId, before, after } }],
          });
        }
        gripDragRef.current = null;
        gripStartRef.current = null;
        setCursorStyle(isSpaceDownRef.current ? 'grab' : (TOOL_CURSORS[toolStore.state.activeTool] ?? 'crosshair'));
        return;
      }

      // Finish box selection
      if (toolState.isBoxSelecting && toolState.activeTool === 'SELECT') {
        const start = toolState.boxStart!;
        const end = toolState.boxEnd ?? { x: sx, y: sy };
        const dragDist = Math.hypot(end.x - start.x, end.y - start.y);
        if (dragDist > 5) {
          const ids = boxSelectFeatures(start, end);
          selectionStore.selectMultiple(ids, e.shiftKey ? 'ADD' : 'REPLACE');
        } else if (!clickHitFeatureRef.current && !e.shiftKey) {
          selectionStore.deselectAll();
        }
        toolStore.setBoxSelect(null, null, false);
      }

      isPanningRef.current = false;
      setCursorStyle(isSpaceDownRef.current ? 'grab' : (TOOL_CURSORS[toolStore.state.activeTool] ?? 'crosshair'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolStore, selectionStore, drawingStore, undoStore],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      viewportStore.zoomAt(sx, sy, factor);
    },
    [viewportStore],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const toolState = toolStore.state;
      const { activeTool } = toolState;

      if (activeTool === 'DRAW_POLYLINE') {
        // Double-click while drawing polyline: the second single-click mousedown already
        // created the last segment (if the cursor moved). Just stop drawing.
        // The min-distance check in mousedown prevents zero-length duplicate segments.
        finishFeature('POLYLINE');
        return;
      }

      if (activeTool === 'DRAW_POLYGON' && toolState.drawingPoints.length >= 3) {
        finishFeature('POLYGON');
        return;
      }

      // SELECT tool (or any non-drawing tool): open feature properties dialog
      const hit = hitTest(sx, sy);
      if (hit) {
        window.dispatchEvent(
          new CustomEvent('cad:openFeatureDialog', {
            detail: { featureId: hit, x: e.clientX, y: e.clientY },
          }),
        );
      } else if (activeTool === 'SELECT') {
        // Double-click on empty canvas in SELECT mode → deselect all
        selectionStore.deselectAll();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolStore, drawingStore, selectionStore],
  );

  // ─────────────────────────────────────────────
  // Triple-click: select all features on same layer
  // ─────────────────────────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.detail < 3) return; // Only handle triple-click
      const toolState = toolStore.state;
      if (toolState.activeTool !== 'SELECT') return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hit = hitTest(sx, sy);
      if (!hit) return;
      const feature = drawingStore.getFeature(hit);
      if (!feature) return;
      const sameLayerIds = drawingStore
        .getVisibleFeatures()
        .filter((f) => f.layerId === feature.layerId)
        .map((f) => f.id);
      selectionStore.selectMultiple(sameLayerIds, 'REPLACE');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolStore, drawingStore, selectionStore],
  );

  // ─────────────────────────────────────────────
  // Keyboard pan guard + confirm event
  // ─────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        isSpaceDownRef.current = true;
        setCursorStyle('grab');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceDownRef.current = false;
        isPanningRef.current = false;
        setCursorStyle(TOOL_CURSORS[toolStore.state.activeTool] ?? 'crosshair');
      }
    };
    const onConfirm = () => {
      const toolState = toolStore.state;
      const { activeTool, drawingPoints } = toolState;
      if (activeTool === 'DRAW_POLYLINE' && drawingPoints.length >= 2) {
        finishFeature('POLYLINE');
      } else if (activeTool === 'DRAW_POLYGON' && drawingPoints.length >= 3) {
        finishFeature('POLYGON');
      } else if (activeTool === 'DRAW_REGULAR_POLYGON' && drawingPoints.length >= 2) {
        // Confirm is not needed (handled by click), but allow Enter to cancel
        toolStore.clearDrawingPoints();
      }
    };
    const onZoomExtents = () => {
      const dwgStore = useDrawingStore.getState();
      const vpStore = useViewportStore.getState();
      const features = dwgStore.getAllFeatures();
      if (features.length === 0) {
        vpStore.zoomToExtents({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
        return;
      }
      const allPts = features.flatMap((f) => {
        const g = f.geometry;
        if (g.type === 'POINT') return g.point ? [g.point] : [];
        if (g.type === 'LINE') return [g.start!, g.end!].filter(Boolean);
        return g.vertices ?? [];
      });
      if (allPts.length > 0) vpStore.zoomToExtents(computeBounds(allPts));
    };
    const onRotate = (e: Event) => {
      const { center, angleRad } = (e as CustomEvent).detail as {
        center: Point2D;
        angleRad: number;
      };
      const selStore = useSelectionStore.getState();
      const dwgStore = useDrawingStore.getState();
      const undStore = useUndoStore.getState();
      const ids = Array.from(selStore.selectedIds);
      if (ids.length === 0) return;
      const ops = ids
        .map((id) => {
          const f = dwgStore.getFeature(id);
          if (!f) return null;
          const newF = transformFeature(f, (p) => rotate(p, center, angleRad));
          dwgStore.updateFeature(id, { geometry: newF.geometry });
          return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
        })
        .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];
      if (ops.length > 0) undStore.pushUndo(makeBatchEntry('Rotate', ops));
      toolStore.resetToolState();
    };
    const onScale = (e: Event) => {
      const { center, factor } = (e as CustomEvent).detail as {
        center: Point2D;
        factor: number;
      };
      const selStore = useSelectionStore.getState();
      const dwgStore = useDrawingStore.getState();
      const undStore = useUndoStore.getState();
      const ids = Array.from(selStore.selectedIds);
      if (ids.length === 0) return;
      const ops = ids
        .map((id) => {
          const f = dwgStore.getFeature(id);
          if (!f) return null;
          const newF = transformFeature(f, (p) => scale(p, center, factor));
          dwgStore.updateFeature(id, { geometry: newF.geometry });
          return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
        })
        .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];
      if (ops.length > 0) undStore.pushUndo(makeBatchEntry('Scale', ops));
      toolStore.resetToolState();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('cad:confirm', onConfirm);
    window.addEventListener('cad:zoomExtents', onZoomExtents);
    window.addEventListener('cad:rotate', onRotate);
    window.addEventListener('cad:scale', onScale);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('cad:confirm', onConfirm);
      window.removeEventListener('cad:zoomExtents', onZoomExtents);
      window.removeEventListener('cad:rotate', onRotate);
      window.removeEventListener('cad:scale', onScale);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolStore]);

  // ─────────────────────────────────────────────
  // Right-click / context menu handler
  // ─────────────────────────────────────────────
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { wx, wy } = s2w(sx, sy);
      const toolState = toolStore.state;
      const { activeTool } = toolState;

      // Right-click during polyline drawing: finish if we have at least 1 committed segment
      // (drawingPoints.length >= 2 means: start point + at least 1 more = at least 1 segment)
      if (activeTool === 'DRAW_POLYLINE') {
        if (toolState.drawingPoints.length >= 2) {
          finishFeature('POLYLINE');
        } else {
          // Cancel — no segments yet
          polylineGroupIdRef.current = null;
          lastPolylineSegmentIdRef.current = null;
          toolStore.clearDrawingPoints();
          toolStore.setTool('SELECT');
        }
        return;
      }

      // Right-click during polygon drawing: show Close / Cancel mini-menu
      if (activeTool === 'DRAW_POLYGON') {
        setDrawingMenu({
          x: e.clientX,
          y: e.clientY,
          canClose: toolState.drawingPoints.length >= 3,
        });
        return;
      }

      // Right-click during rectangle/regular-polygon/circle drawing: cancel
      if (
        (activeTool === 'DRAW_RECTANGLE' || activeTool === 'DRAW_REGULAR_POLYGON' || activeTool === 'DRAW_CIRCLE') &&
        toolState.drawingPoints.length > 0
      ) {
        toolStore.clearDrawingPoints();
        return;
      }

      // Right-click during line drawing: cancel
      if (activeTool === 'DRAW_LINE' && toolState.drawingPoints.length > 0) {
        toolStore.clearDrawingPoints();
        return;
      }

      // Right-click with SELECT tool (or any non-drawing tool): show context menu
      const hit = hitTest(sx, sy);
      // If hit a feature not yet selected, select it first
      if (hit && !selectionStore.selectedIds.has(hit)) {
        selectionStore.select(hit, 'REPLACE');
      }
      setContextMenu({ x: e.clientX, y: e.clientY, worldX: wx, worldY: wy, featureId: hit });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolStore, selectionStore, drawingStore, undoStore],
  );

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  const hasNoLayers = drawingStore.document.layerOrder.length === 0;
  const isDrawingTool = activeTool.startsWith('DRAW_');

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-gray-400">
      {/* PixiJS init failure overlay */}
      {initError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/90">
          <div className="max-w-sm w-full bg-gray-900 border border-red-700 rounded-xl p-5 shadow-2xl space-y-3 text-xs">
            <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
              <span>⚠️</span> Canvas Initialisation Failed
            </div>
            <p className="text-gray-300 leading-relaxed">{initError}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}

      {/* No-layers warning overlay — shown when trying to draw with no active layer */}
      {hasNoLayers && isDrawingTool && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="bg-yellow-900/90 border border-yellow-600 text-yellow-200 text-xs font-semibold px-4 py-2 rounded-lg shadow-lg text-center">
            ⚠️ No layers — add a layer in the Layer Panel or create a new drawing.
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ cursor: cursorStyle }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />
      {snapLabel && (
        <div
          className="absolute pointer-events-none text-xs font-mono px-1 py-0.5 rounded"
          style={{
            left: snapLabel.sx + 12,
            top: snapLabel.sy - 8,
            color: '#00ff00',
            background: 'rgba(0,0,0,0.6)',
            transform: 'translateY(-50%)',
            zIndex: 10,
          }}
        >
          {snapLabel.text}
        </div>
      )}

      {/* Floating operation HUD — shows live numeric values near cursor during operations */}
      {hud && (
        <div
          className="absolute pointer-events-none z-20 text-[10px] font-mono leading-tight rounded px-1.5 py-1"
          style={{
            left: hud.sx,
            top: hud.sy,
            background: 'rgba(0,0,0,0.72)',
            color: '#e0e8ff',
            border: '1px solid rgba(100,140,255,0.4)',
          }}
        >
          {hud.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Cursor X/Y coordinate overlay — always visible in bottom-left of canvas */}
      <div
        className="absolute bottom-2 left-2 pointer-events-none z-10 text-[10px] font-mono text-white select-none"
        style={{ background: 'rgba(0,0,0,0.55)', padding: '2px 7px', borderRadius: 3, letterSpacing: '0.02em' }}
      >
        X: {viewportStore.cursorWorld.x.toFixed(3)} &nbsp; Y: {viewportStore.cursorWorld.y.toFixed(3)}
      </div>

      {/* Rich right-click context menu */}
      {contextMenu && (
        <FeatureContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          worldX={contextMenu.worldX}
          worldY={contextMenu.worldY}
          featureId={contextMenu.featureId}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Drawing-mode mini-menu (shown on right-click during DRAW_POLYGON) */}
      {drawingMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDrawingMenu(null)} />
          <div
            className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 text-xs text-gray-200 min-w-[160px]"
            style={{ top: drawingMenu.y, left: drawingMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-[10px] text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-700 mb-1">
              Drawing Polygon
            </div>
            {drawingMenu.canClose ? (
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-green-400"
                onClick={() => {
                  setDrawingMenu(null);
                  finishFeature('POLYGON');
                }}
              >
                ✓ Close Polygon
              </button>
            ) : (
              <div className="px-3 py-1.5 text-gray-500 italic">
                Need ≥ 3 points to close
              </div>
            )}
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-red-400"
              onClick={() => {
                setDrawingMenu(null);
                toolStore.clearDrawingPoints();
                toolStore.setTool('SELECT');
              }}
            >
              ✕ Cancel Drawing
            </button>
          </div>
        </>
      )}
    </div>
  );
}
