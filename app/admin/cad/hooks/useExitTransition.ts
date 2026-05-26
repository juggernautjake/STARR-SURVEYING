'use client';
// app/admin/cad/hooks/useExitTransition.ts
//
// §17a — smooth destruct: a dialog/overlay plays an exit transition
// before the parent unmounts it. `requestClose` flips `closing` (so the
// component can apply fade/scale-out classes) and calls the real
// `onClose` after `ms`. Honor prefers-reduced-motion by closing
// immediately.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §12/§17a

import { useCallback, useState } from 'react';

export function useExitTransition(onClose: () => void, ms = 150) {
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    if (closing) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, ms);
  }, [onClose, ms, closing]);

  return { closing, requestClose };
}
