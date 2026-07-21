'use client';
// app/dnd/_ui/Tip.tsx — THE tooltip primitive for the D&D surfaces (Slice CX-10).
//
// It replaces two near-identical components that had drifted apart: `_sheet/components/InfoTip`
// (the ⓘ on in-play effect chips) and `_ui/InfoTip` (the builder's help dot, keyed off
// BUILDER_HELP). Both drew the same bubble; only one of them dismissed on Escape or on an outside
// tap, and neither could be worn by the markers that most needed it. Both still exist as thin
// adapters over this file so their call sites are unchanged — the duplication is gone, the imports
// are not.
//
// The reason this primitive exists at all is the native `title` attribute, and it is worth stating
// plainly because the platform keeps re-learning it: `title` takes ~1s of steady hover, is
// mouse-only, never fires on touch, and is skipped by most screen-reader flows. A marker whose only
// explanation lives in a `title` is, for a tablet at the table, an unexplained symbol on a
// character sheet — which reads as a bug. So every marker wears a Tip, and keeps its `title` only
// as a redundant fallback (Tip sets that itself, below).
//
// Reachable four ways by construction: hover, keyboard focus, click/tap, and dismissable with
// Escape, blur, or a tap outside.
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export type TipProps = {
  /** The explanation. No text → the component renders NOTHING, so an unexplained marker is
   *  impossible to produce by accident rather than merely discouraged. */
  tip: string;
  /** Optional bold heading above the body ("Outside the normal rules"). The builder help dot uses
   *  this for its topic title; markers use it to say what the symbol MEANS before its data. */
  title?: string;
  /** Screen-reader name for the trigger. Defaults to the heading, then to "more info". */
  label?: string;
  /** The visible character. ⓘ by default; markers pass their own (⚑, ✎, ⚙, ?). */
  glyph?: ReactNode;
  /** Drop the circular chrome and render `glyph` alone, inheriting colour and size from the parent.
   *  ⚑ and ✎ are typographic marks that sit in a line of text — putting them in a bordered circle
   *  would make them read as buttons rather than as annotations. */
  bare?: boolean;
  /** Passed to the wrapper so existing marker classes (`edit-mark`, …) keep their skin styling. */
  className?: string;
  /** Merged over the trigger's own styles — for a marker's colour, mostly. */
  triggerStyle?: CSSProperties;
};

export default function Tip({ tip, title, label, glyph = 'ⓘ', bare = false, className, triggerStyle }: TipProps) {
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

  // The redundant `title`. Kept because it costs nothing and still serves the one case the popover
  // cannot — a mouse user who never clicks — but nothing depends on it alone any more.
  const plain = title ? `${title} — ${tip}` : tip;
  const name = label ?? title ?? 'more info';

  // Inline-safe: every node here is a <span> or a <button>, never a <div>/<p>. A marker can sit
  // inside a feature's <p>, and HTML force-closes a paragraph at its first block-level child — the
  // same trap EffectStar and RuleTip document.
  return (
    <span
      ref={wrapRef}
      className={className}
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={name}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        title={plain}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={bare ? {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'none', color: 'inherit', font: 'inherit',
          padding: 0, cursor: 'help', lineHeight: 1,
          ...triggerStyle,
        } : {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 15, height: 15, borderRadius: '50%',
          border: '1px solid var(--hx-line, currentColor)', background: 'none', color: 'inherit',
          fontSize: 10, fontWeight: 700, lineHeight: 1, cursor: 'help', padding: 0, opacity: 0.85,
          ...triggerStyle,
        }}
      >{glyph}</button>
      {open && (
        <span id={id} role="tooltip" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, width: 'max-content',
          maxWidth: 'min(300px, 70vw)', padding: '8px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.45,
          textTransform: 'none', letterSpacing: 'normal', fontWeight: 400, textAlign: 'left',
          color: 'var(--hx-text, #e6edf3)', background: 'var(--hx-bg-2, #0b1622)',
          border: '1px solid var(--hx-line, #2a3b47)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
          whiteSpace: 'normal', pointerEvents: 'none',
        }}>
          {title && <strong style={{ display: 'block', marginBottom: 3, color: 'var(--hx-gold-2, #f0e6d2)', fontSize: 12 }}>{title}</strong>}
          {tip}
        </span>
      )}
    </span>
  );
}
