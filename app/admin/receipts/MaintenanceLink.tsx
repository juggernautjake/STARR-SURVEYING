'use client';
// app/admin/receipts/MaintenanceLink.tsx — linking a receipt to a maintenance event.
//
// Lifted out of app/admin/receipts/page.tsx for platform audit item 18 ("page-size outliers …
// painful to restyle or hand off": receipts was 2,285 lines). Moved verbatim — the picker, its
// state chip and its styles are one feature and were already self-contained; only the imports and
// the exports are new.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';

export interface PickerEvent {
  id: string;
  summary: string;
  kind: string;
  state: string;
  scheduled_for: string | null;
  equipment_inventory_id: string | null;
  equipment_name: string | null;
}

export function MaintenancePicker({
  receiptId,
  receiptVendor,
  alreadyLinkedIds,
  onClose,
  onLinked,
}: {
  receiptId: string;
  receiptVendor: string | null;
  alreadyLinkedIds: string[];
  onClose: () => void;
  onLinked: (summary: string) => Promise<void>;
}) {
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<PickerEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const linkedSet = useMemo(
    () => new Set(alreadyLinkedIds),
    [alreadyLinkedIds]
  );

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (!includeCompleted) params.set('open_only', 'true');
      params.set('limit', '100');
      const res = await fetch(`/api/admin/maintenance/events?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `request failed: ${res.status}`);
      }
      setEvents((json.events ?? []) as PickerEvent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [includeCompleted]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const filtered = useMemo(() => {
    if (!events) return [];
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return events;
    return events.filter((e) =>
      [e.summary, e.kind, e.state, e.equipment_name]
        .filter((v): v is string => !!v)
        .join(' ')
        .toLowerCase()
        .includes(trimmed)
    );
  }, [events, search]);

  async function handleLink(ev: PickerEvent) {
    setSubmitting(ev.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/maintenance/events/${ev.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linked_receipt_id: receiptId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `request failed: ${res.status}`);
      }
      await onLinked(ev.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div style={pickerStyles.backdrop} onClick={onClose}>
      <div
        style={pickerStyles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header style={pickerStyles.header}>
          <h2 style={pickerStyles.title}>
            Link receipt to maintenance event
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={pickerStyles.close}
            aria-label="Close"
            disabled={submitting !== null}
          >
            <X size={15} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </header>
        <div style={pickerStyles.body}>
          <p style={pickerStyles.copy}>
            Pick a maintenance event to attach{' '}
            {receiptVendor ? <strong>{receiptVendor}</strong> : 'this receipt'}{' '}
            to. The link writes to the event&apos;s{' '}
            <code style={pickerStyles.code}>linked_receipt_id</code> field
            so the §5.12.10 acquisition path doesn&apos;t double-count
            the dollars at depreciation time.
          </p>

          <div style={pickerStyles.toolbar}>
            <input
              type="text"
              placeholder="Search summary / kind / equipment…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...pickerStyles.input, flex: 1 }}
              disabled={loading || submitting !== null}
            />
            <label style={pickerStyles.checkboxRow}>
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(e) => setIncludeCompleted(e.target.checked)}
                disabled={loading || submitting !== null}
              />
              Include completed
            </label>
          </div>

          {error ? <div style={{ ...pickerStyles.error, display: "inline-flex", alignItems: "center", gap: "0.4rem" }}><AlertTriangle size={14} strokeWidth={2} /> {error}</div> : null}

          {loading ? (
            <div style={pickerStyles.loadingHint}>Loading events…</div>
          ) : filtered.length === 0 ? (
            <div style={pickerStyles.loadingHint}>
              No maintenance events match. Adjust the search or include
              completed events.
            </div>
          ) : (
            <ul style={pickerStyles.list}>
              {filtered.slice(0, 50).map((e) => {
                const alreadyLinked = linkedSet.has(e.id);
                return (
                  <li key={e.id} style={pickerStyles.item}>
                    <button
                      type="button"
                      onClick={() => handleLink(e)}
                      disabled={
                        submitting !== null || alreadyLinked
                      }
                      style={{
                        ...pickerStyles.itemBtn,
                        ...(alreadyLinked ? pickerStyles.itemLinked : {}),
                      }}
                    >
                      <div style={pickerStyles.itemTopRow}>
                        <strong style={pickerStyles.itemEquip}>
                          {e.equipment_name ?? '(no equipment)'}
                        </strong>
                        <span style={maintLinkStateChip(e.state)}>
                          {e.state.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div style={pickerStyles.itemSummary}>
                        {e.summary}
                      </div>
                      <div style={pickerStyles.itemMeta}>
                        <span style={pickerStyles.itemKindChip}>
                          {e.kind}
                        </span>
                        <span style={pickerStyles.itemDate}>
                          {e.scheduled_for
                            ? e.scheduled_for.slice(0, 10)
                            : 'no schedule'}
                        </span>
                        {alreadyLinked ? (
                          <span style={pickerStyles.itemLinkedBadge}>
                            already linked
                          </span>
                        ) : null}
                        {submitting === e.id ? (
                          <span style={pickerStyles.itemBusy}>
                            linking…
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {filtered.length > 50 ? (
            <div style={pickerStyles.loadingHint}>
              Showing 50 of {filtered.length}. Refine the search to
              narrow down.
            </div>
          ) : null}
        </div>
        <footer style={pickerStyles.footer}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting !== null}
            style={pickerStyles.cancelBtn}
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}

export function maintLinkStateChip(state: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    scheduled: { background: 'var(--color-info-surface)', color: 'var(--color-info-text)' },
    in_progress: { background: 'var(--color-brand-navy)', color: 'var(--color-text-on-brand)' },
    awaiting_parts: { background: 'var(--color-warning-surface)', color: 'var(--color-warning-text)' },
    awaiting_vendor: { background: 'var(--color-warning-surface)', color: 'var(--color-warning-text)' },
    complete: { background: 'var(--color-success-surface)', color: 'var(--color-success-text)' },
    failed_qa: { background: 'var(--color-error-surface)', color: 'var(--color-error-text)' },
    cancelled: { background: 'var(--color-bg-subtle)', color: 'var(--color-text-tertiary)' },
  };
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    ...(map[state] ?? { background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }),
  };
}

export const maintLinkStyles: Record<string, React.CSSProperties> = {
  panel: {
    marginTop: 12,
    padding: 12,
    background: 'var(--color-info-surface)',
    border: '1px solid var(--color-info-text)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap' as const,
  },
  title: {
    color: 'var(--color-brand-navy)',
    fontSize: 13,
  },
  linkBtn: {
    background: 'var(--color-brand-navy)',
    color: 'var(--color-text-on-brand)',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  emptyHint: {
    margin: 0,
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    fontStyle: 'italic' as const,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-info-text)',
    borderRadius: 6,
    padding: '6px 10px',
  },
  itemLink: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '180px 100px 100px 1fr',
    alignItems: 'center',
    gap: 12,
    color: 'var(--color-text-primary)',
    textDecoration: 'none',
    fontSize: 12,
  },
  itemEquip: {
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  itemKindChip: {
    background: 'var(--color-bg-subtle)',
    padding: '1px 8px',
    borderRadius: 4,
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    textTransform: 'capitalize' as const,
    justifySelf: 'start' as const,
  },
  itemSummary: {
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  itemDetachBtn: {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-error-text)',
    color: 'var(--color-error-text)',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
  },
  msg: {
    fontSize: 11,
    color: 'var(--color-brand-navy)',
    fontStyle: 'italic' as const,
    paddingTop: 4,
  },
};

export const pickerStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.5)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 60,
    zIndex: 1000,
  },
  modal: {
    background: 'var(--color-bg-card)',
    borderRadius: 12,
    width: '100%',
    maxWidth: 720,
    maxHeight: 'calc(100vh - 120px)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid var(--color-border)',
  },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  body: {
    padding: 20,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  copy: { margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: 'var(--color-bg-subtle)',
    padding: '1px 6px',
    borderRadius: 4,
    margin: '0 2px',
  },
  toolbar: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  input: {
    padding: '8px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  checkboxRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
  },
  loadingHint: {
    padding: '14px 4px',
    fontSize: 12,
    color: 'var(--color-text-tertiary)',
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    maxHeight: 360,
    overflowY: 'auto' as const,
  },
  item: { width: '100%' },
  itemBtn: {
    width: '100%',
    textAlign: 'left' as const,
    padding: '10px 12px',
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  itemLinked: {
    background: 'var(--color-info-surface)',
    borderColor: 'var(--color-brand-navy)',
    cursor: 'default' as const,
  },
  itemTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemEquip: {
    color: 'var(--color-text-primary)',
    fontSize: 13,
  },
  itemSummary: {
    color: 'var(--color-text-secondary)',
    fontSize: 12,
  },
  itemMeta: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    alignItems: 'center',
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
  },
  itemKindChip: {
    background: 'var(--color-bg-subtle)',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    textTransform: 'capitalize' as const,
  },
  itemDate: {
    fontFamily: 'Menlo, monospace',
    color: 'var(--color-text-tertiary)',
  },
  itemLinkedBadge: {
    background: 'var(--color-brand-navy)',
    color: 'var(--color-text-on-brand)',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  itemBusy: {
    color: 'var(--color-brand-navy)',
    fontStyle: 'italic' as const,
  },
  error: {
    background: 'var(--color-error-bg)',
    border: '1px solid var(--color-error-text)',
    color: 'var(--color-error-text)',
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '12px 20px',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-bg-app)',
    borderRadius: '0 0 12px 12px',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--color-text-secondary)',
  },
};
