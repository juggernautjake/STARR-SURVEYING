'use client';
// app/admin/cad/components/RecentRecoveriesDialog.tsx
//
// Phase 7 §16 — recent crash-recoveries picker. Reads every
// keyed autosave slot via `listAutosaves()` and surfaces them
// in a modal with Restore / Discard buttons. The mount-time
// recovery prompt only checks the active drawing's slot;
// this dialog covers the "I closed the tab on drawing B and
// reopened drawing A" case where another job's autosave is
// still sitting around.

import { useEffect, useState } from 'react';

import {
  clearAutosave,
  listAutosaves,
  readAutosave,
  type AutosaveListEntry,
} from '@/lib/cad/persistence/autosave';
import { useDrawingStore, useSelectionStore, useUndoStore } from '@/lib/cad/store';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import { cadLog } from '@/lib/cad/logger';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function RecentRecoveriesDialog({ open, onClose }: Props) {
  useEscapeToClose(onClose);
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const undoStore = useUndoStore();
  const [entries, setEntries] = useState<AutosaveListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    void listAutosaves()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? `Could not list autosaves: ${err.message}`
            : 'Could not list autosaves.'
        );
        setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  async function handleRestore(entry: AutosaveListEntry) {
    setBusyDocId(entry.docId);
    setError(null);
    try {
      const payload = await readAutosave(entry.docId);
      if (!payload?.document) {
        setError('Autosave was empty or unreadable.');
        return;
      }
      const doc = validateAndMigrateDocument(payload.document);
      drawingStore.loadDocument(doc);
      selectionStore.deselectAll();
      undoStore.clear();
      cadLog.info(
        'AutoSave',
        `Recovered drawing "${doc.name}" from autosave (${entry.savedAt})`
      );
      setTimeout(
        () => window.dispatchEvent(new CustomEvent('cad:zoomExtents')),
        200
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Recovery failed: ${err.message}`
          : 'Recovery failed (unknown error).'
      );
    } finally {
      setBusyDocId(null);
    }
  }

  async function handleDiscard(entry: AutosaveListEntry) {
    setBusyDocId(entry.docId);
    setError(null);
    try {
      await clearAutosave(entry.docId);
      setEntries((rows) =>
        (rows ?? []).filter((r) => r.docId !== entry.docId)
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `Discard failed: ${err.message}`
          : 'Discard failed (unknown error).'
      );
    } finally {
      setBusyDocId(null);
    }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Recent crash recoveries"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={styles.header}>
          <h2 style={styles.title}>Recent Crash Recoveries</h2>
          <button
            type="button"
            onClick={onClose}
            style={styles.close}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div style={styles.body}>
          {error ? <div style={styles.error}>{error}</div> : null}

          {entries === null ? (
            <p style={styles.empty}>Loading…</p>
          ) : entries.length === 0 ? (
            <p style={styles.empty}>
              No autosave snapshots in storage. The latest manual save of
              every drawing has cleared its crash-recovery slot.
            </p>
          ) : (
            <ul style={styles.list}>
              {entries.map((entry) => {
                const isCurrent =
                  entry.docId === drawingStore.document.id;
                const busy = busyDocId === entry.docId;
                return (
                  <li key={entry.docId} style={styles.row}>
                    <div style={styles.rowMain}>
                      <strong style={styles.rowTitle}>
                        {entry.docName ?? '(untitled drawing)'}
                      </strong>
                      <span style={styles.rowMeta}>
                        Auto-saved {formatRelative(entry.savedAt)}
                        {isCurrent ? ' · this drawing' : ''}
                      </span>
                    </div>
                    <div style={styles.rowActions}>
                      <button
                        type="button"
                        onClick={() => void handleDiscard(entry)}
                        disabled={busy}
                        style={busy ? styles.btnGhostDisabled : styles.btnGhost}
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRestore(entry)}
                        disabled={busy}
                        style={
                          busy ? styles.btnPrimaryDisabled : styles.btnPrimary
                        }
                      >
                        {busy ? 'Working…' : 'Restore'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hr ago`;
  return new Date(iso).toLocaleString();
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 80,
    zIndex: 1100,
  },
  modal: {
    background: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 560,
    maxHeight: 'calc(100vh - 160px)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 16, fontWeight: 600, margin: 0, color: '#111827' },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  body: { padding: 20, overflowY: 'auto' },
  error: {
    padding: 8,
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 12,
  },
  empty: {
    margin: 0,
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, color: '#111827', display: 'block' },
  rowMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  rowActions: { display: 'flex', gap: 6 },
  btnGhost: {
    background: 'transparent',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    color: '#475569',
    cursor: 'pointer',
  },
  btnGhostDisabled: {
    background: 'transparent',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    color: '#9CA3AF',
    cursor: 'not-allowed',
  },
  btnPrimary: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnPrimaryDisabled: {
    background: '#94A3B8',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
};
