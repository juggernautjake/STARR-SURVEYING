// app/admin/components/jobs/FieldWorkView.tsx — Live field work visualization
// Point map + point log + timeline slider + session markers + detail popup
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/* ─── Types ─── */
export interface FieldPoint {
  id: string;
  data_type: string;
  point_name?: string;
  northing?: number;
  easting?: number;
  elevation?: number;
  description?: string;
  raw_data?: {
    accuracy?: number;
    rtk_status?: string;
    pdop?: number;
    hdop?: number;
    vdop?: number;
    satellites?: number;
    code?: string;
    session_id?: string;
    hz_angle?: number;
    vt_angle?: number;
    slope_dist?: number;
  };
  collected_by: string;
  collected_at: string;
  instrument?: string;
}

interface SessionMarker {
  type: 'end' | 'start';
  time: number;
  label: string;
}

interface FieldWorkViewProps {
  jobId: string;
  points: FieldPoint[];
  onRefresh: () => void;
}

/* ─── Constants ─── */
const DATA_TYPE_COLORS: Record<string, string> = {
  point: '#1D3095',
  observation: '#7C3AED',
  measurement: '#0891B2',
  gps_position: '#059669',
  total_station: '#D97706',
  photo: '#EC4899',
  note: '#6B7280',
};

const DATA_TYPE_LABELS: Record<string, string> = {
  point: 'Point',
  observation: 'Observation',
  measurement: 'Measurement',
  gps_position: 'GPS',
  total_station: 'TS',
  photo: 'Photo',
  note: 'Note',
};

const RTK_LABELS: Record<string, { label: string; color: string }> = {
  fixed: { label: 'Fixed', color: '#059669' },
  float: { label: 'Float', color: '#D97706' },
  dgps: { label: 'DGPS', color: '#0891B2' },
  autonomous: { label: 'Auto', color: '#EF4444' },
  sbas: { label: 'SBAS', color: '#7C3AED' },
};

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min gap = new session

/* ─── Helpers ─── */
function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function FieldWorkView({ jobId, points, onRefresh }: FieldWorkViewProps) {
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [detailPoint, setDetailPoint] = useState<FieldPoint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [timelineValue, setTimelineValue] = useState(1); // 0..1 normalized
  const [showLabels, setShowLabels] = useState({ name: true, elevation: false, code: false, accuracy: false, description: false });
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hoveredSession, setHoveredSession] = useState<SessionMarker | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<SVGSVGElement>(null);

  // Sort points chronologically
  const sortedPoints = useMemo(() =>
    [...points].sort((a, b) => new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime()),
    [points]
  );

  // Detect survey sessions (gaps > SESSION_GAP_MS)
  const sessionMarkers = useMemo(() => {
    const markers: SessionMarker[] = [];
    for (let i = 1; i < sortedPoints.length; i++) {
      const prev = new Date(sortedPoints[i - 1].collected_at).getTime();
      const curr = new Date(sortedPoints[i].collected_at).getTime();
      if (curr - prev > SESSION_GAP_MS) {
        markers.push({
          type: 'end',
          time: prev,
          label: `Survey ended ${formatDateTime(sortedPoints[i - 1].collected_at)}`,
        });
        markers.push({
          type: 'start',
          time: curr,
          label: `Survey restarted ${formatDateTime(sortedPoints[i].collected_at)}`,
        });
      }
    }
    return markers;
  }, [sortedPoints]);

  // Time range
  const timeRange = useMemo(() => {
    if (sortedPoints.length === 0) return { min: 0, max: 1 };
    const times = sortedPoints.map(p => new Date(p.collected_at).getTime());
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [sortedPoints]);

  // Points visible based on timeline slider
  const cutoffTime = timeRange.min + (timeRange.max - timeRange.min) * timelineValue;
  const visiblePoints = useMemo(() =>
    sortedPoints.filter(p => new Date(p.collected_at).getTime() <= cutoffTime),
    [sortedPoints, cutoffTime]
  );

  // Points that have coordinates for mapping
  const mappablePoints = useMemo(() =>
    visiblePoints.filter(p => p.northing != null && p.easting != null),
    [visiblePoints]
  );

  // Search filtering for the log
  const filteredPoints = useMemo(() => {
    if (!searchQuery.trim()) return visiblePoints;
    const q = searchQuery.toLowerCase();
    return visiblePoints.filter(p =>
      (p.point_name && p.point_name.toLowerCase().includes(q)) ||
      (p.raw_data?.code && p.raw_data.code.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.data_type && p.data_type.toLowerCase().includes(q))
    );
  }, [visiblePoints, searchQuery]);

  // Reversed for log display (newest first)
  const logPoints = useMemo(() => [...filteredPoints].reverse(), [filteredPoints]);

  // Bounding box for map
  const bounds = useMemo(() => {
    if (mappablePoints.length === 0) return { minN: 0, maxN: 100, minE: 0, maxE: 100 };
    const ns = mappablePoints.map(p => p.northing!);
    const es = mappablePoints.map(p => p.easting!);
    const minN = Math.min(...ns);
    const maxN = Math.max(...ns);
    const minE = Math.min(...es);
    const maxE = Math.max(...es);
    // Add 10% padding
    const padN = Math.max((maxN - minN) * 0.1, 5);
    const padE = Math.max((maxE - minE) * 0.1, 5);
    return { minN: minN - padN, maxN: maxN + padN, minE: minE - padE, maxE: maxE + padE };
  }, [mappablePoints]);

  // Map dimensions
  const MAP_W = 800;
  const MAP_H = 600;

  // Scale functions: survey coords → SVG coords
  const scaleE = useCallback((e: number) => {
    const range = bounds.maxE - bounds.minE || 1;
    return ((e - bounds.minE) / range) * MAP_W;
  }, [bounds]);

  const scaleN = useCallback((n: number) => {
    const range = bounds.maxN - bounds.minN || 1;
    // Invert Y because SVG Y goes down, but Northing goes up
    return MAP_H - ((n - bounds.minN) / range) * MAP_H;
  }, [bounds]);

  // Live polling
  useEffect(() => {
    if (!pollEnabled) return;
    const interval = setInterval(() => {
      onRefresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [pollEnabled, onRefresh]);

  // Scroll log to highlight selected point
  useEffect(() => {
    if (!selectedPointId || !logRef.current) return;
    const el = logRef.current.querySelector(`[data-point-id="${selectedPointId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedPointId]);

  function handlePointClick(pt: FieldPoint) {
    setSelectedPointId(prev => prev === pt.id ? null : pt.id);
  }

  function handlePointDoubleClick(pt: FieldPoint) {
    setDetailPoint(pt);
  }

  // Map pan handlers
  function handleMapMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - mapPan.x, y: e.clientY - mapPan.y });
  }
  function handleMapMouseMove(e: React.MouseEvent) {
    if (!isPanning) return;
    setMapPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }
  function handleMapMouseUp() { setIsPanning(false); }

  function handleMapWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setMapZoom(prev => Math.max(0.1, Math.min(20, prev * delta)));
  }

  function resetMapView() {
    setMapZoom(1);
    setMapPan({ x: 0, y: 0 });
  }

  function toggleLabel(key: keyof typeof showLabels) {
    setShowLabels(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Render accuracy badge
  function renderAccuracy(pt: FieldPoint) {
    const acc = pt.raw_data?.accuracy;
    if (acc == null) return null;
    const cls = acc <= 0.02 ? 'fw-log__acc--high' : acc <= 0.05 ? 'fw-log__acc--med' : 'fw-log__acc--low';
    return <span className={`fw-log__acc ${cls}`}>{(acc * 100).toFixed(1)}cm</span>;
  }

  // Render RTK badge
  function renderRtk(pt: FieldPoint) {
    const rtk = pt.raw_data?.rtk_status;
    if (!rtk) return null;
    const info = RTK_LABELS[rtk] || { label: rtk, color: '#6B7280' };
    return <span className="fw-log__rtk" style={{ background: info.color + '20', color: info.color }}>{info.label}</span>;
  }

  return (
    <div className="fw">
      {/* Controls bar */}
      <div className="fw__controls">
        <div className="fw__controls-left">
          <h3 className="fw__title">Field Data ({points.length} points)</h3>
          <label className="fw__poll-toggle">
            <input type="checkbox" checked={pollEnabled} onChange={e => setPollEnabled(e.target.checked)} />
            Live polling
          </label>
          {pollEnabled && <span className="fw__live-dot" />}
        </div>
        <div className="fw__controls-right">
          <button className="fw__btn" onClick={onRefresh}>Refresh</button>
          <button className="fw__btn" onClick={resetMapView}>Reset View</button>
        </div>
      </div>

      {/* Label toggles */}
      <div className="fw__label-toggles">
        <span className="fw__label-toggles-title">Show on map:</span>
        {(Object.keys(showLabels) as Array<keyof typeof showLabels>).map(key => (
          <label key={key} className="fw__label-toggle">
            <input type="checkbox" checked={showLabels[key]} onChange={() => toggleLabel(key)} />
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </label>
        ))}
      </div>

      {/* Main layout: Map + Log */}
      <div className="fw__layout">
        {/* Left: Map */}
        <div className="fw__map-container">
          {mappablePoints.length === 0 ? (
            <div className="fw__map-empty">
              <span className="fw__map-empty-icon">📡</span>
              <p>No coordinate data yet</p>
              <p className="fw__map-empty-sub">Points will appear on the map as field crew collects data with GPS or total station</p>
            </div>
          ) : (
            <svg
              ref={mapRef}
              className="fw__map-svg"
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              preserveAspectRatio="xMidYMid meet"
              onMouseDown={handleMapMouseDown}
              onMouseMove={handleMapMouseMove}
              onMouseUp={handleMapMouseUp}
              onMouseLeave={handleMapMouseUp}
              onWheel={handleMapWheel}
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            >
              {/* Background */}
              <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#FAFBFC" />

              {/* Grid lines */}
              <g opacity="0.15" stroke="#94A3B8" strokeWidth="0.5">
                {Array.from({ length: 11 }, (_, i) => {
                  const y = (MAP_H / 10) * i;
                  return <line key={`h${i}`} x1="0" y1={y} x2={MAP_W} y2={y} />;
                })}
                {Array.from({ length: 11 }, (_, i) => {
                  const x = (MAP_W / 10) * i;
                  return <line key={`v${i}`} x1={x} y1="0" x2={x} y2={MAP_H} />;
                })}
              </g>

              {/* Axis labels */}
              <text x="4" y="14" fill="#94A3B8" fontSize="9" fontFamily="monospace">
                N: {bounds.maxN.toFixed(1)}
              </text>
              <text x="4" y={MAP_H - 4} fill="#94A3B8" fontSize="9" fontFamily="monospace">
                N: {bounds.minN.toFixed(1)}
              </text>
              <text x={MAP_W - 4} y={MAP_H - 4} fill="#94A3B8" fontSize="9" fontFamily="monospace" textAnchor="end">
                E: {bounds.maxE.toFixed(1)}
              </text>
              <text x="4" y={MAP_H - 16} fill="#94A3B8" fontSize="9" fontFamily="monospace">
                E: {bounds.minE.toFixed(1)}
              </text>

              {/* Transform group for zoom/pan */}
              <g transform={`translate(${mapPan.x}, ${mapPan.y}) scale(${mapZoom})`}>
                {/* Connection lines between consecutive points */}
                {mappablePoints.length > 1 && mappablePoints.map((pt, i) => {
                  if (i === 0) return null;
                  const prev = mappablePoints[i - 1];
                  return (
                    <line
                      key={`line-${pt.id}`}
                      x1={scaleE(prev.easting!)}
                      y1={scaleN(prev.northing!)}
                      x2={scaleE(pt.easting!)}
                      y2={scaleN(pt.northing!)}
                      stroke="#CBD5E1"
                      strokeWidth={0.5 / mapZoom}
                      strokeDasharray={`${3 / mapZoom}`}
                    />
                  );
                })}

                {/* Points */}
                {mappablePoints.map(pt => {
                  const cx = scaleE(pt.easting!);
                  const cy = scaleN(pt.northing!);
                  const isSelected = selectedPointId === pt.id;
                  const color = DATA_TYPE_COLORS[pt.data_type] || '#1D3095';
                  const r = isSelected ? 7 / mapZoom : 5 / mapZoom;

                  return (
                    <g key={pt.id} style={{ cursor: 'pointer' }}>
                      {/* Highlight ring */}
                      {isSelected && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={12 / mapZoom}
                          fill="none"
                          stroke={color}
                          strokeWidth={2 / mapZoom}
                          opacity="0.5"
                        >
                          <animate attributeName="r" values={`${12 / mapZoom};${16 / mapZoom};${12 / mapZoom}`} dur="1.5s" repeatCount="indefinite" />
                        </circle>
                      )}

                      {/* Point dot */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={1.5 / mapZoom}
                        onClick={(e) => { e.stopPropagation(); handlePointClick(pt); }}
                        onDoubleClick={(e) => { e.stopPropagation(); handlePointDoubleClick(pt); }}
                      />

                      {/* Labels */}
                      {(showLabels.name || showLabels.elevation || showLabels.code || showLabels.accuracy || showLabels.description) && (
                        <text
                          x={cx + 8 / mapZoom}
                          y={cy - 6 / mapZoom}
                          fontSize={10 / mapZoom}
                          fill="#374151"
                          fontFamily="monospace"
                          pointerEvents="none"
                        >
                          {[
                            showLabels.name && pt.point_name,
                            showLabels.elevation && pt.elevation != null && `El:${pt.elevation.toFixed(2)}`,
                            showLabels.code && pt.raw_data?.code,
                            showLabels.accuracy && pt.raw_data?.accuracy != null && `${(pt.raw_data.accuracy * 100).toFixed(1)}cm`,
                            showLabels.description && pt.description,
                          ].filter(Boolean).join(' | ')}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* Scale bar */}
              <g transform={`translate(${MAP_W - 120}, ${MAP_H - 30})`}>
                <line x1="0" y1="0" x2="80" y2="0" stroke="#374151" strokeWidth="2" />
                <line x1="0" y1="-4" x2="0" y2="4" stroke="#374151" strokeWidth="1.5" />
                <line x1="80" y1="-4" x2="80" y2="4" stroke="#374151" strokeWidth="1.5" />
                <text x="40" y="14" textAnchor="middle" fontSize="9" fill="#374151" fontFamily="monospace">
                  {((bounds.maxE - bounds.minE) * 80 / MAP_W).toFixed(1)} ft
                </text>
              </g>
            </svg>
          )}

          {/* Zoom controls overlay */}
          <div className="fw__map-zoom">
            <button className="fw__map-zoom-btn" onClick={() => setMapZoom(z => Math.min(20, z * 1.3))}>+</button>
            <span className="fw__map-zoom-level">{Math.round(mapZoom * 100)}%</span>
            <button className="fw__map-zoom-btn" onClick={() => setMapZoom(z => Math.max(0.1, z / 1.3))}>-</button>
          </div>

          {/* Legend */}
          <div className="fw__map-legend">
            {Object.entries(DATA_TYPE_COLORS).map(([type, color]) => {
              const hasType = mappablePoints.some(p => p.data_type === type);
              if (!hasType) return null;
              return (
                <span key={type} className="fw__map-legend-item">
                  <span className="fw__map-legend-dot" style={{ background: color }} />
                  {DATA_TYPE_LABELS[type] || type}
                </span>
              );
            })}
          </div>
        </div>

        {/* Right: Point Log */}
        <div className="fw__log">
          <div className="fw__log-header">
            <h4 className="fw__log-title">Shot Log</h4>
            <span className="fw__log-count">{filteredPoints.length} pts</span>
          </div>

          {/* Search */}
          <div className="fw__log-search">
            <input
              type="text"
              placeholder="Search point name or code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="fw__log-search-input"
            />
            {searchQuery && (
              <button className="fw__log-search-clear" onClick={() => setSearchQuery('')}>x</button>
            )}
          </div>

          {/* Scrollable log */}
          <div className="fw__log-list" ref={logRef}>
            {logPoints.length === 0 ? (
              <div className="fw__log-empty">
                {searchQuery ? 'No points match your search' : 'No points recorded yet'}
              </div>
            ) : (
              logPoints.map(pt => (
                <div
                  key={pt.id}
                  data-point-id={pt.id}
                  className={`fw__log-item ${selectedPointId === pt.id ? 'fw__log-item--selected' : ''}`}
                  onClick={() => handlePointClick(pt)}
                  onDoubleClick={() => handlePointDoubleClick(pt)}
                >
                  <div className="fw__log-item-top">
                    <span className="fw__log-item-name">{pt.point_name || 'Unnamed'}</span>
                    <span className="fw__log-item-type" style={{ color: DATA_TYPE_COLORS[pt.data_type] || '#6B7280' }}>
                      {DATA_TYPE_LABELS[pt.data_type] || pt.data_type}
                    </span>
                  </div>
                  <div className="fw__log-item-mid">
                    {pt.description && <span className="fw__log-item-desc">{pt.description}</span>}
                    {pt.raw_data?.code && <span className="fw__log-item-code">{pt.raw_data.code}</span>}
                  </div>
                  <div className="fw__log-item-bottom">
                    <span className="fw__log-item-time">{formatDate(pt.collected_at)} {formatTime(pt.collected_at)}</span>
                    <div className="fw__log-item-badges">
                      {renderAccuracy(pt)}
                      {renderRtk(pt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Timeline Slider */}
      <div className="fw__timeline">
        <div className="fw__timeline-header">
          <span className="fw__timeline-label">
            {sortedPoints.length > 0 ? formatDateTime(sortedPoints[0].collected_at) : '—'}
          </span>
          <span className="fw__timeline-current">
            Showing {visiblePoints.length} of {sortedPoints.length} points
            {timelineValue < 1 && ` (up to ${formatDateTime(new Date(cutoffTime).toISOString())})`}
          </span>
          <span className="fw__timeline-label">
            {sortedPoints.length > 0 ? formatDateTime(sortedPoints[sortedPoints.length - 1].collected_at) : '—'}
          </span>
        </div>

        <div className="fw__timeline-track">
          {/* Session markers */}
          {sessionMarkers.map((marker, i) => {
            const pos = timeRange.max === timeRange.min ? 50 : ((marker.time - timeRange.min) / (timeRange.max - timeRange.min)) * 100;
            return (
              <div
                key={i}
                className={`fw__timeline-marker fw__timeline-marker--${marker.type}`}
                style={{ left: `${pos}%` }}
                onMouseEnter={() => setHoveredSession(marker)}
                onMouseLeave={() => setHoveredSession(null)}
                onClick={() => setHoveredSession(prev => prev === marker ? null : marker)}
              >
                <div className="fw__timeline-marker-line" />
                {hoveredSession === marker && (
                  <div className="fw__timeline-marker-tooltip">
                    {marker.label}
                  </div>
                )}
              </div>
            );
          })}

          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={timelineValue}
            onChange={e => setTimelineValue(parseFloat(e.target.value))}
            className="fw__timeline-slider"
          />
        </div>

        <div className="fw__timeline-actions">
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(0)}>Start</button>
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(0.25)}>25%</button>
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(0.5)}>50%</button>
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(0.75)}>75%</button>
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(1)}>Current</button>
        </div>
      </div>

      {/* Point Detail Popup */}
      {detailPoint && (
        <div className="fw__popup-overlay" onClick={() => setDetailPoint(null)}>
          <div className="fw__popup" onClick={e => e.stopPropagation()}>
            <div className="fw__popup-header">
              <h3>{detailPoint.point_name || 'Unnamed Point'}</h3>
              <button className="fw__popup-close" onClick={() => setDetailPoint(null)}>x</button>
            </div>
            <div className="fw__popup-body">
              <div className="fw__popup-grid">
                <div className="fw__popup-field">
                  <label>Type</label>
                  <span style={{ color: DATA_TYPE_COLORS[detailPoint.data_type] }}>
                    {DATA_TYPE_LABELS[detailPoint.data_type] || detailPoint.data_type}
                  </span>
                </div>
                {detailPoint.raw_data?.code && (
                  <div className="fw__popup-field">
                    <label>Code</label>
                    <span>{detailPoint.raw_data.code}</span>
                  </div>
                )}
                <div className="fw__popup-field">
                  <label>Collected</label>
                  <span>{formatDate(detailPoint.collected_at)} {formatTime(detailPoint.collected_at)}</span>
                </div>
                <div className="fw__popup-field">
                  <label>By</label>
                  <span>{detailPoint.collected_by}</span>
                </div>
                {detailPoint.instrument && (
                  <div className="fw__popup-field">
                    <label>Instrument</label>
                    <span>{detailPoint.instrument}</span>
                  </div>
                )}
              </div>

              {/* Coordinates */}
              <div className="fw__popup-section">
                <h4>Coordinates</h4>
                <div className="fw__popup-grid">
                  <div className="fw__popup-field">
                    <label>Northing</label>
                    <span className="fw__popup-mono">{detailPoint.northing?.toFixed(4) ?? '—'}</span>
                  </div>
                  <div className="fw__popup-field">
                    <label>Easting</label>
                    <span className="fw__popup-mono">{detailPoint.easting?.toFixed(4) ?? '—'}</span>
                  </div>
                  <div className="fw__popup-field">
                    <label>Elevation</label>
                    <span className="fw__popup-mono">{detailPoint.elevation?.toFixed(4) ?? '—'}</span>
                  </div>
                </div>
              </div>

              {/* Raw data details */}
              {detailPoint.raw_data && (
                <div className="fw__popup-section">
                  <h4>Quality</h4>
                  <div className="fw__popup-grid">
                    {detailPoint.raw_data.accuracy != null && (
                      <div className="fw__popup-field">
                        <label>Accuracy</label>
                        <span>{(detailPoint.raw_data.accuracy * 100).toFixed(2)} cm</span>
                      </div>
                    )}
                    {detailPoint.raw_data.rtk_status && (
                      <div className="fw__popup-field">
                        <label>RTK Status</label>
                        <span style={{ color: RTK_LABELS[detailPoint.raw_data.rtk_status]?.color }}>
                          {RTK_LABELS[detailPoint.raw_data.rtk_status]?.label || detailPoint.raw_data.rtk_status}
                        </span>
                      </div>
                    )}
                    {detailPoint.raw_data.pdop != null && (
                      <div className="fw__popup-field">
                        <label>PDOP</label>
                        <span>{detailPoint.raw_data.pdop.toFixed(2)}</span>
                      </div>
                    )}
                    {detailPoint.raw_data.hdop != null && (
                      <div className="fw__popup-field">
                        <label>HDOP</label>
                        <span>{detailPoint.raw_data.hdop.toFixed(2)}</span>
                      </div>
                    )}
                    {detailPoint.raw_data.vdop != null && (
                      <div className="fw__popup-field">
                        <label>VDOP</label>
                        <span>{detailPoint.raw_data.vdop.toFixed(2)}</span>
                      </div>
                    )}
                    {detailPoint.raw_data.satellites != null && (
                      <div className="fw__popup-field">
                        <label>Satellites</label>
                        <span>{detailPoint.raw_data.satellites}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Angle / distance data (total station) */}
              {detailPoint.raw_data && (detailPoint.raw_data.hz_angle != null || detailPoint.raw_data.slope_dist != null) && (
                <div className="fw__popup-section">
                  <h4>Observations</h4>
                  <div className="fw__popup-grid">
                    {detailPoint.raw_data.hz_angle != null && (
                      <div className="fw__popup-field">
                        <label>Hz Angle</label>
                        <span className="fw__popup-mono">{detailPoint.raw_data.hz_angle.toFixed(4)}</span>
                      </div>
                    )}
                    {detailPoint.raw_data.vt_angle != null && (
                      <div className="fw__popup-field">
                        <label>Vt Angle</label>
                        <span className="fw__popup-mono">{detailPoint.raw_data.vt_angle.toFixed(4)}</span>
                      </div>
                    )}
                    {detailPoint.raw_data.slope_dist != null && (
                      <div className="fw__popup-field">
                        <label>Slope Dist</label>
                        <span className="fw__popup-mono">{detailPoint.raw_data.slope_dist.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {detailPoint.description && (
                <div className="fw__popup-section">
                  <h4>Description</h4>
                  <p>{detailPoint.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
