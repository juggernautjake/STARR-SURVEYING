'use client';
// app/admin/cad/components/FeaturePropertiesDialog.tsx
// Double-click on a feature to edit all its attributes in real time.

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { useDrawingStore, useUndoStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Point2D } from '@/lib/cad/types';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';
import { formatDistance } from '@/lib/cad/geometry/units';
import { formatBearing, formatAzimuth, inverseBearingDistance } from '@/lib/cad/geometry/bearing';
import { parseLength } from '@/lib/cad/units';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  featureId: string;
  onClose: () => void;
  /** Initial screen position (where the user double-clicked) */
  initialX: number;
  initialY: number;
}

const DIALOG_WIDTH = 300;
const DIALOG_HEIGHT = 420;

function formatN(n: number): string {
  return n.toFixed(4);
}
// Coordinate-edit helper. Accepts every linear-unit suffix
// (6in / 0.5ft / 5'-6" / 1 1/2 ft / 2 m) via `parseLength`;
// when no suffix is present the input is treated as feet.
// Plain numeric input keeps working exactly like before.
function CoordInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(formatN(value));
  const [error, setError] = useState(false);
  // keep in sync when value changes from outside
  useEffect(() => {
    setLocal(formatN(value));
    setError(false);
  }, [value]);
  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange(0);
      setLocal(formatN(0));
      setError(false);
      return;
    }
    const r = parseLength(trimmed, 'FT');
    if (!r) {
      // Surveyor typed something we can't parse — keep the raw
      // text so they can correct it, and flag visually.
      setError(true);
      return;
    }
    setError(false);
    onChange(r.feet);
    setLocal(formatN(r.feet));
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400 shrink-0 w-14">{label}</span>
      <input
        className={`flex-1 bg-gray-700 text-white text-xs rounded px-1 py-0.5 text-right outline-none font-mono min-w-0 border ${
          error ? 'border-red-500' : 'border-transparent'
        }`}
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          // Live-preview when the input is purely numeric so the
          // canvas tracks the surveyor's typing; suffix-bearing
          // inputs are only committed on blur.
          const trimmed = e.target.value.trim();
          if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
            const v = parseFloat(trimmed);
            if (!isNaN(v)) onChange(v);
            setError(false);
          }
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        title={'Enter a number (assumed feet) or a value with a unit suffix: 6in, 0.5ft, 5\'-6", 1 1/2 ft, 2 m, etc.'}
      />
    </div>
  );
}

export default function FeaturePropertiesDialog({ featureId, onClose, initialX, initialY }: Props) {
  useEscapeToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const drawingStore = useDrawingStore();
  const undoStore = useUndoStore();

  // Dragging — `dialogRef` is shared with `useFocusTrap` above
  // so the same element drives both behaviours.
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [pos, setPos] = useState(() => {
    // Place dialog so it doesn't go off screen
    const x = Math.min(Math.max(initialX + 16, 8), window.innerWidth - DIALOG_WIDTH - 8);
    const y = Math.min(Math.max(initialY - 20, 8), window.innerHeight - DIALOG_HEIGHT - 8);
    return { x, y };
  });

  // Collapsible sections
  const [showGeom, setShowGeom] = useState(true);
  const [showStyle, setShowStyle] = useState(true);
  const [showProps, setShowProps] = useState(false);
  // Toggle between N/E (Northing/Easting with origin offset) and raw X/Y display
  const [useNE, setUseNE] = useState(true);

  // Snapshot before editing (for undo)
  const beforeRef = useRef<Feature | null>(null);
  useEffect(() => {
    const f = drawingStore.getFeature(featureId);
    if (f) beforeRef.current = JSON.parse(JSON.stringify(f));
  }, [featureId, drawingStore]);

  const feature = drawingStore.getFeature(featureId);

  // Push undo when dialog closes (one undo entry per "open → close" session)
  const commitUndo = useCallback(() => {
    const before = beforeRef.current;
    const after = drawingStore.getFeature(featureId);
    if (!before || !after) return;
    // Only push if something changed
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      undoStore.pushUndo({
        id: generateId(),
        description: `Edit ${after.type.toLowerCase()} properties`,
        timestamp: Date.now(),
        operations: [{ type: 'MODIFY_FEATURE', data: { id: featureId, before, after } }],
      });
    }
  }, [featureId, drawingStore, undoStore]);

  function handleClose() {
    commitUndo();
    onClose();
  }

  // ── Real-time style editing ──────────────────────────────────────────────
  function updateStyle(updates: Partial<Feature['style']>) {
    if (!feature) return;
    drawingStore.updateFeature(featureId, { style: { ...feature.style, ...updates } });
  }

  // ── Real-time geometry editing ───────────────────────────────────────────
  function updateVertex(index: number, axis: 'x' | 'y', value: number) {
    if (!feature) return;
    const geom = { ...feature.geometry };
    switch (geom.type) {
      case 'POINT':
        geom.point = { ...(geom.point ?? { x: 0, y: 0 }), [axis]: value };
        break;
      case 'LINE':
        if (index === 0) geom.start = { ...(geom.start ?? { x: 0, y: 0 }), [axis]: value };
        else geom.end = { ...(geom.end ?? { x: 0, y: 0 }), [axis]: value };
        break;
      case 'POLYLINE':
      case 'POLYGON': {
        const verts = [...(geom.vertices ?? [])];
        verts[index] = { ...verts[index], [axis]: value };
        geom.vertices = verts;
        break;
      }
    }
    drawingStore.updateFeatureGeometry(featureId, geom);
  }

  function updateCircle(key: string, value: number) {
    if (!feature || !feature.geometry.circle) return;
    const geom = { ...feature.geometry };
    const c = { ...geom.circle! };
    if (key === 'cx') c.center = { ...c.center, x: value };
    else if (key === 'cy') c.center = { ...c.center, y: value };
    else if (key === 'radius') c.radius = Math.max(0.001, value);
    geom.circle = c;
    drawingStore.updateFeatureGeometry(featureId, geom);
  }

  function updateEllipse(key: string, value: number) {
    if (!feature || !feature.geometry.ellipse) return;
    const geom = { ...feature.geometry };
    const e = { ...geom.ellipse! };
    if (key === 'cx') e.center = { ...e.center, x: value };
    else if (key === 'cy') e.center = { ...e.center, y: value };
    else if (key === 'rx') e.radiusX = Math.max(0.001, value);
    else if (key === 'ry') e.radiusY = Math.max(0.001, value);
    else if (key === 'rotation') e.rotation = (value * Math.PI) / 180;
    geom.ellipse = e;
    drawingStore.updateFeatureGeometry(featureId, geom);
  }

  function updateArc(key: string, value: number) {
    if (!feature || !feature.geometry.arc) return;
    const geom = { ...feature.geometry };
    const a = { ...geom.arc! };
    if (key === 'cx') a.center = { ...a.center, x: value };
    else if (key === 'cy') a.center = { ...a.center, y: value };
    else if (key === 'radius') a.radius = Math.max(0.001, value);
    else if (key === 'startAngle') a.startAngle = (value * Math.PI) / 180;
    else if (key === 'endAngle') a.endAngle = (value * Math.PI) / 180;
    geom.arc = a;
    drawingStore.updateFeatureGeometry(featureId, geom);
  }

  function updateSplinePoint(cpIndex: number, axis: 'x' | 'y', value: number) {
    if (!feature || !feature.geometry.spline) return;
    const geom = { ...feature.geometry };
    const s = { ...geom.spline!, controlPoints: [...geom.spline!.controlPoints] };
    s.controlPoints[cpIndex] = { ...s.controlPoints[cpIndex], [axis]: value };
    geom.spline = s;
    drawingStore.updateFeatureGeometry(featureId, geom);
  }

  // ── Property editing ─────────────────────────────────────────────────────
  function updateProperty(key: string, value: string) {
    if (!feature) return;
    drawingStore.updateFeature(featureId, {
      properties: { ...feature.properties, [key]: value },
    });
  }

  // ── Drag title bar ───────────────────────────────────────────────────────
  function handleTitleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    function onMove(me: MouseEvent) {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.origX + me.clientX - dragRef.current.startX,
        y: dragRef.current.origY + me.clientY - dragRef.current.startY,
      });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Derived values ───────────────────────────────────────────────────────
  function getLength(): number {
    if (!feature) return 0;
    const g = feature.geometry;
    if (g.type === 'LINE' && g.start && g.end) {
      return Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
    }
    if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices) {
      return g.vertices.reduce((sum, v, i) => {
        if (i === 0) return sum;
        const prev = g.vertices![i - 1];
        return sum + Math.hypot(v.x - prev.x, v.y - prev.y);
      }, 0);
    }
    if (g.type === 'CIRCLE' && g.circle) {
      return 2 * Math.PI * g.circle.radius;
    }
    if (g.type === 'ELLIPSE' && g.ellipse) {
      // Ramanujan approximation for ellipse circumference
      const { radiusX: a, radiusY: b } = g.ellipse;
      return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    }
    if (g.type === 'ARC' && g.arc) {
      let angle = g.arc.endAngle - g.arc.startAngle;
      if (angle < 0) angle += 2 * Math.PI;
      return angle * g.arc.radius;
    }
    return 0;
  }

  function getBearing(): number | null {
    if (!feature) return null;
    const g = feature.geometry;
    if (g.type === 'LINE' && g.start && g.end) {
      return (Math.atan2(g.end.y - g.start.y, g.end.x - g.start.x) * 180) / Math.PI;
    }
    return null;
  }

  if (!feature) return null;

  const { document: doc } = drawingStore;
  const layers = doc.layerOrder.map((id) => doc.layers[id]).filter(Boolean);
  const displayPrefs = doc.settings.displayPreferences ?? DEFAULT_DISPLAY_PREFERENCES;
  const originN = displayPrefs.originNorthing ?? 0;
  const originE = displayPrefs.originEasting ?? 0;

  // Helpers to convert between world coords and displayed N/E
  function worldToDisplay(worldX: number, worldY: number) {
    return useNE
      ? { a: worldY + originN, b: worldX + originE }   // { a=Northing, b=Easting }
      : { a: worldX,           b: worldY };              // { a=X,        b=Y }
  }
  function displayToWorldX(displayA: number, displayB: number) {
    return useNE ? displayB - originE : displayA;
  }
  function displayToWorldY(displayA: number, displayB: number) {
    return useNE ? displayA - originN : displayB;
  }
  const labelA = useNE ? 'N (Northing)' : 'X';
  const labelB = useNE ? 'E (Easting)'  : 'Y';
  const labelAShort = useNE ? 'Northing' : 'X';
  const labelBShort = useNE ? 'Easting'  : 'Y';

  const geom = feature.geometry;
  const bearing = getBearing();
  const length = getLength();

  // ── Derived measurements ─────────────────────────────────────────────────
  let lineMeasurements: { bearing: string; azimuth: string; distance: string } | null = null;
  let lengthStr: string | null = null;

  if (geom.type === 'LINE' && geom.start && geom.end) {
    const { azimuth, distance } = inverseBearingDistance(geom.start, geom.end);
    lineMeasurements = {
      bearing:  formatBearing(azimuth),
      azimuth:  formatAzimuth(azimuth),
      distance: formatDistance(distance, displayPrefs),
    };
  } else if ((geom.type === 'POLYLINE' || geom.type === 'POLYGON') && geom.vertices) {
    const len = geom.vertices.reduce((sum, v, i) => {
      if (i === 0) return 0;
      const prev = geom.vertices![i - 1];
      return sum + Math.hypot(v.x - prev.x, v.y - prev.y);
    }, 0);
    lengthStr = formatDistance(len, displayPrefs);
  } else if (geom.type === 'CIRCLE' && geom.circle) {
    lengthStr = `r = ${formatDistance(geom.circle.radius, displayPrefs)}`;
  } else if (geom.type === 'ARC' && geom.arc) {
    let angle = geom.arc.endAngle - geom.arc.startAngle;
    if (angle < 0) angle += 2 * Math.PI;
    const arcLen = angle * geom.arc.radius;
    lengthStr = formatDistance(arcLen, displayPrefs);
  } else if (geom.type === 'ELLIPSE' && geom.ellipse) {
    const { radiusX: a, radiusY: b } = geom.ellipse;
    const perim = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    lengthStr = formatDistance(perim, displayPrefs);
  }
  let vertexLabels: string[] = [];
  let vertices: Point2D[] = [];
  const isCurveType = geom.type === 'CIRCLE' || geom.type === 'ELLIPSE' || geom.type === 'ARC' || geom.type === 'SPLINE';
  if (geom.type === 'POINT' && geom.point) {
    vertices = [geom.point];
    vertexLabels = ['Position'];
  } else if (geom.type === 'LINE') {
    vertices = [geom.start!, geom.end!].filter(Boolean);
    vertexLabels = ['Start', 'End'];
  } else if ((geom.type === 'POLYLINE' || geom.type === 'POLYGON') && geom.vertices) {
    vertices = geom.vertices;
    vertexLabels = geom.vertices.map((_, i) => `Vertex ${i + 1}`);
  }

  // ── Extra properties (polylineGroupId etc) ───────────────────────────────
  const propEntries = Object.entries(feature.properties);

  return (
    <div
      ref={dialogRef}
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl text-xs text-gray-200 select-none animate-[scaleIn_150ms_cubic-bezier(0.16,1,0.3,1)]"
      style={{ left: pos.x, top: pos.y, width: DIALOG_WIDTH, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-700 rounded-t-lg cursor-move border-b border-gray-600 shrink-0"
        onMouseDown={handleTitleMouseDown}
      >
        <span className="font-semibold text-white text-xs tracking-wide">
          {feature.type} Properties
        </span>
        <div className="flex items-center gap-1.5 ml-2">
          {/* N/E ↔ X/Y toggle */}
          <button
            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
              useNE
                ? 'bg-blue-700 border-blue-500 text-white'
                : 'bg-gray-700 border-gray-500 text-gray-400 hover:text-white'
            }`}
            title={useNE ? 'Showing Northing/Easting — click for X/Y' : 'Showing X/Y — click for N/E'}
            onClick={() => setUseNE((v) => !v)}
          >
            {useNE ? 'N/E' : 'X/Y'}
          </button>
          <button
            className="text-gray-400 hover:text-white transition-colors"
            onClick={handleClose}
            title="Close (changes are applied in real-time)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-2 space-y-2">

        {/* Object info */}
        <div className="px-1 py-1 bg-gray-750 rounded space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Type</span>
            <span className="text-white font-semibold">{feature.type}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Layer</span>
            <select
              className="bg-gray-700 text-white rounded px-1 py-0.5 text-xs outline-none max-w-32"
              value={feature.layerId}
              onChange={(e) => drawingStore.updateFeature(featureId, { layerId: e.target.value })}
            >
              {layers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          {feature.properties.polylineGroupId && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Group ID</span>
              <span className="text-blue-300 font-mono text-[9px] truncate max-w-32" title={String(feature.properties.polylineGroupId)}>
                {String(feature.properties.polylineGroupId).slice(0, 8)}…
              </span>
            </div>
          )}
        </div>

        {/* Derived measurements (read-only) */}
        {(lineMeasurements || lengthStr) && (
          <div className="px-1 py-1 bg-blue-950/40 border border-blue-800/40 rounded space-y-1">
            {lineMeasurements && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Bearing</span>
                  <span className="text-cyan-300 font-mono">{lineMeasurements.bearing}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Azimuth</span>
                  <span className="text-gray-300 font-mono">{lineMeasurements.azimuth}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Distance</span>
                  <span className="text-gray-300 font-mono">{lineMeasurements.distance}</span>
                </div>
              </>
            )}
            {lengthStr && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{geom.type === 'POLYGON' ? 'Perimeter' : 'Length'}</span>
                <span className="text-cyan-300 font-mono">{lengthStr}</span>
              </div>
            )}
          </div>
        )}

        {/* Style section */}
        <div>
          <button
            className="w-full flex items-center justify-between py-0.5 text-gray-400 hover:text-white transition-colors"
            onClick={() => setShowStyle(!showStyle)}
          >
            <span className="font-semibold uppercase tracking-wider text-[10px]">Style</span>
            {showStyle ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {showStyle && (
            <div className="space-y-1.5 mt-1 pl-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Color</span>
                <input
                  type="color"
                  className="w-8 h-6 rounded cursor-pointer bg-transparent border-0 outline-none"
                  value={feature.style.color ?? '#000000'}
                  onChange={(e) => updateStyle({ color: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 shrink-0">Line Weight</span>
                <input
                  className="w-16 bg-gray-700 text-white rounded px-1 py-0.5 text-right outline-none font-mono text-xs"
                  type="number"
                  step="0.5"
                  min="0.1"
                  max="20"
                  value={feature.style.lineWeight ?? 1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) updateStyle({ lineWeight: Math.max(0.1, Math.min(20, v)) });
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 shrink-0">Opacity %</span>
                <input
                  className="w-16 bg-gray-700 text-white rounded px-1 py-0.5 text-right outline-none font-mono text-xs"
                  type="number"
                  step="5"
                  min="0"
                  max="100"
                  value={Math.round(feature.style.opacity * 100)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) updateStyle({ opacity: Math.max(0, Math.min(1, v / 100)) });
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Geometry section */}
        <div>
          <button
            className="w-full flex items-center justify-between py-0.5 text-gray-400 hover:text-white transition-colors"
            onClick={() => setShowGeom(!showGeom)}
          >
            <span className="font-semibold uppercase tracking-wider text-[10px]">Geometry</span>
            {showGeom ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {showGeom && (
            <div className="space-y-2 mt-1 pl-1">
              {/* Circle geometry */}
              {geom.type === 'CIRCLE' && geom.circle && (() => {
                const circ = geom.circle!;
                return (
                  <>
                    <div className="text-gray-500 text-[9px] uppercase tracking-wider pt-1">Center</div>
                    <CoordInput
                      label={labelAShort}
                      value={worldToDisplay(circ.center.x, circ.center.y).a}
                      onChange={(val) => {
                        const { b } = worldToDisplay(circ.center.x, circ.center.y);
                        updateCircle('cx', displayToWorldX(val, b));
                        updateCircle('cy', displayToWorldY(val, b));
                      }}
                    />
                    <CoordInput
                      label={labelBShort}
                      value={worldToDisplay(circ.center.x, circ.center.y).b}
                      onChange={(val) => {
                        const { a } = worldToDisplay(circ.center.x, circ.center.y);
                        updateCircle('cx', displayToWorldX(a, val));
                        updateCircle('cy', displayToWorldY(a, val));
                      }}
                    />
                    <CoordInput label="Radius" value={circ.radius} onChange={(v) => updateCircle('radius', v)} />
                  </>
                );
              })()}

              {/* Ellipse geometry */}
              {geom.type === 'ELLIPSE' && geom.ellipse && (() => {
                const ell = geom.ellipse!;
                return (
                  <>
                    <div className="text-gray-500 text-[9px] uppercase tracking-wider pt-1">Center</div>
                    <CoordInput
                      label={labelAShort}
                      value={worldToDisplay(ell.center.x, ell.center.y).a}
                      onChange={(val) => {
                        const { b } = worldToDisplay(ell.center.x, ell.center.y);
                        updateEllipse('cx', displayToWorldX(val, b));
                        updateEllipse('cy', displayToWorldY(val, b));
                      }}
                    />
                    <CoordInput
                      label={labelBShort}
                      value={worldToDisplay(ell.center.x, ell.center.y).b}
                      onChange={(val) => {
                        const { a } = worldToDisplay(ell.center.x, ell.center.y);
                        updateEllipse('cx', displayToWorldX(a, val));
                        updateEllipse('cy', displayToWorldY(a, val));
                      }}
                    />
                    <CoordInput label="Radius X" value={ell.radiusX} onChange={(v) => updateEllipse('rx', v)} />
                    <CoordInput label="Radius Y" value={ell.radiusY} onChange={(v) => updateEllipse('ry', v)} />
                    <CoordInput label="Rotation°" value={(ell.rotation * 180) / Math.PI} onChange={(v) => updateEllipse('rotation', v)} />
                  </>
                );
              })()}

              {/* Arc geometry */}
              {geom.type === 'ARC' && geom.arc && (() => {
                const arc = geom.arc!;
                return (
                  <>
                    <div className="text-gray-500 text-[9px] uppercase tracking-wider pt-1">Center</div>
                    <CoordInput
                      label={labelAShort}
                      value={worldToDisplay(arc.center.x, arc.center.y).a}
                      onChange={(val) => {
                        const { b } = worldToDisplay(arc.center.x, arc.center.y);
                        updateArc('cx', displayToWorldX(val, b));
                        updateArc('cy', displayToWorldY(val, b));
                      }}
                    />
                    <CoordInput
                      label={labelBShort}
                      value={worldToDisplay(arc.center.x, arc.center.y).b}
                      onChange={(val) => {
                        const { a } = worldToDisplay(arc.center.x, arc.center.y);
                        updateArc('cx', displayToWorldX(a, val));
                        updateArc('cy', displayToWorldY(a, val));
                      }}
                    />
                    <CoordInput label="Radius" value={arc.radius} onChange={(v) => updateArc('radius', v)} />
                    <CoordInput label="Start°" value={(arc.startAngle * 180) / Math.PI} onChange={(v) => updateArc('startAngle', v)} />
                    <CoordInput label="End°" value={(arc.endAngle * 180) / Math.PI} onChange={(v) => updateArc('endAngle', v)} />
                  </>
                );
              })()}

              {/* Spline geometry — show fit points */}
              {geom.type === 'SPLINE' && geom.spline && (() => {
                const cp = geom.spline!.controlPoints;
                const fitPoints: { pt: Point2D; cpIdx: number }[] = [];
                for (let i = 0; i < cp.length; i += 3) {
                  fitPoints.push({ pt: cp[i], cpIdx: i });
                }
                return (
                  <>
                    <div className="text-gray-500 text-[9px] uppercase tracking-wider pt-1">
                      Fit Points ({fitPoints.length})
                    </div>
                    {fitPoints.map((fp, i) => (
                      <div key={fp.cpIdx} className="space-y-1">
                        <div className="text-gray-500 text-[9px]">Point {i + 1}</div>
                        <CoordInput
                          label={labelAShort}
                          value={worldToDisplay(fp.pt.x, fp.pt.y).a}
                          onChange={(val) => {
                            const { b } = worldToDisplay(fp.pt.x, fp.pt.y);
                            updateSplinePoint(fp.cpIdx, 'x', displayToWorldX(val, b));
                            updateSplinePoint(fp.cpIdx, 'y', displayToWorldY(val, b));
                          }}
                        />
                        <CoordInput
                          label={labelBShort}
                          value={worldToDisplay(fp.pt.x, fp.pt.y).b}
                          onChange={(val) => {
                            const { a } = worldToDisplay(fp.pt.x, fp.pt.y);
                            updateSplinePoint(fp.cpIdx, 'x', displayToWorldX(a, val));
                            updateSplinePoint(fp.cpIdx, 'y', displayToWorldY(a, val));
                          }}
                        />
                      </div>
                    ))}
                  </>
                );
              })()}

              {/* Standard vertices (POINT, LINE, POLYLINE, POLYGON) */}
              {!isCurveType && vertices.map((v, i) => {
                const { a: dispA, b: dispB } = worldToDisplay(v.x, v.y);
                return (
                  <div key={i} className="space-y-1">
                    {vertices.length > 1 && (
                      <div className="text-gray-500 text-[9px] uppercase tracking-wider pt-1">
                        {vertexLabels[i] ?? `Vertex ${i + 1}`}
                      </div>
                    )}
                    <CoordInput
                      label={labelA}
                      value={dispA}
                      onChange={(val) => {
                        updateVertex(i, 'x', displayToWorldX(val, dispB));
                        updateVertex(i, 'y', displayToWorldY(val, dispB));
                      }}
                    />
                    <CoordInput
                      label={labelB}
                      value={dispB}
                      onChange={(val) => {
                        updateVertex(i, 'x', displayToWorldX(dispA, val));
                        updateVertex(i, 'y', displayToWorldY(dispA, val));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Extra properties section */}
        {propEntries.length > 0 && (
          <div>
            <button
              className="w-full flex items-center justify-between py-0.5 text-gray-400 hover:text-white transition-colors"
              onClick={() => setShowProps(!showProps)}
            >
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Properties ({propEntries.length})
              </span>
              {showProps ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showProps && (
              <div className="space-y-1.5 mt-1 pl-1">
                {propEntries.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-gray-400 shrink-0 truncate max-w-20" title={key}>{key}</span>
                    {key === 'polylineGroupId' ? (
                      <span className="text-blue-300 font-mono text-[9px] truncate">{String(value).slice(0, 12)}…</span>
                    ) : (
                      <input
                        className="flex-1 bg-gray-700 text-white rounded px-1 py-0.5 text-xs outline-none min-w-0"
                        value={String(value)}
                        onChange={(e) => updateProperty(key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-700 text-gray-500 text-[10px] shrink-0">
        Changes apply immediately · Close to record undo
      </div>
    </div>
  );
}
