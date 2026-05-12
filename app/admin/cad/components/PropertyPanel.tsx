'use client';
// app/admin/cad/components/PropertyPanel.tsx — Selected feature properties panel

import { useState, useEffect, useRef } from 'react';
import { useDrawingStore, useSelectionStore, useUndoStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Feature } from '@/lib/cad/types';
import { DEFAULT_FEATURE_STYLE, DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';
import { formatBearing, formatAzimuth, inverseBearingDistance } from '@/lib/cad/geometry/bearing';
import { formatDistance } from '@/lib/cad/geometry/units';
import { computeAreaFromPoints2D } from '@/lib/cad/geometry/area';
import SymbolPicker, { SymbolThumbnail } from './SymbolPicker';
import LineTypePicker, { LineTypePreview } from './LineTypePicker';
import { getSymbolById } from '@/lib/cad/styles/symbol-library';
import { getLineTypeById } from '@/lib/cad/styles/linetype-library';

// ── Inline editable coordinate input ────────────────────────────────────────
function fmtCoord(n: number): string {
  return isNaN(n) ? '0.000' : n.toFixed(3);
}

function CoordInput({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  /** Called on every keystroke for live canvas update. */
  onChange: (v: number) => void;
  /** Called on blur / Enter so the caller can record an undo
   *  entry covering the whole edit (focus → blur), instead
   *  of one entry per keystroke. */
  onCommit?: () => void;
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
          onCommit?.();
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
  // Toggle between N/E (Northing/Easting) and raw X/Y
  const [useNE, setUseNE] = useState(true);
  // Phase 3 §11 — symbol-picker open state. POINT features can
  // override their per-feature symbolId from the dialog.
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [lineTypePickerOpen, setLineTypePickerOpen] = useState(false);

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

  function handleBulkLayerChange(layerId: string) {
    if (features.length === 0) return;
    const operations = features.map((f) => {
      const before = { ...f };
      drawingStore.updateFeature(f.id, { layerId });
      const after = drawingStore.getFeature(f.id)!;
      return { type: 'MODIFY_FEATURE' as const, data: { id: f.id, before, after } };
    });
    undoStore.pushUndo({
      id: generateId(),
      description: `Move ${features.length} object${features.length > 1 ? 's' : ''} to layer`,
      timestamp: Date.now(),
      operations,
    });
  }

  // Real-time coordinate editing — updates canvas immediately
  // on every keystroke. The before-snapshot is captured on the
  // first keystroke of an editing session and converted into a
  // single undo entry on blur (`commitCoordEdit`), so users get
  // one undo step per edit session instead of one per
  // character typed.
  const coordEditSnapshotRef = useRef<{ id: string; before: import('@/lib/cad/types').Feature } | null>(null);

  // Reset the in-flight snapshot whenever the active selection
  // changes, so a half-typed edit on feature A doesn't leak
  // into an undo entry for feature B.
  useEffect(() => {
    coordEditSnapshotRef.current = null;
  }, [single?.id]);

  function updateCoord(index: number, axis: 'x' | 'y', value: number) {
    if (!single) return;
    const before = drawingStore.getFeature(single.id)!;
    if (!coordEditSnapshotRef.current || coordEditSnapshotRef.current.id !== single.id) {
      // Snapshot the feature at the start of this edit session
      // so commitCoordEdit can build the right MODIFY_FEATURE
      // operation regardless of how many keystrokes follow.
      coordEditSnapshotRef.current = {
        id: single.id,
        before: JSON.parse(JSON.stringify(before)),
      };
    }
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

  function commitCoordEdit() {
    const snap = coordEditSnapshotRef.current;
    if (!snap) return;
    const after = drawingStore.getFeature(snap.id);
    coordEditSnapshotRef.current = null;
    if (!after) return;
    // Skip when nothing actually changed (e.g. user focused
    // and blurred without typing).
    if (JSON.stringify(snap.before.geometry) === JSON.stringify(after.geometry)) return;
    undoStore.pushUndo({
      id: generateId(),
      description: 'Edit coordinates',
      timestamp: Date.now(),
      operations: [{ type: 'MODIFY_FEATURE', data: { id: snap.id, before: snap.before, after } }],
    });
  }

  const { document: doc } = drawingStore;
  const layers = doc.layerOrder.map((id) => doc.layers[id]).filter(Boolean);
  const displayPrefs = doc.settings.displayPreferences ?? DEFAULT_DISPLAY_PREFERENCES;
  const originN = displayPrefs.originNorthing ?? 0;
  const originE = displayPrefs.originEasting ?? 0;

  // N/E ↔ X/Y coordinate conversion helpers
  function worldToDisplay(wx: number, wy: number) {
    return useNE
      ? { a: wy + originN, b: wx + originE }  // a=Northing, b=Easting
      : { a: wx, b: wy };                      // a=X, b=Y
  }
  function displayToWorldX(dispA: number, dispB: number) {
    return useNE ? dispB - originE : dispA;
  }
  function displayToWorldY(dispA: number, dispB: number) {
    return useNE ? dispA - originN : dispB;
  }
  const labelA = useNE ? 'N' : 'X';
  const labelB = useNE ? 'E' : 'Y';

  if (features.length === 0) {
    return (
      <div className="flex flex-col h-full text-gray-400 text-xs">
        <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700">
          Properties
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-600 text-[10px] text-center px-2 animate-[fadeIn_200ms_ease-out]">
          No selection.
          <br />Select features to edit.
        </div>
      </div>
    );
  }

  if (features.length > 1) {
    // Multi-select: show count + allow bulk color/weight change + move to layer
    const mixedLayers = new Set(features.map((f) => f.layerId)).size > 1;
    const sharedLayerId = mixedLayers ? '' : features[0].layerId;
    return (
      <div className="flex flex-col h-full text-gray-200 text-xs">
        <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700">
          Properties
        </div>
        <div className="p-2 space-y-2 animate-[fadeIn_150ms_ease-out]">
          <div className="text-gray-400">{features.length} objects selected</div>
          <div className="text-gray-500 text-[10px]">
            {features.map((f) => f.type).join(', ')}
          </div>
          <div className="border-t border-gray-700 pt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Color</span>
              <input
                type="color"
                className="w-8 h-6 rounded cursor-pointer border border-gray-600 bg-transparent p-0.5"
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
          {/* Move to layer — bulk action */}
          <div className="border-t border-gray-700 pt-2 space-y-1">
            <div className="text-gray-500 text-[10px] uppercase tracking-wider">Move to Layer</div>
            {mixedLayers && (
              <div className="text-[9px] text-yellow-500 mb-1">Multiple layers selected</div>
            )}
            <div className="flex items-center gap-1.5">
              {(() => {
                const targetLayer = sharedLayerId ? doc.layers[sharedLayerId] : null;
                return targetLayer ? (
                  <div
                    className="w-3 h-3 rounded-sm border border-gray-500 shrink-0"
                    style={{ backgroundColor: targetLayer.color }}
                  />
                ) : null;
              })()}
              <select
                className="flex-1 bg-gray-700 text-white rounded px-1 py-0.5 text-xs outline-none border border-gray-600 focus:border-blue-500"
                value={sharedLayerId}
                onChange={(e) => handleBulkLayerChange(e.target.value)}
              >
                {mixedLayers && <option value="" disabled>— mixed —</option>}
                {layers.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
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
      <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700 flex-shrink-0 flex items-center justify-between">
        <span>Properties</span>
        {/* N/E ↔ X/Y toggle */}
        <button
          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
            useNE
              ? 'bg-blue-700 border-blue-500 text-white'
              : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white'
          }`}
          title={useNE ? 'Showing Northing/Easting — click for X/Y' : 'Showing X/Y — click for N/E'}
          onClick={() => setUseNE((v) => !v)}
        >
          {useNE ? 'N/E' : 'X/Y'}
        </button>
      </div>

      <div className="p-2 space-y-3 flex-1 overflow-y-auto animate-[fadeIn_150ms_ease-out]">
        {/* Type */}
        <div className="space-y-1">
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">Object</div>
          <div className="text-white font-semibold">{feature.type}</div>
        </div>

        {/* Layer — dropdown to move element to a different layer */}
        <div className="space-y-1">
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">Layer</div>
          <div className="flex items-center gap-1.5">
            {layer && (
              <div
                className="w-3 h-3 rounded-sm border border-gray-500 shrink-0"
                style={{ backgroundColor: layer.color }}
                title={layer.name}
              />
            )}
            <select
              className="flex-1 bg-gray-700 text-white rounded px-1 py-0.5 text-xs outline-none border border-gray-600 focus:border-blue-500"
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
          {layer?.locked && (
            <div className="text-[9px] text-yellow-500">⚠ Layer is locked</div>
          )}
        </div>

        {/* Style */}
        <div className="space-y-2 border-t border-gray-700 pt-2">
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">Style</div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-400 shrink-0">Color</span>
            <input
              type="color"
              className="w-8 h-6 rounded cursor-pointer border border-gray-600 bg-transparent p-0.5"
              value={displayColor}
              onChange={(e) => setEditColor(e.target.value)}
              onBlur={commitStyleChange}
            />
          </div>
          {/* Phase 3 §11 — per-feature line type override (LINE / POLYLINE / POLYGON) */}
          {single && (single.type === 'LINE' || single.type === 'POLYLINE' || single.type === 'POLYGON') && (() => {
            const lt = single.style.lineTypeId
              ? getLineTypeById(single.style.lineTypeId)
              : null;
            return (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 shrink-0">Line Type</span>
                <button
                  type="button"
                  onClick={() => setLineTypePickerOpen(true)}
                  className="flex items-center gap-1.5 px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded transition-colors"
                  title={lt ? `${lt.name} (${lt.id})` : 'No line type assigned — click to pick'}
                >
                  {lt ? (
                    <LineTypePreview lineType={lt} width={60} height={14} color="#e5e7eb" />
                  ) : (
                    <span className="w-[60px] h-[14px] inline-block bg-gray-800 rounded" />
                  )}
                  <span className="text-[10px] text-gray-300 max-w-[100px] truncate">
                    {lt?.name ?? 'Pick…'}
                  </span>
                </button>
              </div>
            );
          })()}
          {/* Phase 3 §11 — per-feature symbol override (POINT only) */}
          {single?.type === 'POINT' && (() => {
            const sym = single.style.symbolId
              ? getSymbolById(single.style.symbolId)
              : null;
            return (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 shrink-0">Symbol</span>
                <button
                  type="button"
                  onClick={() => setSymbolPickerOpen(true)}
                  className="flex items-center gap-1.5 px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded transition-colors"
                  title={sym ? `${sym.name} (${sym.id})` : 'No symbol assigned — click to pick'}
                >
                  {sym ? (
                    <SymbolThumbnail symbol={sym} size={20} />
                  ) : (
                    <span className="w-5 h-5 inline-block bg-gray-800 rounded" />
                  )}
                  <span className="text-[10px] text-gray-300 max-w-[120px] truncate">
                    {sym?.name ?? 'Pick…'}
                  </span>
                </button>
              </div>
            );
          })()}
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-400 shrink-0">Line Weight</span>
            <input
              className="w-14 h-6 bg-gray-700 text-white rounded px-1 text-right outline-none border border-gray-600 focus:border-blue-500 text-xs"
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
              className="w-14 h-6 bg-gray-700 text-white rounded px-1 text-right outline-none border border-gray-600 focus:border-blue-500 text-xs"
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
              {(() => {
                const { a, b } = worldToDisplay(geom.point!.x, geom.point!.y);
                return (
                  <>
                    <CoordInput label={labelA} value={a} onChange={(val) => { updateCoord(0, 'x', displayToWorldX(val, b)); updateCoord(0, 'y', displayToWorldY(val, b)); }} onCommit={commitCoordEdit} />
                    <CoordInput label={labelB} value={b} onChange={(val) => { updateCoord(0, 'x', displayToWorldX(a, val)); updateCoord(0, 'y', displayToWorldY(a, val)); }} onCommit={commitCoordEdit} />
                  </>
                );
              })()}
            </div>
          )}
          {geom.type === 'LINE' && geom.start && geom.end && (
            <div className="space-y-1.5">
              <div className="text-gray-500 text-[9px] uppercase">Start</div>
              {(() => {
                const { a, b } = worldToDisplay(geom.start!.x, geom.start!.y);
                return (
                  <>
                    <CoordInput label={labelA} value={a} onChange={(val) => { updateCoord(0, 'x', displayToWorldX(val, b)); updateCoord(0, 'y', displayToWorldY(val, b)); }} onCommit={commitCoordEdit} />
                    <CoordInput label={labelB} value={b} onChange={(val) => { updateCoord(0, 'x', displayToWorldX(a, val)); updateCoord(0, 'y', displayToWorldY(a, val)); }} onCommit={commitCoordEdit} />
                  </>
                );
              })()}
              <div className="text-gray-500 text-[9px] uppercase pt-0.5">End</div>
              {(() => {
                const { a, b } = worldToDisplay(geom.end!.x, geom.end!.y);
                return (
                  <>
                    <CoordInput label={labelA} value={a} onChange={(val) => { updateCoord(1, 'x', displayToWorldX(val, b)); updateCoord(1, 'y', displayToWorldY(val, b)); }} onCommit={commitCoordEdit} />
                    <CoordInput label={labelB} value={b} onChange={(val) => { updateCoord(1, 'x', displayToWorldX(a, val)); updateCoord(1, 'y', displayToWorldY(a, val)); }} onCommit={commitCoordEdit} />
                  </>
                );
              })()}
              {(() => {
                const { azimuth, distance } = inverseBearingDistance(geom.start, geom.end);
                return (
                  <div className="space-y-0.5 pt-0.5 border-t border-gray-700">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Bearing</span>
                      <span className="font-mono text-blue-300">{formatBearing(azimuth)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Azimuth</span>
                      <span className="font-mono text-gray-300">{formatAzimuth(azimuth)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Distance</span>
                      <span className="font-mono text-gray-300">{formatDistance(distance, displayPrefs)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          {geom.type === 'TEXT' && geom.point && (
            <div className="space-y-1">
              {(() => {
                const { a, b } = worldToDisplay(geom.point!.x, geom.point!.y);
                return (
                  <>
                    <CoordInput label={labelA} value={a} onChange={(val) => { updateCoord(0, 'x', displayToWorldX(val, b)); updateCoord(0, 'y', displayToWorldY(val, b)); }} onCommit={commitCoordEdit} />
                    <CoordInput label={labelB} value={b} onChange={(val) => { updateCoord(0, 'x', displayToWorldX(a, val)); updateCoord(0, 'y', displayToWorldY(a, val)); }} onCommit={commitCoordEdit} />
                  </>
                );
              })()}
            </div>
          )}
          {(geom.type === 'POLYLINE' || geom.type === 'POLYGON') && geom.vertices && (
            <div className="space-y-1">
              <div className="font-mono text-[10px] text-gray-400">
                {geom.vertices.length} vertices
              </div>
              {geom.vertices.map((v, i) => {
                const { a, b } = worldToDisplay(v.x, v.y);
                return (
                  <div key={i} className="space-y-0.5">
                    <div className="text-gray-600 text-[9px]">V{i + 1}</div>
                    <CoordInput label={labelA} value={a} onChange={(val) => { updateCoord(i, 'x', displayToWorldX(val, b)); updateCoord(i, 'y', displayToWorldY(val, b)); }} onCommit={commitCoordEdit} />
                    <CoordInput label={labelB} value={b} onChange={(val) => { updateCoord(i, 'x', displayToWorldX(a, val)); updateCoord(i, 'y', displayToWorldY(a, val)); }} onCommit={commitCoordEdit} />
                  </div>
                );
              })}
              {geom.type === 'POLYLINE' && geom.vertices.length >= 2 && (
                <div className="font-mono text-[10px] text-gray-400 pt-0.5">
                  L: {formatDistance(geom.vertices.reduce((sum, v, i) => {
                    if (i === 0) return 0;
                    const p = geom.vertices![i - 1];
                    return sum + Math.hypot(v.x - p.x, v.y - p.y);
                  }, 0), displayPrefs)}
                </div>
              )}
              {geom.type === 'POLYGON' && geom.vertices.length >= 3 && (
                <>
                  <div className="font-mono text-[10px] text-gray-400 pt-0.5">
                    P: {formatDistance(geom.vertices.reduce((sum, v, i) => {
                      const n = geom.vertices![(i + 1) % geom.vertices!.length];
                      return sum + Math.hypot(n.x - v.x, n.y - v.y);
                    }, 0), displayPrefs)}
                  </div>
                  {(() => {
                    const a = computeAreaFromPoints2D(geom.vertices);
                    return (
                      <div className="font-mono text-[10px] text-gray-400">
                        A: {a.squareFeet.toFixed(2)} sq ft ({a.acres.toFixed(4)} ac)
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </div>

        {/* Text properties (editable for TEXT features) */}
        {feature.type === 'TEXT' && (
          <div className="space-y-2 border-t border-gray-700 pt-2">
            <div className="text-gray-500 text-[10px] uppercase tracking-wider">Text</div>
            <div className="space-y-1">
              <div className="text-gray-500 text-[9px] uppercase">Content</div>
              <input
                className="w-full bg-gray-700 text-white rounded px-1 py-0.5 text-xs outline-none border border-gray-600 focus:border-blue-500"
                value={String(feature.geometry.textContent ?? '')}
                onChange={(e) => {
                  const before = drawingStore.getFeature(feature.id)!;
                  drawingStore.updateFeature(feature.id, {
                    geometry: { ...feature.geometry, textContent: e.target.value },
                  });
                  const after = drawingStore.getFeature(feature.id)!;
                  undoStore.pushUndo({
                    id: generateId(),
                    description: 'Edit text',
                    timestamp: Date.now(),
                    operations: [{ type: 'MODIFY_FEATURE', data: { id: feature.id, before, after } }],
                  });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 shrink-0 text-[10px]">Font Size (pt)</span>
              <input
                type="number"
                min={4}
                max={144}
                step={1}
                className="w-14 bg-gray-700 text-white rounded px-1 py-0.5 text-right outline-none border border-gray-600 focus:border-blue-500 text-xs"
                value={Number(feature.properties.fontSize ?? 12)}
                onChange={(e) => {
                  const v = Math.max(4, Math.min(144, parseInt(e.target.value) || 12));
                  drawingStore.updateFeature(feature.id, {
                    properties: { ...feature.properties, fontSize: v },
                  });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 shrink-0 text-[10px]">Rotation (°)</span>
              <input
                type="number"
                min={-360}
                max={360}
                step={1}
                className="w-14 bg-gray-700 text-white rounded px-1 py-0.5 text-right outline-none border border-gray-600 focus:border-blue-500 text-xs"
                value={Math.round(((feature.geometry.textRotation ?? 0) * 180) / Math.PI)}
                onChange={(e) => {
                  const deg = parseFloat(e.target.value) || 0;
                  drawingStore.updateFeature(feature.id, {
                    geometry: { ...feature.geometry, textRotation: (deg * Math.PI) / 180 },
                  });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 shrink-0 text-[10px]">Font</span>
              <select
                className="flex-1 bg-gray-700 text-white rounded px-1 py-0.5 text-xs outline-none border border-gray-600 focus:border-blue-500"
                value={String(feature.properties.fontFamily ?? 'Arial')}
                onChange={(e) => {
                  drawingStore.updateFeature(feature.id, {
                    properties: { ...feature.properties, fontFamily: e.target.value },
                  });
                }}
              >
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={`px-2 py-0.5 text-[10px] rounded border ${feature.properties.fontWeight === 'bold' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}
                onClick={() => drawingStore.updateFeature(feature.id, {
                  properties: { ...feature.properties, fontWeight: feature.properties.fontWeight === 'bold' ? 'normal' : 'bold' },
                })}
              >B</button>
              <button
                className={`px-2 py-0.5 text-[10px] rounded border italic ${feature.properties.fontStyle === 'italic' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}
                onClick={() => drawingStore.updateFeature(feature.id, {
                  properties: { ...feature.properties, fontStyle: feature.properties.fontStyle === 'italic' ? 'normal' : 'italic' },
                })}
              >I</button>
              <div className="flex gap-0.5">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    className={`px-1.5 py-0.5 text-[9px] rounded border ${feature.properties.textAlign === align ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}
                    onClick={() => drawingStore.updateFeature(feature.id, {
                      properties: { ...feature.properties, textAlign: align },
                    })}
                  >
                    {align === 'left' ? '⬅' : align === 'center' ? '⬛' : '➡'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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

        {/* Label style controls for LINE/POLYLINE/POLYGON features with bearing/distance labels */}
        {(feature.type === 'LINE' || feature.type === 'POLYLINE' || feature.type === 'POLYGON') &&
          feature.textLabels && feature.textLabels.length > 0 && (
          <div className="space-y-2 border-t border-gray-700 pt-2">
            <div className="text-gray-500 text-[10px] uppercase tracking-wider">Label Styles</div>
            {feature.textLabels.map((label) => (
              <div key={label.id} className="space-y-1.5 border border-gray-750 rounded px-2 py-1.5" style={{ borderColor: '#2d3545' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-300 font-medium">
                    {label.kind === 'BEARING' ? 'Bearing' : label.kind === 'DISTANCE' ? 'Distance' : label.kind}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono truncate max-w-[100px]">{label.text}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500 text-[9px] shrink-0">Size (pt)</span>
                  <input
                    type="number" min={4} max={144} step={1}
                    className="w-12 bg-gray-700 text-white rounded px-1 py-0.5 text-right text-[10px] outline-none border border-gray-600 focus:border-blue-500"
                    value={label.style.fontSize}
                    onChange={(e) => {
                      const v = Math.max(4, Math.min(144, parseInt(e.target.value) || 10));
                      drawingStore.updateTextLabel(feature.id, label.id, { style: { ...label.style, fontSize: v } });
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500 text-[9px] shrink-0">Scale</span>
                  <input
                    type="number" min={0.1} max={10} step={0.1}
                    className="w-12 bg-gray-700 text-white rounded px-1 py-0.5 text-right text-[10px] outline-none border border-gray-600 focus:border-blue-500"
                    value={Number(label.scale.toFixed(2))}
                    onChange={(e) => {
                      const v = Math.max(0.1, Math.min(10, parseFloat(e.target.value) || 1));
                      drawingStore.updateTextLabel(feature.id, label.id, { scale: v });
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500 text-[9px] shrink-0">Rotation (°)</span>
                  <input
                    type="number" min={-360} max={360} step={1}
                    className="w-12 bg-gray-700 text-white rounded px-1 py-0.5 text-right text-[10px] outline-none border border-gray-600 focus:border-blue-500"
                    value={label.rotation !== null ? Math.round((label.rotation * 180) / Math.PI) : ''}
                    placeholder="auto"
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const rotation = raw === '' ? null : (parseFloat(raw) * Math.PI) / 180;
                      drawingStore.updateTextLabel(feature.id, label.id, { rotation });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Phase 3 §11 — symbol picker mounted as a modal sibling so
          its overlay covers the whole canvas, not just the panel. */}
      <SymbolPicker
        open={symbolPickerOpen && !!single && single.type === 'POINT'}
        selectedSymbolId={single?.style.symbolId ?? null}
        onSelect={(symbolId) => {
          if (!single) return;
          const before = drawingStore.getFeature(single.id)!;
          drawingStore.updateFeature(single.id, {
            style: { ...DEFAULT_FEATURE_STYLE, ...single.style, symbolId, isOverride: true },
          });
          const after = drawingStore.getFeature(single.id)!;
          undoStore.pushUndo({
            id: generateId(),
            timestamp: Date.now(),
            description: `Change symbol on ${single.id}`,
            operations: [{ type: 'MODIFY_FEATURE', data: { id: single.id, before, after } }],
          });
        }}
        onClose={() => setSymbolPickerOpen(false)}
      />

      {/* Phase 3 §11 — line type picker for LINE / POLYLINE / POLYGON. */}
      <LineTypePicker
        open={
          lineTypePickerOpen &&
          !!single &&
          (single.type === 'LINE' || single.type === 'POLYLINE' || single.type === 'POLYGON')
        }
        selectedLineTypeId={single?.style.lineTypeId ?? null}
        onSelect={(lineTypeId) => {
          if (!single) return;
          const before = drawingStore.getFeature(single.id)!;
          drawingStore.updateFeature(single.id, {
            style: { ...DEFAULT_FEATURE_STYLE, ...single.style, lineTypeId, isOverride: true },
          });
          const after = drawingStore.getFeature(single.id)!;
          undoStore.pushUndo({
            id: generateId(),
            timestamp: Date.now(),
            description: `Change line type on ${single.id}`,
            operations: [{ type: 'MODIFY_FEATURE', data: { id: single.id, before, after } }],
          });
        }}
        onClose={() => setLineTypePickerOpen(false)}
      />
    </div>
  );
}
