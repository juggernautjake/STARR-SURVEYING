'use client';
// TermText — renders body text with every known rules term clickable.
//
// S3 of DND_2024_COMPLETE_LIBRARY_2026-07-20 (owner 2026-07-20). Any condition, damage type,
// spell, feat, mechanic or glossary term appearing in the text is bolded; clicking it opens a
// small tooltip with a short explanation, an ✕, and a "Read more →" that deep-links to the full
// entry. Clicking anywhere else, or pressing Escape, closes it.
//
// The index is memoised per system: building it walks every spell, condition, feat and glossary
// entry, which is cheap once and wasteful per render.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { segmentText, termIndexFor, type LibraryTerm } from '@/lib/dnd/term-index';

const KIND_LABEL: Record<string, string> = {
  condition: 'Condition',
  damage: 'Damage type',
  spell: 'Spell',
  feat: 'Feat',
  mechanic: 'Rule',
  glossary: 'Term',
  companion: 'Companion',
};

export default function TermText({
  text, system, selfTerm, className, style,
}: {
  text: string;
  system: string;
  /** Suppress self-linking — a spell's own description shouldn't link its own name. */
  selfTerm?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState<{ term: LibraryTerm; at: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const index = useMemo(() => termIndexFor(system), [system]);
  const segments = useMemo(() => segmentText(text, index, selfTerm), [text, index, selfTerm]);

  // Click-away and Escape both close. Bound only while a tooltip is open so the page isn't
  // carrying listeners for nothing.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className={className} style={{ position: 'relative', ...style }}>
      {segments.map((seg, i) =>
        seg.term ? (
          <span key={i} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setOpen(open?.at === i ? null : { term: seg.term!, at: i })}
              title={`What is ${seg.text}?`}
              style={{
                background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer',
                fontWeight: 700, color: 'var(--hx-gold-2, #c8aa6e)',
                textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
              }}
            >
              {seg.text}
            </button>
            {open?.at === i && (
              <span
                role="dialog"
                aria-label={`${seg.term.term} explained`}
                style={{
                  position: 'absolute', left: 0, top: '100%', zIndex: 1000, marginTop: 6,
                  width: 'min(320px, 78vw)', display: 'block', textAlign: 'left',
                  background: 'var(--hx-panel, #0d1b2a)', border: '1px solid var(--hx-gold, #785a28)',
                  borderRadius: 8, padding: '10px 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  color: 'var(--hx-text, #e8e3f5)', fontWeight: 400, fontSize: 12.5, lineHeight: 1.55,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <strong style={{ color: 'var(--hx-gold-2, #c8aa6e)' }}>{seg.term.term}</strong>
                  <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--hx-teal-1, #0ac8b9)' }}>
                    {KIND_LABEL[seg.term.kind] ?? seg.term.kind}
                  </span>
                  <button
                    type="button" onClick={() => setOpen(null)} aria-label="Close"
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--hx-muted, #9aa)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                  >✕</button>
                </span>
                <span style={{ display: 'block' }}>{seg.term.short}</span>
                <Link
                  href={seg.term.href}
                  style={{ display: 'inline-block', marginTop: 7, fontSize: 12, color: 'var(--hx-teal-1, #0ac8b9)' }}
                  onClick={() => setOpen(null)}
                >
                  Read more →
                </Link>
              </span>
            )}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
