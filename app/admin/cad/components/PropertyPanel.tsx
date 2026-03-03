'use client';
// app/admin/cad/components/PropertyPanel.tsx — Selected feature properties panel

import { useState } from 'react';
import { useDrawingStore, useSelectionStore, useUndoStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Feature } from '@/lib/cad/types';

function toHex(value: string): string {
  return value.startsWith('#') ? value : `#${value}`;
}

function formatCoord(n: number): string {
  return n.toFixed(3);
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
      style: { color, lineWeight, opacity },
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

        {/* Geometry */}
        <div className="space-y-1 border-t border-gray-700 pt-2">
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">Geometry</div>
          {geom.type === 'POINT' && geom.point && (
            <div className="font-mono text-[10px] text-gray-300 space-y-0.5">
              <div>X: {formatCoord(geom.point.x)}</div>
              <div>Y: {formatCoord(geom.point.y)}</div>
            </div>
          )}
          {geom.type === 'LINE' && geom.start && geom.end && (
            <div className="font-mono text-[10px] text-gray-300 space-y-0.5">
              <div>Start: ({formatCoord(geom.start.x)}, {formatCoord(geom.start.y)})</div>
              <div>End: ({formatCoord(geom.end.x)}, {formatCoord(geom.end.y)})</div>
              <div>
                Length:{' '}
                {formatCoord(
                  Math.sqrt(
                    (geom.end.x - geom.start.x) ** 2 + (geom.end.y - geom.start.y) ** 2,
                  ),
                )}
              </div>
              <div>
                Bearing:{' '}
                {(
                  (Math.atan2(geom.end.y - geom.start.y, geom.end.x - geom.start.x) * 180) /
                  Math.PI
                ).toFixed(2)}
                °
              </div>
            </div>
          )}
          {(geom.type === 'POLYLINE' || geom.type === 'POLYGON') && geom.vertices && (
            <div className="font-mono text-[10px] text-gray-300 space-y-0.5">
              <div>Vertices: {geom.vertices.length}</div>
              {geom.type === 'POLYLINE' && geom.vertices.length >= 2 && (
                <div>
                  Total Length:{' '}
                  {formatCoord(
                    geom.vertices.reduce((sum, v, i) => {
                      if (i === 0) return 0;
                      const prev = geom.vertices![i - 1];
                      return sum + Math.sqrt((v.x - prev.x) ** 2 + (v.y - prev.y) ** 2);
                    }, 0),
                  )}
                </div>
              )}
              {geom.type === 'POLYGON' && (
                <div>
                  Perimeter:{' '}
                  {formatCoord(
                    geom.vertices.reduce((sum, v, i) => {
                      const next = geom.vertices![(i + 1) % geom.vertices!.length];
                      return sum + Math.sqrt((next.x - v.x) ** 2 + (next.y - v.y) ** 2);
                    }, 0),
                  )}
                </div>
              )}
            </div>
          )}
        </div>

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
