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
import { useKeyboard } from '../hooks/useKeyboard';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const HIT_TOLERANCE_PX = 5;
const GRIP_SIZE = 8; // half-size of grip square in pixels
const MAX_GRID_ITERATIONS = 500; // max grid lines per axis to prevent performance issues
// Minimum meaningful segment length in world units before zoom scaling.
// Prevents duplicate zero-length segments on double-click.
const MIN_SEGMENT_LENGTH_BASE = 0.001;

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
  featureId: string | null;
}

// ─────────────────────────────────────────────
// CanvasViewport Component
// ─────────────────────────────────────────────
export default function CanvasViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiRef = useRef<{
    app: import('pixi.js').Application;
    gridLayer: import('pixi.js').Container;
    featureLayer: import('pixi.js').Container;
    selectionLayer: import('pixi.js').Container;
    snapLayer: import('pixi.js').Container;
    toolPreviewLayer: import('pixi.js').Container;
    featureGraphics: Map<string, import('pixi.js').Graphics>;
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

  // Polyline group ID tracking — each new polyline drawing gets a fresh UUID
  const polylineGroupIdRef = useRef<string | null>(null);
  // Track last segment feature ID for dblclick cleanup
  const lastPolylineSegmentIdRef = useRef<string | null>(null);

  // Keyboard shortcuts
  useKeyboard();

  // Update cursor when active tool changes (PAN tool shows grab cursor)
  const activeTool = toolStore.state.activeTool;
  useEffect(() => {
    if (!isPanningRef.current && !isSpaceDownRef.current) {
      setCursorStyle(activeTool === 'PAN' ? 'grab' : 'crosshair');
    }
  }, [activeTool]);

  // ─────────────────────────────────────────────
  // Initialize PixiJS
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !canvasRef.current) return;

    let cancelled = false;

    async function init() {
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
        backgroundColor: bgColor,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      const gridLayer = new PIXI.Container();
      const featureLayer = new PIXI.Container();
      const selectionLayer = new PIXI.Container();
      const snapLayer = new PIXI.Container();
      const toolPreviewLayer = new PIXI.Container();

      app.stage.addChild(gridLayer, featureLayer, selectionLayer, snapLayer, toolPreviewLayer);

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
        gridLayer,
        featureLayer,
        selectionLayer,
        snapLayer,
        toolPreviewLayer,
        featureGraphics: new Map(),
        gridGraphics,
        selectionGraphics,
        snapGraphics,
        previewGraphics,
        GraphicsClass: PIXI.Graphics,
      };

      viewportStore.setScreenSize(width, height);

      // Start render loop
      function renderLoop() {
        if (!pixiRef.current) return;
        renderAll();
        rafRef.current = requestAnimationFrame(renderLoop);
      }
      rafRef.current = requestAnimationFrame(renderLoop);
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
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !pixiRef.current) return;
      const { width, height } = entry.contentRect;
      pixiRef.current.app.renderer.resize(width, height);
      viewportStore.setScreenSize(width, height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
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
  // Render: Grid
  // ─────────────────────────────────────────────
  function renderGrid() {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const g = pixi.gridGraphics;
    g.clear();

    const doc = drawingStore.document;
    if (!doc.settings.gridVisible) return;

    const { zoom, screenWidth, screenHeight } = viewportStore;
    const wb = viewportStore.getWorldBounds();
    const baseMajor = doc.settings.gridMajorSpacing;
    const baseMinor = baseMajor / doc.settings.gridMinorDivisions;
    const gridStyle = doc.settings.gridStyle;

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
        g.lineStyle(isMajorLine ? 0.5 : 0.25, isMajorLine ? 0xbbbbbb : 0xe0e0e0, 1);
        g.moveTo(sx, syTop);
        g.lineTo(sx, syBot);
      }
      // Draw horizontal lines
      for (let wy = startY; wy <= endY; wy += spacing) {
        const { sy } = w2s(0, wy);
        const { sx: sxLeft } = w2s(wb.minX, wy);
        const { sx: sxRight } = w2s(wb.maxX, wy);
        const isMajorLine = isMajor(wy);
        g.lineStyle(isMajorLine ? 0.5 : 0.25, isMajorLine ? 0xbbbbbb : 0xe0e0e0, 1);
        g.moveTo(sxLeft, sy);
        g.lineTo(sxRight, sy);
      }
    } else {
      for (let wx = startX; wx <= endX; wx += spacing) {
        for (let wy = startY; wy <= endY; wy += spacing) {
          const major = isMajor(wx) && isMajor(wy);
          const color = major ? 0xbbbbbb : 0xe0e0e0;
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
    const color = parseInt(feature.style.color.replace('#', ''), 16);
    const weight = feature.style.lineWeight;
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

    const { selectedIds } = selectionStore;
    const toolState = toolStore.state;

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

    // Draw hover highlight (when SELECT tool active and not already selected)
    const hoveredId = hoveredIdRef.current;
    if (
      hoveredId &&
      !selectedIds.has(hoveredId) &&
      toolState.activeTool === 'SELECT'
    ) {
      const feature = drawingStore.getFeature(hoveredId);
      if (feature) {
        const geom = feature.geometry;
        g.lineStyle(1.5, 0x66aaff, 0.6);
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

      // Highlight: blue outline
      const geom = feature.geometry;
      g.lineStyle(2, 0x0088ff, 1);
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
      g.lineStyle(1, 0x0088ff, 1);
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

    const toolState = toolStore.state;
    const { drawingPoints, previewPoint } = toolState;
    const activeTool = toolState.activeTool;

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
      g.lineStyle(1, 0x0088ff, 0.6);
      g.moveTo(bx, by);
      g.lineTo(x2, y2);
      return;
    }

    // For ROTATE: show line from center to cursor + angle arc indicator
    if (activeTool === 'ROTATE' && toolState.rotateCenter) {
      const center = toolState.rotateCenter;
      const { sx: cx, sy: cy } = w2s(center.x, center.y);
      const { sx: x2, sy: y2 } = w2s(previewPoint.x, previewPoint.y);
      g.lineStyle(1, 0xff8800, 0.7);
      g.moveTo(cx, cy);
      g.lineTo(x2, y2);
      // Small cross at center
      g.moveTo(cx - 5, cy);
      g.lineTo(cx + 5, cy);
      g.moveTo(cx, cy - 5);
      g.lineTo(cx, cy + 5);
      return;
    }

    // For SCALE: show line from base point to cursor
    if (activeTool === 'SCALE' && toolState.basePoint) {
      const bp = toolState.basePoint;
      const { sx: bx, sy: by } = w2s(bp.x, bp.y);
      const { sx: x2, sy: y2 } = w2s(previewPoint.x, previewPoint.y);
      g.lineStyle(1, 0x00ff88, 0.6);
      g.moveTo(bx, by);
      g.lineTo(x2, y2);
      // Small cross at base point
      g.moveTo(bx - 5, by);
      g.lineTo(bx + 5, by);
      g.moveTo(bx, by - 5);
      g.lineTo(bx, by + 5);
      return;
    }

    // For MIRROR: show mirror line preview
    if (activeTool === 'MIRROR' && drawingPoints.length === 1) {
      const lineA = drawingPoints[0];
      const { sx: ax, sy: ay } = w2s(lineA.x, lineA.y);
      const { sx: bx, sy: by } = w2s(previewPoint.x, previewPoint.y);
      g.lineStyle(1, 0xff00ff, 0.6);
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      return;
    }

    const isDrawing =
      activeTool === 'DRAW_LINE' ||
      activeTool === 'DRAW_POLYLINE' ||
      activeTool === 'DRAW_POLYGON';

    if (!isDrawing || drawingPoints.length === 0) return;

    const lastPt = drawingPoints[drawingPoints.length - 1];
    const { sx: x1, sy: y1 } = w2s(lastPt.x, lastPt.y);
    const { sx: x2, sy: y2 } = w2s(previewPoint.x, previewPoint.y);

    // Dashed preview line
    g.lineStyle(1, 0x666666, 0.7);
    const dashLen = 6;
    const gapLen = 4;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    let pos = 0;
    let drawing = true;
    while (pos < len) {
      const segLen = Math.min(drawing ? dashLen : gapLen, len - pos);
      const nx = x1 + ux * pos;
      const ny = y1 + uy * pos;
      if (drawing) {
        g.moveTo(nx, ny);
        g.lineTo(nx + ux * segLen, ny + uy * segLen);
      }
      pos += segLen;
      drawing = !drawing;
    }
  }

  // ─────────────────────────────────────────────
  // Master render function
  // ─────────────────────────────────────────────
  function renderAll() {
    // Sync canvas background color with settings
    const pixi = pixiRef.current;
    if (pixi) {
      const bgHex = drawingStore.document.settings.backgroundColor ?? '#FFFFFF';
      const bgColor = parseInt(bgHex.replace('#', ''), 16);
      if ((pixi.app.renderer as { backgroundColor?: number }).backgroundColor !== bgColor) {
        pixi.app.renderer.background.color = bgColor;
      }
    }
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
          style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
          properties: {},
        };
      case 'POLYLINE':
        if (points.length < 2) return null;
        return {
          id,
          type: 'POLYLINE',
          geometry: { type: 'POLYLINE', vertices: points },
          layerId: activeLayerId,
          style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
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
    return {
      id: generateId(),
      type: 'LINE',
      geometry: { type: 'LINE', start, end },
      layerId: activeLayerId,
      style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
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
      if (snap) return snap.point;
    } else {
      snapResultRef.current = null;
    }
    return cursor;
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
          if (!toolState.basePoint) {
            toolStore.setBasePoint(worldPt);
          } else {
            const dx = worldPt.x - toolState.basePoint.x;
            const dy = worldPt.y - toolState.basePoint.y;
            const selectedIds = Array.from(selectionStore.selectedIds);
            if (selectedIds.length === 0) break;
            const ops = selectedIds.map((id) => {
              const f = drawingStore.getFeature(id)!;
              const newF = transformFeature(f, (p) => translate(p, dx, dy));
              drawingStore.updateFeature(id, { geometry: newF.geometry });
              return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
            });
            undoStore.pushUndo(makeBatchEntry('Move', ops));
            toolStore.resetToolState();
          }
          break;
        }

        case 'COPY': {
          if (!toolState.basePoint) {
            toolStore.setBasePoint(worldPt);
          } else {
            const dx = worldPt.x - toolState.basePoint.x;
            const dy = worldPt.y - toolState.basePoint.y;
            const selectedIds = Array.from(selectionStore.selectedIds);
            if (selectedIds.length === 0) break;
            const newFeatures: Feature[] = [];
            for (const id of selectedIds) {
              const f = drawingStore.getFeature(id)!;
              const newF = transformFeature(f, (p) => translate(p, dx, dy));
              newF.id = generateId();
              newFeatures.push(newF);
            }
            drawingStore.addFeatures(newFeatures);
            const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
            undoStore.pushUndo(makeBatchEntry('Copy', ops));
            toolStore.setBasePoint(worldPt); // Allow multiple copies
          }
          break;
        }

        case 'ROTATE': {
          if (!toolState.rotateCenter) {
            toolStore.setRotateCenter(worldPt);
          }
          break;
        }

        case 'SCALE': {
          if (!toolState.basePoint) {
            toolStore.setBasePoint(worldPt);
          }
          break;
        }

        case 'MIRROR': {
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt);
          } else {
            const lineA = toolState.drawingPoints[0];
            const lineB = worldPt;
            const selectedIds = Array.from(selectionStore.selectedIds);
            if (selectedIds.length === 0) break;
            const ops = selectedIds.map((id) => {
              const f = drawingStore.getFeature(id)!;
              const newF = transformFeature(f, (p) => mirror(p, lineA, lineB));
              drawingStore.updateFeature(id, { geometry: newF.geometry });
              return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
            });
            undoStore.pushUndo(makeBatchEntry('Mirror', ops));
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

      // Update hover state (SELECT tool only)
      if (toolStore.state.activeTool === 'SELECT' && !isPanningRef.current) {
        const hit = hitTest(sx, sy);
        hoveredIdRef.current = hit;
        // Change cursor to pointer when hovering a feature
        if (!gripDragRef.current) {
          const onGrip = hit && selectionStore.selectedIds.has(hit) ? hitTestGrip(sx, sy) : null;
          if (onGrip) {
            setCursorStyle('move');
          } else if (hit) {
            setCursorStyle('pointer');
          } else {
            setCursorStyle('crosshair');
          }
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewportStore, toolStore, drawingStore],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 1 || (e.button === 0 && isMiddleMouseRef.current)) {
        isPanningRef.current = false;
        isMiddleMouseRef.current = false;
        setCursorStyle(isSpaceDownRef.current ? 'grab' : toolStore.state.activeTool === 'PAN' ? 'grab' : 'crosshair');
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
        setCursorStyle(isSpaceDownRef.current ? 'grab' : 'crosshair');
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
      setCursorStyle(isSpaceDownRef.current ? 'grab' : 'crosshair');
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
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolStore, drawingStore],
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
        setCursorStyle('crosshair');
      }
    };
    const onConfirm = () => {
      const toolState = toolStore.state;
      const { activeTool, drawingPoints } = toolState;
      if (activeTool === 'DRAW_POLYLINE' && drawingPoints.length >= 2) {
        finishFeature('POLYLINE');
      } else if (activeTool === 'DRAW_POLYGON' && drawingPoints.length >= 3) {
        finishFeature('POLYGON');
      }
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
    window.addEventListener('cad:rotate', onRotate);
    window.addEventListener('cad:scale', onScale);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('cad:confirm', onConfirm);
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

      // Right-click during polygon drawing: close & finish, or cancel
      if (activeTool === 'DRAW_POLYGON') {
        if (toolState.drawingPoints.length >= 3) {
          finishFeature('POLYGON');
        } else {
          toolStore.clearDrawingPoints();
          toolStore.setTool('SELECT');
        }
        return;
      }

      // Right-click during line drawing: cancel
      if (activeTool === 'DRAW_LINE' && toolState.drawingPoints.length > 0) {
        toolStore.clearDrawingPoints();
        return;
      }

      // Right-click with SELECT tool: show context menu
      if (activeTool === 'SELECT') {
        const hit = hitTest(sx, sy);
        // If hit a feature not yet selected, select it first
        if (hit && !selectionStore.selectedIds.has(hit)) {
          selectionStore.select(hit, 'REPLACE');
        }
        setContextMenu({ x: e.clientX, y: e.clientY, featureId: hit });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolStore, selectionStore, drawingStore, undoStore],
  );

  // ─────────────────────────────────────────────
  // Context menu: erase selected, properties, etc.
  // ─────────────────────────────────────────────
  function handleContextMenuErase() {
    const ids = Array.from(selectionStore.selectedIds);
    if (ids.length === 0) return;
    const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
    for (const f of features) {
      drawingStore.removeFeature(f.id);
    }
    if (features.length === 1) {
      undoStore.pushUndo(makeRemoveFeatureEntry(features[0]));
    } else if (features.length > 1) {
      const ops = features.map((f) => ({ type: 'REMOVE_FEATURE' as const, data: f }));
      undoStore.pushUndo(makeBatchEntry('Delete', ops));
    }
    selectionStore.deselectAll();
    setContextMenu(null);
  }

  function handleContextMenuProperties() {
    if (!contextMenu?.featureId) return;
    window.dispatchEvent(
      new CustomEvent('cad:openFeatureDialog', {
        detail: { featureId: contextMenu.featureId, x: contextMenu.x, y: contextMenu.y },
      }),
    );
    setContextMenu(null);
  }

  function handleContextMenuSelectGroup() {
    if (!contextMenu?.featureId) return;
    const feature = drawingStore.getFeature(contextMenu.featureId);
    const groupId = feature?.properties?.polylineGroupId as string | undefined;
    if (groupId) {
      const groupIds = getPolylineGroupIds(groupId);
      selectionStore.selectMultiple(groupIds, 'REPLACE');
    }
    setContextMenu(null);
  }

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  const contextFeature = contextMenu?.featureId ? drawingStore.getFeature(contextMenu.featureId) : null;
  const contextHasGroup = !!(contextFeature?.properties?.polylineGroupId);
  const selCount = selectionStore.selectedIds.size;

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ cursor: cursorStyle }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
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

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          {/* Click-away overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 text-xs text-gray-200 min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            {contextMenu.featureId && (
              <>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors"
                  onClick={handleContextMenuProperties}
                >
                  Properties…
                </button>
                {contextHasGroup && (
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors"
                    onClick={handleContextMenuSelectGroup}
                  >
                    Select Polyline Group
                  </button>
                )}
                <div className="border-t border-gray-700 my-1" />
              </>
            )}
            {selCount > 0 && (
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-red-900/40 text-red-400 transition-colors"
                onClick={handleContextMenuErase}
              >
                Delete{selCount > 1 ? ` (${selCount})` : ''}
              </button>
            )}
            <div className="border-t border-gray-700 my-1" />
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors"
              onClick={() => { selectionStore.deselectAll(); setContextMenu(null); }}
            >
              Deselect All
            </button>
          </div>
        </>
      )}
    </div>
  );
}
