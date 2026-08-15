'use client';
// app/admin/cad/components/PointDataViewer.tsx
//
// Spreadsheet-style viewer/editor over ALL drawing POINT features
// (including auto-created points), filterable by layer, with inline
// editing of coordinates (moves the point), elevation, code, and
// description. Columns are show/hide customizable (persisted). Point
// NAME edits are routed through the guarded rename flow (§10.3).
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §10

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { X, RotateCcw, Image as ImageIcon, Eye } from 'lucide-react';
import { useMediaStore } from '@/lib/cad/media/media-store';
import { drawableLayerIds } from '@/lib/cad/styles/default-layers';
import { useDrawingStore, useUndoStore, useSelectionStore, makeBatchEntry, makeRemoveFeatureEntry } from '@/lib/cad/store';
import { useAIConversationsStore } from '@/lib/cad/store/ai-conversations-store';
import {
  buildPointRows,
  rowEditToFeatureUpdate,
  rowEditAffectsLabels,
  type PointRow,
  type PointRowField,
} from '@/lib/cad/points/point-rows';
import { findNameReferences } from '@/lib/cad/points/point-rename';
import { parsePointRangeString, buildPointNoIndex } from '@/lib/cad/operations/parse-point-range';
import { planRenumber, planRecode } from '@/lib/cad/points/renumber';
import { confirmAction, alertAction } from './ConfirmDialog';
import { matchesQueryTokens, tokenizeSearch, type SearchField } from '@/lib/cad/points/move-points-filters';
import ColorSwatchInput from './ColorSwatchInput';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import { generateLabelsForFeature } from '@/lib/cad/labels';
import type { Feature } from '@/lib/cad/types';
import { readPanelSize, writePanelSize } from '@/lib/cad/ui/panel-size';

// Snapshot of a point's values captured the first time it is edited, so the
// surveyor can always see the original for reference or revert back to it.
// Stored (as JSON) on the feature's properties so it persists with the file.
const ORIG_KEY = '_origSnapshot';
interface PointSnapshot {
  name: string;
  northing: number;
  easting: number;
  elevation: number | null;
  code: string;
  description: string;
}
const SNAP_FIELDS: (keyof PointSnapshot)[] = ['name', 'northing', 'easting', 'elevation', 'code', 'description'];

function rowSnapshot(row: PointRow): PointSnapshot {
  return {
    name: row.name, northing: row.northing, easting: row.easting,
    elevation: row.elevation, code: row.code, description: row.description,
  };
}
function readSnapshot(feature: Feature | undefined): PointSnapshot | null {
  const raw = (feature?.properties as Record<string, unknown> | undefined)?.[ORIG_KEY];
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as PointSnapshot; } catch { return null; }
}
function snapshotDiffers(row: PointRow, snap: PointSnapshot): boolean {
  return SNAP_FIELDS.some((f) => String(row[f as keyof PointRow] ?? '') !== String(snap[f] ?? ''));
}

type ColKey = 'name' | 'northing' | 'easting' | 'elevation' | 'code' | 'description' | 'layer';

const COLUMNS: { key: ColKey; label: string; editable: boolean }[] = [
  { key: 'name', label: 'Name', editable: true },
  { key: 'northing', label: 'Northing', editable: true },
  { key: 'easting', label: 'Easting', editable: true },
  { key: 'elevation', label: 'Elev', editable: true },
  { key: 'code', label: 'Code', editable: true },
  { key: 'description', label: 'Description', editable: true },
  { key: 'layer', label: 'Layer', editable: false },
];

const COLVIS_KEY = 'pointViewerCols';

function loadColVis(): Record<ColKey, boolean> {
  const all = Object.fromEntries(COLUMNS.map((c) => [c.key, true])) as Record<ColKey, boolean>;
  if (typeof window === 'undefined') return all;
  try {
    const raw = window.localStorage.getItem(`starr-cad-panel:${COLVIS_KEY}`);
    if (raw) return { ...all, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return all;
}
function saveColVis(v: Record<ColKey, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`starr-cad-panel:${COLVIS_KEY}`, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export default function PointDataViewer({
  open,
  onClose,
  onRenameRequest,
}: {
  open: boolean;
  onClose: () => void;
  /** Route a name edit to the guarded rename dialog (§10.4). */
  onRenameRequest?: (featureId: string, oldName: string, newName: string) => void;
}) {
  const document = useDrawingStore((s) => s.document);
  const updateFeature = useDrawingStore((s) => s.updateFeature);
  const getFeature = useDrawingStore((s) => s.getFeature);
  const removeFeature = useDrawingStore((s) => s.removeFeature);
  const removeFeatures = useDrawingStore((s) => s.removeFeatures);
  const pushUndo = useUndoStore((s) => s.pushUndo);

  const [layerFilter, setLayerFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  // Search by ONE field at a time — name or code, never both (the surveyor
  // picks the field with the Name/Code toggle). Defaults to Name.
  const [searchBy, setSearchBy] = useState<SearchField>('NAME');
  const [colVis, setColVis] = useState<Record<ColKey, boolean>>(loadColVis);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [edit, setEdit] = useState<{ id: string; field: ColKey } | null>(null);
  // Right-click context menu for a point row.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; row: PointRow } | null>(null);
  // Multi-select for bulk actions (editable rows only).
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Media attachments (photos/videos) per point.
  const mediaHydrate = useMediaStore((s) => s.hydrate);
  const mediaByOwner = useMediaStore((s) => s.byOwner);
  const addMedia = useMediaStore((s) => s.addMedia);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const pendingMediaOwnerRef = useRef<string | null>(null);
  useEffect(() => { void mediaHydrate(); }, [mediaHydrate]);

  const rows = useMemo(() => buildPointRows(document), [document]);

  const layers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.layerId, (counts.get(r.layerId) ?? 0) + 1);
    return [...counts.keys()]
      .map((id) => ({ id, name: document.layers[id]?.name ?? id, count: counts.get(id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, document.layers]);

  const filtered = useMemo(() => {
    // Search the ONE chosen field (name OR code) via the shared, unit-tested
    // matcher — which also supports comma-separated tokens (e.g. "23set, 22fnd"
    // matches either). The layer dropdown narrows further.
    const tokens = tokenizeSearch(search);
    return rows.filter((r) => {
      if (layerFilter !== 'ALL' && r.layerId !== layerFilter) return false;
      return matchesQueryTokens(r, searchBy, tokens);
    });
  }, [rows, layerFilter, search, searchBy]);

  // A NEW search starts fresh: whenever the query text or the search field
  // changes, drop any previously-picked points so the next selection only ever
  // contains points from the current results — never leftovers from the last
  // search. Deliberately keyed on search + searchBy only (not the picks
  // themselves), so picking points doesn't re-trigger it.
  useEffect(() => {
    setPicked(new Set());
  }, [search, searchBy]);

  // ── C10 — the table and the canvas are one selection ─────────────────────────────────────────
  //
  // Before this, picking rows reached the canvas through exactly one door: `bulkAskAI`. Every other
  // bulk action (send to layer, recolour, delete, export) worked on the picks without the canvas
  // ever showing which points they were — so a surveyor deleting twelve points had no way to look
  // at them first, and a selection made on the canvas was invisible here.
  //
  // ── WHY THE SYNC IS ONE-WAY-AT-A-TIME RATHER THAN TRULY BIDIRECTIONAL ────────────────────────
  //
  // Two stores writing to each other on every change is a loop. `canvasSyncRef` marks the writes
  // this component causes, so the effect below ignores the echo of its own push and only reacts to
  // a selection that came from somewhere else — the canvas, a tool, the AI.
  const canvasSyncRef = useRef(false);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  /** What the last range pick resolved to, including what it could NOT resolve. */
  const [rangeText, setRangeText] = useState('');
  const [rangeNote, setRangeNote] = useState('');

  /**
   * C10 — pick by point number, including ranges: `5-12, 20, 33-35`.
   *
   * Reuses `parsePointRangeString`, which `LayerTransferDialog` already relies on, rather than
   * writing a second range grammar. Two parsers for "5-12" would drift, and the surveyor would have
   * to learn which box understands what.
   *
   * It reports missing and ambiguous numbers separately, and both are surfaced: a range that
   * silently resolves to fewer points than you asked for is how the wrong twelve get deleted.
   */
  function pickByRange(input: string) {
    const index = buildPointNoIndex(Object.values(document.features));
    const result = parsePointRangeString(input, index);
    const next = new Set(result.resolvedFeatureIds);
    setPicked(next);
    pushSelectionToCanvas(next);

    const problems: string[] = [];
    if (result.invalidTokens.length) problems.push(`couldn’t read: ${result.invalidTokens.join(', ')}`);
    if (result.missingNumbers.length) problems.push(`no such point: ${result.missingNumbers.join(', ')}`);
    if (result.ambiguousNumbers.length) problems.push(`more than one point numbered: ${result.ambiguousNumbers.join(', ')}`);
    setRangeNote(
      problems.length
        ? `${next.size} selected — ${problems.join(' · ')}`
        : `${next.size} selected`,
    );
  }

  /** Push the picked rows onto the canvas. */
  const pushSelectionToCanvas = useCallback((ids: Set<string>) => {
    canvasSyncRef.current = true;
    useSelectionStore.getState().selectMultiple([...ids], 'REPLACE');
    // Cleared on the next tick rather than immediately: the store notifies subscribers
    // synchronously, so clearing here would unset the flag before the effect below ever ran.
    queueMicrotask(() => { canvasSyncRef.current = false; });
  }, []);

  // Canvas → table. Only points the table is currently showing can be picked, so a canvas
  // selection containing lines and arcs narrows to its points rather than picking nothing.
  useEffect(() => {
    if (canvasSyncRef.current) return;
    const visibleRowIds = new Set(filtered.map((r) => r.id));
    setPicked(new Set([...selectedIds].filter((id) => visibleRowIds.has(id))));
  }, [selectedIds, filtered]);

  // Original snapshot per row (if any edits have been made). Drives the
  // "edited" indicator, original-value tooltips, and Revert.
  const origByRow = useMemo(() => {
    const m = new Map<string, PointSnapshot>();
    for (const r of rows) {
      const snap = readSnapshot(getFeature(r.id));
      if (snap) m.set(r.id, snap);
    }
    return m;
  }, [rows, getFeature]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu]);

  if (!open) return null;

  /** Stamp the original snapshot onto a feature the first time it's edited. */
  function ensureSnapshot(row: PointRow) {
    const feature = getFeature(row.id);
    if (!feature) return;
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (props[ORIG_KEY] !== undefined) return;
    updateFeature(row.id, {
      properties: { ...feature.properties, [ORIG_KEY]: JSON.stringify(rowSnapshot(row)) },
    });
  }

  /** Restore every edited field of a point back to its captured original. */
  function revertRow(row: PointRow) {
    const feature = getFeature(row.id);
    if (!feature) return;
    const snap = readSnapshot(feature);
    if (!snap) return;
    // Fold each data field back to its original, threading the working
    // feature so coordinate edits compose into a single point.
    let working: Feature = feature;
    const dataFields: PointRowField[] = ['northing', 'easting', 'elevation', 'code', 'description'];
    for (const f of dataFields) {
      const raw = snap[f as keyof PointSnapshot];
      const upd = rowEditToFeatureUpdate(working, f, raw == null ? '' : String(raw), document.settings);
      if (upd) working = { ...working, ...upd };
    }
    const nextProps: Record<string, string | number | boolean> = { ...(working.properties ?? {}) };
    delete nextProps[ORIG_KEY]; // back to original → clear the snapshot
    const update: Partial<Feature> = { geometry: working.geometry, properties: nextProps };
    const before: Record<string, unknown> = {
      geometry: feature.geometry,
      properties: feature.properties,
    };
    updateFeature(row.id, update);
    pushUndo(
      makeBatchEntry(`Revert point ${row.name || row.id}`, [
        { type: 'MODIFY_FEATURE', data: { id: row.id, before, after: update } },
      ]),
    );
    // Name is guarded — route a name revert through the rename flow.
    if (snap.name && snap.name !== row.name) {
      onRenameRequest?.(row.id, row.name, snap.name);
    }
  }

  /** Reassign a point's feature to another layer ("send to layer"). */
  function sendRowToLayer(row: PointRow, layerId: string) {
    const feature = getFeature(row.id);
    if (!feature || feature.layerId === layerId) return;
    updateFeature(row.id, { layerId });
    pushUndo(
      makeBatchEntry(`Send point ${row.name || row.id} to ${document.layers[layerId]?.name ?? layerId}`, [
        { type: 'MODIFY_FEATURE', data: { id: row.id, before: { layerId: feature.layerId }, after: { layerId } } },
      ]),
    );
  }

  /** Delete a point's feature (keeps any linework — those are separate). */
  function deleteRow(row: PointRow) {
    const feature = getFeature(row.id);
    if (!feature) return;
    removeFeature(row.id);
    pushUndo(makeRemoveFeatureEntry(feature));
  }

  /** Layers that "contain" a point: its own layer plus any layer whose
   *  linework references this point's name (cross-layer `:N` shares). */
  function layersContaining(row: PointRow): { id: string; name: string }[] {
    const ids = new Set<string>([row.layerId]);
    if (row.name) {
      for (const lw of findNameReferences(document, row.name).linework) ids.add(lw.layerId);
    }
    return [...ids].map((id) => ({ id, name: document.layers[id]?.name ?? id }));
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearPicks() { setPicked(new Set()); }

  /** Send every picked point to a layer (single undo batch). */
  function bulkSendToLayer(layerId: string) {
    const ops: { type: 'MODIFY_FEATURE'; data: { id: string; before: Record<string, unknown>; after: Record<string, unknown> } }[] = [];
    for (const id of picked) {
      const f = getFeature(id);
      if (!f || f.layerId === layerId) continue;
      updateFeature(id, { layerId });
      ops.push({ type: 'MODIFY_FEATURE', data: { id, before: { layerId: f.layerId }, after: { layerId } } });
    }
    if (ops.length) pushUndo(makeBatchEntry(`Send ${ops.length} point(s) to ${document.layers[layerId]?.name ?? layerId}`, ops));
  }

  /**
   * C11 — renumber every picked point sequentially from a starting number (single undo batch).
   *
   * Collisions are surfaced and confirmed rather than silently allowed: two points sharing a number
   * make every number-keyed lookup ambiguous — range selection, `buildPointNoIndex`, the AI's
   * "point 8" — and the failure shows up later, somewhere else, as the wrong point.
   */
  async function bulkRenumber() {
    if (picked.size === 0) return;
    const raw = window.prompt(`Renumber ${picked.size} point(s) sequentially, starting at:`, '1');
    if (raw == null) return;
    const start = Number(raw.trim());
    if (!Number.isFinite(start) || !Number.isInteger(start)) {
      void alertAction({ title: 'Starr CAD', message: 'Enter a whole number to start from.' });
      return;
    }
    const { ops, collisions } = planRenumber([...picked], document.features, start);
    if (ops.length === 0) return;
    if (collisions.length) {
      const ok = await confirmAction({
        title: 'Numbers already in use',
        message: `${collisions.slice(0, 8).join(', ')}${collisions.length > 8 ? '…' : ''} `
          + `${collisions.length === 1 ? 'is' : 'are'} already used by other points. `
          + 'Continuing leaves duplicate point numbers, which makes "point 8" ambiguous everywhere. Continue?',
        confirmLabel: 'Renumber anyway',
        danger: true,
      });
      if (!ok) return;
    }
    const undoOps = ops.map((o) => {
      const f = getFeature(o.featureId);
      updateFeature(o.featureId, { properties: { ...(f?.properties ?? {}), ...o.after } } as never);
      return {
        type: 'MODIFY_FEATURE' as const,
        data: {
          id: o.featureId,
          before: { properties: { ...(f?.properties ?? {}) } },
          after: { properties: { ...(f?.properties ?? {}), ...o.after } },
        },
      };
    });
    pushUndo(makeBatchEntry(`Renumber ${ops.length} point(s) from ${start}`, undoOps));
  }

  /** C11 — set the survey code on every picked point (single undo batch). */
  function bulkRecode() {
    if (picked.size === 0) return;
    const raw = window.prompt(`Set the code on ${picked.size} point(s) to:`, '');
    if (raw == null) return;
    const ops = planRecode([...picked], document.features, raw);
    if (ops.length === 0) return;
    const undoOps = ops.map((o) => {
      const f = getFeature(o.featureId);
      updateFeature(o.featureId, { properties: { ...(f?.properties ?? {}), ...o.after } } as never);
      return {
        type: 'MODIFY_FEATURE' as const,
        data: {
          id: o.featureId,
          before: { properties: { ...(f?.properties ?? {}) } },
          after: { properties: { ...(f?.properties ?? {}), ...o.after } },
        },
      };
    });
    pushUndo(makeBatchEntry(`Re-code ${ops.length} point(s)`, undoOps));
  }

  /** Recolor every picked point (single undo batch). Works with the search +
   *  layer filter + select-all to recolor all points in a layer, or with a
   *  manual checkbox selection of individual points. */
  function bulkSetColor(color: string) {
    const ops: { type: 'MODIFY_FEATURE'; data: { id: string; before: Record<string, unknown>; after: Record<string, unknown> } }[] = [];
    for (const id of picked) {
      const f = getFeature(id);
      if (!f) continue;
      const before = { style: f.style };
      const after = { style: { ...DEFAULT_FEATURE_STYLE, ...f.style, color, isOverride: true } };
      updateFeature(id, after);
      ops.push({ type: 'MODIFY_FEATURE', data: { id, before, after } });
    }
    if (ops.length) pushUndo(makeBatchEntry(`Recolor ${ops.length} point(s)`, ops));
  }

  /** Delete every picked point (single undo batch). */
  function bulkDelete() {
    const feats = [...picked].map((id) => getFeature(id)).filter((f): f is Feature => !!f);
    if (feats.length === 0) return;
    removeFeatures(feats.map((f) => f.id));
    pushUndo(makeBatchEntry(`Delete ${feats.length} point(s)`, feats.map((f) => ({ type: 'REMOVE_FEATURE' as const, data: f }))));
    clearPicks();
  }

  /** Export picked points to a CSV download (pt,N,E,Z,code,desc). */
  function bulkExport() {
    const pickedRows = rows.filter((r) => picked.has(r.id));
    if (pickedRows.length === 0) return;
    const header = 'PointNumber,Northing,Easting,Elevation,Code,Description';
    const lines = pickedRows.map((r) =>
      [r.name, r.northing.toFixed(4), r.easting.toFixed(4), r.elevation == null ? '' : r.elevation.toFixed(4),
        `"${r.code.replace(/"/g, '""')}"`, `"${r.description.replace(/"/g, '""')}"`].join(','),
    );
    const csv = [header, ...lines].join('\r\n') + '\r\n';
    if (typeof window !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(window.document.createElement('a'), { href: url, download: 'selected-points.csv' });
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  /** Select the picked points on the canvas and open the AI chat so the
   *  surveyor can ask about them (the AI sees them via CURRENT SELECTION). */
  function bulkAskAI() {
    if (picked.size === 0) return;
    useSelectionStore.getState().selectMultiple([...picked], 'REPLACE');
    useAIConversationsStore.getState().open();
  }

  function toggleCol(key: ColKey) {
    setColVis((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveColVis(next);
      return next;
    });
  }

  function commitEdit(row: PointRow, field: ColKey, raw: string) {
    setEdit(null);
    if (field === 'name') {
      const newName = raw.trim();
      if (newName && newName !== row.name) {
        ensureSnapshot(row); // track the original before the guarded rename
        onRenameRequest?.(row.id, row.name, newName);
      }
      return;
    }
    if (field === 'layer') return;
    const feature = getFeature(row.id);
    if (!feature) return;
    const update = rowEditToFeatureUpdate(feature, field as PointRowField, raw, document.settings);
    if (!update) return; // invalid input — ignore
    // Capture the original snapshot on the first edit so it persists with
    // the file and powers reference + revert.
    if ((feature.properties as Record<string, unknown> | undefined)?.[ORIG_KEY] === undefined) {
      update.properties = {
        ...feature.properties,
        ...(update.properties ?? {}),
        [ORIG_KEY]: JSON.stringify(rowSnapshot(row)),
      };
    }
    const before: Record<string, unknown> = {};
    const featureRec = feature as unknown as Record<string, unknown>;
    for (const k of Object.keys(update)) before[k] = featureRec[k];
    updateFeature(row.id, update);
    // cad-domain-audit Slice P — regenerate the touched feature's
    // labels so a code / description / elevation / coordinate edit
    // immediately redraws on the canvas instead of waiting for the
    // surveyor to toggle the layer prefs. Pulls the LIVE feature
    // back out of the store so the regen sees the post-edit state.
    if (rowEditAffectsLabels(field as PointRowField)) {
      const ds = useDrawingStore.getState();
      const liveDoc = ds.document;
      const liveFeature = liveDoc.features[row.id];
      const liveLayer = liveDoc.layers[liveFeature?.layerId ?? ''];
      if (liveFeature && liveLayer) {
        const labels = generateLabelsForFeature(
          liveFeature,
          liveLayer,
          liveDoc.settings.displayPreferences,
        );
        ds.setFeatureTextLabels(row.id, labels);
      }
    }
    pushUndo(
      makeBatchEntry(`Edit point ${row.name || row.id} ${field}`, [
        { type: 'MODIFY_FEATURE', data: { id: row.id, before, after: update } },
      ]),
    );
  }

  const visibleCols = COLUMNS.filter((c) => colVis[c.key]);
  const layerOrder = document.layerOrder ?? Object.keys(document.layers);
  const cell = (row: PointRow, key: ColKey): string => {
    switch (key) {
      case 'name': return row.name;
      case 'northing': return row.northing.toFixed(3);
      case 'easting': return row.easting.toFixed(3);
      case 'elevation': return row.elevation == null ? '' : row.elevation.toFixed(3);
      case 'code': return row.code;
      case 'description': return row.description;
      case 'layer': return document.layers[row.layerId]?.name ?? row.layerId;
    }
  };
  // Original value of a field for the tooltip, formatted like the cell.
  const origCell = (snap: PointSnapshot, key: ColKey): string => {
    switch (key) {
      case 'name': return snap.name;
      case 'northing': return snap.northing.toFixed(3);
      case 'easting': return snap.easting.toFixed(3);
      case 'elevation': return snap.elevation == null ? '' : snap.elevation.toFixed(3);
      case 'code': return snap.code;
      case 'description': return snap.description;
      default: return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200 text-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 shrink-0">
        <span className="font-semibold text-gray-100">Point Data</span>
        <span className="text-gray-500">{filtered.length} pts</span>
        {/* Search field selector — one field at a time, never both. */}
        <div className="flex rounded border border-gray-600 overflow-hidden shrink-0" role="group" aria-label="Search field">
          {(['NAME', 'CODE'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSearchBy(m)}
              aria-pressed={searchBy === m}
              className={`px-2 py-0.5 text-[11px] ${searchBy === m ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
              title={m === 'NAME' ? 'Search by point name/number only' : 'Search by survey code and description'}
            >
              {m === 'NAME' ? 'Name' : 'Code'}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchBy === 'CODE' ? 'Search by code / description…' : 'Search by name…'}
          className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs"
        />
        {/* C10 — pick by point number, including ranges. Separate from the search box on purpose:
            search FILTERS the list, this SELECTS points and pushes them to the canvas. Overloading
            one box with two verbs is how "5-12" comes to mean something different depending on a
            mode nobody can see. */}
        <input
          value={rangeText}
          onChange={(e) => setRangeText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') pickByRange(rangeText); }}
          onBlur={() => { if (rangeText.trim()) pickByRange(rangeText); }}
          placeholder="Select 5-12, 20…"
          title="Select points by number. Ranges and lists: 5-12, 20, 33-35"
          className="w-32 shrink-0 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs"
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => setColMenuOpen((v) => !v)}
            className="px-2 py-0.5 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700"
          >
            Columns ▾
          </button>
          {colMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded shadow-xl p-1.5 w-40">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 px-1.5 py-1 hover:bg-gray-700 rounded cursor-pointer">
                  <input type="checkbox" checked={colVis[c.key]} onChange={() => toggleCol(c.key)} className="accent-blue-500" />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className="p-1 hover:bg-gray-700 rounded" aria-label="Close point data viewer">
          <X size={14} />
        </button>
      </div>

      {/* Per-layer tabs — switch which layer's points are shown. */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-700 shrink-0 overflow-x-auto">
        <button
          type="button"
          onClick={() => setLayerFilter('ALL')}
          className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
            layerFilter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
          title="Show points from every layer"
        >
          All <span className="text-[10px] opacity-70">{rows.length}</span>
        </button>
        {layers.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLayerFilter(l.id)}
            className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
              layerFilter === l.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            title={`Show only points on "${l.name}"`}
          >
            {l.name} <span className="text-[10px] opacity-70">{l.count}</span>
          </button>
        ))}
      </div>

      {/* Bulk action bar — appears when ≥1 point is checked. */}
      {/* C10 — what the range actually resolved to, including what it could not. A range that
          quietly selects nine of the twelve points you asked for is how the wrong nine get
          deleted, so missing and ambiguous numbers are named rather than dropped. */}
      {rangeNote && (
        <div className="px-2 py-1 text-[11px] text-gray-400 border-b border-gray-700" role="status">
          {rangeNote}
        </div>
      )}

      {picked.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 bg-blue-950/40 shrink-0 flex-wrap">
          <span className="font-semibold text-blue-200">{picked.size} selected</span>
          <select
            value=""
            onChange={(e) => { if (e.target.value) { bulkSendToLayer(e.target.value); e.target.value = ''; } }}
            className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs"
            title="Send the selected points to a layer"
          >
            <option value="">Send to layer…</option>
            {drawableLayerIds(layerOrder).map((lid) => {
              const lyr = document.layers[lid];
              return lyr ? <option key={lid} value={lid}>{lyr.name}</option> : null;
            })}
          </select>
          <label className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600" title="Set the color of the selected points">
            <span className="text-gray-300">Color</span>
            <ColorSwatchInput
              value={(() => { const first = getFeature([...picked][0] ?? ''); return first?.style.color ?? '#000000'; })()}
              onChange={(c) => bulkSetColor(c)}
              className="h-4 w-6"
              aria-label="Set the color of the selected points"
            />
          </label>
          {/* C11 — the two bulk edits the table could not do. Both go through the same planners the
              tests cover, so a bulk change and a typed one write the same fields. */}
          <button
            type="button"
            onClick={() => void bulkRenumber()}
            className="px-2 py-0.5 rounded bg-gray-800 border border-gray-600 hover:bg-gray-700"
            title="Renumber these points sequentially from a starting number"
          >
            Renumber
          </button>
          <button
            type="button"
            onClick={bulkRecode}
            className="px-2 py-0.5 rounded bg-gray-800 border border-gray-600 hover:bg-gray-700"
            title="Set the survey code on these points"
          >
            Re-code
          </button>
          {/* C10 — the plain version of what "Ask AI" already did as a side effect. Every other
              bulk action here (send to layer, recolour, DELETE) acts on picks the canvas never
              showed, so "let me look at these first" had no button. */}
          <button
            type="button"
            onClick={() => pushSelectionToCanvas(picked)}
            className="px-2 py-0.5 rounded bg-gray-800 border border-gray-600 hover:bg-gray-700"
            title="Select these points on the canvas"
          >
            Show on canvas
          </button>
          <button type="button" onClick={bulkAskAI} className="px-2 py-0.5 rounded bg-gray-800 border border-gray-600 hover:bg-gray-700" title="Select these points on the canvas and open the AI to ask about them">Ask AI</button>
          <button type="button" onClick={bulkExport} className="px-2 py-0.5 rounded bg-gray-800 border border-gray-600 hover:bg-gray-700" title="Export the selected points to CSV">Export CSV</button>
          <button type="button" onClick={bulkDelete} className="px-2 py-0.5 rounded bg-red-900/50 border border-red-800 text-red-200 hover:bg-red-900" title="Delete the selected points">Delete</button>
          <button type="button" onClick={clearPicks} className="ml-auto px-2 py-0.5 rounded border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700" title="Deselect every currently selected point">Deselect all</button>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-800">
            <tr>
              <th className="w-7 px-1 py-1 border-b border-gray-700 text-center">
                <input
                  type="checkbox"
                  className="accent-blue-500"
                  aria-label="Select all visible points"
                  ref={(el) => {
                    if (!el) return;
                    const editable = filtered.filter((r) => r.editable);
                    const sel = editable.filter((r) => picked.has(r.id)).length;
                    el.checked = editable.length > 0 && sel === editable.length;
                    el.indeterminate = sel > 0 && sel < editable.length;
                  }}
                  onChange={(e) => {
                    const editable = filtered.filter((r) => r.editable).map((r) => r.id);
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) editable.forEach((id) => next.add(id));
                      else editable.forEach((id) => next.delete(id));
                      return next;
                    });
                  }}
                />
              </th>
              {visibleCols.map((c) => (
                <th key={c.key} className="text-left font-semibold px-2 py-1 border-b border-gray-700 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <th className="w-8 border-b border-gray-700" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const snap = origByRow.get(row.id);
              const rowEdited = !!snap && snapshotDiffers(row, snap);
              return (
              <tr
                key={row.id}
                className={`hover:bg-gray-800/60 ${row.editable ? '' : 'text-gray-400 italic'}`}
                title={row.editable ? undefined : 'Derived point (line vertex) — read-only here; edit the line geometry instead'}
                onContextMenu={(e) => {
                  if (!row.editable) return;
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, row });
                }}
              >
                <td className="w-7 px-1 py-0.5 border-b border-gray-800 text-center">
                  {row.editable && (
                    <input
                      type="checkbox"
                      className="accent-blue-500"
                      checked={picked.has(row.id)}
                      onChange={() => togglePick(row.id)}
                      aria-label={`Select point ${row.name || row.id}`}
                    />
                  )}
                </td>
                {visibleCols.map((c) => {
                  const cellEditable = c.editable && row.editable;
                  const editing = edit?.id === row.id && edit.field === c.key;
                  const fieldEdited =
                    !!snap &&
                    (SNAP_FIELDS as string[]).includes(c.key) &&
                    String(row[c.key as keyof PointRow] ?? '') !== String(snap[c.key as keyof PointSnapshot] ?? '');
                  return (
                    <td
                      key={c.key}
                      className="px-2 py-0.5 border-b border-gray-800 whitespace-nowrap"
                      onClick={() => cellEditable && setEdit({ id: row.id, field: c.key })}
                      title={fieldEdited ? `Original: ${origCell(snap!, c.key) || '(empty)'}` : undefined}
                    >
                      {editing ? (
                        <input
                          autoFocus
                          defaultValue={cell(row, c.key)}
                          onBlur={(e) => commitEdit(row, c.key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEdit(null);
                          }}
                          className="w-full bg-gray-700 border border-blue-500 rounded px-1 outline-none"
                        />
                      ) : (
                        <span
                          className={`${cellEditable ? 'cursor-text' : 'text-gray-400'} ${
                            fieldEdited ? 'text-amber-300' : ''
                          }`}
                        >
                          {cell(row, c.key) || (c.editable ? '—' : '')}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-1 py-0.5 border-b border-gray-800 text-center whitespace-nowrap">
                  {(mediaByOwner[row.id]?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('cad:openMediaViewer', { detail: { ownerId: row.id } }))}
                      className="text-gray-400 hover:text-blue-400 transition-colors mr-1 align-middle inline-flex items-center gap-0.5"
                      title={`${mediaByOwner[row.id].length} media attachment(s) — click to view`}
                      aria-label={`View media for point ${row.name || row.id}`}
                    >
                      <ImageIcon size={12} /><span className="text-[9px]">{mediaByOwner[row.id].length}</span>
                    </button>
                  )}
                  {rowEdited && (
                    <button
                      type="button"
                      onClick={() => revertRow(row)}
                      className="text-gray-500 hover:text-amber-300 transition-colors align-middle"
                      title="Revert this point to its original imported/created values"
                      aria-label={`Revert point ${row.name || row.id} to original`}
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 2} className="px-3 py-6 text-center text-gray-500">
                  No points. Draw or import points, or clear the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Row right-click menu — edit/command actions for one point. */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-50 min-w-[200px] bg-gray-800 border border-gray-600 rounded shadow-xl py-1 text-xs overflow-y-auto"
            style={{
              left: Math.min(ctxMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 230),
              // The viewer is bottom-docked, so grow the menu UPWARD from the
              // click and cap its height to the space above so every action
              // (incl. Delete) stays on screen.
              bottom: (typeof window !== 'undefined' ? window.innerHeight : 0) - ctxMenu.y,
              maxHeight: Math.max(160, ctxMenu.y - 8),
            }}
          >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-700">
              Point {ctxMenu.row.name || ctxMenu.row.id.slice(0, 6)}
            </div>

            {/* Send to layer */}
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 mt-1">Send to layer</div>
            <div className="max-h-40 overflow-y-auto">
              {layerOrder.length === 0 && <div className="px-3 py-1 text-gray-500">No layers</div>}
              {drawableLayerIds(layerOrder).map((lid) => {
                const lyr = document.layers[lid];
                if (!lyr) return null;
                const here = ctxMenu.row.layerId === lid;
                return (
                  <button
                    key={lid}
                    type="button"
                    disabled={here}
                    onClick={() => { sendRowToLayer(ctxMenu.row, lid); setCtxMenu(null); }}
                    className="w-full text-left px-3 py-1 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-transparent flex items-center justify-between"
                  >
                    <span>{lyr.name}</span>
                    {here && <span className="text-[10px] text-gray-500">current</span>}
                  </button>
                );
              })}
            </div>

            {/* Layers containing this point */}
            <div className="border-t border-gray-700 mt-1 px-3 py-1">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Layers containing this point</div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {layersContaining(ctxMenu.row).map((l) => (
                  <span key={l.id} className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-200 text-[10px]">{l.name}</span>
                ))}
              </div>
            </div>

            {/* Media — attach / view photos & videos for this point. */}
            <div className="border-t border-gray-700 mt-1">
              <button
                type="button"
                onClick={() => {
                  pendingMediaOwnerRef.current = ctxMenu.row.id;
                  setCtxMenu(null);
                  mediaFileRef.current?.click();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center gap-2"
              >
                <ImageIcon size={12} /> Add media for this point…
              </button>
              {(mediaByOwner[ctxMenu.row.id]?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const id = ctxMenu.row.id;
                    setCtxMenu(null);
                    window.dispatchEvent(new CustomEvent('cad:openMediaViewer', { detail: { ownerId: id } }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Eye size={12} /> View media ({mediaByOwner[ctxMenu.row.id].length})
                </button>
              )}
            </div>

            <div className="border-t border-gray-700 mt-1">
              {origByRow.has(ctxMenu.row.id) && snapshotDiffers(ctxMenu.row, origByRow.get(ctxMenu.row.id)!) && (
                <button
                  type="button"
                  onClick={() => { revertRow(ctxMenu.row); setCtxMenu(null); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center gap-2"
                >
                  <RotateCcw size={12} /> Revert to original
                </button>
              )}
              <button
                type="button"
                onClick={() => { deleteRow(ctxMenu.row); setCtxMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-red-900/40 text-red-300"
              >
                Delete point
              </button>
            </div>
          </div>
        </>
      )}

      {/* Hidden file input for attaching media to the pending point. */}
      <input
        ref={mediaFileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const owner = pendingMediaOwnerRef.current;
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (!owner || files.length === 0) return;
          for (const f of files) await addMedia(owner, 'feature', f);
        }}
      />
    </div>
  );
}

// Re-export sizing helpers so a parent dock can persist this panel's
// height under the shared panel-size namespace.
export { readPanelSize as readPointViewerHeight, writePanelSize as writePointViewerHeight };
