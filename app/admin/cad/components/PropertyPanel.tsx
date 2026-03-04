'use client';
// app/admin/cad/components/PropertyPanel.tsx — Selected feature properties panel

import { useState, useEffect } from 'react';
import { useDrawingStore, useSelectionStore, useUndoStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Feature } from '@/lib/cad/types';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';

// ── Inline editable coordinate input ────────────────────────────────────────
function fmtCoord(n: number): string {
  return isNaN(n) ? '0.000' : n.toFixed(3);
}

function CoordInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(fmtCoord(value));
  useEffect(() => setLocal(fmtCoord(value)), [value]);
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-500 w-4 shrink-0 font-mono text-[10px]">{label}</span>
      <input
        className="flex-1 bg-gray-700 text-white rounded px-1 py-0.5 text-right outline-none font-mono text-[10px] min-w-0"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        onBlur={() => {
          const v = parseFloat(local);
          const safe = isNaN(v) ? value : v;
          setLocal(fmtCoord(safe));
          onChange(safe);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}

function toHex(value: string): string {
  return value.startsWith('#') ? value : `#${value}`;
}

export default function PropertyPanel() {
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const undoStore = useUndoStore();

  const selectedIds = Array.from(selectionStore.selectedIds);
  const features = selectedIds
    .map((id) => drawingStore.getFeature(id))
    .filter(Boolean) as Feature[];

  // Local edit state for single-feature editing
  const [editColor, setEditColor] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState<string | null>(null);
  const [editOpacity, setEditOpacity] = useState<string | null>(null);

  const single = features.length === 1 ? features[0] : null;
  const displayColor = editColor ?? (single?.style.color ?? '#000000');
  const displayWeight = editWeight ?? (single ? String(single.style.lineWeight) : '1');
  const displayOpacity = editOpacity ?? (single ? String(Math.round(single.style.opacity * 100)) : '100');

  function commitStyleChange() {
    if (!single) return;
    const before = drawingStore.getFeature(single.id)!;
    const color = toHex(displayColor);
    const lineWeight = Math.max(0.1, Math.min(20, parseFloat(displayWeight) || 1));
    const opacity = Math.max(0, Math.min(1, (parseFloat(displayOpacity) || 100) / 100));
    drawingStore.updateFeature(single.id, {
      style: { ...DEFAULT_FEATURE_STYLE, ...single.style, color, lineWeight, opacity, isOverride: true },
    });
    const after = drawingStore.getFeature(single.id)!;
    undoStore.pushUndo({
      id: generateId(),
      description: 'Edit style',
      timestamp: Date.now(),
      operations: [{ type: 'MODIFY_FEATURE', data: { id: single.id, before, after } }],
    });
    setEditColor(null);
    setEditWeight(null);
    setEditOpacity(null);
  }

  function handleLayerChange(layerId: string) {
    if (!single) return;
    const before = { ...single };
    drawingStore.updateFeature(single.id, { layerId });
    const after = drawingStore.getFeature(single.id)!;
    undoStore.pushUndo({
      id: generateId(),
      description: 'Change layer',
      timestamp: Date.now(),
      operations: [{ type: 'MODIFY_FEATURE', data: { id: single.id, before, after } }],
    });
  }

  // Real-time coordinate editing — updates canvas immediately on every keystroke.
  function updateCoord(index: number, axis: 'x' | 'y', value: number) {
    if (!single) return;
    const before = drawingStore.getFeature(single.id)!;
    const geom = { ...before.geometry };
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
    drawingStore.updateFeatureGeometry(single.id, geom);
  }

  const { document: doc } = drawingStore;
  const layers = doc.layerOrder.map((id) => doc.layers[id]).filter(Boolean);

  if (features.length === 0) {
    return (
      <div className="flex flex-col h-full text-gray-400 text-xs">
        <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700">
          Properties
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-600 text-[10px] text-center px-2">
          No selection.
          <br />Select features to edit.
        </div>
      </div>
    );
  }

  if (features.length > 1) {
    // Multi-select: show count + allow bulk color/weight change
    return (
      <div className="flex flex-col h-full text-gray-200 text-xs">
        <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700">
          Properties
        </div>
        <div className="p-2 space-y-2">
          <div className="text-gray-400">{features.length} objects selected</div>
          <div className="text-gray-500 text-[10px]">
            {features.map((f) => f.type).join(', ')}
          </div>
          <div className="border-t border-gray-700 pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Color</span>
              <input
                type="color"
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                defaultValue="#000000"
                onChange={(e) => {
                  const color = e.target.value;
                  for (const f of features) {
                    drawingStore.updateFeature(f.id, { style: { ...f.style, color } });
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Single feature
  const feature = single!;
  const layer = doc.layers[feature.layerId];
  const geom = feature.geometry;

  return (
    <div className="flex flex-col h-full text-gray-200 text-xs overflow-y-auto">
      <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700 flex-shrink-0">
        Properties
      </div>

      <div className="p-2 space-y-3 flex-1 overflow-y-auto">
        {/* Type */}
        <div className="space-y-1">
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">Object</div>
          <div className="text-white font-semibold">{feature.type}</div>
        </div>

        {/* Layer */}
        <div className="space-y-1">
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">Layer</div>
          <select
            className="w-full bg-gray-700 text-white rounded px-1 py-0.5 text-xs outline-none"
            value={feature.layerId}
            onChange={(e) => handleLayerChange(e.target.value)}
          >
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Style */}
        <div className="space-y-2 border-t border-gray-700 pt-2">
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">Style</div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Color</span>
            <input
              type="color"
              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
              value={displayColor}
              onChange={(e) => setEditColor(e.target.value)}
              onBlur={commitStyleChange}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-400 shrink-0">Line Weight</span>
            <input
              className="w-14 bg-gray-700 text-white rounded px-1 py-0.5 text-right outline-none"
              type="number"
              step="0.5"
              min="0.1"
              max="20"
              value={displayWeight}
              onChange={(e) => setEditWeight(e.target.value)}
              onBlur={commitStyleChange}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-400 shrink-0">Opacity %</span>
            <input
              className="w-14 bg-gray-700 text-white rounded px-1 py-0.5 text-right outline-none"
              type="number"
              step="5"
              min="0"
              max="100"
              value={displayOpacity}
              onChange={(e) => setEditOpacity(e.target.value)}
              onBlur={commitStyleChange}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </div>
        </div>

        {/* Geometry — editable coordinates update canvas in real time */}
        <div className="space-y-1 border-t border-gray-700 pt-2">
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">Geometry</div>
          {geom.type === 'POINT' && geom.point && (
            <div className="space-y-1">
              <CoordInput label="X" value={geom.point.x} onChange={(v) => updateCoord(0, 'x', v)} />
              <CoordInput label="Y" value={geom.point.y} onChange={(v) => updateCoord(0, 'y', v)} />
            </div>
          )}
          {geom.type === 'LINE' && geom.start && geom.end && (
            <div className="space-y-1.5">
              <div className="text-gray-500 text-[9px] uppercase">Start</div>
              <CoordInput label="X" value={geom.start.x} onChange={(v) => updateCoord(0, 'x', v)} />
              <CoordInput label="Y" value={geom.start.y} onChange={(v) => updateCoord(0, 'y', v)} />
              <div className="text-gray-500 text-[9px] uppercase pt-0.5">End</div>
              <CoordInput label="X" value={geom.end.x} onChange={(v) => updateCoord(1, 'x', v)} />
              <CoordInput label="Y" value={geom.end.y} onChange={(v) => updateCoord(1, 'y', v)} />
              <div className="font-mono text-[10px] text-gray-400 pt-0.5">
                L: {Math.hypot(geom.end.x - geom.start.x, geom.end.y - geom.start.y).toFixed(3)}
                &nbsp; ∠{((Math.atan2(geom.end.y - geom.start.y, geom.end.x - geom.start.x) * 180) / Math.PI).toFixed(2)}°
              </div>
            </div>
          )}
          {(geom.type === 'POLYLINE' || geom.type === 'POLYGON') && geom.vertices && (
            <div className="space-y-1">
              <div className="font-mono text-[10px] text-gray-400">
                {geom.vertices.length} vertices
              </div>
              {geom.vertices.map((v, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="text-gray-600 text-[9px]">V{i + 1}</div>
                  <CoordInput label="X" value={v.x} onChange={(val) => updateCoord(i, 'x', val)} />
                  <CoordInput label="Y" value={v.y} onChange={(val) => updateCoord(i, 'y', val)} />
                </div>
              ))}
              {geom.type === 'POLYLINE' && geom.vertices.length >= 2 && (
                <div className="font-mono text-[10px] text-gray-400 pt-0.5">
                  L: {geom.vertices.reduce((sum, v, i) => {
                    if (i === 0) return 0;
                    const p = geom.vertices![i - 1];
                    return sum + Math.hypot(v.x - p.x, v.y - p.y);
                  }, 0).toFixed(3)}
                </div>
              )}
              {geom.type === 'POLYGON' && geom.vertices.length >= 3 && (
                <div className="font-mono text-[10px] text-gray-400 pt-0.5">
                  P: {geom.vertices.reduce((sum, v, i) => {
                    const n = geom.vertices![(i + 1) % geom.vertices!.length];
                    return sum + Math.hypot(n.x - v.x, n.y - v.y);
                  }, 0).toFixed(3)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Polyline group ID (shown for LINE segments that are part of a polyline chain) */}
        {feature.type === 'LINE' && feature.properties.polylineGroupId && (
          <div className="space-y-1 border-t border-gray-700 pt-2">
            <div className="text-gray-500 text-[10px] uppercase tracking-wider">Polyline Group</div>
            <div
              className="font-mono text-[10px] text-blue-300 truncate"
              title={String(feature.properties.polylineGroupId)}
            >
              {String(feature.properties.polylineGroupId).slice(0, 12)}…
            </div>
          </div>
        )}

        {/* Layer info */}
        {layer && (
          <div className="space-y-1 border-t border-gray-700 pt-2">
            <div className="text-gray-500 text-[10px] uppercase tracking-wider">Layer Info</div>
            <div className="flex items-center gap-2 text-[10px] text-gray-300">
              <div
                className="w-3 h-3 rounded-sm border border-gray-500"
                style={{ backgroundColor: layer.color }}
              />
              <span>{layer.name}</span>
              {layer.locked && <span className="text-yellow-400">(locked)</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
