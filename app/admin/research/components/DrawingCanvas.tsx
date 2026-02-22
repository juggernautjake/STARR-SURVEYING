// app/admin/research/components/DrawingCanvas.tsx — Interactive SVG canvas with full drawing tools
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
}

// ── Props ───────────────────────────────────────────────────────────────────

interface DrawingCanvasProps {
  drawing: RenderedDrawing;
  elements: DrawingElement[];
  viewMode: ViewMode;
  svgContent: string;
  preferences?: Partial<DrawingPreferences>;
  activeTool: DrawingTool;
  toolSettings: ToolSettings;
  onElementClick: (element: DrawingElement) => void;
  onElementModified?: (elementId: string, changes: Partial<DrawingElement>) => void;
  annotations: UserAnnotation[];
  onAnnotationsChange: (annotations: UserAnnotation[]) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
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
  onElementClick,
  onElementModified,
  annotations,
  onAnnotationsChange,
  zoom: externalZoom,
  onZoomChange,
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
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Touch zoom state
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);
  const [touchStartZoom, setTouchStartZoom] = useState(1);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Text input overlay state
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    element: DrawingElement | null;
    annotationId: string | null;
  } | null>(null);

  // Resize handles state
  const [resizing, setResizing] = useState<{
    annotationId: string;
    handle: string;  // e.g. 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    startMouse: { x: number; y: number };
    startBounds: { x: number; y: number; w: number; h: number };
  } | null>(null);

  // Measurement state
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);

  const showTooltips = preferences?.showTooltips !== false;
  const highlightOnHover = preferences?.highlightOnHover !== false;

  // Build element lookup map
  const elementMap = useMemo(() => {
    const map = new Map<string, DrawingElement>();
    for (const el of elements) map.set(el.id, el);
    return map;
  }, [elements]);

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

  // ── Annotation Helpers ──────────────────────────────────────────────────

  function addAnnotation(annotation: UserAnnotation) {
    onAnnotationsChange([...annotations, annotation]);
  }

  function updateAnnotation(id: string, changes: Partial<UserAnnotation>) {
    onAnnotationsChange(annotations.map(a => a.id === id ? { ...a, ...changes } : a));
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

  // ── Tool: Freehand / Line / Shape Drawing ───────────────────────────────

  const handleDrawStart = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'select' || activeTool === 'pan' || activeTool === 'eraser') return;
    if (e.button !== 0) return; // left click only

    const svgPt = clientToSvg(e.clientX, e.clientY);

    // Text tools: place text input overlay
    if (activeTool === 'text_type') {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setTextInput({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          value: '',
        });
        setTimeout(() => textInputRef.current?.focus(), 50);
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

    // Start drawing
    setIsDrawing(true);
    setCurrentPoints([svgPt]);
  }, [activeTool, clientToSvg, measureStart]);

  const handleDrawMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) {
      // Update measure preview
      if (activeTool === 'measure' && measureStart) {
        setMeasureEnd(clientToSvg(e.clientX, e.clientY));
      }
      return;
    }

    const svgPt = clientToSvg(e.clientX, e.clientY);

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
  }, [isDrawing, activeTool, clientToSvg, measureStart]);

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
  }, [isDrawing, currentPoints, activeTool, toolSettings, annotations]);

  // Double-click to finish polyline
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'polyline' && isDrawing && currentPoints.length >= 2) {
      const newAnnotation: UserAnnotation = {
        id: generateId(),
        type: 'polyline',
        points: currentPoints,
        style: {
          stroke: toolSettings.strokeColor,
          strokeWidth: toolSettings.strokeWidth,
          strokeDasharray: toolSettings.dashPattern,
          fill: 'none',
          opacity: toolSettings.opacity,
        },
        zIndex: getMaxZIndex() + 1,
      };
      addAnnotation(newAnnotation);
      setIsDrawing(false);
      setCurrentPoints([]);
    }
  }, [activeTool, isDrawing, currentPoints, toolSettings, annotations]);

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
  }, [textInput, clientToSvg, toolSettings, annotations]);

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
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  }, [clientToSvg, zoom, toolSettings, annotations]);

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
          if (rect) {
            setTooltip({
              x: e.clientX - rect.left + 12,
              y: e.clientY - rect.top - 35,
              text: getTooltipText(element),
            });
          }
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
    setTooltip(null);
  }, [highlightOnHover]);

  // Zoom with scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, zoom * delta));

    const scale = newZoom / zoom;
    setPan(prev => ({
      x: mouseX - scale * (mouseX - prev.x),
      y: mouseY - scale * (mouseY - prev.y),
    }));

    setZoom(newZoom);
  }, [zoom, setZoom]);

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

    // Select tool — pan on empty space
    if (activeTool === 'select') {
      const target = e.target as SVGElement;
      const elId = target.getAttribute('data-element-id')
        || target.closest('[data-element-id]')?.getAttribute('data-element-id');
      const annId = target.getAttribute('data-annotation-id')
        || target.closest('[data-annotation-id]')?.getAttribute('data-annotation-id');

      if (!elId && !annId) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }
  }, [pan, activeTool, handleDrawStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (isDrawing) {
      handleDrawMove(e);
      return;
    }
    handleSvgMouseMove(e);
  }, [isPanning, panStart, isDrawing, handleDrawMove, handleSvgMouseMove]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
      setDragStartPos(null);
      return;
    }
    if (isDrawing && activeTool !== 'polyline') {
      handleDrawEnd();
      setDragStartPos(null);
      return;
    }
    setDragStartPos(null);
  }, [isPanning, isDrawing, activeTool, handleDrawEnd]);

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
      setZoom(Math.max(0.1, Math.min(10, touchStartZoom * scale)));
    } else if (e.touches.length === 1 && isPanning) {
      setPan({ x: e.touches[0].clientX - panStart.x, y: e.touches[0].clientY - panStart.y });
    }
  }, [isPanning, panStart, touchStartDist, touchStartZoom, setZoom]);

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

    setContextMenu({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      element,
      annotationId: annId || null,
    });
  }, [elementMap]);

  const handleContextMenuAction = useCallback((action: ContextMenuAction, element: DrawingElement | null) => {
    // Handle actions on annotations
    if (contextMenu?.annotationId) {
      const annId = contextMenu.annotationId;
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
          const orig = annotations.find(a => a.id === annId);
          if (orig) {
            addAnnotation({
              ...orig,
              id: generateId(),
              points: orig.points.map(p => ({ x: p.x + 15, y: p.y + 15 })),
              zIndex: getMaxZIndex() + 1,
            });
          }
          break;
        }
      }
    }

    // Handle actions on drawing elements
    if (element) {
      switch (action) {
        case 'view_details':
          onElementClick(element);
          break;
        case 'hide':
          onElementModified?.(element.id, { visible: false } as any);
          break;
        case 'show':
          onElementModified?.(element.id, { visible: true } as any);
          break;
        case 'lock':
          onElementModified?.(element.id, { locked: true } as any);
          break;
        case 'unlock':
          onElementModified?.(element.id, { locked: false } as any);
          break;
        case 'edit_style':
          onElementClick(element); // opens detail panel with style editor
          break;
        case 'copy_coords': {
          const attrs = element.attributes as Record<string, any>;
          const text = JSON.stringify(attrs.coordinates || attrs.start_point || attrs.center || {}, null, 2);
          navigator.clipboard?.writeText(text);
          break;
        }
      }
    }

    setContextMenu(null);
  }, [contextMenu, annotations, elements, onElementClick, onElementModified]);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Zoom
      if (e.key === '+' || e.key === '=') setZoom(prev => prev * 1.2);
      else if (e.key === '-') setZoom(prev => prev / 1.2);
      else if (e.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }

      // Delete selected annotation
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
        deleteAnnotation(selectedAnnotationId);
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
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setZoom, selectedAnnotationId, annotations]);

  // ── Cursor ──────────────────────────────────────────────────────────────

  function getCursor(): string {
    if (isPanning) return 'grabbing';
    switch (activeTool) {
      case 'pan': return 'grab';
      case 'select': return 'default';
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
  const svgWidth = drawing.svg_width || 1200;
  const svgHeight = drawing.svg_height || 800;

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
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setIsPanning(false); setDragStartPos(null); handleSvgMouseLeave(); }}
        onClick={handleElementClick}
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
          dangerouslySetInnerHTML={{ __html: svgContent }}
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
          {annotations
            .sort((a, b) => a.zIndex - b.zIndex)
            .map(ann => (
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
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="research-canvas__tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
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
            onAction={handleContextMenuAction}
            onClose={() => setContextMenu(null)}
          />
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
          d={pointsToPath(ann.points)}
          stroke={s.stroke} strokeWidth={s.strokeWidth}
          strokeLinecap="round" strokeLinejoin="round"
          fill="none"
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
  const size = ann.symbolSize || 8;
  const stroke = ann.style.stroke;
  const fill = ann.style.fill === 'none' ? stroke : ann.style.fill;

  switch (ann.symbolType) {
    case 'iron_rod':
    case 'iron_pipe':
    case 'rebar':
      return <circle cx={x} cy={y} r={size / 2} fill={fill} stroke={stroke} strokeWidth={1} />;

    case 'concrete_monument':
      return <rect x={x - size / 2} y={y - size / 2} width={size} height={size} fill={fill} stroke={stroke} strokeWidth={1} />;

    case 'nail':
    case 'pk_nail':
      return (
        <polygon
          points={`${x},${y - size / 2} ${x + size / 2},${y + size / 2} ${x - size / 2},${y + size / 2}`}
          fill={fill} stroke={stroke} strokeWidth={1}
        />
      );

    case 'utility_pole':
      return (
        <g>
          <circle cx={x} cy={y} r={size / 2} fill="none" stroke={stroke} strokeWidth={1.5} />
          <line x1={x - size / 2} y1={y} x2={x + size / 2} y2={y} stroke={stroke} strokeWidth={1} />
          <line x1={x} y1={y - size / 2} x2={x} y2={y + size / 2} stroke={stroke} strokeWidth={1} />
        </g>
      );

    case 'manhole':
      return (
        <g>
          <circle cx={x} cy={y} r={size / 2} fill="none" stroke={stroke} strokeWidth={1.5} />
          <text x={x} y={y + size * 0.15} textAnchor="middle" fontSize={size * 0.6} fill={stroke}>MH</text>
        </g>
      );

    case 'fire_hydrant':
      return (
        <g>
          <circle cx={x} cy={y} r={size / 2} fill="#FF0000" stroke={stroke} strokeWidth={1} />
          <text x={x} y={y + size * 0.15} textAnchor="middle" fontSize={size * 0.5} fill="#FFF">FH</text>
        </g>
      );

    case 'tree':
      return (
        <g>
          <circle cx={x} cy={y} r={size / 2} fill="#228B22" stroke="#006400" strokeWidth={1} opacity={0.7} />
        </g>
      );

    case 'fence_post':
      return (
        <g>
          <line x1={x - size / 3} y1={y - size / 3} x2={x + size / 3} y2={y + size / 3} stroke={stroke} strokeWidth={1.5} />
          <line x1={x + size / 3} y1={y - size / 3} x2={x - size / 3} y2={y + size / 3} stroke={stroke} strokeWidth={1.5} />
        </g>
      );

    case 'north_arrow':
      return (
        <g>
          <polygon points={`${x},${y - size} ${x - size / 3},${y + size / 3} ${x + size / 3},${y + size / 3}`} fill={stroke} />
          <text x={x} y={y - size - 3} textAnchor="middle" fontSize={size * 0.7} fill={stroke} fontWeight="bold">N</text>
        </g>
      );

    case 'benchmark':
      return (
        <g>
          <polygon points={`${x},${y - size / 2} ${x + size / 2},${y + size / 2} ${x - size / 2},${y + size / 2}`} fill="none" stroke={stroke} strokeWidth={1.5} />
          <circle cx={x} cy={y + size / 6} r={size / 5} fill={stroke} />
        </g>
      );

    default:
      return <circle cx={x} cy={y} r={size / 2} fill={fill} stroke={stroke} strokeWidth={1} />;
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

function getTooltipText(element: DrawingElement): string {
  const attrs = element.attributes as Record<string, unknown>;
  const parts: string[] = [];

  parts.push(element.feature_class.replace(/_/g, ' '));

  if (element.element_type === 'line' && element.feature_class === 'property_boundary') {
    if (attrs.bearing) {
      const b = attrs.bearing as { raw_text?: string };
      parts.push(b.raw_text || '');
    }
    if (attrs.distance) {
      const d = attrs.distance as { value?: number; unit?: string };
      parts.push(`${d.value?.toFixed(2) || ''} ${d.unit || 'ft'}`);
    }
  } else if (element.element_type === 'point' && element.feature_class === 'monument') {
    parts.push(String(attrs.display || attrs.type || ''));
  } else if (attrs.text) {
    parts.push(String(attrs.text));
  }

  parts.push(`${Math.round(element.confidence_score)}% confidence`);

  return parts.filter(Boolean).join(' | ');
}
