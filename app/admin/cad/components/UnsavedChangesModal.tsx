'use client';
// app/admin/cad/components/UnsavedChangesModal.tsx
//
// In-app "you have unsaved changes" confirmation. Rendered once in
// CADLayout and driven by `useUnsavedGuardStore`. Any discard action
// (New Drawing, Open / Import another file, leaving the CAD page)
// routes through `requestDiscard(action)`; when the drawing is dirty
// this modal asks the surveyor to Save → continue, Discard → continue,
// or Cancel.
//
// Save choreography: clicking Save dispatches `cad:saveDocument`
// (the MenuBar's one-click Save — silent re-save to the last target,
// or the Save dialog on first save) and hides this modal while
// keeping the pending action alive. A watcher resumes the pending
// action as soon as the save clears the drawing's dirty flag, so the
// surveyor's New / Open / Import continues automatically once saved.

import { useEffect, useRef } from 'react';
import { AlertTriangle, Save, X } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import { useUnsavedGuardStore } from '../hooks/useUnsavedChangesGuard';

/** Safety valve: if a save never completes (e.g. the surveyor cancels
 *  the first-time Save dialog) the pending action is dropped after
 *  this long so it can never fire against a later, unrelated save. */
const SAVE_WATCH_TIMEOUT_MS = 90_000;

export default function UnsavedChangesModal() {
  const isOpen = useUnsavedGuardStore((s) => s.isOpen);
  const awaitingSave = useUnsavedGuardStore((s) => s.awaitingSave);
  const beginSave = useUnsavedGuardStore((s) => s.beginSave);
  const proceedWithoutSaving = useUnsavedGuardStore((s) => s.proceedWithoutSaving);
  const cancel = useUnsavedGuardStore((s) => s.cancel);
  const reset = useUnsavedGuardStore((s) => s.reset);

  const isDirty = useDrawingStore((s) => s.isDirty);
  const docName = useDrawingStore((s) => s.document.name);

  // Resume the pending action once a Save-in-flight clears the dirty
  // flag. `proceedWithoutSaving` is reused here: it simply runs the
  // pending action + resets — exactly what we want post-save.
  useEffect(() => {
    if (awaitingSave && !isDirty) {
      useUnsavedGuardStore.getState().proceedWithoutSaving();
    }
  }, [awaitingSave, isDirty]);

  // Drop a stuck Save-watch (cancelled save dialog, failed save) so a
  // later unrelated save can't trigger the stale pending action.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!awaitingSave) return;
    timerRef.current = setTimeout(() => reset(), SAVE_WATCH_TIMEOUT_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [awaitingSave, reset]);

  if (!isOpen) return null;

  const onSave = () => {
    beginSave();
    window.dispatchEvent(new CustomEvent('cad:saveDocument'));
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60"
      onClick={cancel}
      data-testid="unsaved-changes-modal"
    >
      <div
        className="w-full max-w-md mx-4 rounded-lg border border-gray-700 bg-gray-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <AlertTriangle size={22} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 id="unsaved-changes-title" className="text-gray-100 font-semibold text-base">
              Save changes to{docName ? ` “${docName}”` : ' this drawing'}?
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              You have unsaved changes. Save them before continuing, or
              discard them and continue anyway.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 mt-2">
          <button
            type="button"
            onClick={cancel}
            className="px-3 py-1.5 text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-700 rounded transition-colors"
            data-testid="unsaved-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={proceedWithoutSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-300 hover:text-white hover:bg-red-700/60 border border-red-700/50 rounded transition-colors"
            data-testid="unsaved-discard"
          >
            <X size={14} />
            Don&apos;t Save
          </button>
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            data-testid="unsaved-save"
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
