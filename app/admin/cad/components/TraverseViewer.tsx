'use client';
// app/admin/cad/components/TraverseViewer.tsx
//
// Read-only viewer of line/curve traverse data (plan §10.5/10e):
// per-feature distance, azimuth, quadrant bearing, and arc radius /
// delta / arc length / chord, filterable by layer with customizable
// (show/hide) columns. Editing courses maps back to geometry — a
// follow-up (10f).
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §10

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useDrawingStore, useUndoStore, makeBatchEntry } from '@/lib/cad/store';
import {
  buildTraverseRows,
  traverseEditToGeometry,
  type TraverseRow,
  type TraverseEditField,
} from '@/lib/cad/points/traverse-rows';

type ColKey =
  | 'kind' | 'startN' | 'startE' | 'endN' | 'endE'
  | 'distance' | 'azimuth' | 'bearing' | 'radius' | 'delta' | 'arcLength' | 'chord' | 'layer';

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: 'kind', label: 'Type' },
  { key: 'startN', label: 'Start N' },
  { key: 'startE', label: 'Start E' },
  { key: 'endN', label: 'End N' },
  { key: 'endE', label: 'End E' },
  { key: 'distance', label: 'Distance' },
  { key: 'azimuth', label: 'Azimuth' },
  { key: 'bearing', label: 'Bearing' },
  { key: 'radius', label: 'Radius' },
  { key: 'delta', label: 'Delta' },
  { key: 'arcLength', label: 'Arc Len' },
  { key: 'chord', label: 'Chord' },
  { key: 'layer', label: 'Layer' },
];

const COLVIS_KEY = 'starr-cad-panel:traverseViewerCols';

function loadColVis(): Record<ColKey, boolean> {
  const all = Object.fromEntries(COLUMNS.map((c) => [c.key, true])) as Record<ColKey, boolean>;
  if (typeof window === 'undefined') return all;
  try {
    const raw = window.localStorage.getItem(COLVIS_KEY);
    if (raw) return { ...all, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return all;
}

export default function TraverseViewer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const document = useDrawingStore((s) => s.document);
  const updateFeature = useDrawingStore((s) => s.updateFeature);
  const getFeature = useDrawingStore((s) => s.getFeature);
  const pushUndo = useUndoStore((s) => s.pushUndo);
  const [layerFilter, setLayerFilter] = useState('ALL');
  const [colVis, setColVis] = useState<Record<ColKey, boolean>>(loadColVis);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [edit, setEdit] = useState<{ id: string; field: TraverseEditField } | null>(null);

  const EDITABLE: Partial<Record<ColKey, TraverseEditField>> = {
    distance: 'distance',
    azimuth: 'azimuth',
    bearing: 'bearing',
  };

  function commitEdit(row: TraverseRow, field: TraverseEditField, raw: string) {
    setEdit(null);
    const feature = getFeature(row.id);
    if (!feature) return;
    const update = traverseEditToGeometry(feature, field, raw);
    if (!update) return;
    const before = { geometry: feature.geometry };
    updateFeature(row.id, update);
    pushUndo(
      makeBatchEntry(`Edit course ${field}`, [
        { type: 'MODIFY_FEATURE', data: { id: row.id, before, after: update } },
      ]),
    );
  }

  const rows = useMemo(() => buildTraverseRows(document), [document]);
  const layers = useMemo(() => {
    const ids = new Set(rows.map((r) => r.layerId));
    return [...ids].map((id) => ({ id, name: document.layers[id]?.name ?? id }));
  }, [rows, document.layers]);
  const filtered = useMemo(
    () => (layerFilter === 'ALL' ? rows : rows.filter((r) => r.layerId === layerFilter)),
    [rows, layerFilter],
  );

  if (!open) return null;

  function toggleCol(key: ColKey) {
    setColVis((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { window.localStorage.setItem(COLVIS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const num = (v: number | null, dp = 2) => (v == null ? '' : v.toFixed(dp));
  const cell = (row: TraverseRow, key: ColKey): string => {
    switch (key) {
      case 'kind': return row.kind;
      case 'startN': return num(row.startN, 3);
      case 'startE': return num(row.startE, 3);
      case 'endN': return num(row.endN, 3);
      case 'endE': return num(row.endE, 3);
      case 'distance': return num(row.distance, 2);
      case 'azimuth': return row.azimuth == null ? '' : `${row.azimuth.toFixed(4)}°`;
      case 'bearing': return row.bearing ?? '';
      case 'radius': return num(row.radius, 2);
      case 'delta': return row.delta == null ? '' : `${row.delta.toFixed(4)}°`;
      case 'arcLength': return num(row.arcLength, 2);
      case 'chord': return num(row.chord, 2);
      case 'layer': return document.layers[row.layerId]?.name ?? row.layerId;
    }
  };

  const visibleCols = COLUMNS.filter((c) => colVis[c.key]);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200 text-xs">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 shrink-0">
        <span className="font-semibold text-gray-100">Traverse Data</span>
        <span className="text-gray-500">{filtered.length} courses</span>
        <select
          value={layerFilter}
          onChange={(e) => setLayerFilter(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs"
          title="Filter by layer"
        >
          <option value="ALL">All layers</option>
          {layers.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
        </select>
        <div className="relative ml-auto">
          <button type="button" onClick={() => setColMenuOpen((v) => !v)} className="px-2 py-0.5 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700">
            Columns ▾
          </button>
          {colMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded shadow-xl p-1.5 w-40 max-h-64 overflow-auto">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 px-1.5 py-1 hover:bg-gray-700 rounded cursor-pointer">
                  <input type="checkbox" checked={colVis[c.key]} onChange={() => toggleCol(c.key)} className="accent-blue-500" />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className="p-1 hover:bg-gray-700 rounded" aria-label="Close traverse viewer">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-800">
            <tr>
              {visibleCols.map((c) => (
                <th key={c.key} className="text-left font-semibold px-2 py-1 border-b border-gray-700 whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-gray-800/60">
                {visibleCols.map((c) => {
                  const editField = row.kind === 'LINE' ? EDITABLE[c.key] : undefined;
                  const editing = !!editField && edit?.id === row.id && edit.field === editField;
                  return (
                    <td
                      key={c.key}
                      className="px-2 py-0.5 border-b border-gray-800 whitespace-nowrap"
                      onClick={editField ? () => setEdit({ id: row.id, field: editField }) : undefined}
                    >
                      {editing ? (
                        <input
                          autoFocus
                          defaultValue={cell(row, c.key).replace('°', '')}
                          onBlur={(e) => commitEdit(row, editField!, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEdit(null);
                          }}
                          className="w-24 bg-gray-700 border border-blue-500 rounded px-1 outline-none"
                        />
                      ) : (
                        <span className={editField ? 'cursor-text' : undefined}>{cell(row, c.key)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length} className="px-3 py-6 text-center text-gray-500">
                  No lines, polylines, or arcs. Draw linework, or clear the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
