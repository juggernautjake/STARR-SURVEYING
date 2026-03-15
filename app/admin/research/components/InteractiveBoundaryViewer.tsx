// app/admin/research/components/InteractiveBoundaryViewer.tsx
'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoundaryPoint {
  x: number;
  y: number;
}

export interface BoundarySegment {
  id: string;
  callIndex: number;
  bearing: string;
  distance: number;
  distanceUnit: 'feet' | 'varas' | 'chains' | 'meters';
  startPoint: BoundaryPoint;
  endPoint: BoundaryPoint;
  confidence: number;
  sources: string[];
  isResolved: boolean;
  hasDiscrepancy: boolean;
  featureClass: 'property_boundary' | 'easement' | 'setback' | 'right_of_way' | 'road' | 'other';
}

export interface BoundaryViewerProps {
  projectId: string;
  segments: BoundarySegment[];
  width?: number;
  height?: number;
  showConfidenceOverlay?: boolean;
  visibleLayers?: ('boundary' | 'easement' | 'setback' | 'row' | 'labels')[];
  onSegmentClick?: (segment: BoundarySegment) => void;
  onMeasure?: (distanceFt: number) => void;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FEATURE_CLASS_LAYER: Record<BoundarySegment['featureClass'], 'boundary' | 'easement' | 'setback' | 'row'> = {
  property_boundary: 'boundary',
  easement:          'easement',
  setback:           'setback',
  right_of_way:      'row',
  road:              'row',
  other:             'boundary',
};

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return '#16a34a';
  if (confidence >= 60) return '#ca8a04';
  if (confidence >= 40) return '#ea580c';
  return '#dc2626';
}

function featureClassColor(fc: BoundarySegment['featureClass']): string {
  switch (fc) {
    case 'easement':      return '#7c3aed';
    case 'setback':       return '#0284c7';
    case 'right_of_way':  return '#b45309';
    case 'road':          return '#6b7280';
    default:              return '#475569';
  }
}

function midpoint(a: BoundaryPoint, b: BoundaryPoint): BoundaryPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NorthArrow({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} style={{ pointerEvents: 'none' }}>
      <circle cx={0} cy={0} r={20} fill="#1e293b" stroke="#475569" strokeWidth={1} />
      <polygon points="0,-14 5,6 0,2 -5,6" fill="#f1f5f9" />
      <polygon points="0,-14 5,6 0,2 -5,6" fill="#64748b" transform="rotate(180)" />
      <text x={0} y={-18} textAnchor="middle" fill="#f1f5f9" fontSize={9} fontWeight="bold">N</text>
    </g>
  );
}

interface TooltipData {
  x: number;
  y: number;
  segment: BoundarySegment;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InteractiveBoundaryViewer({
  projectId: _projectId,
  segments,
  width = 800,
  height = 560,
  showConfidenceOverlay: initialShowConfidence = false,
  visibleLayers: initialVisibleLayers = ['boundary', 'easement', 'setback', 'row', 'labels'],
  onSegmentClick,
  onMeasure,
  className = '',
}: BoundaryViewerProps) {
  // ── View transform state ──
  const [pan, setPan]   = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isPanning       = useRef(false);
  const panStart        = useRef({ x: 0, y: 0 });
  const panOrigin       = useRef({ x: 0, y: 0 });
  const svgRef          = useRef<SVGSVGElement>(null);

  // ── UI state ──
  const [selectedId, setSelectedId]               = useState<string | null>(null);
  const [tooltip, setTooltip]                     = useState<TooltipData | null>(null);
  const [showConfidence, setShowConfidence]        = useState(initialShowConfidence);
  const [visibleLayers, setVisibleLayers]          = useState<Set<string>>(new Set(initialVisibleLayers));
  const [measureMode, setMeasureMode]              = useState(false);
  const [measurePts, setMeasurePts]                = useState<BoundaryPoint[]>([]);
  const [measuredDistance, setMeasuredDistance]    = useState<number | null>(null);

  // ── Auto-fit: compute a transform that fits all segments ──
  const fitTransform = useMemo(() => {
    if (segments.length === 0) return { scale: 1, tx: 0, ty: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const seg of segments) {
      for (const pt of [seg.startPoint, seg.endPoint]) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }

    const padding = 60;
    const dataW = maxX - minX || 1;
    const dataH = maxY - minY || 1;
    const viewW = width  - padding * 2;
    const viewH = height - padding * 2;
    const scale = Math.min(viewW / dataW, viewH / dataH);
    const tx = padding + (viewW - dataW * scale) / 2 - minX * scale;
    const ty = padding + (viewH - dataH * scale) / 2 - minY * scale;

    return { scale, tx, ty };
  }, [segments, width, height]);

  // Apply fit on first load / segments change
  useEffect(() => {
    setZoom(fitTransform.scale);
    setPan({ x: fitTransform.tx, y: fitTransform.ty });
  }, [fitTransform]);

  // ── Scale bar in feet ──
  const scaleBarFt = useMemo(() => {
    // Pick a nice round number of feet that maps to ~80px at current zoom
    const targetPx = 80;
    const rawFt = targetPx / zoom;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawFt)));
    const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].map(c => c * magnitude);
    const chosen = candidates.find(c => c * zoom >= 60) ?? candidates[0];
    return { feet: chosen, px: chosen * zoom };
  }, [zoom]);

  // ── Layer toggle ──
  const toggleLayer = useCallback((layer: string) => {
    setVisibleLayers(prev => {
      const next = new Set(prev);
      next.has(layer) ? next.delete(layer) : next.add(layer);
      return next;
    });
  }, []);

  // ── Filter segments by layer visibility ──
  const visibleSegments = useMemo(
    () => segments.filter(seg => {
      const layer = FEATURE_CLASS_LAYER[seg.featureClass];
      return visibleLayers.has(layer);
    }),
    [segments, visibleLayers],
  );

  // ── Transform helpers ──
  function svgPoint(clientX: number, clientY: number): BoundaryPoint {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  const svgToWorld = useCallback((pt: BoundaryPoint): BoundaryPoint => {
    return { x: (pt.x - pan.x) / zoom, y: (pt.y - pan.y) / zoom };
  }, [pan, zoom]);

  // ── Pan handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (measureMode) return;
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current  = { x: e.clientX, y: e.clientY };
    panOrigin.current = { x: pan.x, y: pan.y };
    e.currentTarget.style.cursor = 'grabbing';
  }, [measureMode, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
    }
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    isPanning.current = false;
    e.currentTarget.style.cursor = measureMode ? 'crosshair' : 'grab';
  }, [measureMode]);

  // ── Zoom via wheel ──
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const pt = svgPoint(e.clientX, e.clientY);
    setZoom(z => {
      const newZoom = Math.min(Math.max(z * factor, 0.05), 80);
      setPan(p => ({
        x: pt.x - (pt.x - p.x) * (newZoom / z),
        y: pt.y - (pt.y - p.y) * (newZoom / z),
      }));
      return newZoom;
    });
  }, []);

  // ── Toolbar zoom buttons ──
  const zoomIn  = () => setZoom(z => Math.min(z * 1.25, 80));
  const zoomOut = () => setZoom(z => Math.max(z / 1.25, 0.05));
  const resetView = () => {
    setZoom(fitTransform.scale);
    setPan({ x: fitTransform.tx, y: fitTransform.ty });
  };

  // ── Measure tool: click on SVG background ──
  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!measureMode) return;
    const screen = svgPoint(e.clientX, e.clientY);
    const world  = svgToWorld(screen);

    setMeasurePts(prev => {
      const next = [...prev, world];
      if (next.length === 2) {
        const dxPx = (next[1].x - next[0].x);
        const dyPx = (next[1].y - next[0].y);
        const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
        // Assume 1 world unit = 1 foot (caller should scale segments accordingly)
        const distFt = distPx;
        setMeasuredDistance(distFt);
        onMeasure?.(distFt);
        return [];
      }
      setMeasuredDistance(null);
      return next;
    });
  }, [measureMode, onMeasure, svgToWorld]);

  // ── Segment interactions ──
  const handleSegmentClick = useCallback((e: React.MouseEvent, seg: BoundarySegment) => {
    e.stopPropagation();
    if (measureMode) return;
    setSelectedId(id => id === seg.id ? null : seg.id);
    onSegmentClick?.(seg);
  }, [measureMode, onSegmentClick]);

  const handleSegmentHover = useCallback((e: React.MouseEvent, seg: BoundarySegment) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, segment: seg });
  }, []);

  const handleSegmentLeave = useCallback(() => setTooltip(null), []);

  // ── Render ────────────────────────────────────────────────────────────────

  const transformStr = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;
  const invZoom      = 1 / zoom; // keep label sizes constant regardless of zoom

  const LAYER_DEFS: Array<{ key: string; label: string }> = [
    { key: 'boundary', label: 'Boundary' },
    { key: 'easement', label: 'Easements' },
    { key: 'setback',  label: 'Setbacks'  },
    { key: 'row',      label: 'ROW'       },
    { key: 'labels',   label: 'Labels'    },
  ];

  return (
    <div className={`flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-700 ${className}`}
         style={{ width, minHeight: height }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700 text-sm select-none">

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            title="Zoom out"
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-base transition-colors"
          >−</button>
          <button
            onClick={zoomIn}
            title="Zoom in"
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-base transition-colors"
          >+</button>
          <button
            onClick={resetView}
            title="Reset view"
            className="px-2 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors"
          >⌖ Fit</button>
        </div>

        <div className="w-px h-5 bg-slate-600" />

        {/* Confidence overlay toggle */}
        <button
          onClick={() => setShowConfidence(c => !c)}
          title="Toggle confidence color overlay"
          className={`px-2 h-7 flex items-center gap-1 rounded text-xs font-medium transition-colors ${
            showConfidence
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
          }`}
        >
          <span className="inline-block w-3 h-3 rounded-full"
                style={{ background: showConfidence ? '#16a34a' : '#475569' }} />
          Confidence
        </button>

        {/* Measure tool */}
        <button
          onClick={() => { setMeasureMode(m => !m); setMeasurePts([]); setMeasuredDistance(null); }}
          title="Measure distance between two clicked points"
          className={`px-2 h-7 flex items-center gap-1 rounded text-xs font-medium transition-colors ${
            measureMode
              ? 'bg-amber-600 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
          }`}
        >
          📏 Measure
        </button>

        {measuredDistance !== null && (
          <span className="text-amber-300 text-xs font-mono">
            {measuredDistance.toFixed(2)} ft
          </span>
        )}

        <div className="w-px h-5 bg-slate-600" />

        {/* Layer toggles */}
        <span className="text-slate-500 text-xs uppercase tracking-wider">Layers:</span>
        {LAYER_DEFS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1 cursor-pointer text-xs text-slate-300 hover:text-white select-none">
            <input
              type="checkbox"
              checked={visibleLayers.has(key)}
              onChange={() => toggleLayer(key)}
              className="w-3.5 h-3.5 rounded accent-blue-500"
            />
            {label}
          </label>
        ))}
      </div>

      {/* ── SVG viewport ─────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        <svg
          ref={svgRef}
          width={width}
          height={height - 41} // subtract toolbar height
          style={{ cursor: measureMode ? 'crosshair' : 'grab', display: 'block' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onClick={handleSvgClick}
        >
          <defs>
            <filter id="ibv-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background */}
          <rect width={width} height={height} fill="#0f172a" />

          <g transform={transformStr}>

            {/* ── Segments ── */}
            {visibleSegments.map(seg => {
              const isSelected  = seg.id === selectedId;
              const strokeColor = showConfidence
                ? confidenceColor(seg.confidence)
                : featureClassColor(seg.featureClass);
              const strokeWidth = isSelected ? 4 * invZoom : (seg.featureClass === 'property_boundary' ? 2.5 * invZoom : 1.5 * invZoom);
              const dash = seg.featureClass === 'easement'
                ? `${6 * invZoom},${3 * invZoom}`
                : seg.featureClass === 'setback'
                ? `${3 * invZoom},${3 * invZoom}`
                : undefined;

              return (
                <g key={seg.id}>
                  {/* Wide invisible hit zone */}
                  <line
                    x1={seg.startPoint.x} y1={seg.startPoint.y}
                    x2={seg.endPoint.x}   y2={seg.endPoint.y}
                    stroke="transparent"
                    strokeWidth={14 * invZoom}
                    style={{ cursor: measureMode ? 'crosshair' : 'pointer' }}
                    onMouseEnter={e => handleSegmentHover(e, seg)}
                    onMouseLeave={handleSegmentLeave}
                    onClick={e => handleSegmentClick(e, seg)}
                  />

                  {/* Selected glow */}
                  {isSelected && (
                    <line
                      x1={seg.startPoint.x} y1={seg.startPoint.y}
                      x2={seg.endPoint.x}   y2={seg.endPoint.y}
                      stroke={strokeColor}
                      strokeWidth={8 * invZoom}
                      strokeOpacity={0.35}
                      filter="url(#ibv-glow)"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Visible line */}
                  <line
                    x1={seg.startPoint.x} y1={seg.startPoint.y}
                    x2={seg.endPoint.x}   y2={seg.endPoint.y}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dash}
                    strokeLinecap="round"
                    style={{ pointerEvents: 'none' }}
                  />

                  {/* Discrepancy indicator */}
                  {seg.hasDiscrepancy && (
                    <circle
                      cx={midpoint(seg.startPoint, seg.endPoint).x}
                      cy={midpoint(seg.startPoint, seg.endPoint).y - 10 * invZoom}
                      r={4 * invZoom}
                      fill="#dc2626"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                </g>
              );
            })}

            {/* ── Call-number badges ── */}
            {visibleSegments.map(seg => {
              const mp = midpoint(seg.startPoint, seg.endPoint);
              const r  = 7 * invZoom;
              return (
                <g key={`badge-${seg.id}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={mp.x} cy={mp.y} r={r} fill="#1e293b" stroke="#475569" strokeWidth={0.8 * invZoom} />
                  <text
                    x={mp.x} y={mp.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#cbd5e1"
                    fontSize={5.5 * invZoom}
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {seg.callIndex}
                  </text>
                </g>
              );
            })}

            {/* ── Labels (bearing/distance) ── */}
            {visibleLayers.has('labels') && visibleSegments.map(seg => {
              const mp     = midpoint(seg.startPoint, seg.endPoint);
              const dx     = seg.endPoint.x - seg.startPoint.x;
              const dy     = seg.endPoint.y - seg.startPoint.y;
              const angle  = Math.atan2(dy, dx) * (180 / Math.PI);
              const offset = -11 * invZoom;
              const unit   = seg.distanceUnit === 'feet' ? '\'' : seg.distanceUnit.charAt(0).toUpperCase();
              return (
                <text
                  key={`label-${seg.id}`}
                  x={mp.x}
                  y={mp.y}
                  textAnchor="middle"
                  dominantBaseline="auto"
                  fill="#94a3b8"
                  fontSize={5 * invZoom}
                  fontFamily="monospace"
                  transform={`rotate(${angle > 90 || angle < -90 ? angle + 180 : angle}, ${mp.x}, ${mp.y}) translate(0, ${offset})`}
                  style={{ pointerEvents: 'none' }}
                >
                  {seg.bearing} · {seg.distance.toFixed(2)}{unit}
                </text>
              );
            })}

            {/* ── Endpoint dots ── */}
            {visibleSegments.map(seg => (
              <g key={`pts-${seg.id}`} style={{ pointerEvents: 'none' }}>
                <circle cx={seg.startPoint.x} cy={seg.startPoint.y} r={3 * invZoom} fill="#64748b" />
                <circle cx={seg.endPoint.x}   cy={seg.endPoint.y}   r={3 * invZoom} fill="#64748b" />
              </g>
            ))}

            {/* ── Measure points & line ── */}
            {measurePts.map((pt, i) => (
              <circle key={`mpt-${i}`} cx={pt.x} cy={pt.y} r={5 * invZoom}
                fill="#f59e0b" stroke="#fff" strokeWidth={1.5 * invZoom}
                style={{ pointerEvents: 'none' }} />
            ))}
            {measurePts.length === 2 && (
              <line
                x1={measurePts[0].x} y1={measurePts[0].y}
                x2={measurePts[1].x} y2={measurePts[1].y}
                stroke="#f59e0b" strokeWidth={1.5 * invZoom} strokeDasharray={`${4 * invZoom},${3 * invZoom}`}
                style={{ pointerEvents: 'none' }}
              />
            )}

          </g>{/* end transform group */}

          {/* ── North arrow (fixed position, screen space) ── */}
          <NorthArrow x={width - 34} y={height - 74} />

          {/* ── Scale bar (screen space) ── */}
          <g style={{ pointerEvents: 'none' }} transform={`translate(16, ${height - 74})`}>
            <rect x={0} y={8} width={scaleBarFt.px} height={5} fill="#94a3b8" rx={1} />
            <rect x={0} y={8} width={scaleBarFt.px / 2} height={5} fill="#1e293b" rx={1} />
            <line x1={0} y1={6} x2={0} y2={16} stroke="#94a3b8" strokeWidth={1.5} />
            <line x1={scaleBarFt.px} y1={6} x2={scaleBarFt.px} y2={16} stroke="#94a3b8" strokeWidth={1.5} />
            <text x={scaleBarFt.px / 2} y={4} textAnchor="middle" fill="#94a3b8" fontSize={9} fontFamily="monospace">
              {scaleBarFt.feet.toLocaleString()} ft
            </text>
          </g>

          {/* ── Empty state ── */}
          {segments.length === 0 && (
            <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central"
                  fill="#475569" fontSize={14} fontFamily="sans-serif">
              No boundary segments to display
            </text>
          )}

          {/* ── Measure hint ── */}
          {measureMode && measurePts.length === 0 && (
            <text x={width / 2} y={28} textAnchor="middle" fill="#fbbf24" fontSize={12} fontFamily="sans-serif">
              Click two points to measure distance
            </text>
          )}
          {measureMode && measurePts.length === 1 && (
            <text x={width / 2} y={28} textAnchor="middle" fill="#fbbf24" fontSize={12} fontFamily="sans-serif">
              Click second point…
            </text>
          )}

        </svg>

        {/* ── Hover Tooltip ── */}
        {tooltip && (
          <div
            className="absolute z-50 pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="bg-slate-800 border border-slate-600 rounded-md shadow-xl px-3 py-2 text-xs text-slate-100 min-w-[180px]">
              <div className="font-semibold text-blue-300 mb-1">
                Call #{tooltip.segment.callIndex}
              </div>
              <div className="font-mono text-slate-200 mb-0.5">{tooltip.segment.bearing}</div>
              <div className="text-slate-300 mb-0.5">
                {tooltip.segment.distance.toFixed(2)} {tooltip.segment.distanceUnit}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                      style={{ background: confidenceColor(tooltip.segment.confidence) }} />
                <span className="text-slate-300">
                  Confidence: <span className="font-semibold text-white">{tooltip.segment.confidence}%</span>
                </span>
              </div>
              {tooltip.segment.sources.length > 0 && (
                <div className="text-slate-400 mt-1">
                  Sources: {tooltip.segment.sources.join(', ')}
                </div>
              )}
              {tooltip.segment.hasDiscrepancy && (
                <div className="text-red-400 mt-1 font-medium">⚠ Discrepancy flagged</div>
              )}
              {tooltip.segment.isResolved && (
                <div className="text-green-400 mt-0.5">✓ Resolved</div>
              )}
            </div>
          </div>
        )}

        {/* ── Selected segment detail bar ── */}
        {selectedId && (() => {
          const seg = segments.find(s => s.id === selectedId);
          if (!seg) return null;
          return (
            <div className="absolute bottom-0 left-0 right-0 bg-slate-800/95 border-t border-slate-600 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-200 backdrop-blur-sm">
              <span className="font-semibold text-blue-300">Call #{seg.callIndex}</span>
              <span className="font-mono">{seg.bearing}</span>
              <span>{seg.distance.toFixed(2)} {seg.distanceUnit}</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block"
                      style={{ background: confidenceColor(seg.confidence) }} />
                {seg.confidence}% confidence
              </span>
              <span className="text-slate-400">
                {seg.featureClass.replace(/_/g, ' ')}
              </span>
              {seg.sources.length > 0 && (
                <span className="text-slate-400">Sources: {seg.sources.join(', ')}</span>
              )}
              {seg.hasDiscrepancy && <span className="text-red-400 font-medium">⚠ Discrepancy</span>}
              {seg.isResolved    && <span className="text-green-400">✓ Resolved</span>}
              <button
                onClick={() => setSelectedId(null)}
                className="ml-auto text-slate-400 hover:text-slate-100 transition-colors text-base leading-none"
                title="Deselect"
              >×</button>
            </div>
          );
        })()}
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 bg-slate-800/70 border-t border-slate-700 text-xs text-slate-400">
        {showConfidence ? (
          <>
            <span className="font-medium text-slate-300 mr-1">Confidence:</span>
            {[
              { color: '#16a34a', label: '≥80%' },
              { color: '#ca8a04', label: '60–79%' },
              { color: '#ea580c', label: '40–59%' },
              { color: '#dc2626', label: '<40%' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-3 h-0.5 inline-block" style={{ background: color, display: 'inline-block' }} />
                {label}
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="font-medium text-slate-300 mr-1">Layers:</span>
            {[
              { color: '#475569', label: 'Boundary' },
              { color: '#7c3aed', label: 'Easement', dash: true },
              { color: '#0284c7', label: 'Setback',  dot: true  },
              { color: '#b45309', label: 'ROW' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-4 h-0.5 inline-block" style={{ background: color }} />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block bg-red-600" />
              Discrepancy
            </span>
          </>
        )}
        <span className="ml-auto text-slate-600">Scroll to zoom · drag to pan</span>
      </div>
    </div>
  );
}
