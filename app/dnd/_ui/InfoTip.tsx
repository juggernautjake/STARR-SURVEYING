// app/dnd/_ui/InfoTip.tsx — a small, accessible inline help tip (Phase V, Slice 9).
//
// A "ⓘ" affordance next to a field or control; hover or focus/click reveals a short
// explanation pulled from the builder help catalog (or passed directly). Keeps the
// builder surfaces uncluttered while making thorough help one tap away.
'use client';

import { useState } from 'react';
import { BUILDER_HELP, type BuilderHelpKey } from '@/lib/dnd/builder-help';

export default function InfoTip({ topic, title, body }: { topic?: BuilderHelpKey; title?: string; body?: string }) {
  const [open, setOpen] = useState(false);
  const entry = topic ? BUILDER_HELP[topic] : undefined;
  const t = title ?? entry?.title ?? 'Help';
  const b = body ?? entry?.body ?? '';
  if (!b) return null;

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={`Help: ${t}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        style={{
          width: 16,
          height: 16,
          lineHeight: '14px',
          fontSize: 11,
          borderRadius: '50%',
          border: '1px solid var(--hx-line, rgba(200,170,110,0.4))',
          background: 'rgba(10,200,185,0.08)',
          color: 'var(--hx-teal-1, #0ac8b9)',
          cursor: 'help',
          padding: 0,
        }}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 6px)',
            left: 0,
            width: 'min(280px, 70vw)',
            padding: '9px 11px',
            fontSize: 12,
            lineHeight: 1.45,
            color: 'var(--hx-text, #cdd9e5)',
            background: 'linear-gradient(180deg, rgba(14,30,48,0.99), rgba(6,16,28,0.99))',
            border: '1px solid var(--hx-line, rgba(200,170,110,0.35))',
            borderRadius: 8,
            boxShadow: '0 10px 30px rgba(1,10,19,0.6)',
            textTransform: 'none',
            letterSpacing: 'normal',
            fontWeight: 400,
            whiteSpace: 'normal',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 3, color: 'var(--hx-gold-2, #f0e6d2)', fontSize: 12 }}>{t}</strong>
          {b}
        </span>
      )}
    </span>
  );
}
