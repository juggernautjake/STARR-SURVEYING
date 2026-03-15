// app/admin/research/components/DrawingCanvas.tsx — Interactive SVG canvas with full drawing tools
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
import type { RenderedDrawing, DrawingElement, ViewMode } from '@/types/research';
import type { DrawingPreferences } from './DrawingPreferencesPanel';
import type { DrawingTool, ToolSettings } from './DrawingToolsSidebar';
import DrawingContextMenu, { type ContextMenuAction } from './DrawingContextMenu';

// ── User Annotation Types ───────────────────────────────────────────────────

export interface UserAnnotation {
  id: string;
  type: 'line' | 'polyline' | 'rectangle' | 'circle' | 'freehand' | 'text' | 'image' | 'symbol' | 'callout' | 'dimension';
  points: { x: number; y: number }[];    // SVG coordinates
  text?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  style: {
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string;
    fill: string;
    opacity: number;
    fontSize?: number;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
  };
  symbolType?: string;
  symbolSize?: number;
  rotation?: number;
  zIndex: number;
  /** Layer this annotation belongs to */
  layerId?: string;
  /** Whether the shape is treated as closed (connects last pt → first pt) */
  isClosed?: boolean;
}

// ── Snap System Types ────────────────────────────────────────────────────────

/** A snappable node: endpoint, midpoint, or arbitrary point on line */
interface SnapNode {
  x: number;
  y: number;
  kind: 'endpoint' | 'midpoint' | 'on_line' | 'symbol_center';
  annotationId?: string;
}

// Snap pixel radius (screen pixels). Distance in SVG units = SNAP_PX / zoom.
const SNAP_PX = 16;
// Snap-on-hover delay in milliseconds (4 seconds)
const SNAP_HOVER_DELAY_MS = 4000;
// Offset applied to pasted/duplicated annotations so they don't sit exactly on top of the original
const PASTE_OFFSET = 20;

// ── Props ───────────────────────────────────────────────────────────────────

interface DrawingCanvasProps {
  drawing: RenderedDrawing;
  elements: DrawingElement[];
  viewMode: ViewMode;
  svgContent: string;
  preferences?: Partial<DrawingPreferences>;
  activeTool: DrawingTool;
  toolSettings: ToolSettings;
  /** Called to switch the active tool (e.g. reverting to 'select' after a one-shot tool) */
  onToolChange?: (tool: DrawingTool) => void;
  onElementClick: (element: DrawingElement) => void;
  onElementModified?: (elementId: string, changes: Partial<DrawingElement>) => void;
  onRevertElement?: (elementId: string) => void;
  annotations: UserAnnotation[];
  onAnnotationsChange: (annotations: UserAnnotation[]) => void;
  /** Silent update that skips undo/redo history — used during drag/resize intermediate moves */
  onAnnotationsSilentChange?: (annotations: UserAnnotation[]) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  /** Show draggable vertex handles on boundary elements */
  showVertexHandles?: boolean;
  /** Called when a vertex handle is clicked for editing */
  onVertexClick?: (elementId: string, vertexIndex: number, x: number, y: number) => void;
  /** Called to request zoom-to-fit from external controls */
  zoomToFitSignal?: number;
  /** Expose cursor position for coordinate entry panel */
  onCursorPositionChange?: (pos: { x: number; y: number } | null) => void;
  /** Active annotation layer id — new annotations are placed on this layer */
  activeLayerId?: string;
  /** Snap mode: off = no snap; hover = snap after 4s hover; auto = snap within radius */
  snapMode?: 'off' | 'hover' | 'auto';
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function DrawingCanvas({
  drawing,
  elements,
  viewMode,
  svgContent,
  preferences,
  activeTool,
  toolSettings,
  onToolChange,
  onElementClick,
  onElementModified,
  onRevertElement,
  annotations,
  onAnnotationsChange,
  onAnnotationsSilentChange,
  zoom: externalZoom,
  onZoomChange,
  showVertexHandles,
  onVertexClick,
  zoomToFitSignal,
  onCursorPositionChange,
  activeLayerId,
  snapMode = 'off',
}: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Zoom / Pan state
  const [internalZoom, setInternalZoom] = useState(1);
  const zoom = externalZoom ?? internalZoom;
  const setZoom = useCallback((val: number | ((prev: number) => number)) => {
    const newVal = typeof val === 'function' ? val(zoom) : val;
    const clamped = Math.max(0.1, Math.min(10, newVal));
    setInternalZoom(clamped);
    onZoomChange?.(clamped);
  }, [zoom, onZoomChange]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Tooltip now stores the hovered element and screen position; it is shown after a 2-second delay
  const [tooltip, setTooltip] = useState<{ x: number; y: number; element: DrawingElement } | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Snap state ─────────────────────────────────────────────────────────
  /** Current snapped point while drawing (null if no snap) */
  const [snapPoint, setSnapPoint] = useState<SnapNode | null>(null);
  /** For hover-mode: countdown timer ref */
  const snapHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Hover-snapped candidate (will auto-connect after delay) */
  const [snapCandidate, setSnapCandidate] = useState<SnapNode | null>(null);

  // ── Clipboard ────────────────────────────────────────────────────────────
  const [clipboard, setClipboard] = useState<UserAnnotation[]>([]);

  // Touch zoom state
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);
  const [touchStartZoom, setTouchStartZoom] = useState(1);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Drag-to-move annotation state
  const [draggingAnnotation, setDraggingAnnotation] = useState<{
    id: string;
    startMouse: { x: number; y: number };
    startPoints: { x: number; y: number }[];
  } | null>(null);

  // Drag-to-move base SVG label element state
  const [draggingLabelEl, setDraggingLabelEl] = useState<{
    id: string;
    startMouse: { x: number; y: number };
    startPos: [number, number];
    rotation: number;
  } | null>(null);
  const [labelDragPos, setLabelDragPos] = useState<{ x: number; y: number } | null>(null);

  // Resize annotation state (corner/edge handles)
  const [resizingAnnotation, setResizingAnnotation] = useState<{
    id: string;
    handle: string;
    startMouse: { x: number; y: number };
    startBounds: { x: number; y: number; w: number; h: number };
    startImageW?: number;
    startImageH?: number;
  } | null>(null);

  // Text input overlay state
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    element: DrawingElement | null;
    annotationId: string | null;
    annotationType?: string;
  } | null>(null);

  // Measurement state
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);

  // Cursor coordinate display
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  const showTooltips = preferences?.showTooltips !== false;
  const highlightOnHover = preferences?.highlightOnHover !== false;

  // Auto-fit drawing in viewport on initial load.
  // Uses a short retry so the container has time to lay out before measuring.
  useEffect(() => {
    if (!svgContent) return;

    function doFit(): boolean {
      const container = containerRef.current;
      if (!container) return false;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return false;

      const sw = drawing.canvas_config?.width || 1200;
      const sh = drawing.canvas_config?.height || 800;

      // Fit drawing inside container with 10% padding on each axis
      const fitZoom = Math.min((cw * 0.90) / sw, (ch * 0.90) / sh);
      const clampedZoom = Math.max(0.1, Math.min(10, fitZoom));

      // Center the drawing
      const panX = (cw - sw * clampedZoom) / 2;
      const panY = (ch - sh * clampedZoom) / 2;

      setZoom(clampedZoom);
      setPan({ x: panX, y: panY });
      return true;
    }

    // Try immediately, then retry after layout completes
    if (!doFit()) {
      const t = setTimeout(doFit, 150);
      return () => clearTimeout(t);
    }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id, svgContent]); // Re-fit when drawing changes

  // Zoom-to-fit on external signal (toolbar button)
  useEffect(() => {
    if (!zoomToFitSignal || !containerRef.current) return;
    const container = containerRef.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    const sw = drawing.canvas_config?.width || 1200;
    const sh = drawing.canvas_config?.height || 800;
    const fitZoom = Math.min((cw * 0.95) / sw, (ch * 0.95) / sh);
    const clampedZoom = Math.max(0.1, Math.min(10, fitZoom));
    setZoom(clampedZoom);
    setPan({ x: (cw - sw * clampedZoom) / 2, y: (ch - sh * clampedZoom) / 2 });
  }, [zoomToFitSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose cursor position to parent
  useEffect(() => {
    onCursorPositionChange?.(cursorCoords);
  }, [cursorCoords, onCursorPositionChange]);

  // Compute vertex handle positions from boundary line elements
  const vertexHandles = useMemo(() => {
    if (!showVertexHandles) return [];
    const handles: { elementId: string; vertexIndex: number; x: number; y: number }[] = [];
    const seen = new Set<string>();
    for (const el of elements) {
      if (el.element_type !== 'line' || !el.visible) continue;
      const geom = el.geometry as { type: string; start?: [number, number]; end?: [number, number] };
      if (geom.type !== 'line' || !geom.start || !geom.end) continue;
      const startKey = `${geom.start[0].toFixed(1)},${geom.start[1].toFixed(1)}`;
      const endKey = `${geom.end[0].toFixed(1)},${geom.end[1].toFixed(1)}`;
      if (!seen.has(startKey)) {
        seen.add(startKey);
        handles.push({ elementId: el.id, vertexIndex: 0, x: geom.start[0], y: geom.start[1] });
      }
      if (!seen.has(endKey)) {
        seen.add(endKey);
        handles.push({ elementId: el.id, vertexIndex: 1, x: geom.end[0], y: geom.end[1] });
      }
    }
    return handles;
  }, [elements, showVertexHandles]);

  // Build element lookup map
  const elementMap = useMemo(() => {
    const map = new Map<string, DrawingElement>();
    for (const el of elements) map.set(el.id, el);
    return map;
  }, [elements]);

  // Memoize sorted annotations to avoid re-sorting on every render
  const sortedAnnotations = useMemo(
    () => [...annotations].sort((a, b) => a.zIndex - b.zIndex),
    [annotations],
  );

  // Sanitize SVG content and inject live style overrides from preferences.
  // The injected <style> block uses [data-feature="X"] CSS attribute selectors so
  // changing any featureStyle preference instantly updates the drawing without a server fetch.
  // The injected <defs> block adds fill-pattern instances using the user's chosen fill color.
  // Both child selectors (for grouped elements like monuments) and direct element selectors
  // (for line/path/polygon elements that carry data-feature themselves) are included.
  const sanitizedSvgContent = useMemo(() => {
    if (!svgContent) return '';

    const featureStyles = preferences?.featureStyles || {};

    // Build CSS overrides for each feature class.
    // We need BOTH child selectors (e.g. [data-feature="X"] line) for grouped elements like
    // monuments, AND direct element selectors (e.g. line[data-feature="X"]) for line/path
    // elements where data-feature is on the element itself (not a parent group).
    const cssRules = Object.entries(featureStyles).map(([fc, s]) => {
      const fill = s.fillPattern && s.fillPattern !== 'solid'
        ? `url(#pref-fp-${fc})`
        : (s.fill && s.fill !== 'none' ? s.fill : 'none');
      const strokeProps = `stroke:${s.stroke};stroke-width:${s.strokeWidth};stroke-dasharray:${s.dasharray || 'none'};opacity:${s.opacity}`;
      const fillProps = `stroke:${s.stroke};stroke-width:${s.strokeWidth};fill:${fill};opacity:${s.opacity}`;
      return (
        // Child selectors (for grouped SVG elements)
        `[data-feature="${fc}"] line,[data-feature="${fc}"] polyline,[data-feature="${fc}"] path{${strokeProps}}` +
        `[data-feature="${fc}"] polygon,[data-feature="${fc}"] rect,[data-feature="${fc}"] circle{${fillProps}}` +
        // Direct element selectors (for elements that have data-feature on themselves)
        `line[data-feature="${fc}"],polyline[data-feature="${fc}"],path[data-feature="${fc}"]{${strokeProps}}` +
        `polygon[data-feature="${fc}"],rect[data-feature="${fc}"],circle[data-feature="${fc}"]{${fillProps}}`
      );
    }).join('');

    // Label font and visibility preferences.
    // This SVG has no viewBox (width/height are explicit pixel dimensions), so 1 CSS px = 1 SVG user
    // unit. Using 'px' units here is equivalent to the unitless SVG presentation attribute values.
    const labelFs = preferences?.labelFontSize || 8;
    const labelFf = preferences?.labelFontFamily || 'Arial';
    const labelCss = (
      `text[data-feature],[data-feature] text{font-size:${labelFs}px;font-family:${labelFf}}` +
      (preferences?.showBearingLabels === false ? `[data-label-type="bearing"]{display:none}` : '') +
      (preferences?.showDistanceLabels === false ? `[data-label-type="distance"]{display:none}` : '') +
      (preferences?.showMonumentLabels === false ? `.monument{display:none}` : '')
    );

    // Build fill-pattern defs for each feature that has a non-solid fill pattern
    const patternDefs = Object.entries(featureStyles).map(([fc, s]) => {
      const fp = s.fillPattern;
      if (!fp || fp === 'solid') return '';
      const color = s.fillColor && s.fillColor !== 'none' ? s.fillColor : s.stroke;
      const id = `pref-fp-${fc}`;
      switch (fp) {
        case 'hatch-ne30':
          return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(30)"><line x1="0" y1="0" x2="0" y2="10" stroke="${color}" stroke-width="1"/></pattern>`;
        case 'hatch-nw30':
          return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(150)"><line x1="0" y1="0" x2="0" y2="10" stroke="${color}" stroke-width="1"/></pattern>`;
        case 'dots-5':  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="14" height="14"><circle cx="7" cy="7" r="1.0" fill="${color}"/></pattern>`;
        case 'dots-10': return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="10" height="10"><circle cx="5" cy="5" r="1.2" fill="${color}"/></pattern>`;
        case 'dots-25': return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8"><circle cx="4" cy="4" r="1.6" fill="${color}"/></pattern>`;
        case 'dots-50': return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6"><circle cx="3" cy="3" r="2.0" fill="${color}"/></pattern>`;
        case 'dots-75': return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="5" height="5"><circle cx="2.5" cy="2.5" r="2.8" fill="${color}"/></pattern>`;
        default: return '';
      }
    }).join('');

    // Inject overrides right after the opening <svg ...> tag
    const enhanced = svgContent.replace(
      /(<svg\b[^>]*>)/i,
      `$1<defs>${patternDefs}</defs><style>${cssRules}${labelCss}</style>`
    );

    return DOMPurify.sanitize(enhanced, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORCE_BODY: false,
      ADD_TAGS: ['style', 'pattern', 'defs'],
      ADD_ATTR: ['patternUnits', 'patternTransform', 'stop-color', 'stop-opacity'],
    });
  }, [svgContent, preferences?.featureStyles, preferences?.labelFontSize, preferences?.labelFontFamily,
      preferences?.showBearingLabels, preferences?.showDistanceLabels, preferences?.showMonumentLabels]);

  // ── Coordinate Helpers ──────────────────────────────────────────────────

  /** Convert client (screen) coords to SVG drawing coords */
  const clientToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // ── Snap Helpers ─────────────────────────────────────────────────────────

  /**
   * Build all snap nodes from existing annotations (endpoints, midpoints, symbol centers).
   * Also adds a "snap along line" node for the closest point on each line segment.
   */
  const buildSnapNodes = useCallback((cursor: { x: number; y: number }): SnapNode[] => {
    const nodes: SnapNode[] = [];
    for (const ann of annotations) {
      if (ann.type === 'symbol' && ann.points.length > 0) {
        nodes.push({ x: ann.points[0].x, y: ann.points[0].y, kind: 'symbol_center', annotationId: ann.id });
      } else if ((ann.type === 'line' || ann.type === 'polyline') && ann.points.length >= 2) {
        // Endpoints
        nodes.push({ x: ann.points[0].x, y: ann.points[0].y, kind: 'endpoint', annotationId: ann.id });
        nodes.push({ x: ann.points[ann.points.length - 1].x, y: ann.points[ann.points.length - 1].y, kind: 'endpoint', annotationId: ann.id });
        // Midpoints + closest-point-on-segment
        for (let i = 0; i < ann.points.length - 1; i++) {
          const a = ann.points[i], b = ann.points[i + 1];
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          nodes.push({ x: mx, y: my, kind: 'midpoint', annotationId: ann.id });
          // Closest point on segment to cursor
          const cp = closestPointOnSegment(cursor, a, b);
          nodes.push({ x: cp.x, y: cp.y, kind: 'on_line', annotationId: ann.id });
        }
      } else if (ann.type !== 'text' && ann.type !== 'image' && ann.points.length > 0) {
        // Rectangle, circle, etc. — add corners
        for (const p of ann.points) nodes.push({ x: p.x, y: p.y, kind: 'endpoint', annotationId: ann.id });
      }
    }
    return nodes;
  }, [annotations]);

  /**
   * Find the closest snap node within SNAP_PX/zoom SVG units.
   * Returns null if nothing is close enough.
   */
  const findSnapPoint = useCallback((cursor: { x: number; y: number }): SnapNode | null => {
    if (snapMode === 'off') return null;
    const radius = SNAP_PX / zoom;
    const nodes = buildSnapNodes(cursor);
    let closest: SnapNode | null = null;
    let closestDist = radius;
    for (const n of nodes) {
      const d = Math.hypot(n.x - cursor.x, n.y - cursor.y);
      if (d < closestDist) { closestDist = d; closest = n; }
    }
    return closest;
  }, [snapMode, zoom, buildSnapNodes]);

  /** Apply snap: if auto-mode, return snapped point; otherwise return original */
  const applySnap = useCallback((pt: { x: number; y: number }): { x: number; y: number } => {
    if (snapMode !== 'auto') return pt;
    const s = findSnapPoint(pt);
    if (s) { setSnapPoint(s); return { x: s.x, y: s.y }; }
    setSnapPoint(null);
    return pt;
  }, [snapMode, findSnapPoint]);

  // ── Annotation Helpers ──────────────────────────────────────────────────

  function addAnnotation(annotation: UserAnnotation) {
    // Attach active layer if not already set
    const withLayer = activeLayerId ? { ...annotation, layerId: annotation.layerId ?? activeLayerId } : annotation;
    onAnnotationsChange([...annotations, withLayer]);
  }

  function updateAnnotation(id: string, changes: Partial<UserAnnotation>) {
    onAnnotationsChange(annotations.map(a => a.id === id ? { ...a, ...changes } : a));
  }

  /** Update annotation without pushing to undo history — used during drag/resize intermediate moves */
  function updateAnnotationSilent(id: string, changes: Partial<UserAnnotation>) {
    const updated = annotations.map(a => a.id === id ? { ...a, ...changes } : a);
    (onAnnotationsSilentChange || onAnnotationsChange)(updated);
  }

  function deleteAnnotation(id: string) {
    onAnnotationsChange(annotations.filter(a => a.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  }

  function generateId() {
    return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getMaxZIndex() {
    return annotations.reduce((max, a) => Math.max(max, a.zIndex), 0);
  }

  // Copy selected annotation to clipboard
  function copyAnnotation(id: string | null) {
    if (!id) return;
    const ann = annotations.find(a => a.id === id);
    if (ann) setClipboard([ann]);
  }

  // Paste clipboard contents with a small offset
  function pasteAnnotations() {
    if (clipboard.length === 0) return;
    const pasted = clipboard.map(ann => ({
      ...ann,
      id: generateId(),
      points: ann.points.map(p => ({ x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET })),
      zIndex: getMaxZIndex() + 1,
    }));
    const newAnnotations = [...annotations, ...pasted];
    onAnnotationsChange(newAnnotations);
    // Select last pasted
    setSelectedAnnotationId(pasted[pasted.length - 1].id);
  }

  // ── Tool: Freehand / Line / Shape Drawing ───────────────────────────────

  const handleDrawStart = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'select' || activeTool === 'pan' || activeTool === 'eraser') return;
    if (e.button !== 0) return; // left click only

    const rawPt = clientToSvg(e.clientX, e.clientY);
    const svgPt = applySnap(rawPt);

    // Text tools: place text input overlay
    if (activeTool === 'text_type') {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setTextInput({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          value: '',
        });
        // Use requestAnimationFrame instead of setTimeout to avoid memory leak
        requestAnimationFrame(() => textInputRef.current?.focus());
      }
      return;
    }

    // Image tool: open file picker
    if (activeTool === 'image') {
      fileInputRef.current?.click();
      return;
    }

    // Measure tool
    if (activeTool === 'measure') {
      if (!measureStart) {
        setMeasureStart(svgPt);
        setMeasureEnd(null);
      } else {
        setMeasureEnd(svgPt);
        // Complete measurement — keep showing until user clicks again
        setMeasureStart(null);
      }
      return;
    }

    // Polyline: if already drawing, add a new point instead of resetting.
    // Check if the user clicked near the starting point to close the shape.
    if (activeTool === 'polyline' && isDrawing && currentPoints.length > 0) {
      const start = currentPoints[0];
      const distToStart = Math.hypot(svgPt.x - start.x, svgPt.y - start.y);
      const closeRadius = SNAP_PX / zoom;
      if (currentPoints.length >= 3 && distToStart < closeRadius) {
        // Close the polyline — use starting point as final point, mark as closed
        const finalPts = [...currentPoints.slice(0, -1)]; // drop the preview point
        const ann: UserAnnotation = {
          id: generateId(),
          type: 'polyline',
          points: finalPts,
          isClosed: true,
          style: {
            stroke: toolSettings.strokeColor,
            strokeWidth: toolSettings.strokeWidth,
            strokeDasharray: toolSettings.dashPattern,
            fill: toolSettings.fillColor !== 'none' ? toolSettings.fillColor : 'none',
            opacity: toolSettings.opacity,
          },
          zIndex: getMaxZIndex() + 1,
        };
        addAnnotation(ann);
        setIsDrawing(false);
        setCurrentPoints([]);
        setSnapPoint(null);
        return;
      }
      setCurrentPoints(prev => [...prev, svgPt]);
      return;
    }

    // Click-click mode: if already drawing a line/shape tool, the second click
    // places the endpoint and finalizes the annotation.
    const CLICK_CLICK_TOOLS = ['line', 'dimension', 'callout', 'rectangle', 'circle'];
    if (CLICK_CLICK_TOOLS.includes(activeTool) && isDrawing && currentPoints.length >= 1) {
      const pts = [currentPoints[0], svgPt];
      const ann: UserAnnotation = {
        id: generateId(),
        type: activeTool as UserAnnotation['type'],
        points: pts,
        style: {
          stroke: toolSettings.strokeColor,
          strokeWidth: toolSettings.strokeWidth,
          strokeDasharray: toolSettings.dashPattern,
          fill: activeTool === 'rectangle' || activeTool === 'circle' ? toolSettings.fillColor : 'none',
          opacity: toolSettings.opacity,
        },
        zIndex: getMaxZIndex() + 1,
      };
      if (activeTool === 'callout') { ann.type = 'callout'; ann.text = 'Note'; ann.style.fontSize = toolSettings.fontSize; ann.style.fontFamily = toolSettings.fontFamily; }
      if (activeTool === 'dimension') { ann.type = 'dimension'; ann.style.fontSize = toolSettings.fontSize; ann.style.fontFamily = toolSettings.fontFamily; }
      addAnnotation(ann);
      setIsDrawing(false);
      setCurrentPoints([]);
      setSnapPoint(null);
      return;
    }

    // Start drawing
    setIsDrawing(true);
    setCurrentPoints([svgPt]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, clientToSvg, applySnap, measureStart, isDrawing, currentPoints, toolSettings, annotations, zoom]);

  const handleDrawMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) {
      // Update measure preview
      if (activeTool === 'measure' && measureStart) {
        setMeasureEnd(clientToSvg(e.clientX, e.clientY));
      }

      // Handle hover-snap candidate tracking (when not yet drawing)
      if (snapMode === 'hover' && !isDrawing) {
        const rawPt = clientToSvg(e.clientX, e.clientY);
        const candidate = findSnapPoint(rawPt);
        if (candidate) {
          if (!snapCandidate || Math.hypot(candidate.x - snapCandidate.x, candidate.y - snapCandidate.y) > 1) {
            setSnapCandidate(candidate);
            if (snapHoverTimerRef.current) clearTimeout(snapHoverTimerRef.current);
            snapHoverTimerRef.current = setTimeout(() => {
              setSnapPoint(candidate);
            }, SNAP_HOVER_DELAY_MS);
          }
        } else {
          setSnapCandidate(null);
          if (snapHoverTimerRef.current) clearTimeout(snapHoverTimerRef.current);
          setSnapPoint(null);
        }
      }
      return;
    }

    const rawPt = clientToSvg(e.clientX, e.clientY);
    const svgPt = applySnap(rawPt);

    if (activeTool === 'freehand' || activeTool === 'text_write') {
      // Add points continuously for freehand
      setCurrentPoints(prev => [...prev, svgPt]);
    } else if (['line', 'rectangle', 'circle', 'dimension', 'callout'].includes(activeTool)) {
      // For shapes, just update the second point
      setCurrentPoints(prev => [prev[0], svgPt]);
    } else if (activeTool === 'polyline') {
      // Show preview line from last point
      setCurrentPoints(prev => {
        const updated = [...prev];
        if (updated.length > 1) updated[updated.length - 1] = svgPt;
        else updated.push(svgPt);
        return updated;
      });
    }
  }, [isDrawing, activeTool, clientToSvg, applySnap, measureStart, snapMode, findSnapPoint, snapCandidate]);

  const handleDrawEnd = useCallback(() => {
    if (!isDrawing || currentPoints.length < 1) {
      setIsDrawing(false);
      return;
    }

    // Polyline needs double-click to finish (handled separately)
    if (activeTool === 'polyline') return;

    const newAnnotation: UserAnnotation = {
      id: generateId(),
      type: activeTool === 'text_write' ? 'freehand' : activeTool as UserAnnotation['type'],
      points: currentPoints,
      style: {
        stroke: toolSettings.strokeColor,
        strokeWidth: toolSettings.strokeWidth,
        strokeDasharray: toolSettings.dashPattern,
        fill: activeTool === 'rectangle' || activeTool === 'circle' ? toolSettings.fillColor : 'none',
        opacity: toolSettings.opacity,
      },
      zIndex: getMaxZIndex() + 1,
    };

    // Symbol placement
    if (activeTool === 'symbol') {
      newAnnotation.type = 'symbol';
      newAnnotation.symbolType = toolSettings.symbolType;
      newAnnotation.symbolSize = toolSettings.symbolSize;
    }

    // Callout
    if (activeTool === 'callout' && currentPoints.length >= 2) {
      newAnnotation.type = 'callout';
      newAnnotation.text = 'Note';
      newAnnotation.style.fontSize = toolSettings.fontSize;
      newAnnotation.style.fontFamily = toolSettings.fontFamily;
    }

    // Dimension
    if (activeTool === 'dimension' && currentPoints.length >= 2) {
      newAnnotation.type = 'dimension';
      newAnnotation.style.fontSize = toolSettings.fontSize;
      newAnnotation.style.fontFamily = toolSettings.fontFamily;
    }

    if (currentPoints.length >= 2 || activeTool === 'symbol') {
      addAnnotation(newAnnotation);
    }

    setIsDrawing(false);
    setCurrentPoints([]);
    setSnapPoint(null);

    // One-shot tools: revert to select cursor after placement
    const ONE_SHOT_TOOLS = ['symbol'];
    if (ONE_SHOT_TOOLS.includes(activeTool)) {
      onToolChange?.('select');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawing, currentPoints, activeTool, toolSettings, annotations, onToolChange]);

  // Click to add polyline point
  const handlePolylineClick = useCallback((e: React.MouseEvent) => {
    if (activeTool !== 'polyline' || !isDrawing) return;
    const svgPt = clientToSvg(e.clientX, e.clientY);
    setCurrentPoints(prev => [...prev, svgPt]);
  }, [activeTool, isDrawing, clientToSvg]);

  // ── Tool: Text Input ──────────────────────────────────────────────────

  const handleTextSubmit = useCallback(() => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }

    const svgPt = clientToSvg(
      textInput.x + (containerRef.current?.getBoundingClientRect().left ?? 0),
      textInput.y + (containerRef.current?.getBoundingClientRect().top ?? 0)
    );

    const newAnnotation: UserAnnotation = {
      id: generateId(),
      type: 'text',
      points: [svgPt],
      text: textInput.value,
      style: {
        stroke: toolSettings.strokeColor,
        strokeWidth: 0,
        strokeDasharray: '',
        fill: toolSettings.strokeColor,
        opacity: toolSettings.opacity,
        fontSize: toolSettings.fontSize,
        fontFamily: toolSettings.fontFamily,
      },
      zIndex: getMaxZIndex() + 1,
    };

    addAnnotation(newAnnotation);
    setTextInput(null);
    // Text placement is one-shot — revert to select
    onToolChange?.('select');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput, clientToSvg, toolSettings, annotations, onToolChange]);

  // ── Tool: Image Placement ─────────────────────────────────────────────

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Place at center of current view
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const centerSvg = clientToSvg(rect.left + rect.width / 2, rect.top + rect.height / 2);

        const maxDim = 200 / zoom; // 200px on screen
        const scale = Math.min(maxDim / img.width, maxDim / img.height);

        const newAnnotation: UserAnnotation = {
          id: generateId(),
          type: 'image',
          points: [centerSvg],
          imageUrl: dataUrl,
          imageWidth: img.width * scale,
          imageHeight: img.height * scale,
          style: {
            stroke: 'none',
            strokeWidth: 0,
            strokeDasharray: '',
            fill: 'none',
            opacity: toolSettings.opacity,
          },
          zIndex: getMaxZIndex() + 1,
        };
        addAnnotation(newAnnotation);
        // Image is a one-shot tool — revert to select cursor
        onToolChange?.('select');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientToSvg, zoom, toolSettings, annotations, onToolChange]);

  // ── Tool: Eraser ──────────────────────────────────────────────────────

  const handleEraseClick = useCallback((e: React.MouseEvent) => {
    if (activeTool !== 'eraser') return;

    // Check if clicked on an annotation
    const target = e.target as SVGElement;
    const annId = target.getAttribute('data-annotation-id')
      || target.closest('[data-annotation-id]')?.getAttribute('data-annotation-id');

    if (annId) {
      deleteAnnotation(annId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, annotations]);

  // ── Pan / Zoom (existing logic, tool-aware) ──────────────────────────

  const handleElementClick = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'eraser') {
      handleEraseClick(e);
      return;
    }

    if (dragStartPos) {
      const dx = Math.abs(e.clientX - dragStartPos.x);
      const dy = Math.abs(e.clientY - dragStartPos.y);
      if (dx > 5 || dy > 5) return; // was a drag
    }

    // If using a drawing tool, the draw handler takes over
    if (!['select', 'pan'].includes(activeTool)) return;

    const target = e.target as SVGElement;

    // Check annotation click
    const annId = target.getAttribute('data-annotation-id')
      || target.closest('[data-annotation-id]')?.getAttribute('data-annotation-id');
    if (annId && activeTool === 'select') {
      setSelectedAnnotationId(annId);
      return;
    }

    // Check element click
    const elId = target.getAttribute('data-element-id')
      || target.closest('[data-element-id]')?.getAttribute('data-element-id');
    if (elId) {
      const element = elementMap.get(elId);
      if (element) {
        setSelectedAnnotationId(null);
        onElementClick(element);
      }
    } else {
      // Clicked empty space
      setSelectedAnnotationId(null);
    }
  }, [elementMap, onElementClick, dragStartPos, activeTool, handleEraseClick]);

  // Hover for tooltips and highlighting
  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning || isDrawing) return;

    const target = e.target as SVGElement;
    const elId = target.getAttribute('data-element-id')
      || target.closest('[data-element-id]')?.getAttribute('data-element-id');

    if (elId && elId !== hoveredId) {
      setHoveredId(elId);

      if (highlightOnHover) {
        const prevHighlighted = containerRef.current?.querySelector('[data-highlighted="true"]');
        if (prevHighlighted) {
          prevHighlighted.removeAttribute('data-highlighted');
          (prevHighlighted as SVGElement).style.filter = '';
        }
        const currentEl = containerRef.current?.querySelector(`[data-element-id="${elId}"]`);
        if (currentEl) {
          currentEl.setAttribute('data-highlighted', 'true');
          (currentEl as SVGElement).style.filter = 'brightness(1.3) drop-shadow(0 0 3px rgba(37, 99, 235, 0.5))';
        }
      }

      if (showTooltips) {
        const element = elementMap.get(elId);
        if (element) {
          const rect = containerRef.current?.getBoundingClientRect();
          const tx = e.clientX - (rect?.left ?? 0) + 14;
          const ty = e.clientY - (rect?.top ?? 0) - 10;

          // Cancel any pending tooltip and start a fresh 2-second timer
          if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
          setTooltip(null);
          tooltipTimerRef.current = setTimeout(() => {
            setTooltip({ x: tx, y: ty, element });
          }, 2000);
        }
      }
    } else if (!elId && hoveredId) {
      if (highlightOnHover) {
        const prevHighlighted = containerRef.current?.querySelector('[data-highlighted="true"]');
        if (prevHighlighted) {
          prevHighlighted.removeAttribute('data-highlighted');
          (prevHighlighted as SVGElement).style.filter = '';
        }
      }
      setHoveredId(null);
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
      setTooltip(null);
    }
  }, [elementMap, hoveredId, isPanning, isDrawing, showTooltips, highlightOnHover]);

  const handleSvgMouseLeave = useCallback(() => {
    if (highlightOnHover) {
      const prevHighlighted = containerRef.current?.querySelector('[data-highlighted="true"]');
      if (prevHighlighted) {
        prevHighlighted.removeAttribute('data-highlighted');
        (prevHighlighted as SVGElement).style.filter = '';
      }
    }
    setHoveredId(null);
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setTooltip(null);
  }, [highlightOnHover]);

  // No scroll-wheel zoom — scroll wheel just scrolls the page normally
  // Zoom is controlled via zoom buttons, double-click (zoom in), and triple-click (zoom out)

  // ── Pan Constraint: keep at least 20% of the drawing page visible ──
  const clampPan = useCallback((px: number, py: number, z: number): { x: number; y: number } => {
    const container = containerRef.current;
    if (!container) return { x: px, y: py };
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const sw = (drawing.canvas_config?.width || 1200) * z;
    const sh = (drawing.canvas_config?.height || 800) * z;

    // Ensure at least 20% of the drawing (or 80px, whichever is larger) stays visible
    const minVisible = Math.max(80, sw * 0.2);
    const minVisibleY = Math.max(80, sh * 0.2);

    const clampedX = Math.max(-sw + minVisible, Math.min(cw - minVisible, px));
    const clampedY = Math.max(-sh + minVisibleY, Math.min(ch - minVisibleY, py));
    return { x: clampedX, y: clampedY };
  }, [drawing.canvas_config]);

  // ── Double-click / triple-click zoom ──
  // Uses native e.detail (1=single, 2=double, 3=triple) — no manual click counter needed.
  // Track rapid clicks for triple-click detection as a fallback.
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRapidClick = useCallback((e: React.MouseEvent) => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => { clickCountRef.current = 0; }, 600);
  }, []);

  // Double-click: finish polyline, OR zoom in. Triple-click: zoom out.
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    // Finish polyline on double-click
    if (activeTool === 'polyline' && isDrawing && currentPoints.length >= 2) {
      // Remove the last duplicate point added by the second click of the double-click
      const points = currentPoints.slice(0, -1).length >= 2 ? currentPoints.slice(0, -1) : currentPoints;
      const newAnnotation: UserAnnotation = {
        id: generateId(),
        type: 'polyline',
        points,
        style: {
          stroke: toolSettings.strokeColor,
          strokeWidth: toolSettings.strokeWidth,
          strokeDasharray: toolSettings.dashPattern,
          fill: toolSettings.fillColor !== 'none' ? toolSettings.fillColor : 'none',
          opacity: toolSettings.opacity,
        },
        zIndex: getMaxZIndex() + 1,
      };
      addAnnotation(newAnnotation);
      setIsDrawing(false);
      setCurrentPoints([]);
      setSnapPoint(null);
      return;
    }

    // Only zoom on select/pan tools
    if (!['select', 'pan'].includes(activeTool)) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Use clickCountRef for triple-click detection (e.detail >= 3 also works but
    // some browsers cap detail at 2 for dblclick events)
    const isTriple = clickCountRef.current >= 3;

    if (isTriple) {
      // Triple-click: zoom OUT
      const newZoom = Math.max(0.1, zoom * 0.5);
      const scale = newZoom / zoom;
      const newPan = clampPan(mouseX - scale * (mouseX - pan.x), mouseY - scale * (mouseY - pan.y), newZoom);
      setZoom(newZoom);
      setPan(newPan);
      clickCountRef.current = 0;
    } else {
      // Double-click: zoom IN
      const newZoom = Math.min(10, zoom * 1.5);
      const scale = newZoom / zoom;
      const newPan = clampPan(mouseX - scale * (mouseX - pan.x), mouseY - scale * (mouseY - pan.y), newZoom);
      setZoom(newZoom);
      setPan(newPan);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, isDrawing, currentPoints, toolSettings, annotations, zoom, pan, setZoom, clampPan]);

  // Mouse down — pan or draw
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragStartPos({ x: e.clientX, y: e.clientY });

    // Middle-click or Alt+click — always pan
    if (e.button === 1 || e.altKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
      return;
    }

    // Right-click — context menu
    if (e.button === 2) return;

    // Pan tool
    if (activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // Drawing tools
    if (!['select', 'pan', 'eraser'].includes(activeTool)) {
      handleDrawStart(e);
      return;
    }

    // Select tool — drag annotation, resize handle, or pan on empty space
    if (activeTool === 'select') {
      const target = e.target as SVGElement;

      // Check if clicking on a resize handle
      const handleType = target.getAttribute('data-resize-handle');
      if (handleType && selectedAnnotationId) {
        const ann = annotations.find(a => a.id === selectedAnnotationId);
        if (ann) {
          const bounds = getAnnotationBounds(ann);
          if (bounds) {
            setResizingAnnotation({
              id: selectedAnnotationId,
              handle: handleType,
              startMouse: clientToSvg(e.clientX, e.clientY),
              startBounds: bounds,
              startImageW: ann.imageWidth,
              startImageH: ann.imageHeight,
            });
            e.preventDefault();
            return;
          }
        }
      }

      const elId = target.getAttribute('data-element-id')
        || target.closest('[data-element-id]')?.getAttribute('data-element-id');
      const annId = target.getAttribute('data-annotation-id')
        || target.closest('[data-annotation-id]')?.getAttribute('data-annotation-id');

      // Start dragging the selected annotation
      if (annId && annId === selectedAnnotationId) {
        const ann = annotations.find(a => a.id === annId);
        if (ann) {
          setDraggingAnnotation({
            id: annId,
            startMouse: clientToSvg(e.clientX, e.clientY),
            startPoints: ann.points.map(p => ({ ...p })),
          });
          e.preventDefault();
          return;
        }
      }

      // Start dragging a label drawing element (makes labels grabbable)
      // Selection is handled by the click handler after mouseUp — just init drag here.
      if (elId && onElementModified) {
        const el = elementMap.get(elId);
        if (el && el.element_type === 'label' && !el.locked) {
          const geom = el.geometry as { type: 'label'; position: [number, number]; anchor: string };
          const svgPt = clientToSvg(e.clientX, e.clientY);
          const rotation = (el.attributes as Record<string, unknown>).rotation as number || 0;
          setDraggingLabelEl({
            id: elId,
            startMouse: svgPt,
            startPos: [geom.position[0], geom.position[1]],
            rotation,
          });
          setLabelDragPos({ x: geom.position[0], y: geom.position[1] });
          // Don't call onElementClick here — the click handler fires on mouseUp if no drag
          return;
        }
      }

      if (!elId && !annId) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }
  }, [pan, activeTool, handleDrawStart, selectedAnnotationId, annotations, clientToSvg, elementMap, onElementModified]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Always track cursor coords for coordinate display
    setCursorCoords(clientToSvg(e.clientX, e.clientY));

    // Drag-to-move label drawing element
    if (draggingLabelEl) {
      const svgPt = clientToSvg(e.clientX, e.clientY);
      const newX = draggingLabelEl.startPos[0] + (svgPt.x - draggingLabelEl.startMouse.x);
      const newY = draggingLabelEl.startPos[1] + (svgPt.y - draggingLabelEl.startMouse.y);
      setLabelDragPos({ x: newX, y: newY });
      return;
    }

    // Drag-to-move annotation
    if (draggingAnnotation) {
      const svgPt = clientToSvg(e.clientX, e.clientY);
      const dx = svgPt.x - draggingAnnotation.startMouse.x;
      const dy = svgPt.y - draggingAnnotation.startMouse.y;
      const newPoints = draggingAnnotation.startPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
      updateAnnotationSilent(draggingAnnotation.id, { points: newPoints });
      return;
    }

    // Resize annotation via handles
    if (resizingAnnotation) {
      const svgPt = clientToSvg(e.clientX, e.clientY);
      const dx = svgPt.x - resizingAnnotation.startMouse.x;
      const dy = svgPt.y - resizingAnnotation.startMouse.y;
      const { startBounds, handle, id } = resizingAnnotation;
      const ann = annotations.find(a => a.id === id);
      if (!ann) return;

      // Compute new bounding box based on which handle is dragged
      let nx = startBounds.x, ny = startBounds.y, nw = startBounds.w, nh = startBounds.h;
      if (handle.includes('e')) nw = Math.max(10, startBounds.w + dx);
      if (handle.includes('w')) { nx = startBounds.x + dx; nw = Math.max(10, startBounds.w - dx); }
      if (handle.includes('s')) nh = Math.max(10, startBounds.h + dy);
      if (handle.includes('n')) { ny = startBounds.y + dy; nh = Math.max(10, startBounds.h - dy); }

      if (ann.type === 'image') {
        // For images: update center position and dimensions
        const centerX = nx + nw / 2;
        const centerY = ny + nh / 2;
        updateAnnotationSilent(id, { points: [{ x: centerX, y: centerY }], imageWidth: nw, imageHeight: nh });
      } else {
        // For shapes: scale points to fit new bounding box
        const ob = startBounds;
        if (ob.w > 0 && ob.h > 0 && ann.points.length >= 2) {
          const newP0 = { x: nx, y: ny };
          const newP1 = { x: nx + nw, y: ny + nh };
          updateAnnotationSilent(id, { points: [newP0, newP1] });
        }
      }
      return;
    }

    if (isPanning) {
      const rawX = e.clientX - panStart.x;
      const rawY = e.clientY - panStart.y;
      setPan(clampPan(rawX, rawY, zoom));
      return;
    }
    if (isDrawing) {
      handleDrawMove(e);
      return;
    }
    handleSvgMouseMove(e);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanning, panStart, isDrawing, handleDrawMove, handleSvgMouseMove, clientToSvg, clampPan, zoom, draggingAnnotation, resizingAnnotation, annotations, draggingLabelEl]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // End label element drag — commit new position via onElementModified
    if (draggingLabelEl && labelDragPos) {
      const el = elementMap.get(draggingLabelEl.id);
      if (el && onElementModified) {
        const oldGeom = el.geometry as { type: 'label'; position: [number, number]; anchor: string };
        const newGeom = { ...oldGeom, position: [labelDragPos.x, labelDragPos.y] as [number, number] };
        onElementModified(draggingLabelEl.id, { geometry: newGeom } as Partial<DrawingElement>);
      }
      setDraggingLabelEl(null);
      setLabelDragPos(null);
      setDragStartPos(null);
      return;
    }
    // End annotation drag — commit final state to history
    if (draggingAnnotation) {
      // Push the current (final) annotations state through the history-tracked callback
      onAnnotationsChange(annotations);
      setDraggingAnnotation(null);
      setDragStartPos(null);
      return;
    }
    // End annotation resize — commit final state to history
    if (resizingAnnotation) {
      onAnnotationsChange(annotations);
      setResizingAnnotation(null);
      setDragStartPos(null);
      return;
    }
    if (isPanning) {
      setIsPanning(false);
      setDragStartPos(null);
      return;
    }
    if (isDrawing && activeTool !== 'polyline') {
      // Click-move-click mode for line-based tools: if the user barely dragged,
      // keep drawing active so they can click again to place the endpoint.
      const CLICK_CLICK_TOOLS = ['line', 'dimension', 'callout', 'rectangle', 'circle'];
      if (CLICK_CLICK_TOOLS.includes(activeTool) && dragStartPos) {
        const dx = Math.abs(e.clientX - dragStartPos.x);
        const dy = Math.abs(e.clientY - dragStartPos.y);
        if (dx < 5 && dy < 5 && currentPoints.length <= 1) {
          // Tiny drag — switch to click-click mode: keep drawing, wait for next mouseDown
          setDragStartPos(null);
          return;
        }
      }
      handleDrawEnd();
      setDragStartPos(null);
      return;
    }
    setDragStartPos(null);
  }, [isPanning, isDrawing, activeTool, handleDrawEnd, dragStartPos, currentPoints, draggingAnnotation, resizingAnnotation, annotations, onAnnotationsChange, draggingLabelEl, labelDragPos, elementMap, onElementModified]);

  // Touch support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setTouchStartDist(Math.sqrt(dx * dx + dy * dy));
      setTouchStartZoom(zoom);
    } else if (e.touches.length === 1) {
      setIsPanning(true);
      setPanStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    }
  }, [zoom, pan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / touchStartDist;
      const newZoom = Math.max(0.1, Math.min(10, touchStartZoom * scale));
      setZoom(newZoom);
    } else if (e.touches.length === 1 && isPanning) {
      const rawX = e.touches[0].clientX - panStart.x;
      const rawY = e.touches[0].clientY - panStart.y;
      setPan(clampPan(rawX, rawY, zoom));
    }
  }, [isPanning, panStart, touchStartDist, touchStartZoom, setZoom, clampPan, zoom]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
    setTouchStartDist(null);
  }, []);

  // ── Context Menu ──────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    const target = e.target as SVGElement;
    const elId = target.getAttribute('data-element-id')
      || target.closest('[data-element-id]')?.getAttribute('data-element-id');
    const annId = target.getAttribute('data-annotation-id')
      || target.closest('[data-annotation-id]')?.getAttribute('data-annotation-id');

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const element = elId ? elementMap.get(elId) ?? null : null;
    const ann = annId ? annotations.find(a => a.id === annId) : null;

    setContextMenu({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      element,
      annotationId: annId || null,
      annotationType: ann?.type,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementMap]);

  const handleContextMenuAction = useCallback((action: ContextMenuAction, element: DrawingElement | null) => {
    // Handle actions on annotations
    if (contextMenu?.annotationId) {
      const annId = contextMenu.annotationId;
      const ann = annotations.find(a => a.id === annId);
      switch (action) {
        case 'delete':
          deleteAnnotation(annId);
          break;
        case 'send_to_front':
          updateAnnotation(annId, { zIndex: getMaxZIndex() + 1 });
          break;
        case 'send_to_back':
          updateAnnotation(annId, { zIndex: 0 });
          break;
        case 'duplicate': {
          if (ann) {
            addAnnotation({
              ...ann,
              id: generateId(),
              points: ann.points.map(p => ({ x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET })),
              zIndex: getMaxZIndex() + 1,
            });
          }
          break;
        }
        case 'copy':
          copyAnnotation(annId);
          break;
        case 'paste':
          pasteAnnotations();
          break;
        case 'toggle_fill': {
          if (ann) {
            const hasFill = ann.style.fill && ann.style.fill !== 'none';
            updateAnnotation(annId, { style: { ...ann.style, fill: hasFill ? 'none' : (ann.style.stroke || '#000000') } });
          }
          break;
        }
        case 'close_shape': {
          if (ann && ann.type === 'polyline' && ann.points.length >= 3) {
            updateAnnotation(annId, { isClosed: !ann.isClosed });
          }
          break;
        }
        case 'hide_layer':
        case 'lock_layer':
          // Layer actions bubble up — handled by parent
          break;
      }
    }

    // Handle actions on drawing elements
    if (element) {
      switch (action) {
        case 'view_details':
          onElementClick(element);
          break;
        case 'hide':
          onElementModified?.(element.id, { visible: false } as Partial<DrawingElement>);
          break;
        case 'show':
          onElementModified?.(element.id, { visible: true } as Partial<DrawingElement>);
          break;
        case 'lock':
          onElementModified?.(element.id, { locked: true } as Partial<DrawingElement>);
          break;
        case 'unlock':
          onElementModified?.(element.id, { locked: false } as Partial<DrawingElement>);
          break;
        case 'edit_style':
          onElementClick(element); // opens detail panel with style editor
          break;
        case 'copy_coords': {
          const attrs = element.attributes as Record<string, unknown>;
          const text = JSON.stringify(attrs.coordinates || attrs.start_point || attrs.center || {}, null, 2);
          navigator.clipboard?.writeText(text).catch(() => {
            // Clipboard access may be denied in non-secure contexts
          });
          break;
        }
        case 'revert_to_original':
          if (element.user_modified && onRevertElement) {
            if (window.confirm('Revert this element to its original AI-generated state? Your edits will be lost.')) {
              onRevertElement(element.id);
            }
          }
          break;
      }
    }

    // Canvas-wide actions (no element selected)
    if (!element && !contextMenu?.annotationId) {
      if (action === 'paste') pasteAnnotations();
    }

    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu, annotations, elements, onElementClick, onElementModified, onRevertElement, clipboard]);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Zoom via keyboard
      if (e.key === '+' || e.key === '=') setZoom(prev => prev * 1.2);
      else if (e.key === '-') setZoom(prev => prev / 1.2);
      else if (e.key === '0') {
        // Reset to fit
        if (containerRef.current) {
          const cw = containerRef.current.clientWidth;
          const ch = containerRef.current.clientHeight;
          const sw = drawing.canvas_config?.width || 1200;
          const sh = drawing.canvas_config?.height || 800;
          const fitZoom = Math.min((cw * 0.90) / sw, (ch * 0.90) / sh);
          setZoom(Math.max(0.1, Math.min(10, fitZoom)));
          setPan({ x: (cw - sw * fitZoom) / 2, y: (ch - sh * fitZoom) / 2 });
        }
      }

      // Delete selected annotation
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
        deleteAnnotation(selectedAnnotationId);
      }

      // Copy / paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        copyAnnotation(selectedAnnotationId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        pasteAnnotations();
      }

      // Duplicate with Ctrl+D
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedAnnotationId) {
          const ann = annotations.find(a => a.id === selectedAnnotationId);
          if (ann) {
            addAnnotation({ ...ann, id: generateId(), points: ann.points.map(p => ({ x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET })), zIndex: getMaxZIndex() + 1 });
          }
        }
      }

      // Escape to cancel drawing or deselect
      if (e.key === 'Escape') {
        setIsDrawing(false);
        setCurrentPoints([]);
        setSelectedAnnotationId(null);
        setContextMenu(null);
        setTextInput(null);
        setMeasureStart(null);
        setMeasureEnd(null);
        setSnapPoint(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setZoom, selectedAnnotationId, annotations, drawing.canvas_config]);

  // ── Cursor ──────────────────────────────────────────────────────────────

  function getCursor(): string {
    if (draggingLabelEl) return 'grabbing';
    if (isPanning) return 'grabbing';
    switch (activeTool) {
      case 'pan': return 'grab';
      case 'select': return hoveredId && elementMap.get(hoveredId)?.element_type === 'label' ? 'grab' : 'default';
      case 'eraser': return 'not-allowed';
      case 'text_type': return 'text';
      case 'measure': return 'crosshair';
      case 'freehand':
      case 'text_write': return 'crosshair';
      default: return 'crosshair';
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  // SVG overlay dimensions (match the drawing SVG viewBox)
  const svgWidth = drawing.canvas_config?.width || 1200;
  const svgHeight = drawing.canvas_config?.height || 800;

  return (
    <div className="research-canvas">
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />

      <div
        ref={containerRef}
        className={`research-canvas__viewport ${isPanning ? 'research-canvas__viewport--panning' : ''}`}
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setIsPanning(false); setDragStartPos(null); setDraggingLabelEl(null); setLabelDragPos(null); handleSvgMouseLeave(); setCursorCoords(null); }}
        onClick={(e) => { handleRapidClick(e); handleElementClick(e); }}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
        {/* Base SVG content */}
        <div
          className="research-canvas__svg-container"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          dangerouslySetInnerHTML={{ __html: sanitizedSvgContent }}
        />

        {/* Annotation overlay SVG — same transform */}
        <svg
          ref={overlayRef}
          className="research-canvas__overlay"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: svgWidth,
            height: svgHeight,
          }}
        >
          {/* Rendered annotations */}
          {sortedAnnotations.map(ann => (
              <g
                key={ann.id}
                data-annotation-id={ann.id}
                className={selectedAnnotationId === ann.id ? 'research-canvas__annotation--selected' : ''}
                opacity={ann.style.opacity}
              >
                {renderAnnotation(ann)}
                {/* Selection handles */}
                {selectedAnnotationId === ann.id && activeTool === 'select' && (
                  renderSelectionHandles(ann)
                )}
              </g>
            ))}

          {/* Current drawing preview */}
          {isDrawing && currentPoints.length > 0 && (
            <g className="research-canvas__draw-preview" opacity={0.7}>
              {renderDrawPreview(activeTool, currentPoints, toolSettings)}
            </g>
          )}

          {/* Measurement line */}
          {measureStart && measureEnd && (
            <g className="research-canvas__measure">
              <line
                x1={measureStart.x} y1={measureStart.y}
                x2={measureEnd.x} y2={measureEnd.y}
                stroke="#FF6600"
                strokeWidth={1.5 / zoom}
                strokeDasharray={`${4 / zoom},${4 / zoom}`}
              />
              <text
                x={(measureStart.x + measureEnd.x) / 2}
                y={(measureStart.y + measureEnd.y) / 2 - 8 / zoom}
                fill="#FF6600"
                fontSize={11 / zoom}
                textAnchor="middle"
                fontWeight="bold"
              >
                {computeDistance(measureStart, measureEnd).toFixed(2)} ft
              </text>
            </g>
          )}

          {/* Vertex handles for CAD editing */}
          {vertexHandles.length > 0 && (
            <g className="research-canvas__vertex-handles">
              {vertexHandles.map((vh, i) => {
                const handleSize = Math.max(4, 6 / zoom);
                return (
                  <g key={`vh-${i}`}>
                    {/* Outer ring — visible at all zooms */}
                    <circle
                      cx={vh.x} cy={vh.y}
                      r={handleSize}
                      fill="#FFFFFF"
                      stroke="#2563EB"
                      strokeWidth={Math.max(1, 2 / zoom)}
                      style={{ cursor: 'pointer' }}
                      onClick={e => {
                        e.stopPropagation();
                        onVertexClick?.(vh.elementId, vh.vertexIndex, vh.x, vh.y);
                      }}
                    />
                    {/* Inner dot */}
                    <circle
                      cx={vh.x} cy={vh.y}
                      r={handleSize * 0.4}
                      fill="#2563EB"
                      style={{ cursor: 'pointer', pointerEvents: 'none' }}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* ── Snap indicators ────────────────────────────────────────── */}
          {/* Active snap point — green crosshair + animated ring */}
          {snapPoint && (
            <g className="research-canvas__snap-indicator" pointerEvents="none">
              <circle
                cx={snapPoint.x} cy={snapPoint.y}
                r={SNAP_PX * 0.8 / zoom}
                fill="none"
                stroke="#16A34A"
                strokeWidth={1.5 / zoom}
                strokeDasharray={`${3 / zoom},${2 / zoom}`}
              />
              <line x1={snapPoint.x - SNAP_PX * 0.6 / zoom} y1={snapPoint.y} x2={snapPoint.x + SNAP_PX * 0.6 / zoom} y2={snapPoint.y} stroke="#16A34A" strokeWidth={1 / zoom} />
              <line x1={snapPoint.x} y1={snapPoint.y - SNAP_PX * 0.6 / zoom} x2={snapPoint.x} y2={snapPoint.y + SNAP_PX * 0.6 / zoom} stroke="#16A34A" strokeWidth={1 / zoom} />
              {snapPoint.kind === 'midpoint' && (
                <rect x={snapPoint.x - SNAP_PX * 0.25 / zoom} y={snapPoint.y - SNAP_PX * 0.25 / zoom} width={SNAP_PX * 0.5 / zoom} height={SNAP_PX * 0.5 / zoom} fill="#16A34A" opacity={0.6} />
              )}
            </g>
          )}
          {/* Hover-snap candidate — amber pulsing ring with countdown */}
          {snapCandidate && snapMode === 'hover' && !snapPoint && (
            <g className="research-canvas__snap-candidate" pointerEvents="none">
              <circle
                cx={snapCandidate.x} cy={snapCandidate.y}
                r={SNAP_PX * 1.2 / zoom}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={1.5 / zoom}
                opacity={0.7}
              />
            </g>
          )}
          {/* Label element drag ghost — shows where the label will be placed */}
          {draggingLabelEl && labelDragPos && (() => {
            const el = elements.find(e => e.id === draggingLabelEl.id);
            if (!el || el.element_type !== 'label') return null;
            const attrs = el.attributes as Record<string, unknown>;
            const text = String(attrs.text || '');
            const fs = (el.style as { fontSize?: number }).fontSize || 8;
            const ff = (el.style as { fontFamily?: string }).fontFamily || 'Arial';
            const rot = draggingLabelEl.rotation;
            return (
              <g pointerEvents="none" opacity={0.75}>
                {/* Ghost bounding box — width is approximated using avg char width (0.6×fs)
                    since proportional font metrics aren't available in SVG without DOM measurement */}
                <rect
                  x={labelDragPos.x - text.length * fs * 0.3}
                  y={labelDragPos.y - fs}
                  width={text.length * fs * 0.6}
                  height={fs * 1.4}
                  fill="#EFF6FF"
                  stroke="#2563EB"
                  strokeWidth={1 / zoom}
                  strokeDasharray={`${4 / zoom},${2 / zoom}`}
                  rx={2}
                />
                <text
                  x={labelDragPos.x}
                  y={labelDragPos.y}
                  fontSize={fs}
                  fontFamily={ff}
                  fill={el.style.stroke}
                  textAnchor="middle"
                  transform={rot !== 0 ? `rotate(${rot}, ${labelDragPos.x}, ${labelDragPos.y})` : undefined}
                >
                  {text}
                </text>
              </g>
            );
          })()}

          {/* Close-shape indicator: green dot at start point when drawing polyline near start */}
          {activeTool === 'polyline' && isDrawing && currentPoints.length >= 3 && (() => {
            const start = currentPoints[0];
            const last = currentPoints[currentPoints.length - 1];
            const d = Math.hypot(last.x - start.x, last.y - start.y);
            const closeR = SNAP_PX / zoom;
            if (d < closeR * 2) {
              return (
                <g pointerEvents="none">
                  <circle cx={start.x} cy={start.y} r={closeR} fill="#16A34A" fillOpacity={0.25} stroke="#16A34A" strokeWidth={1.5 / zoom} />
                  <text x={start.x} y={start.y - closeR - 2 / zoom} textAnchor="middle" fill="#16A34A" fontSize={Math.max(8, 8 / zoom)}>close</text>
                </g>
              );
            }
            return null;
          })()}
        </svg>

        {/* 2-second hover tooltip — rich element info card */}
        {tooltip && (
          <div
            className="research-canvas__tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
            role="tooltip"
          >
            <ElementInfoTooltip element={tooltip.element} />
          </div>
        )}

        {/* Text input overlay */}
        {textInput && (
          <div
            className="research-canvas__text-input-wrap"
            style={{ left: textInput.x, top: textInput.y }}
          >
            <textarea
              ref={textInputRef}
              className="research-canvas__text-input"
              value={textInput.value}
              onChange={e => setTextInput({ ...textInput, value: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleTextSubmit();
                }
                if (e.key === 'Escape') setTextInput(null);
              }}
              onBlur={() => {
                if (textInput.value.trim()) handleTextSubmit();
                else setTextInput(null);
              }}
              placeholder="Type text... (Enter to confirm)"
              style={{
                fontSize: toolSettings.fontSize,
                fontFamily: toolSettings.fontFamily,
                color: toolSettings.strokeColor,
              }}
              rows={1}
            />
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <DrawingContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            element={contextMenu.element}
            isUserAnnotation={!!contextMenu.annotationId}
            annotationType={contextMenu.annotationType}
            onAction={handleContextMenuAction}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Coordinate display */}
        {cursorCoords && (
          <div className="research-canvas__coords" aria-live="off">
            X: {cursorCoords.x.toFixed(1)} &nbsp; Y: {cursorCoords.y.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SVG Rendering Helpers ─────────────────────────────────────────────────────

function renderAnnotation(ann: UserAnnotation): JSX.Element | null {
  const s = ann.style;

  switch (ann.type) {
    case 'line':
      if (ann.points.length < 2) return null;
      return (
        <line
          x1={ann.points[0].x} y1={ann.points[0].y}
          x2={ann.points[1].x} y2={ann.points[1].y}
          stroke={s.stroke} strokeWidth={s.strokeWidth}
          strokeDasharray={s.strokeDasharray || undefined}
          fill="none"
        />
      );

    case 'polyline':
      if (ann.points.length < 2) return null;
      // If the polyline is closed, render as a polygon so fill stays inside the shape
      if (ann.isClosed) {
        return (
          <polygon
            points={ann.points.map(p => `${p.x},${p.y}`).join(' ')}
            stroke={s.stroke} strokeWidth={s.strokeWidth}
            strokeDasharray={s.strokeDasharray || undefined}
            fill={s.fill && s.fill !== 'none' ? s.fill : 'none'}
            fillRule="evenodd"
          />
        );
      }
      return (
        <polyline
          points={ann.points.map(p => `${p.x},${p.y}`).join(' ')}
          stroke={s.stroke} strokeWidth={s.strokeWidth}
          strokeDasharray={s.strokeDasharray || undefined}
          fill="none"
        />
      );

    case 'freehand':
      if (ann.points.length < 2) return null;
      return (
        <path
          d={pointsToPath(ann.points) + (ann.isClosed ? ' Z' : '')}
          stroke={s.stroke} strokeWidth={s.strokeWidth}
          strokeLinecap="round" strokeLinejoin="round"
          fill={ann.isClosed && s.fill && s.fill !== 'none' ? s.fill : 'none'}
        />
      );

    case 'rectangle':
      if (ann.points.length < 2) return null;
      return (
        <rect
          x={Math.min(ann.points[0].x, ann.points[1].x)}
          y={Math.min(ann.points[0].y, ann.points[1].y)}
          width={Math.abs(ann.points[1].x - ann.points[0].x)}
          height={Math.abs(ann.points[1].y - ann.points[0].y)}
          stroke={s.stroke} strokeWidth={s.strokeWidth}
          strokeDasharray={s.strokeDasharray || undefined}
          fill={s.fill === 'none' ? 'none' : s.fill}
        />
      );

    case 'circle':
      if (ann.points.length < 2) return null;
      return (
        <ellipse
          cx={ann.points[0].x}
          cy={ann.points[0].y}
          rx={Math.abs(ann.points[1].x - ann.points[0].x)}
          ry={Math.abs(ann.points[1].y - ann.points[0].y)}
          stroke={s.stroke} strokeWidth={s.strokeWidth}
          strokeDasharray={s.strokeDasharray || undefined}
          fill={s.fill === 'none' ? 'none' : s.fill}
        />
      );

    case 'text':
      if (!ann.text || ann.points.length < 1) return null;
      return (
        <text
          x={ann.points[0].x}
          y={ann.points[0].y}
          fill={s.fill || s.stroke}
          fontSize={s.fontSize || 12}
          fontFamily={s.fontFamily || 'Arial'}
          fontWeight={s.bold ? 'bold' : 'normal'}
          fontStyle={s.italic ? 'italic' : 'normal'}
        >
          {ann.text.split('\n').map((line, i) => (
            <tspan key={i} x={ann.points[0].x} dy={i === 0 ? 0 : (s.fontSize || 12) * 1.2}>
              {line}
            </tspan>
          ))}
        </text>
      );

    case 'image':
      if (!ann.imageUrl || ann.points.length < 1) return null;
      return (
        <image
          href={ann.imageUrl}
          x={ann.points[0].x - (ann.imageWidth || 100) / 2}
          y={ann.points[0].y - (ann.imageHeight || 100) / 2}
          width={ann.imageWidth || 100}
          height={ann.imageHeight || 100}
          preserveAspectRatio="xMidYMid meet"
        />
      );

    case 'symbol':
      if (ann.points.length < 1) return null;
      return renderSymbolSvg(ann);

    case 'callout':
      if (ann.points.length < 2) return null;
      return (
        <g>
          <line
            x1={ann.points[0].x} y1={ann.points[0].y}
            x2={ann.points[1].x} y2={ann.points[1].y}
            stroke={s.stroke} strokeWidth={s.strokeWidth}
            markerEnd="url(#arrowhead-user)"
          />
          <rect
            x={ann.points[1].x - 2}
            y={ann.points[1].y - (s.fontSize || 12) - 4}
            width={((ann.text || 'Note').length * (s.fontSize || 12) * 0.6) + 8}
            height={(s.fontSize || 12) + 8}
            fill="#FFFDE7"
            stroke={s.stroke}
            strokeWidth={0.5}
            rx={3}
          />
          <text
            x={ann.points[1].x + 2}
            y={ann.points[1].y - 2}
            fill={s.stroke}
            fontSize={s.fontSize || 12}
            fontFamily={s.fontFamily || 'Arial'}
          >
            {ann.text || 'Note'}
          </text>
        </g>
      );

    case 'dimension':
      if (ann.points.length < 2) return null;
      return renderDimensionLine(ann);

    default:
      return null;
  }
}

function renderSelectionHandles(ann: UserAnnotation): JSX.Element {
  const bounds = getAnnotationBounds(ann);
  if (!bounds) return <></>;

  const { x, y, w, h } = bounds;
  const handleSize = 6;

  return (
    <g className="research-canvas__handles">
      {/* Bounding box */}
      <rect
        x={x} y={y} width={w} height={h}
        fill="none"
        stroke="#2563EB"
        strokeWidth={1}
        strokeDasharray="4,4"
      />
      {/* Corner handles */}
      {[
        { cx: x, cy: y, cursor: 'nw-resize', handle: 'nw' },
        { cx: x + w, cy: y, cursor: 'ne-resize', handle: 'ne' },
        { cx: x, cy: y + h, cursor: 'sw-resize', handle: 'sw' },
        { cx: x + w, cy: y + h, cursor: 'se-resize', handle: 'se' },
        { cx: x + w / 2, cy: y, cursor: 'n-resize', handle: 'n' },
        { cx: x + w / 2, cy: y + h, cursor: 's-resize', handle: 's' },
        { cx: x, cy: y + h / 2, cursor: 'w-resize', handle: 'w' },
        { cx: x + w, cy: y + h / 2, cursor: 'e-resize', handle: 'e' },
      ].map(h => (
        <rect
          key={h.handle}
          data-resize-handle={h.handle}
          x={h.cx - handleSize / 2}
          y={h.cy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#FFFFFF"
          stroke="#2563EB"
          strokeWidth={1}
          style={{ cursor: h.cursor }}
        />
      ))}
    </g>
  );
}

function renderDrawPreview(tool: DrawingTool, points: { x: number; y: number }[], settings: ToolSettings): JSX.Element | null {
  if (points.length < 1) return null;

  switch (tool) {
    case 'line':
    case 'dimension':
    case 'callout':
      if (points.length < 2) return null;
      return (
        <line
          x1={points[0].x} y1={points[0].y}
          x2={points[1].x} y2={points[1].y}
          stroke={settings.strokeColor}
          strokeWidth={settings.strokeWidth}
          strokeDasharray={settings.dashPattern || '5,5'}
        />
      );

    case 'polyline':
      return (
        <polyline
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          stroke={settings.strokeColor}
          strokeWidth={settings.strokeWidth}
          fill="none"
          strokeDasharray="5,5"
        />
      );

    case 'freehand':
    case 'text_write':
      return (
        <path
          d={pointsToPath(points)}
          stroke={settings.strokeColor}
          strokeWidth={settings.strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
      );

    case 'rectangle':
      if (points.length < 2) return null;
      return (
        <rect
          x={Math.min(points[0].x, points[1].x)}
          y={Math.min(points[0].y, points[1].y)}
          width={Math.abs(points[1].x - points[0].x)}
          height={Math.abs(points[1].y - points[0].y)}
          stroke={settings.strokeColor}
          strokeWidth={settings.strokeWidth}
          fill="none"
          strokeDasharray="5,5"
        />
      );

    case 'circle':
      if (points.length < 2) return null;
      return (
        <ellipse
          cx={points[0].x}
          cy={points[0].y}
          rx={Math.abs(points[1].x - points[0].x)}
          ry={Math.abs(points[1].y - points[0].y)}
          stroke={settings.strokeColor}
          strokeWidth={settings.strokeWidth}
          fill="none"
          strokeDasharray="5,5"
        />
      );

    case 'symbol':
      return (
        <circle
          cx={points[0].x}
          cy={points[0].y}
          r={settings.symbolSize}
          stroke={settings.strokeColor}
          fill="none"
          strokeDasharray="3,3"
        />
      );

    default:
      return null;
  }
}

function renderSymbolSvg(ann: UserAnnotation): JSX.Element {
  const { x, y } = ann.points[0];
  const s = ann.symbolSize || 8;
  const r = s / 2;
  const stroke = ann.style.stroke;
  const fill = ann.style.fill === 'none' ? stroke : ann.style.fill;

  // Helper for labeled circle symbols
  const labeledCircle = (label: string, bgColor?: string) => (
    <g>
      <circle cx={x} cy={y} r={r} fill={bgColor || 'none'} stroke={stroke} strokeWidth={1.2} />
      <text x={x} y={y + s * 0.15} textAnchor="middle" fontSize={s * 0.5} fill={bgColor ? '#FFF' : stroke} fontWeight="bold">{label}</text>
    </g>
  );

  // Helper for X mark
  const xMark = () => (
    <g>
      <line x1={x - r * 0.7} y1={y - r * 0.7} x2={x + r * 0.7} y2={y + r * 0.7} stroke={stroke} strokeWidth={1.5} />
      <line x1={x + r * 0.7} y1={y - r * 0.7} x2={x - r * 0.7} y2={y + r * 0.7} stroke={stroke} strokeWidth={1.5} />
    </g>
  );

  // Helper for crosshair inside circle
  const crosshairCircle = () => (
    <g>
      <circle cx={x} cy={y} r={r} fill="none" stroke={stroke} strokeWidth={1.2} />
      <line x1={x - r} y1={y} x2={x + r} y2={y} stroke={stroke} strokeWidth={0.8} />
      <line x1={x} y1={y - r} x2={x} y2={y + r} stroke={stroke} strokeWidth={0.8} />
    </g>
  );

  switch (ann.symbolType) {
    // ── Monuments — standard ──
    case 'iron_rod':
    case 'iron_pipe':
    case 'rebar':
      return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={1} />;

    // ── Monuments — sized iron rod variants (different outer ring + inner dot) ──
    case 'iron_rod_half':
      // 1/2" — small single circle
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={1} />
          <text x={x} y={y + r + s * 0.55} textAnchor="middle" fontSize={s * 0.55} fill={stroke} fontWeight="bold">½″</text>
        </g>
      );
    case 'iron_rod_five_eighth':
      // 5/8" — double circle (most common US rod)
      return (
        <g>
          <circle cx={x} cy={y} r={r * 1.25} fill="none" stroke={stroke} strokeWidth={0.8} />
          <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={1} />
          <text x={x} y={y + r * 1.25 + s * 0.55} textAnchor="middle" fontSize={s * 0.55} fill={stroke} fontWeight="bold">⅝″</text>
        </g>
      );
    case 'iron_rod_three_quarter':
      // 3/4" — larger solid circle
      return (
        <g>
          <circle cx={x} cy={y} r={r * 1.15} fill={fill} stroke={stroke} strokeWidth={1} />
          <text x={x} y={y + r * 1.15 + s * 0.55} textAnchor="middle" fontSize={s * 0.55} fill={stroke} fontWeight="bold">¾″</text>
        </g>
      );
    case 'iron_rod_one_inch':
      // 1" — large circle with cross
      return (
        <g>
          <circle cx={x} cy={y} r={r * 1.3} fill={fill} stroke={stroke} strokeWidth={1.2} />
          <line x1={x - r * 0.7} y1={y} x2={x + r * 0.7} y2={y} stroke={stroke} strokeWidth={0.6} />
          <line x1={x} y1={y - r * 0.7} x2={x} y2={y + r * 0.7} stroke={stroke} strokeWidth={0.6} />
          <text x={x} y={y + r * 1.3 + s * 0.55} textAnchor="middle" fontSize={s * 0.55} fill={stroke} fontWeight="bold">1″</text>
        </g>
      );
    // ── Iron pipe sizes ──
    case 'iron_pipe_half':
      return (
        <g>
          <rect x={x - r * 0.7} y={y - r * 0.7} width={r * 1.4} height={r * 1.4} fill="none" stroke={stroke} strokeWidth={1} />
          <circle cx={x} cy={y} r={r * 0.4} fill={fill} />
          <text x={x} y={y + r + s * 0.55} textAnchor="middle" fontSize={s * 0.55} fill={stroke} fontWeight="bold">½P</text>
        </g>
      );
    case 'iron_pipe_three_quarter':
      return (
        <g>
          <rect x={x - r} y={y - r} width={s} height={s} fill="none" stroke={stroke} strokeWidth={1} />
          <circle cx={x} cy={y} r={r * 0.4} fill={fill} />
          <text x={x} y={y + r + s * 0.55} textAnchor="middle" fontSize={s * 0.55} fill={stroke} fontWeight="bold">¾P</text>
        </g>
      );
    case 'iron_pipe_one_inch':
      return (
        <g>
          <rect x={x - r * 1.2} y={y - r * 1.2} width={r * 2.4} height={r * 2.4} fill="none" stroke={stroke} strokeWidth={1.2} />
          <circle cx={x} cy={y} r={r * 0.45} fill={fill} />
          <text x={x} y={y + r * 1.2 + s * 0.55} textAnchor="middle" fontSize={s * 0.55} fill={stroke} fontWeight="bold">1″P</text>
        </g>
      );

    case 'concrete_monument':
      return <rect x={x - r} y={y - r} width={s} height={s} fill={fill} stroke={stroke} strokeWidth={1} />;
    case 'nail':
    case 'pk_nail':
    case 'mag_nail':
      return <polygon points={`${x},${y - r} ${x + r},${y + r} ${x - r},${y + r}`} fill={fill} stroke={stroke} strokeWidth={1} />;
    case 'cap':
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill="none" stroke={stroke} strokeWidth={1.5} />
          <circle cx={x} cy={y} r={r * 0.4} fill={fill} stroke={stroke} strokeWidth={0.8} />
        </g>
      );
    case 'benchmark':
      return (
        <g>
          <polygon points={`${x},${y - r} ${x + r},${y + r} ${x - r},${y + r}`} fill="none" stroke={stroke} strokeWidth={1.5} />
          <circle cx={x} cy={y + s / 6} r={s / 5} fill={stroke} />
        </g>
      );

    // ── Fencing ──
    case 'fence_post':
      return xMark();
    case 'fence_corner':
      return (
        <g>
          {xMark()}
          <circle cx={x} cy={y} r={r * 1.3} fill="none" stroke={stroke} strokeWidth={0.8} />
        </g>
      );
    case 'gate':
      return (
        <g>
          <line x1={x - s} y1={y} x2={x - r * 0.4} y2={y} stroke={stroke} strokeWidth={1.5} />
          <line x1={x + r * 0.4} y1={y} x2={x + s} y2={y} stroke={stroke} strokeWidth={1.5} />
          <path d={`M ${x - r * 0.4} ${y} A ${r * 0.8} ${r * 0.8} 0 0 1 ${x + r * 0.4} ${y}`} fill="none" stroke={stroke} strokeWidth={1} />
        </g>
      );

    // ── Underground Utilities ──
    case 'manhole':
      return labeledCircle('MH');
    case 'cleanout':
      return labeledCircle('CO');
    case 'water_valve':
      return labeledCircle('WV', '#2563EB');
    case 'water_meter':
      return labeledCircle('WM', '#3B82F6');
    case 'gas_valve':
      return labeledCircle('GV', '#F59E0B');
    case 'gas_meter':
      return labeledCircle('GM', '#D97706');
    case 'electric_meter':
      return labeledCircle('EM', '#EF4444');
    case 'junction_box':
      return (
        <g>
          <rect x={x - r} y={y - r} width={s} height={s} fill="none" stroke={stroke} strokeWidth={1.2} />
          <text x={x} y={y + s * 0.15} textAnchor="middle" fontSize={s * 0.45} fill={stroke} fontWeight="bold">JB</text>
        </g>
      );
    case 'storm_drain':
      return (
        <g>
          <rect x={x - r} y={y - r * 0.7} width={s} height={s * 0.7} fill="none" stroke={stroke} strokeWidth={1.2} />
          <line x1={x - r * 0.6} y1={y} x2={x + r * 0.6} y2={y} stroke={stroke} strokeWidth={0.8} />
          <line x1={x - r * 0.6} y1={y + r * 0.25} x2={x + r * 0.6} y2={y + r * 0.25} stroke={stroke} strokeWidth={0.8} />
        </g>
      );
    case 'catch_basin':
      return (
        <g>
          <rect x={x - r} y={y - r} width={s} height={s} fill="none" stroke={stroke} strokeWidth={1.2} />
          <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} stroke={stroke} strokeWidth={0.8} />
          <line x1={x + r} y1={y - r} x2={x - r} y2={y + r} stroke={stroke} strokeWidth={0.8} />
        </g>
      );
    case 'septic_tank':
      return (
        <g>
          <ellipse cx={x} cy={y} rx={r * 1.2} ry={r * 0.8} fill="none" stroke={stroke} strokeWidth={1.2} />
          <text x={x} y={y + s * 0.15} textAnchor="middle" fontSize={s * 0.4} fill={stroke}>ST</text>
        </g>
      );

    // ── Underground Line Marker Symbols ──
    case 'water_line':
      return labeledCircle('W', '#3B82F6');
    case 'sewer_line':
      return labeledCircle('SS', '#78716C');
    case 'gas_line':
      return labeledCircle('G', '#F59E0B');
    case 'electric_line':
      return labeledCircle('E', '#EF4444');
    case 'telecom_line':
      return labeledCircle('T', '#8B5CF6');
    case 'fiber_line':
      return labeledCircle('F', '#10B981');

    // ── Above Ground Utilities ──
    case 'utility_pole':
    case 'power_pole':
      return crosshairCircle();
    case 'fire_hydrant':
      return labeledCircle('FH', '#EF4444');
    case 'light_pole':
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.6} fill={stroke} stroke={stroke} strokeWidth={0.5} />
          <line x1={x} y1={y - r * 0.6} x2={x} y2={y - s} stroke={stroke} strokeWidth={1} />
          <line x1={x - r * 0.5} y1={y - s} x2={x + r * 0.5} y2={y - s} stroke={stroke} strokeWidth={1} />
        </g>
      );
    case 'transformer':
      return (
        <g>
          <rect x={x - r} y={y - r} width={s} height={s} fill="#F59E0B" stroke={stroke} strokeWidth={1} opacity={0.7} />
          <text x={x} y={y + s * 0.15} textAnchor="middle" fontSize={s * 0.5} fill="#000" fontWeight="bold">T</text>
        </g>
      );
    case 'guy_wire':
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.4} fill={stroke} />
          <line x1={x} y1={y - r * 0.4} x2={x} y2={y - s} stroke={stroke} strokeWidth={0.8} strokeDasharray="2,2" />
        </g>
      );
    case 'telephone_pedestal':
      return labeledCircle('TP');
    case 'cable_pedestal':
      return labeledCircle('CP');

    // ── Improvements ──
    case 'building_corner':
      return (
        <g>
          <line x1={x} y1={y - r} x2={x} y2={y} stroke={stroke} strokeWidth={1.5} />
          <line x1={x} y1={y} x2={x + r} y2={y} stroke={stroke} strokeWidth={1.5} />
          <circle cx={x} cy={y} r={1.5} fill={stroke} />
        </g>
      );
    case 'shed':
      return (
        <g>
          <rect x={x - r} y={y - r * 0.7} width={s} height={s * 0.7} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray="3,2" />
          <text x={x} y={y + s * 0.1} textAnchor="middle" fontSize={s * 0.4} fill={stroke}>SHED</text>
        </g>
      );
    case 'pool':
      return (
        <g>
          <ellipse cx={x} cy={y} rx={r * 1.3} ry={r * 0.9} fill="#BFDBFE" fillOpacity={0.4} stroke="#2563EB" strokeWidth={1} />
          <text x={x} y={y + s * 0.15} textAnchor="middle" fontSize={s * 0.4} fill="#2563EB">POOL</text>
        </g>
      );
    case 'deck':
      return (
        <g>
          <rect x={x - r} y={y - r * 0.7} width={s} height={s * 0.7} fill="#DDD6B0" fillOpacity={0.3} stroke="#8B7355" strokeWidth={1} />
          <line x1={x - r} y1={y - r * 0.2} x2={x + r} y2={y - r * 0.2} stroke="#8B7355" strokeWidth={0.5} />
          <line x1={x - r} y1={y + r * 0.2} x2={x + r} y2={y + r * 0.2} stroke="#8B7355" strokeWidth={0.5} />
        </g>
      );
    case 'patio':
      return (
        <g>
          <rect x={x - r} y={y - r * 0.7} width={s} height={s * 0.7} fill="#D1D5DB" fillOpacity={0.3} stroke="#6B7280" strokeWidth={1} />
          <text x={x} y={y + s * 0.1} textAnchor="middle" fontSize={s * 0.35} fill="#6B7280">PATIO</text>
        </g>
      );
    case 'driveway':
      return (
        <g>
          <rect x={x - r} y={y - r * 0.5} width={s} height={s * 0.5} fill="#D1D5DB" fillOpacity={0.4} stroke="#9CA3AF" strokeWidth={1} />
        </g>
      );
    case 'sidewalk':
      return (
        <g>
          <rect x={x - s * 0.7} y={y - r * 0.3} width={s * 1.4} height={s * 0.3} fill="none" stroke="#9CA3AF" strokeWidth={1} />
        </g>
      );
    case 'retaining_wall':
      return (
        <g>
          <line x1={x - s} y1={y} x2={x + s} y2={y} stroke={stroke} strokeWidth={2} />
          <line x1={x - s * 0.7} y1={y} x2={x - s * 0.7} y2={y + r * 0.5} stroke={stroke} strokeWidth={1} />
          <line x1={x} y1={y} x2={x} y2={y + r * 0.5} stroke={stroke} strokeWidth={1} />
          <line x1={x + s * 0.7} y1={y} x2={x + s * 0.7} y2={y + r * 0.5} stroke={stroke} strokeWidth={1} />
        </g>
      );
    case 'sign':
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y - s} stroke={stroke} strokeWidth={1} />
          <rect x={x - r * 0.7} y={y - s - r * 0.6} width={s * 0.7} height={r * 0.6} fill="none" stroke={stroke} strokeWidth={1} />
        </g>
      );
    case 'mailbox':
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y - r} stroke={stroke} strokeWidth={1} />
          <rect x={x - r * 0.5} y={y - s * 0.9} width={s * 0.5} height={r * 0.5} rx={1} fill={stroke} opacity={0.6} />
        </g>
      );
    case 'ac_unit':
      return (
        <g>
          <rect x={x - r} y={y - r} width={s} height={s} fill="none" stroke={stroke} strokeWidth={1} />
          <text x={x} y={y + s * 0.15} textAnchor="middle" fontSize={s * 0.4} fill={stroke}>AC</text>
        </g>
      );

    // ── Natural ──
    case 'tree':
      return <circle cx={x} cy={y} r={r} fill="#228B22" stroke="#006400" strokeWidth={1} opacity={0.7} />;
    case 'tree_line':
      return (
        <g>
          <circle cx={x - r * 0.6} cy={y} r={r * 0.5} fill="#228B22" stroke="#006400" strokeWidth={0.8} opacity={0.6} />
          <circle cx={x} cy={y - r * 0.3} r={r * 0.5} fill="#228B22" stroke="#006400" strokeWidth={0.8} opacity={0.6} />
          <circle cx={x + r * 0.6} cy={y} r={r * 0.5} fill="#228B22" stroke="#006400" strokeWidth={0.8} opacity={0.6} />
        </g>
      );
    case 'shrub':
      return <circle cx={x} cy={y} r={r * 0.6} fill="#90EE90" stroke="#228B22" strokeWidth={0.8} opacity={0.7} />;
    case 'stump':
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.6} fill="none" stroke="#8B4513" strokeWidth={1.2} />
          <line x1={x - r * 0.3} y1={y - r * 0.3} x2={x + r * 0.3} y2={y + r * 0.3} stroke="#8B4513" strokeWidth={0.8} />
          <line x1={x + r * 0.3} y1={y - r * 0.3} x2={x - r * 0.3} y2={y + r * 0.3} stroke="#8B4513" strokeWidth={0.8} />
        </g>
      );
    case 'pond':
      return <ellipse cx={x} cy={y} rx={r * 1.3} ry={r} fill="#BFDBFE" fillOpacity={0.5} stroke="#2563EB" strokeWidth={0.8} />;
    case 'creek':
      return (
        <path
          d={`M ${x - s} ${y} Q ${x - r} ${y - r * 0.5} ${x} ${y} Q ${x + r} ${y + r * 0.5} ${x + s} ${y}`}
          fill="none" stroke="#2563EB" strokeWidth={1.2}
        />
      );
    case 'swale':
      return (
        <path
          d={`M ${x - s} ${y - r * 0.3} L ${x} ${y + r * 0.3} L ${x + s} ${y - r * 0.3}`}
          fill="none" stroke="#059669" strokeWidth={1} strokeDasharray="4,2"
        />
      );
    case 'culvert':
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.7} fill="none" stroke={stroke} strokeWidth={1.5} />
          <line x1={x - s} y1={y} x2={x - r * 0.7} y2={y} stroke={stroke} strokeWidth={1} />
          <line x1={x + r * 0.7} y1={y} x2={x + s} y2={y} stroke={stroke} strokeWidth={1} />
        </g>
      );

    // ── Reference ──
    case 'north_arrow':
      return (
        <g>
          <polygon points={`${x},${y - s} ${x - r * 0.6},${y + r * 0.6} ${x + r * 0.6},${y + r * 0.6}`} fill={stroke} />
          <text x={x} y={y - s - 3} textAnchor="middle" fontSize={s * 0.7} fill={stroke} fontWeight="bold">N</text>
        </g>
      );
    case 'reference_point':
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill="none" stroke={stroke} strokeWidth={1.2} />
          <circle cx={x} cy={y} r={r * 0.3} fill={stroke} />
          <line x1={x - s} y1={y} x2={x - r} y2={y} stroke={stroke} strokeWidth={0.8} />
          <line x1={x + r} y1={y} x2={x + s} y2={y} stroke={stroke} strokeWidth={0.8} />
          <line x1={x} y1={y - s} x2={x} y2={y - r} stroke={stroke} strokeWidth={0.8} />
          <line x1={x} y1={y + r} x2={x} y2={y + s} stroke={stroke} strokeWidth={0.8} />
        </g>
      );
    case 'tie_point':
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.4} fill={stroke} />
          <circle cx={x} cy={y} r={r} fill="none" stroke={stroke} strokeWidth={0.8} strokeDasharray="2,2" />
        </g>
      );
    case 'spot_elevation':
      return (
        <g>
          <line x1={x - r * 0.5} y1={y + r * 0.5} x2={x + r * 0.5} y2={y + r * 0.5} stroke={stroke} strokeWidth={1} />
          <line x1={x} y1={y + r * 0.5} x2={x} y2={y - r * 0.2} stroke={stroke} strokeWidth={1} />
          <circle cx={x} cy={y - r * 0.2} r={1} fill={stroke} />
        </g>
      );
    case 'contour_label':
      return (
        <g>
          <line x1={x - s} y1={y} x2={x + s} y2={y} stroke={stroke} strokeWidth={0.8} />
          <rect x={x - r * 0.8} y={y - r * 0.5} width={s * 0.8} height={s * 0.5} fill="#FFF" stroke="none" />
          <text x={x} y={y + s * 0.1} textAnchor="middle" fontSize={s * 0.45} fill={stroke}>EL</text>
        </g>
      );

    default:
      return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={1} />;
  }
}

function renderDimensionLine(ann: UserAnnotation): JSX.Element {
  const p1 = ann.points[0];
  const p2 = ann.points[1];
  const dist = computeDistance(p1, p2);
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const s = ann.style;

  // Perpendicular offset for extension lines
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len * 8;
  const ny = dx / len * 8;

  return (
    <g>
      {/* Extension lines */}
      <line x1={p1.x} y1={p1.y} x2={p1.x + nx} y2={p1.y + ny} stroke={s.stroke} strokeWidth={0.5} />
      <line x1={p2.x} y1={p2.y} x2={p2.x + nx} y2={p2.y + ny} stroke={s.stroke} strokeWidth={0.5} />
      {/* Dimension line */}
      <line
        x1={p1.x + nx / 2} y1={p1.y + ny / 2}
        x2={p2.x + nx / 2} y2={p2.y + ny / 2}
        stroke={s.stroke} strokeWidth={s.strokeWidth}
      />
      {/* Ticks */}
      <line x1={p1.x + nx * 0.3} y1={p1.y + ny * 0.3} x2={p1.x + nx * 0.7} y2={p1.y + ny * 0.7} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      <line x1={p2.x + nx * 0.3} y1={p2.y + ny * 0.3} x2={p2.x + nx * 0.7} y2={p2.y + ny * 0.7} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      {/* Label */}
      <text
        x={midX + nx}
        y={midY + ny}
        fill={s.stroke}
        fontSize={s.fontSize || 10}
        fontFamily={s.fontFamily || 'Arial'}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {dist.toFixed(2)}&apos;
      </text>
    </g>
  );
}

// ── Utility Helpers ─────────────────────────────────────────────────────────

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function computeDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Return the closest point on segment [a,b] to point p.
 * Used by the snap system for "snap along line" behaviour.
 */
function closestPointOnSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function getAnnotationBounds(ann: UserAnnotation): { x: number; y: number; w: number; h: number } | null {
  if (ann.points.length === 0) return null;

  if (ann.type === 'image') {
    const w = ann.imageWidth || 100;
    const h = ann.imageHeight || 100;
    return { x: ann.points[0].x - w / 2, y: ann.points[0].y - h / 2, w, h };
  }

  if (ann.type === 'text') {
    const fontSize = ann.style.fontSize || 12;
    const textLen = (ann.text || '').length;
    const approxWidth = textLen * fontSize * 0.6;
    return { x: ann.points[0].x, y: ann.points[0].y - fontSize, w: approxWidth, h: fontSize * 1.3 };
  }

  if (ann.type === 'symbol') {
    const size = ann.symbolSize || 8;
    return { x: ann.points[0].x - size, y: ann.points[0].y - size, w: size * 2, h: size * 2 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ann.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const pad = 4;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

// ── Element Info Tooltip Component ───────────────────────────────────────────
// Shown after 2 seconds of hovering on a drawing element.
// Displays ALL available element details in a rich card.

/** Format a canvas coordinate pair for display in the tooltip */
function fmtCoord(c: [number, number]): string {
  return `(${c[0].toFixed(0)}, ${c[1].toFixed(0)})`;
}

function ElementInfoTooltip({ element }: { element: DrawingElement }): JSX.Element {
  const attrs = element.attributes as Record<string, unknown>;

  // Geometry summary
  const geom = element.geometry as Record<string, unknown>;
  let positionLine = '';
  if (geom.type === 'line') {
    const g = geom as { start?: [number, number]; end?: [number, number] };
    if (g.start && g.end)
      positionLine = `Start ${fmtCoord(g.start)}  →  End ${fmtCoord(g.end)}`;
  } else if (geom.type === 'point') {
    const g = geom as { position?: [number, number] };
    if (g.position)
      positionLine = `Position: ${fmtCoord(g.position)}`;
  } else if (geom.type === 'label') {
    const g = geom as { position?: [number, number]; anchor?: string };
    if (g.position)
      positionLine = `Position: ${fmtCoord(g.position)}  Anchor: ${g.anchor || 'middle'}`;
  } else if (geom.type === 'polygon') {
    const g = geom as { points?: [number, number][] };
    positionLine = `Polygon: ${g.points?.length ?? 0} vertices`;
  }

  // Bearing + distance for boundary lines
  const bearing = attrs.bearing as { raw_text?: string; decimal_degrees?: number; azimuth?: number } | undefined;
  const distance = attrs.distance as { value?: number; unit?: string; value_in_feet?: number } | undefined;
  const rotation = attrs.rotation as number | undefined;

  // Style info
  const style = element.style as unknown as Record<string, unknown>;

  const rows: { label: string; value: string }[] = [];

  if (element.element_type !== 'label') rows.push({ label: 'Type', value: element.element_type.replace(/_/g, ' ') });
  if (bearing?.raw_text) rows.push({ label: 'Bearing', value: bearing.raw_text });
  if (bearing?.azimuth !== undefined) rows.push({ label: 'Azimuth', value: `${bearing.azimuth.toFixed(4)}°` });
  if (distance?.value !== undefined) rows.push({ label: 'Distance', value: `${distance.value.toFixed(2)} ${distance.unit || 'ft'}` });
  // Show converted-to-feet row only when unit is NOT feet/ft
  if (distance?.value_in_feet !== undefined && distance.unit && !['feet', 'ft'].includes(distance.unit))
    rows.push({ label: 'In Feet', value: `${distance.value_in_feet.toFixed(2)} ft` });
  if (rotation !== undefined && rotation !== 0) rows.push({ label: 'Rotation', value: `${rotation}°` });
  if (attrs.text && element.element_type === 'label') rows.push({ label: 'Text', value: String(attrs.text) });
  if (attrs.type) rows.push({ label: 'Subtype', value: String(attrs.type) });
  if (attrs.condition) rows.push({ label: 'Condition', value: String(attrs.condition) });
  if (attrs.display && attrs.display !== attrs.type) rows.push({ label: 'Label', value: String(attrs.display) });
  if (attrs.width) rows.push({ label: 'Width', value: `${attrs.width} ft` });
  if (positionLine) rows.push({ label: 'Geometry', value: positionLine });
  rows.push({ label: 'Layer', value: element.layer });
  rows.push({ label: 'Z-Index', value: String(element.z_index) });
  if (style.stroke) rows.push({ label: 'Stroke', value: String(style.stroke) });
  if (style.strokeWidth) rows.push({ label: 'Line Width', value: String(style.strokeWidth) });
  if (style.fill && style.fill !== 'none') rows.push({ label: 'Fill', value: String(style.fill) });
  rows.push({ label: 'Confidence', value: `${Math.round(element.confidence_score)}%` });
  if (element.discrepancy_ids.length > 0) rows.push({ label: '⚠ Discrepancies', value: String(element.discrepancy_ids.length) });
  if (element.user_modified) rows.push({ label: '✎ Modified', value: 'User edited' });
  if (element.locked) rows.push({ label: '🔒 Locked', value: 'Yes' });

  return (
    <div className="research-canvas__tooltip-card">
      <div className="research-canvas__tooltip-title">
        {element.feature_class.replace(/_/g, ' ')}
      </div>
      <table className="research-canvas__tooltip-table">
        <tbody>
          {rows.map(({ label, value }) => (
            <tr key={label}>
              <td className="research-canvas__tooltip-label">{label}</td>
              <td className="research-canvas__tooltip-value">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
