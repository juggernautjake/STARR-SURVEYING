// app/admin/receipts/page.tsx — Bookkeeper approval queue for Starr Field receipts
//
// Phase F2 #5. Pulls /api/admin/receipts (which JOINs auth.users for
// submitter email and jobs for display name) and lets the bookkeeper:
//   - filter by status / date range / submitter / job
//   - tap a row to expand the photo + AI extraction details
//   - approve, reject, or reopen
//   - override the category and tax-deductibility flag inline
//
// Style follows the existing /admin/hours-approval page (tab + list).
// CSS reuses utility classes from app/admin/styles/AdminCommon.css.
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';

import { usePageError } from '../hooks/usePageError';

// ── Types — mirror app/api/admin/receipts/route.ts ────────────────────────────

interface AdminReceiptRow {
  id: string;
  user_id: string | null;
  job_id: string | null;
  vendor_name: string | null;
  vendor_address: string | null;
  transaction_at: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  total_cents: number | null;
  payment_method: string | null;
  payment_last4: string | null;
  category: string | null;
  category_source: string | null;
  tax_deductible_flag: string | null;
  notes: string | null;
  photo_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  // Soft-delete + retention (Batch CC). Non-null deleted_at means
  // the row is tombstoned. The bookkeeper page hides these by
  // default but the "Show deleted" toggle (Batch FF) brings them
  // back for audit review.
  deleted_at: string | null;
  deletion_reason: string | null;
  extraction_status: string | null;
  extraction_error: string | null;
  extraction_cost_cents: number | null;
  ai_confidence_per_field: Record<string, number> | null;
  created_at: string;
  updated_at: string | null;
  submitted_by_email: string | null;
  submitted_by_name: string | null;
  job_name: string | null;
  job_number: string | null;
  photo_signed_url: string | null;
}

interface ListResponse {
  receipts: AdminReceiptRow[];
  counters: {
    pending: number;
    approved: number;
    rejected: number;
    exported: number;
    total: number;
  };
}

const STATUS_TABS = ['pending', 'approved', 'rejected', 'exported'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const CATEGORY_OPTIONS = [
  'fuel',
  'meals',
  'supplies',
  'equipment',
  'tolls',
  'parking',
  'lodging',
  'professional_services',
  'office_supplies',
  'client_entertainment',
  'other',
] as const;

const TAX_FLAG_OPTIONS = [
  { value: 'full', label: 'Full' },
  { value: 'partial_50', label: '50% (meals)' },
  { value: 'none', label: 'None' },
  { value: 'review', label: 'Review' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: '#D97706',
  approved: '#059669',
  rejected: '#DC2626',
  exported: '#6B7280',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function categoryLabel(cat: string | null | undefined): string {
  if (!cat) return '—';
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReceiptsApprovalPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction } = usePageError('ReceiptsApprovalPage');

  const [tab, setTab] = useState<StatusTab>('pending');
  const [from, setFrom] = useState<string>(() => firstOfMonthIso());
  const [to, setTo] = useState<string>(() => todayIso());
  const [emailFilter, setEmailFilter] = useState<string>('');
  // "Show deleted" toggle (Batch FF). Off by default — tombstoned
  // rows are an audit-trail artifact, not part of the daily queue.
  // When on, the API includes rows where `deleted_at IS NOT NULL`
  // and we render a "Deleted" badge inline.
  const [showDeleted, setShowDeleted] = useState<boolean>(false);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: tab, from, to });
      if (emailFilter.trim()) params.set('email', emailFilter.trim());
      if (showDeleted) params.set('include_deleted', '1');
      const res = await safeFetch<ListResponse>(`/api/admin/receipts?${params}`);
      setData(res ?? { receipts: [], counters: zeroCounters() });
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, emailFilter, showDeleted, safeFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const counters = data?.counters ?? zeroCounters();
  const receipts = data?.receipts ?? [];

  const onMutate = async (id: string, body: Record<string, unknown>, label: string) => {
    await safeAction(label, async () => {
      const res = await fetch(`/api/admin/receipts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch((e) => {
          // safeAction captures the outer throw; this catches the rare
          // case where reading the body itself fails (binary 500 from
          // upstream, etc.). Without the warn, the user sees just
          // "request failed: 500" with no clue what happened.
          console.warn('[ReceiptsApprovalPage] body read failed', e);
          return '';
        });
        throw new Error(text || `request failed: ${res.status}`);
      }
      await load();
    });
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Receipts approval</h1>
        <p style={styles.subtitle}>
          Signed in as <strong>{session?.user?.email ?? '—'}</strong>. Tap any row
          to expand the photo and AI-extracted fields.
        </p>
      </header>

      <nav style={styles.tabs}>
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            style={{
              ...styles.tabButton,
              ...(tab === s ? styles.tabButtonActive : null),
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}{' '}
            <span style={styles.tabCount}>
              {s === 'pending'
                ? counters.pending
                : s === 'approved'
                  ? counters.approved
                  : s === 'rejected'
                    ? counters.rejected
                    : counters.exported}
            </span>
          </button>
        ))}
      </nav>

      <div style={styles.filterRow}>
        <label style={styles.filterLabel}>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={styles.input}
          />
        </label>
        <label style={styles.filterLabel}>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={styles.input}
          />
        </label>
        <label style={{ ...styles.filterLabel, flex: 1 }}>
          Submitter email (optional)
          <input
            type="text"
            placeholder="jacob@starrsurveying.com"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            style={styles.input}
          />
        </label>
        <label
          style={{
            ...styles.filterLabel,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
          title="Include soft-deleted receipts (Batch CC tombstones) in the list. Useful for IRS audit prep."
        >
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
          />
          Show deleted
        </label>
        <button type="button" onClick={() => void load()} style={styles.refreshButton}>
          Refresh
        </button>
        <a
          href={buildExportUrl({ status: tab, from, to, email: emailFilter })}
          style={styles.exportButton}
          download
        >
          Export CSV
        </a>
      </div>

      {loading ? (
        <p style={styles.empty}>Loading…</p>
      ) : receipts.length === 0 ? (
        <p style={styles.empty}>
          No {tab} receipts in this date range.
        </p>
      ) : (
        <div style={styles.list}>
          {receipts.map((r) => (
            <ReceiptRow
              key={r.id}
              row={r}
              expanded={expandedId === r.id}
              onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
              onMutate={onMutate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ReceiptRowProps {
  row: AdminReceiptRow;
  expanded: boolean;
  onToggle: () => void;
  onMutate: (id: string, body: Record<string, unknown>, label: string) => Promise<void>;
}

function ReceiptRow({ row, expanded, onToggle, onMutate }: ReceiptRowProps) {
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const wrap = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    try {
      await onMutate(row.id, body, label);
    } finally {
      setBusy(null);
    }
  };

  const total = formatCents(row.total_cents);
  const date = formatDateTime(row.transaction_at ?? row.created_at);
  const statusColor = STATUS_COLORS[row.status] ?? '#6B7280';

  // Build a compact AI-extraction status caption.
  const aiCaption = useMemo(() => {
    if (row.extraction_status === 'queued' || row.extraction_status === 'running') {
      return 'AI working…';
    }
    if (row.extraction_status === 'failed') {
      return `AI failed${row.extraction_error ? `: ${row.extraction_error}` : ''}`;
    }
    if (row.extraction_status === 'done') {
      const cost = row.extraction_cost_cents
        ? ` · cost ${formatCents(row.extraction_cost_cents)}`
        : '';
      return `AI done${cost}`;
    }
    return '—';
  }, [row.extraction_status, row.extraction_error, row.extraction_cost_cents]);

  return (
    <div style={styles.row}>
      <button type="button" style={styles.rowSummary} onClick={onToggle}>
        <div style={styles.rowMain}>
          <div style={styles.rowVendor}>
            {row.vendor_name?.trim() || '(awaiting AI)'}
          </div>
          <div style={styles.rowMeta}>
            {row.submitted_by_email ?? '(unknown submitter)'} · {date}
            {row.job_name ? ` · ${row.job_name}` : ''}
          </div>
          <div style={styles.rowMetaSecondary}>
            {categoryLabel(row.category)} · {aiCaption}
          </div>
        </div>
        <div style={styles.rowRight}>
          <div style={styles.rowTotal}>{total}</div>
          {row.deleted_at ? (
            <span
              style={{
                ...styles.statusChip,
                borderColor: '#9F0014',
                color: '#9F0014',
                background: '#FEE2E2',
              }}
              title={
                row.deletion_reason
                  ? `Deleted by user (${row.deletion_reason}) on ${formatDateTime(row.deleted_at)} — Batch CC tombstone`
                  : `Deleted by user on ${formatDateTime(row.deleted_at)} — Batch CC tombstone`
              }
            >
              🗑 deleted
            </span>
          ) : null}
          <span
            style={{
              ...styles.statusChip,
              borderColor: statusColor,
              color: statusColor,
            }}
          >
            {row.status}
          </span>
        </div>
      </button>

      {expanded ? (
        <div style={styles.expanded}>
          {row.photo_signed_url ? (
            <img
              src={row.photo_signed_url}
              alt="Receipt"
              style={styles.photo}
            />
          ) : (
            <div style={styles.photoFallback}>
              Photo unavailable (signed URL not generated)
            </div>
          )}

          <dl style={styles.fields}>
            <Field label="Vendor address" value={row.vendor_address} />
            <Field label="Subtotal" value={formatCents(row.subtotal_cents)} />
            <Field label="Tax" value={formatCents(row.tax_cents)} />
            <Field label="Tip" value={formatCents(row.tip_cents)} />
            <Field label="Total" value={total} />
            <Field label="Payment" value={row.payment_method} />
            <Field label="Last 4" value={row.payment_last4} />
            <Field
              label="Category source"
              value={
                row.category_source
                  ? `${row.category_source}${
                      row.ai_confidence_per_field?.category != null
                        ? ` (conf ${(row.ai_confidence_per_field.category * 100).toFixed(0)}%)`
                        : ''
                    }`
                  : '—'
              }
            />
            <Field label="Tax flag" value={row.tax_deductible_flag} />
            <Field label="Notes" value={row.notes} />
            <Field label="Submitted by" value={row.submitted_by_email} />
            <Field label="Submitted at" value={formatDateTime(row.created_at)} />
            {row.approved_at ? (
              <Field label="Approved at" value={formatDateTime(row.approved_at)} />
            ) : null}
            {row.rejected_reason ? (
              <Field label="Reject reason" value={row.rejected_reason} />
            ) : null}
          </dl>

          {/* Inline overrides */}
          <div style={styles.editRow}>
            <label style={styles.editLabel}>
              Category
              <select
                value={row.category ?? ''}
                disabled={!!busy}
                onChange={(e) =>
                  void wrap('updating category', {
                    category: e.target.value || null,
                  })
                }
                style={styles.select}
              >
                <option value="">—</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.editLabel}>
              Tax flag
              <select
                value={row.tax_deductible_flag ?? ''}
                disabled={!!busy}
                onChange={(e) =>
                  void wrap('updating tax flag', {
                    tax_deductible_flag: e.target.value || null,
                  })
                }
                style={styles.select}
              >
                <option value="">—</option>
                {TAX_FLAG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Workflow buttons */}
          <div style={styles.actionRow}>
            {row.status === 'pending' || row.status === 'rejected' ? (
              <>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    // Approve is a workflow flip — confirm so a misclick
                    // on a row with low AI confidence doesn't bake in
                    // the wrong totals.
                    if (
                      typeof window !== 'undefined' &&
                      window.confirm(
                        `Approve ${row.vendor_name?.trim() || 'this receipt'} for ${total}? It will move to the exported queue and the surveyor can no longer edit it.`
                      )
                    ) {
                      void wrap('approving', { status: 'approved' });
                    }
                  }}
                  style={{ ...styles.button, ...styles.buttonApprove }}
                >
                  {busy === 'approving' ? 'Approving…' : 'Approve'}
                </button>
                <input
                  type="text"
                  placeholder="Rejection reason (optional)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                />
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    // Reject sends the receipt back to the surveyor's
                    // queue with the rejection reason. Confirm because
                    // there's no automatic notification — a typo here
                    // can leave the receipt in limbo.
                    if (
                      typeof window !== 'undefined' &&
                      window.confirm(
                        rejectReason.trim()
                          ? `Reject this receipt with reason "${rejectReason.trim()}"? The surveyor will see this on their device.`
                          : 'Reject this receipt with no reason? The surveyor will see a generic "Bookkeeper rejected" message — consider adding a reason first.'
                      )
                    ) {
                      void wrap('rejecting', {
                        status: 'rejected',
                        rejected_reason: rejectReason.trim() || null,
                      });
                    }
                  }}
                  style={{ ...styles.button, ...styles.buttonReject }}
                >
                  {busy === 'rejecting' ? 'Rejecting…' : 'Reject'}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  // Reopen flips an approved/exported receipt back to
                  // pending. Rare action — confirm so a misclick on a
                  // long list doesn't accidentally undo a closed
                  // accounting period.
                  if (
                    typeof window !== 'undefined' &&
                    window.confirm(
                      `Reopen this ${row.status} receipt? It will move back to the pending queue and the surveyor can edit it again.`
                    )
                  ) {
                    void wrap('reopening', { status: 'pending' });
                  }
                }}
                style={{ ...styles.button, ...styles.buttonReopen }}
              >
                {busy === 'reopening' ? 'Reopening…' : 'Reopen'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={styles.fieldRow}>
      <dt style={styles.fieldLabel}>{label}</dt>
      <dd style={styles.fieldValue}>{value || '—'}</dd>
    </div>
  );
}

function buildExportUrl(filters: {
  status: string;
  from: string;
  to: string;
  email: string;
}): string {
  const params = new URLSearchParams({
    status: filters.status,
    from: filters.from,
    to: filters.to,
  });
  if (filters.email.trim()) params.set('email', filters.email.trim());
  return `/api/admin/receipts/export?${params}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function zeroCounters() {
  return { pending: 0, approved: 0, rejected: 0, exported: 0, total: 0 };
}

// ── Inline styles — keeps this self-contained with no extra CSS file ──────────

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tabButton: {
    padding: '8px 16px',
    borderRadius: 999,
    border: '1px solid #ccc',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  tabButtonActive: {
    background: '#1D3095',
    color: '#fff',
    borderColor: '#1D3095',
  },
  tabCount: { opacity: 0.7, fontSize: 12, marginLeft: 6 },
  filterRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  filterLabel: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: 12,
    color: '#666',
    gap: 4,
  },
  input: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 14,
    minWidth: 140,
  },
  select: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 14,
  },
  refreshButton: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid #1D3095',
    background: '#1D3095',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  exportButton: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid #1D3095',
    background: '#fff',
    color: '#1D3095',
    fontSize: 14,
    fontWeight: 500,
    textDecoration: 'none',
    display: 'inline-block',
    lineHeight: '20px',
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#888',
    fontStyle: 'italic',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: {
    border: '1px solid #ddd',
    borderRadius: 8,
    background: '#fff',
    overflow: 'hidden',
  },
  rowSummary: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowVendor: { fontSize: 16, fontWeight: 600, marginBottom: 2 },
  rowMeta: { fontSize: 13, color: '#555' },
  rowMetaSecondary: { fontSize: 12, color: '#888', marginTop: 2 },
  rowRight: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 },
  rowTotal: { fontSize: 17, fontWeight: 700 },
  statusChip: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  expanded: {
    borderTop: '1px solid #eee',
    padding: 16,
    background: '#fafafa',
    display: 'grid',
    gridTemplateColumns: 'minmax(200px, 320px) 1fr',
    gap: 24,
  },
  photo: {
    width: '100%',
    maxHeight: 480,
    objectFit: 'contain',
    border: '1px solid #ccc',
    borderRadius: 6,
    background: '#fff',
  },
  photoFallback: {
    padding: 16,
    border: '1px dashed #ccc',
    borderRadius: 6,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  fields: { margin: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  fieldRow: { display: 'flex', gap: 12, fontSize: 13 },
  fieldLabel: { width: 120, color: '#888', flexShrink: 0 },
  fieldValue: { color: '#222', margin: 0 },
  editRow: {
    gridColumn: '1 / -1',
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  editLabel: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: 12,
    color: '#666',
    gap: 4,
  },
  actionRow: {
    gridColumn: '1 / -1',
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  button: {
    padding: '10px 20px',
    borderRadius: 6,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonApprove: { background: '#059669', color: '#fff' },
  buttonReject: { background: '#DC2626', color: '#fff' },
  buttonReopen: { background: '#6B7280', color: '#fff' },
};
