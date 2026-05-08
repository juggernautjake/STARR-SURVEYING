'use client';
// app/admin/cad/components/ConfirmDialog.tsx — Phase 8 §10.4
//
// Reusable confirmation modal for destructive actions
// (delete, erase, discard, etc.). The component is mounted
// once globally; callers fire `confirmAction(opts)` which
// returns a Promise<boolean> so the caller can await the
// surveyor's choice without managing modal state.
//
// Pattern is event-driven so any module can request a
// confirmation without prop-drilling a dialog handle through
// every panel. The promise resolver is held in module scope
// — at most one confirm dialog is open at a time, which is
// the surveyor expectation anyway.

import { useEffect, useState } from 'react';

export interface ConfirmOpts {
  /** Short title at the top of the modal. */
  title: string;
  /** One- or two-sentence description of what the action will do. */
  message: string;
  /** Label on the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label on the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** When true, the confirm button is rendered in a destructive (red) style. */
  danger?: boolean;
}

let pendingResolver: ((confirmed: boolean) => void) | null = null;

/**
 * Open the confirm dialog with the given options. Returns a
 * Promise that resolves to `true` when the surveyor presses
 * the confirm button (or hits Enter), or `false` for cancel
 * (or Escape, or backdrop click).
 *
 * If a previous confirm is still pending when this is called
 * we resolve it as `false` first so the caller doesn't leak
 * a dangling promise.
 */
export function confirmAction(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    if (pendingResolver) {
      pendingResolver(false);
      pendingResolver = null;
    }
    pendingResolver = resolve;
    window.dispatchEvent(new CustomEvent('cad:openConfirmDialog', { detail: opts }));
  });
}

export default function ConfirmDialog() {
  const [state, setState] = useState<ConfirmOpts | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<ConfirmOpts>).detail;
      setState(detail);
    };
    window.addEventListener('cad:openConfirmDialog', onOpen as EventListener);
    return () => window.removeEventListener('cad:openConfirmDialog', onOpen as EventListener);
  }, []);

  // Keyboard shortcuts — Enter confirms, Esc cancels.
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function confirm() {
    pendingResolver?.(true);
    pendingResolver = null;
    setState(null);
  }
  function cancel() {
    pendingResolver?.(false);
    pendingResolver = null;
    setState(null);
  }

  if (!state) return null;

  const danger = state.danger ?? false;
  const confirmBtnClass = danger
    ? 'bg-red-700 border-red-600 hover:bg-red-600'
    : 'bg-blue-700 border-blue-600 hover:bg-blue-600';

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 animate-[fadeIn_120ms_ease-out]"
      onClick={cancel}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[420px] max-w-[90vw] overflow-hidden animate-[scaleIn_150ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 id="confirm-dialog-title" className="text-sm text-white font-semibold">
            {state.title}
          </h2>
        </div>
        <div className="px-4 py-3 text-xs text-gray-300 leading-relaxed">
          {state.message}
        </div>
        <div className="px-4 py-3 flex items-center justify-end gap-2 border-t border-gray-700 bg-gray-900/50">
          <button
            type="button"
            className="px-3 h-7 rounded text-[12px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
            onClick={cancel}
            autoFocus={!danger}
          >
            {state.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={`px-3 h-7 rounded text-[12px] border text-white transition-colors ${confirmBtnClass}`}
            onClick={confirm}
            autoFocus={danger}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
