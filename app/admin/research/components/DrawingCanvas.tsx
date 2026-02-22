// app/admin/research/components/DrawingCanvas.tsx — Interactive SVG canvas for plat drawings
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { RenderedDrawing, DrawingElement, ViewMode } from '@/types/research';
import type { DrawingPreferences } from './DrawingPreferencesPanel';

interface DrawingCanvasProps {
  drawing: RenderedDrawing;
  elements: DrawingElement[];
  viewMode: ViewMode;
  svgContent: string;
  preferences?: Partial<DrawingPreferences>;
  onElementClick: (element: DrawingElement) => void;
  onElementModified?: (elementId: string, changes: Partial<DrawingElement>) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

export default function DrawingCanvas({
  drawing,
  elements,
  viewMode,
  svgContent,
  preferences,
  onElementClick,
  onElementModified,
  zoom: externalZoom,
  onZoomChange,
}: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  const showTooltips = preferences?.showTooltips !== false;
  const highlightOnHover = preferences?.highlightOnHover !== false;

  // Build element lookup map
  const elementMap = useMemo(() => {
    const map = new Map<string, DrawingElement>();
    for (const el of elements) {
      map.set(el.id, el);
    }
    return map;
  }, [elements]);

  // Handle element click — only fire if mouse didn't move (wasn't a pan)
  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (dragStartPos) {
      const dx = Math.abs(e.clientX - dragStartPos.x);
      const dy = Math.abs(e.clientY - dragStartPos.y);
      if (dx > 5 || dy > 5) return; // was a drag, not a click
    }

    const target = e.target as SVGElement;
    const elId = target.getAttribute('data-element-id')
      || target.closest('[data-element-id]')?.getAttribute('data-element-id');

    if (elId) {
      const element = elementMap.get(elId);
      if (element) {
        onElementClick(element);
      }
    }
  }, [elementMap, onElementClick, dragStartPos]);

  // Handle hover for tooltips and highlighting
  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) return; // don't update tooltips while panning

    const target = e.target as SVGElement;
    const elId = target.getAttribute('data-element-id')
      || target.closest('[data-element-id]')?.getAttribute('data-element-id');

    if (elId && elId !== hoveredId) {
      setHoveredId(elId);

      // Highlight effect
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

      // Tooltip
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
      // Clear highlight
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
  }, [elementMap, hoveredId, isPanning, showTooltips, highlightOnHover]);

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

  // Zoom with scroll — zoom towards cursor position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, zoom * delta));

    // Adjust pan to zoom towards cursor
    const scale = newZoom / zoom;
    setPan(prev => ({
      x: mouseX - scale * (mouseX - prev.x),
      y: mouseY - scale * (mouseY - prev.y),
    }));

    setZoom(newZoom);
  }, [zoom, setZoom]);

  // Pan with any mouse drag on empty space, or middle-click/Alt+click anywhere
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragStartPos({ x: e.clientX, y: e.clientY });

    // Middle-click or Alt+click or right-click — always pan
    if (e.button === 1 || e.altKey || e.button === 2) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
      return;
    }

    // Left click — check if on empty space (not on an element)
    const target = e.target as SVGElement;
    const elId = target.getAttribute('data-element-id')
      || target.closest('[data-element-id]')?.getAttribute('data-element-id');

    if (!elId) {
      // Clicking empty space — start panning
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragStartPos(null);
  }, []);

  // Touch support: pinch-to-zoom and drag-to-pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setTouchStartDist(Math.sqrt(dx * dx + dy * dy));
      setTouchStartZoom(zoom);
    } else if (e.touches.length === 1) {
      // Pan start
      setIsPanning(true);
      setPanStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    }
  }, [zoom, pan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDist) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / touchStartDist;
      setZoom(Math.max(0.1, Math.min(10, touchStartZoom * scale)));
    } else if (e.touches.length === 1 && isPanning) {
      // Pan
      setPan({ x: e.touches[0].clientX - panStart.x, y: e.touches[0].clientY - panStart.y });
    }
  }, [isPanning, panStart, touchStartDist, touchStartZoom, setZoom]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
    setTouchStartDist(null);
  }, []);

  // Prevent context menu on canvas (right-click is for panning)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Keyboard zoom controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture if user is typing in an input
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

      if (e.key === '+' || e.key === '=') {
        setZoom(prev => prev * 1.2);
      } else if (e.key === '-') {
        setZoom(prev => prev / 1.2);
      } else if (e.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setZoom]);

  return (
    <div className="research-canvas">
      {/* Canvas area */}
      <div
        ref={containerRef}
        className={`research-canvas__viewport ${isPanning ? 'research-canvas__viewport--panning' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => { handleMouseMove(e); handleSvgMouseMove(e); }}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); handleSvgMouseLeave(); }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
        <div
          className="research-canvas__svg-container"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          onClick={handleSvgClick}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="research-canvas__tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTooltipText(element: DrawingElement): string {
  const attrs = element.attributes as Record<string, unknown>;
  const parts: string[] = [];

  // Feature class label
  parts.push(element.feature_class.replace(/_/g, ' '));

  // Type-specific info
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

  // Confidence
  parts.push(`${Math.round(element.confidence_score)}% confidence`);

  return parts.filter(Boolean).join(' | ');
}
