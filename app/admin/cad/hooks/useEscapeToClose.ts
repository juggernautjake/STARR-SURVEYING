'use client';
// app/admin/cad/hooks/useEscapeToClose.ts
//
// Phase 8 §10.4 — shared "Esc closes the dialog" behaviour.
// The CAD app has 13+ modal dialogs (Settings, Properties,
// Print, Import, Save-to-DB, RPLS submission, etc.) that
// previously only closed via the X button or backdrop click.
// Surveyors expect Esc to dismiss any modal — this hook
// gives every dialog the same hook-up in one line.
//
// Usage inside a dialog component:
//
//   useEscapeToClose(onClose);
//
// Disable by passing `false` as the second arg (rare —
// useful when the dialog has its own Esc handling that
// conflicts).

import { useEffect } from 'react';

export function useEscapeToClose(
  onClose: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enabled]);
}
