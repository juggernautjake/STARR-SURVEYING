'use client';
// InfoTip (Area B7) — a small ⓘ info dot that reveals an effect's full rules text on HOVER, keyboard FOCUS, and
// TAP. The IG/PF2 sheets showed in-play effects (stance, condition, feat…) with a native `title`, which is
// mouse-hover ONLY — invisible on the tablets a table actually uses (the owner's "keyboard- and touch-reachable"
// requirement). This is additive: it sits next to the existing chip, so the chip/native title are unchanged and
// touch/keyboard users get a real way to read the rule. Dismisses on Escape, blur, and outside tap.
import { useEffect, useId, useRef, useState } from 'react';

export default function InfoTip({ tip, label = 'more info' }: { tip: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!tip) return null;

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: '1px solid currentColor', background: 'none', color: 'inherit', fontSize: 10, lineHeight: 1, cursor: 'pointer', opacity: 0.75, padding: 0 }}
      >ⓘ</button>
      {open && (
        <span id={id} role="tooltip" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, width: 'max-content', maxWidth: 280,
          padding: '8px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.45, textTransform: 'none', letterSpacing: 0,
          color: 'var(--hx-text, #e6edf3)', background: 'var(--hx-bg-2, #0b1622)', border: '1px solid var(--hx-line, #2a3b47)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.45)', whiteSpace: 'normal', textAlign: 'left', pointerEvents: 'none',
        }}>{tip}</span>
      )}
    </span>
  );
}
