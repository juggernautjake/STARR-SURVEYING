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
import { translate, rotate, mirror, transformFeature } from '@/lib/cad/geometry/transform';
import { generateId } from '@/lib/cad/types';
import type { Feature, Point2D, BoundingBox, FeatureType } from '@/lib/cad/types';
import { DEFAULT_FEATURE_STYLE, SNAP_INDICATOR_STYLES, MIN_ZOOM, MAX_ZOOM } from '@/lib/cad/constants';
import { useKeyboard } from '../hooks/useKeyboard';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const HIT_TOLERANCE_PX = 5;
const GRIP_SIZE = 8; // half-size of grip square in pixels

const SNAP_LABEL: Record<string, string> = {
  ENDPOINT: 'Endpoint',
  MIDPOINT: 'Midpoint',
  INTERSECTION: 'Intersection',
  NEAREST: 'Nearest',
  CENTER: 'Center',
  PERPENDICULAR: 'Perpendicular',
  GRID: 'Grid',
};

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
  const [cursorStyle, setCursorStyle] = useState('crosshair');
  const [snapLabel, setSnapLabel] = useState<{ sx: number; sy: number; text: string } | null>(null);

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

      const app = new PIXI.Application({
        view: canvas,
        width,
        height,
        backgroundColor: 0xffffff,
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
    const majorSpacing = doc.settings.gridMajorSpacing;
    const minorSpacing = majorSpacing / doc.settings.gridMinorDivisions;
    const gridStyle = doc.settings.gridStyle;

    // Skip minor lines if they'd be too close together
    const minorPx = minorSpacing * zoom;
    const drawMinor = minorPx >= 4;

    const spacing = drawMinor ? minorSpacing : majorSpacing;
    const startX = Math.floor(wb.minX / spacing) * spacing;
    const endX = Math.ceil(wb.maxX / spacing) * spacing;
    const startY = Math.floor(wb.minY / spacing) * spacing;
    const endY = Math.ceil(wb.maxY / spacing) * spacing;

    const isMajor = (v: number) =>
      Math.abs(Math.round(v / majorSpacing) * majorSpacing - v) < 0.001;

    for (let wx = startX; wx <= endX; wx += spacing) {
      for (let wy = startY; wy <= endY; wy += spacing) {
        const major = isMajor(wx) && isMajor(wy);
        const color = major ? 0xcccccc : 0xe8e8e8;
        const { sx, sy } = w2s(wx, wy);

        if (gridStyle === 'DOTS') {
          const r = major ? 1.5 : 0.75;
          g.beginFill(color, 1);
          g.drawCircle(sx, sy, r);
          g.endFill();
        } else if (gridStyle === 'LINES') {
          if (wy === startY) {
            // Vertical line — major depends only on wx
            const { sy: syTop } = w2s(wx, wb.maxY);
            const { sy: syBot } = w2s(wx, wb.minY);
            const isMajorLine = isMajor(wx);
            const vLineColor = isMajorLine ? 0xcccccc : 0xe8e8e8;
            g.lineStyle(isMajorLine ? 0.5 : 0.25, vLineColor, 1);
            g.moveTo(sx, syTop);
            g.lineTo(sx, syBot);
          }
        } else if (gridStyle === 'CROSSHAIRS') {
          const size = major ? 4 : 2;
          g.lineStyle(0.5, color, 1);
          g.moveTo(sx - size, sy);
          g.lineTo(sx + size, sy);
          g.moveTo(sx, sy - size);
          g.lineTo(sx, sy + size);
        }
      }

      if (gridStyle === 'LINES') {
        // Horizontal lines — major depends only on wy
        for (let wy = startY; wy <= endY; wy += spacing) {
          if (wx === startX) {
            const isMajorLine = isMajor(wy);
            const color = isMajorLine ? 0xcccccc : 0xe8e8e8;
            const { sx: sxLeft } = w2s(wb.minX, wy);
            const { sx: sxRight } = w2s(wb.maxX, wy);
            const { sy } = w2s(wx, wy);
            g.lineStyle(isMajorLine ? 0.5 : 0.25, color, 1);
            g.moveTo(sxLeft, sy);
            g.lineTo(sxRight, sy);
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
      g.lineStyle(1, 0xff0000, 0.7);
      g.moveTo(origin.sx - 8, origin.sy);
      g.lineTo(origin.sx + 8, origin.sy);
      g.moveTo(origin.sx, origin.sy - 8);
      g.lineTo(origin.sx, origin.sy + 8);
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
    const features = drawingStore.getVisibleFeatures();

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

  function finishFeature(type: FeatureType) {
    const { drawingPoints } = toolStore.state;
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
            const mode = e.shiftKey ? 'TOGGLE' : 'REPLACE';
            selectionStore.select(hit, mode);
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
          toolStore.addDrawingPoint(worldPt);
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
    (_e: React.MouseEvent<HTMLCanvasElement>) => {
      const toolState = toolStore.state;
      const { activeTool } = toolState;

      if (activeTool === 'DRAW_POLYLINE' && toolState.drawingPoints.length >= 2) {
        finishFeature('POLYLINE');
      } else if (activeTool === 'DRAW_POLYGON' && toolState.drawingPoints.length >= 3) {
        finishFeature('POLYGON');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolStore],
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
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('cad:confirm', onConfirm);
    window.addEventListener('cad:rotate', onRotate);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('cad:confirm', onConfirm);
      window.removeEventListener('cad:rotate', onRotate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolStore]);

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
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
        onContextMenu={(e) => e.preventDefault()}
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
    </div>
  );
}
