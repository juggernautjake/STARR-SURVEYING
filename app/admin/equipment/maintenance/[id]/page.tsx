// app/admin/equipment/maintenance/[id]/page.tsx — §5.12.7.4 (F10.7-g-ii-α)
//
// Read-only per-event detail page consuming the F10.7-g-i
// detail endpoint at GET /api/admin/maintenance/events/[id].
// Renders header + detail body + documents list. State-
// transition controls + editable fields + documents upload
// land in F10.7-g-ii-β / -γ / -δ as separate batches.
//
// Auth: useSession sign-in gate; the detail endpoint enforces
// EQUIPMENT_ROLES server-side.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../../hooks/usePageError';

interface MaintenanceEvent {
  id: string;
  equipment_inventory_id: string | null;
  vehicle_id: string | null;
  kind: string;
  origin: string;
  state: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  expected_back_at: string | null;
  vendor_name: string | null;
  vendor_contact: string | null;
  vendor_work_order: string | null;
  performed_by_user_id: string | null;
  cost_cents: number | null;
  linked_receipt_id: string | null;
  summary: string;
  notes: string | null;
  qa_passed: boolean | null;
  next_due_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  // Joined display fields
  equipment: {
    id: string;
    name: string | null;
    category: string | null;
    item_kind: string | null;
    qr_code_id: string | null;
  } | null;
  vehicle: { id: string; name: string | null } | null;
  created_by_label: string | null;
  performed_by_label: string | null;
}

interface MaintenanceDocument {
  id: string;
  kind: string;
  storage_url: string;
  filename: string | null;
  size_bytes: number | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_by_label: string | null;
  uploaded_at: string;
}

interface DetailResponse {
  event: MaintenanceEvent;
  documents: MaintenanceDocument[];
}

// F10.7-g-ii-β — state-transition adjacency mirrors the
// PATCH route's TRANSITIONS table from F10.7-c-ii. Keeping
// it server-side-of-record means the UI can pre-emptively
// hide impossible buttons; the PATCH still re-validates.
const ADJACENCY: Record<string, string[]> = {
  scheduled: [
    'in_progress',
    'awaiting_parts',
    'awaiting_vendor',
    'complete',
    'cancelled',
  ],
  in_progress: [
    'awaiting_parts',
    'awaiting_vendor',
    'complete',
    'failed_qa',
    'cancelled',
  ],
  awaiting_parts: [
    'in_progress',
    'awaiting_vendor',
    'complete',
    'cancelled',
  ],
  awaiting_vendor: [
    'in_progress',
    'awaiting_parts',
    'complete',
    'failed_qa',
    'cancelled',
  ],
  failed_qa: ['in_progress', 'cancelled'],
  complete: [], // terminal; reopen route handled separately
  cancelled: [], // terminal
};

type TerminalKind = 'complete' | 'cancelled' | 'failed_qa';
const TERMINAL_STATES = new Set<TerminalKind>([
  'complete',
  'cancelled',
  'failed_qa',
]);

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatCurrency(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MaintenanceEventDetailPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { safeFetch } = usePageError('MaintenanceEventDetailPage');

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // F10.7-g-ii-β — state-transition modal target.
  const [transitionTarget, setTransitionTarget] = useState<{
    state: string;
    isReopen: boolean;
  } | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await safeFetch<DetailResponse>(
      `/api/admin/maintenance/events/${id}`
    );
    setLoading(false);
    if (res) setData(res);
  }, [id, safeFetch]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }
  if (!id) {
    return (
      <div style={styles.empty}>Missing event id in the URL.</div>
    );
  }
  if (!data) {
    return (
      <div style={styles.wrap}>
        <Link href="/admin/equipment/maintenance" style={styles.backLink}>
          ← Back to calendar
        </Link>
        <div style={styles.empty}>
          {loading ? 'Loading…' : 'Event not found or failed to load.'}
        </div>
      </div>
    );
  }

  const { event, documents } = data;
  const equipmentTitle =
    event.equipment?.name ??
    event.vehicle?.name ??
    event.equipment_inventory_id ??
    event.vehicle_id ??
    'Unknown target';

  return (
    <div style={styles.wrap}>
      <Link href="/admin/equipment/maintenance" style={styles.backLink}>
        ← Back to calendar
      </Link>

      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>{equipmentTitle}</h1>
          <div style={styles.headerBadges}>
            <span style={stateBadgeStyle(event.state)}>
              {event.state.replace(/_/g, ' ')}
            </span>
            <span style={kindBadgeStyle()}>{event.kind}</span>
            <span style={originBadgeStyle()}>via {event.origin}</span>
            {event.qa_passed === false ? (
              <span style={styles.qaFailedBadge}>QA failed</span>
            ) : event.qa_passed === true ? (
              <span style={styles.qaPassedBadge}>QA passed</span>
            ) : null}
          </div>
          <p style={styles.summaryLine}>{event.summary}</p>
        </div>
        <div style={styles.editStub}>
          <button type="button" disabled style={styles.disabledBtn}>
            Edit fields (F10.7-g-ii-γ)
          </button>
        </div>
      </header>

      <section style={styles.section}>
        <h2 style={styles.h2}>Transition state</h2>
        <TransitionBar
          state={event.state}
          onTransition={(targetState, isReopen) => {
            setActionMsg(null);
            setTransitionTarget({ state: targetState, isReopen });
          }}
        />
        {actionMsg ? (
          <div style={styles.actionMsg}>{actionMsg}</div>
        ) : null}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Target</h2>
        <DetailRow label="Equipment">
          {event.equipment ? (
            <Link
              href={`/admin/equipment/${event.equipment.id}`}
              style={styles.link}
            >
              {event.equipment.name ?? event.equipment.id.slice(0, 8)}
            </Link>
          ) : (
            <span style={styles.muted}>—</span>
          )}
        </DetailRow>
        <DetailRow label="Vehicle">
          {event.vehicle ? (
            <Link
              href={`/admin/vehicles/${event.vehicle.id}`}
              style={styles.link}
            >
              {event.vehicle.name ?? event.vehicle.id.slice(0, 8)}
            </Link>
          ) : (
            <span style={styles.muted}>—</span>
          )}
        </DetailRow>
        {event.equipment ? (
          <>
            <DetailRow label="Category">
              {event.equipment.category ?? (
                <span style={styles.muted}>—</span>
              )}
            </DetailRow>
            <DetailRow label="Item kind">
              {event.equipment.item_kind ?? (
                <span style={styles.muted}>—</span>
              )}
            </DetailRow>
            <DetailRow label="QR code">
              <code style={styles.code}>
                {event.equipment.qr_code_id ?? '—'}
              </code>
            </DetailRow>
          </>
        ) : null}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Schedule + actuals</h2>
        <DetailRow label="Scheduled for">
          {formatDateTime(event.scheduled_for)}
        </DetailRow>
        <DetailRow label="Started at">
          {formatDateTime(event.started_at)}
        </DetailRow>
        <DetailRow label="Completed at">
          {formatDateTime(event.completed_at)}
        </DetailRow>
        <DetailRow label="Expected back at">
          {formatDateTime(event.expected_back_at)}
        </DetailRow>
        <DetailRow label="Next due at">
          {formatDateTime(event.next_due_at)}
        </DetailRow>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Vendor</h2>
        <DetailRow label="Vendor name">
          {event.vendor_name ?? <span style={styles.muted}>—</span>}
        </DetailRow>
        <DetailRow label="Vendor contact">
          {event.vendor_contact ?? <span style={styles.muted}>—</span>}
        </DetailRow>
        <DetailRow label="Work order">
          {event.vendor_work_order ?? (
            <span style={styles.muted}>—</span>
          )}
        </DetailRow>
        <DetailRow label="Performed by">
          {event.performed_by_label ?? (
            <span style={styles.muted}>—</span>
          )}
        </DetailRow>
        <DetailRow label="Cost">
          {formatCurrency(event.cost_cents)}
        </DetailRow>
        <DetailRow label="Linked receipt">
          {event.linked_receipt_id ? (
            <Link
              href={`/admin/receipts/${event.linked_receipt_id}`}
              style={styles.link}
            >
              {event.linked_receipt_id.slice(0, 8)}
            </Link>
          ) : (
            <span style={styles.muted}>—</span>
          )}
        </DetailRow>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Notes</h2>
        {event.notes ? (
          <div style={styles.notes}>{event.notes}</div>
        ) : (
          <div style={styles.muted}>No notes recorded.</div>
        )}
      </section>

      <section style={styles.section}>
        <header style={styles.docsHeader}>
          <h2 style={styles.h2}>
            Documents{' '}
            <span style={styles.h2Hint}>({documents.length})</span>
          </h2>
          <button type="button" disabled style={styles.disabledBtn}>
            Upload (F10.7-g-ii-δ)
          </button>
        </header>
        {documents.length === 0 ? (
          <div style={styles.muted}>
            No documents attached. F10.7-g-ii-δ adds the upload modal.
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Kind</th>
                <th style={styles.th}>Filename</th>
                <th style={styles.thRight}>Size</th>
                <th style={styles.th}>Description</th>
                <th style={styles.th}>Uploaded by</th>
                <th style={styles.th}>Uploaded at</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td style={styles.td}>
                    <span style={docKindBadgeStyle(doc.kind)}>
                      {doc.kind}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <a
                      href={doc.storage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.link}
                    >
                      {doc.filename ?? '(no filename)'}
                    </a>
                  </td>
                  <td style={styles.tdRight}>
                    {formatBytes(doc.size_bytes)}
                  </td>
                  <td style={styles.td}>
                    {doc.description ?? <span style={styles.muted}>—</span>}
                  </td>
                  <td style={styles.td}>
                    {doc.uploaded_by_label ?? (
                      <span style={styles.muted}>—</span>
                    )}
                  </td>
                  <td style={styles.tdMuted}>
                    {formatDateTime(doc.uploaded_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Audit</h2>
        <DetailRow label="Created">
          {formatDateTime(event.created_at)}
          {event.created_by_label ? ` by ${event.created_by_label}` : ''}
        </DetailRow>
        <DetailRow label="Updated">
          {formatDateTime(event.updated_at)}
        </DetailRow>
        <DetailRow label="Event id">
          <code style={styles.code}>{event.id}</code>
        </DetailRow>
      </section>

      {transitionTarget ? (
        <TransitionModal
          eventId={event.id}
          eventKind={event.kind}
          existingVendorName={event.vendor_name}
          existingPerformedBy={event.performed_by_user_id}
          target={transitionTarget}
          onClose={() => setTransitionTarget(null)}
          onTransitioned={(newState) => {
            setTransitionTarget(null);
            setActionMsg(
              `✓ Moved to ${newState.replace(/_/g, ' ')}.`
            );
            void fetchDetail();
          }}
        />
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.detailRow}>
      <div style={styles.rowLabel}>{label}</div>
      <div style={styles.rowValue}>{children}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// F10.7-g-ii-β — state-transition controls
// ────────────────────────────────────────────────────────────

function TransitionBar({
  state,
  onTransition,
}: {
  state: string;
  onTransition: (targetState: string, isReopen: boolean) => void;
}) {
  const allowed = ADJACENCY[state] ?? [];
  const isComplete = state === 'complete';
  const isCancelled = state === 'cancelled';

  if (isCancelled) {
    return (
      <div style={transitionStyles.bar}>
        <span style={transitionStyles.muted}>
          Cancelled. Terminal — no transitions available.
        </span>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div style={transitionStyles.bar}>
        <span style={transitionStyles.muted}>
          Complete. Re-open to transition again:
        </span>
        <button
          type="button"
          style={transitionStyles.reopenBtn}
          onClick={() => onTransition('in_progress', true)}
        >
          ↺ Re-open
        </button>
      </div>
    );
  }

  if (allowed.length === 0) {
    return (
      <div style={transitionStyles.bar}>
        <span style={transitionStyles.muted}>
          State {state.replace(/_/g, ' ')} has no transitions
          configured.
        </span>
      </div>
    );
  }

  return (
    <div style={transitionStyles.bar}>
      <span style={transitionStyles.muted}>Move to:</span>
      {allowed.map((target) => (
        <button
          key={target}
          type="button"
          style={transitionButtonStyle(target)}
          onClick={() => onTransition(target, false)}
        >
          {target.replace(/_/g, ' ')}
        </button>
      ))}
    </div>
  );
}

function TransitionModal({
  eventId,
  eventKind,
  existingVendorName,
  existingPerformedBy,
  target,
  onClose,
  onTransitioned,
}: {
  eventId: string;
  eventKind: string;
  existingVendorName: string | null;
  existingPerformedBy: string | null;
  target: { state: string; isReopen: boolean };
  onClose: () => void;
  onTransitioned: (newState: string) => void;
}) {
  const { safeFetch } = usePageError('TransitionModal');

  const requiresVendor =
    target.state === 'complete' &&
    eventKind === 'calibration' &&
    !existingVendorName;
  const performedByConflict =
    target.state === 'complete' &&
    eventKind === 'calibration' &&
    !!existingPerformedBy;

  const [vendorName, setVendorName] = useState('');
  const [clearPerformedBy, setClearPerformedBy] = useState(true);
  const [decline_or_failed_reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTerminal = TERMINAL_STATES.has(target.state as TerminalKind);

  const handleConfirm = useCallback(async () => {
    setError(null);
    const body: Record<string, unknown> = {
      state: target.state,
    };
    if (target.isReopen) body.reopen = true;

    if (requiresVendor) {
      const trimmed = vendorName.trim();
      if (!trimmed) {
        setError(
          'Calibration events require vendor_name on completion ' +
            '(NIST traceability).'
        );
        return;
      }
      body.vendor_name = trimmed;
    }
    if (performedByConflict && clearPerformedBy) {
      body.performed_by_user_id = null;
    }
    // Notes for cancelled/failed_qa (terminal context).
    if (
      (target.state === 'cancelled' || target.state === 'failed_qa') &&
      decline_or_failed_reason.trim().length > 0
    ) {
      body.notes = decline_or_failed_reason.trim();
    }

    setSubmitting(true);
    const res = await safeFetch<{
      event?: { state: string };
      error?: string;
    }>(`/api/admin/maintenance/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (res?.event?.state) {
      onTransitioned(res.event.state);
    } else {
      setError(
        res?.error ??
          'Transition failed. Check the error log; the form is unchanged.'
      );
    }
  }, [
    target,
    requiresVendor,
    performedByConflict,
    vendorName,
    clearPerformedBy,
    decline_or_failed_reason,
    safeFetch,
    eventId,
    onTransitioned,
  ]);

  const targetLabel = target.state.replace(/_/g, ' ');
  const title = target.isReopen ? 'Re-open this event?' : `Move to ${targetLabel}?`;

  return (
    <div style={transitionStyles.backdrop} onClick={onClose}>
      <div
        style={transitionStyles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header style={transitionStyles.header}>
          <h2 style={transitionStyles.title}>{title}</h2>
          <button
            type="button"
            style={transitionStyles.close}
            onClick={onClose}
            aria-label="Close"
            disabled={submitting}
          >
            ✕
          </button>
        </header>
        <div style={transitionStyles.body}>
          {target.isReopen ? (
            <p style={transitionStyles.copy}>
              Re-opening clears <code style={transitionStyles.code}>completed_at</code>{' '}
              and <code style={transitionStyles.code}>qa_passed</code> for
              a fresh service-history entry on re-completion. Existing
              vendor + cost fields are preserved.
            </p>
          ) : isTerminal ? (
            <p style={transitionStyles.copy}>
              {target.state === 'complete'
                ? 'Marking complete stamps completed_at = now() and locks the row terminal. Re-open via the dedicated re-open flow if needed.'
                : target.state === 'cancelled'
                ? 'Cancelling locks the row terminal — no further transitions. Drop a note explaining why.'
                : 'Marking failed_qa surfaces the row in the §5.12.7.1 Today red banner. The EM can re-open via in_progress.'}
            </p>
          ) : (
            <p style={transitionStyles.copy}>
              Move state from <strong>current</strong> to{' '}
              <strong>{targetLabel}</strong>.{' '}
              {target.state === 'in_progress'
                ? 'Auto-stamps started_at = now() if not already set.'
                : null}
            </p>
          )}

          {requiresVendor ? (
            <label style={transitionStyles.field}>
              <span style={transitionStyles.label}>
                Vendor name (required for calibration completion) *
              </span>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. Trimble Service Houston"
                style={transitionStyles.input}
                required
                autoFocus
              />
              <span style={transitionStyles.hint}>
                ▸ NIST cert traceability requires a third-party vendor.
                The PATCH route enforces this server-side via the
                <code style={transitionStyles.code}>
                  calibration_requires_vendor
                </code>{' '}
                gate.
              </span>
            </label>
          ) : null}

          {performedByConflict ? (
            <label style={transitionStyles.checkboxRow}>
              <input
                type="checkbox"
                checked={clearPerformedBy}
                onChange={(e) => setClearPerformedBy(e.target.checked)}
              />
              <span>
                <strong>Clear performed_by_user_id</strong>
                <span style={transitionStyles.hint}>
                  {' '}
                  · Calibration completion requires this field be null
                  (NIST cert is third-party only). Untick at your own
                  risk; the PATCH route will refuse with{' '}
                  <code style={transitionStyles.code}>
                    calibration_excludes_performed_by
                  </code>
                  .
                </span>
              </span>
            </label>
          ) : null}

          {(target.state === 'cancelled' ||
            target.state === 'failed_qa') ? (
            <label style={transitionStyles.field}>
              <span style={transitionStyles.label}>
                Notes ({target.state === 'cancelled' ? 'why cancel' : 'QA failure detail'})
              </span>
              <textarea
                value={decline_or_failed_reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ ...transitionStyles.input, minHeight: 60 }}
                placeholder="Optional but encouraged — the audit log keeps this forever."
              />
            </label>
          ) : null}

          {error ? <div style={transitionStyles.error}>⚠ {error}</div> : null}
        </div>
        <footer style={transitionStyles.footer}>
          <button
            type="button"
            style={transitionStyles.secondaryBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            style={
              isTerminal && target.state === 'cancelled'
                ? transitionStyles.dangerBtn
                : isTerminal && target.state === 'failed_qa'
                ? transitionStyles.dangerBtn
                : transitionStyles.primaryBtn
            }
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting
              ? 'Working…'
              : target.isReopen
              ? 'Re-open'
              : `Move to ${targetLabel}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function transitionButtonStyle(target: string): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 12px',
    border: '1px solid #1D3095',
    background: '#FFFFFF',
    color: '#1D3095',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    textTransform: 'capitalize' as const,
  };
  if (target === 'cancelled' || target === 'failed_qa') {
    base.borderColor = '#B91C1C';
    base.color = '#B91C1C';
  } else if (target === 'complete') {
    base.borderColor = '#15803D';
    base.color = '#15803D';
  }
  return base;
}

const transitionStyles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: 8,
  },
  muted: { color: '#6B7280', fontSize: 12, marginRight: 4 },
  reopenBtn: {
    padding: '6px 12px',
    border: '1px solid #1D3095',
    background: '#1D3095',
    color: '#FFFFFF',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
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
    background: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 560,
    maxHeight: 'calc(100vh - 120px)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  body: {
    padding: 20,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  copy: { margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#374151' },
  input: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  hint: { fontSize: 11, color: '#6B7280', fontStyle: 'italic' as const },
  checkboxRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 13,
  },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
    margin: '0 2px',
  },
  error: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '12px 20px',
    borderTop: '1px solid #E2E5EB',
    background: '#FAFBFC',
    borderRadius: '0 0 12px 12px',
  },
  primaryBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  dangerBtn: {
    background: '#B91C1C',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  secondaryBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
};

function stateBadgeStyle(state: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    scheduled: { background: '#DBEAFE', color: '#1E3A8A' },
    in_progress: { background: '#1D3095', color: '#FFFFFF' },
    awaiting_parts: { background: '#FEF3C7', color: '#78350F' },
    awaiting_vendor: { background: '#FEF3C7', color: '#78350F' },
    complete: { background: '#15803D', color: '#FFFFFF' },
    failed_qa: { background: '#FEE2E2', color: '#7F1D1D' },
    cancelled: {
      background: '#FFFFFF',
      color: '#9CA3AF',
      border: '1px dashed #D1D5DB',
    },
  };
  return {
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    ...(map[state] ?? { background: '#F3F4F6', color: '#374151' }),
  };
}

function kindBadgeStyle(): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    background: '#F3F4F6',
    color: '#374151',
  };
}

function originBadgeStyle(): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    color: '#6B7280',
    background: '#FAFBFC',
    border: '1px solid #E2E5EB',
  };
}

function docKindBadgeStyle(kind: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    calibration_cert: { background: '#DBEAFE', color: '#1E3A8A' },
    work_order: { background: '#FEF3C7', color: '#78350F' },
    parts_invoice: { background: '#DCFCE7', color: '#166534' },
    before_photo: { background: '#F3E8FF', color: '#581C87' },
    after_photo: { background: '#F3E8FF', color: '#581C87' },
    qa_report: { background: '#FEE2E2', color: '#7F1D1D' },
    other: { background: '#F3F4F6', color: '#374151' },
  };
  return {
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    ...(map[kind] ?? map.other),
  };
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 960, margin: '0 auto' },
  backLink: {
    display: 'inline-block',
    marginBottom: 12,
    fontSize: 13,
    color: '#1D3095',
    textDecoration: 'none',
    fontWeight: 500,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #E2E5EB',
  },
  h1: { fontSize: 24, fontWeight: 600, margin: '0 0 8px' },
  h2: {
    fontSize: 14,
    fontWeight: 600,
    margin: '0 0 12px',
    color: '#374151',
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  },
  h2Hint: { fontSize: 11, color: '#9CA3AF', fontWeight: 400 },
  headerBadges: { display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' as const },
  qaFailedBadge: {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background: '#FEE2E2',
    color: '#7F1D1D',
  },
  qaPassedBadge: {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background: '#DCFCE7',
    color: '#166534',
  },
  summaryLine: {
    fontSize: 14,
    color: '#374151',
    margin: 0,
    fontStyle: 'italic' as const,
  },
  editStub: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  disabledBtn: {
    padding: '6px 12px',
    border: '1px dashed #E2E5EB',
    background: '#FAFBFC',
    color: '#9CA3AF',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'not-allowed',
  },
  section: {
    marginBottom: 24,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 16,
  },
  docsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  detailRow: {
    display: 'grid',
    gridTemplateColumns: '160px 1fr',
    gap: 12,
    padding: '6px 0',
    fontSize: 13,
    alignItems: 'baseline',
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  rowValue: { color: '#111827', wordBreak: 'break-word' as const },
  link: { color: '#1D3095', textDecoration: 'none', fontWeight: 500 },
  muted: { color: '#9CA3AF' },
  notes: {
    fontSize: 13,
    color: '#374151',
    whiteSpace: 'pre-wrap' as const,
    background: '#FAFBFC',
    padding: 12,
    borderRadius: 6,
    border: '1px solid #F1F2F4',
  },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  thRight: {
    textAlign: 'right' as const,
    padding: '8px 10px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  td: { padding: '8px 10px', borderBottom: '1px solid #F1F2F4' },
  tdRight: {
    padding: '8px 10px',
    borderBottom: '1px solid #F1F2F4',
    textAlign: 'right' as const,
  },
  tdMuted: {
    padding: '8px 10px',
    borderBottom: '1px solid #F1F2F4',
    fontSize: 12,
    color: '#6B7280',
  },
  empty: {
    padding: 32,
    textAlign: 'center' as const,
    color: '#6B7280',
    fontSize: 13,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    margin: 24,
  },
  actionMsg: {
    marginTop: 12,
    padding: '10px 14px',
    background: '#DCFCE7',
    border: '1px solid #86EFAC',
    color: '#166534',
    borderRadius: 8,
    fontSize: 13,
  },
};
