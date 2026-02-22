// app/admin/research/components/DrawingCanvas.tsx — Interactive SVG canvas for plat drawings
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { RenderedDrawing, DrawingElement, ViewMode } from '@/types/research';

interface DrawingCanvasProps {
  drawing: RenderedDrawing;
  elements: DrawingElement[];
  viewMode: ViewMode;
  svgContent: string;
  onElementClick: (element: DrawingElement) => void;
  onElementModified?: (elementId: string, changes: Partial<DrawingElement>) => void;
}

export default function DrawingCanvas({
  drawing,
  elements,
  viewMode,
  svgContent,
  onElementClick,
  onElementModified,
}: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Build element lookup map
  const elementMap = useMemo(() => {
    const map = new Map<string, DrawingElement>();
    for (const el of elements) {
      map.set(el.id, el);
    }
    return map;
  }, [elements]);

  // Handle element click
  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as SVGElement;
    const elId = target.getAttribute('data-element-id')
      || target.closest('[data-element-id]')?.getAttribute('data-element-id');

    if (elId) {
      const element = elementMap.get(elId);
      if (element) {
        onElementClick(element);
      }
    }
  }, [elementMap, onElementClick]);

  // Handle hover for tooltips
  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as SVGElement;
    const elId = target.getAttribute('data-element-id')
      || target.closest('[data-element-id]')?.getAttribute('data-element-id');

    if (elId && elId !== hoveredId) {
      setHoveredId(elId);
      const element = elementMap.get(elId);
      if (element) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltip({
            x: e.clientX - rect.left + 10,
            y: e.clientY - rect.top - 30,
            text: getTooltipText(element),
          });
        }
      }
    } else if (!elId) {
      setHoveredId(null);
      setTooltip(null);
    }
  }, [elementMap, hoveredId]);

  const handleSvgMouseLeave = useCallback(() => {
    setHoveredId(null);
    setTooltip(null);
  }, []);

  // Zoom with scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.1, Math.min(10, prev * delta)));
  }, []);

  // Pan with mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle-click or Alt+click for panning
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Keyboard zoom controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '+' || e.key === '=') {
        setZoom(prev => Math.min(10, prev * 1.2));
      } else if (e.key === '-') {
        setZoom(prev => Math.max(0.1, prev / 1.2));
      } else if (e.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fit to view
  const handleFitToView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div className="research-canvas">
      {/* Toolbar */}
      <div className="research-canvas__toolbar">
        <div className="research-canvas__toolbar-group">
          <button
            className="research-canvas__tool-btn"
            onClick={() => setZoom(prev => Math.min(10, prev * 1.3))}
            title="Zoom In (+)"
          >
            +
          </button>
          <span className="research-canvas__zoom-label">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="research-canvas__tool-btn"
            onClick={() => setZoom(prev => Math.max(0.1, prev / 1.3))}
            title="Zoom Out (-)"
          >
            -
          </button>
          <button
            className="research-canvas__tool-btn"
            onClick={handleFitToView}
            title="Fit to View (0)"
          >
            Fit
          </button>
        </div>

        <div className="research-canvas__toolbar-group">
          <span className="research-canvas__info">
            {elements.filter(e => e.visible).length} elements
          </span>
          {drawing.overall_confidence !== null && (
            <span className="research-canvas__info">
              {Math.round(drawing.overall_confidence)}% confidence
            </span>
          )}
        </div>

        <div className="research-canvas__toolbar-group">
          <span className="research-canvas__hint">
            Alt+drag to pan, scroll to zoom
          </span>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className={`research-canvas__viewport ${isPanning ? 'research-canvas__viewport--panning' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => { handleMouseMove(e); handleSvgMouseMove(e); }}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); handleSvgMouseLeave(); }}
      >
        <div
          className="research-canvas__svg-container"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
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
