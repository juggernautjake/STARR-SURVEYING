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

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useDrawingStore, useUndoStore, makeBatchEntry } from '@/lib/cad/store';
import {
  buildPointRows,
  rowEditToFeatureUpdate,
  type PointRow,
  type PointRowField,
} from '@/lib/cad/points/point-rows';
import { readPanelSize, writePanelSize } from '@/lib/cad/ui/panel-size';

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
  const pushUndo = useUndoStore((s) => s.pushUndo);

  const [layerFilter, setLayerFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [colVis, setColVis] = useState<Record<ColKey, boolean>>(loadColVis);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [edit, setEdit] = useState<{ id: string; field: ColKey } | null>(null);

  const rows = useMemo(() => buildPointRows(document), [document]);

  const layers = useMemo(() => {
    const ids = new Set(rows.map((r) => r.layerId));
    return [...ids].map((id) => ({ id, name: document.layers[id]?.name ?? id }));
  }, [rows, document.layers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (layerFilter !== 'ALL' && r.layerId !== layerFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    });
  }, [rows, layerFilter, search]);

  if (!open) return null;

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
      if (newName && newName !== row.name) onRenameRequest?.(row.id, row.name, newName);
      return;
    }
    if (field === 'layer') return;
    const feature = getFeature(row.id);
    if (!feature) return;
    const update = rowEditToFeatureUpdate(feature, field as PointRowField, raw, document.settings);
    if (!update) return; // invalid input — ignore
    const before: Record<string, unknown> = {};
    const featureRec = feature as unknown as Record<string, unknown>;
    for (const k of Object.keys(update)) before[k] = featureRec[k];
    updateFeature(row.id, update);
    pushUndo(
      makeBatchEntry(`Edit point ${row.name || row.id} ${field}`, [
        { type: 'MODIFY_FEATURE', data: { id: row.id, before, after: update } },
      ]),
    );
  }

  const visibleCols = COLUMNS.filter((c) => colVis[c.key]);
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

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200 text-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 shrink-0">
        <span className="font-semibold text-gray-100">Point Data</span>
        <span className="text-gray-500">{filtered.length} pts</span>
        <select
          value={layerFilter}
          onChange={(e) => setLayerFilter(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs"
          title="Filter by layer"
        >
          <option value="ALL">All layers</option>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name / code / desc…"
          className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs"
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

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-800">
            <tr>
              {visibleCols.map((c) => (
                <th key={c.key} className="text-left font-semibold px-2 py-1 border-b border-gray-700 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-gray-800/60">
                {visibleCols.map((c) => {
                  const editing = edit?.id === row.id && edit.field === c.key;
                  return (
                    <td
                      key={c.key}
                      className="px-2 py-0.5 border-b border-gray-800 whitespace-nowrap"
                      onClick={() => c.editable && setEdit({ id: row.id, field: c.key })}
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
                        <span className={c.editable ? 'cursor-text' : 'text-gray-400'}>
                          {cell(row, c.key) || (c.editable ? '—' : '')}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length} className="px-3 py-6 text-center text-gray-500">
                  No points. Draw or import points, or clear the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Re-export sizing helpers so a parent dock can persist this panel's
// height under the shared panel-size namespace.
export { readPanelSize as readPointViewerHeight, writePanelSize as writePointViewerHeight };
