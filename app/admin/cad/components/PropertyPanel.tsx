'use client';
// app/admin/cad/components/PropertyPanel.tsx — Selected feature properties panel

import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useDrawingStore, useSelectionStore, useUndoStore } from '@/lib/cad/store';
import { useMediaStore } from '@/lib/cad/media/media-store';
import { generateId } from '@/lib/cad/types';
import type { Feature } from '@/lib/cad/types';
import { DEFAULT_FEATURE_STYLE, DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';
import { formatBearing, formatAzimuth, inverseBearingDistance, parseBearing, forwardPoint } from '@/lib/cad/geometry/bearing';
import { formatDistance, feetToLinearUnit, linearUnitToFeet, linearUnitLabel } from '@/lib/cad/geometry/units';
import { computeFeatureArea } from '@/lib/cad/geometry/area';
import { sqFtToAreaUnit, areaUnitLabel } from '@/lib/cad/geometry/units';
import { describeOffsetSection } from '@/lib/cad/operations/describe-offset-section';
import { recomputeOffsetGeometry } from '@/lib/cad/operations/recompute-offset-feature';
import { stampOffsetMetadata } from '@/lib/cad/operations/offset-metadata';
import type { LinearUnit } from '@/lib/cad/types';
import SymbolPicker, { SymbolThumbnail } from './SymbolPicker';
import LineTypePicker, { LineTypePreview } from './LineTypePicker';
import { getSymbolById } from '@/lib/cad/styles/symbol-library';
import { getLineTypeById } from '@/lib/cad/styles/linetype-library';

const OFFSET_UNIT_LABELS: Record<'FT' | 'IN' | 'MILE' | 'M' | 'CM' | 'MM', string> = {
  FT: 'ft', IN: 'in', MILE: 'mi', M: 'm', CM: 'cm', MM: 'mm',
};

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

// ── Inline editable text field for line length / bearing / azimuth ──────────
// Commits the raw string on Enter / blur; the parent parses and applies it.
// Invalid input leaves the geometry untouched and the field snaps back.
function LineDimField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (raw: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-500 shrink-0 text-[10px]">{label}</span>
      <input
        className="flex-1 bg-gray-700 text-white rounded px-1 py-0.5 text-right outline-none font-mono text-[10px] min-w-0"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { onCommit(local); setLocal(value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setLocal(value); e.currentTarget.blur(); }
        }}
      />
    </div>
  );
}

// Offset Source section — slim subcomponent so the local "user is
// typing but hasn't committed yet" state for distance + unit lives
// here, not in the much-bigger PropertyPanel render. Commit (blur /
// Enter on distance, change on unit) runs the live recompute through
// the Slice-5 helper and pushes one undo entry per edit session.
function OffsetSourceSection({ feature }: { feature: Feature }) {
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const undoStore = useUndoStore();

  const desc = describeOffsetSection(feature, drawingStore.getFeature);

  const [localDistance, setLocalDistance] = useState<string>(
    desc ? String(desc.metadata.distance) : '',
  );
  const [localUnit, setLocalUnit] = useState<LinearUnit>(
    desc ? desc.metadata.unit : 'FT',
  );

  // Re-seed local state when the selected feature changes so the
  // section never shows stale values after a selection swap.
  const lastFeatureIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastFeatureIdRef.current !== feature.id) {
      lastFeatureIdRef.current = feature.id;
      if (desc) {
        setLocalDistance(String(desc.metadata.distance));
        setLocalUnit(desc.metadata.unit);
      }
    }
  }, [feature.id, desc]);

  if (!desc) return null;

  function commit(distance: number, unit: LinearUnit) {
    if (!desc || desc.sourceMissing) return;
    if (!Number.isFinite(distance) || distance <= 0) return;
    // Skip when nothing actually changed.
    if (distance === desc.metadata.distance && unit === desc.metadata.unit) return;

    const source = drawingStore.getFeature(desc.metadata.sourceId);
    if (!source) return;
    const recomputed = recomputeOffsetGeometry({
      sourceFeature: source,
      distance,
      unit,
      side: desc.metadata.side,
      cornerHandling: desc.metadata.cornerHandling,
    });
    if (!recomputed) return;

    const before = drawingStore.getFeature(feature.id);
    if (!before) return;
    const after = stampOffsetMetadata(
      { ...before, geometry: recomputed.geometry },
      recomputed.metadata,
    );
    drawingStore.updateFeature(feature.id, {
      geometry: after.geometry,
      properties: after.properties,
    });
    undoStore.pushUndo({
      id: generateId(),
      description: `Edit offset distance (${distance} ${unit.toLowerCase()})`,
      timestamp: Date.now(),
      operations: [{ type: 'MODIFY_FEATURE', data: { id: feature.id, before, after } }],
    });
  }

  function commitDistance(raw: string) {
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setLocalDistance(String(desc!.metadata.distance));
      return;
    }
    commit(n, localUnit);
  }

  function commitUnit(next: LinearUnit) {
    setLocalUnit(next);
    const n = parseFloat(localDistance);
    if (!Number.isFinite(n) || n <= 0) return;
    commit(n, next);
  }

  return (
    <div className="space-y-2 border-t border-gray-700 pt-2" data-testid="offset-source-section">
      <div className="text-gray-500 text-[10px] uppercase tracking-wider">Offset Source</div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-400 shrink-0 text-[10px]">Source</span>
        <button
          type="button"
          disabled={desc.sourceMissing}
          onClick={() => {
            if (desc.sourceMissing) return;
            selectionStore.select(desc.metadata.sourceId, 'REPLACE');
          }}
          className={`flex-1 text-left px-1.5 py-0.5 rounded border text-[10px] font-mono truncate transition-colors ${
            desc.sourceMissing
              ? 'bg-gray-800 border-gray-700 text-yellow-500 cursor-not-allowed'
              : 'bg-gray-700 border-gray-600 text-blue-300 hover:bg-gray-600'
          }`}
          title={desc.sourceMissing ? 'Source feature deleted' : `Select source feature ${desc.metadata.sourceId}`}
        >
          {desc.sourceLabel}
        </button>
      </div>
      {desc.sourceMissing && (
        <div className="text-[9px] text-yellow-500">⚠ Source feature deleted — offset is stale</div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-400 shrink-0 text-[10px]">Distance</span>
        <input
          type="number"
          step="any"
          min={0}
          disabled={desc.sourceMissing}
          value={localDistance}
          onChange={(e) => setLocalDistance(e.target.value)}
          onBlur={(e) => commitDistance(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setLocalDistance(String(desc.metadata.distance));
              e.currentTarget.blur();
            }
          }}
          className="w-20 h-6 bg-gray-700 text-white rounded px-1 text-right outline-none border border-gray-600 focus:border-blue-500 text-xs disabled:opacity-50"
          aria-label="Offset distance"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-400 shrink-0 text-[10px]">Unit</span>
        <select
          disabled={desc.sourceMissing}
          value={localUnit}
          onChange={(e) => commitUnit(e.target.value as LinearUnit)}
          className="w-20 h-6 bg-gray-700 text-white rounded px-1 outline-none border border-gray-600 focus:border-blue-500 text-xs disabled:opacity-50"
          aria-label="Offset unit"
        >
          {(Object.keys(OFFSET_UNIT_LABELS) as Array<keyof typeof OFFSET_UNIT_LABELS>).map((u) => (
            <option key={u} value={u}>{OFFSET_UNIT_LABELS[u]}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500">
        <span>Side: <span className="text-gray-300">{desc.metadata.side}</span></span>
        <span>Corner: <span className="text-gray-300">{desc.metadata.cornerHandling}</span></span>
      </div>
    </div>
  );
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
  // Multi-select editor: active per-type tab + which bulk picker is open.
  const [multiTab, setMultiTab] = useState<string | null>(null);
  const [bulkPicker, setBulkPicker] = useState<'lineType' | 'symbol' | null>(null);
  // Snapshot of the feature taken when a style edit begins, so live edits can
  // render immediately while a single undo entry is pushed on blur.
  const styleBeforeRef = useRef<Feature | null>(null);

  const single = features.length === 1 ? features[0] : null;
  // Media attachments for the selected feature.
  const mediaHydrate = useMediaStore((s) => s.hydrate);
  const mediaByOwner = useMediaStore((s) => s.byOwner);
  const addMedia = useMediaStore((s) => s.addMedia);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void mediaHydrate(); }, [mediaHydrate]);
  const featureMedia = single ? (mediaByOwner[single.id] ?? []) : [];
  const displayColor = editColor ?? (single?.style.color ?? '#000000');
  const displayWeight = editWeight ?? (single ? String(single.style.lineWeight) : '1');
  const displayOpacity = editOpacity ?? (single ? String(Math.round(single.style.opacity * 100)) : '100');

  // Capture the pre-edit feature once, when a style edit starts (input focus).
  function beginStyleEdit() {
    if (single && !styleBeforeRef.current) {
      styleBeforeRef.current = drawingStore.getFeature(single.id) ?? null;
    }
  }

  // Apply the current style to the feature immediately (no undo push) so the
  // canvas re-renders live as the user drags/types. `next` overrides let each
  // input pass its just-changed raw value without waiting for React state.
  function applyStyleLive(next: { color?: string; weight?: string; opacity?: string }) {
    if (!single) return;
    const cur = drawingStore.getFeature(single.id);
    if (!cur) return;
    const color = toHex(next.color ?? displayColor);
    const lineWeight = Math.max(0.1, Math.min(20, parseFloat(next.weight ?? displayWeight) || 1));
    const opacity = Math.max(0, Math.min(1, (parseFloat(next.opacity ?? displayOpacity) || 100) / 100));
    drawingStore.updateFeature(single.id, {
      style: { ...DEFAULT_FEATURE_STYLE, ...cur.style, color, lineWeight, opacity, isOverride: true },
    });
  }

  // Finalize on blur: the live value is already applied, so push a single undo
  // entry from the pre-edit snapshot to the final state (only if it changed).
  function commitStyleChange() {
    if (!single) return;
    const before = styleBeforeRef.current ?? drawingStore.getFeature(single.id)!;
    applyStyleLive({});
    const after = drawingStore.getFeature(single.id)!;
    if (JSON.stringify(before.style) !== JSON.stringify(after.style)) {
      undoStore.pushUndo({
        id: generateId(),
        description: 'Edit style',
        timestamp: Date.now(),
        operations: [{ type: 'MODIFY_FEATURE', data: { id: single.id, before, after } }],
      });
    }
    styleBeforeRef.current = null;
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

  // Apply a style patch to every feature in `subset` as a single undo entry.
  // Used by the multi-select per-type editor so a whole batch of lines (or
  // points) can be restyled at once.
  function bulkApplyStyle(
    subset: Feature[],
    patch: Partial<Feature['style']>,
    description: string,
  ) {
    if (subset.length === 0) return;
    const operations = subset.map((f) => {
      const before = drawingStore.getFeature(f.id)!;
      drawingStore.updateFeature(f.id, {
        style: { ...DEFAULT_FEATURE_STYLE, ...f.style, ...patch, isOverride: true },
      });
      const after = drawingStore.getFeature(f.id)!;
      return { type: 'MODIFY_FEATURE' as const, data: { id: f.id, before, after } };
    });
    undoStore.pushUndo({ id: generateId(), timestamp: Date.now(), description, operations });
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

  // Move a LINE's END point (start stays fixed) and record one undo step.
  // Used by the editable length / bearing / azimuth fields so changing a
  // line's dimension recomputes the far end without touching the anchor.
  function applyLineEnd(newEnd: { x: number; y: number }) {
    if (!single) return;
    updateCoord(1, 'x', newEnd.x);
    updateCoord(1, 'y', newEnd.y);
    commitCoordEdit();
  }

  // Replace a feature's geometry wholesale and record one undo step.
  // Used by the editable shape-dimension fields (rectangle width/length,
  // circle diameter, ellipse width/length).
  function applyGeometry(
    newGeom: import('@/lib/cad/types').FeatureGeometry,
    description: string,
  ) {
    if (!single) return;
    const before = JSON.parse(JSON.stringify(drawingStore.getFeature(single.id)!));
    drawingStore.updateFeatureGeometry(single.id, newGeom);
    const after = drawingStore.getFeature(single.id);
    if (!after) return;
    if (JSON.stringify(before.geometry) === JSON.stringify(after.geometry)) return;
    undoStore.pushUndo({
      id: generateId(),
      description,
      timestamp: Date.now(),
      operations: [{ type: 'MODIFY_FEATURE', data: { id: single.id, before, after } }],
    });
  }

  // Resize an axis-or-rotated rectangle (4-vertex POLYGON) by its two edge
  // lengths, anchoring the first corner and preserving any rotation. v0 is
  // kept fixed; the width edge (v0→v1) and length edge (v1→v2) are rescaled
  // along their current directions.
  function resizeRectVertices(
    verts: { x: number; y: number }[],
    newWidthFt: number,
    newLengthFt: number,
  ): { x: number; y: number }[] {
    const v0 = verts[0];
    const e0 = { x: verts[1].x - v0.x, y: verts[1].y - v0.y };
    const e1 = { x: verts[2].x - verts[1].x, y: verts[2].y - verts[1].y };
    const w0 = Math.hypot(e0.x, e0.y) || 1;
    const l0 = Math.hypot(e1.x, e1.y) || 1;
    const wd = { x: e0.x / w0, y: e0.y / w0 };
    const ld = { x: e1.x / l0, y: e1.y / l0 };
    const nv1 = { x: v0.x + wd.x * newWidthFt, y: v0.y + wd.y * newWidthFt };
    const nv2 = { x: nv1.x + ld.x * newLengthFt, y: nv1.y + ld.y * newLengthFt };
    const nv3 = { x: v0.x + ld.x * newLengthFt, y: v0.y + ld.y * newLengthFt };
    return [{ ...v0 }, nv1, nv2, nv3];
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
    // Multi-select: per-type tabs that restyle ALL selected features of a
    // kind at once, plus a bulk "Move to Layer" that applies to everything.
    const mixedLayers = new Set(features.map((f) => f.layerId)).size > 1;
    const sharedLayerId = mixedLayers ? '' : features[0].layerId;

    // Group the selection by editable kind.
    const KINDS: { key: string; label: string; match: (t: string) => boolean; isLine: boolean; isPoint: boolean }[] = [
      { key: 'LINES', label: 'Lines', match: (t) => t === 'LINE' || t === 'POLYLINE', isLine: true, isPoint: false },
      { key: 'AREAS', label: 'Areas', match: (t) => t === 'POLYGON', isLine: true, isPoint: false },
      { key: 'POINTS', label: 'Points', match: (t) => t === 'POINT', isLine: false, isPoint: true },
      { key: 'TEXT', label: 'Text', match: (t) => t === 'TEXT', isLine: false, isPoint: false },
      { key: 'OTHER', label: 'Other', match: (t) => !['LINE', 'POLYLINE', 'POLYGON', 'POINT', 'TEXT'].includes(t), isLine: false, isPoint: false },
    ];
    const groups = KINDS
      .map((k) => ({ ...k, items: features.filter((f) => k.match(f.type)) }))
      .filter((g) => g.items.length > 0);
    const active = groups.find((g) => g.key === multiTab) ?? groups[0];
    const subset = active.items;

    return (
      <div className="flex flex-col h-full text-gray-200 text-xs">
        <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700">
          Properties · {features.length} selected
        </div>

        {/* Per-type tabs */}
        {groups.length > 1 && (
          <div className="flex items-center gap-1 px-2 pt-2 flex-wrap">
            {groups.map((g) => (
              <button
                key={g.key}
                onClick={() => setMultiTab(g.key)}
                className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                  active.key === g.key
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {g.label} ({g.items.length})
              </button>
            ))}
          </div>
        )}

        <div className="p-2 space-y-2 overflow-y-auto animate-[fadeIn_150ms_ease-out]">
          <div className="text-gray-500 text-[10px]">
            Editing {subset.length} {active.label.toLowerCase()} together.
          </div>

          {/* Bulk style for the active kind */}
          <div className="border-t border-gray-700 pt-2 space-y-2">
            <div className="text-gray-500 text-[10px] uppercase tracking-wider">{active.label} style</div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 shrink-0">Color</span>
              <input
                type="color"
                className="w-8 h-6 rounded cursor-pointer border border-gray-600 bg-transparent p-0.5"
                defaultValue={subset[0]?.style.color ?? '#000000'}
                onChange={(e) => bulkApplyStyle(subset, { color: e.target.value }, `Recolor ${subset.length} ${active.label.toLowerCase()}`)}
              />
            </div>

            {active.isLine && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 shrink-0">Line Type</span>
                <button
                  type="button"
                  onClick={() => setBulkPicker('lineType')}
                  className="flex items-center gap-1.5 px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded transition-colors max-w-[140px]"
                >
                  {(() => {
                    const lt = subset[0]?.style.lineTypeId ? getLineTypeById(subset[0].style.lineTypeId) : null;
                    return <span className="text-[10px] text-gray-300 truncate">{lt?.name ?? 'Pick…'}</span>;
                  })()}
                </button>
              </div>
            )}

            {active.isPoint && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 shrink-0">Symbol</span>
                <button
                  type="button"
                  onClick={() => setBulkPicker('symbol')}
                  className="flex items-center gap-1.5 px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded transition-colors max-w-[140px]"
                >
                  {(() => {
                    const sym = subset[0]?.style.symbolId ? getSymbolById(subset[0].style.symbolId) : null;
                    return sym
                      ? <><SymbolThumbnail symbol={sym} size={18} /><span className="text-[10px] text-gray-300 truncate">{sym.name}</span></>
                      : <span className="text-[10px] text-gray-300">Pick…</span>;
                  })()}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 shrink-0">Line Weight</span>
              <input
                className="w-14 h-6 bg-gray-700 text-white rounded px-1 text-right outline-none border border-gray-600 focus:border-blue-500 text-xs"
                type="number" step="0.5" min="0.1" max="20"
                placeholder="—"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') return;
                  const v = parseFloat(raw);
                  if (!isNaN(v)) bulkApplyStyle(subset, { lineWeight: Math.max(0.1, Math.min(20, v)) }, `Set weight on ${subset.length} ${active.label.toLowerCase()}`);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 shrink-0">Opacity %</span>
              <input
                className="w-14 h-6 bg-gray-700 text-white rounded px-1 text-right outline-none border border-gray-600 focus:border-blue-500 text-xs"
                type="number" step="5" min="0" max="100"
                placeholder="—"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') return;
                  const v = parseFloat(raw);
                  if (!isNaN(v)) bulkApplyStyle(subset, { opacity: Math.max(0, Math.min(1, v / 100)) }, `Set opacity on ${subset.length} ${active.label.toLowerCase()}`);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            </div>
          </div>

          {/* Move to layer — bulk action over the whole selection */}
          <div className="border-t border-gray-700 pt-2 space-y-1">
            <div className="text-gray-500 text-[10px] uppercase tracking-wider">Move all to Layer</div>
            {mixedLayers && (
              <div className="text-[9px] text-yellow-500 mb-1">Multiple layers selected</div>
            )}
            <div className="flex items-center gap-1.5">
              {(() => {
                const targetLayer = sharedLayerId ? doc.layers[sharedLayerId] : null;
                return targetLayer ? (
                  <div className="w-3 h-3 rounded-sm border border-gray-500 shrink-0" style={{ backgroundColor: targetLayer.color }} />
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

        {/* Bulk pickers — apply the chosen style to every feature in the tab. */}
        <LineTypePicker
          open={bulkPicker === 'lineType'}
          selectedLineTypeId={subset[0]?.style.lineTypeId ?? null}
          customLineTypes={drawingStore.document.customLineTypes}
          onSelect={(lineTypeId) => bulkApplyStyle(subset, { lineTypeId }, `Set line type on ${subset.length} objects`)}
          onClose={() => setBulkPicker(null)}
        />
        <SymbolPicker
          open={bulkPicker === 'symbol'}
          selectedSymbolId={subset[0]?.style.symbolId ?? null}
          onSelect={(symbolId) => bulkApplyStyle(subset, { symbolId }, `Set symbol on ${subset.length} points`)}
          onClose={() => setBulkPicker(null)}
        />
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
        {/* Media attachments — thumbnails + add. */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">Media{featureMedia.length > 0 ? ` (${featureMedia.length})` : ''}</span>
            <button
              type="button"
              onClick={() => mediaFileRef.current?.click()}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-400"
              title="Attach a photo or video to this feature"
            >
              <ImageIcon size={11} /> Add
            </button>
          </div>
          {featureMedia.length === 0 ? (
            <p className="text-[10px] text-gray-600">No media. Click Add to attach photos/videos.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {featureMedia.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('cad:openMediaViewer', { detail: { ownerId: feature.id } }))}
                  className="w-12 h-12 rounded border border-gray-600 hover:border-blue-500 overflow-hidden bg-gray-800 flex items-center justify-center"
                  title={`${m.name} — click to view`}
                >
                  {m.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumbnail} alt={m.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] text-gray-400">{m.kind === 'video' ? '▶' : '🖼'}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <input
            ref={mediaFileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const fs = Array.from(e.target.files ?? []);
              e.target.value = '';
              for (const f of fs) await addMedia(feature.id, 'feature', f);
            }}
          />
        </div>

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
              onFocus={beginStyleEdit}
              onChange={(e) => { beginStyleEdit(); setEditColor(e.target.value); applyStyleLive({ color: e.target.value }); }}
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
              onFocus={beginStyleEdit}
              onChange={(e) => { beginStyleEdit(); setEditWeight(e.target.value); if (e.target.value !== '') applyStyleLive({ weight: e.target.value }); }}
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
              onFocus={beginStyleEdit}
              onChange={(e) => { beginStyleEdit(); setEditOpacity(e.target.value); if (e.target.value !== '') applyStyleLive({ opacity: e.target.value }); }}
              onBlur={commitStyleChange}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </div>
        </div>

        {/* Geometry — editable coordinates update canvas in real time */}
        <div className="space-y-1 border-t border-gray-700 pt-2">
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">Geometry</div>

          {/* Editable Width / Length for a rectangle (4-vertex POLYGON). */}
          {geom.type === 'POLYGON' && feature.properties?.shapeType === 'RECTANGLE' && geom.vertices && geom.vertices.length === 4 && (() => {
            const verts = geom.vertices;
            const widthFt = Math.hypot(verts[1].x - verts[0].x, verts[1].y - verts[0].y);
            const lengthFt = Math.hypot(verts[2].x - verts[1].x, verts[2].y - verts[1].y);
            const unit = linearUnitLabel(displayPrefs);
            const dp = displayPrefs.linearDecimalPlaces;
            return (
              <div className="space-y-1 pb-1">
                <div className="text-gray-500 text-[9px] uppercase">Dimensions</div>
                <LineDimField
                  label={`Width (${unit})`}
                  value={feetToLinearUnit(widthFt, displayPrefs).toFixed(dp)}
                  onCommit={(raw) => {
                    const v = parseFloat(raw);
                    if (isNaN(v) || v <= 0) return;
                    applyGeometry({ ...geom, vertices: resizeRectVertices(verts, linearUnitToFeet(v, displayPrefs), lengthFt) }, 'Edit rectangle width');
                  }}
                />
                <LineDimField
                  label={`Length (${unit})`}
                  value={feetToLinearUnit(lengthFt, displayPrefs).toFixed(dp)}
                  onCommit={(raw) => {
                    const v = parseFloat(raw);
                    if (isNaN(v) || v <= 0) return;
                    applyGeometry({ ...geom, vertices: resizeRectVertices(verts, widthFt, linearUnitToFeet(v, displayPrefs)) }, 'Edit rectangle length');
                  }}
                />
              </div>
            );
          })()}

          {/* Editable Radius / Diameter for a circle. */}
          {geom.type === 'CIRCLE' && geom.circle && (() => {
            const r = geom.circle.radius;
            const unit = linearUnitLabel(displayPrefs);
            const dp = displayPrefs.linearDecimalPlaces;
            return (
              <div className="space-y-1">
                <div className="text-gray-500 text-[9px] uppercase">Dimensions</div>
                <LineDimField
                  label={`Radius (${unit})`}
                  value={feetToLinearUnit(r, displayPrefs).toFixed(dp)}
                  onCommit={(raw) => {
                    const v = parseFloat(raw);
                    if (isNaN(v) || v <= 0) return;
                    applyGeometry({ ...geom, circle: { ...geom.circle!, radius: linearUnitToFeet(v, displayPrefs) } }, 'Edit circle radius');
                  }}
                />
                <LineDimField
                  label={`Diameter (${unit})`}
                  value={feetToLinearUnit(r * 2, displayPrefs).toFixed(dp)}
                  onCommit={(raw) => {
                    const v = parseFloat(raw);
                    if (isNaN(v) || v <= 0) return;
                    applyGeometry({ ...geom, circle: { ...geom.circle!, radius: linearUnitToFeet(v, displayPrefs) / 2 } }, 'Edit circle diameter');
                  }}
                />
              </div>
            );
          })()}

          {/* Editable Width / Length for an ellipse. */}
          {geom.type === 'ELLIPSE' && geom.ellipse && (() => {
            const { radiusX, radiusY } = geom.ellipse;
            const unit = linearUnitLabel(displayPrefs);
            const dp = displayPrefs.linearDecimalPlaces;
            return (
              <div className="space-y-1">
                <div className="text-gray-500 text-[9px] uppercase">Dimensions</div>
                <LineDimField
                  label={`Width (${unit})`}
                  value={feetToLinearUnit(radiusX * 2, displayPrefs).toFixed(dp)}
                  onCommit={(raw) => {
                    const v = parseFloat(raw);
                    if (isNaN(v) || v <= 0) return;
                    applyGeometry({ ...geom, ellipse: { ...geom.ellipse!, radiusX: linearUnitToFeet(v, displayPrefs) / 2 } }, 'Edit ellipse width');
                  }}
                />
                <LineDimField
                  label={`Length (${unit})`}
                  value={feetToLinearUnit(radiusY * 2, displayPrefs).toFixed(dp)}
                  onCommit={(raw) => {
                    const v = parseFloat(raw);
                    if (isNaN(v) || v <= 0) return;
                    applyGeometry({ ...geom, ellipse: { ...geom.ellipse!, radiusY: linearUnitToFeet(v, displayPrefs) / 2 } }, 'Edit ellipse length');
                  }}
                />
              </div>
            );
          })()}

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
                const start = geom.start!;
                const end = geom.end!;
                const { azimuth, distance } = inverseBearingDistance(start, end);
                const lenStr = feetToLinearUnit(distance, displayPrefs).toFixed(displayPrefs.linearDecimalPlaces);
                return (
                  <div className="space-y-1 pt-1 border-t border-gray-700">
                    <div className="text-gray-500 text-[9px] uppercase">Dimensions</div>
                    <LineDimField
                      label="Bearing"
                      value={formatBearing(azimuth)}
                      onCommit={(raw) => {
                        const az = parseBearing(raw);
                        if (az == null) return;
                        applyLineEnd(forwardPoint(start, az, distance));
                      }}
                    />
                    <LineDimField
                      label="Azimuth"
                      value={formatAzimuth(azimuth)}
                      onCommit={(raw) => {
                        const az = parseBearing(raw);
                        if (az == null) return;
                        applyLineEnd(forwardPoint(start, az, distance));
                      }}
                    />
                    <LineDimField
                      label={`Length (${linearUnitLabel(displayPrefs)})`}
                      value={lenStr}
                      onCommit={(raw) => {
                        const v = parseFloat(raw);
                        if (isNaN(v) || v <= 0) return;
                        applyLineEnd(forwardPoint(start, azimuth, linearUnitToFeet(v, displayPrefs)));
                      }}
                    />
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
                <div className="font-mono text-[10px] text-gray-400 pt-0.5">
                  P: {formatDistance(geom.vertices.reduce((sum, v, i) => {
                    const n = geom.vertices![(i + 1) % geom.vertices!.length];
                    return sum + Math.hypot(n.x - v.x, n.y - v.y);
                  }, 0), displayPrefs)}
                </div>
              )}
            </div>
          )}

          {/* Slice 228 — Generic Area readout for every closed shape
              (POLYGON / CIRCLE / ELLIPSE / closed POLYLINE / closed
              MIXED_GEOMETRY). Driven by `computeFeatureArea` so the
              right formula fires per geometry kind. Shows the value
              in the surveyor's display-pref unit + a sq-ft / acres
              fallback so the conversion is always one glance away. */}
          {(() => {
            const a = computeFeatureArea(feature);
            if (a.squareFeet <= 0) return null;
            const userVal = sqFtToAreaUnit(a.squareFeet, displayPrefs);
            const userLabel = areaUnitLabel(displayPrefs);
            const dp = displayPrefs.linearDecimalPlaces;
            const showFallback = displayPrefs.areaUnit !== 'SQ_FT' && displayPrefs.areaUnit !== 'ACRES';
            return (
              <div
                data-testid="property-panel-area"
                className="space-y-0.5 border-t border-gray-700 pt-1.5 mt-1"
              >
                <div className="text-gray-500 text-[10px] uppercase tracking-wider">
                  Area · {a.geometryKind === 'POLYGON' ? 'shoelace'
                    : a.geometryKind === 'CIRCLE' ? 'π·r²'
                    : a.geometryKind === 'ELLIPSE' ? 'π·a·b'
                    : a.geometryKind === 'POLYLINE_CLOSED' ? 'closed polyline'
                    : a.geometryKind === 'MIXED_CLOSED' ? 'closed mixed'
                    : 'computed'}
                </div>
                <div className="font-mono text-[11px] text-gray-200">
                  {userVal.toFixed(Math.min(dp + 2, 4))} {userLabel}
                </div>
                <div className="font-mono text-[10px] text-gray-500">
                  {a.squareFeet.toLocaleString('en-US', { maximumFractionDigits: 2 })} sq ft
                  {' · '}
                  {a.acres.toFixed(4)} ac
                  {showFallback && (
                    <>{' · '}{(a.squareFeet * 0.0929030).toFixed(2)} m²</>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Offset Source — surfaces when the feature was created by
            the OFFSET tool (Slice 3 stamps the metadata). Slice 4
            renders the source link + distance + unit; Slice 5 wires
            the distance + unit inputs into a live recompute that
            replaces the offset's geometry in place. */}
        <OffsetSourceSection feature={feature} />

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
        customLineTypes={drawingStore.document.customLineTypes}
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
