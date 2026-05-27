'use client';
// app/admin/cad/components/MediaViewer.tsx — modal viewer for media attached
// to a feature/layer. Image: pan + zoom (wheel/buttons/drag). Video: native
// controls. Opens on the `cad:openMediaViewer` event ({ ownerId }).

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Maximize, Trash2 } from 'lucide-react';
import { useMediaStore, type MediaItem } from '@/lib/cad/media/media-store';

export default function MediaViewer() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const getBlobUrl = useMediaStore((s) => s.getBlobUrl);
  const removeMedia = useMediaStore((s) => s.removeMedia);
  const byOwner = useMediaStore((s) => s.byOwner); // re-render on changes

  const items: MediaItem[] = useMemo(
    () => (ownerId ? byOwner[ownerId] ?? [] : []),
    [ownerId, byOwner],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Open on event.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ ownerId: string }>).detail?.ownerId ?? null;
      setOwnerId(id);
    };
    window.addEventListener('cad:openMediaViewer', handler);
    return () => window.removeEventListener('cad:openMediaViewer', handler);
  }, []);

  const active = items.find((m) => m.id === activeId) ?? items[0] ?? null;

  // Default-select the first item when (re)opened.
  useEffect(() => {
    if (ownerId && items.length > 0 && !items.some((m) => m.id === activeId)) {
      setActiveId(items[0].id);
    }
    if (ownerId && items.length === 0) setOwnerId(null); // nothing left → close
  }, [ownerId, items, activeId]);

  // Load the active item's blob URL; revoke on change/close.
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setUrl(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (active) {
      void getBlobUrl(active.id).then((u) => {
        if (cancelled) { if (u) URL.revokeObjectURL(u); return; }
        revoked = u;
        setUrl(u);
      });
    }
    return () => { cancelled = true; if (revoked) URL.revokeObjectURL(revoked); };
  }, [active, getBlobUrl]);

  const close = useCallback(() => setOwnerId(null), []);
  useEffect(() => {
    if (!ownerId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ownerId, close]);

  if (!ownerId || !active) return null;

  const isImage = active.kind === 'image';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/80 animate-[fadeIn_120ms_ease-out]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 text-gray-200 text-sm shrink-0">
        <span className="font-semibold truncate max-w-[40%]">{active.name}</span>
        <span className="text-gray-500 text-xs">{items.length} item{items.length === 1 ? '' : 's'}</span>
        {isImage && (
          <div className="flex items-center gap-1 ml-2">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.1, z / 1.25))} className="p-1 rounded hover:bg-gray-700" aria-label="Zoom out"><ZoomOut size={16} /></button>
            <span className="text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(20, z * 1.25))} className="p-1 rounded hover:bg-gray-700" aria-label="Zoom in"><ZoomIn size={16} /></button>
            <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1 rounded hover:bg-gray-700" aria-label="Reset zoom"><Maximize size={16} /></button>
          </div>
        )}
        <button
          type="button"
          onClick={() => { if (active) void removeMedia(active.id); }}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-red-300 hover:bg-red-900/40 text-xs"
          title="Delete this attachment"
        >
          <Trash2 size={14} /> Delete
        </button>
        <button type="button" onClick={close} className="p-1 rounded hover:bg-gray-700" aria-label="Close media viewer"><X size={18} /></button>
      </div>

      {/* Main view */}
      <div
        className="flex-1 min-h-0 overflow-hidden flex items-center justify-center relative"
        onWheel={(e) => { if (isImage) { e.preventDefault(); setZoom((z) => Math.max(0.1, Math.min(20, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))); } }}
        onPointerDown={(e) => { if (isImage) dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; }}
        onPointerMove={(e) => {
          if (dragRef.current) setPan({ x: dragRef.current.px + (e.clientX - dragRef.current.x), y: dragRef.current.py + (e.clientY - dragRef.current.y) });
        }}
        onPointerUp={() => { dragRef.current = null; }}
        style={{ cursor: isImage && zoom > 1 ? 'grab' : 'default' }}
      >
        {!url ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={active.name}
            draggable={false}
            className="select-none max-w-none"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}
          />
        ) : (
          <video src={url} controls className="max-h-full max-w-full" />
        )}
      </div>

      {/* Thumbnail strip */}
      {items.length > 1 && (
        <div className="flex gap-2 px-4 py-2 bg-gray-900 border-t border-gray-700 overflow-x-auto shrink-0">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveId(m.id)}
              className={`shrink-0 w-16 h-16 rounded border overflow-hidden flex items-center justify-center bg-gray-800 ${m.id === active.id ? 'border-blue-500' : 'border-gray-600 hover:border-gray-400'}`}
              title={m.name}
            >
              {m.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumbnail} alt={m.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-gray-400 px-1 text-center">{m.kind === 'video' ? '▶ video' : m.name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
