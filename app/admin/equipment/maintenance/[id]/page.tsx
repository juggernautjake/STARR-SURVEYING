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
import { Pencil, X, Check, AlertTriangle, Save } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../../hooks/usePageError';
import { styles } from './maintenance-styles';
import {
  formatBytes, formatCurrency, formatDateTime,
  type DetailResponse, type MaintenanceDocument, type MaintenanceEvent,
} from './maintenance-types';
import {
  AttachReceiptModal, DetailRow, EditForm, TransitionBar, TransitionModal, UploadModal,
} from './EventDialogs';




// F10.7-g-ii-β — state-transition adjacency mirrors the
// PATCH route's TRANSITIONS table from F10.7-c-ii. Keeping
// it server-side-of-record means the UI can pre-emptively
// hide impossible buttons; the PATCH still re-validates.





// F10.7-g-ii-γ — datetime-local <input> uses minute-precision
// "YYYY-MM-DDTHH:mm" in the user's local timezone; the PATCH
// route expects an ISO timestamp (or null to clear). These two
// helpers round-trip cleanly and let the change-detector compare
// "did the user actually edit this field" by string equality on
// the local form rather than ms-precision ISO drift.


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

  // F10.7-g-ii-γ — edit-mode toggle + save state.
  const [editMode, setEditMode] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // F10.7-g-ii-δ — documents upload modal.
  const [uploadOpen, setUploadOpen] = useState(false);

  // F10.7 tail — attach-receipt picker modal.
  const [attachReceiptOpen, setAttachReceiptOpen] = useState(false);

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
          {!editMode ? (
            <p style={styles.summaryLine}>{event.summary}</p>
          ) : null}
        </div>
        <div style={styles.editStub}>
          {!editMode ? (
            <button
              type="button"
              onClick={() => {
                setEditMode(true);
                setEditError(null);
                setActionMsg(null);
              }}
              style={styles.editBtn}
              disabled={event.state === 'cancelled'}
              title={
                event.state === 'cancelled'
                  ? 'Cancelled events are terminal — fields are locked.'
                  : 'Edit vendor, cost, schedule, and notes'
              }
            >
              <Pencil size={14} style={{ verticalAlign: "text-bottom", marginRight: "0.25rem" }} /> Edit fields
            </button>
          ) : null}
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

      {editMode ? (
        <EditForm
          event={event}
          submitting={editSubmitting}
          error={editError}
          onCancel={() => {
            setEditMode(false);
            setEditError(null);
          }}
          onSave={async (patch) => {
            setEditSubmitting(true);
            setEditError(null);
            const res = await safeFetch<{
              event?: { id: string };
              error?: string;
            }>(`/api/admin/maintenance/events/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
            });
            setEditSubmitting(false);
            if (res?.event) {
              setEditMode(false);
              setActionMsg('✓ Fields updated.');
              void fetchDetail();
            } else {
              setEditError(
                res?.error ??
                  'Save failed. Check the error log; the form is unchanged.'
              );
            }
          }}
        />
      ) : (
        <>
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
              {event.vendor_contact ?? (
                <span style={styles.muted}>—</span>
              )}
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
                <span style={styles.linkedReceiptRow}>
                  <Link
                    href={`/admin/receipts/${event.linked_receipt_id}`}
                    style={styles.link}
                  >
                    {event.linked_receipt_id.slice(0, 8)}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachReceiptOpen(true);
                      setActionMsg(null);
                    }}
                    style={styles.linkBtn}
                  >
                    Change
                  </button>
                </span>
              ) : (
                <span style={styles.linkedReceiptRow}>
                  <span style={styles.muted}>—</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachReceiptOpen(true);
                      setActionMsg(null);
                    }}
                    style={styles.linkBtn}
                  >
                    Attach receipt
                  </button>
                </span>
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
        </>
      )}

      <section style={styles.section}>
        <header style={styles.docsHeader}>
          <h2 style={styles.h2}>
            Documents{' '}
            <span style={styles.h2Hint}>({documents.length})</span>
          </h2>
          <button
            type="button"
            onClick={() => {
              setUploadOpen(true);
              setActionMsg(null);
            }}
            style={styles.editBtn}
          >
            ↑ Upload document
          </button>
        </header>
        {documents.length === 0 ? (
          <div style={styles.muted}>
            No documents attached. Click <strong>Upload document</strong>{' '}
            to attach a calibration cert, work order, photo, etc.
          </div>
        ) : (
          <div className="admin-table-wrap"><table style={styles.table}>
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
          </table></div>
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
          existingQaPassed={event.qa_passed}
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

      {uploadOpen ? (
        <UploadModal
          eventId={event.id}
          onClose={() => setUploadOpen(false)}
          onUploaded={(filename) => {
            setUploadOpen(false);
            setActionMsg(`✓ Uploaded ${filename}.`);
            void fetchDetail();
          }}
        />
      ) : null}

      {attachReceiptOpen ? (
        <AttachReceiptModal
          eventId={event.id}
          currentReceiptId={event.linked_receipt_id}
          onClose={() => setAttachReceiptOpen(false)}
          onAttached={(receiptId) => {
            setAttachReceiptOpen(false);
            setActionMsg(`✓ Linked receipt ${receiptId.slice(0, 8)}.`);
            void fetchDetail();
          }}
        />
      ) : null}
    </div>
  );
}

function stateBadgeStyle(state: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    scheduled: { background: '#DBEAFE', color: '#1E3A8A' },
    in_progress: { background: 'var(--color-brand-navy)', color: 'var(--color-text-on-brand)' },
    awaiting_parts: { background: '#FEF3C7', color: '#78350F' },
    awaiting_vendor: { background: '#FEF3C7', color: '#78350F' },
    complete: { background: '#15803D', color: 'var(--color-text-on-brand)' },
    failed_qa: { background: '#FEE2E2', color: '#7F1D1D' },
    cancelled: {
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-muted)',
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
    ...(map[state] ?? { background: 'var(--color-bg-subtle)', color: 'var(--theme-fg-secondary, #374151)' }),
  };
}

function kindBadgeStyle(): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    background: 'var(--color-bg-subtle)',
    color: 'var(--theme-fg-secondary, #374151)',
  };
}

function originBadgeStyle(): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
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
    other: { background: 'var(--color-bg-subtle)', color: 'var(--theme-fg-secondary, #374151)' },
  };
  return {
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    ...(map[kind] ?? map.other),
  };
}

