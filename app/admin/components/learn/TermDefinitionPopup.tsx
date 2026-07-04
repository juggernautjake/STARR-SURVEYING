// app/admin/components/learn/TermDefinitionPopup.tsx
//
// A small stylized, anchored popup that defines a term the student clicked in a
// lesson. If `definition` is provided (a curated glossary hit) it shows instantly;
// otherwise it fetches an accurate short definition from /api/admin/learn/define.
// Closes via its × button, outside-click, or Escape.
'use client';

import { useEffect, useRef, useState } from 'react';
import { X, BookMarked } from 'lucide-react';

export interface TermPopupTarget {
  term: string;
  definition: string | null; // non-null = glossary hit; null = fetch from AI
  context?: string;
  x: number;
  y: number;
}

export default function TermDefinitionPopup({ target, onClose }: { target: TermPopupTarget; onClose: () => void }) {
  const [def, setDef] = useState<string | null>(target.definition);
  const [loading, setLoading] = useState(target.definition == null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch from the AI fallback when there's no glossary definition.
  useEffect(() => {
    if (target.definition != null) { setDef(target.definition); setLoading(false); setError(null); return; }
    let cancelled = false;
    setLoading(true); setError(null); setDef(null);
    (async () => {
      try {
        const res = await fetch('/api/admin/learn/define', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term: target.term, context: target.context }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(data.error || 'No definition available.');
        else setDef(String(data.definition || ''));
      } catch { if (!cancelled) setError('Could not load a definition.'); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [target.term, target.definition, target.context]);

  // Outside-click + Escape close.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // Keep the popup on-screen: clamp x, and flip above the click if near the bottom.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const left = Math.max(150, Math.min(target.x, vw - 150));
  const flipUp = target.y > vh - 220;
  const style: React.CSSProperties = flipUp
    ? { left, bottom: vh - target.y + 14 }
    : { left, top: target.y + 14 };

  return (
    <div ref={ref} className={`term-pop ${flipUp ? 'term-pop--up' : ''}`} style={style} role="dialog" aria-label={`Definition of ${target.term}`}>
      <div className="term-pop__arrow" />
      <div className="term-pop__head">
        <span className="term-pop__title"><BookMarked size={13} /> {target.term}</span>
        <button className="term-pop__close" onClick={onClose} aria-label="Close definition"><X size={15} /></button>
      </div>
      <div className="term-pop__body">
        {loading ? <span className="term-pop__loading">Looking it up<span className="term-pop__dots"><span></span><span></span><span></span></span></span>
          : error ? <span className="term-pop__error">{error}</span>
          : def}
      </div>
    </div>
  );
}
