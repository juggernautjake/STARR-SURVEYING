'use client';
// app/admin/cad/hooks/useUnsavedChangesGuard.ts
// Registers a `beforeunload` listener while the drawing is dirty, causing the
// browser to show its native "Leave site?" confirmation dialog when the user
// tries to close the tab, refresh, or navigate away via the address bar.
//
// Also returns a `guard(action)` helper that wraps an arbitrary callback with
// an in-app confirmation modal for programmatic navigation (e.g., "New Drawing"
// while unsaved changes exist).

import { useEffect, useCallback } from 'react';
import { useDrawingStore } from '@/lib/cad/store';

/**
 * Registers a native `beforeunload` guard whenever the drawing has unsaved
 * changes, so the browser will prompt before the user leaves the page.
 *
 * Returns a `guard(action)` function that should wrap any in-app action that
 * would discard the current drawing (e.g., opening a new drawing).  It shows
 * `window.confirm` if the drawing is dirty, and only calls `action` if the
 * user confirms (or the drawing is already clean).
 */
export function useUnsavedChangesGuard() {
  const isDirty = useDrawingStore((s) => s.isDirty);

  // Attach / detach the native beforeunload listener based on dirty state
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      // Modern browsers require both returnValue and preventDefault
      e.preventDefault();
      // Legacy browsers show e.returnValue as the message
      e.returnValue = 'You have unsaved changes. Leave anyway?';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  /**
   * Wrap an in-app destructive action with a confirmation dialog.
   *
   * @example
   * guard(() => drawingStore.newDocument());
   */
  const guard = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action();
        return;
      }
      const ok = window.confirm(
        'You have unsaved changes. Do you want to continue without saving?\n\n' +
        'Your drawing will be lost unless you save it first (File → Save or Ctrl+S).',
      );
      if (ok) action();
    },
    [isDirty],
  );

  return { guard, isDirty };
}
