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
import Link from 'next/link';
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
  /** F10.7 tail — maintenance events that link to this receipt
   *  via `linked_receipt_id`. Empty array when none. */
  linked_maintenance_events: Array<{
    id: string;
    summary: string;
    kind: string;
    state: string;
    scheduled_for: string | null;
    equipment_inventory_id: string | null;
    equipment_name: string | null;
  }>;
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
  // Bulk-approve selection (Batch JJ). Only meaningful on the
  // 'pending' tab — when the bookkeeper switches tabs we drop the
  // selection so a stale set can't leak to the wrong status.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkBusy, setBulkBusy] = useState(false);

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

  // Drop the bulk-approve selection whenever the active tab
  // changes — the checkboxes are only rendered on the 'pending'
  // tab and we never want to bulk-approve a row visible on
  // the wrong tab.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  const counters = data?.counters ?? zeroCounters();
  const receipts = data?.receipts ?? [];

  const onToggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // The "Select all" checkbox at the top of the pending list. We
  // only count rows that are actually approve-able (status='pending'
  // + not deleted) so a click on Select-All never silently picks up
  // a tombstone.
  const approvableIds = useMemo(
    () =>
      receipts
        .filter((r) => r.status === 'pending' && !r.deleted_at)
        .map((r) => r.id),
    [receipts]
  );
  const allApprovableSelected =
    approvableIds.length > 0 &&
    approvableIds.every((id) => selectedIds.has(id));
  const onToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allApprovableSelected) {
        for (const id of approvableIds) next.delete(id);
      } else {
        for (const id of approvableIds) next.add(id);
      }
      return next;
    });
  }, [allApprovableSelected, approvableIds]);

  const onBulkApprove = useCallback(async () => {
    if (bulkBusy || selectedIds.size === 0) return;
    const idsArr = Array.from(selectedIds);
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Approve ${idsArr.length} receipt${idsArr.length === 1 ? '' : 's'}? This stamps your name as the approver.`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/receipts/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsArr }),
      });
      const json = (await res.json().catch(() => null)) as {
        approved?: string[];
        skipped?: Array<{ id: string; reason: string }>;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error ?? `bulk approve failed (${res.status})`);
      }
      const approvedCount = json?.approved?.length ?? 0;
      const skippedCount = json?.skipped?.length ?? 0;
      if (skippedCount > 0) {
        // Surface skip reasons inline so the bookkeeper knows why
        // some rows didn't transition. Truncated body keeps the
        // alert readable.
        const reasons = (json?.skipped ?? [])
          .slice(0, 5)
          .map((s) => s.reason)
          .join(', ');
        alert(
          `Approved ${approvedCount} · skipped ${skippedCount} (${reasons}${skippedCount > 5 ? ', …' : ''}).`
        );
      }
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  }, [bulkBusy, selectedIds, load]);

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
          {tab === 'pending' && approvableIds.length > 0 ? (
            <label style={styles.selectAllRow}>
              <input
                type="checkbox"
                checked={allApprovableSelected}
                onChange={onToggleSelectAll}
              />
              Select all {approvableIds.length} pending
            </label>
          ) : null}
          {receipts.map((r) => (
            <ReceiptRow
              key={r.id}
              row={r}
              expanded={expandedId === r.id}
              onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
              onMutate={onMutate}
              onRefresh={load}
              selectable={
                tab === 'pending' &&
                r.status === 'pending' &&
                !r.deleted_at
              }
              selected={selectedIds.has(r.id)}
              onToggleSelected={() => onToggleSelected(r.id)}
            />
          ))}
        </div>
      )}

      {/* Sticky bulk-approve action bar (Batch JJ). Renders only on
          the pending tab + when the selection is non-empty. Pinned
          to the bottom so the bookkeeper can scroll through 50 rows
          and confirm without losing the count. */}
      {tab === 'pending' && selectedIds.size > 0 ? (
        <div style={styles.bulkBar} role="region" aria-label="Bulk actions">
          <span style={styles.bulkCount}>{selectedIds.size} selected</span>
          <button
            type="button"
            style={styles.bulkClearBtn}
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkBusy}
          >
            Clear
          </button>
          <button
            type="button"
            style={{
              ...styles.bulkApproveBtn,
              opacity: bulkBusy ? 0.6 : 1,
            }}
            onClick={() => void onBulkApprove()}
            disabled={bulkBusy}
          >
            {bulkBusy ? 'Approving…' : `✓ Approve ${selectedIds.size} selected`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ReceiptRowProps {
  row: AdminReceiptRow;
  expanded: boolean;
  onToggle: () => void;
  onMutate: (id: string, body: Record<string, unknown>, label: string) => Promise<void>;
  /** F10.7 tail — refetches the parent receipts list. Used after
   *  a maintenance link/unlink to refresh the linked-events
   *  annotation. */
  onRefresh: () => Promise<void>;
  /** Show the bulk-select checkbox on this row. Only true on the
   *  pending tab for non-deleted, status='pending' rows. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
}

function ReceiptRow({
  row,
  expanded,
  onToggle,
  onMutate,
  selectable,
  selected,
  onToggleSelected,
  onRefresh,
}: ReceiptRowProps) {
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [maintenancePickerOpen, setMaintenancePickerOpen] =
    useState(false);
  const [maintenanceBusy, setMaintenanceBusy] = useState<string | null>(
    null
  );
  const [maintenanceMsg, setMaintenanceMsg] = useState<string | null>(
    null
  );

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
      {/* Bulk-approve checkbox (Batch JJ). Sits OUTSIDE the
          rowSummary button so the click doesn't toggle expansion.
          Stop-propagation on the inner click handler keeps it
          isolated even when the user clicks the row's empty
          space. */}
      {selectable && onToggleSelected ? (
        <label
          style={styles.rowCheckbox}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select for bulk approve"
        >
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelected}
          />
        </label>
      ) : null}
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

          {/* F10.7 tail — equipment-maintenance cross-link prompt.
              Lets the bookkeeper link a receipt to a maintenance event
              so the parts-invoice / cal cert / vendor work-order
              dollars don't show up twice in the depreciation ledger.
              The link writes to maintenance_events.linked_receipt_id
              (one column carries both directions). */}
          <div style={maintLinkStyles.panel}>
            <div style={maintLinkStyles.headerRow}>
              <strong style={maintLinkStyles.title}>
                🔧 Is this for equipment maintenance?
              </strong>
              <button
                type="button"
                onClick={() => {
                  setMaintenanceMsg(null);
                  setMaintenancePickerOpen(true);
                }}
                style={maintLinkStyles.linkBtn}
                disabled={!!busy || maintenanceBusy !== null}
              >
                {row.linked_maintenance_events.length > 0
                  ? '+ Link another'
                  : 'Link to maintenance event'}
              </button>
            </div>
            {row.linked_maintenance_events.length === 0 ? (
              <p style={maintLinkStyles.emptyHint}>
                Click the button to attach this receipt to a calibration,
                repair, or vendor work-order so the maintenance ledger
                stays in sync with the receipts ledger.
              </p>
            ) : (
              <ul style={maintLinkStyles.list}>
                {row.linked_maintenance_events.map((m) => (
                  <li key={m.id} style={maintLinkStyles.item}>
                    <Link
                      href={`/admin/equipment/maintenance/${m.id}`}
                      style={maintLinkStyles.itemLink}
                    >
                      <span style={maintLinkStyles.itemEquip}>
                        {m.equipment_name ?? '(no equipment)'}
                      </span>
                      <span style={maintLinkStyles.itemKindChip}>
                        {m.kind}
                      </span>
                      <span style={maintLinkStateChip(m.state)}>
                        {m.state.replace(/_/g, ' ')}
                      </span>
                      <span style={maintLinkStyles.itemSummary}>
                        {m.summary}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          typeof window === 'undefined' ||
                          !window.confirm(
                            `Detach this receipt from "${m.summary}"? The maintenance event will keep all other fields.`
                          )
                        ) {
                          return;
                        }
                        setMaintenanceBusy(m.id);
                        setMaintenanceMsg(null);
                        try {
                          const res = await fetch(
                            `/api/admin/maintenance/events/${m.id}`,
                            {
                              method: 'PATCH',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                linked_receipt_id: null,
                              }),
                            }
                          );
                          if (!res.ok) {
                            const text = await res.text().catch(() => '');
                            throw new Error(
                              text || `request failed: ${res.status}`
                            );
                          }
                          setMaintenanceMsg(`✓ Detached "${m.summary}".`);
                          await onRefresh();
                        } catch (err) {
                          setMaintenanceMsg(
                            `⚠ Detach failed: ${err instanceof Error ? err.message : String(err)}`
                          );
                        } finally {
                          setMaintenanceBusy(null);
                        }
                      }}
                      style={maintLinkStyles.itemDetachBtn}
                      disabled={
                        !!busy || maintenanceBusy !== null
                      }
                    >
                      {maintenanceBusy === m.id
                        ? 'Working…'
                        : 'Detach'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {maintenanceMsg ? (
              <div style={maintLinkStyles.msg}>{maintenanceMsg}</div>
            ) : null}
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

      {maintenancePickerOpen ? (
        <MaintenancePicker
          receiptId={row.id}
          receiptVendor={row.vendor_name}
          alreadyLinkedIds={row.linked_maintenance_events.map((m) => m.id)}
          onClose={() => setMaintenancePickerOpen(false)}
          onLinked={async (summary) => {
            setMaintenancePickerOpen(false);
            setMaintenanceMsg(`✓ Linked to "${summary}".`);
            await onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}

interface PickerEvent {
  id: string;
  summary: string;
  kind: string;
  state: string;
  scheduled_for: string | null;
  equipment_inventory_id: string | null;
  equipment_name: string | null;
}

function MaintenancePicker({
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
            ✕
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

          {error ? <div style={pickerStyles.error}>⚠ {error}</div> : null}

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

function maintLinkStateChip(state: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    scheduled: { background: '#DBEAFE', color: '#1E3A8A' },
    in_progress: { background: '#1D3095', color: '#FFFFFF' },
    awaiting_parts: { background: '#FEF3C7', color: '#78350F' },
    awaiting_vendor: { background: '#FEF3C7', color: '#78350F' },
    complete: { background: '#DCFCE7', color: '#166534' },
    failed_qa: { background: '#FEE2E2', color: '#7F1D1D' },
    cancelled: { background: '#F3F4F6', color: '#6B7280' },
  };
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    ...(map[state] ?? { background: '#F3F4F6', color: '#374151' }),
  };
}

const maintLinkStyles: Record<string, React.CSSProperties> = {
  panel: {
    marginTop: 12,
    padding: 12,
    background: '#F0F9FF',
    border: '1px solid #BAE6FD',
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
    color: '#0C4A6E',
    fontSize: 13,
  },
  linkBtn: {
    background: '#0C4A6E',
    color: '#FFFFFF',
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
    color: '#475569',
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
    background: '#FFFFFF',
    border: '1px solid #BAE6FD',
    borderRadius: 6,
    padding: '6px 10px',
  },
  itemLink: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '180px 100px 100px 1fr',
    alignItems: 'center',
    gap: 12,
    color: '#111827',
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
    background: '#F3F4F6',
    padding: '1px 8px',
    borderRadius: 4,
    fontSize: 11,
    color: '#374151',
    textTransform: 'capitalize' as const,
    justifySelf: 'start' as const,
  },
  itemSummary: {
    color: '#374151',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  itemDetachBtn: {
    background: '#FFFFFF',
    border: '1px solid #B91C1C',
    color: '#B91C1C',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
  },
  msg: {
    fontSize: 11,
    color: '#0C4A6E',
    fontStyle: 'italic' as const,
    paddingTop: 4,
  },
};

const pickerStyles: Record<string, React.CSSProperties> = {
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
    gap: 12,
  },
  copy: { margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F3F4F6',
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
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  checkboxRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    fontSize: 12,
    color: '#374151',
  },
  loadingHint: {
    padding: '14px 4px',
    fontSize: 12,
    color: '#6B7280',
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
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  itemLinked: {
    background: '#F0F9FF',
    borderColor: '#0C4A6E',
    cursor: 'default' as const,
  },
  itemTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemEquip: {
    color: '#111827',
    fontSize: 13,
  },
  itemSummary: {
    color: '#374151',
    fontSize: 12,
  },
  itemMeta: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    alignItems: 'center',
    fontSize: 11,
    color: '#6B7280',
  },
  itemKindChip: {
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 11,
    color: '#374151',
    textTransform: 'capitalize' as const,
  },
  itemDate: {
    fontFamily: 'Menlo, monospace',
    color: '#6B7280',
  },
  itemLinkedBadge: {
    background: '#0C4A6E',
    color: '#FFFFFF',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  itemBusy: {
    color: '#0C4A6E',
    fontStyle: 'italic' as const,
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
    padding: '12px 20px',
    borderTop: '1px solid #E2E5EB',
    background: '#FAFBFC',
    borderRadius: '0 0 12px 12px',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
};

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
  selectAllRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 16px',
    fontSize: 13,
    color: '#374151',
    cursor: 'pointer',
  },
  row: {
    border: '1px solid #ddd',
    borderRadius: 8,
    background: '#fff',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'stretch',
  },
  rowCheckbox: {
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 4,
    cursor: 'pointer',
  },
  bulkBar: {
    position: 'sticky',
    bottom: 0,
    marginTop: 12,
    padding: '12px 16px',
    background: '#FFFFFF',
    borderTop: '1px solid #E2E5EB',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0 -4px 8px rgba(0,0,0,0.04)',
  },
  bulkCount: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    flex: 1,
  },
  bulkClearBtn: {
    background: 'transparent',
    border: '1px solid #D1D5DB',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
  bulkApproveBtn: {
    background: '#059669',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
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
