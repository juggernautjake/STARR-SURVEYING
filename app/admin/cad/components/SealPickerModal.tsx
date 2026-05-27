'use client';
// app/admin/cad/components/SealPickerModal.tsx
//
// Opened by clicking the OFFICIAL SEAL area of the signature block
// (cad:openSealPicker). Lets the surveyor:
//   • upload a square seal image from the local machine (also saved to the
//     shared cloud seal library so it can be reused on other drawings),
//   • pick a previously-saved seal from the cloud library,
//   • remove the current seal.
// The chosen image URL is written to titleBlock.sealImageDataUrl, which the
// canvas renders in the seal column.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Trash2, X } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import { cadLog } from '@/lib/cad/logger';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';

interface SealImage { name: string; path: string; url: string }

interface Props { onClose: () => void }

export default function SealPickerModal({ onClose }: Props) {
  const drawingStore = useDrawingStore();
  const current = drawingStore.document.settings.titleBlock?.sealImageDataUrl ?? null;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [saved, setSaved] = useState<SealImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/cad/images?folder=seals');
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const body = await res.json() as { images: SealImage[] };
      setSaved(body.images ?? []);
    } catch (err) {
      setSaved([]);
      setError(err instanceof Error ? err.message : 'Could not load saved seals');
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  function apply(url: string | null) {
    drawingStore.updateTitleBlock({ sealImageDataUrl: url });
    onClose();
  }

  async function onLocalFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
        r.onerror = () => reject(new Error('Could not read file'));
        r.readAsDataURL(file);
      });
      // Save to the shared cloud library so it can be reused, then use the
      // returned public URL. If the upload fails (e.g. storage unavailable),
      // fall back to the inline data URL so the seal still appears.
      try {
        const res = await fetch('/api/admin/cad/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, folder: 'seals' }),
        });
        if (res.ok) {
          const { url } = await res.json() as { url: string };
          apply(url);
          return;
        }
        cadLog.warn('FileIO', `Seal cloud upload failed (${res.status}); using inline image`);
      } catch (err) {
        cadLog.warn('FileIO', 'Seal cloud upload errored; using inline image', err);
      }
      apply(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalFrame open onClose={onClose} title="Official Seal" initialWidth={460} initialHeight={420} minWidth={360} minHeight={300}>
      <div className="flex flex-col h-full text-sm text-gray-200">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 h-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded transition-colors"
          >
            <Upload size={13} /> Upload from computer
          </button>
          {current && (
            <button
              onClick={() => apply(null)}
              className="flex items-center gap-1.5 px-2.5 h-8 bg-gray-700 hover:bg-red-700 text-gray-200 text-xs rounded transition-colors"
            >
              <Trash2 size={13} /> Remove seal
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) void onLocalFile(f); }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-[11px] text-gray-500 mb-2">Saved seals (shared) — click to use</div>
          {error && <div className="text-red-400 text-xs bg-red-900/20 border border-red-700 rounded px-3 py-2 mb-2">{error}</div>}
          {saved === null ? (
            <div className="flex items-center gap-2 py-8 text-gray-400 justify-center">
              <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : saved.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No saved seals yet. Upload one to add it to the shared library.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {saved.map((img) => (
                <button
                  key={img.path}
                  onClick={() => apply(img.url)}
                  className={`aspect-square rounded border overflow-hidden bg-white hover:border-blue-500 ${current === img.url ? 'border-blue-500 ring-1 ring-blue-400' : 'border-gray-600'}`}
                  title="Use this seal"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.name} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-3 py-2 border-t border-gray-700">
          <button onClick={onClose} className="flex items-center gap-1 px-3 h-8 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors">
            <X size={13} /> Close
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
