'use client';
// app/admin/cad/components/InteractiveOpPanel.tsx
// Floating dialogue shown during interactive rotate/scale operations.
// Displays live dimension changes and allows direct numeric input.

import { useEffect, useRef, useState } from 'react';
import { RotateCw, Expand, X, Check } from 'lucide-react';
import type { Feature, Point2D, DisplayPreferences } from '@/lib/cad/types';
import { formatDistance, formatArea } from '@/lib/cad/geometry/units';
import { formatBearing, inverseBearingDistance } from '@/lib/cad/geometry/bearing';

// ── Geometry helpers ──────────────────────────────────────────────────────────

function lineLength(start: Point2D, end: Point2D): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function polylineLength(verts: Point2D[]): number {
  let total = 0;
  for (let i = 1; i < verts.length; i++) {
    total += lineLength(verts[i - 1], verts[i]);
  }
  return total;
}

function polygonPerimeter(verts: Point2D[]): number {
  let total = 0;
  for (let i = 0; i < verts.length; i++) {
    const next = verts[(i + 1) % verts.length];
    total += lineLength(verts[i], next);
  }
  return total;
}

function polygonArea(verts: Point2D[]): number {
  let area = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += verts[i].x * verts[j].y;
    area -= verts[j].x * verts[i].y;
  }
  return Math.abs(area) / 2;
}

// ── Dimension row for a single before/after measurement ──────────────────────
function DimRow({ label, before, after, unit }: { label: string; before: string; after: string; unit?: string }) {
  const changed = before !== after;
  return (
    <div className="flex items-center justify-between gap-2 text-[10px] py-0.5">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="font-mono text-gray-300">{before}{unit && ` ${unit}`}</span>
      {changed && (
        <>
          <span className="text-gray-600">→</span>
          <span className="font-mono text-green-400">{after}{unit && ` ${unit}`}</span>
        </>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  type: 'ROTATE' | 'SCALE';
  /** Current cursor-driven angle delta in degrees (ROTATE mode) */
  currentAngleDeg: number;
  /** Current cursor-driven scale factor (SCALE mode) */
  currentFactor: number;
  /** Original feature snapshots before any interactive change */
  originals: Map<string, Feature>;
  displayPrefs: DisplayPreferences;
  /** Called with the final angle (degrees) or factor to commit */
  onCommit: (value: number) => void;
  onCancel: () => void;
  /** Called when user types a value — applies preview immediately */
  onPreview: (value: number) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InteractiveOpPanel({
  type,
  currentAngleDeg,
  currentFactor,
  originals,
  displayPrefs,
  onCommit,
  onCancel,
  onPreview,
}: Props) {
  // Local input state — null means "follow cursor", a number means user has typed a value
  const [inputStr, setInputStr] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isUserInputRef = useRef(false);

  // Keep input in sync with cursor-driven value UNLESS user has typed something
  useEffect(() => {
    if (isUserInputRef.current) return; // user is editing — don't override
    const v = type === 'ROTATE' ? currentAngleDeg : currentFactor;
    setInputStr(type === 'ROTATE' ? v.toFixed(2) : v.toFixed(4));
  }, [type, currentAngleDeg, currentFactor]);

  // Focus input on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.select(), 80);
    return () => clearTimeout(t);
  }, []);

  const displayValue = type === 'ROTATE' ? currentAngleDeg : currentFactor;

  function handleInputChange(raw: string) {
    setInputStr(raw);
    isUserInputRef.current = true;
    const n = parseFloat(raw);
    if (!isNaN(n)) onPreview(n);
  }

  function handleCommit() {
    const n = parseFloat(inputStr);
    const value = isNaN(n) ? displayValue : n;
    onCommit(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else {
      isUserInputRef.current = true;
    }
  }

  // ── Build per-feature dimension rows ────────────────────────────────────────
  const dimRows: { label: string; before: string; after: string }[] = [];

  const factor = type === 'SCALE' ? (parseFloat(inputStr) || currentFactor) : 1;
  const angleDeg = type === 'ROTATE' ? (parseFloat(inputStr) || currentAngleDeg) : 0;
  const angleRad = (angleDeg * Math.PI) / 180;

  for (const [, orig] of originals) {
    const g = orig.geometry;
    const featureId = orig.id;

    if (g.type === 'LINE' && g.start && g.end) {
      const origLen = lineLength(g.start, g.end);
      const origBearing = inverseBearingDistance(g.start, g.end);

      if (type === 'SCALE') {
        dimRows.push({
          label: 'Length',
          before: formatDistance(origLen, displayPrefs),
          after: formatDistance(origLen * factor, displayPrefs),
        });
      } else {
        // For rotation, show bearing change
        const origAz = origBearing.azimuth;
        const newAz = origAz + angleRad;
        const origBearingStr = formatBearing(origAz);
        const newBearingStr = formatBearing(newAz);
        dimRows.push({ label: 'Bearing', before: origBearingStr, after: newBearingStr });
        dimRows.push({
          label: 'Length',
          before: formatDistance(origBearing.distance, displayPrefs),
          after: formatDistance(origBearing.distance, displayPrefs),
        });
      }
    } else if (g.type === 'CIRCLE' && g.circle) {
      const r = g.circle.radius;
      if (type === 'SCALE') {
        dimRows.push({ label: 'Radius', before: formatDistance(r, displayPrefs), after: formatDistance(r * factor, displayPrefs) });
        dimRows.push({ label: 'Diameter', before: formatDistance(r * 2, displayPrefs), after: formatDistance(r * 2 * factor, displayPrefs) });
      } else {
        dimRows.push({ label: 'Radius', before: formatDistance(r, displayPrefs), after: formatDistance(r, displayPrefs) });
      }
    } else if (g.type === 'ARC' && g.arc) {
      const r = g.arc.radius;
      if (type === 'SCALE') {
        dimRows.push({ label: 'Radius', before: formatDistance(r, displayPrefs), after: formatDistance(r * factor, displayPrefs) });
      } else {
        dimRows.push({ label: 'Radius', before: formatDistance(r, displayPrefs), after: formatDistance(r, displayPrefs) });
      }
    } else if (g.type === 'ELLIPSE' && g.ellipse) {
      const rx = g.ellipse.radiusX;
      const ry = g.ellipse.radiusY;
      if (type === 'SCALE') {
        dimRows.push({ label: 'Radius X', before: formatDistance(rx, displayPrefs), after: formatDistance(rx * factor, displayPrefs) });
        dimRows.push({ label: 'Radius Y', before: formatDistance(ry, displayPrefs), after: formatDistance(ry * factor, displayPrefs) });
      } else {
        dimRows.push({ label: 'Rx', before: formatDistance(rx, displayPrefs), after: formatDistance(rx, displayPrefs) });
        dimRows.push({ label: 'Ry', before: formatDistance(ry, displayPrefs), after: formatDistance(ry, displayPrefs) });
      }
    } else if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 2) {
      const len = polylineLength(g.vertices);
      if (type === 'SCALE') {
        dimRows.push({ label: 'Length', before: formatDistance(len, displayPrefs), after: formatDistance(len * factor, displayPrefs) });
      } else {
        dimRows.push({ label: 'Length', before: formatDistance(len, displayPrefs), after: formatDistance(len, displayPrefs) });
      }
    } else if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 3) {
      const perim = polygonPerimeter(g.vertices);
      const area = polygonArea(g.vertices);
      if (type === 'SCALE') {
        dimRows.push({ label: 'Perimeter', before: formatDistance(perim, displayPrefs), after: formatDistance(perim * factor, displayPrefs) });
        dimRows.push({ label: 'Area', before: formatArea(area, displayPrefs), after: formatArea(area * factor * factor, displayPrefs) });
      } else {
        dimRows.push({ label: 'Perimeter', before: formatDistance(perim, displayPrefs), after: formatDistance(perim, displayPrefs) });
        dimRows.push({ label: 'Area', before: formatArea(area, displayPrefs), after: formatArea(area, displayPrefs) });
      }
    } else if (g.type === 'TEXT' && g.point) {
      // TEXT: nothing measurable changes on scale/rotate except position (shown implicitly)
    }
  }

  // Deduplicate rows when multiple features have the same label (show the first only per type)
  const seenLabels = new Set<string>();
  const uniqueRows = dimRows.filter((r) => {
    const key = r.label;
    if (seenLabels.has(key)) return false;
    seenLabels.add(key);
    return true;
  });

  const Icon = type === 'ROTATE' ? RotateCw : Expand;
  const title = type === 'ROTATE' ? 'Rotate' : 'Scale / Resize';
  const inputLabel = type === 'ROTATE' ? 'Angle (°)' : 'Scale Factor';
  const hint = type === 'ROTATE'
    ? 'Move cursor to rotate · Click to commit'
    : 'Move cursor to scale · Click to commit';

  return (
    <div
      className="absolute z-40 left-3 bottom-10 w-56 bg-gray-900 border border-blue-500/60 rounded-lg shadow-2xl overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center gap-1.5 text-blue-300 text-xs font-semibold">
          <Icon size={11} />
          {title}
        </div>
        <button
          className="p-0.5 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
          onClick={onCancel}
          title="Cancel (Esc)"
        >
          <X size={11} />
        </button>
      </div>

      {/* Primary value input */}
      <div className="px-3 pt-2.5 pb-1 space-y-1.5">
        <div className="text-gray-500 text-[9px] uppercase tracking-wider">{inputLabel}</div>
        <input
          ref={inputRef}
          type="number"
          step={type === 'ROTATE' ? '0.1' : '0.001'}
          className="w-full bg-gray-700 text-white border border-blue-500/60 focus:border-blue-400 rounded px-2 py-1 text-sm font-mono outline-none text-right"
          value={inputStr}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={(e) => e.target.select()}
        />
        <div className="text-[9px] text-gray-600 text-center">{hint}</div>
      </div>

      {/* Dimension rows — per-element before→after */}
      {uniqueRows.length > 0 && (
        <div className="px-3 py-1 border-t border-gray-700/60 space-y-0.5">
          <div className="text-gray-500 text-[9px] uppercase tracking-wider mb-1">Dimensions</div>
          {uniqueRows.map((r, i) => (
            <DimRow key={i} label={r.label} before={r.before} after={r.after} />
          ))}
        </div>
      )}

      {/* Apply / Cancel buttons */}
      <div className="flex gap-1.5 px-3 py-2 border-t border-gray-700/60">
        <button
          className="flex-1 flex items-center justify-center gap-1 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] rounded transition-colors"
          onClick={handleCommit}
        >
          <Check size={10} /> Apply
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-[10px] rounded border border-gray-600 transition-colors"
          onClick={onCancel}
        >
          <X size={10} /> Cancel
        </button>
      </div>
    </div>
  );
}
