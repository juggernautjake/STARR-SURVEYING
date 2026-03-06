'use client';
// app/admin/cad/components/FeaturePropertiesDialog.tsx
// Double-click on a feature to edit all its attributes in real time.

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { useDrawingStore, useUndoStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Point2D } from '@/lib/cad/types';

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
function parseN(s: string): number {
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

// ── Editable coordinate input ────────────────────────────────────────────────
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
  // keep in sync when value changes from outside
  useEffect(() => setLocal(formatN(value)), [value]);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400 shrink-0 w-14">{label}</span>
      <input
        className="flex-1 bg-gray-700 text-white text-xs rounded px-1 py-0.5 text-right outline-none font-mono min-w-0"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        onBlur={() => {
          const v = parseN(local);
          setLocal(formatN(v));
          onChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}

export default function FeaturePropertiesDialog({ featureId, onClose, initialX, initialY }: Props) {
  const drawingStore = useDrawingStore();
  const undoStore = useUndoStore();

  // Dragging
  const dialogRef = useRef<HTMLDivElement>(null);
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
  const geom = feature.geometry;
  const bearing = getBearing();
  const length = getLength();

  // ── Geometry vertices list ───────────────────────────────────────────────
  let vertices: Point2D[] = [];
  let vertexLabels: string[] = [];
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
        <button
          className="text-gray-400 hover:text-white transition-colors ml-2"
          onClick={handleClose}
          title="Close (changes are applied in real-time)"
        >
          <X size={14} />
        </button>
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
        {(length > 0 || bearing !== null) && (
          <div className="px-1 py-1 bg-blue-950/40 border border-blue-800/40 rounded space-y-1">
            {length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{geom.type === 'POLYGON' ? 'Perimeter' : 'Length'}</span>
                <span className="text-cyan-300 font-mono">{length.toFixed(4)}</span>
              </div>
            )}
            {bearing !== null && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Bearing</span>
                <span className="text-cyan-300 font-mono">{bearing.toFixed(3)}°</span>
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
              {geom.type === 'CIRCLE' && geom.circle && (
                <>
                  <div className="text-gray-500 text-[9px] uppercase tracking-wider pt-1">Center</div>
                  <CoordInput label="X" value={geom.circle.center.x} onChange={(v) => updateCircle('cx', v)} />
                  <CoordInput label="Y" value={geom.circle.center.y} onChange={(v) => updateCircle('cy', v)} />
                  <CoordInput label="Radius" value={geom.circle.radius} onChange={(v) => updateCircle('radius', v)} />
                </>
              )}

              {/* Ellipse geometry */}
              {geom.type === 'ELLIPSE' && geom.ellipse && (
                <>
                  <div className="text-gray-500 text-[9px] uppercase tracking-wider pt-1">Center</div>
                  <CoordInput label="X" value={geom.ellipse.center.x} onChange={(v) => updateEllipse('cx', v)} />
                  <CoordInput label="Y" value={geom.ellipse.center.y} onChange={(v) => updateEllipse('cy', v)} />
                  <CoordInput label="Radius X" value={geom.ellipse.radiusX} onChange={(v) => updateEllipse('rx', v)} />
                  <CoordInput label="Radius Y" value={geom.ellipse.radiusY} onChange={(v) => updateEllipse('ry', v)} />
                  <CoordInput label="Rotation°" value={(geom.ellipse.rotation * 180) / Math.PI} onChange={(v) => updateEllipse('rotation', v)} />
                </>
              )}

              {/* Arc geometry */}
              {geom.type === 'ARC' && geom.arc && (
                <>
                  <div className="text-gray-500 text-[9px] uppercase tracking-wider pt-1">Center</div>
                  <CoordInput label="X" value={geom.arc.center.x} onChange={(v) => updateArc('cx', v)} />
                  <CoordInput label="Y" value={geom.arc.center.y} onChange={(v) => updateArc('cy', v)} />
                  <CoordInput label="Radius" value={geom.arc.radius} onChange={(v) => updateArc('radius', v)} />
                  <CoordInput label="Start°" value={(geom.arc.startAngle * 180) / Math.PI} onChange={(v) => updateArc('startAngle', v)} />
                  <CoordInput label="End°" value={(geom.arc.endAngle * 180) / Math.PI} onChange={(v) => updateArc('endAngle', v)} />
                </>
              )}

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
                        <CoordInput label="X" value={fp.pt.x} onChange={(v) => updateSplinePoint(fp.cpIdx, 'x', v)} />
                        <CoordInput label="Y" value={fp.pt.y} onChange={(v) => updateSplinePoint(fp.cpIdx, 'y', v)} />
                      </div>
                    ))}
                  </>
                );
              })()}

              {/* Standard vertices (POINT, LINE, POLYLINE, POLYGON) */}
              {!isCurveType && vertices.map((v, i) => (
                <div key={i} className="space-y-1">
                  {vertices.length > 1 && (
                    <div className="text-gray-500 text-[9px] uppercase tracking-wider pt-1">
                      {vertexLabels[i] ?? `Vertex ${i + 1}`}
                    </div>
                  )}
                  <CoordInput
                    label={vertices.length === 1 ? 'X (East)' : 'X'}
                    value={v.x}
                    onChange={(val) => updateVertex(i, 'x', val)}
                  />
                  <CoordInput
                    label={vertices.length === 1 ? 'Y (North)' : 'Y'}
                    value={v.y}
                    onChange={(val) => updateVertex(i, 'y', val)}
                  />
                </div>
              ))}
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
