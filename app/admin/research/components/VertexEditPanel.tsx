// app/admin/research/components/VertexEditPanel.tsx — Edit individual vertex coordinates, bearings, distances
'use client';

import { useState, useCallback, useEffect } from 'react';
import type { DrawingElement } from '@/types/research';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VertexData {
  elementId: string;
  vertexIndex: number; // 0 = start, 1 = end (for lines)
  x: number;
  y: number;
  /** The line element this vertex belongs to */
  element: DrawingElement;
  /** Bearing of this leg (if available from attributes) */
  bearing?: string;
  /** Distance of this leg (if available from attributes) */
  distance?: number;
  /** Azimuth of this leg */
  azimuth?: number;
}

interface VertexEditPanelProps {
  vertex: VertexData;
  onClose: () => void;
  /** Update the vertex position and recalculate the connected line */
  onUpdateVertex: (elementId: string, vertexIndex: number, updates: {
    x?: number;
    y?: number;
    bearing?: string;
    azimuth?: number;
    distance?: number;
  }) => void;
  /** Navigate to next/prev vertex */
  onNavigateVertex?: (direction: 'prev' | 'next') => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
}

// ── Bearing / Azimuth Conversion ─────────────────────────────────────────────

function parseBearingToAzimuth(input: string): number | null {
  const cleaned = input.trim().toUpperCase();
  const m = cleaned.match(/^([NS])\s*(\d+)[°\s]+(\d+)?['\s]*(\d+(?:\.\d+)?)?["'\s]*([EW])$/);
  if (!m) return null;
  const ns = m[1];
  const dec = parseFloat(m[2]) + parseFloat(m[3] || '0') / 60 + parseFloat(m[4] || '0') / 3600;
  if (ns === 'N' && m[5] === 'E') return dec;
  if (ns === 'N' && m[5] === 'W') return 360 - dec;
  if (ns === 'S' && m[5] === 'E') return 180 - dec;
  return 180 + dec;
}

function azimuthToBearing(az: number): string {
  const a = ((az % 360) + 360) % 360;
  let ns: string, ew: string, angle: number;
  if (a <= 90) { ns = 'N'; ew = 'E'; angle = a; }
  else if (a <= 180) { ns = 'S'; ew = 'E'; angle = 180 - a; }
  else if (a <= 270) { ns = 'S'; ew = 'W'; angle = a - 180; }
  else { ns = 'N'; ew = 'W'; angle = 360 - a; }
  const deg = Math.floor(angle);
  const md = (angle - deg) * 60;
  const min = Math.floor(md);
  const sec = Math.round((md - min) * 60);
  return `${ns} ${deg}° ${min}' ${sec}" ${ew}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function VertexEditPanel({
  vertex,
  onClose,
  onUpdateVertex,
  onNavigateVertex,
  canNavigatePrev,
  canNavigateNext,
}: VertexEditPanelProps) {
  const [xVal, setXVal] = useState(vertex.x.toFixed(2));
  const [yVal, setYVal] = useState(vertex.y.toFixed(2));
  const [bearingVal, setBearingVal] = useState(vertex.bearing || '');
  const [azimuthVal, setAzimuthVal] = useState(vertex.azimuth?.toFixed(4) || '');
  const [distVal, setDistVal] = useState(vertex.distance?.toFixed(2) || '');
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'coordinates' | 'bearing'>('coordinates');

  // Sync state when vertex changes
  useEffect(() => {
    setXVal(vertex.x.toFixed(2));
    setYVal(vertex.y.toFixed(2));
    setBearingVal(vertex.bearing || '');
    setAzimuthVal(vertex.azimuth?.toFixed(4) || '');
    setDistVal(vertex.distance?.toFixed(2) || '');
    setError(null);
  }, [vertex.elementId, vertex.vertexIndex, vertex.x, vertex.y, vertex.bearing, vertex.azimuth, vertex.distance]);

  const applyCoordinates = useCallback(() => {
    setError(null);
    const x = parseFloat(xVal);
    const y = parseFloat(yVal);
    if (isNaN(x) || isNaN(y)) {
      setError('Invalid coordinates');
      return;
    }
    onUpdateVertex(vertex.elementId, vertex.vertexIndex, { x, y });
  }, [xVal, yVal, vertex.elementId, vertex.vertexIndex, onUpdateVertex]);

  const applyBearing = useCallback(() => {
    setError(null);
    if (bearingVal.trim()) {
      const az = parseBearingToAzimuth(bearingVal);
      if (az === null) {
        setError('Invalid bearing format. Use: N 45 30 15 E');
        return;
      }
      const dist = parseFloat(distVal);
      if (isNaN(dist) || dist <= 0) {
        setError('Distance must be positive');
        return;
      }
      onUpdateVertex(vertex.elementId, vertex.vertexIndex, { azimuth: az, distance: dist, bearing: bearingVal.trim().toUpperCase() });
    } else if (azimuthVal.trim()) {
      const az = parseFloat(azimuthVal);
      if (isNaN(az) || az < 0 || az >= 360) {
        setError('Azimuth must be 0-360');
        return;
      }
      const dist = parseFloat(distVal);
      if (isNaN(dist) || dist <= 0) {
        setError('Distance must be positive');
        return;
      }
      const bearing = azimuthToBearing(az);
      onUpdateVertex(vertex.elementId, vertex.vertexIndex, { azimuth: az, distance: dist, bearing });
    }
  }, [bearingVal, azimuthVal, distVal, vertex.elementId, vertex.vertexIndex, onUpdateVertex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editMode === 'coordinates') applyCoordinates();
      else applyBearing();
    }
    if (e.key === 'Escape') onClose();
  }, [editMode, applyCoordinates, applyBearing, onClose]);

  const featureLabel = vertex.element.feature_class?.replace(/_/g, ' ') || 'Element';
  const elType = vertex.element.element_type || 'unknown';

  return (
    <div className="vertex-edit" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="vertex-edit__header">
        <div>
          <h3 className="vertex-edit__title">Edit Vertex</h3>
          <span className="vertex-edit__subtitle">
            {featureLabel} &middot; {elType} &middot; Point {vertex.vertexIndex === 0 ? 'Start' : 'End'}
          </span>
        </div>
        <button className="vertex-edit__close" onClick={onClose} aria-label="Close">&times;</button>
      </div>

      {/* Navigation between vertices */}
      {onNavigateVertex && (
        <div className="vertex-edit__nav">
          <button
            className="vertex-edit__nav-btn"
            disabled={!canNavigatePrev}
            onClick={() => onNavigateVertex('prev')}
          >
            &larr; Prev
          </button>
          <button
            className="vertex-edit__nav-btn"
            disabled={!canNavigateNext}
            onClick={() => onNavigateVertex('next')}
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Edit mode tabs */}
      <div className="vertex-edit__tabs">
        <button
          className={`vertex-edit__tab ${editMode === 'coordinates' ? 'vertex-edit__tab--active' : ''}`}
          onClick={() => setEditMode('coordinates')}
        >
          Coordinates
        </button>
        <button
          className={`vertex-edit__tab ${editMode === 'bearing' ? 'vertex-edit__tab--active' : ''}`}
          onClick={() => setEditMode('bearing')}
        >
          Bearing / Distance
        </button>
      </div>

      {/* Coordinate editing */}
      {editMode === 'coordinates' && (
        <div className="vertex-edit__fields">
          <div className="vertex-edit__field-row">
            <label className="vertex-edit__label">X (Easting)</label>
            <input
              className="vertex-edit__input"
              type="number"
              step="0.01"
              value={xVal}
              onChange={e => setXVal(e.target.value)}
            />
          </div>
          <div className="vertex-edit__field-row">
            <label className="vertex-edit__label">Y (Northing)</label>
            <input
              className="vertex-edit__input"
              type="number"
              step="0.01"
              value={yVal}
              onChange={e => setYVal(e.target.value)}
            />
          </div>
          <button className="vertex-edit__apply" onClick={applyCoordinates}>
            Apply Coordinates
          </button>
        </div>
      )}

      {/* Bearing/distance editing */}
      {editMode === 'bearing' && (
        <div className="vertex-edit__fields">
          <div className="vertex-edit__field-row">
            <label className="vertex-edit__label">Bearing</label>
            <input
              className="vertex-edit__input"
              value={bearingVal}
              onChange={e => { setBearingVal(e.target.value); setAzimuthVal(''); }}
              placeholder="N 45 30 15 E"
            />
          </div>
          <div className="vertex-edit__field-row">
            <label className="vertex-edit__label">—or— Azimuth (°)</label>
            <input
              className="vertex-edit__input"
              type="number"
              step="0.0001"
              min="0"
              max="359.9999"
              value={azimuthVal}
              onChange={e => { setAzimuthVal(e.target.value); setBearingVal(''); }}
              placeholder="45.5042"
            />
          </div>
          <div className="vertex-edit__field-row">
            <label className="vertex-edit__label">Distance (ft)</label>
            <input
              className="vertex-edit__input"
              type="number"
              step="0.01"
              min="0"
              value={distVal}
              onChange={e => setDistVal(e.target.value)}
              placeholder="150.00"
            />
          </div>
          <button className="vertex-edit__apply" onClick={applyBearing}>
            Apply Bearing/Distance
          </button>
        </div>
      )}

      {error && <div className="vertex-edit__error">{error}</div>}

      {/* Current element info */}
      <div className="vertex-edit__info">
        <div className="vertex-edit__info-row">
          <span className="vertex-edit__info-label">Confidence</span>
          <span className="vertex-edit__info-value">
            {vertex.element.confidence_score != null ? `${vertex.element.confidence_score}%` : '—'}
          </span>
        </div>
        {vertex.element.ai_report && (
          <div className="vertex-edit__info-row">
            <span className="vertex-edit__info-label">AI Note</span>
            <span className="vertex-edit__info-value vertex-edit__info-value--small">{vertex.element.ai_report}</span>
          </div>
        )}
      </div>

      <div className="vertex-edit__hint">
        Press <strong>Enter</strong> to apply, <strong>Esc</strong> to close
      </div>
    </div>
  );
}
