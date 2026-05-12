'use client';
// app/admin/research/components/ConfirmDialog.tsx
//
// Single shared confirmation dialog for /admin/research/**.
//
// The workspace had 14 different `window.confirm(...)` calls
// scattered across the project hub + canvas + template editor.
// Mixing the OS dialog with the styled `.research-modal` for
// destructive operations made archive / delete / revert / leave-
// with-changes feel inconsistent — some flows showed a styled
// red button, others fell back to the browser's plain blue OK.
//
// This file exposes a singleton imperative API:
//
//   import { confirm } from './ConfirmDialog';
//   const ok = await confirm({
//     title: 'Archive project',
//     body: 'It will be hidden but can be recovered.',
//     confirmLabel: 'Archive',
//     tone: 'danger',
//   });
//   if (!ok) return;
//
// A `<ConfirmDialogHost />` must be mounted once at the layout
// level (research/layout.tsx) so the dialog has a render target.

import { useEffect, useState } from 'react';

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` swaps the primary button to red; `default` keeps
   *  the standard accent blue. */
  tone?: 'default' | 'danger';
}

interface PendingState extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

// Module-level pending state + subscription list. Lets the
// `confirm(...)` call invoke from anywhere without React
// context. The host component subscribes in a useEffect.
let pending: PendingState | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/**
 * Open a confirmation dialog. Resolves to `true` when the
 * surveyor confirms, `false` on cancel / Escape / backdrop
 * click. Safe to call before the host mounts — the call will
 * queue and resolve once the host renders the next dialog.
 */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    pending = { ...request, resolve };
    notify();
  });
}

/**
 * Host component. Mount exactly once in research/layout.tsx.
 * Listens for `confirm()` calls and renders the modal.
 */
export function ConfirmDialogHost() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  // Re-read on each render so module-level mutations from
  // `confirm()` surface here.
  void version;
  const active = pending;
  const isDanger = active?.tone === 'danger';
  const confirmLabel = active?.confirmLabel ?? 'Confirm';
  const cancelLabel = active?.cancelLabel ?? 'Cancel';

  function close(result: boolean) {
    if (!pending) return;
    const r = pending.resolve;
    pending = null;
    notify();
    r(result);
  }

  // Esc → cancel.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="research-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) close(false); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="research-confirm-title"
    >
      <div className="research-modal research-confirm">
        <h2 id="research-confirm-title" className="research-confirm__title">
          {active.title}
        </h2>
        {active.body && <p className="research-confirm__body">{active.body}</p>}
        <div className="research-modal__actions research-confirm__actions">
          <button
            type="button"
            className="research-confirm__cancel"
            onClick={() => close(false)}
            autoFocus={!isDanger}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`research-confirm__confirm${isDanger ? ' research-confirm__confirm--danger' : ''}`}
            onClick={() => close(true)}
            autoFocus={isDanger ? false : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
