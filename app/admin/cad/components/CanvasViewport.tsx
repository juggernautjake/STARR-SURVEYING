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
import { featureBounds, computeBounds, computeFeaturesBounds } from '@/lib/cad/geometry/bounds';
import { boundsContains, boundsOverlap } from '@/lib/cad/geometry/intersection';
import { pointToSegmentDistance, pointInPolygon } from '@/lib/cad/geometry/point';
import { translate, rotate, mirror, scale, transformFeature } from '@/lib/cad/geometry/transform';
import { generateId } from '@/lib/cad/types';
import type { Feature, Point2D, BoundingBox, FeatureType, TextLabel, CircleGeometry, EllipseGeometry, ArcGeometry, SplineGeometry } from '@/lib/cad/types';
import { DEFAULT_FEATURE_STYLE, SNAP_INDICATOR_STYLES, MIN_ZOOM, MAX_ZOOM, DEFAULT_DISPLAY_PREFERENCES, DEFAULT_LAYER_DISPLAY_PREFERENCES } from '@/lib/cad/constants';
import { formatDistance, formatCoordinates, formatAngle, formatSurveyAngle } from '@/lib/cad/geometry/units';
import { inverseBearingDistance } from '@/lib/cad/geometry/bearing';
import { generateLabelsForFeature } from '@/lib/cad/labels';
import { cadLog } from '@/lib/cad/logger';
import {
  drawCircle as drawCircleCurve,
  drawEllipse as drawEllipseCurve,
  drawArc as drawArcCurve,
  drawSpline as drawSplineCurve,
  pointToCircleDistance,
  pointInCircle,
  pointToEllipseDistance,
  pointInEllipse,
  pointToArcDistance,
  pointToSplineDistance,
  circleGripPoints,
  ellipseGripPoints,
  arcGripPoints,
  splineGripPoints,
  fitPointsToBezier,
  bezierToFitPoints,
  getSplineHandles,
  insertInflectionPoint,
  findClosestSplineParam,
  arcFrom3Points,
  type GraphicsLike,
} from '@/lib/cad/geometry/curve-render';
import { useKeyboard } from '../hooks/useKeyboard';
import FeatureContextMenu from './FeatureContextMenu';
import InteractiveOpPanel from './InteractiveOpPanel';
import ImageInsertDialog from './ImageInsertDialog';
import type { ProjectImage } from '@/lib/cad/types';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const HIT_TOLERANCE_PX = 5;
const DEFAULT_GRIP_SIZE = 8; // half-size of grip square in pixels (fallback)
const MAX_GRID_ITERATIONS = 500; // max grid lines per axis to prevent performance issues
// Minimum meaningful segment length in world units before zoom scaling.
// Prevents duplicate zero-length segments on double-click.
const MIN_SEGMENT_LENGTH_BASE = 0.001;

// Inline title-block field editor overlay dimensions
const TB_EDITOR_MIN_WIDTH = 160;         // minimum pixel width of the editor input
const TB_EDITOR_RIGHT_MARGIN = 260;      // minimum pixels from viewport right edge

// Grey background color rendered outside the paper boundary
const CANVAS_SURROUND_COLOR = 0x808080;

// Paper size map (inches): name → [width, height] in portrait
const PAPER_SIZE_MAP: Record<string, [number, number]> = {
  LETTER: [8.5, 11],
  TABLOID: [11, 17],
  ARCH_C: [18, 24],
  ARCH_D: [24, 36],
  ARCH_E: [36, 48],
};

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
// Custom SVG cursors for professional feel
const SVG_CURSOR_CROSSHAIR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cline x1='12' y1='0' x2='12' y2='10' stroke='%23fff' stroke-width='1.5'/%3E%3Cline x1='12' y1='14' x2='12' y2='24' stroke='%23fff' stroke-width='1.5'/%3E%3Cline x1='0' y1='12' x2='10' y2='12' stroke='%23fff' stroke-width='1.5'/%3E%3Cline x1='14' y1='12' x2='24' y2='12' stroke='%23fff' stroke-width='1.5'/%3E%3Ccircle cx='12' cy='12' r='2' fill='none' stroke='%23fff' stroke-width='1'/%3E%3Cline x1='12' y1='1' x2='12' y2='10' stroke='%23000' stroke-width='0.5'/%3E%3Cline x1='12' y1='14' x2='12' y2='23' stroke='%23000' stroke-width='0.5'/%3E%3Cline x1='1' y1='12' x2='10' y2='12' stroke='%23000' stroke-width='0.5'/%3E%3Cline x1='14' y1='12' x2='23' y2='12' stroke='%23000' stroke-width='0.5'/%3E%3C/svg%3E") 12 12, crosshair`;
// Erase cursor: yellow outline = idle (nothing under cursor), red outline = hovering over erasable element
const SVG_CURSOR_ERASE_IDLE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Crect x='3' y='3' width='14' height='14' rx='2' fill='%23ffcc00' fill-opacity='0.15' stroke='%23ddaa00' stroke-width='1.5'/%3E%3Cline x1='6' y1='6' x2='14' y2='14' stroke='%23ddaa00' stroke-width='1.5'/%3E%3Cline x1='14' y1='6' x2='6' y2='14' stroke='%23ddaa00' stroke-width='1.5'/%3E%3C/svg%3E") 10 10, crosshair`;
const SVG_CURSOR_ERASE_ACTIVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Crect x='3' y='3' width='14' height='14' rx='2' fill='%23ff4444' fill-opacity='0.3' stroke='%23ff4444' stroke-width='1.5'/%3E%3Cline x1='6' y1='6' x2='14' y2='14' stroke='white' stroke-width='2'/%3E%3Cline x1='14' y1='6' x2='6' y2='14' stroke='white' stroke-width='2'/%3E%3C/svg%3E") 10 10, crosshair`;
const SVG_CURSOR_ROTATE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M12 3a9 9 0 0 1 8.5 6' fill='none' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M17 3l3.5 6-6 0' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M12 3a9 9 0 0 1 8.5 6' fill='none' stroke='%23000' stroke-width='0.5'/%3E%3C/svg%3E") 12 12, alias`;

const SVG_CURSOR_BOX_SELECT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Crect x='4' y='4' width='16' height='16' fill='none' stroke='%230088ff' stroke-width='1.5' stroke-dasharray='3 2'/%3E%3Cline x1='12' y1='0' x2='12' y2='8' stroke='white' stroke-width='1'/%3E%3Cline x1='12' y1='16' x2='12' y2='24' stroke='white' stroke-width='1'/%3E%3Cline x1='0' y1='12' x2='8' y2='12' stroke='white' stroke-width='1'/%3E%3Cline x1='16' y1='12' x2='24' y2='12' stroke='white' stroke-width='1'/%3E%3C/svg%3E") 12 12, crosshair`;

const TOOL_CURSORS: Partial<Record<string, string>> = {
  SELECT: 'default',
  BOX_SELECT: SVG_CURSOR_BOX_SELECT,
  PAN: 'grab',
  DRAW_POINT: SVG_CURSOR_CROSSHAIR,
  DRAW_LINE: SVG_CURSOR_CROSSHAIR,
  DRAW_POLYLINE: SVG_CURSOR_CROSSHAIR,
  DRAW_POLYGON: SVG_CURSOR_CROSSHAIR,
  DRAW_RECTANGLE: SVG_CURSOR_CROSSHAIR,
  DRAW_REGULAR_POLYGON: SVG_CURSOR_CROSSHAIR,
  DRAW_CIRCLE: SVG_CURSOR_CROSSHAIR,
  DRAW_CIRCLE_EDGE: SVG_CURSOR_CROSSHAIR,
  DRAW_ELLIPSE: SVG_CURSOR_CROSSHAIR,
  DRAW_ELLIPSE_EDGE: SVG_CURSOR_CROSSHAIR,
  DRAW_CURVED_LINE: SVG_CURSOR_CROSSHAIR,
  DRAW_SPLINE_FIT: SVG_CURSOR_CROSSHAIR,
  DRAW_SPLINE_CONTROL: SVG_CURSOR_CROSSHAIR,
  DRAW_TEXT: SVG_CURSOR_CROSSHAIR,
  DRAW_IMAGE: SVG_CURSOR_CROSSHAIR,
  MOVE: 'move',
  COPY: 'copy',
  ROTATE: SVG_CURSOR_ROTATE,
  MIRROR: 'col-resize',
  SCALE: 'nwse-resize',
  ERASE: SVG_CURSOR_ERASE_IDLE,
};

const MIN_LABEL_FONT_SIZE_PX = 4;

// ─────────────────────────────────────────────
// CanvasViewport Component
// ─────────────────────────────────────────────
interface CanvasViewportProps {
  /** When set, the DRAW_IMAGE tool should pre-select this project image id. */
  pendingPlaceImageId?: string | null;
  /** Called after the pending image id has been consumed (image placed or dialog dismissed). */
  onPlaceImageConsumed?: () => void;
}

export default function CanvasViewport({ pendingPlaceImageId, onPlaceImageConsumed }: CanvasViewportProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiRef = useRef<{
    app: import('pixi.js').Application;
    paperLayer: import('pixi.js').Container;
    /** Container that rotates with drawingRotationDeg — wraps grid, features, labels, selection, snap, preview */
    drawingRotContainer: import('pixi.js').Container;
    gridLayer: import('pixi.js').Container;
    featureLayer: import('pixi.js').Container;
    labelLayer: import('pixi.js').Container;
    selectionLayer: import('pixi.js').Container;
    snapLayer: import('pixi.js').Container;
    toolPreviewLayer: import('pixi.js').Container;
    /** Sits above drawingRotContainer — title block does NOT rotate with the drawing */
    titleBlockLayer: import('pixi.js').Container;
    titleBlockGraphics: import('pixi.js').Graphics;
    featureGraphics: Map<string, import('pixi.js').Graphics>;
    labelTexts: Map<string, import('pixi.js').Text>;
    /** PixiJS Sprites for IMAGE features, keyed by featureId */
    imageSprites: Map<string, import('pixi.js').Sprite>;
    /** Texture cache keyed by projectImage.id */
    imageTextures: Map<string, import('pixi.js').Texture>;
    paperGraphics: import('pixi.js').Graphics;
    gridGraphics: import('pixi.js').Graphics;
    selectionGraphics: import('pixi.js').Graphics;
    snapGraphics: import('pixi.js').Graphics;
    previewGraphics: import('pixi.js').Graphics;
    GraphicsClass: new () => import('pixi.js').Graphics;
    TextClass: new (text: string, style?: import('pixi.js').TextStyle | Partial<import('pixi.js').ITextStyle>) => import('pixi.js').Text;
    TextStyleClass: new (style?: Partial<import('pixi.js').ITextStyle>) => import('pixi.js').TextStyle;
    SpriteClass: new (texture?: import('pixi.js').Texture) => import('pixi.js').Sprite;
    TextureClass: { from: (src: string) => import('pixi.js').Texture };
    ContainerClass: new () => import('pixi.js').Container;
    /** Per-layer PixiJS sub-containers for per-layer rotation. Lazy-created. */
    _layerContainers: Map<string, import('pixi.js').Container>;
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
    type: 'POINT' | 'LINE_START' | 'LINE_END' | 'VERTEX' | 'SPLINE_FIT' | 'SPLINE_HANDLE';
  } | null>(null);
  const gripStartRef = useRef<Feature | null>(null);
  const clickHitFeatureRef = useRef(false);
  const hoveredIdRef = useRef<string | null>(null);
  // Hovered label key (featureId:labelId or text:featureId) for blue highlight
  const hoveredLabelKeyRef = useRef<string | null>(null);
  // Hovered title-block overlay element
  const hoveredTBElemRef = useRef<'northArrow' | 'titleBlock' | 'scaleBar' | 'signatureBlock' | 'officialSealLabel' | null>(null);
  // Screen bounding boxes of each TB element (updated each render frame)
  const tbBoundsRef = useRef<{
    northArrow:       { screenX: number; screenY: number; w: number; h: number } | null;
    titleBlock:       { screenX: number; screenY: number; w: number; h: number } | null;
    scaleBar:         { screenX: number; screenY: number; w: number; h: number } | null;
    signatureBlock:   { screenX: number; screenY: number; w: number; h: number } | null;
    officialSealLabel:{ screenX: number; screenY: number; w: number; h: number } | null;
  }>({ northArrow: null, titleBlock: null, scaleBar: null, signatureBlock: null, officialSealLabel: null });
  // Screen bounding boxes of each individually-editable title block field (rebuilt each frame)
  const tbFieldBoundsRef = useRef<Array<{
    key: keyof import('@/lib/cad/types').TitleBlockConfig;
    label: string;
    /** Value pre-filled in the inline editor (may differ from the display text). */
    editValue: string;
    screenX: number; screenY: number; w: number; h: number;
  }>>([]);
  // Drag state for title-block overlay elements
  const tbDragRef = useRef<{
    element: 'northArrow' | 'titleBlock' | 'scaleBar' | 'signatureBlock' | 'officialSealLabel';
    startSX: number;
    startSY: number;
    origPosX: number;  // paper-inch BL pos at drag start
    origPosY: number;
    livePosX: number;  // paper-inch BL pos during drag
    livePosY: number;
  } | null>(null);
  // Element drag-to-move: tracks feature being dragged in SELECT mode
  const dragFeatureRef = useRef<{
    featureIds: string[];
    startWorld: Point2D;
    originals: Map<string, Feature>;
  } | null>(null);
  // Text label drag tracking
  const labelDragRef = useRef<{
    featureId: string;
    labelId: string;
    startWorld: Point2D;
    startOffset: Point2D;
  } | null>(null);
  // Interactive rotate/scale mode — driven by cursor position
  const interactiveOpRef = useRef<{
    type: 'ROTATE' | 'SCALE';
    pivot: Point2D;
    originals: Map<string, Feature>;
    /** For ROTATE: angle from pivot to cursor when mode was entered (radians) */
    baseAngle: number;
    /** For SCALE: distance from pivot to cursor when mode was entered (world units) */
    baseDist: number;
  } | null>(null);
  // Canvas pan in SELECT mode (click on empty space + drag)
  const selectPanRef = useRef(false);
  const [cursorStyle, setCursorStyle] = useState('crosshair');
  const [snapLabel, setSnapLabel] = useState<{ sx: number; sy: number; text: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [drawingMenu, setDrawingMenu] = useState<DrawingMenuState | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  // HUD: floating operation info panel near cursor
  const [hud, setHud] = useState<{ sx: number; sy: number; lines: string[] } | null>(null);
  const [textInputState, setTextInputState] = useState<{ sx: number; sy: number; wx: number; wy: number } | null>(null);
  // Label attribute editor state (double-click on a bearing/distance label)
  const [labelEditState, setLabelEditState] = useState<{ featureId: string; labelId: string; sx: number; sy: number } | null>(null);
  // Inline title-block field editor (single click on a title block data cell)
  const [tbFieldEditState, setTbFieldEditState] = useState<{
    key: keyof import('@/lib/cad/types').TitleBlockConfig;
    label: string;
    value: string;
    screenX: number; screenY: number; w: number; h: number;
  } | null>(null);
  // Interactive rotate/scale HUD: drives the InteractiveOpPanel
  const [interactivePanel, setInteractivePanel] = useState<{
    type: 'ROTATE' | 'SCALE';
    currentAngleDeg: number;
    currentFactor: number;
  } | null>(null);

  /** When set, the ImageInsertDialog is open at this world position. */
  const [imageInsertState, setImageInsertState] = useState<{ wx: number; wy: number } | null>(null);
  /** Tracks the pending pre-selected image id from the ImagePanel. */
  const pendingPlaceImageIdRef = useRef<string | null>(pendingPlaceImageId ?? null);

  // Polyline group ID tracking — each new polyline drawing gets a fresh UUID
  const polylineGroupIdRef = useRef<string | null>(null);
  // Track last segment feature ID for dblclick cleanup
  const lastPolylineSegmentIdRef = useRef<string | null>(null);
  // Track whether the text input overlay was explicitly cancelled (Escape) to suppress onBlur commit
  const textInputCancelledRef = useRef(false);

  // Keyboard shortcuts
  useKeyboard();

  // Sync pendingPlaceImageId prop into ref
  useEffect(() => {
    pendingPlaceImageIdRef.current = pendingPlaceImageId ?? null;
  }, [pendingPlaceImageId]);

  // Listen for cad:activateTool event dispatched from ImagePanel
  useEffect(() => {
    const handler = (e: Event) => {
      const { tool } = (e as CustomEvent).detail as { tool: string };
      toolStore.setTool(tool as import('@/lib/cad/types').ToolType);
    };
    window.addEventListener('cad:activateTool', handler);
    return () => window.removeEventListener('cad:activateTool', handler);
  }, [toolStore]);

  // Update cursor when active tool changes
  const activeTool = toolStore.state.activeTool;
  useEffect(() => {
    if (!isPanningRef.current && !isSpaceDownRef.current) {
      setCursorStyle(TOOL_CURSORS[activeTool] ?? 'crosshair');
    }
  }, [activeTool]);

  // Auto-finish curved line when switching tools (including clicking curved line tool again)
  const prevToolRef = useRef(activeTool);
  useEffect(() => {
    const prev = prevToolRef.current;
    prevToolRef.current = activeTool;
    if (prev === 'DRAW_CURVED_LINE' && activeTool !== 'DRAW_CURVED_LINE') {
      // The tool store's setTool already cleared drawingPoints, but we captured
      // the points before the switch via a subscription. Instead, we rely on
      // the store subscription below to handle this.
    }
  }, [activeTool]);

  // Subscribe to tool store to auto-finish curved line before drawingPoints are cleared
  useEffect(() => {
    let prevTool = useToolStore.getState().state.activeTool;
    let prevPoints = useToolStore.getState().state.drawingPoints;
    const unsub = useToolStore.subscribe((state) => {
      const curTool = state.state.activeTool;
      const isFitTool = prevTool === 'DRAW_CURVED_LINE' || prevTool === 'DRAW_SPLINE_FIT';
      const isCtrlTool = prevTool === 'DRAW_SPLINE_CONTROL';
      if (isFitTool && curTool !== prevTool && prevPoints.length >= 2) {
        // Finish the spline with the captured points before they were cleared
        const controlPoints = fitPointsToBezier(prevPoints, false);
        const dStore = useDrawingStore.getState();
        const layerStyle = dStore.getActiveLayerStyle();
        const feature: Feature = {
          id: generateId(),
          type: 'SPLINE',
          geometry: { type: 'SPLINE', spline: { controlPoints, isClosed: false } },
          layerId: dStore.activeLayerId,
          style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
          properties: {},
        };
        dStore.addFeature(withAutoLabels(feature));
        useUndoStore.getState().pushUndo(makeAddFeatureEntry(feature));
      } else if (isCtrlTool && curTool !== prevTool && prevPoints.length >= 4) {
        const usable = Math.floor((prevPoints.length - 1) / 3) * 3 + 1;
        const controlPoints = prevPoints.slice(0, usable);
        const dStore = useDrawingStore.getState();
        const layerStyle = dStore.getActiveLayerStyle();
        const feature: Feature = {
          id: generateId(),
          type: 'SPLINE',
          geometry: { type: 'SPLINE', spline: { controlPoints, isClosed: false } },
          layerId: dStore.activeLayerId,
          style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
          properties: {},
        };
        dStore.addFeature(withAutoLabels(feature));
        useUndoStore.getState().pushUndo(makeAddFeatureEntry(feature));
      }
      prevTool = curTool;
      prevPoints = state.state.drawingPoints;
    });
    return unsub;
  }, []);

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

        // Super-sampled resolution: render at 2× the physical pixel density and let the
        // browser downsample.  The downsampling pass acts as free hardware anti-aliasing
        // (SSAA), which makes diagonal lines, arcs, thin strokes, and text visibly
        // smoother without any changes to the coordinate math (CSS-pixel space throughout).
        // Cap at 4× to keep GPU memory usage reasonable on very high-DPI displays.
        const dpr = window.devicePixelRatio || 1;
        const resolution = Math.min(dpr * 2, 4);

        const app = new PIXI.Application({
          view: canvas,
          width,
          height,
          background: bgColor,
          antialias: true,
          resolution,
          autoDensity: true,
        });

        // paperLayer is NOT rotated — the paper rectangle stays fixed
        const paperLayer = new PIXI.Container();
        // drawingRotContainer holds everything that visually rotates with the drawing
        const drawingRotContainer = new PIXI.Container();
        const gridLayer = new PIXI.Container();
        const featureLayer = new PIXI.Container();
        const labelLayer = new PIXI.Container();
        const selectionLayer = new PIXI.Container();
        const snapLayer = new PIXI.Container();
        const toolPreviewLayer = new PIXI.Container();
        drawingRotContainer.addChild(gridLayer, featureLayer, labelLayer, selectionLayer, snapLayer, toolPreviewLayer);
        // titleBlockLayer is NOT rotated — title block is paper-fixed
        const titleBlockLayer = new PIXI.Container();

        app.stage.addChild(paperLayer, drawingRotContainer, titleBlockLayer);

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

        const titleBlockGraphics = new PIXI.Graphics();
        titleBlockLayer.addChild(titleBlockGraphics);

        pixiRef.current = {
          app,
          paperLayer,
          drawingRotContainer,
          gridLayer,
          featureLayer,
          labelLayer,
          selectionLayer,
          snapLayer,
          toolPreviewLayer,
          titleBlockLayer,
          titleBlockGraphics,
          featureGraphics: new Map(),
          labelTexts: new Map(),
          imageSprites: new Map(),
          imageTextures: new Map(),
          paperGraphics,
          gridGraphics,
          selectionGraphics,
          snapGraphics,
          previewGraphics,
          GraphicsClass: PIXI.Graphics,
          TextClass: PIXI.Text,
          TextStyleClass: PIXI.TextStyle,
          SpriteClass: PIXI.Sprite,
          TextureClass: PIXI.Texture,
          ContainerClass: PIXI.Container,
          _layerContainers: new Map(),
        };

        viewportStore.setScreenSize(width, height);

        // ── Zoom-to-fit: center the drawing paper in the viewport ──
        // Calculate the paper bounds from settings and zoom to show the entire page
        {
          const docSettings = drawingStore.document.settings;
          const { paperSize: ps, paperOrientation: po, drawingScale: ds } = docSettings;
          let [pw, ph] = PAPER_SIZE_MAP[ps ?? 'TABLOID'] ?? [11, 17];
          if (po === 'LANDSCAPE') { [pw, ph] = [ph, pw]; }
          const paperW = pw * (ds ?? 50);
          const paperH = ph * (ds ?? 50);

          // Paper extends from (0,0) to (paperW, paperH) — center it
          const paperBounds: import('@/lib/cad/types').BoundingBox = {
            minX: 0,
            minY: 0,
            maxX: paperW,
            maxY: paperH,
          };
          viewportStore.zoomToExtents(paperBounds, 0.05);
        }

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
        // Re-compute the super-sampled resolution so that moving between monitors
        // (different DPR values) always produces the sharpest possible rendering.
        const newDpr = window.devicePixelRatio || 1;
        const newResolution = Math.min(newDpr * 2, 4);
        if (Math.abs(pixiRef.current.app.renderer.resolution - newResolution) > 0.01) {
          // The renderer exposes `resolution` as a writable property on the concrete
          // class.  We cast to the minimal structural shape instead of importing the
          // full PixiJS Renderer type to avoid a hard coupling to the renderer backend.
          (pixiRef.current.app.renderer as { resolution: number }).resolution = newResolution;
        }
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
  // Drawing rotation helpers
  // ─────────────────────────────────────────────
  /** Get paper center in world coordinates. */
  function getPaperDimensions() {
    const doc = useDrawingStore.getState().document;
    const { paperSize, paperOrientation, drawingScale } = doc.settings;
    let [pw, ph] = PAPER_SIZE_MAP[paperSize ?? 'TABLOID'] ?? [11, 17];
    if (paperOrientation === 'LANDSCAPE') [pw, ph] = [ph, pw];
    const paperW = pw * (drawingScale ?? 50);
    const paperH = ph * (drawingScale ?? 50);
    return { paperW, paperH };
  }

  /**
   * Update the drawingRotContainer pivot & rotation each frame so the drawing
   * visually rotates around the paper center without changing any coordinates.
   */
  function updateDrawingRotContainer() {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const doc = useDrawingStore.getState().document;
    const rotDeg = doc.settings.drawingRotationDeg ?? 0;
    const rotRad = (rotDeg * Math.PI) / 180;
    const { paperW, paperH } = getPaperDimensions();
    // Paper center in screen coordinates (no rotation applied — pure w2s)
    const { sx: pcSx, sy: pcSy } = w2s(paperW / 2, paperH / 2);
    // Set pivot to paper center so rotation is around the paper center
    pixi.drawingRotContainer.pivot.set(pcSx, pcSy);
    pixi.drawingRotContainer.position.set(pcSx, pcSy);
    pixi.drawingRotContainer.rotation = rotRad;
  }

  /**
   * Convert a screen point (e.g. mouse click) to world coordinates,
   * accounting for the drawing rotation. Use this instead of plain s2w()
   * for all hit-testing and new-feature placement.
   */
  function screenToDrawingWorld(sx: number, sy: number): { wx: number; wy: number } {
    const doc = useDrawingStore.getState().document;
    const rotDeg = doc.settings.drawingRotationDeg ?? 0;
    if (rotDeg === 0) return s2w(sx, sy);
    // Inverse-rotate the screen point around the paper center first
    const { paperW, paperH } = getPaperDimensions();
    const { sx: pcSx, sy: pcSy } = w2s(paperW / 2, paperH / 2);
    const rotRad = -(rotDeg * Math.PI) / 180; // inverse
    const dx = sx - pcSx;
    const dy = sy - pcSy;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);
    const unrotSx = cos * dx - sin * dy + pcSx;
    const unrotSy = sin * dx + cos * dy + pcSy;
    return s2w(unrotSx, unrotSy);
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

    let [w, h] = PAPER_SIZE_MAP[paperSize ?? 'TABLOID'] ?? [11, 17];
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
    g.beginFill(CANVAS_SURROUND_COLOR, 1);
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

    const doc = useDrawingStore.getState().document;
    const visibleFeatures = drawingStore.getVisibleFeatures();
    const visibleIds = new Set(visibleFeatures.map((f) => f.id));

    // Lazily-maintained per-layer sub-containers (for per-layer rotation)
    const layerContainers = pixi._layerContainers;

    // Remove graphics for features no longer visible
    for (const [id, g] of pixi.featureGraphics) {
      if (!visibleIds.has(id)) {
        g.parent?.removeChild(g);
        g.destroy();
        pixi.featureGraphics.delete(id);
      }
    }

    // Update per-layer container rotations (paper-center pivot)
    const { paperW, paperH } = getPaperDimensions();
    const { sx: pcSx, sy: pcSy } = w2s(paperW / 2, paperH / 2);
    for (const [layerId, lc] of layerContainers) {
      const layer = doc.layers[layerId];
      const layerRotDeg = layer?.rotationDeg ?? 0;
      if (!layerRotDeg) {
        lc.pivot.set(0, 0);
        lc.position.set(0, 0);
        lc.rotation = 0;
      } else {
        lc.pivot.set(pcSx, pcSy);
        lc.position.set(pcSx, pcSy);
        lc.rotation = (layerRotDeg * Math.PI) / 180;
      }
    }

    for (const feature of visibleFeatures) {
      const layer = doc.layers[feature.layerId];
      const layerRotDeg = layer?.rotationDeg ?? 0;

      // Determine parent container
      let parentContainer: import('pixi.js').Container = pixi.featureLayer;
      if (layerRotDeg) {
        if (!layerContainers.has(feature.layerId)) {
          const lc = new pixi.ContainerClass();
          pixi.featureLayer.addChild(lc);
          layerContainers.set(feature.layerId, lc);
        }
        parentContainer = layerContainers.get(feature.layerId)!;
      }

      let g = pixi.featureGraphics.get(feature.id);
      if (!g) {
        g = new pixi.GraphicsClass();
        pixi.featureGraphics.set(feature.id, g);
        parentContainer.addChild(g);
      } else if (g.parent !== parentContainer) {
        g.parent?.removeChild(g);
        parentContainer.addChild(g);
      }

      drawFeature(g, feature);
    }
  }

  function drawFeature(g: import('pixi.js').Graphics, feature: Feature) {
    g.clear();
    const color = parseInt((feature.style.color ?? '#000000').replace('#', ''), 16);
    const weight = feature.style.lineWeight ?? 0.75;
    const alpha = feature.style.opacity;
    const geom = feature.geometry;
    const { zoom } = useViewportStore.getState();

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
      case 'CIRCLE': {
        if (geom.circle) {
          g.lineStyle(weight, color, alpha);
          drawCircleCurve(g as unknown as GraphicsLike, geom.circle, w2s, zoom);
        }
        break;
      }
      case 'ELLIPSE': {
        if (geom.ellipse) {
          g.lineStyle(weight, color, alpha);
          drawEllipseCurve(g as unknown as GraphicsLike, geom.ellipse, w2s, zoom);
        }
        break;
      }
      case 'ARC': {
        if (geom.arc) {
          g.lineStyle(weight, color, alpha);
          drawArcCurve(g as unknown as GraphicsLike, geom.arc, w2s, zoom);
        }
        break;
      }
      case 'SPLINE': {
        if (geom.spline) {
          g.lineStyle(weight, color, alpha);
          drawSplineCurve(g as unknown as GraphicsLike, geom.spline, w2s);
        }
        break;
      }
      case 'TEXT': {
        // TEXT features are rendered via renderTextFeatures(), not here.
        // We just draw a tiny anchor marker in draw mode.
        if (geom.point) {
          const { sx, sy } = w2s(geom.point.x, geom.point.y);
          g.lineStyle(0.5, color, alpha * 0.5);
          g.moveTo(sx - 3, sy - 3);
          g.lineTo(sx + 3, sy + 3);
          g.moveTo(sx + 3, sy - 3);
          g.lineTo(sx - 3, sy + 3);
        }
        break;
      }
      case 'IMAGE': {
        // IMAGE features are rendered via renderImageFeatures() (PixiJS Sprites).
        // drawFeature just draws a dashed selection-bounding-box when selected.
        if (geom.image) {
          const img = geom.image;
          const { sx: ax, sy: ay } = w2s(img.position.x, img.position.y);
          const { zoom } = useViewportStore.getState();
          const wPx = img.width * zoom;
          const hPx = img.height * zoom;
          // Simple dashed rect outline for selection hit area
          g.lineStyle(0.5, color, alpha * 0.3);
          g.drawRect(ax, ay - hPx, wPx, hPx);
        }
        break;
      }
    }
  }

  // ─────────────────────────────────────────────
  // Render: IMAGE features (PixiJS Sprites)
  // ─────────────────────────────────────────────
  function renderImageFeatures() {
    const pixi = pixiRef.current;
    if (!pixi) return;

    const doc = useDrawingStore.getState().document;
    const { zoom } = useViewportStore.getState();
    const visibleFeatures = drawingStore.getVisibleFeatures().filter(
      (f) => f.geometry.type === 'IMAGE' && f.geometry.image,
    );
    const activeIds = new Set(visibleFeatures.map((f) => f.id));

    // Remove sprites for features no longer visible
    for (const [fid, sprite] of pixi.imageSprites) {
      if (!activeIds.has(fid)) {
        pixi.featureLayer.removeChild(sprite);
        pixi.imageSprites.delete(fid);
      }
    }

    for (const feature of visibleFeatures) {
      const img = feature.geometry.image!;
      const projImg = (doc.projectImages ?? {})[img.imageId];
      if (!projImg) continue;

      // Ensure texture exists (cached)
      if (!pixi.imageTextures.has(img.imageId)) {
        try {
          const tex = pixi.TextureClass.from(projImg.dataUrl);
          pixi.imageTextures.set(img.imageId, tex);
        } catch {
          continue;
        }
      }
      const texture = pixi.imageTextures.get(img.imageId)!;

      // Ensure sprite exists
      let sprite = pixi.imageSprites.get(feature.id);
      if (!sprite) {
        sprite = new pixi.SpriteClass(texture);
        sprite.anchor.set(0, 1); // anchor at bottom-left (world convention: y up)
        pixi.featureLayer.addChild(sprite);
        pixi.imageSprites.set(feature.id, sprite);
      } else if (sprite.texture !== texture) {
        sprite.texture = texture;
      }

      // Position: bottom-left anchor in world → screen
      const { sx, sy } = w2s(img.position.x, img.position.y);
      sprite.position.set(sx, sy);

      // Scale: world dimensions → screen pixels
      const wPx = img.width * zoom;
      const hPx = img.height * zoom;
      const scaleX = wPx / (texture.width || 1);
      const scaleY = hPx / (texture.height || 1);
      sprite.scale.set(
        img.mirrorX ? -scaleX : scaleX,
        img.mirrorY ? scaleY : -scaleY, // y inverted because screen y is down, world y is up
      );

      // Rotation: world CCW positive → screen CW positive (invert)
      sprite.rotation = -img.rotation;

      // Opacity from feature style
      sprite.alpha = feature.style.opacity ?? 1;
    }
  }

  // ─────────────────────────────────────────────
  // Render: Title Block (north arrow + survey info + signature line)
  // Fixed to paper — does NOT rotate with the drawing
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  // Helper: hit-test screen (sx,sy) against a TB element bounding box
  // ─────────────────────────────────────────────────────────────────
  function hitTestTBElement(sx: number, sy: number): 'northArrow' | 'titleBlock' | 'scaleBar' | 'signatureBlock' | 'officialSealLabel' | null {
    const b = tbBoundsRef.current;
    if (b.northArrow) {
      const { screenX, screenY, w, h } = b.northArrow;
      if (sx >= screenX && sx <= screenX + w && sy >= screenY && sy <= screenY + h) return 'northArrow';
    }
    if (b.titleBlock) {
      const { screenX, screenY, w, h } = b.titleBlock;
      if (sx >= screenX && sx <= screenX + w && sy >= screenY && sy <= screenY + h) return 'titleBlock';
    }
    if (b.scaleBar) {
      const { screenX, screenY, w, h } = b.scaleBar;
      if (sx >= screenX && sx <= screenX + w && sy >= screenY && sy <= screenY + h) return 'scaleBar';
    }
    // Test sub-elements before the container so they take priority
    if (b.officialSealLabel) {
      const { screenX, screenY, w, h } = b.officialSealLabel;
      if (sx >= screenX && sx <= screenX + w && sy >= screenY && sy <= screenY + h) return 'officialSealLabel';
    }
    if (b.signatureBlock) {
      const { screenX, screenY, w, h } = b.signatureBlock;
      if (sx >= screenX && sx <= screenX + w && sy >= screenY && sy <= screenY + h) return 'signatureBlock';
    }
    return null;
  }

  /** Returns the editable title-block field hit at screen coords, or null. */
  function hitTestTBField(sx: number, sy: number) {
    for (const b of tbFieldBoundsRef.current) {
      if (sx >= b.screenX && sx <= b.screenX + b.w && sy >= b.screenY && sy <= b.screenY + b.h) {
        return b;
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────
  // Render: Title Block (bottom-right), Signature Block (bottom-left),
  //         North Arrow (top-right), and Scale Bar
  // ─────────────────────────────────────────────────────────────────
  function renderTitleBlock() {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const g = pixi.titleBlockGraphics;

    // Always clear first so nothing lingers when hidden
    g.clear();
    const tbTexts = pixi.titleBlockLayer.children.filter(
      (c) => c !== g && (c as { _isTitleBlockText?: boolean })._isTitleBlockText,
    );
    // Destroy (not just removeChild) to release GPU texture memory and prevent leaks
    for (const t of tbTexts) (t as import('pixi.js').Text).destroy();

    // Reset bounds so stale hits don't persist
    tbBoundsRef.current.northArrow      = null;
    tbBoundsRef.current.titleBlock      = null;
    tbBoundsRef.current.scaleBar        = null;
    tbBoundsRef.current.signatureBlock  = null;
    tbBoundsRef.current.officialSealLabel = null;
    // Reset editable field bounds
    tbFieldBoundsRef.current = [];

    const doc = useDrawingStore.getState().document;
    const tb  = doc.settings.titleBlock;
    if (!tb?.visible) return;

    const { paperSize, paperOrientation, drawingScale } = doc.settings;
    let [pw, ph] = PAPER_SIZE_MAP[paperSize ?? 'TABLOID'] ?? [11, 17];
    if (paperOrientation === 'LANDSCAPE') [pw, ph] = [ph, pw];
    const paperW = pw * (drawingScale ?? 50);
    const paperH = ph * (drawingScale ?? 50);
    const { zoom } = useViewportStore.getState();

    // Paper corners in screen space (title block layer is NOT rotated)
    const tl = w2s(0, paperH);   // paper top-left
    const br = w2s(paperW, 0);   // paper bottom-right

    const inchToPx = zoom * (drawingScale ?? 50); // screen pixels per paper inch
    const margin   = 0.1 * inchToPx;
    const res      = (pixi.app.renderer as { resolution?: number }).resolution ?? 2;

    // ── Paper-adaptive sizes — prevent elements overlapping on any paper size ──
    // All values in paper-inches, clamped to fractions of paper width (pw).
    const innerGapIn = 0.20;                              // gap between bottom-band elements
    const tbWIn      = Math.min(5.5, pw * 0.47);         // title block width
    const tbHIn      = Math.min(2.2, tbWIn * 0.42);      // title block height
    const sigBoxWIn  = Math.min(2.8, pw * 0.27);         // signature box width
    // Taller sig box so the RPLS label, seal circle, and authorized-signature line
    // all have breathing room without overlapping the border.
    const sigBoxHIn  = Math.min(1.6, sigBoxWIn * 0.60);  // signature box height
    const naRadiusPx = (tb.northArrowSizeIn ?? 1.5) * inchToPx * 0.44; // star radius in screen px
    // Vertical distance from star center to top of the N label
    // (N label center = starCenter - radius*(1+nOffset/radius) ≈ starCenter - radius*1.55)
    // Top of N label ≈ starCenter - radius*1.775 → use 1.78 for a clean margin.
    const NA_CENTER_OFFSET = 1.78;           // naCy = naScrTop + naRadiusPx * NA_CENTER_OFFSET
    const NA_ELEM_TOTAL_H  = naRadiusPx * 2.78; // full height: N label top → S tip
    const NA_HIT_PAD       = 7;             // hover bounding-box padding (px)

    // ── Shared text helper ──────────────────────────────────────────
    const pixiCtx = pixi; // non-nullable capture for use in nested closures
    function mkTBText(
      content: string,
      style: Partial<import('pixi.js').ITextStyle>,
    ) {
      const t = new pixiCtx.TextClass(content, new pixiCtx.TextStyleClass(style));
      (t as unknown as { _isTitleBlockText: boolean })._isTitleBlockText = true;
      t.resolution = res;
      pixiCtx.titleBlockLayer.addChild(t);
      return t;
    }

    // ────────────────────────────────────────────────────────────────
    // TITLE BLOCK  (bottom-right of page)
    // ────────────────────────────────────────────────────────────────
    const tbW       = tbWIn * inchToPx;
    const tbH       = tbHIn * inchToPx;
    const headerH   = Math.min(0.30, tbHIn * 0.15) * inchToPx;
    const numRows   = 4;
    const dataH     = tbH - headerH;
    const rowH      = dataH / numRows;

    // Resolve position: use live drag pos → stored pos → default bottom-right
    let tbScrLeft: number;
    let tbScrBottom: number;
    const drag = tbDragRef.current;
    if (drag?.element === 'titleBlock') {
      tbScrLeft   = tl.sx + drag.livePosX * inchToPx;
      tbScrBottom = br.sy - drag.livePosY * inchToPx;
    } else if (tb.titleBlockPos) {
      tbScrLeft   = tl.sx + tb.titleBlockPos.x * inchToPx;
      tbScrBottom = br.sy - tb.titleBlockPos.y * inchToPx;
    } else {
      tbScrLeft   = br.sx - margin - tbW;
      tbScrBottom = br.sy - margin;
    }
    const tbScrTop   = tbScrBottom - tbH;
    const tbScrRight = tbScrLeft + tbW;
    const midX       = tbScrLeft + tbW / 2;
    const halfTbW    = tbW / 2;
    const dataTop    = tbScrTop + headerH;

    // Store bounds
    tbBoundsRef.current.titleBlock = { screenX: tbScrLeft, screenY: tbScrTop, w: tbW, h: tbH };
    const tbHovered  = hoveredTBElemRef.current === 'titleBlock';
    const tbDragging = drag?.element === 'titleBlock';

    // ── Outer double border ─────────────────────────────────────────
    g.lineStyle(2.5, 0x000000, 1);
    g.drawRect(tbScrLeft, tbScrTop, tbW, tbH);
    g.lineStyle(0.6, 0x000000, 0.55);
    g.drawRect(tbScrLeft + 4, tbScrTop + 4, tbW - 8, tbH - 8);

    // ── Blue hover / drag highlight ─────────────────────────────────
    if (tbHovered || tbDragging) {
      g.lineStyle(2.5, 0x0088ff, 0.9);
      g.drawRect(tbScrLeft - 4, tbScrTop - 4, tbW + 8, tbH + 8);
    }

    // ── Header bar (dark navy) ──────────────────────────────────────
    g.lineStyle(0);
    g.beginFill(0x1a2b4a, 1);
    g.drawRect(tbScrLeft, tbScrTop, tbW, headerH);
    g.endFill();
    // Accent line under header
    g.lineStyle(1.5, 0x3d6ea6, 0.9);
    g.moveTo(tbScrLeft,  tbScrTop + headerH);
    g.lineTo(tbScrRight, tbScrTop + headerH);

    // Firm name (white, bold) — left side of header
    const hFontSz  = Math.max(headerH * 0.52, 7);
    const firmTxt  = mkTBText((tb.firmName || 'SURVEY FIRM').toUpperCase(), {
      fontFamily: 'Arial', fontSize: hFontSz, fill: 0xffffff,
      fontWeight: 'bold', letterSpacing: 2,
    });
    firmTxt.anchor.set(0, 0.5);
    firmTxt.position.set(tbScrLeft + 10, tbScrTop + headerH / 2);
    // Track header fields for click-to-edit (split the header roughly in half)
    const headerSplitX = tbScrLeft + tbW * 0.55;
    tbFieldBoundsRef.current.push({ key: 'firmName',   label: 'Firm Name',   editValue: tb.firmName   || '', screenX: tbScrLeft,    screenY: tbScrTop, w: headerSplitX - tbScrLeft,  h: headerH });
    tbFieldBoundsRef.current.push({ key: 'surveyType', label: 'Survey Type', editValue: tb.surveyType || '', screenX: headerSplitX, screenY: tbScrTop, w: tbScrRight - headerSplitX, h: headerH });

    // Right subtitle (italic, muted blue) — survey type
    const subTxt = mkTBText((tb.surveyType || 'BOUNDARY SURVEY').toUpperCase(), {
      fontFamily: 'Arial', fontSize: Math.max(hFontSz * 0.70, 5.5),
      fill: 0x6a9fcc, fontStyle: 'italic', letterSpacing: 0.5,
    });
    subTxt.anchor.set(1, 0.5);
    subTxt.position.set(tbScrRight - 10, tbScrTop + headerH / 2);

    // ── Horizontal row dividers ─────────────────────────────────────
    g.lineStyle(1, 0x000000, 0.85);
    for (let i = 1; i < numRows; i++) {
      const ry = dataTop + i * rowH;
      g.moveTo(tbScrLeft, ry);
      g.lineTo(tbScrRight, ry);
    }

    // ── Vertical mid-divider ────────────────────────────────────────
    g.lineStyle(0.75, 0x000000, 0.7);
    g.moveTo(midX, dataTop);
    g.lineTo(midX, tbScrBottom);

    // ── Field-cell renderer — draws label + value and registers editable bounds ─
    // editValue: the value pre-filled in the editor (defaults to displayValue when omitted)
    function drawCell(
      label: string,
      displayValue: string,
      storeKey: keyof import('@/lib/cad/types').TitleBlockConfig,
      cellLeft: number,
      cellTop: number,
      cellW: number,
      cellH: number,
      editValue?: string,
    ) {
      const pad   = 6;
      const lblSz = Math.max(cellH * 0.26, 5.5);
      const valSz = Math.max(cellH * 0.42, 7.5);
      const lbl = mkTBText(label.toUpperCase(), {
        fontFamily: 'Arial', fontSize: lblSz, fill: 0x3a5f8a,
        fontWeight: 'bold', letterSpacing: 0.5,
      });
      lbl.position.set(cellLeft + pad, cellTop + 4);
      const val = mkTBText(displayValue || '—', {
        fontFamily: 'Arial', fontSize: valSz,
        fill: displayValue ? 0x111111 : 0xaaaaaa,
        fontWeight: displayValue ? 'bold' : 'normal',
        wordWrap: true, wordWrapWidth: cellW - pad * 2,
      });
      val.position.set(cellLeft + pad, cellTop + lblSz + 6);
      // Register bounds for click-to-edit; editValue is what gets pre-filled in the input
      tbFieldBoundsRef.current.push({
        key: storeKey, label,
        screenX: cellLeft, screenY: cellTop, w: cellW, h: cellH,
        editValue: editValue ?? displayValue,
      });
    }

    const ds         = drawingScale ?? 50;
    const scaleLabel = tb.scaleLabel || `1" = ${ds}'`;

    drawCell('PROJECT',        tb.projectName     || '', 'projectName',     tbScrLeft, dataTop,             halfTbW, rowH);
    drawCell('JOB NO.',        tb.projectNumber   || '', 'projectNumber',   midX,      dataTop,             halfTbW, rowH);
    drawCell('CLIENT / OWNER', tb.clientName      || '', 'clientName',      tbScrLeft, dataTop + rowH,      halfTbW, rowH);
    drawCell('DATE',           tb.surveyDate      || '', 'surveyDate',      midX,      dataTop + rowH,      halfTbW, rowH);
    drawCell('PREPARED BY',    tb.surveyorName    || '', 'surveyorName',    tbScrLeft, dataTop + 2 * rowH,  halfTbW, rowH);
    drawCell('LICENSE NO.',    tb.surveyorLicense || '', 'surveyorLicense', midX,      dataTop + 2 * rowH,  halfTbW, rowH);
    // SCALE: display the resolved label but pre-fill editor with the stored value so
    // clearing the field restores auto-computed behaviour (tb.scaleLabel === '').
    drawCell('SCALE', scaleLabel, 'scaleLabel', tbScrLeft, dataTop + 3 * rowH, halfTbW, rowH, tb.scaleLabel || '');
    // SHEET: display "X OF Y" composite but only the sheet number is edited here;
    // total sheets can be changed via the sidebar panel.
    drawCell(
      'SHEET', `${tb.sheetNumber || '1'} OF ${tb.totalSheets || '1'}`, 'sheetNumber',
      midX, dataTop + 3 * rowH, halfTbW, rowH, tb.sheetNumber || '',
    );

    // ────────────────────────────────────────────────────────────────
    // SIGNATURE / SEAL BLOCK  (bottom-left of page, draggable)
    // ────────────────────────────────────────────────────────────────
    const sigBoxW  = sigBoxWIn * inchToPx;
    const sigBoxH  = sigBoxHIn * inchToPx;
    // Make the seal column a true square: width equals the full box height.
    const sealColW = sigBoxH;

    // ── Resolve position: drag → stored → default bottom-left ──────
    let sigLeft: number;
    let sigTop:  number;
    if (drag?.element === 'signatureBlock') {
      sigLeft = tl.sx + drag.livePosX * inchToPx;
      sigTop  = br.sy - drag.livePosY * inchToPx - sigBoxH;
    } else if (tb.signatureBlockPos) {
      sigLeft = tl.sx + tb.signatureBlockPos.x * inchToPx;
      sigTop  = br.sy - tb.signatureBlockPos.y * inchToPx - sigBoxH;
    } else {
      sigLeft = tl.sx + margin;
      sigTop  = br.sy - margin - sigBoxH;
    }

    // Store signature block bounds
    tbBoundsRef.current.signatureBlock = { screenX: sigLeft, screenY: sigTop, w: sigBoxW, h: sigBoxH };
    const sigHovered  = hoveredTBElemRef.current === 'signatureBlock';
    const sigDragging = drag?.element === 'signatureBlock';

    // Outer double border
    g.lineStyle(2, 0x000000, 1);
    g.drawRect(sigLeft, sigTop, sigBoxW, sigBoxH);
    g.lineStyle(0.5, 0x000000, 0.5);
    g.drawRect(sigLeft + 3, sigTop + 3, sigBoxW - 6, sigBoxH - 6);

    // ── Blue hover / drag highlight ─────────────────────────────────
    if (sigHovered || sigDragging) {
      g.lineStyle(2.5, 0x0088ff, 0.9);
      g.drawRect(sigLeft - 4, sigTop - 4, sigBoxW + 8, sigBoxH + 8);
    }

    // Seal column divider
    g.lineStyle(1, 0x000000, 0.85);
    g.moveTo(sigLeft + sealColW, sigTop);
    g.lineTo(sigLeft + sealColW, sigTop + sigBoxH);

    // Signature line in right column at ~62% height
    const sigLineX1 = sigLeft + sealColW + 8;
    const sigLineX2 = sigLeft + sigBoxW  - 8;
    const sigLineY  = sigTop  + sigBoxH  * 0.62;
    g.lineStyle(1, 0x000000, 1);
    g.moveTo(sigLineX1, sigLineY);
    g.lineTo(sigLineX2, sigLineY);

    // Font sizes relative to box height, with sensible floor values
    const sLblSz = Math.max(sigBoxH * 0.13, 5);

    // ── "OFFICIAL SEAL" label — centered vertically in seal column ────
    const sCx = sigLeft + sealColW / 2;
    const officialSealDefaultX = sCx;
    const officialSealDefaultY = sigTop + sigBoxH * 0.5;
    let officialSealRenderX: number;
    let officialSealRenderY: number;
    if (drag?.element === 'officialSealLabel') {
      officialSealRenderX = tl.sx + drag.livePosX * inchToPx;
      officialSealRenderY = br.sy - drag.livePosY * inchToPx;
    } else if (tb.officialSealLabelPos) {
      officialSealRenderX = tl.sx + tb.officialSealLabelPos.x * inchToPx;
      officialSealRenderY = br.sy - tb.officialSealLabelPos.y * inchToPx;
    } else {
      officialSealRenderX = officialSealDefaultX;
      officialSealRenderY = officialSealDefaultY;
    }

    const officialSealHovered  = hoveredTBElemRef.current === 'officialSealLabel';
    const officialSealDragging = drag?.element === 'officialSealLabel';
    const osTxt = mkTBText('OFFICIAL\nSEAL', {
      fontFamily: 'Arial', fontSize: sLblSz, fill: 0x555555, letterSpacing: 0.3,
      fontWeight: 'bold',
      align: 'center',
    });
    osTxt.anchor.set(0.5, 0.5);
    osTxt.position.set(officialSealRenderX, officialSealRenderY);
    // Compute bounds for hit-testing (centered anchor means left = x - w/2)
    const osTxtW = Math.min(sealColW, sLblSz * 8);
    const osTxtH = sLblSz * 2.5;
    const osHitX = officialSealRenderX - osTxtW / 2 - 4;
    const osHitY = officialSealRenderY - osTxtH / 2 - 4;
    tbBoundsRef.current.officialSealLabel = { screenX: osHitX, screenY: osHitY, w: osTxtW + 8, h: osTxtH + 8 };
    if (officialSealHovered || officialSealDragging) {
      g.lineStyle(1.5, 0x0088ff, 0.85);
      g.drawRect(osHitX, osHitY, osTxtW + 8, osTxtH + 8);
    }

    // ── "AUTHORIZED SIGNATURE" — bordered box spanning the full right column ──
    // The box fully contains the label text with clear padding, and the
    // signature line sits just below it.
    const authColLeft  = sigLeft + sealColW;
    const authBoxPadX  = 5;
    const authBoxPadY  = 4;
    const authBoxW     = sigBoxW - sealColW - authBoxPadX * 2;
    const authFontSz   = Math.max(sLblSz * 0.88, 4.5);
    const authBoxH     = authFontSz + authBoxPadY * 2;
    const authBoxLeft  = authColLeft + authBoxPadX;
    const authBoxTop   = sigLineY - authBoxH - 6;
    // Bordered box
    g.lineStyle(1.5, 0x2c4a6e, 1);
    g.drawRect(authBoxLeft, authBoxTop, authBoxW, authBoxH);
    // Centered label inside the box
    const authTxt = mkTBText('AUTHORIZED SIGNATURE', {
      fontFamily: 'Arial', fontSize: authFontSz, fill: 0x2c4a6e,
      fontWeight: 'bold', letterSpacing: 0.3, align: 'center',
      wordWrap: true, wordWrapWidth: authBoxW - 4,
    });
    authTxt.anchor.set(0.5, 0.5);
    authTxt.position.set(authBoxLeft + authBoxW / 2, authBoxTop + authBoxH / 2);

    // ── "DATE:" label below signature line in the right column ───────
    const dateLblSz = Math.max(sLblSz * 0.80, 4);
    const dateLbl = mkTBText('DATE:', {
      fontFamily: 'Arial', fontSize: dateLblSz, fill: 0x555555, fontWeight: 'bold',
    });
    dateLbl.position.set(sigLineX1, sigLineY + 4);

    // ────────────────────────────────────────────────────────────────
    // NORTH ARROW  (top-right, no box — just the star + "N" label)
    // ────────────────────────────────────────────────────────────────
    // Uses named constants NA_CENTER_OFFSET, NA_ELEM_TOTAL_H, NA_HIT_PAD defined above.
    const naElemW  = naRadiusPx * 2.0;

    let naScrLeft: number;
    let naScrTop: number;
    if (drag?.element === 'northArrow') {
      naScrLeft = tl.sx + drag.livePosX * inchToPx;
      naScrTop  = br.sy - (drag.livePosY * inchToPx + NA_ELEM_TOTAL_H);
    } else if (tb.northArrowPos) {
      naScrLeft = tl.sx + tb.northArrowPos.x * inchToPx;
      naScrTop  = br.sy - (tb.northArrowPos.y * inchToPx + NA_ELEM_TOTAL_H);
    } else {
      // Default: top-right, N label sits just inside the top margin
      naScrLeft = br.sx - margin - naElemW;
      naScrTop  = tl.sy + margin;
    }

    // Star center — N label is above the center, so offset down by NA_CENTER_OFFSET × radius
    const naCx   = naScrLeft + naRadiusPx;
    const naCy   = naScrTop  + naRadiusPx * NA_CENTER_OFFSET;

    tbBoundsRef.current.northArrow = {
      screenX: naScrLeft - NA_HIT_PAD, screenY: naScrTop - NA_HIT_PAD,
      w: naElemW + 2 * NA_HIT_PAD, h: NA_ELEM_TOTAL_H + 2 * NA_HIT_PAD,
    };
    const naHovered  = hoveredTBElemRef.current === 'northArrow';
    const naDragging = drag?.element === 'northArrow';

    // Blue hover highlight — rect around the floating element
    if (naHovered || naDragging) {
      g.lineStyle(2, 0x0088ff, 0.85);
      g.drawRect(
        naScrLeft - NA_HIT_PAD, naScrTop - NA_HIT_PAD,
        naElemW + 2 * NA_HIT_PAD, NA_ELEM_TOTAL_H + 2 * NA_HIT_PAD,
      );
    }

    // Draw star + N label (drawNorthArrow places "N" above the north tip)
    const rotDeg   = doc.settings.drawingRotationDeg ?? 0;
    const arrowRad = (rotDeg * Math.PI) / 180;
    drawNorthArrow(g, naCx, naCy, naRadiusPx, arrowRad,
      tb.northArrowStyle ?? 'STARR', pixi, mkTBText);
    // NOTE: no separate "NORTH" label — just the N inside drawNorthArrow

    // ────────────────────────────────────────────────────────────────
    // GRAPHIC SCALE BAR  (default: centered above the title block)
    // ────────────────────────────────────────────────────────────────
    if (tb.scaleBarVisible !== false) {
      const gapPx          = innerGapIn * inchToPx;
      const hasCustomSbPos = !!(drag?.element === 'scaleBar' || tb.scaleBarPos);

      // Constrain target length to title block width for the default position
      const MIN_SCALE_BAR_WIDTH_IN      = 0.5; // minimum bar width if space is very tight
      const SCALE_BAR_AVAIL_SPACE_RATIO = 0.90; // use 90% of title block width
      const availSbPx = Math.max(tbW * SCALE_BAR_AVAIL_SPACE_RATIO, MIN_SCALE_BAR_WIDTH_IN * inchToPx);

      // Constrain target length to available space for default positions
      const userTargetLenIn = tb.scaleBarLengthIn ?? 2.0;
      const effectiveLenIn  = hasCustomSbPos
        ? userTargetLenIn
        : Math.min(userTargetLenIn, (availSbPx) / inchToPx);

      // Find a nice segment length (round number of feet/world units)
      const targetWorldFt = effectiveLenIn * ds;
      const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
      const rawSeg    = targetWorldFt / 4;
      let segFt       = niceSteps[0];
      for (const s of niceSteps) { if (s <= rawSeg) segFt = s; }
      const numSegs   = 4;
      const totalFt   = segFt * numSegs;
      const barLenPx  = (totalFt / ds) * inchToPx;
      const barH      = Math.max(0.12 * inchToPx, 6);
      const lblAboveH = Math.max(0.20 * inchToPx, 10);
      const lblBelowH = Math.max(0.22 * inchToPx, 12); // slightly more room below for units label
      const sbTotalH  = lblAboveH + barH + lblBelowH + 4; // bar + labels above & below

      let sbScrLeft: number;
      let sbScrBottom: number;
      if (drag?.element === 'scaleBar') {
        sbScrLeft   = tl.sx + drag.livePosX * inchToPx;
        sbScrBottom = br.sy - drag.livePosY * inchToPx;
      } else if (tb.scaleBarPos) {
        sbScrLeft   = tl.sx + tb.scaleBarPos.x * inchToPx;
        sbScrBottom = br.sy - tb.scaleBarPos.y * inchToPx;
      } else {
        // Default: centered above the title block with a small gap
        sbScrLeft   = tbScrLeft + (tbW - barLenPx) / 2;
        sbScrBottom = tbScrTop - gapPx;
      }

      const sbScrTop = sbScrBottom - sbTotalH;
      const barTop   = sbScrTop + lblAboveH + 4;

      tbBoundsRef.current.scaleBar = { screenX: sbScrLeft, screenY: sbScrTop, w: barLenPx, h: sbTotalH };
      const sbHovered  = hoveredTBElemRef.current === 'scaleBar';
      const sbDragging = drag?.element === 'scaleBar';

      // Blue hover highlight
      if (sbHovered || sbDragging) {
        g.lineStyle(2.5, 0x0088ff, 0.9);
        g.drawRect(sbScrLeft - 5, sbScrTop - 5, barLenPx + 10, sbTotalH + 10);
      }

      // "GRAPHIC SCALE" label above
      const gsLblSz = Math.max(barH * 0.9, 6);
      const gsTxt = mkTBText('GRAPHIC SCALE', {
        fontFamily: 'Arial', fontSize: gsLblSz, fill: 0x111111, fontWeight: 'bold', letterSpacing: 0.5,
      });
      gsTxt.anchor.set(0.5, 1);
      gsTxt.position.set(sbScrLeft + barLenPx / 2, barTop - 3);

      // Checkered bar segments
      const segPx = barLenPx / numSegs;
      for (let i = 0; i < numSegs; i++) {
        const segLeft = sbScrLeft + i * segPx;
        const fill    = i % 2 === 0 ? 0x000000 : 0xffffff;
        g.lineStyle(0);
        g.beginFill(fill, 1);
        g.drawRect(segLeft, barTop, segPx, barH);
        g.endFill();
      }
      // Outer border around entire bar
      g.lineStyle(1, 0x000000, 1);
      g.drawRect(sbScrLeft, barTop, barLenPx, barH);
      // Segment dividers
      g.lineStyle(0.5, 0x000000, 0.7);
      for (let i = 1; i < numSegs; i++) {
        const divX = sbScrLeft + i * segPx;
        g.moveTo(divX, barTop);
        g.lineTo(divX, barTop + barH);
      }

      // Tick marks + distance labels below bar
      const tickH   = barH * 0.5;
      const lblBelowSz = Math.max(barH * 0.85, 5.5);
      g.lineStyle(0.75, 0x000000, 1);
      for (let i = 0; i <= numSegs; i++) {
        const tickX = sbScrLeft + i * segPx;
        g.moveTo(tickX, barTop + barH);
        g.lineTo(tickX, barTop + barH + tickH);
        const distFt   = i * segFt;
        const distLabel = distFt >= 1000
          ? `${Math.round(distFt / 1000 * 10) / 10}K`
          : String(distFt);
        const lbl = mkTBText(distLabel, {
          fontFamily: 'Arial', fontSize: lblBelowSz, fill: 0x111111,
        });
        lbl.anchor.set(0.5, 0);
        lbl.position.set(tickX, barTop + barH + tickH + 1);
      }

      // Units label — placed to the right of the bar on a second line so it
      // never overlaps the last distance tick label.
      const unitsLbl = mkTBText(' FEET', {
        fontFamily: 'Arial', fontSize: lblBelowSz, fill: 0x444444, fontStyle: 'italic',
      });
      unitsLbl.anchor.set(0, 0);
      unitsLbl.position.set(sbScrLeft + barLenPx + 6, barTop + barH + tickH + 1);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Draw a north arrow symbol into graphics g, centered at (cx, cy)
  // ─────────────────────────────────────────────────────────────────
  function drawNorthArrow(
    g: import('pixi.js').Graphics,
    cx: number,
    cy: number,
    radius: number,
    rotRad: number,
    style: string,
    pixi: NonNullable<typeof pixiRef.current>,
    mkTBText?: (content: string, style: Partial<import('pixi.js').ITextStyle>) => import('pixi.js').Text,
  ) {
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);
    // "up" direction after rotation (screen-up = -y, rotated by rotRad)
    const ux = -sin;
    const uy = -cos;
    const tipX  = cx + ux * radius;
    const tipY  = cy + uy * radius;
    const baseX = cx - ux * radius * 0.9;
    const baseY = cy - uy * radius * 0.9;
    const px =  uy;   // perpendicular
    const py = -ux;

    g.lineStyle(0);

    if (style === 'SIMPLE') {
      g.lineStyle(1.5, 0x000000, 1);
      g.moveTo(baseX, baseY);
      g.lineTo(tipX, tipY);
      const hx = cx + ux * radius * 0.6;
      const hy = cy + uy * radius * 0.6;
      const bw = radius * 0.22;
      g.moveTo(tipX, tipY); g.lineTo(hx + px * bw, hy + py * bw);
      g.moveTo(tipX, tipY); g.lineTo(hx - px * bw, hy - py * bw);

    } else if (style === 'TRADITIONAL') {
      const bw = radius * 0.28;
      g.beginFill(0x000000, 1);
      g.moveTo(tipX, tipY); g.lineTo(cx + px * bw, cy + py * bw);
      g.lineTo(baseX, baseY); g.closePath(); g.endFill();
      g.beginFill(0xffffff, 1);
      g.moveTo(tipX, tipY); g.lineTo(cx - px * bw, cy - py * bw);
      g.lineTo(baseX, baseY); g.closePath(); g.endFill();
      g.lineStyle(1, 0x000000, 1);
      g.drawCircle(cx, cy, radius * 0.12);

    } else if (style === 'COMPASS_ROSE') {
      for (let i = 0; i < 4; i++) {
        const a    = rotRad + (i * Math.PI) / 2;
        const tx   = cx - Math.sin(a) * radius;
        const ty   = cy - Math.cos(a) * radius;
        const bx   = cx + Math.sin(a) * radius * 0.3;
        const by   = cy + Math.cos(a) * radius * 0.3;
        const pw2  = radius * 0.18;
        const px2  =  Math.cos(a);
        const py2  = -Math.sin(a);
        const fill = i === 0 ? 0x000000 : 0x888888;
        g.beginFill(fill, 1);
        g.moveTo(tx, ty);
        g.lineTo(cx + px2 * pw2, cy + py2 * pw2);
        g.lineTo(bx, by);
        g.lineTo(cx - px2 * pw2, cy - py2 * pw2);
        g.closePath(); g.endFill();
      }
      g.lineStyle(1, 0x000000, 1);
      g.drawCircle(cx, cy, radius * 0.15);

    } else if (style === 'STARR') {
      // ── STARR 8-pointed star compass ─────────────────────────────
      // Intercardinal points (NE/SE/SW/NW) — drawn first (back layer)
      for (let i = 0; i < 4; i++) {
        const a   = rotRad + Math.PI / 4 + (i * Math.PI) / 2;
        const ax  = -Math.sin(a);
        const ay  = -Math.cos(a);
        const bx2 =  Math.cos(a);
        const by2 = -Math.sin(a);
        const tipX2  = cx + ax * radius * 0.60;
        const tipY2  = cy + ay * radius * 0.60;
        const baseX2 = cx - ax * radius * 0.22;
        const baseY2 = cy - ay * radius * 0.22;
        const hw = radius * 0.15;
        g.lineStyle(0);
        g.beginFill(0xcccccc, 1);
        g.moveTo(tipX2, tipY2);
        g.lineTo(cx + bx2 * hw, cy + by2 * hw);
        g.lineTo(baseX2, baseY2);
        g.lineTo(cx - bx2 * hw, cy - by2 * hw);
        g.closePath(); g.endFill();
        g.lineStyle(0.5, 0x888888, 0.8);
        g.moveTo(tipX2, tipY2); g.lineTo(cx + bx2 * hw, cy + by2 * hw);
        g.moveTo(tipX2, tipY2); g.lineTo(cx - bx2 * hw, cy - by2 * hw);
        g.lineStyle(0);
      }
      // Cardinal points (N/S/E/W) — classic split-blade (half black / half white)
      for (let i = 0; i < 4; i++) {
        const a    = rotRad + (i * Math.PI) / 2;
        const ax   = -Math.sin(a);
        const ay   = -Math.cos(a);
        const bx2  =  Math.cos(a);
        const by2  = -Math.sin(a);
        const tipX2  = cx + ax * radius;
        const tipY2  = cy + ay * radius;
        const hw     = radius * 0.22;
        // Left blade
        g.lineStyle(0);
        g.beginFill(0x111111, 1);
        g.moveTo(tipX2, tipY2); g.lineTo(cx, cy);
        g.lineTo(cx + bx2 * hw, cy + by2 * hw); g.closePath(); g.endFill();
        // Right blade (white)
        g.beginFill(0xfafafa, 1);
        g.moveTo(tipX2, tipY2); g.lineTo(cx, cy);
        g.lineTo(cx - bx2 * hw, cy - by2 * hw); g.closePath(); g.endFill();
        // Outline
        g.lineStyle(0.8, 0x000000, 1);
        g.moveTo(tipX2, tipY2); g.lineTo(cx + bx2 * hw, cy + by2 * hw);
        g.moveTo(tipX2, tipY2); g.lineTo(cx - bx2 * hw, cy - by2 * hw);
        g.lineStyle(0);
      }
      // Center ring (white fill with border, then small dot)
      g.lineStyle(1, 0x000000, 1);
      g.beginFill(0xffffff, 1); g.drawCircle(cx, cy, radius * 0.14); g.endFill();
      g.beginFill(0x000000, 1); g.drawCircle(cx, cy, radius * 0.05); g.endFill();
      g.lineStyle(0);

    } else {
      // DETAILED (default): double-headed with styled tick
      const bw = radius * 0.26;
      g.beginFill(0x000000, 1);
      g.moveTo(tipX, tipY); g.lineTo(cx + px * bw, cy + py * bw);
      g.lineTo(baseX, baseY); g.closePath(); g.endFill();
      g.beginFill(0xffffff, 1);
      g.lineStyle(0.8, 0x000000, 1);
      g.moveTo(tipX, tipY); g.lineTo(cx - px * bw, cy - py * bw);
      g.lineTo(baseX, baseY); g.closePath(); g.endFill();
      g.lineStyle(0);
      g.lineStyle(0.8, 0x000000, 0.4);
      g.moveTo(cx - ux * radius * 1.05, cy - uy * radius * 1.05);
      g.lineTo(cx + ux * radius * 1.05, cy + uy * radius * 1.05);
    }

    // "N" label at the north tip (drawn for all styles)
    if (mkTBText) {
      const nLbl = mkTBText('N', {
        fontFamily: 'Arial',
        fontSize: Math.max(radius * 0.45, 8),
        fill: 0x000000,
        fontWeight: 'bold',
      });
      const nOffset = radius * 0.55;  // clear gap between N and north tip
      nLbl.anchor.set(0.5, 0.5);
      nLbl.position.set(tipX + ux * nOffset, tipY + uy * nOffset);
    } else {
      // Fallback when mkTBText not provided (legacy call path)
      const nLbl = new pixi.TextClass('N', new pixi.TextStyleClass({
        fontFamily: 'Arial',
        fontSize: Math.max(radius * 0.45, 8),
        fill: 0x000000,
        fontWeight: 'bold',
      }));
      (nLbl as unknown as { _isTitleBlockText: boolean })._isTitleBlockText = true;
      const nOffset = radius * 0.55;  // clear gap between N and north tip
      nLbl.anchor.set(0.5, 0.5);
      nLbl.position.set(tipX + ux * nOffset, tipY + uy * nOffset);
      nLbl.resolution = (pixi.app.renderer as { resolution?: number }).resolution ?? 2;
      pixi.titleBlockLayer.addChild(nLbl);
    }
  }

  // ─────────────────────────────────────────────
  // Render: Text Labels (bearings, distances, areas, names, etc.)
  // ─────────────────────────────────────────────
  function renderLabels() {
    const pixi = pixiRef.current;
    if (!pixi) return;

    const visibleFeatures = drawingStore.getVisibleFeatures();
    const activeLabelIds = new Set<string>();
    const { zoom } = useViewportStore.getState();
    const doc = useDrawingStore.getState().document;

    for (const feature of visibleFeatures) {
      const labels = feature.textLabels;
      if (!labels || labels.length === 0) continue;

      const layer = doc.layers[feature.layerId];
      if (!layer) continue;

      const geom = feature.geometry;

      for (let li = 0; li < labels.length; li++) {
        const label = labels[li];
        if (!label.visible) continue;

        const labelKey = `${feature.id}:${label.id}`;
        activeLabelIds.add(labelKey);

        // Compute anchor position in world coordinates based on label kind and feature geometry
        let anchorWorld: Point2D = { x: 0, y: 0 };
        let segmentIndex = -1;

        if (label.kind === 'POINT_NAME' || label.kind === 'POINT_DESCRIPTION' ||
            label.kind === 'POINT_ELEVATION' || label.kind === 'POINT_COORDINATES') {
          if (geom.point) {
            anchorWorld = geom.point;
          }
        } else if (label.kind === 'BEARING' || label.kind === 'DISTANCE') {
          if (geom.type === 'LINE' && geom.start && geom.end) {
            anchorWorld = {
              x: (geom.start.x + geom.end.x) / 2,
              y: (geom.start.y + geom.end.y) / 2,
            };
          } else if ((geom.type === 'POLYLINE' || geom.type === 'POLYGON') && geom.vertices) {
            // Find which segment this label belongs to (use li as segment proxy for bearing/distance pairs)
            const bearingLabels = labels.filter((l) => l.kind === 'BEARING');
            const distLabels = labels.filter((l) => l.kind === 'DISTANCE');
            if (label.kind === 'BEARING') {
              segmentIndex = bearingLabels.indexOf(label);
            } else {
              segmentIndex = distLabels.indexOf(label);
            }
            const verts = geom.vertices;
            const maxSeg = geom.type === 'POLYGON' ? verts.length : verts.length - 1;
            if (segmentIndex >= 0 && segmentIndex < maxSeg) {
              const from = verts[segmentIndex];
              const to = verts[(segmentIndex + 1) % verts.length];
              anchorWorld = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            }
          }
        } else if (label.kind === 'AREA' || label.kind === 'PERIMETER') {
          if (geom.vertices && geom.vertices.length >= 3) {
            const cx = geom.vertices.reduce((s, v) => s + v.x, 0) / geom.vertices.length;
            const cy = geom.vertices.reduce((s, v) => s + v.y, 0) / geom.vertices.length;
            anchorWorld = { x: cx, y: cy };
          }
        }

        // Convert anchor to screen
        const { sx: ax, sy: ay } = w2s(anchorWorld.x, anchorWorld.y);

        // Compute screen offset from world-unit offset
        const scale = label.userPositioned ? 1 : label.scale;
        let screenDx = 0;
        let screenDy = 0;
        if (label.rotation !== null && !label.userPositioned) {
          // Line-relative offset: x = along line, y = perpendicular (positive = above/left of direction)
          const θ = label.rotation;
          const along = label.offset.x * scale;
          const perp = label.offset.y * scale;
          // Rotate offset by line angle and convert world → screen (y inverted)
          screenDx = (Math.cos(θ) * along - Math.sin(θ) * perp) * zoom;
          screenDy = -(Math.sin(θ) * along + Math.cos(θ) * perp) * zoom;
        } else {
          // Point labels and user-positioned: world-unit offset applied directly (y inverted)
          screenDx = label.offset.x * scale * zoom;
          screenDy = -label.offset.y * scale * zoom;
        }
        const finalX = ax + screenDx;
        const finalY = ay + screenDy;

        // Get or create text object
        let textObj = pixi.labelTexts.get(labelKey);
        const isHovered = hoveredLabelKeyRef.current === labelKey;
        const textColor = isHovered ? '#3b82f6' : (label.style.color ?? layer.color ?? '#000000');
        // Scale font size: label.style.fontSize is in "points on paper"
        // 1 pt = 1/72 inch; 1 inch = drawingScale world units → world units → screen pixels
        const drawingScale = doc.settings.drawingScale ?? 50;
        const fontSizeWorld = (label.style.fontSize / 72) * drawingScale * scale;
        const fontSize = Math.max(MIN_LABEL_FONT_SIZE_PX, fontSizeWorld * zoom);

        if (!textObj) {
          const style = new pixi.TextStyleClass({
            fontFamily: label.style.fontFamily,
            fontSize,
            fontWeight: label.style.fontWeight,
            fontStyle: label.style.fontStyle,
            fill: textColor,
            align: 'center',
          });
          textObj = new pixi.TextClass(label.text, style);
          textObj.anchor.set(0.5, 0.5);
          // Match the renderer's super-sampled resolution so the text texture is
          // generated at the same density as the rest of the scene.
          textObj.resolution = pixi.app.renderer.resolution;
          pixi.labelTexts.set(labelKey, textObj);
          pixi.labelLayer.addChild(textObj);
        } else {
          // Update existing text
          if (textObj.text !== label.text) textObj.text = label.text;
          const s = textObj.style as import('pixi.js').TextStyle;
          s.fontFamily = label.style.fontFamily;
          s.fontSize = fontSize;
          s.fontWeight = label.style.fontWeight;
          s.fontStyle = label.style.fontStyle;
          s.fill = textColor;
        }

        textObj.position.set(finalX, finalY);

        // Rotation: for line labels, orient along line direction
        if (label.rotation !== null) {
          // PixiJS rotation is clockwise, and our y-axis is inverted (screen),
          // so negate the rotation to match world orientation
          textObj.rotation = -label.rotation;
        } else {
          textObj.rotation = 0;
        }

        textObj.alpha = layer.opacity;
        textObj.visible = true;

        // Add background if specified
        // (background rendering is handled via the text's own properties for simplicity)
      }
    }

    // Remove label texts that are no longer active
    for (const [key, textObj] of pixi.labelTexts) {
      if (!activeLabelIds.has(key)) {
        pixi.labelLayer.removeChild(textObj);
        textObj.destroy();
        pixi.labelTexts.delete(key);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Render: TEXT features as PixiJS Text objects
  // ─────────────────────────────────────────────
  function renderTextFeatures() {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const { zoom } = useViewportStore.getState();
    const doc = useDrawingStore.getState().document;
    const drawingScale = doc.settings.drawingScale ?? 50;
    const visibleFeatures = drawingStore.getVisibleFeatures().filter(f => f.type === 'TEXT');
    const activeKeys = new Set<string>();

    for (const feature of visibleFeatures) {
      const geom = feature.geometry;
      if (!geom.point || !geom.textContent) continue;
      const layer = doc.layers[feature.layerId];
      if (!layer) continue;

      const key = `text:${feature.id}`;
      activeKeys.add(key);

      const { sx, sy } = w2s(geom.point.x, geom.point.y);
      const isHovered = hoveredLabelKeyRef.current === key;
      const color = isHovered ? '#3b82f6' : (feature.style.color ?? layer.color ?? '#000000');
      const alpha = feature.style.opacity;
      const rotation = geom.textRotation ?? 0;
      const fontPt = Number(feature.properties.fontSize ?? 12);
      const fontFamily = String(feature.properties.fontFamily ?? 'Arial');
      const fontWeight = (feature.properties.fontWeight ?? 'normal') as 'normal' | 'bold';
      const fontStyle = (feature.properties.fontStyle ?? 'normal') as 'normal' | 'italic';
      const align = (feature.properties.textAlign ?? 'left') as 'left' | 'center' | 'right';
      const fontSize = Math.max(MIN_LABEL_FONT_SIZE_PX, (fontPt / 72) * drawingScale * zoom);

      let textObj = pixi.labelTexts.get(key);
      if (!textObj) {
        const style = new pixi.TextStyleClass({
          fontFamily, fontSize, fontWeight, fontStyle,
          fill: color, align,
        });
        textObj = new pixi.TextClass(geom.textContent, style);
        textObj.anchor.set(0, 0.5);
        textObj.resolution = pixi.app.renderer.resolution;
        pixi.labelTexts.set(key, textObj);
        pixi.labelLayer.addChild(textObj);
      } else {
        if (textObj.text !== geom.textContent) textObj.text = geom.textContent;
        const s = textObj.style as import('pixi.js').TextStyle;
        s.fontFamily = fontFamily;
        s.fontSize = fontSize;
        s.fontWeight = fontWeight;
        s.fontStyle = fontStyle;
        s.fill = color;
        s.align = align;
      }

      textObj.position.set(sx, sy);
      textObj.rotation = -rotation;
      textObj.alpha = alpha;
      textObj.visible = true;
    }

    // Remove text objects for non-visible TEXT features
    for (const [key, textObj] of pixi.labelTexts) {
      if (key.startsWith('text:') && !activeKeys.has(key)) {
        pixi.labelLayer.removeChild(textObj);
        textObj.destroy();
        pixi.labelTexts.delete(key);
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
      const bsMode = docSettings.boxSelectMode ?? 'CROSSING_EXPAND_GROUPS';
      const isWindowDrag = boxEnd.x > boxStart.x;
      // Color coding: blue for window/full-only selection, green for crossing selection
      const color = (bsMode === 'WINDOW_FULL_ONLY' || isWindowDrag) ? 0x0044ff : 0x00aa00;
      // Dashed outline for crossing modes, solid for window
      g.lineStyle(1.5, color, 0.8);
      g.beginFill(color, 0.08);
      g.drawRect(
        Math.min(boxStart.x, boxEnd.x),
        Math.min(boxStart.y, boxEnd.y),
        Math.abs(boxEnd.x - boxStart.x),
        Math.abs(boxEnd.y - boxStart.y),
      );
      g.endFill();
    }

    // Draw hover glow highlight for ANY tool when hovering over an element.
    // Uses a multi-layer glow: outer (thick, low alpha) + inner (thin, brighter)
    const hoveredId = hoveredIdRef.current;
    const hoverColorHex = (docSettings.hoverColor ?? '#66aaff').replace('#', '');
    const hoverColor = parseInt(hoverColorHex, 16);
    const selColorHex = (docSettings.selectionColor ?? '#0088ff').replace('#', '');
    const selColor = parseInt(selColorHex, 16);
    const glowEnabled = docSettings.hoverGlowEnabled ?? true;
    const glowIntensity = docSettings.hoverGlowIntensity ?? 1.0;
    if (hoveredId && !selectedIds.has(hoveredId) && glowEnabled) {
      const feature = drawingStore.getFeature(hoveredId);
      if (feature) {
        const geom = feature.geometry;
        // Helper: draw geometry outline for glow layers
        const currentZoom = useViewportStore.getState().zoom;
        const drawGeomOutline = () => {
          switch (geom.type) {
            case 'POINT': {
              const { sx, sy } = w2s(geom.point!.x, geom.point!.y);
              g.drawCircle(sx, sy, 7);
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
            case 'CIRCLE': {
              if (geom.circle) drawCircleCurve(g as unknown as GraphicsLike, geom.circle, w2s, currentZoom);
              break;
            }
            case 'ELLIPSE': {
              if (geom.ellipse) drawEllipseCurve(g as unknown as GraphicsLike, geom.ellipse, w2s, currentZoom);
              break;
            }
            case 'ARC': {
              if (geom.arc) drawArcCurve(g as unknown as GraphicsLike, geom.arc, w2s, currentZoom);
              break;
            }
            case 'SPLINE': {
              if (geom.spline) drawSplineCurve(g as unknown as GraphicsLike, geom.spline, w2s);
              break;
            }
          }
        };

        // Outer glow layer (thick, soft) — intensity-scaled
        g.lineStyle(6 * glowIntensity, hoverColor, 0.15 * glowIntensity);
        drawGeomOutline();
        // Middle glow layer
        g.lineStyle(3 * glowIntensity, hoverColor, 0.3 * glowIntensity);
        drawGeomOutline();
        // Inner highlight layer (crisp)
        g.lineStyle(1.5, hoverColor, Math.min(1, 0.7 * glowIntensity));
        drawGeomOutline();
      }
    }

    // Draw selection highlights
    for (const featureId of selectedIds) {
      const feature = drawingStore.getFeature(featureId);
      if (!feature) continue;

      // Highlight: selection color outline — width from settings
      const geom = feature.geometry;
      const selLineW = docSettings.selectionLineWidth ?? 1.5;
      const selZoom = useViewportStore.getState().zoom;
      g.lineStyle(selLineW + 0.5, selColor, 1);
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
        case 'CIRCLE': {
          if (geom.circle) drawCircleCurve(g as unknown as GraphicsLike, geom.circle, w2s, selZoom);
          break;
        }
        case 'ELLIPSE': {
          if (geom.ellipse) drawEllipseCurve(g as unknown as GraphicsLike, geom.ellipse, w2s, selZoom);
          break;
        }
        case 'ARC': {
          if (geom.arc) drawArcCurve(g as unknown as GraphicsLike, geom.arc, w2s, selZoom);
          break;
        }
        case 'SPLINE': {
          if (geom.spline) drawSplineCurve(g as unknown as GraphicsLike, geom.spline, w2s);
          break;
        }
      }

      // Grip squares at vertices — size and colors from settings
      const gs = docSettings.gripSize ?? 6;
      const gripColorHex = (docSettings.gripColor ?? docSettings.selectionColor ?? '#0088ff').replace('#', '');
      const gripBorderColor = parseInt(gripColorHex, 16);
      const gripFillHex = (docSettings.gripFillColor ?? '#ffffff').replace('#', '');
      const gripFill = parseInt(gripFillHex, 16);
      // SPLINE: draw tangent handles with specialized grips
      if (geom.type === 'SPLINE' && geom.spline && geom.spline.controlPoints.length >= 4) {
        const cp = geom.spline.controlPoints;
        const fitPts = bezierToFitPoints(cp);
        const fitCount = fitPts.length;

        // Draw tangent handle lines (thin gray lines from inflection point to handle endpoints)
        g.lineStyle(1, 0xaaaaaa, 0.6);
        for (let fi = 0; fi < fitCount; fi++) {
          const handles = getSplineHandles(cp, fi);
          const pt = w2s(handles.point.x, handles.point.y);
          if (handles.leftHandle) {
            const lh = w2s(handles.leftHandle.x, handles.leftHandle.y);
            g.moveTo(pt.sx, pt.sy);
            g.lineTo(lh.sx, lh.sy);
          }
          if (handles.rightHandle) {
            const rh = w2s(handles.rightHandle.x, handles.rightHandle.y);
            g.moveTo(pt.sx, pt.sy);
            g.lineTo(rh.sx, rh.sy);
          }
        }

        // Draw white square grips at handle endpoints (control points)
        g.lineStyle(1, gripBorderColor, 1);
        g.beginFill(gripFill, 1);
        for (let fi = 0; fi < fitCount; fi++) {
          const handles = getSplineHandles(cp, fi);
          if (handles.leftHandle) {
            const lh = w2s(handles.leftHandle.x, handles.leftHandle.y);
            g.drawRect(lh.sx - gs / 2, lh.sy - gs / 2, gs, gs);
          }
          if (handles.rightHandle) {
            const rh = w2s(handles.rightHandle.x, handles.rightHandle.y);
            g.drawRect(rh.sx - gs / 2, rh.sy - gs / 2, gs, gs);
          }
        }
        g.endFill();

        // Draw circle grips at inflection points (on-curve points)
        g.lineStyle(1.5, gripBorderColor, 1);
        g.beginFill(gripFill, 1);
        for (let fi = 0; fi < fitCount; fi++) {
          const pt = w2s(fitPts[fi].x, fitPts[fi].y);
          g.drawCircle(pt.sx, pt.sy, gs / 2 + 1);
        }
        g.endFill();
      } else {
        // Standard grip squares for all other geometry types
        g.lineStyle(1, gripBorderColor, 1);
        g.beginFill(gripFill, 1);
        const gripPoints = getFeatureVertices(feature);
        for (const pt of gripPoints) {
          const { sx, sy } = w2s(pt.x, pt.y);
          g.drawRect(sx - gs / 2, sy - gs / 2, gs, gs);
        }
        g.endFill();
      }
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
      case 'CIRCLE':
        return geom.circle ? circleGripPoints(geom.circle) : [];
      case 'ELLIPSE':
        return geom.ellipse ? ellipseGripPoints(geom.ellipse) : [];
      case 'ARC':
        return geom.arc ? arcGripPoints(geom.arc) : [];
      case 'SPLINE':
        return geom.spline ? splineGripPoints(geom.spline) : [];
      case 'IMAGE':
        // 4 corners + 4 edge midpoints for IMAGE resize
        if (geom.image) {
          const { position: p, width: w, height: h } = geom.image;
          return [
            { x: p.x,       y: p.y     },   // 0: bottom-left
            { x: p.x + w,   y: p.y     },   // 1: bottom-right
            { x: p.x + w,   y: p.y + h },   // 2: top-right
            { x: p.x,       y: p.y + h },   // 3: top-left
            { x: p.x + w/2, y: p.y     },   // 4: bottom-mid
            { x: p.x + w,   y: p.y + h/2 }, // 5: right-mid
            { x: p.x + w/2, y: p.y + h },   // 6: top-mid
            { x: p.x,       y: p.y + h/2 }, // 7: left-mid
          ];
        }
        return [];
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

    // ── DRAW_CURVED_LINE / DRAW_SPLINE_FIT preview: live bezier curve from fit points + cursor ──
    if (activeTool === 'DRAW_CURVED_LINE' || activeTool === 'DRAW_SPLINE_FIT') {
      if (drawingPoints.length === 0) {
        // No points yet: show start-point crosshair at cursor
        const { sx, sy } = w2s(previewPoint.x, previewPoint.y);
        g.lineStyle(1, previewColor, 0.5);
        g.moveTo(sx - 6, sy); g.lineTo(sx + 6, sy);
        g.moveTo(sx, sy - 6); g.lineTo(sx, sy + 6);
        return;
      }

      // Build temporary fit points including the live cursor position
      const tempFitPoints = [...drawingPoints, previewPoint];
      const tempCP = fitPointsToBezier(tempFitPoints, false);

      // Draw the live bezier curve
      if (tempCP.length >= 4) {
        g.lineStyle(1.5, previewColor, 0.85);
        const p0 = w2s(tempCP[0].x, tempCP[0].y);
        g.moveTo(p0.sx, p0.sy);
        const numSegs = Math.floor((tempCP.length - 1) / 3);
        for (let seg = 0; seg < numSegs; seg++) {
          const idx = seg * 3;
          const cp1 = w2s(tempCP[idx + 1].x, tempCP[idx + 1].y);
          const cp2 = w2s(tempCP[idx + 2].x, tempCP[idx + 2].y);
          const end = w2s(tempCP[idx + 3].x, tempCP[idx + 3].y);
          g.bezierCurveTo(cp1.sx, cp1.sy, cp2.sx, cp2.sy, end.sx, end.sy);
        }
      } else if (drawingPoints.length === 1) {
        // Only 1 fit point + cursor: straight line preview
        const s = w2s(drawingPoints[0].x, drawingPoints[0].y);
        const e = w2s(previewPoint.x, previewPoint.y);
        g.lineStyle(1.5, previewColor, 0.85);
        g.moveTo(s.sx, s.sy);
        g.lineTo(e.sx, e.sy);
      }

      // Draw inflection point dots at each committed fit point
      g.lineStyle(1, previewColor, 0.9);
      for (let i = 0; i < drawingPoints.length; i++) {
        const { sx, sy } = w2s(drawingPoints[i].x, drawingPoints[i].y);
        g.beginFill(i === 0 ? previewColor : 0xffffff, i === 0 ? 0.9 : 0.8);
        g.drawCircle(sx, sy, i === 0 ? 4 : 3);
        g.endFill();
      }

      // Show tangent handles on committed fit points (if >= 2 fit points)
      if (drawingPoints.length >= 2) {
        const committedCP = fitPointsToBezier(drawingPoints, false);
        const fitCount = drawingPoints.length;
        g.lineStyle(0.75, 0xaaaaaa, 0.5);
        for (let fi = 0; fi < fitCount; fi++) {
          const handles = getSplineHandles(committedCP, fi);
          const pt = w2s(handles.point.x, handles.point.y);
          if (handles.leftHandle) {
            const lh = w2s(handles.leftHandle.x, handles.leftHandle.y);
            g.moveTo(pt.sx, pt.sy);
            g.lineTo(lh.sx, lh.sy);
          }
          if (handles.rightHandle) {
            const rh = w2s(handles.rightHandle.x, handles.rightHandle.y);
            g.moveTo(pt.sx, pt.sy);
            g.lineTo(rh.sx, rh.sy);
          }
        }
      }

      // Cursor dot
      const { sx: cx, sy: cy } = w2s(previewPoint.x, previewPoint.y);
      g.beginFill(previewColor, 0.7);
      g.drawCircle(cx, cy, 2.5);
      g.endFill();
      return;
    }

    // ── DRAW_SPLINE_CONTROL preview: show control point polygon + bezier curves ──
    if (activeTool === 'DRAW_SPLINE_CONTROL') {
      const allPts = [...drawingPoints, previewPoint];
      if (allPts.length === 0) return;

      // Draw control polygon (dashed-style thin lines between all points)
      g.lineStyle(0.75, previewColor, 0.3);
      const first = w2s(allPts[0].x, allPts[0].y);
      g.moveTo(first.sx, first.sy);
      for (let i = 1; i < allPts.length; i++) {
        const p = w2s(allPts[i].x, allPts[i].y);
        g.lineTo(p.sx, p.sy);
      }

      // Draw the bezier curve from complete segments
      const numSegs = Math.floor((allPts.length - 1) / 3);
      if (numSegs > 0) {
        g.lineStyle(1.5, previewColor, 0.85);
        const p0 = w2s(allPts[0].x, allPts[0].y);
        g.moveTo(p0.sx, p0.sy);
        for (let seg = 0; seg < numSegs; seg++) {
          const idx = seg * 3;
          const cp1 = w2s(allPts[idx + 1].x, allPts[idx + 1].y);
          const cp2 = w2s(allPts[idx + 2].x, allPts[idx + 2].y);
          const end = w2s(allPts[idx + 3].x, allPts[idx + 3].y);
          g.bezierCurveTo(cp1.sx, cp1.sy, cp2.sx, cp2.sy, end.sx, end.sy);
        }
      }

      // Draw dots at each control point
      for (let i = 0; i < allPts.length; i++) {
        const { sx, sy } = w2s(allPts[i].x, allPts[i].y);
        const isOnCurve = i % 3 === 0;
        g.lineStyle(1, previewColor, 0.9);
        g.beginFill(isOnCurve ? previewColor : 0xffffff, isOnCurve ? 0.9 : 0.7);
        if (isOnCurve) {
          g.drawCircle(sx, sy, 3.5);
        } else {
          g.drawRect(sx - 3, sy - 3, 6, 6);
        }
        g.endFill();
      }
      return;
    }

    // ── DRAW_ARC preview: show arc from committed points + cursor ──
    if (activeTool === 'DRAW_ARC') {
      if (drawingPoints.length === 0) {
        // No points: show crosshair
        const { sx, sy } = w2s(previewPoint.x, previewPoint.y);
        g.lineStyle(1, previewColor, 0.5);
        g.moveTo(sx - 6, sy); g.lineTo(sx + 6, sy);
        g.moveTo(sx, sy - 6); g.lineTo(sx, sy + 6);
        return;
      }

      // Draw dots at committed points
      for (let i = 0; i < drawingPoints.length; i++) {
        const { sx, sy } = w2s(drawingPoints[i].x, drawingPoints[i].y);
        g.lineStyle(1, previewColor, 0.9);
        g.beginFill(previewColor, 0.8);
        g.drawCircle(sx, sy, 3.5);
        g.endFill();
      }

      if (drawingPoints.length === 1) {
        // 1 point: show line to cursor
        const s = w2s(drawingPoints[0].x, drawingPoints[0].y);
        const e = w2s(previewPoint.x, previewPoint.y);
        g.lineStyle(1, previewColor, 0.5);
        g.moveTo(s.sx, s.sy);
        g.lineTo(e.sx, e.sy);
      } else if (drawingPoints.length === 2) {
        // 2 points + cursor: compute and draw the preview arc
        const arcGeom = arcFrom3Points(drawingPoints[0], drawingPoints[1], previewPoint);
        if (arcGeom) {
          const pvZoom = useViewportStore.getState().zoom;
          g.lineStyle(1.5, previewColor, 0.85);
          drawArcCurve(g as unknown as GraphicsLike, arcGeom, w2s, pvZoom);
        } else {
          // Collinear: draw straight lines
          const s = w2s(drawingPoints[0].x, drawingPoints[0].y);
          const m = w2s(drawingPoints[1].x, drawingPoints[1].y);
          const e = w2s(previewPoint.x, previewPoint.y);
          g.lineStyle(1, previewColor, 0.5);
          g.moveTo(s.sx, s.sy);
          g.lineTo(m.sx, m.sy);
          g.lineTo(e.sx, e.sy);
        }
      }

      // Cursor dot
      const { sx: cx, sy: cy } = w2s(previewPoint.x, previewPoint.y);
      g.beginFill(previewColor, 0.7);
      g.drawCircle(cx, cy, 2.5);
      g.endFill();
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
          const sides = toolState.regularPolygonSides;
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
      // Circle preview (center + radius mode) — true circle using native drawCircle
      if (activeTool === 'DRAW_CIRCLE' && drawingPoints.length === 1 && previewPoint) {
        const center = drawingPoints[0];
        const radius = Math.hypot(previewPoint.x - center.x, previewPoint.y - center.y);
        if (radius > 0) {
          const pvZoom = useViewportStore.getState().zoom;
          const { sx: cx, sy: cy } = w2s(center.x, center.y);
          const screenRadius = radius * pvZoom;
          g.lineStyle(1.5, previewColor, 0.9);
          g.beginFill(previewColor, 0.06);
          g.drawCircle(cx, cy, screenRadius);
          g.endFill();
          // Center crosshair + radius line
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
      // Circle preview (edge/diameter mode) — true circle using native drawCircle
      if (activeTool === 'DRAW_CIRCLE_EDGE' && drawingPoints.length === 1 && previewPoint) {
        const p1 = drawingPoints[0];
        const diameter = Math.hypot(previewPoint.x - p1.x, previewPoint.y - p1.y);
        const radius = diameter / 2;
        if (radius > 0) {
          const pvZoom = useViewportStore.getState().zoom;
          const center = { x: (p1.x + previewPoint.x) / 2, y: (p1.y + previewPoint.y) / 2 };
          const { sx: cx, sy: cy } = w2s(center.x, center.y);
          const screenRadius = radius * pvZoom;
          g.lineStyle(1.5, previewColor, 0.9);
          g.beginFill(previewColor, 0.06);
          g.drawCircle(cx, cy, screenRadius);
          g.endFill();
          // Diameter line from p1 to preview point
          const { sx: p1x, sy: p1y } = w2s(p1.x, p1.y);
          const { sx: p2x, sy: p2y } = w2s(previewPoint.x, previewPoint.y);
          g.lineStyle(0.75, previewColor, 0.35);
          g.moveTo(p1x, p1y); g.lineTo(p2x, p2y);
          // Center crosshair
          g.lineStyle(1, previewColor, 0.5);
          g.moveTo(cx - 4, cy); g.lineTo(cx + 4, cy);
          g.moveTo(cx, cy - 4); g.lineTo(cx, cy + 4);
          // Edge dots
          g.beginFill(previewColor, 0.8);
          g.drawCircle(p1x, p1y, 2.5);
          g.drawCircle(p2x, p2y, 2.5);
          g.endFill();
        }
        return;
      }
      // Ellipse preview (center + bounding-box corner mode) — true ellipse using native drawEllipse
      if (activeTool === 'DRAW_ELLIPSE' && drawingPoints.length === 1 && previewPoint) {
        const center = drawingPoints[0];
        const rx = Math.abs(previewPoint.x - center.x);
        const ry = Math.abs(previewPoint.y - center.y);
        if (rx > 0 && ry > 0) {
          const pvZoom = useViewportStore.getState().zoom;
          const { sx: cx, sy: cy } = w2s(center.x, center.y);
          const screenRx = rx * pvZoom;
          const screenRy = ry * pvZoom;
          g.lineStyle(1.5, previewColor, 0.9);
          g.beginFill(previewColor, 0.06);
          g.drawEllipse(cx, cy, screenRx, screenRy);
          g.endFill();
          // Center crosshair + bounding box dashes
          const { sx: ex, sy: ey } = w2s(previewPoint.x, previewPoint.y);
          g.lineStyle(1, previewColor, 0.5);
          g.moveTo(cx - 5, cy); g.lineTo(cx + 5, cy);
          g.moveTo(cx, cy - 5); g.lineTo(cx, cy + 5);
          // Semi-axis lines
          g.lineStyle(0.75, previewColor, 0.3);
          g.moveTo(cx, cy); g.lineTo(ex, cy);
          g.moveTo(cx, cy); g.lineTo(cx, ey);
          g.beginFill(previewColor, 0.8);
          g.drawCircle(cx, cy, 2.5);
          g.endFill();
        }
        return;
      }
      // Ellipse preview (edge/diameter mode) — true ellipse using native drawEllipse
      if (activeTool === 'DRAW_ELLIPSE_EDGE' && drawingPoints.length === 1 && previewPoint) {
        const p1 = drawingPoints[0];
        const cx = (p1.x + previewPoint.x) / 2;
        const cy = (p1.y + previewPoint.y) / 2;
        const rx = Math.abs(previewPoint.x - p1.x) / 2;
        const ry = Math.abs(previewPoint.y - p1.y) / 2;
        if (rx > 0 && ry > 0) {
          const pvZoom = useViewportStore.getState().zoom;
          const { sx: scx, sy: scy } = w2s(cx, cy);
          const screenRx = rx * pvZoom;
          const screenRy = ry * pvZoom;
          g.lineStyle(1.5, previewColor, 0.9);
          g.beginFill(previewColor, 0.06);
          g.drawEllipse(scx, scy, screenRx, screenRy);
          g.endFill();
          // Diagonal line from p1 to p2 (bounding box diagonal)
          const { sx: p1x, sy: p1y } = w2s(p1.x, p1.y);
          const { sx: p2x, sy: p2y } = w2s(previewPoint.x, previewPoint.y);
          g.lineStyle(0.75, previewColor, 0.3);
          g.moveTo(p1x, p1y); g.lineTo(p2x, p2y);
          // Center crosshair
          g.lineStyle(1, previewColor, 0.5);
          g.moveTo(scx - 4, scy); g.lineTo(scx + 4, scy);
          g.moveTo(scx, scy - 4); g.lineTo(scx, scy + 4);
          // Edge dots
          g.beginFill(previewColor, 0.8);
          g.drawCircle(p1x, p1y, 2.5);
          g.drawCircle(p2x, p2y, 2.5);
          g.endFill();
        }
        return;
      }
      // DRAW_RECTANGLE/CIRCLE/POLYGON with no points: show start-point indicator at cursor
      if (
        (activeTool === 'DRAW_RECTANGLE' || activeTool === 'DRAW_CIRCLE' ||
         activeTool === 'DRAW_CIRCLE_EDGE' || activeTool === 'DRAW_ELLIPSE' ||
         activeTool === 'DRAW_ELLIPSE_EDGE' ||
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
    // Update drawing rotation container pivot/rotation before rendering
    updateDrawingRotContainer();
    renderPaper();
    renderGrid();
    renderFeatures();
    renderImageFeatures();
    renderLabels();
    renderTextFeatures();
    renderSelection();
    renderSnapIndicator();
    renderToolPreview();
    renderTitleBlock();
  }

  // ─────────────────────────────────────────────
  // Hit testing
  // ─────────────────────────────────────────────
  function hitTest(sx: number, sy: number): string | null {
    // Use drawing-rotation-aware coordinate conversion
    const { wx, wy } = screenToDrawingWorld(sx, sy);
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
      // True circle hit testing
      if (geom.type === 'CIRCLE' && geom.circle) {
        const d = pointToCircleDistance({ x: wx, y: wy }, geom.circle);
        if (d <= worldTol) return feature.id;
        if (pointInCircle({ x: wx, y: wy }, geom.circle)) return feature.id;
      }
      // True ellipse hit testing
      if (geom.type === 'ELLIPSE' && geom.ellipse) {
        const d = pointToEllipseDistance({ x: wx, y: wy }, geom.ellipse);
        if (d <= worldTol) return feature.id;
        if (pointInEllipse({ x: wx, y: wy }, geom.ellipse)) return feature.id;
      }
      // Arc hit testing
      if (geom.type === 'ARC' && geom.arc) {
        const d = pointToArcDistance({ x: wx, y: wy }, geom.arc);
        if (d <= worldTol) return feature.id;
      }
      // Spline hit testing
      if (geom.type === 'SPLINE' && geom.spline) {
        const d = pointToSplineDistance({ x: wx, y: wy }, geom.spline);
        if (d <= worldTol) return feature.id;
      }
      // TEXT hit testing
      if (geom.type === 'TEXT' && geom.point) {
        const { sx: fx, sy: fy } = w2s(geom.point.x, geom.point.y);
        if (Math.hypot(sx - fx, sy - fy) <= HIT_TOLERANCE_PX * 2) {
          return feature.id;
        }
      }
      // IMAGE hit testing — point-in-bounding-box
      if (geom.type === 'IMAGE' && geom.image) {
        const img = geom.image;
        const { zoom } = useViewportStore.getState();
        const { sx: ax, sy: ay } = w2s(img.position.x, img.position.y);
        const wPx = img.width * zoom;
        const hPx = img.height * zoom;
        if (sx >= ax && sx <= ax + wPx && sy >= ay - hPx && sy <= ay) {
          return feature.id;
        }
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────
  // Hit test: Text labels
  // ─────────────────────────────────────────────
  function hitTestLabel(sx: number, sy: number): { featureId: string; labelId: string; isTextFeature: boolean; key: string } | null {
    const pixi = pixiRef.current;
    if (!pixi) return null;

    for (const [key, textObj] of pixi.labelTexts) {
      if (!textObj.visible) continue;
      const bounds = textObj.getBounds();
      if (sx >= bounds.x && sx <= bounds.x + bounds.width &&
          sy >= bounds.y && sy <= bounds.y + bounds.height) {
        if (key.startsWith('text:')) {
          const featureId = key.slice(5); // strip 'text:' prefix
          return { featureId, labelId: featureId, isTextFeature: true, key };
        }
        const [featureId, labelId] = key.split(':');
        return { featureId, labelId, isTextFeature: false, key };
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────
  // Box selection
  // ─────────────────────────────────────────────
  function boxSelectFeatures(start: Point2D, end: Point2D): string[] {
    const isWindowDrag = end.x > start.x; // left-to-right = window, right-to-left = crossing
    const { wx: minX, wy: minY } = s2w(Math.min(start.x, end.x), Math.max(start.y, end.y));
    const { wx: maxX, wy: maxY } = s2w(Math.max(start.x, end.x), Math.min(start.y, end.y));
    const selBox: BoundingBox = { minX, minY, maxX, maxY };

    const mode = drawingStore.document.settings.boxSelectMode ?? 'CROSSING_EXPAND_GROUPS';

    // Determine containment test based on mode
    const useFullContainment = mode === 'WINDOW_FULL_ONLY' || isWindowDrag;

    const matchedIds: string[] = drawingStore
      .getVisibleFeatures()
      .filter((f) => {
        const layer = drawingStore.getLayer(f.layerId);
        if (layer?.locked) return false;
        const fb = featureBounds(f);
        if (useFullContainment && mode === 'WINDOW_FULL_ONLY') {
          return boundsContains(selBox, fb);
        } else if (isWindowDrag) {
          return boundsContains(selBox, fb);
        } else {
          return boundsOverlap(selBox, fb);
        }
      })
      .map((f) => f.id);

    // Group expansion: when CROSSING_EXPAND_GROUPS, expand selection to include
    // all members of any polyline/polygon group OR feature group that has at least one selected member
    if (mode === 'CROSSING_EXPAND_GROUPS' && matchedIds.length > 0) {
      const polylineGroupIds = new Set<string>();
      const featureGroupIds  = new Set<string>();
      for (const id of matchedIds) {
        const f = drawingStore.getFeature(id);
        const pgid = f?.properties?.polylineGroupId as string | undefined;
        if (pgid) polylineGroupIds.add(pgid);
        if (f?.featureGroupId) featureGroupIds.add(f.featureGroupId);
      }
      if (polylineGroupIds.size > 0 || featureGroupIds.size > 0) {
        const expanded = new Set(matchedIds);
        for (const f of drawingStore.getVisibleFeatures()) {
          const pgid = f.properties?.polylineGroupId as string | undefined;
          if (pgid && polylineGroupIds.has(pgid)) {
            const layer = drawingStore.getLayer(f.layerId);
            if (!layer?.locked) expanded.add(f.id);
          }
          if (f.featureGroupId && featureGroupIds.has(f.featureGroupId)) {
            const layer = drawingStore.getLayer(f.layerId);
            if (!layer?.locked) expanded.add(f.id);
          }
        }
        return Array.from(expanded);
      }
    }

    // WINDOW_FULL_ONLY: also expand to full groups, but only if ALL group members are enclosed
    if (mode === 'WINDOW_FULL_ONLY' && matchedIds.length > 0) {
      const matchedSet = new Set(matchedIds);
      const polylineGroupIds = new Set<string>();
      const featureGroupIds  = new Set<string>();
      for (const id of matchedIds) {
        const f = drawingStore.getFeature(id);
        const pgid = f?.properties?.polylineGroupId as string | undefined;
        if (pgid) polylineGroupIds.add(pgid);
        if (f?.featureGroupId) featureGroupIds.add(f.featureGroupId);
      }
      // For each polyline group, check if ALL members are in the box
      if (polylineGroupIds.size > 0) {
        for (const gid of polylineGroupIds) {
          const groupMembers = drawingStore.getVisibleFeatures().filter(
            (f) => f.properties?.polylineGroupId === gid
          );
          const allInBox = groupMembers.every((f) => matchedSet.has(f.id));
          if (!allInBox) {
            for (const f of groupMembers) matchedSet.delete(f.id);
          }
        }
      }
      // For each feature group, check if ALL members are in the box
      if (featureGroupIds.size > 0) {
        for (const gid of featureGroupIds) {
          const group = drawingStore.getFeatureGroup(gid);
          const groupMembers = (group?.featureIds ?? []).map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
          const allInBox = groupMembers.every((f) => matchedSet.has(f.id));
          if (!allInBox) {
            for (const f of groupMembers) matchedSet.delete(f.id);
          }
        }
      }
      if (polylineGroupIds.size > 0 || featureGroupIds.size > 0) return Array.from(matchedSet);
    }

    return matchedIds;
  }

  // ─────────────────────────────────────────────
  // Create feature helper
  // ─────────────────────────────────────────────
  function createFeature(type: FeatureType, points: Point2D[]): Feature | null {
    const { activeLayerId, getActiveLayerStyle } = drawingStore;
    const layerStyle = getActiveLayerStyle();
    const mergedStyle = { ...DEFAULT_FEATURE_STYLE, ...layerStyle };
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
          style: mergedStyle,
          properties: {},
        };
      case 'LINE': {
        if (points.length < 2) return null;
        const { azimuth: lineAzimuth, distance: lineDist } = inverseBearingDistance(points[0], points[1]);
        return {
          id,
          type: 'LINE',
          geometry: { type: 'LINE', start: points[0], end: points[1] },
          layerId: activeLayerId,
          style,
          properties: {
            azimuth: lineAzimuth,
            distance: lineDist,
          },
        };
      }
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
          style: mergedStyle,
          properties: {},
        };
      case 'CIRCLE':
      case 'ELLIPSE':
      case 'ARC':
      case 'SPLINE':
        // These types are created directly in their tool handlers with parametric geometry
        return null;
      default:
        return null;
    }
  }

  // ─────────────────────────────────────────────
  // Helper: attach auto-generated labels to a feature based on layer preferences
  // ─────────────────────────────────────────────
  function withAutoLabels(feature: Feature): Feature {
    const doc = useDrawingStore.getState().document;
    const layer = doc.layers[feature.layerId];
    if (!layer) return feature;
    const displayPrefs = doc.settings.displayPreferences;
    const labels = generateLabelsForFeature(feature, layer, displayPrefs);
    if (labels.length === 0) return feature;
    return { ...feature, textLabels: labels };
  }

  // ─────────────────────────────────────────────
  // Commit a TEXT feature placed via DRAW_TEXT tool
  // ─────────────────────────────────────────────
  function commitTextFeature(text: string, wx: number, wy: number) {
    if (!text.trim()) return;
    const { activeLayerId, getActiveLayerStyle } = drawingStore;
    const layerStyle = getActiveLayerStyle();
    const feature: Feature = {
      id: generateId(),
      type: 'TEXT',
      geometry: {
        type: 'TEXT',
        point: { x: wx, y: wy },
        textContent: text,
        textRotation: 0,
      },
      layerId: activeLayerId,
      style: {
        ...DEFAULT_FEATURE_STYLE,
        ...layerStyle,
      },
      properties: {
        fontSize: 12,
        fontFamily: 'Arial',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
      },
    };
    drawingStore.addFeature(feature);
    undoStore.pushUndo(makeAddFeatureEntry(feature));
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
    const { azimuth: segAzimuth, distance: segDist } = inverseBearingDistance(start, end);
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
      properties: {
        polylineGroupId: groupId,
        azimuth: segAzimuth,
        distance: segDist,
      },
    };
  }

  function finishFeature(type: FeatureType, overridePoints?: Point2D[]) {
    // IMPORTANT: use getState() to read the LIVE store state, not the stale
    // React snapshot captured during the render cycle.  Without this, points
    // added via addDrawingPoint() in the same event handler won't be visible.
    const drawingPoints = overridePoints ?? useToolStore.getState().state.drawingPoints;

    if (type === 'POLYLINE') {
      // Polyline: already created as individual LINE segments during drawing.
      // Just reset drawing state; undo is already recorded per segment.
      polylineGroupIdRef.current = null;
      lastPolylineSegmentIdRef.current = null;
      toolStore.clearDrawingPoints();
      return;
    }

    // SPLINE: convert fit points to cubic bezier control points
    if (type === 'SPLINE') {
      if (drawingPoints.length < 2) {
        toolStore.clearDrawingPoints();
        return;
      }
      const controlPoints = fitPointsToBezier(drawingPoints, false);
      const { activeLayerId, getActiveLayerStyle } = drawingStore;
      const layerStyle = getActiveLayerStyle();
      const ds = useToolStore.getState().state.drawStyle;
      const feature: Feature = {
        id: generateId(),
        type: 'SPLINE',
        geometry: {
          type: 'SPLINE',
          spline: { controlPoints, isClosed: false },
        },
        layerId: activeLayerId,
        style: {
          ...DEFAULT_FEATURE_STYLE,
          ...layerStyle,
          ...(ds.color != null ? { color: ds.color } : {}),
          ...(ds.lineWeight != null ? { lineWeight: ds.lineWeight } : {}),
          ...(ds.opacity != null ? { opacity: ds.opacity } : {}),
          ...(ds.lineType !== 'SOLID' ? { lineTypeId: ds.lineType } : {}),
        },
        properties: {},
      };
      const labelledFeature = withAutoLabels(feature);
      drawingStore.addFeature(labelledFeature);
      undoStore.pushUndo(makeAddFeatureEntry(labelledFeature));
      toolStore.clearDrawingPoints();
      return;
    }

    const feature = createFeature(type, drawingPoints);
    if (!feature) return;
    const labelledFeature = withAutoLabels(feature);
    drawingStore.addFeature(labelledFeature);
    undoStore.pushUndo(makeAddFeatureEntry(labelledFeature));
    toolStore.clearDrawingPoints();
  }

  /** Finish a control-point spline (raw control points used directly). */
  function finishControlPointSpline() {
    const drawingPoints = useToolStore.getState().state.drawingPoints;
    if (drawingPoints.length < 4) {
      toolStore.clearDrawingPoints();
      return;
    }
    // Pad to a multiple of 3 + 1 if needed (trim extra points)
    const usable = Math.floor((drawingPoints.length - 1) / 3) * 3 + 1;
    const controlPoints = drawingPoints.slice(0, usable);
    const { activeLayerId, getActiveLayerStyle } = drawingStore;
    const layerStyle = getActiveLayerStyle();
    const ds = useToolStore.getState().state.drawStyle;
    const feature: Feature = {
      id: generateId(),
      type: 'SPLINE',
      geometry: {
        type: 'SPLINE',
        spline: { controlPoints, isClosed: false },
      },
      layerId: activeLayerId,
      style: {
        ...DEFAULT_FEATURE_STYLE,
        ...layerStyle,
        ...(ds.color != null ? { color: ds.color } : {}),
        ...(ds.lineWeight != null ? { lineWeight: ds.lineWeight } : {}),
        ...(ds.opacity != null ? { opacity: ds.opacity } : {}),
        ...(ds.lineType !== 'SOLID' ? { lineTypeId: ds.lineType } : {}),
      },
      properties: {},
    };
    const labelledFeature = withAutoLabels(feature);
    drawingStore.addFeature(labelledFeature);
    undoStore.pushUndo(makeAddFeatureEntry(labelledFeature));
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
    // Use rotation-aware coordinate conversion
    const { wx, wy } = screenToDrawingWorld(sx, sy);
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
  function hitTestGrip(sx: number, sy: number): { featureId: string; vertexIndex: number; gripType?: 'SPLINE_FIT' | 'SPLINE_HANDLE' } | null {
    const { selectedIds } = selectionStore;
    const gripHitSize = (drawingStore.document.settings.gripSize ?? 6) + 2;
    for (const featureId of selectedIds) {
      const feature = drawingStore.getFeature(featureId);
      if (!feature) continue;

      // Specialized grip hit test for SPLINE features
      if (feature.geometry.type === 'SPLINE' && feature.geometry.spline && feature.geometry.spline.controlPoints.length >= 4) {
        const cp = feature.geometry.spline.controlPoints;
        // Test all control points — identify if it's a fit point or handle endpoint
        for (let i = 0; i < cp.length; i++) {
          const { sx: gx, sy: gy } = w2s(cp[i].x, cp[i].y);
          if (Math.abs(sx - gx) <= gripHitSize && Math.abs(sy - gy) <= gripHitSize) {
            const isFitPoint = i % 3 === 0;
            return { featureId, vertexIndex: i, gripType: isFitPoint ? 'SPLINE_FIT' : 'SPLINE_HANDLE' };
          }
        }
        continue;
      }

      const verts = getFeatureVertices(feature);
      for (let i = 0; i < verts.length; i++) {
        const { sx: gx, sy: gy } = w2s(verts[i].x, verts[i].y);
        if (Math.abs(sx - gx) <= gripHitSize && Math.abs(sy - gy) <= gripHitSize) {
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

      // Commit interactive rotate/scale on left-click
      if (interactiveOpRef.current) {
        const op = interactiveOpRef.current;
        const { wx: curWx, wy: curWy } = screenToDrawingWorld(sx, sy);
        const cursorVec = { x: curWx - op.pivot.x, y: curWy - op.pivot.y };
        const ops: { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[] = [];

        if (op.type === 'ROTATE') {
          const currentAngle = Math.atan2(cursorVec.y, cursorVec.x);
          const deltaAngle = currentAngle - op.baseAngle;
          for (const [id, orig] of op.originals) {
            const after = drawingStore.getFeature(id);
            if (after) ops.push({ type: 'MODIFY_FEATURE', data: { id, before: orig, after } });
          }
          if (ops.length > 0) {
            const deg = ((deltaAngle * 180) / Math.PI).toFixed(1);
            undoStore.pushUndo(makeBatchEntry(`Rotate ${deg}°`, ops));
          }
        } else {
          const curDist = Math.hypot(cursorVec.x, cursorVec.y);
          const factor = op.baseDist > 0 ? curDist / op.baseDist : 1;
          for (const [id, orig] of op.originals) {
            const after = drawingStore.getFeature(id);
            if (after) ops.push({ type: 'MODIFY_FEATURE', data: { id, before: orig, after } });
          }
          if (ops.length > 0) {
            undoStore.pushUndo(makeBatchEntry(`Scale ×${factor.toFixed(3)}`, ops));
          }
        }
        interactiveOpRef.current = null;
        setInteractivePanel(null);
        setCursorStyle(TOOL_CURSORS[activeTool] ?? 'default');
        return;
      }

      const worldPt = getSnappedWorld(sx, sy);

      // ── Title-block overlay element drag (SELECT mode) ──────────────
      if (activeTool === 'SELECT') {
        const tbHit = hitTestTBElement(sx, sy);
        if (tbHit) {
          const doc        = useDrawingStore.getState().document;
          const tb         = doc.settings.titleBlock;
          const { zoom }   = useViewportStore.getState();
          const ds         = doc.settings.drawingScale ?? 50;
          const inchToPx   = zoom * ds;
          let [pw, ph] = PAPER_SIZE_MAP[doc.settings.paperSize ?? 'TABLOID'] ?? [11, 17];
          if (doc.settings.paperOrientation === 'LANDSCAPE') [pw, ph] = [ph, pw];
          const tl = w2s(0, ph * ds);
          const br = w2s(pw * ds, 0);
          const margin = 0.1 * inchToPx;

          // Compute current paper-inch BL position of the element
          let origPosX = 0;
          let origPosY = 0;
          if (tbHit === 'northArrow') {
            const northArrowSizeIn  = tb?.northArrowSizeIn ?? 1.5;
            const naRadiusPxD       = northArrowSizeIn * inchToPx * 0.44;
            const naTotalHD         = naRadiusPxD * 2.78; // NA_ELEM_TOTAL_H equivalent
            const naElemWD          = naRadiusPxD * 2.0;
            if (tb?.northArrowPos) {
              origPosX = tb.northArrowPos.x;
              origPosY = tb.northArrowPos.y;
            } else {
              origPosX = (br.sx - margin - naElemWD - tl.sx) / inchToPx;
              origPosY = (br.sy - (tl.sy + margin + naTotalHD)) / inchToPx;
            }
          } else if (tbHit === 'titleBlock') {
            const tbWInD = Math.min(5.5, pw * 0.47);
            const tbHInD = Math.min(2.2, tbWInD * 0.42);
            const tbWD   = tbWInD * inchToPx;
            const tbHD   = tbHInD * inchToPx;
            if (tb?.titleBlockPos) {
              origPosX = tb.titleBlockPos.x;
              origPosY = tb.titleBlockPos.y;
            } else {
              origPosX = (br.sx - margin - tbWD - tl.sx) / inchToPx;
              origPosY = margin / inchToPx;
            }
          } else if (tbHit === 'scaleBar') {
            if (tb?.scaleBarPos) {
              origPosX = tb.scaleBarPos.x;
              origPosY = tb.scaleBarPos.y;
            } else {
              const sigWIn = Math.min(2.8, pw * 0.27);
              origPosX = sigWIn + 0.20 + margin / inchToPx;  // sig width + innerGap
              origPosY = margin / inchToPx;
            }
          } else if (tbHit === 'signatureBlock') {
            if (tb?.signatureBlockPos) {
              origPosX = tb.signatureBlockPos.x;
              origPosY = tb.signatureBlockPos.y;
            } else {
              // Read from last-rendered bounds (accounts for any signatureBlockPos offset)
              const b = tbBoundsRef.current.signatureBlock;
              if (b) {
                origPosX = (b.screenX - tl.sx) / inchToPx;
                origPosY = (br.sy - b.screenY - b.h) / inchToPx;
              }
            }
          } else if (tbHit === 'officialSealLabel') {
            if (tb?.officialSealLabelPos) {
              origPosX = tb.officialSealLabelPos.x;
              origPosY = tb.officialSealLabelPos.y;
            } else {
              // officialSeal is center-anchored horizontally; center = b.screenX + b.w/2
              const b = tbBoundsRef.current.officialSealLabel;
              if (b) {
                origPosX = (b.screenX + b.w / 2 - tl.sx) / inchToPx;
                origPosY = (br.sy - (b.screenY + 4)) / inchToPx;
              }
            }
          }

          tbDragRef.current = {
            element: tbHit, startSX: sx, startSY: sy,
            origPosX, origPosY, livePosX: origPosX, livePosY: origPosY,
          };
          // Mark this TB element as "selected" so LayerPanel keeps SURVEY-INFO highlighted
          selectionStore.setSelectedTBElem(tbHit);
          setCursorStyle('grabbing');
          return;
        }
      }
      // Clicking outside all TB elements clears TB selection
      selectionStore.setSelectedTBElem(null);

      // Check grip first (when SELECT tool active and something selected)
      if (activeTool === 'SELECT' && selectionStore.selectedIds.size > 0) {
        const grip = hitTestGrip(sx, sy);
        if (grip) {
          const gType = grip.gripType === 'SPLINE_FIT' ? 'SPLINE_FIT'
            : grip.gripType === 'SPLINE_HANDLE' ? 'SPLINE_HANDLE'
            : 'VERTEX';
          gripDragRef.current = { featureId: grip.featureId, vertexIndex: grip.vertexIndex, type: gType };
          gripStartRef.current = drawingStore.getFeature(grip.featureId) ?? null;
          return;
        }
      }

      switch (activeTool) {
        case 'SELECT': {
          // We've confirmed no TB element was hit (those return early above), so clear TB selection
          selectionStore.setSelectedTBElem(null);
          // Check label hit first — labels are on top of features visually
          const labelHit = hitTestLabel(sx, sy);
          if (labelHit) {
            if (labelHit.isTextFeature) {
              // TEXT feature — select it and start drag-to-move
              const textFeature = drawingStore.getFeature(labelHit.featureId);
              if (textFeature) {
                selectionStore.select(labelHit.featureId, e.shiftKey ? 'TOGGLE' : 'REPLACE');
                const startWorld = screenToDrawingWorld(sx, sy);
                const originals = new Map<string, Feature>();
                originals.set(labelHit.featureId, JSON.parse(JSON.stringify(textFeature)));
                dragFeatureRef.current = {
                  featureIds: [labelHit.featureId],
                  startWorld: { x: startWorld.wx, y: startWorld.wy },
                  originals,
                };
                setCursorStyle('grabbing');
                return;
              }
            } else {
              // Regular feature text label — drag offset
              const feature = drawingStore.getFeature(labelHit.featureId);
              const label = feature?.textLabels?.find((l) => l.id === labelHit.labelId);
              if (feature && label) {
                const { wx, wy } = screenToDrawingWorld(sx, sy);
                labelDragRef.current = {
                  featureId: labelHit.featureId,
                  labelId: labelHit.labelId,
                  startWorld: { x: wx, y: wy },
                  startOffset: { ...label.offset },
                };
                setCursorStyle('grabbing');
                return;
              }
            }
          }

          const hit = hitTest(sx, sy);
          if (hit) {
            clickHitFeatureRef.current = true;
            const hitFeature = drawingStore.getFeature(hit);
            const polylineGid = hitFeature?.properties?.polylineGroupId as string | undefined;
            const featureGid  = hitFeature?.featureGroupId ?? undefined;
            const groupMode = drawingStore.document.settings.groupSelectMode ?? 'GROUP_FIRST';
            let featureIds: string[];

            if (polylineGid && !e.shiftKey) {
              if (groupMode === 'GROUP_FIRST') {
                // GROUP_FIRST: first click selects entire group.
                // If the group is already selected, clicking a specific segment
                // narrows selection to just that segment (drill-down behavior).
                const groupIds = getPolylineGroupIds(polylineGid);
                const allGroupSelected = groupIds.every((id) => selectionStore.selectedIds.has(id));
                if (allGroupSelected) {
                  // Already selected whole group — drill down to individual segment
                  selectionStore.select(hit, 'REPLACE');
                  featureIds = [hit];
                } else {
                  // Select entire group
                  featureIds = groupIds;
                  selectionStore.selectMultiple(featureIds, 'REPLACE');
                }
              } else {
                // ELEMENT_FIRST: first click selects individual segment only.
                // User can right-click > "Select Group" to get the whole group.
                const mode = e.shiftKey ? 'TOGGLE' : 'REPLACE';
                selectionStore.select(hit, mode);
                featureIds = [hit];
              }
            } else if (featureGid && !e.shiftKey && groupMode === 'GROUP_FIRST') {
              // Feature group (named group): same GROUP_FIRST drill-down behavior.
              const group = drawingStore.getFeatureGroup(featureGid);
              const groupMemberIds = group?.featureIds ?? [];
              const allGroupSelected = groupMemberIds.length > 0 &&
                groupMemberIds.every((id) => selectionStore.selectedIds.has(id));
              if (allGroupSelected) {
                selectionStore.select(hit, 'REPLACE');
                featureIds = [hit];
              } else {
                featureIds = groupMemberIds.filter((id) => !!drawingStore.getFeature(id));
                selectionStore.selectMultiple(featureIds, 'REPLACE');
              }
            } else {
              const mode = e.shiftKey ? 'TOGGLE' : 'REPLACE';
              selectionStore.select(hit, mode);
              featureIds = [hit];
            }

            // Start drag-to-move: store original positions for undo
            const startWorld = screenToDrawingWorld(sx, sy);
            const originals = new Map<string, Feature>();
            for (const id of featureIds) {
              const f = drawingStore.getFeature(id);
              if (f) originals.set(id, JSON.parse(JSON.stringify(f)));
            }
            dragFeatureRef.current = {
              featureIds,
              startWorld: { x: startWorld.wx, y: startWorld.wy },
              originals,
            };
            setCursorStyle('grabbing');
            toolStore.setBoxSelect(null, null, false);
          } else {
            clickHitFeatureRef.current = false;
            // Click on empty canvas: start canvas pan (drag to shift view)
            if (!e.shiftKey) {
              selectPanRef.current = true;
              isPanningRef.current = true;
              setCursorStyle('grabbing');
            } else {
              // Shift+click on empty: start box selection
              toolStore.setBoxSelect({ x: sx, y: sy }, { x: sx, y: sy }, true);
            }
          }
          break;
        }

        case 'BOX_SELECT': {
          // Dedicated box selection tool: always start box selection on mousedown
          clickHitFeatureRef.current = false;
          toolStore.setBoxSelect({ x: sx, y: sy }, { x: sx, y: sy }, true);
          break;
        }

        case 'DRAW_POINT': {
          const feature = createFeature('POINT', [worldPt]);
          if (feature) {
            const labelledFeature = withAutoLabels(feature);
            drawingStore.addFeature(labelledFeature);
            undoStore.pushUndo(makeAddFeatureEntry(labelledFeature));
          }
          break;
        }

        case 'DRAW_LINE': {
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt);
          } else {
            // Pass both points directly to avoid stale-snapshot issues —
            // addDrawingPoint updates the Zustand store, but the React
            // snapshot (toolStore.state) won't reflect it until re-render.
            const linePoints = [toolState.drawingPoints[0], worldPt];
            finishFeature('LINE', linePoints);
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
              drawingStore.addFeature(withAutoLabels(segment));
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
            drawingStore.addFeature(withAutoLabels(feature));
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
            drawingStore.addFeature(withAutoLabels(feature));
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
            // True circle: store parametric data, no polygon vertices
            const feature: Feature = {
              id: generateId(),
              type: 'CIRCLE',
              geometry: {
                type: 'CIRCLE',
                circle: { center: { ...center }, radius },
              },
              layerId: drawingStore.activeLayerId,
              style: { ...DEFAULT_FEATURE_STYLE, ...drawingStore.getActiveLayerStyle() },
              properties: { shapeType: 'CIRCLE' },
            };
            drawingStore.addFeature(withAutoLabels(feature));
            undoStore.pushUndo(makeAddFeatureEntry(feature));
            toolStore.clearDrawingPoints();
          }
          break;
        }

        case 'DRAW_CIRCLE_EDGE': {
          // Edge/diameter mode: first click sets a point on the circle edge,
          // second click sets the diametrically opposite point.
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt); // first edge point
          } else {
            const p1 = toolState.drawingPoints[0];
            const diameter = Math.hypot(worldPt.x - p1.x, worldPt.y - p1.y);
            const radius = diameter / 2;
            if (radius < MIN_SEGMENT_LENGTH_BASE) { toolStore.clearDrawingPoints(); break; }
            const center = { x: (p1.x + worldPt.x) / 2, y: (p1.y + worldPt.y) / 2 };
            // True circle: store parametric data, no polygon vertices
            const feature: Feature = {
              id: generateId(),
              type: 'CIRCLE',
              geometry: {
                type: 'CIRCLE',
                circle: { center, radius },
              },
              layerId: drawingStore.activeLayerId,
              style: { ...DEFAULT_FEATURE_STYLE, ...drawingStore.getActiveLayerStyle() },
              properties: { shapeType: 'CIRCLE' },
            };
            drawingStore.addFeature(withAutoLabels(feature));
            undoStore.pushUndo(makeAddFeatureEntry(feature));
            toolStore.clearDrawingPoints();
          }
          break;
        }

        case 'DRAW_ELLIPSE': {
          // Center mode: first click sets the center, second click sets the corner of the bounding box.
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt); // center
          } else {
            const center = toolState.drawingPoints[0];
            const radiusX = Math.abs(worldPt.x - center.x);
            const radiusY = Math.abs(worldPt.y - center.y);
            if (radiusX < MIN_SEGMENT_LENGTH_BASE || radiusY < MIN_SEGMENT_LENGTH_BASE) {
              toolStore.clearDrawingPoints(); break;
            }
            // True ellipse: store parametric data, no polygon vertices
            const feature: Feature = {
              id: generateId(),
              type: 'ELLIPSE',
              geometry: {
                type: 'ELLIPSE',
                ellipse: { center: { ...center }, radiusX, radiusY, rotation: 0 },
              },
              layerId: drawingStore.activeLayerId,
              style: { ...DEFAULT_FEATURE_STYLE, ...drawingStore.getActiveLayerStyle() },
              properties: { shapeType: 'ELLIPSE' },
            };
            drawingStore.addFeature(withAutoLabels(feature));
            undoStore.pushUndo(makeAddFeatureEntry(feature));
            toolStore.clearDrawingPoints();
          }
          break;
        }

        case 'DRAW_ELLIPSE_EDGE': {
          // Edge mode: first click sets one corner of the bounding box,
          // second click sets the diametrically opposite corner.
          if (toolState.drawingPoints.length === 0) {
            toolStore.addDrawingPoint(worldPt); // first corner
          } else {
            const p1 = toolState.drawingPoints[0];
            const radiusX = Math.abs(worldPt.x - p1.x) / 2;
            const radiusY = Math.abs(worldPt.y - p1.y) / 2;
            if (radiusX < MIN_SEGMENT_LENGTH_BASE || radiusY < MIN_SEGMENT_LENGTH_BASE) {
              toolStore.clearDrawingPoints(); break;
            }
            const center = { x: (p1.x + worldPt.x) / 2, y: (p1.y + worldPt.y) / 2 };
            // True ellipse: store parametric data, no polygon vertices
            const feature: Feature = {
              id: generateId(),
              type: 'ELLIPSE',
              geometry: {
                type: 'ELLIPSE',
                ellipse: { center, radiusX, radiusY, rotation: 0 },
              },
              layerId: drawingStore.activeLayerId,
              style: { ...DEFAULT_FEATURE_STYLE, ...drawingStore.getActiveLayerStyle() },
              properties: { shapeType: 'ELLIPSE' },
            };
            drawingStore.addFeature(withAutoLabels(feature));
            undoStore.pushUndo(makeAddFeatureEntry(feature));
            toolStore.clearDrawingPoints();
          }
          break;
        }

        case 'DRAW_CURVED_LINE':
        case 'DRAW_SPLINE_FIT': {
          // Curved line / Spline fit-point tool: each click adds a fit point.
          // On finish, the fit points are converted to cubic bezier control points.
          toolStore.addDrawingPoint(worldPt);
          break;
        }

        case 'DRAW_SPLINE_CONTROL': {
          // Control-point spline: each click adds a raw control point.
          // Points are used directly as cubic bezier control points (groups of 4).
          toolStore.addDrawingPoint(worldPt);
          break;
        }

        case 'DRAW_TEXT': {
          // Show inline text input at click position
          setTextInputState({ sx, sy, wx: worldPt.x, wy: worldPt.y });
          break;
        }

        case 'DRAW_IMAGE': {
          // Open image insert dialog at the clicked world position
          setImageInsertState({ wx: worldPt.x, wy: worldPt.y });
          break;
        }

        case 'DRAW_ARC': {
          // 3-point arc: click start point, mid-arc point, end point
          if (toolState.drawingPoints.length < 2) {
            toolStore.addDrawingPoint(worldPt);
          } else {
            const p1 = toolState.drawingPoints[0];
            const p2 = toolState.drawingPoints[1];
            const p3 = worldPt;
            const arcGeom = arcFrom3Points(p1, p2, p3);
            if (arcGeom && arcGeom.radius > MIN_SEGMENT_LENGTH_BASE) {
              const { activeLayerId, getActiveLayerStyle } = drawingStore;
              const layerStyle = getActiveLayerStyle();
              const feature: Feature = {
                id: generateId(),
                type: 'ARC',
                geometry: { type: 'ARC', arc: arcGeom },
                layerId: activeLayerId,
                style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
                properties: {},
              };
              drawingStore.addFeature(withAutoLabels(feature));
              undoStore.pushUndo(makeAddFeatureEntry(feature));
            }
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
        const panMult = drawingStore.document.settings.panSpeed ?? 1.0;
        const dx = (sx - lastMouseRef.current.x) * panMult;
        const dy = (sy - lastMouseRef.current.y) * panMult;
        viewportStore.pan(dx, dy);
      }

      lastMouseRef.current = { x: sx, y: sy };

      const worldPt = getSnappedWorld(sx, sy);

      // Label drag update
      if (labelDragRef.current) {
        const { featureId, labelId, startWorld, startOffset } = labelDragRef.current;
        const { wx, wy } = screenToDrawingWorld(sx, sy);
        const dx = wx - startWorld.x;
        const dy = wy - startWorld.y;
        drawingStore.updateTextLabel(featureId, labelId, {
          offset: { x: startOffset.x + dx, y: startOffset.y + dy },
          userPositioned: true,
        });
        return;
      }

      // Title-block overlay element drag update
      if (tbDragRef.current) {
        const tbDrag = tbDragRef.current;
        const { zoom }  = useViewportStore.getState();
        const doc       = useDrawingStore.getState().document;
        const inchToPx  = zoom * (doc.settings.drawingScale ?? 50);
        const dScreenX  = sx - tbDrag.startSX;
        const dScreenY  = sy - tbDrag.startSY;
        // Screen right → paper right; screen down → paper BL-y decreases
        tbDrag.livePosX = tbDrag.origPosX + dScreenX / inchToPx;
        tbDrag.livePosY = tbDrag.origPosY - dScreenY / inchToPx;
        setCursorStyle('grabbing');
        return;
      }

      // Interactive rotate/scale preview — cursor drives the transformation
      if (interactiveOpRef.current) {
        const op = interactiveOpRef.current;
        const { wx: curWx, wy: curWy } = screenToDrawingWorld(sx, sy);
        const cursorVec = { x: curWx - op.pivot.x, y: curWy - op.pivot.y };

        if (op.type === 'ROTATE') {
          const currentAngle = Math.atan2(cursorVec.y, cursorVec.x);
          const deltaAngle = currentAngle - op.baseAngle;
          for (const [id, orig] of op.originals) {
            const newF = transformFeature(orig, (p) => rotate(p, op.pivot, deltaAngle));
            drawingStore.updateFeatureGeometry(id, newF.geometry);
          }
          const deg = (deltaAngle * 180) / Math.PI;
          setInteractivePanel((prev) =>
            prev ? { ...prev, currentAngleDeg: deg } : { type: 'ROTATE', currentAngleDeg: deg, currentFactor: 1 }
          );
        } else {
          const curDist = Math.hypot(cursorVec.x, cursorVec.y);
          const factor = op.baseDist > 0 ? curDist / op.baseDist : 1;
          for (const [id, orig] of op.originals) {
            const newF = transformFeature(orig, (p) => scale(p, op.pivot, factor));
            drawingStore.updateFeatureGeometry(id, newF.geometry);
          }
          setInteractivePanel((prev) =>
            prev ? { ...prev, currentFactor: factor } : { type: 'SCALE', currentAngleDeg: 0, currentFactor: factor }
          );
        }
        setCursorStyle('crosshair');
        return;
      }

      // Grip drag update
      if (gripDragRef.current) {
        const { featureId, vertexIndex } = gripDragRef.current;
        const feature = drawingStore.getFeature(featureId);
        if (feature) {
          const geom = { ...feature.geometry };
          switch (geom.type) {
            case 'IMAGE': {
              // IMAGE resize: 8 grips — 0=BL, 1=BR, 2=TR, 3=TL, 4=Bottom-mid, 5=Right-mid, 6=Top-mid, 7=Left-mid
              if (geom.image) {
                const img = { ...geom.image };
                const origRight = img.position.x + img.width;
                const origTop = img.position.y + img.height;
                // Shift-key constrains proportions (handled client side — check event modifier)
                switch (vertexIndex) {
                  case 0: // BL — moves left and bottom
                    img.width = origRight - worldPt.x;
                    img.height = origTop - worldPt.y;
                    img.position = { x: worldPt.x, y: worldPt.y };
                    break;
                  case 1: // BR — moves right and bottom
                    img.width = worldPt.x - img.position.x;
                    img.height = origTop - worldPt.y;
                    img.position = { x: img.position.x, y: worldPt.y };
                    break;
                  case 2: // TR — moves right and top
                    img.width = worldPt.x - img.position.x;
                    img.height = worldPt.y - img.position.y;
                    break;
                  case 3: // TL — moves left and top
                    img.width = origRight - worldPt.x;
                    img.height = worldPt.y - img.position.y;
                    img.position = { x: worldPt.x, y: img.position.y };
                    break;
                  case 4: // Bottom-mid — moves bottom
                    img.height = origTop - worldPt.y;
                    img.position = { x: img.position.x, y: worldPt.y };
                    break;
                  case 5: // Right-mid — moves right
                    img.width = worldPt.x - img.position.x;
                    break;
                  case 6: // Top-mid — moves top
                    img.height = worldPt.y - img.position.y;
                    break;
                  case 7: // Left-mid — moves left
                    img.width = origRight - worldPt.x;
                    img.position = { x: worldPt.x, y: img.position.y };
                    break;
                }
                // Enforce minimum size
                img.width  = Math.max(img.width,  0.1);
                img.height = Math.max(img.height, 0.1);
                geom.image = img;
              }
              break;
            }
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
            case 'CIRCLE': {
              if (geom.circle) {
                const c = { ...geom.circle };
                if (vertexIndex === 0) {
                  // Dragging center: move the whole circle
                  c.center = worldPt;
                } else {
                  // Dragging a cardinal point: adjust radius
                  c.radius = Math.hypot(worldPt.x - c.center.x, worldPt.y - c.center.y);
                }
                geom.circle = c;
              }
              break;
            }
            case 'ELLIPSE': {
              if (geom.ellipse) {
                const e = { ...geom.ellipse };
                if (vertexIndex === 0) {
                  // Dragging center: move the whole ellipse
                  e.center = worldPt;
                } else if (vertexIndex === 1 || vertexIndex === 3) {
                  // Dragging X-axis endpoints: adjust radiusX
                  const cosR = Math.cos(-e.rotation);
                  const sinR = Math.sin(-e.rotation);
                  const dx = worldPt.x - e.center.x;
                  const dy = worldPt.y - e.center.y;
                  const localX = dx * cosR - dy * sinR;
                  e.radiusX = Math.max(0.01, Math.abs(localX));
                } else {
                  // Dragging Y-axis endpoints: adjust radiusY
                  const cosR = Math.cos(-e.rotation);
                  const sinR = Math.sin(-e.rotation);
                  const dx = worldPt.x - e.center.x;
                  const dy = worldPt.y - e.center.y;
                  const localY = dx * sinR + dy * cosR;
                  e.radiusY = Math.max(0.01, Math.abs(localY));
                }
                geom.ellipse = e;
              }
              break;
            }
            case 'ARC': {
              if (geom.arc) {
                const a = { ...geom.arc };
                if (vertexIndex === 0) {
                  // Dragging center: move the whole arc
                  a.center = worldPt;
                } else if (vertexIndex === 1) {
                  // Dragging start point: adjust startAngle and radius
                  a.radius = Math.hypot(worldPt.x - a.center.x, worldPt.y - a.center.y);
                  a.startAngle = Math.atan2(worldPt.y - a.center.y, worldPt.x - a.center.x);
                } else if (vertexIndex === 3) {
                  // Dragging end point: adjust endAngle and radius
                  a.radius = Math.hypot(worldPt.x - a.center.x, worldPt.y - a.center.y);
                  a.endAngle = Math.atan2(worldPt.y - a.center.y, worldPt.x - a.center.x);
                } else if (vertexIndex === 2) {
                  // Dragging mid point: adjust radius
                  a.radius = Math.hypot(worldPt.x - a.center.x, worldPt.y - a.center.y);
                }
                geom.arc = a;
              }
              break;
            }
            case 'SPLINE': {
              if (geom.spline) {
                const s = { ...geom.spline, controlPoints: [...geom.spline.controlPoints] };
                const dragType = gripDragRef.current?.type;
                if (dragType === 'SPLINE_FIT') {
                  // Dragging a fit point (on-curve point at index i*3):
                  // Move the fit point and its adjacent handles by the same delta
                  const oldPt = s.controlPoints[vertexIndex];
                  const dx = worldPt.x - oldPt.x;
                  const dy = worldPt.y - oldPt.y;
                  s.controlPoints[vertexIndex] = worldPt;
                  // Move adjacent left handle
                  if (vertexIndex > 0) {
                    const lh = s.controlPoints[vertexIndex - 1];
                    s.controlPoints[vertexIndex - 1] = { x: lh.x + dx, y: lh.y + dy };
                  }
                  // Move adjacent right handle
                  if (vertexIndex + 1 < s.controlPoints.length) {
                    const rh = s.controlPoints[vertexIndex + 1];
                    s.controlPoints[vertexIndex + 1] = { x: rh.x + dx, y: rh.y + dy };
                  }
                } else if (vertexIndex >= 0 && vertexIndex < s.controlPoints.length) {
                  // Dragging a handle endpoint: just move that control point
                  s.controlPoints[vertexIndex] = worldPt;
                }
                geom.spline = s;
              }
              break;
            }
          }
          drawingStore.updateFeatureGeometry(featureId, geom);
        }
      }

      // Element drag-to-move in SELECT mode
      if (dragFeatureRef.current && !gripDragRef.current) {
        const { featureIds, startWorld, originals } = dragFeatureRef.current;
        const currentWorld = screenToDrawingWorld(sx, sy);
        const dx = currentWorld.wx - startWorld.x;
        const dy = currentWorld.wy - startWorld.y;
        // Only start visual drag after a small threshold to distinguish click from drag
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          for (const id of featureIds) {
            const orig = originals.get(id);
            if (!orig) continue;
            const translated = transformFeature(orig, (pt) => translate(pt, dx, dy));
            drawingStore.updateFeatureGeometry(id, translated.geometry);
          }
        }
      }

      toolStore.setPreviewPoint(worldPt);
      viewportStore.setCursorWorld(worldPt);

      // Update hover state for ALL tools — shows highlighted element under cursor
      if (!isPanningRef.current && !dragFeatureRef.current && !tbDragRef.current) {
        // Check TB element hover (SELECT tool only)
        const tbHover = toolStore.state.activeTool === 'SELECT' ? hitTestTBElement(sx, sy) : null;
        if (tbHover !== hoveredTBElemRef.current) {
          hoveredTBElemRef.current = tbHover;
          // Sync to selection store so LayerPanel can highlight SURVEY-INFO layer
          selectionStore.setHoveredTBElem(tbHover);
        }
        if (tbHover) {
          // Show 'text' cursor when hovering over an editable field, 'grab' for drag-only elements
          const fieldHover = (tbHover === 'titleBlock' || tbHover === 'signatureBlock')
            ? hitTestTBField(sx, sy)
            : null;
          setCursorStyle(fieldHover ? 'text' : 'grab');
        }

        // Check label hover first (labels render on top of features)
        const labelHover = hitTestLabel(sx, sy);
        const prevLabelKey = hoveredLabelKeyRef.current;
        const newLabelKey = labelHover ? labelHover.key : null;
        if (prevLabelKey !== newLabelKey) {
          hoveredLabelKeyRef.current = newLabelKey;
          // Force a re-render to update label color
          if (pixiRef.current?.app) {
            renderLabels();
            renderTextFeatures();
          }
        }

        const hit = hitTest(sx, sy);
        // Sync hovered feature to selection store (drives LayerPanel per-layer + per-item highlighting)
        if (hit !== hoveredIdRef.current) {
          hoveredIdRef.current = hit;
          selectionStore.setHovered(hit);
        }
        // Update cursor style for SELECT tool
        if (toolStore.state.activeTool === 'SELECT') {
          if (!gripDragRef.current && !tbHover) {
            const onGrip = hit && selectionStore.selectedIds.has(hit) ? hitTestGrip(sx, sy) : null;
            if (onGrip) {
              setCursorStyle('move');
            } else if (labelHover) {
              // Hovering over a label: show grab cursor
              setCursorStyle('grab');
            } else if (hit) {
              // Hovering over an element: show grab cursor to indicate it can be dragged
              setCursorStyle('grab');
            } else {
              // Hovering over empty canvas: default cursor
              setCursorStyle('default');
            }
          }
        } else if (toolStore.state.activeTool === 'ERASE') {
          // Erase tool: yellow when nothing under cursor, red when hovering erasable element
          setCursorStyle(hit ? SVG_CURSOR_ERASE_ACTIVE : SVG_CURSOR_ERASE_IDLE);
        } else if (hit && !toolStore.state.activeTool.startsWith('DRAW_')) {
          // For modification tools: show pointer cursor when hovering a selectable element
          setCursorStyle('pointer');
        } else if (!tbHover) {
          const cursor = TOOL_CURSORS[toolStore.state.activeTool] ?? SVG_CURSOR_CROSSHAIR;
          if (!isPanningRef.current) setCursorStyle(cursor);
        }
      } else if (isPanningRef.current) {
        if (hoveredLabelKeyRef.current !== null) {
          hoveredLabelKeyRef.current = null;
        }
        if (hoveredIdRef.current !== null) {
          hoveredIdRef.current = null;
          selectionStore.setHovered(null);
        }
        if (hoveredTBElemRef.current !== null) {
          hoveredTBElemRef.current = null;
          selectionStore.setHoveredTBElem(null);
        }
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
      const prefs = useDrawingStore.getState().document.settings.displayPreferences ?? DEFAULT_DISPLAY_PREFERENCES;
      const hudLines: string[] = [];
      if (ts.activeTool === 'DRAW_LINE' || ts.activeTool === 'DRAW_POLYLINE') {
        if (ts.drawingPoints.length > 0) {
          const lastPt = ts.drawingPoints[ts.drawingPoints.length - 1];
          const dx = worldPt.x - lastPt.x;
          const dy = worldPt.y - lastPt.y;
          const dist = Math.hypot(dx, dy);
          const mathAngleRad = Math.atan2(dy, dx);
          hudLines.push(`Len: ${formatDistance(dist, prefs)}`);
          hudLines.push(`Bearing: ${formatAngle(mathAngleRad, prefs, 'BEARING')}`);
          hudLines.push(`ΔN: ${formatDistance(Math.abs(dy), prefs)}${dy >= 0 ? ' N' : ' S'}  ΔE: ${formatDistance(Math.abs(dx), prefs)}${dx >= 0 ? ' E' : ' W'}`);
        } else {
          const coords = formatCoordinates(worldPt.x, worldPt.y, prefs);
          hudLines.push(`${coords.label1}: ${coords.value1}`);
          hudLines.push(`${coords.label2}: ${coords.value2}`);
        }
      } else if (ts.activeTool === 'MOVE' && ts.basePoint) {
        const dx = worldPt.x - ts.basePoint.x;
        const dy = worldPt.y - ts.basePoint.y;
        hudLines.push(`ΔN: ${formatDistance(Math.abs(dy), prefs)}${dy >= 0 ? ' N' : ' S'}`);
        hudLines.push(`ΔE: ${formatDistance(Math.abs(dx), prefs)}${dx >= 0 ? ' E' : ' W'}`);
        hudLines.push(`Dist: ${formatDistance(Math.hypot(dx, dy), prefs)}`);
      } else if (ts.activeTool === 'ROTATE' && ts.rotateCenter) {
        const dx = worldPt.x - ts.rotateCenter.x;
        const dy = worldPt.y - ts.rotateCenter.y;
        // Survey azimuth from north, clockwise
        let azimuth = 90 - (Math.atan2(dy, dx) * 180 / Math.PI);
        azimuth = ((azimuth % 360) + 360) % 360;
        hudLines.push(`Bearing: ${formatSurveyAngle(azimuth, prefs)}`);
        hudLines.push(`Radius: ${formatDistance(Math.hypot(dx, dy), prefs)}`);
      } else if (ts.activeTool === 'SCALE' && ts.basePoint) {
        const dist = Math.hypot(worldPt.x - ts.basePoint.x, worldPt.y - ts.basePoint.y);
        hudLines.push(`Radius: ${formatDistance(dist, prefs)}`);
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
          hudLines.push(`W: ${formatDistance(Math.abs(dx), prefs)}`);
          hudLines.push(`H: ${formatDistance(Math.abs(dy), prefs)}`);
        } else {
          hudLines.push(`Radius: ${formatDistance(r, prefs)}`);
        }
      } else if (ts.activeTool === 'DRAW_CIRCLE_EDGE' && ts.drawingPoints.length > 0) {
        const p1 = ts.drawingPoints[0];
        const diameter = Math.hypot(worldPt.x - p1.x, worldPt.y - p1.y);
        hudLines.push(`Diameter: ${formatDistance(diameter, prefs)}`);
        hudLines.push(`Radius: ${formatDistance(diameter / 2, prefs)}`);
      } else if (
        (ts.activeTool === 'DRAW_ELLIPSE' || ts.activeTool === 'DRAW_ELLIPSE_EDGE') &&
        ts.drawingPoints.length > 0
      ) {
        const p1 = ts.drawingPoints[0];
        if (ts.activeTool === 'DRAW_ELLIPSE') {
          hudLines.push(`Semi-X: ${formatDistance(Math.abs(worldPt.x - p1.x), prefs)}`);
          hudLines.push(`Semi-Y: ${formatDistance(Math.abs(worldPt.y - p1.y), prefs)}`);
        } else {
          hudLines.push(`Width: ${formatDistance(Math.abs(worldPt.x - p1.x), prefs)}`);
          hudLines.push(`Height: ${formatDistance(Math.abs(worldPt.y - p1.y), prefs)}`);
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
        setCursorStyle(isSpaceDownRef.current ? 'grab' : (TOOL_CURSORS[toolStore.state.activeTool] ?? 'default'));
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

      // Commit label drag
      if (labelDragRef.current) {
        labelDragRef.current = null;
        setCursorStyle(TOOL_CURSORS[toolState.activeTool] ?? 'default');
        return;
      }

      // Commit title-block element drag
      if (tbDragRef.current) {
        const { element, livePosX, livePosY, origPosX, origPosY } = tbDragRef.current;
        const moved = Math.abs(livePosX - origPosX) > 0.01 || Math.abs(livePosY - origPosY) > 0.01;
        if (moved) {
          const pos = { x: livePosX, y: livePosY };
          if (element === 'northArrow')       drawingStore.updateTitleBlock({ northArrowPos: pos });
          if (element === 'titleBlock')       drawingStore.updateTitleBlock({ titleBlockPos: pos });
          if (element === 'scaleBar')         drawingStore.updateTitleBlock({ scaleBarPos: pos });
          if (element === 'signatureBlock')   drawingStore.updateTitleBlock({ signatureBlockPos: pos });
          if (element === 'officialSealLabel')drawingStore.updateTitleBlock({ officialSealLabelPos: pos });
        } else if (element === 'titleBlock' || element === 'signatureBlock') {
          // Single click (no drag) on the title/signature block → open field editor
          const fieldHit = hitTestTBField(sx, sy);
          if (fieldHit) {
            setTbFieldEditState({
              key: fieldHit.key, label: fieldHit.label,
              // Use the pre-computed editValue (may differ from the display text, e.g. SHEET / SCALE)
              value: fieldHit.editValue,
              screenX: fieldHit.screenX, screenY: fieldHit.screenY,
              w: fieldHit.w, h: fieldHit.h,
            });
          }
        }
        tbDragRef.current = null;
        hoveredTBElemRef.current = null;
        selectionStore.setHoveredTBElem(null);
        setCursorStyle('default');
        return;
      }

      // Commit element drag-to-move in SELECT mode
      if (dragFeatureRef.current) {
        const { featureIds, startWorld, originals } = dragFeatureRef.current;
        const currentWorld = screenToDrawingWorld(sx, sy);
        const dx = currentWorld.wx - startWorld.x;
        const dy = currentWorld.wy - startWorld.y;
        const didMove = Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001;

        if (didMove) {
          // Commit the move to undo stack
          const operations: any[] = [];
          for (const id of featureIds) {
            const before = originals.get(id);
            const after = drawingStore.getFeature(id);
            if (before && after) {
              operations.push({ type: 'MODIFY_FEATURE', data: { id, before, after } });
            }
          }
          if (operations.length > 0) {
            undoStore.pushUndo({
              id: generateId(),
              description: `Move ${featureIds.length} element(s)`,
              timestamp: Date.now(),
              operations,
            });
          }
        }
        dragFeatureRef.current = null;
        const hit = hitTest(sx, sy);
        setCursorStyle(hit ? 'grab' : 'default');
        return;
      }

      // Stop canvas pan in SELECT mode
      if (selectPanRef.current) {
        selectPanRef.current = false;
        isPanningRef.current = false;
        // If it was a short click (no drag), deselect
        const dragDist = Math.hypot(sx - lastMouseRef.current.x, sy - lastMouseRef.current.y);
        if (dragDist < 3 && !e.shiftKey) {
          selectionStore.deselectAll();
        }
        setCursorStyle('default');
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
        setCursorStyle(isSpaceDownRef.current ? 'grab' : (TOOL_CURSORS[toolStore.state.activeTool] ?? 'default'));
        return;
      }

      // Finish box selection (works for both SELECT and BOX_SELECT tools)
      if (toolState.isBoxSelecting && (toolState.activeTool === 'SELECT' || toolState.activeTool === 'BOX_SELECT')) {
        const start = toolState.boxStart!;
        const end = toolState.boxEnd ?? { x: sx, y: sy };
        const dragDist = Math.hypot(end.x - start.x, end.y - start.y);
        const threshold = drawingStore.document.settings.dragThreshold ?? 5;
        if (dragDist > threshold) {
          const ids = boxSelectFeatures(start, end);
          selectionStore.selectMultiple(ids, e.shiftKey ? 'ADD' : 'REPLACE');
        } else if (!clickHitFeatureRef.current && !e.shiftKey) {
          selectionStore.deselectAll();
        }
        toolStore.setBoxSelect(null, null, false);
      }

      isPanningRef.current = false;
      setCursorStyle(isSpaceDownRef.current ? 'grab' : (TOOL_CURSORS[toolStore.state.activeTool] ?? 'default'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolStore, selectionStore, drawingStore, undoStore],
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

      if (activeTool === 'DRAW_CURVED_LINE' || activeTool === 'DRAW_SPLINE_FIT') {
        // Double-click finishes curved line drawing (the last click already added a point)
        if (toolState.drawingPoints.length >= 2) {
          finishFeature('SPLINE');
        }
        return;
      }

      if (activeTool === 'DRAW_SPLINE_CONTROL') {
        // Double-click finishes control-point spline
        if (toolState.drawingPoints.length >= 4) {
          finishControlPointSpline();
        }
        return;
      }

      // SELECT tool (or any non-drawing tool): open feature properties dialog
      // First check if double-clicking on a text label (bearing/distance/etc.)
      const labelHit = hitTestLabel(sx, sy);
      if (labelHit) {
        if (!labelHit.isTextFeature) {
          // It's a feature text label (bearing/distance/etc.) — open label attribute editor
          setLabelEditState({ featureId: labelHit.featureId, labelId: labelHit.labelId, sx: e.clientX, sy: e.clientY });
          return;
        } else {
          // TEXT feature — select it and open properties
          selectionStore.select(labelHit.featureId, 'REPLACE');
          return;
        }
      }
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
      // Cancel interactive rotate/scale on Escape
      if (e.key === 'Escape' && interactiveOpRef.current) {
        const dwgStore = useDrawingStore.getState();
        for (const [id, orig] of interactiveOpRef.current.originals) {
          dwgStore.updateFeatureGeometry(id, orig.geometry);
        }
        interactiveOpRef.current = null;
        setInteractivePanel(null);
        setCursorStyle(TOOL_CURSORS[toolStore.state.activeTool] ?? 'default');
        e.stopPropagation();
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
      } else if ((activeTool === 'DRAW_CURVED_LINE' || activeTool === 'DRAW_SPLINE_FIT') && drawingPoints.length >= 2) {
        finishFeature('SPLINE');
      } else if (activeTool === 'DRAW_SPLINE_CONTROL' && drawingPoints.length >= 4) {
        finishControlPointSpline();
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
        // No features: zoom to show the full paper so the user can start drawing immediately
        const { paperSize: ps, paperOrientation: po, drawingScale: ds } = dwgStore.document.settings;
        let [pw, ph] = PAPER_SIZE_MAP[ps ?? 'TABLOID'] ?? [11, 17];
        if (po === 'LANDSCAPE') { [pw, ph] = [ph, pw]; }
        const paperW = pw * (ds ?? 50);
        const paperH = ph * (ds ?? 50);
        vpStore.zoomToExtents({ minX: 0, minY: 0, maxX: paperW, maxY: paperH }, 0.05);
        return;
      }
      const allPts = features.flatMap((f) => {
        const g = f.geometry;
        if (g.type === 'POINT') return g.point ? [g.point] : [];
        if (g.type === 'LINE') return [g.start!, g.end!].filter(Boolean);
        if (g.type === 'CIRCLE' && g.circle) {
          const { center, radius } = g.circle;
          return [
            { x: center.x - radius, y: center.y - radius },
            { x: center.x + radius, y: center.y + radius },
          ];
        }
        if (g.type === 'ELLIPSE' && g.ellipse) {
          const { center, radiusX, radiusY } = g.ellipse;
          const r = Math.max(radiusX, radiusY);
          return [
            { x: center.x - r, y: center.y - r },
            { x: center.x + r, y: center.y + r },
          ];
        }
        if (g.type === 'ARC' && g.arc) {
          const { center, radius } = g.arc;
          return [
            { x: center.x - radius, y: center.y - radius },
            { x: center.x + radius, y: center.y + radius },
          ];
        }
        if (g.type === 'SPLINE' && g.spline) return g.spline.controlPoints;
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

    // ── Interactive rotate: cursor drives rotation in real-time ────────────
    const onStartInteractiveRotate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { pivot?: Point2D } | undefined;
      const selStore = useSelectionStore.getState();
      const dwgStore = useDrawingStore.getState();
      const ids = Array.from(selStore.selectedIds);
      if (ids.length === 0) return;

      // Compute pivot (provided or bounding-box centroid)
      let pivot: Point2D = detail?.pivot ?? { x: 0, y: 0 };
      if (!detail?.pivot) {
        const allPts: Point2D[] = [];
        for (const id of ids) {
          const f = dwgStore.getFeature(id);
          if (f) {
            const g = f.geometry;
            if (g.type === 'POINT' && g.point) allPts.push(g.point);
            else if (g.type === 'LINE') { if (g.start) allPts.push(g.start); if (g.end) allPts.push(g.end); }
            else if (g.vertices) allPts.push(...g.vertices);
            else if (g.circle) allPts.push(g.circle.center);
            else if (g.ellipse) allPts.push(g.ellipse.center);
            else if (g.arc) allPts.push(g.arc.center);
            else if (g.spline) allPts.push(...g.spline.controlPoints);
            else if (g.point) allPts.push(g.point);
          }
        }
        if (allPts.length > 0) {
          const bounds = computeBounds(allPts);
          pivot = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
        }
      }

      // Snapshot originals
      const originals = new Map<string, Feature>();
      for (const id of ids) {
        const f = dwgStore.getFeature(id);
        if (f) originals.set(id, JSON.parse(JSON.stringify(f)));
      }

      // Compute base angle from pivot to current cursor (world)
      const cursorWorld = useViewportStore.getState().cursorWorld ?? pivot;
      const baseAngle = Math.atan2(cursorWorld.y - pivot.y, cursorWorld.x - pivot.x);

      interactiveOpRef.current = { type: 'ROTATE', pivot, originals, baseAngle, baseDist: 0 };
      setInteractivePanel({ type: 'ROTATE', currentAngleDeg: 0, currentFactor: 1 });
      setCursorStyle('crosshair');
    };

    // ── Interactive scale: cursor distance from center drives scale ─────────
    const onStartInteractiveScale = (e: Event) => {
      const detail = (e as CustomEvent).detail as { pivot?: Point2D } | undefined;
      const selStore = useSelectionStore.getState();
      const dwgStore = useDrawingStore.getState();
      const ids = Array.from(selStore.selectedIds);
      if (ids.length === 0) return;

      let pivot: Point2D = detail?.pivot ?? { x: 0, y: 0 };
      if (!detail?.pivot) {
        const allPts: Point2D[] = [];
        for (const id of ids) {
          const f = dwgStore.getFeature(id);
          if (f) {
            const g = f.geometry;
            if (g.type === 'POINT' && g.point) allPts.push(g.point);
            else if (g.type === 'LINE') { if (g.start) allPts.push(g.start); if (g.end) allPts.push(g.end); }
            else if (g.vertices) allPts.push(...g.vertices);
            else if (g.circle) allPts.push(g.circle.center);
            else if (g.ellipse) allPts.push(g.ellipse.center);
            else if (g.arc) allPts.push(g.arc.center);
            else if (g.spline) allPts.push(...g.spline.controlPoints);
            else if (g.point) allPts.push(g.point);
          }
        }
        if (allPts.length > 0) {
          const bounds = computeBounds(allPts);
          pivot = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
        }
      }

      const originals = new Map<string, Feature>();
      for (const id of ids) {
        const f = dwgStore.getFeature(id);
        if (f) originals.set(id, JSON.parse(JSON.stringify(f)));
      }

      // Base distance = distance from pivot to current cursor (world)
      const cursorWorld = useViewportStore.getState().cursorWorld ?? pivot;
      const baseDist = Math.hypot(cursorWorld.x - pivot.x, cursorWorld.y - pivot.y);

      interactiveOpRef.current = { type: 'SCALE', pivot, originals, baseAngle: 0, baseDist: Math.max(baseDist, 0.001) };
      setInteractivePanel({ type: 'SCALE', currentAngleDeg: 0, currentFactor: 1 });
      setCursorStyle('crosshair');
    };

    window.addEventListener('cad:startInteractiveRotate', onStartInteractiveRotate);
    window.addEventListener('cad:startInteractiveScale', onStartInteractiveScale);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('cad:confirm', onConfirm);
      window.removeEventListener('cad:zoomExtents', onZoomExtents);
      window.removeEventListener('cad:rotate', onRotate);
      window.removeEventListener('cad:scale', onScale);
      window.removeEventListener('cad:startInteractiveRotate', onStartInteractiveRotate);
      window.removeEventListener('cad:startInteractiveScale', onStartInteractiveScale);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolStore]);

  // ─────────────────────────────────────────────
  // Scroll → zoom canvas at cursor position (non-passive, prevents page scroll)
  // Zooms toward the cursor location (or toward the centroid of selected elements
  // if any are selected and the cursor is not over the canvas center area).
  // ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // Always prevent page scroll when over canvas
      const rect = canvas.getBoundingClientRect();
      let sx = e.clientX - rect.left;
      let sy = e.clientY - rect.top;

      // If elements are selected, zoom toward the centroid of the selection
      // unless the cursor is clearly aimed at a specific spot (within canvas)
      const selectedIds = useSelectionStore.getState().selectedIds;
      if (selectedIds.size > 0) {
        const drawStore = useDrawingStore.getState();
        const bounds = computeFeaturesBounds(
          Array.from(selectedIds)
            .map((id) => drawStore.getFeature(id))
            .filter(Boolean) as Feature[],
        );
        if (bounds) {
          const centroidWorld = {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2,
          };
          const centroidScreen = useViewportStore.getState().worldToScreen(
            centroidWorld.x,
            centroidWorld.y,
          );
          // Blend: zoom toward a point between cursor and selection centroid
          // (60% cursor, 40% selection) for a natural feel
          sx = sx * 0.6 + centroidScreen.sx * 0.4;
          sy = sy * 0.6 + centroidScreen.sy * 0.4;
        }
      }

      const zoomSettings = useDrawingStore.getState().document.settings;
      const speed = zoomSettings.zoomSpeed ?? 1.0;
      const invert = zoomSettings.invertScrollZoom ?? false;
      const zoomTowardCursor = zoomSettings.zoomTowardCursor ?? true;
      const baseFactor = 1.0 + 0.15 * speed;
      const scrollUp = invert ? (e.deltaY > 0) : (e.deltaY < 0);
      const factor = scrollUp ? baseFactor : 1 / baseFactor;
      if (!zoomTowardCursor) {
        const vp = useViewportStore.getState();
        sx = vp.screenWidth / 2;
        sy = vp.screenHeight / 2;
      }
      useViewportStore.getState().zoomAt(sx, sy, factor);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ─────────────────────────────────────────────
  // Interactive op: cancel (restore originals) / commit (push undo) / preview (apply typed value)
  // These are passed as callbacks to InteractiveOpPanel.
  // ─────────────────────────────────────────────
  function cancelInteractiveOp() {
    const op = interactiveOpRef.current;
    if (!op) return;
    for (const [id, orig] of op.originals) {
      drawingStore.updateFeatureGeometry(id, orig.geometry);
    }
    interactiveOpRef.current = null;
    setInteractivePanel(null);
    setCursorStyle(TOOL_CURSORS[toolStore.state.activeTool] ?? 'default');
  }

  function commitInteractiveOp(value: number) {
    const op = interactiveOpRef.current;
    if (!op) return;
    // Apply the typed/final value from originals
    if (op.type === 'ROTATE') {
      const angleRad = (value * Math.PI) / 180;
      for (const [id, orig] of op.originals) {
        const newF = transformFeature(orig, (p) => rotate(p, op.pivot, angleRad));
        drawingStore.updateFeatureGeometry(id, newF.geometry);
      }
    } else {
      const factor = Math.max(0.0001, value);
      for (const [id, orig] of op.originals) {
        const newF = transformFeature(orig, (p) => scale(p, op.pivot, factor));
        drawingStore.updateFeatureGeometry(id, newF.geometry);
      }
    }
    // Collect undo ops
    const ops = [...op.originals.entries()]
      .map(([id, orig]) => {
        const after = drawingStore.getFeature(id);
        return after ? { type: 'MODIFY_FEATURE' as const, data: { id, before: orig, after } } : null;
      })
      .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];
    if (ops.length > 0) {
      const label = op.type === 'ROTATE'
        ? `Rotate ${value.toFixed(1)}°`
        : `Scale ×${value.toFixed(3)}`;
      undoStore.pushUndo(makeBatchEntry(label, ops));
    }
    interactiveOpRef.current = null;
    setInteractivePanel(null);
    setCursorStyle(TOOL_CURSORS[toolStore.state.activeTool] ?? 'default');
  }

  function previewInteractiveOp(value: number) {
    const op = interactiveOpRef.current;
    if (!op) return;
    if (op.type === 'ROTATE') {
      const angleRad = (value * Math.PI) / 180;
      for (const [id, orig] of op.originals) {
        const newF = transformFeature(orig, (p) => rotate(p, op.pivot, angleRad));
        drawingStore.updateFeatureGeometry(id, newF.geometry);
      }
    } else {
      const factor = Math.max(0.0001, value);
      for (const [id, orig] of op.originals) {
        const newF = transformFeature(orig, (p) => scale(p, op.pivot, factor));
        drawingStore.updateFeatureGeometry(id, newF.geometry);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Right-click / context menu handler
  // ─────────────────────────────────────────────
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { wx, wy } = screenToDrawingWorld(sx, sy);
      const toolState = toolStore.state;
      const { activeTool } = toolState;

      // Right-click during an interactive op: cancel the op, do not open context menu
      if (interactiveOpRef.current) {
        cancelInteractiveOp();
        return;
      }

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

      // Right-click during curved line / spline fit drawing: finish if enough points
      if (activeTool === 'DRAW_CURVED_LINE' || activeTool === 'DRAW_SPLINE_FIT') {
        if (toolState.drawingPoints.length >= 2) {
          finishFeature('SPLINE');
        } else {
          toolStore.clearDrawingPoints();
          toolStore.setTool('SELECT');
        }
        return;
      }

      // Right-click during control-point spline drawing: finish if enough points
      if (activeTool === 'DRAW_SPLINE_CONTROL') {
        if (toolState.drawingPoints.length >= 4) {
          finishControlPointSpline();
        } else {
          toolStore.clearDrawingPoints();
          toolStore.setTool('SELECT');
        }
        return;
      }

      // Right-click during arc drawing: cancel
      if (activeTool === 'DRAW_ARC' && toolState.drawingPoints.length > 0) {
        toolStore.clearDrawingPoints();
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

      // Right-click during rectangle/regular-polygon/circle/ellipse drawing: cancel
      if (
        (activeTool === 'DRAW_RECTANGLE' || activeTool === 'DRAW_REGULAR_POLYGON' ||
         activeTool === 'DRAW_CIRCLE' || activeTool === 'DRAW_CIRCLE_EDGE' ||
         activeTool === 'DRAW_ELLIPSE' || activeTool === 'DRAW_ELLIPSE_EDGE') &&
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
  const cursorWorld = viewportStore.cursorWorld;

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
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseLeave={() => {
          // Clear hover state when cursor exits the canvas
          if (hoveredIdRef.current !== null) {
            hoveredIdRef.current = null;
            selectionStore.setHovered(null);
          }
          if (hoveredTBElemRef.current !== null) {
            hoveredTBElemRef.current = null;
            selectionStore.setHoveredTBElem(null);
          }
          hoveredLabelKeyRef.current = null;
          setSnapLabel(null);
          setHud(null);
        }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(e) => {
          e.preventDefault();
          const imageId = e.dataTransfer.getData('application/starr-image-id');
          if (!imageId) return;
          const rect = canvasRef.current!.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const worldPt = screenToDrawingWorld(sx, sy);
          const projImg = drawingStore.getProjectImage(imageId);
          if (!projImg) return;
          const drawingScale = drawingStore.document.settings.drawingScale ?? 50;
          const defaultWidthIn = 4;
          const worldW = defaultWidthIn * drawingScale;
          const worldH = worldW * (projImg.originalHeight / projImg.originalWidth);
          const featureId = generateId();
          const { activeLayerId, getActiveLayerStyle } = drawingStore;
          const layerStyle = getActiveLayerStyle();
          const feature: Feature = {
            id: featureId,
            type: 'IMAGE',
            geometry: {
              type: 'IMAGE',
              image: {
                imageId,
                position: { x: worldPt.wx, y: worldPt.wy },
                width: worldW,
                height: worldH,
                rotation: 0,
                mirrorX: false,
                mirrorY: false,
              },
            },
            layerId: activeLayerId,
            style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
            properties: { imageName: projImg.name },
          };
          drawingStore.addFeature(feature);
          undoStore.pushUndo(makeAddFeatureEntry(feature));
        }}
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

      {/* Interactive Rotate / Scale dialogue panel */}
      {interactivePanel && interactiveOpRef.current && (
        <InteractiveOpPanel
          type={interactivePanel.type}
          currentAngleDeg={interactivePanel.currentAngleDeg}
          currentFactor={interactivePanel.currentFactor}
          originals={interactiveOpRef.current.originals}
          displayPrefs={drawingStore.document.settings.displayPreferences ?? DEFAULT_DISPLAY_PREFERENCES}
          onCommit={commitInteractiveOp}
          onCancel={cancelInteractiveOp}
          onPreview={previewInteractiveOp}
        />
      )}

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

      {/* DRAW_TEXT inline input overlay */}
      {textInputState && (
        <div
          className="fixed z-50"
          style={{ left: textInputState.sx + 4, top: textInputState.sy - 20 }}
        >
          <input
            autoFocus
            className="bg-gray-900 border-2 border-blue-400 text-white text-sm px-2 py-1 outline-none shadow-2xl min-w-[160px] rounded font-sans"
            style={{ caretColor: '#60a5fa' }}
            placeholder="Type text here…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                if (e.key === 'Enter') {
                  commitTextFeature(e.currentTarget.value, textInputState.wx, textInputState.wy);
                } else {
                  textInputCancelledRef.current = true;
                }
                setTextInputState(null);
              }
            }}
            onBlur={(e) => {
              if (!textInputCancelledRef.current && e.currentTarget.value.trim()) {
                commitTextFeature(e.currentTarget.value, textInputState.wx, textInputState.wy);
              }
              textInputCancelledRef.current = false;
              setTextInputState(null);
            }}
          />
          <div className="text-[9px] text-gray-400 mt-0.5 px-0.5">Enter to place · Esc to cancel</div>
        </div>
      )}

      {/* Title-block field inline editor — single click on a title block data cell */}
      {tbFieldEditState && (() => {
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        const offsetX    = canvasRect?.left ?? 0;
        const offsetY    = canvasRect?.top  ?? 0;
        const editorLeft = Math.max(4, Math.min(
          offsetX + tbFieldEditState.screenX,
          (typeof window !== 'undefined' ? window.innerWidth : 800) - TB_EDITOR_RIGHT_MARGIN,
        ));
        const editorTop  = offsetY + tbFieldEditState.screenY + tbFieldEditState.h / 2 - 12;
        return (
          <div
            className="fixed z-50 bg-gray-900 border border-blue-400 rounded shadow-2xl p-1.5 flex flex-col gap-0.5"
            style={{ left: editorLeft, top: editorTop, minWidth: Math.max(tbFieldEditState.w, TB_EDITOR_MIN_WIDTH) }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-[9px] text-blue-400 font-semibold uppercase tracking-wider px-0.5 pb-0.5">
              {tbFieldEditState.label}
            </div>
            <input
              autoFocus
              className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1 rounded outline-none focus:border-blue-400 w-full"
              style={{ caretColor: '#60a5fa' }}
              defaultValue={tbFieldEditState.value}
              placeholder={`Enter ${tbFieldEditState.label.toLowerCase()}…`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  drawingStore.updateTitleBlock({ [tbFieldEditState.key]: e.currentTarget.value });
                  setTbFieldEditState(null);
                } else if (e.key === 'Escape') {
                  setTbFieldEditState(null);
                }
              }}
              onBlur={(e) => {
                drawingStore.updateTitleBlock({ [tbFieldEditState.key]: e.currentTarget.value });
                setTbFieldEditState(null);
              }}
            />
            <div className="text-[8px] text-gray-500 px-0.5">Enter to save · Esc to cancel</div>
          </div>
        );
      })()}

      {/* Label attribute editor (double-click on bearing/distance label) */}
      {labelEditState && (() => {
        const { featureId, labelId } = labelEditState;
        const feature = drawingStore.getFeature(featureId);
        const label = feature?.textLabels?.find((l) => l.id === labelId);
        if (!feature || !label) { setLabelEditState(null); return null; }
        return (
          <div
            className="fixed z-50 bg-gray-900 border border-blue-400 rounded-lg shadow-2xl p-3 w-64"
            style={{ left: Math.min(labelEditState.sx, (typeof window !== 'undefined' ? window.innerWidth : 800) - 270), top: labelEditState.sy + 8 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
                {label.kind === 'BEARING' ? 'Bearing' : label.kind === 'DISTANCE' ? 'Distance' : label.kind} Label
              </span>
              <button
                className="text-gray-500 hover:text-white text-xs p-0.5 rounded"
                onClick={() => setLabelEditState(null)}
              >✕</button>
            </div>
            <div className="text-[10px] text-gray-400 font-mono mb-2 truncate">{label.text}</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 text-[10px] shrink-0">Font Size (pt)</span>
                <input
                  type="number" min={4} max={144} step={1}
                  className="w-14 bg-gray-700 text-white rounded px-1 py-0.5 text-right text-xs outline-none border border-gray-600 focus:border-blue-500"
                  value={label.style.fontSize}
                  onChange={(e) => {
                    const v = Math.max(4, Math.min(144, parseInt(e.target.value) || 10));
                    drawingStore.updateTextLabel(featureId, labelId, { style: { ...label.style, fontSize: v } });
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 text-[10px] shrink-0">Scale</span>
                <input
                  type="number" min={0.1} max={10} step={0.1}
                  className="w-14 bg-gray-700 text-white rounded px-1 py-0.5 text-right text-xs outline-none border border-gray-600 focus:border-blue-500"
                  value={Number(label.scale.toFixed(2))}
                  onChange={(e) => {
                    const v = Math.max(0.1, Math.min(10, parseFloat(e.target.value) || 1));
                    drawingStore.updateTextLabel(featureId, labelId, { scale: v });
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 text-[10px] shrink-0">Rotation (°)</span>
                <input
                  type="number" min={-360} max={360} step={1}
                  className="w-14 bg-gray-700 text-white rounded px-1 py-0.5 text-right text-xs outline-none border border-gray-600 focus:border-blue-500"
                  value={label.rotation !== null ? Math.round((label.rotation * 180) / Math.PI) : ''}
                  placeholder="auto"
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const rotation = raw === '' ? null : (parseFloat(raw) * Math.PI) / 180;
                    drawingStore.updateTextLabel(featureId, labelId, { rotation });
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 text-[10px] shrink-0">Font</span>
                <select
                  className="flex-1 bg-gray-700 text-white rounded px-1 py-0.5 text-xs outline-none border border-gray-600 focus:border-blue-500"
                  value={label.style.fontFamily}
                  onChange={(e) => drawingStore.updateTextLabel(featureId, labelId, { style: { ...label.style, fontFamily: e.target.value } })}
                >
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`px-2 py-0.5 text-[10px] rounded border ${label.style.fontWeight === 'bold' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}
                  onClick={() => drawingStore.updateTextLabel(featureId, labelId, { style: { ...label.style, fontWeight: label.style.fontWeight === 'bold' ? 'normal' : 'bold' } })}
                >B</button>
                <button
                  className={`px-2 py-0.5 text-[10px] rounded border italic ${label.style.fontStyle === 'italic' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}
                  onClick={() => drawingStore.updateTextLabel(featureId, labelId, { style: { ...label.style, fontStyle: label.style.fontStyle === 'italic' ? 'normal' : 'italic' } })}
                >I</button>
              </div>
              {/* Reset controls — shown when any property has been manually overridden */}
              {(label.userPositioned || label.rotation !== null || label.scale !== 1) && (
                <div className="pt-1.5 border-t border-gray-700/60 space-y-1">
                  <div className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold">Reset</div>
                  <div className="flex flex-wrap gap-1">
                    {label.userPositioned && (
                      <button
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-900/40 hover:bg-yellow-800/60 text-yellow-400 text-[9px] rounded border border-yellow-700/40 transition-colors"
                        onClick={() => {
                          drawingStore.updateTextLabel(featureId, labelId, { userPositioned: false });
                          // Regenerate to restore default offset/position
                          const f = drawingStore.getFeature(featureId);
                          if (f) {
                            const layerDoc = drawingStore.document.layers[f.layerId];
                            if (layerDoc) {
                              const newLabels = generateLabelsForFeature(f, layerDoc, drawingStore.document.settings.displayPreferences);
                              drawingStore.setFeatureTextLabels(featureId, newLabels);
                            }
                          }
                        }}
                      >↩ Position</button>
                    )}
                    {label.rotation !== null && (
                      <button
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-400 text-[9px] rounded border border-purple-700/40 transition-colors"
                        onClick={() => drawingStore.updateTextLabel(featureId, labelId, { rotation: null })}
                      >↩ Rotation</button>
                    )}
                    {label.scale !== 1 && (
                      <button
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-sky-900/40 hover:bg-sky-800/60 text-sky-400 text-[9px] rounded border border-sky-700/40 transition-colors"
                        onClick={() => drawingStore.updateTextLabel(featureId, labelId, { scale: 1 })}
                      >↩ Scale</button>
                    )}
                    {/* "Reset All" only when more than one property is overridden */}
                    {(label.userPositioned ? 1 : 0) + (label.rotation !== null ? 1 : 0) + (label.scale !== 1 ? 1 : 0) > 1 && (
                      <button
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-[9px] rounded border border-gray-600 transition-colors"
                        onClick={() => {
                          drawingStore.updateTextLabel(featureId, labelId, { userPositioned: false, rotation: null, scale: 1 });
                          const f = drawingStore.getFeature(featureId);
                          if (f) {
                            const layerDoc = drawingStore.document.layers[f.layerId];
                            if (layerDoc) {
                              const newLabels = generateLabelsForFeature(f, layerDoc, drawingStore.document.settings.displayPreferences);
                              drawingStore.setFeatureTextLabels(featureId, newLabels);
                            }
                          }
                        }}
                      >↩ All</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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

      {/* Permanent N/E coordinate tracker in the bottom-left of the canvas */}
      <div
        className="absolute bottom-1 left-1 pointer-events-none z-20 flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-mono"
        style={{ background: 'rgba(0,0,0,0.55)', color: '#c8d8ff', border: '1px solid rgba(120,150,220,0.35)' }}
      >
        {(() => {
          const dispPrefs = useDrawingStore.getState().document.settings.displayPreferences ?? DEFAULT_DISPLAY_PREFERENCES;
          const c = formatCoordinates(cursorWorld.x, cursorWorld.y, dispPrefs);
          return (
            <>
              <span>{c.label1}: {c.value1}</span>
              <span className="text-gray-500">|</span>
              <span>{c.label2}: {c.value2}</span>
            </>
          );
        })()}
      </div>

      {/* Drawing rotation indicator — shown when rotation is non-zero */}
      {(() => {
        const rotDeg = drawingStore.document.settings.drawingRotationDeg ?? 0;
        if (Math.abs(rotDeg) < 0.01) return null;
        return (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-20 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono"
            style={{ background: 'rgba(30,60,120,0.7)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.4)' }}
          >
            ⟳ View rotated {Math.round(rotDeg * 10) / 10}° · bearings unchanged
          </div>
        );
      })()}

      {/* DRAW_IMAGE insert dialog */}
      {imageInsertState && (
        <ImageInsertDialog
          worldX={imageInsertState.wx}
          worldY={imageInsertState.wy}
          onClose={() => {
            setImageInsertState(null);
            onPlaceImageConsumed?.();
            toolStore.setTool('SELECT');
          }}
          onInsert={(image, worldW, worldH) => {
            const featureId = generateId();
            const { activeLayerId, getActiveLayerStyle } = drawingStore;
            const layerStyle = getActiveLayerStyle();
            const feature: Feature = {
              id: featureId,
              type: 'IMAGE',
              geometry: {
                type: 'IMAGE',
                image: {
                  imageId: image.id,
                  position: { x: imageInsertState.wx, y: imageInsertState.wy },
                  width: worldW,
                  height: worldH,
                  rotation: 0,
                  mirrorX: false,
                  mirrorY: false,
                },
              },
              layerId: activeLayerId,
              style: { ...DEFAULT_FEATURE_STYLE, ...layerStyle },
              properties: { imageName: image.name },
            };
            drawingStore.addFeature(feature);
            undoStore.pushUndo(makeAddFeatureEntry(feature));
            setImageInsertState(null);
            onPlaceImageConsumed?.();
            toolStore.setTool('SELECT');
          }}
        />
      )}
    </div>
  );
}
