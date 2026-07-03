// app/admin/components/MediaViewer.tsx
// Reusable full-screen media viewer/player. Open it with a single media item.
//   - images: zoom (wheel / buttons / double-click) + pan (drag) + pinch (touch)
//     + fit-to-screen; works on desktop, tablet, and phone.
//   - video: native <video controls> player (mp4/webm/…).
//   - audio: native <audio controls> player (mp3/…).
// Close via the ✕ button, backdrop click, or Escape. No external deps.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';

export interface MediaItem {
  url: string;
  name?: string;
  /** MIME type, e.g. "image/png", "video/mp4", "audio/mpeg". */
  type?: string;
}

function kind(m: MediaItem): 'image' | 'video' | 'audio' | 'other' {
  const t = (m.type || '').toLowerCase();
  const u = (m.url || '').toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(u)) return 'image';
  if (t.startsWith('video/') || /\.(mp4|webm|ogv|mov|m4v)(\?|$)/.test(u)) return 'video';
  if (t.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/.test(u)) return 'audio';
  return 'other';
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function MediaViewer({ media, onClose }: { media: MediaItem | null; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);

  // Reset transform whenever a new item opens.
  useEffect(() => { reset(); }, [media, reset]);

  // Escape to close; lock body scroll while open.
  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [media, onClose]);

  if (!media) return null;
  const k = kind(media);

  const zoomBy = (factor: number) => setScale((s) => clamp(+(s * factor).toFixed(3), MIN_SCALE, MAX_SCALE));

  const onWheel = (e: React.WheelEvent) => {
    if (k !== 'image') return;
    e.preventDefault();
    setScale((s) => {
      const next = clamp(+(s * (e.deltaY < 0 ? 1.15 : 0.87)).toFixed(3), MIN_SCALE, MAX_SCALE);
      if (next === 1) { setTx(0); setTy(0); }
      return next;
    });
  };

  const onDoubleClick = () => {
    if (k !== 'image') return;
    if (scale > 1) reset(); else setScale(2.5);
  };

  // --- mouse pan ---
  const onMouseDown = (e: React.MouseEvent) => {
    if (k !== 'image' || scale <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  };
  const endDrag = () => { drag.current = null; };

  // --- touch pan + pinch ---
  const onTouchStart = (e: React.TouchEvent) => {
    if (k !== 'image') return;
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale };
    } else if (e.touches.length === 1 && scale > 1) {
      drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (k !== 'image') return;
    if (e.touches.length === 2 && pinch.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setScale(clamp(+(pinch.current.scale * (dist / pinch.current.dist)).toFixed(3), MIN_SCALE, MAX_SCALE));
    } else if (e.touches.length === 1 && drag.current) {
      setTx(drag.current.tx + (e.touches[0].clientX - drag.current.x));
      setTy(drag.current.ty + (e.touches[0].clientY - drag.current.y));
    }
  };
  const onTouchEnd = () => { pinch.current = null; drag.current = null; if (scale <= 1) { setTx(0); setTy(0); } };

  return (
    <div className="media-viewer" onClick={onClose} role="dialog" aria-modal="true" aria-label={media.name || 'Media viewer'}>
      <div className="media-viewer__bar" onClick={(e) => e.stopPropagation()}>
        <span className="media-viewer__name">{media.name || ''}</span>
        <div className="media-viewer__actions">
          {k === 'image' && (
            <>
              <button className="media-viewer__btn" onClick={() => zoomBy(0.83)} aria-label="Zoom out"><ZoomOut size={18} /></button>
              <button className="media-viewer__btn" onClick={() => zoomBy(1.2)} aria-label="Zoom in"><ZoomIn size={18} /></button>
              <button className="media-viewer__btn" onClick={reset} aria-label="Fit to screen"><Maximize2 size={18} /></button>
            </>
          )}
          <a className="media-viewer__btn" href={media.url} download={media.name} target="_blank" rel="noopener noreferrer" aria-label="Download" onClick={(e) => e.stopPropagation()}><Download size={18} /></a>
          <button className="media-viewer__btn media-viewer__btn--close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
      </div>

      <div
        className="media-viewer__stage"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {k === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.url}
            alt={media.name || 'image'}
            className="media-viewer__img"
            draggable={false}
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }}
          />
        )}
        {k === 'video' && (
          <video className="media-viewer__video" src={media.url} controls autoPlay playsInline />
        )}
        {k === 'audio' && (
          <div className="media-viewer__audio-wrap">
            <div className="media-viewer__audio-name">{media.name || 'Audio'}</div>
            <audio className="media-viewer__audio" src={media.url} controls autoPlay />
          </div>
        )}
        {k === 'other' && (
          <div className="media-viewer__audio-wrap">
            <div className="media-viewer__audio-name">{media.name || 'File'}</div>
            <a className="media-viewer__btn" href={media.url} download={media.name} target="_blank" rel="noopener noreferrer">Download</a>
          </div>
        )}
      </div>
    </div>
  );
}
