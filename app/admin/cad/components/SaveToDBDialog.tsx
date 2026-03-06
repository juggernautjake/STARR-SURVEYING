'use client';
// app/admin/cad/components/SaveToDBDialog.tsx
// Two-mode dialog:
//   mode='save'  — save current drawing to the database
//   mode='open'  — browse previously saved drawings and load one

import { useEffect, useState, useCallback } from 'react';
import { useDrawingStore, useSelectionStore, useUndoStore } from '@/lib/cad/store';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import { cadLog } from '@/lib/cad/logger';

interface SavedDrawingMeta {
  id: string;
  name: string;
  description: string | null;
  feature_count: number;
  layer_count: number;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  mode: 'save' | 'open';
  onClose: () => void;
}

export default function SaveToDBDialog({ mode, onClose }: Props) {
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const undoStore = useUndoStore();

  // ── Save mode state ──────────────────────────────────────────────────
  const [saveName, setSaveName] = useState(drawingStore.document.name);
  const [saveDesc, setSaveDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // ── Open mode state ──────────────────────────────────────────────────
  const [drawings, setDrawings] = useState<SavedDrawingMeta[]>([]);
  const [loading, setLoading] = useState(mode === 'open');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // ── Fetch list when in open mode ─────────────────────────────────────
  const fetchDrawings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/cad/drawings');
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error: ${res.status}`);
      }
      const body = await res.json() as { drawings: SavedDrawingMeta[] };
      setDrawings(body.drawings ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load drawings';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'open') fetchDrawings();
  }, [mode, fetchDrawings]);

  // ── Save handler ─────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const doc = drawingStore.document;
      const featureCount = Object.keys(doc.features).length;
      const layerCount = Object.keys(doc.layers).length;

      const payload = {
        id: savedId ?? undefined,
        name: saveName.trim() || doc.name,
        description: saveDesc.trim() || undefined,
        document: { version: '1.0', application: 'starr-cad', document: doc },
        feature_count: featureCount,
        layer_count: layerCount,
      };

      const res = await fetch('/api/admin/cad/drawings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error: ${res.status}`);
      }

      const body = await res.json() as { drawing: { id: string } };
      setSavedId(body.drawing.id);
      drawingStore.markClean();
      cadLog.info('FileIO', `Saved drawing to DB: ${saveName}`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
      cadLog.error('FileIO', 'Failed to save drawing to DB', err);
    } finally {
      setSaving(false);
    }
  }

  // ── Open handler ─────────────────────────────────────────────────────
  async function handleOpen(id: string) {
    setOpening(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error: ${res.status}`);
      }
      const body = await res.json() as { drawing: { document: unknown } };
      const payload = body.drawing.document as { document?: unknown };
      const doc = validateAndMigrateDocument(payload?.document ?? payload);
      drawingStore.loadDocument(doc);
      selectionStore.deselectAll();
      undoStore.clear();
      cadLog.info('FileIO', `Loaded drawing from DB: ${doc.name}`);
      onClose();
      setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open drawing';
      setLoadError(msg);
      cadLog.error('FileIO', 'Failed to open drawing from DB', err);
    } finally {
      setOpening(false);
    }
  }

  // ── Delete handler ────────────────────────────────────────────────────
  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}" from the database? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error: ${res.status}`);
      }
      setDrawings((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 animate-[fadeIn_150ms_ease-out]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg text-sm text-gray-200 animate-[scaleIn_200ms_cubic-bezier(0.16,1,0.3,1)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-base font-bold text-white">
            {mode === 'save' ? 'Save Drawing to Database' : 'Open Drawing from Database'}
          </h2>
          <button className="text-gray-400 hover:text-white text-lg leading-none" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {mode === 'save' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Drawing Name</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1.5 outline-none focus:border-blue-500"
                  placeholder="Enter drawing name…"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Description <span className="text-gray-600">(optional)</span></label>
                <textarea
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1.5 outline-none focus:border-blue-500 resize-none"
                  placeholder="Add a description…"
                />
              </div>
              {saveError && (
                <p className="text-red-400 text-xs bg-red-900/20 border border-red-700 rounded px-3 py-2">{saveError}</p>
              )}
            </>
          ) : (
            <>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                  <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Loading drawings…
                </div>
              )}
              {loadError && (
                <div className="space-y-2">
                  <p className="text-red-400 text-xs bg-red-900/20 border border-red-700 rounded px-3 py-2">{loadError}</p>
                  <button
                    className="text-xs text-blue-400 hover:text-blue-300 underline"
                    onClick={fetchDrawings}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!loading && !loadError && drawings.length === 0 && (
                <p className="text-gray-500 text-center py-8">No saved drawings found.</p>
              )}
              {!loading && drawings.length > 0 && (
                <ul className="space-y-2">
                  {drawings.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-start justify-between gap-3 bg-gray-800 rounded-lg px-4 py-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium text-sm truncate">{d.name}</div>
                        {d.description && (
                          <div className="text-gray-400 text-xs truncate mt-0.5">{d.description}</div>
                        )}
                        <div className="text-gray-600 text-[11px] mt-1">
                          {d.feature_count} feature{d.feature_count !== 1 ? 's' : ''} · {d.layer_count} layer{d.layer_count !== 1 ? 's' : ''} · Updated {new Date(d.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          disabled={opening}
                          onClick={() => handleOpen(d.id)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded transition-colors"
                        >
                          {opening ? '…' : 'Open'}
                        </button>
                        <button
                          onClick={() => handleDelete(d.id, d.name)}
                          className="px-2 py-1 bg-gray-700 hover:bg-red-700 text-gray-400 hover:text-white text-xs rounded transition-colors"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 pb-5 pt-3 border-t border-gray-700">
          <button
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          {mode === 'save' && (
            <button
              disabled={saving || !saveName.trim()}
              onClick={handleSave}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs transition-colors flex items-center gap-2"
            >
              {saving && (
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {saving ? 'Saving…' : 'Save to Database'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
