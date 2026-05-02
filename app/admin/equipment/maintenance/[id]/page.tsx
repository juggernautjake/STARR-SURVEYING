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
          <button type="button" disabled style={styles.disabledBtn}>
            Transition state (F10.7-g-ii-β)
          </button>
        </div>
      </header>

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
};
