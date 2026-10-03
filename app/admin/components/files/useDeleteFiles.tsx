'use client';
// app/admin/components/files/useDeleteFiles.tsx — the one delete flow every file list uses.
//
// Owner, 2026-09-27: *"Please make sure with the view and download buttons that there is a delete
// button as well … delete groups of images."*
//
//   const del = useDeleteFiles({ onDone: reload });
//   <button onClick={() => del.request([{ kind: 'job_file', id, name }])}>Delete</button>
//   {del.element}
//
// 1. CONFIRM — a dialog naming the file(s) and the count, and saying plainly whether they can be
//    recovered (Recently deleted / Undo) or are gone for good. Cancel has focus; Esc cancels.
// 2. DELETE — one call to /api/admin/files/bulk-delete; the server checks permission per item.
// 3. REPORT — a toast: "Deleted 3 files" with UNDO for ~10 s when the files can come back, and the
//    names of any that could not be deleted, and why. A partial failure is never reported as success.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { RESTORABLE_KINDS, type DeleteKind, type ItemResult } from '@/lib/files/bulk-delete';
import { namesForConfirm } from '@/lib/files/selection';
import './DeleteFiles.css';

export interface DeletableItem {
  kind: DeleteKind;
  id: string;
  name: string;
}

interface Toast {
  id: number;
  tone: 'ok' | 'error';
  message: string;
  failures: ItemResult[];
  undo: DeletableItem[];
}

export const UNDO_WINDOW_MS = 10_000;

async function call(path: 'bulk-delete' | 'bulk-restore', items: DeletableItem[]): Promise<{ results: ItemResult[]; message: string }> {
  const res = await fetch(`/api/admin/files/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets: items.map(({ kind, id }) => ({ kind, id })) }),
  });
  const json = await res.json().catch(() => ({})) as { results?: ItemResult[]; message?: string; error?: string };
  if (!json.results) {
    // The whole request failed (401, 400, network): every item failed for the same reason.
    const error = json.error ?? `HTTP ${res.status}`;
    return { results: items.map((i) => ({ kind: i.kind, id: i.id, ok: false, name: i.name, status: res.status, error })), message: error };
  }
  return { results: json.results, message: json.message ?? '' };
}

export function useDeleteFiles(opts: {
  /** After a delete or an undo lands — reload the list. Gets the ids that actually went / came back. */
  onDone?: (change: { deleted: string[]; restored: string[] }) => void;
} = {}) {
  const [pending, setPending] = useState<DeletableItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const onDoneRef = useRef(opts.onDone);
  onDoneRef.current = opts.onDone;
  const toastSeq = useRef(0);

  const request = useCallback((items: DeletableItem[]) => {
    if (items.length > 0) setPending(items);
  }, []);

  const confirm = useCallback(async () => {
    if (!pending) return;
    const items = pending;
    setBusy(true);
    try {
      const { results } = await call('bulk-delete', items);
      const byKey = new Map(items.map((i) => [`${i.kind}:${i.id}`, i]));
      const ok = results.filter((r) => r.ok);
      const failures = results.filter((r) => !r.ok).map((r) => ({ ...r, name: r.name ?? byKey.get(`${r.kind}:${r.id}`)?.name }));
      const undo = ok.filter((r) => r.restorable).map((r) => byKey.get(`${r.kind}:${r.id}`)!).filter(Boolean);
      const noun = (n: number) => (n === 1 ? 'file' : 'files');
      setToast({
        id: ++toastSeq.current,
        tone: failures.length ? 'error' : 'ok',
        message: failures.length === 0
          ? `Deleted ${ok.length} ${noun(ok.length)}.`
          : ok.length === 0
            ? `Could not delete ${failures.length === 1 ? `“${failures[0]!.name}”` : `${failures.length} files`}.`
            : `Deleted ${ok.length} of ${results.length} files.`,
        failures,
        undo,
      });
      if (ok.length) onDoneRef.current?.({ deleted: ok.map((r) => r.id), restored: [] });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }, [pending]);

  const undo = useCallback(async (items: DeletableItem[]) => {
    setToast(null);
    const { results } = await call('bulk-restore', items);
    const ok = results.filter((r) => r.ok);
    const bad = results.filter((r) => !r.ok);
    setToast({
      id: ++toastSeq.current,
      tone: bad.length ? 'error' : 'ok',
      message: bad.length ? `Restored ${ok.length} of ${results.length}. ${bad.map((b) => `${b.name ?? b.id}: ${b.error}`).join('; ')}` : `Restored ${ok.length} ${ok.length === 1 ? 'file' : 'files'}.`,
      failures: [],
      undo: [],
    });
    if (ok.length) onDoneRef.current?.({ deleted: [], restored: ok.map((r) => r.id) });
  }, []);

  // The success toast (and its Undo) goes away on its own; a failure report stays until dismissed.
  useEffect(() => {
    if (!toast || toast.failures.length > 0) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.undo.length ? UNDO_WINDOW_MS : 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const element = (
    <>
      {pending && (
        <ConfirmDeleteDialog items={pending} busy={busy} onCancel={() => !busy && setPending(null)} onConfirm={() => void confirm()} />
      )}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className={`fdel__toast fdel__toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'} data-testid="fdel-toast">
          <div className="fdel__toast-main">
            <span>{toast.message}</span>
            {toast.undo.length > 0 && (
              <button type="button" className="fdel__toast-btn" onClick={() => void undo(toast.undo)} data-testid="fdel-undo">Undo</button>
            )}
            <button type="button" className="fdel__toast-x" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
          </div>
          {toast.failures.length > 0 && (
            <ul className="fdel__toast-list">
              {toast.failures.map((f) => <li key={`${f.kind}:${f.id}`}><strong>{f.name ?? f.id}</strong>: {f.error}</li>)}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </>
  );

  return { request, element, busy };
}

// ── the confirmation ─────────────────────────────────────────────────────────────────────────

export function ConfirmDeleteDialog({ items, busy, onCancel, onConfirm }: {
  items: DeletableItem[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);

  const recoverable = items.filter((i) => RESTORABLE_KINDS.has(i.kind)).length;
  const permanent = items.length - recoverable;
  const { shown, more } = namesForConfirm(items.map((i) => i.name));
  const title = items.length === 1 ? `Delete “${items[0]!.name}”?` : `Delete ${items.length} files?`;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    // Two buttons: keep Tab inside the dialog.
    if (e.key === 'Tab') {
      e.preventDefault();
      (document.activeElement === cancelRef.current ? deleteRef.current : cancelRef.current)?.focus();
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fdel__backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="fdel__dialog" role="alertdialog" aria-modal="true" aria-labelledby="fdel-title" aria-describedby="fdel-body" onKeyDown={onKey} data-testid="fdel-dialog">
        <h2 id="fdel-title" className="fdel__title"><Trash2 size={18} aria-hidden="true" /> {title}</h2>
        <div id="fdel-body" className="fdel__body">
          {items.length > 1 && (
            <ul className="fdel__names">
              {shown.map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}
              {more > 0 && <li className="fdel__more">and {more} more</li>}
            </ul>
          )}
          {permanent === 0 ? (
            // Only File Explorer documents have a bin ("Recently deleted", emptied after 30 days); a
            // job file's soft delete has Undo but no bin view yet — so the promise is kind-exact.
            <p>
              {items.length === 1 ? 'It' : 'They'} can be brought back with <strong>Undo</strong> right after
              {items.every((i) => i.kind === 'file_node') ? ', or from Recently deleted in Files for 30 days.' : '.'}
            </p>
          ) : recoverable === 0 ? (
            <p className="fdel__warn"><strong>This permanently deletes {items.length === 1 ? 'the file' : `all ${items.length} files`}.</strong> It cannot be undone.</p>
          ) : (
            <p className="fdel__warn">{recoverable} can be undone afterwards; <strong>{permanent} will be deleted permanently</strong> and cannot be recovered.</p>
          )}
        </div>
        <div className="fdel__actions">
          <button ref={cancelRef} type="button" className="fdel__btn" onClick={onCancel} disabled={busy} data-testid="fdel-cancel">Cancel</button>
          <button ref={deleteRef} type="button" className="fdel__btn fdel__btn--danger" onClick={onConfirm} disabled={busy} data-testid="fdel-confirm">
            {busy ? 'Deleting…' : items.length === 1 ? 'Delete' : `Delete ${items.length} files`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
