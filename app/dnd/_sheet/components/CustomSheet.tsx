'use client';
// CustomSheet — renders an AI-built custom character sheet (Phase V, Slice 6).
//
// The sheet's blocks + CSS are composed into a single HTML document (lib/dnd/custom-sheet)
// and rendered inside a locked-down `sandbox`ed <iframe srcdoc> — no scripts, no
// same-origin, no forms — exactly like the map tools render untrusted label HTML. So an
// AI-authored (or malformed) sheet can render freely without ever executing code or
// reaching the app around it. If there are no valid blocks, this renders nothing and the
// caller falls back to the standard engine.
import { useMemo } from 'react';
import { composeCustomSheet, hasCustomLayout } from '@/lib/dnd/custom-sheet';

export default function CustomSheet({
  layout,
  css,
  minHeight = 900,
}: {
  layout: unknown;
  css?: string | null;
  /** The iframe can't self-size (no scripts in the sandbox), so it gets a generous
   *  height and scrolls internally. */
  minHeight?: number;
}) {
  const srcdoc = useMemo(() => composeCustomSheet(layout, css), [layout, css]);
  if (!hasCustomLayout(layout)) return null;

  return (
    <div
      className="dnd-custom-sheet"
      style={{
        border: '1px solid var(--hx-line, #1e3a52)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'linear-gradient(180deg,#0a1428,#081424)',
        boxShadow: '0 0 24px rgba(10,200,185,0.08)',
      }}
    >
      <iframe
        // Bare `sandbox` = maximum lockdown: no script execution, no same-origin access,
        // no form submission. The AI's HTML/CSS is inert content only.
        sandbox=""
        srcDoc={srcdoc}
        title="Character sheet"
        style={{ width: '100%', height: minHeight, border: 0, display: 'block', background: 'transparent' }}
      />
    </div>
  );
}
