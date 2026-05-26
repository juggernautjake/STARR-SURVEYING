'use client';
// app/admin/cad/components/ExportLayersDialog.tsx
//
// Pick a set of layers and a format, then export only those layers
// (plan §5 "Export by chosen layers"). Uses scopeDocument({kind:'LAYERS'})
// so the existing CSV/DXF/LandXML writers work unchanged.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §5

import { useState } from 'react';
import { X } from 'lucide-react';
import { useDrawingStore, useAnnotationStore } from '@/lib/cad/store';
import { scopeDocument, downloadDxf, downloadLandXML } from '@/lib/cad/delivery';
import { downloadCsv } from '@/lib/cad/persistence/export-csv';
import { cadLog } from '@/lib/cad/logger';

type Format = 'CSV' | 'DXF' | 'LANDXML';

export default function ExportLayersDialog({ onClose }: { onClose: () => void }) {
  const doc = useDrawingStore((s) => s.document);
  const orderedLayers = doc.layerOrder
    .map((id) => doc.layers[id])
    .filter((l): l is NonNullable<typeof l> => !!l);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(orderedLayers.map((l) => l.id)));
  const [format, setFormat] = useState<Format>('CSV');

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function doExport() {
    if (selected.size === 0) {
      alert('Select at least one layer to export.');
      return;
    }
    try {
      const scoped = scopeDocument(doc, { kind: 'LAYERS', layerIds: selected });
      if (format === 'CSV') {
        const { filename } = downloadCsv(scoped, { flavor: 'full' });
        cadLog.info('FileIO', `Exported ${selected.size} layer(s) as CSV → ${filename}`);
      } else if (format === 'DXF') {
        const annotations = useAnnotationStore.getState().annotations;
        const { filename } = downloadDxf(scoped, { annotations });
        cadLog.info('FileIO', `Exported ${selected.size} layer(s) as DXF → ${filename}`);
      } else {
        const { filename } = downloadLandXML(scoped);
        cadLog.info('FileIO', `Exported ${selected.size} layer(s) as LandXML → ${filename}`);
      }
      onClose();
    } catch (err) {
      cadLog.error('FileIO', 'Layer export failed', err);
      alert('Failed to export the chosen layers. Try again, or contact support if it keeps failing.');
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out] motion-reduce:animate-none">
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-full max-w-sm text-sm text-gray-200 animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="font-semibold text-white">Export layers</h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-700 rounded" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Layers</span>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-blue-400 hover:underline" onClick={() => setSelected(new Set(orderedLayers.map((l) => l.id)))}>All</button>
                <button type="button" className="text-blue-400 hover:underline" onClick={() => setSelected(new Set())}>None</button>
              </div>
            </div>
            <div className="max-h-56 overflow-auto border border-gray-700 rounded">
              {orderedLayers.map((l) => (
                <div
                  key={l.id}
                  onClick={() => toggle(l.id)}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-gray-700/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggle(l.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-blue-500"
                    style={{ width: 14, height: 14, flex: '0 0 auto' }}
                  />
                  <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.name}
                  </span>
                </div>
              ))}
              {orderedLayers.length === 0 && <div className="px-2 py-3 text-gray-500 text-xs">No layers.</div>}
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1.5">Format</span>
            <div className="flex gap-3">
              {(['CSV', 'DXF', 'LANDXML'] as Format[]).map((f) => (
                <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="fmt" checked={format === f} onChange={() => setFormat(f)} className="accent-blue-500" />
                  {f === 'LANDXML' ? 'LandXML' : f}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-gray-300 hover:bg-gray-700 rounded">Cancel</button>
          <button type="button" onClick={doExport} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium">
            Export {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
