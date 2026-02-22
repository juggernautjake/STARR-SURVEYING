// app/admin/research/components/CoordinateEntryPanel.tsx — CAD-style coordinate/bearing/distance entry
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type EntryMode = 'bearing_distance' | 'azimuth_distance' | 'coordinates' | 'offset';

export interface TraverseVertex {
  id: string;
  x: number; // survey feet
  y: number; // survey feet
  bearing?: string;   // display string e.g. "N 45° 30' 15\" E"
  azimuth?: number;   // degrees from north
  distance?: number;  // feet
  label?: string;
}

interface CoordinateEntryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user adds a new traverse leg */
  onAddLeg: (leg: { azimuth: number; distance: number; bearing: string }) => void;
  /** Called when user adds a point by coordinates */
  onAddPoint: (x: number, y: number) => void;
  /** Called to close the traverse back to the start */
  onCloseTraverse: () => void;
  /** Current traverse vertices (displayed in the table) */
  vertices: TraverseVertex[];
  /** Called when a vertex is selected for editing */
  onSelectVertex?: (index: number) => void;
  /** Called to delete a vertex */
  onDeleteVertex?: (index: number) => void;
  /** Canvas cursor position for coordinate display */
  cursorPosition?: { x: number; y: number } | null;
}

// ── Bearing Parsing ──────────────────────────────────────────────────────────

function parseBearing(input: string): { azimuth: number; display: string } | null {
  // Accept formats: N 45 30 15 E, N45°30'15"E, N 45.505 E, etc.
  const cleaned = input.trim().toUpperCase();

  // Format: N DD MM SS E/W  or  S DD MM SS E/W
  const dmsMatch = cleaned.match(
    /^([NS])\s*(\d+)[°\s]+(\d+)?['\s]*(\d+(?:\.\d+)?)?["'\s]*([EW])$/
  );
  if (dmsMatch) {
    const ns = dmsMatch[1];
    const deg = parseFloat(dmsMatch[2]);
    const min = parseFloat(dmsMatch[3] || '0');
    const sec = parseFloat(dmsMatch[4] || '0');
    const ew = dmsMatch[5];

    const decimal = deg + min / 60 + sec / 3600;
    const azimuth = bearingToAzimuth(ns, decimal, ew);
    const display = `${ns} ${deg}° ${min.toFixed(0)}' ${sec.toFixed(0)}" ${ew}`;
    return { azimuth, display };
  }

  // Format: N DD.DDD E/W  (decimal degrees bearing)
  const decMatch = cleaned.match(
    /^([NS])\s*(\d+(?:\.\d+)?)[°\s]*([EW])$/
  );
  if (decMatch) {
    const ns = decMatch[1];
    const decimal = parseFloat(decMatch[2]);
    const ew = decMatch[3];
    const azimuth = bearingToAzimuth(ns, decimal, ew);
    const deg = Math.floor(decimal);
    const minDec = (decimal - deg) * 60;
    const min = Math.floor(minDec);
    const sec = (minDec - min) * 60;
    const display = `${ns} ${deg}° ${min}' ${sec.toFixed(0)}" ${ew}`;
    return { azimuth, display };
  }

  return null;
}

function bearingToAzimuth(ns: string, decimal: number, ew: string): number {
  if (ns === 'N' && ew === 'E') return decimal;
  if (ns === 'N' && ew === 'W') return 360 - decimal;
  if (ns === 'S' && ew === 'E') return 180 - decimal;
  if (ns === 'S' && ew === 'W') return 180 + decimal;
  return decimal;
}

function azimuthToBearing(azimuth: number): string {
  const a = ((azimuth % 360) + 360) % 360;
  let ns: string, ew: string, angle: number;

  if (a <= 90) { ns = 'N'; ew = 'E'; angle = a; }
  else if (a <= 180) { ns = 'S'; ew = 'E'; angle = 180 - a; }
  else if (a <= 270) { ns = 'S'; ew = 'W'; angle = a - 180; }
  else { ns = 'N'; ew = 'W'; angle = 360 - a; }

  const deg = Math.floor(angle);
  const minDec = (angle - deg) * 60;
  const min = Math.floor(minDec);
  const sec = Math.round((minDec - min) * 60);
  return `${ns} ${deg}° ${min}' ${sec}" ${ew}`;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function CoordinateEntryPanel({
  isOpen,
  onClose,
  onAddLeg,
  onAddPoint,
  onCloseTraverse,
  vertices,
  onSelectVertex,
  onDeleteVertex,
  cursorPosition,
}: CoordinateEntryPanelProps) {
  const [mode, setMode] = useState<EntryMode>('bearing_distance');

  // Bearing/Distance inputs
  const [bearingInput, setBearingInput] = useState('');
  const [distanceInput, setDistanceInput] = useState('');
  const [azimuthInput, setAzimuthInput] = useState('');

  // Coordinate inputs
  const [xInput, setXInput] = useState('');
  const [yInput, setYInput] = useState('');

  // Offset inputs
  const [offsetBearingInput, setOffsetBearingInput] = useState('');
  const [offsetDistInput, setOffsetDistInput] = useState('');

  const [error, setError] = useState<string | null>(null);
  const bearingRef = useRef<HTMLInputElement>(null);
  const azimuthRef = useRef<HTMLInputElement>(null);
  const xRef = useRef<HTMLInputElement>(null);

  // Focus first input when mode changes
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (mode === 'bearing_distance') bearingRef.current?.focus();
      else if (mode === 'azimuth_distance') azimuthRef.current?.focus();
      else if (mode === 'coordinates') xRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [mode, isOpen]);

  const handleAddBearingDistance = useCallback(() => {
    setError(null);
    const parsed = parseBearing(bearingInput);
    if (!parsed) {
      setError('Invalid bearing. Use format: N 45 30 15 E');
      return;
    }
    const dist = parseFloat(distanceInput);
    if (isNaN(dist) || dist <= 0) {
      setError('Distance must be a positive number');
      return;
    }
    onAddLeg({ azimuth: parsed.azimuth, distance: dist, bearing: parsed.display });
    setBearingInput('');
    setDistanceInput('');
    bearingRef.current?.focus();
  }, [bearingInput, distanceInput, onAddLeg]);

  const handleAddAzimuthDistance = useCallback(() => {
    setError(null);
    let az = parseFloat(azimuthInput);
    if (isNaN(az) || az < 0 || az > 360) {
      setError('Azimuth must be 0-360');
      return;
    }
    if (az === 360) az = 0; // Normalize 360 to due north
    const dist = parseFloat(distanceInput);
    if (isNaN(dist) || dist <= 0) {
      setError('Distance must be a positive number');
      return;
    }
    const bearing = azimuthToBearing(az);
    onAddLeg({ azimuth: az, distance: dist, bearing });
    setAzimuthInput('');
    setDistanceInput('');
    azimuthRef.current?.focus();
  }, [azimuthInput, distanceInput, onAddLeg]);

  const handleAddCoordinates = useCallback(() => {
    setError(null);
    const x = parseFloat(xInput);
    const y = parseFloat(yInput);
    if (isNaN(x) || isNaN(y)) {
      setError('Enter valid X and Y coordinates');
      return;
    }
    onAddPoint(x, y);
    setXInput('');
    setYInput('');
    xRef.current?.focus();
  }, [xInput, yInput, onAddPoint]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'bearing_distance') handleAddBearingDistance();
      else if (mode === 'azimuth_distance') handleAddAzimuthDistance();
      else if (mode === 'coordinates') handleAddCoordinates();
    }
  }, [mode, handleAddBearingDistance, handleAddAzimuthDistance, handleAddCoordinates]);

  if (!isOpen) return null;

  const canClose = vertices.length >= 3;

  return (
    <div className="coord-entry">
      {/* Header */}
      <div className="coord-entry__header">
        <h3 className="coord-entry__title">Coordinate Entry</h3>
        <button className="coord-entry__close" onClick={onClose} aria-label="Close">&times;</button>
      </div>

      {/* Mode selector */}
      <div className="coord-entry__modes">
        {([
          ['bearing_distance', 'Bearing/Dist'],
          ['azimuth_distance', 'Azimuth/Dist'],
          ['coordinates', 'X, Y'],
        ] as [EntryMode, string][]).map(([m, label]) => (
          <button
            key={m}
            className={`coord-entry__mode-btn ${mode === m ? 'coord-entry__mode-btn--active' : ''}`}
            onClick={() => { setMode(m); setError(null); }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cursor position readout */}
      {cursorPosition && (
        <div className="coord-entry__cursor">
          X: {cursorPosition.x.toFixed(2)} &nbsp; Y: {cursorPosition.y.toFixed(2)}
        </div>
      )}

      {/* Input form */}
      <div className="coord-entry__form" onKeyDown={handleKeyDown}>
        {mode === 'bearing_distance' && (
          <>
            <div className="coord-entry__field">
              <label className="coord-entry__label">Bearing</label>
              <input
                ref={bearingRef}
                className="coord-entry__input"
                value={bearingInput}
                onChange={e => setBearingInput(e.target.value)}
                placeholder="N 45 30 15 E"
                autoComplete="off"
              />
            </div>
            <div className="coord-entry__field">
              <label className="coord-entry__label">Distance (ft)</label>
              <input
                className="coord-entry__input coord-entry__input--short"
                type="number"
                step="0.01"
                min="0"
                value={distanceInput}
                onChange={e => setDistanceInput(e.target.value)}
                placeholder="150.00"
              />
            </div>
            <button className="coord-entry__add-btn" onClick={handleAddBearingDistance}>
              Add Leg
            </button>
          </>
        )}

        {mode === 'azimuth_distance' && (
          <>
            <div className="coord-entry__field">
              <label className="coord-entry__label">Azimuth (°)</label>
              <input
                ref={azimuthRef}
                className="coord-entry__input coord-entry__input--short"
                type="number"
                step="0.0001"
                min="0"
                max="359.9999"
                value={azimuthInput}
                onChange={e => setAzimuthInput(e.target.value)}
                placeholder="45.5042"
              />
            </div>
            <div className="coord-entry__field">
              <label className="coord-entry__label">Distance (ft)</label>
              <input
                className="coord-entry__input coord-entry__input--short"
                type="number"
                step="0.01"
                min="0"
                value={distanceInput}
                onChange={e => setDistanceInput(e.target.value)}
                placeholder="150.00"
              />
            </div>
            <button className="coord-entry__add-btn" onClick={handleAddAzimuthDistance}>
              Add Leg
            </button>
          </>
        )}

        {mode === 'coordinates' && (
          <>
            <div className="coord-entry__field">
              <label className="coord-entry__label">X (Easting)</label>
              <input
                ref={xRef}
                className="coord-entry__input coord-entry__input--short"
                type="number"
                step="0.01"
                value={xInput}
                onChange={e => setXInput(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="coord-entry__field">
              <label className="coord-entry__label">Y (Northing)</label>
              <input
                className="coord-entry__input coord-entry__input--short"
                type="number"
                step="0.01"
                value={yInput}
                onChange={e => setYInput(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <button className="coord-entry__add-btn" onClick={handleAddCoordinates}>
              Add Point
            </button>
          </>
        )}
      </div>

      {error && <div className="coord-entry__error">{error}</div>}

      {/* Traverse point table */}
      {vertices.length > 0 && (
        <div className="coord-entry__table-wrap">
          <table className="coord-entry__table">
            <thead>
              <tr>
                <th>#</th>
                <th>X</th>
                <th>Y</th>
                <th>Bearing</th>
                <th>Dist</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vertices.map((v, i) => (
                <tr
                  key={v.id}
                  className="coord-entry__row"
                  onClick={() => onSelectVertex?.(i)}
                >
                  <td className="coord-entry__cell--seq">{i === 0 ? 'POB' : i}</td>
                  <td className="coord-entry__cell--num">{v.x.toFixed(2)}</td>
                  <td className="coord-entry__cell--num">{v.y.toFixed(2)}</td>
                  <td className="coord-entry__cell--bearing">{v.bearing || '—'}</td>
                  <td className="coord-entry__cell--num">{v.distance?.toFixed(2) || '—'}</td>
                  <td>
                    {i > 0 && onDeleteVertex && (
                      <button
                        className="coord-entry__del-btn"
                        onClick={e => { e.stopPropagation(); onDeleteVertex(i); }}
                        aria-label="Delete point"
                      >
                        &times;
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="coord-entry__actions">
        {canClose && (
          <button className="coord-entry__close-traverse" onClick={onCloseTraverse}>
            Close Traverse
          </button>
        )}
        <div className="coord-entry__stats">
          {vertices.length > 1 && (
            <span>{vertices.length - 1} legs</span>
          )}
        </div>
      </div>

      {/* Help text */}
      <div className="coord-entry__help">
        <strong>Bearing format:</strong> N 45 30 15 E (degrees, minutes, seconds)<br />
        <strong>Azimuth:</strong> 0° = North, 90° = East, clockwise<br />
        <strong>Enter</strong> to add, <strong>Close Traverse</strong> to connect back to POB
      </div>
    </div>
  );
}
