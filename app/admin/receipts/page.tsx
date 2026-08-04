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
import { Trash2, Wrench, X, AlertTriangle, Landmark } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../hooks/usePageError';
import type { AdminReceiptRow } from './receipt-types';
import { MaintenancePicker, maintLinkStateChip, maintLinkStyles } from './MaintenanceLink';
import { PromoteToAssetPanel } from './PromoteToAsset';
import { taxSummaryFor, type DeductibleFlag } from '@/lib/finance/tax-summary';

// ── Types — mirror app/api/admin/receipts/route.ts ────────────────────────────


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
  exported: 'var(--color-text-tertiary)',
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
  // Jobs list for the per-receipt job-assignment dropdown.
  const [jobs, setJobs] = useState<{ id: string; name: string; job_number: string | null }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/jobs?limit=500');
        if (!res.ok) return;
        const d = await res.json() as { jobs?: { id: string; name: string; job_number: string | null }[] };
        if (!cancelled) setJobs(d.jobs ?? []);
      } catch { /* non-fatal — the dropdown just stays empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

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
  const receipts = useMemo(() => data?.receipts ?? [], [data?.receipts]);

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

      {/* receipts-filter-row-alignment-2026-06-20 — separate the
          labeled inputs from the trailing controls + buttons, then
          align every control to the same baseline so the row reads
          as a single line. Filters wrap onto a new line if the
          screen is narrow; the actions group always sits on the
          right of whatever row it ends up on. */}
      <div style={styles.filterRow}>
        <div style={styles.filterFieldsGroup}>
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
        </div>
        {/* receipts-filter-row-alignment-2026-06-22-v2 — every action
            control sits in its own filterLabel column with an invisible
            `&nbsp;` label. The structure is byte-for-byte identical to
            the labeled-input columns to the left (same fontSize,
            inherited line-height, same gap), so the column heights match
            exactly and the action controls land on the same baseline as
            the inputs to their left — no spacer-vs-real-label height
            drift. */}
        <div style={styles.filterActionsGroup}>
          <label style={styles.filterLabel} aria-label="Show deleted receipts">
            <span aria-hidden>&nbsp;</span>
            <span
              style={styles.toggleControl}
              title="Include soft-deleted receipts (Batch CC tombstones) in the list. Useful for IRS audit prep."
            >
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
              />
              <span>Show deleted</span>
            </span>
          </label>
          <label style={styles.filterLabel} aria-label="Refresh the list">
            <span aria-hidden>&nbsp;</span>
            <button type="button" onClick={() => void load()} style={styles.refreshButton}>
              Refresh
            </button>
          </label>
          <label style={styles.filterLabel} aria-label="Export the list as CSV">
            <span aria-hidden>&nbsp;</span>
            <a
              href={buildExportUrl({ status: tab, from, to, email: emailFilter })}
              style={styles.exportButton}
              download
            >
              Export CSV
            </a>
          </label>
        </div>
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
              jobs={jobs}
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
  /** Jobs for the assignment dropdown (assign / reassign this receipt). */
  jobs: { id: string; name: string; job_number: string | null }[];
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
  jobs,
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
  const statusColor = STATUS_COLORS[row.status] ?? 'var(--color-text-tertiary)';

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
              <Trash2 size={13} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />deleted
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
            {/* FINANCE_TAX_AND_INTAKE Slice F3b — the one-line tax consequence, in the place a
                bookkeeper is already looking. Derived from the fields on this row, never generated:
                a sentence that can disagree with the data above it is worse than none, because a
                plausible sentence is what stops someone checking.
                Card role (F1) and pass-through recovery (F2) are not passed yet — those columns
                arrive with seeds 572/573. The summary is honest about that: with no card it simply
                answers the questions it CAN, rather than assuming company money. */}
            <Field
              label="Tax summary"
              value={taxSummaryFor({
                promotedToAsset: !!row.promoted_to_equipment_id,
                deductibleFlag: (row.tax_deductible_flag as DeductibleFlag) ?? null,
                category: row.category,
              }).summary}
            />
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
            <label style={styles.editLabel}>
              Job
              <select
                value={row.job_id ?? ''}
                disabled={!!busy}
                onChange={(e) =>
                  void wrap('assigning job', { job_id: e.target.value || null })
                }
                style={styles.select}
              >
                <option value="">— Unassigned —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_number ? `${j.job_number} · ${j.name}` : j.name}
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
                <Wrench size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Is this for equipment maintenance?
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

          {/* F10.9 — receipt-promotion panel. Capital assets
              (category='equipment' + approved/exported status)
              get a "Promote to asset" CTA so the dollars land
              on the depreciation ledger instead of as a single-
              year Schedule C expense. Hides itself for non-
              equipment categories. */}
          {row.category === 'equipment' ? (
            <PromoteToAssetPanel row={row} onRefresh={onRefresh} />
          ) : null}

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
    background: 'var(--color-brand-navy)',
    color: 'var(--color-text-on-brand)',
    borderColor: 'var(--color-brand-navy)',
  },
  tabCount: { opacity: 0.7, fontSize: 12, marginLeft: 6 },
  filterRow: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  // receipts-filter-row-alignment-2026-06-20 — left + right groups
  // of the row so the inputs cluster together and the action buttons
  // anchor to the right. Both groups use flex-end so the bottoms of
  // every control land on the same horizontal line.
  filterFieldsGroup: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  // receipts-filter-row-alignment-2026-06-22-v2 — each action control
  // sits inside its own filterLabel column (with an invisible `&nbsp;`
  // label). That column structure is byte-for-byte identical to the
  // labeled-input columns to the left so the heights match exactly,
  // no spacer-vs-real-label drift. The group itself only needs to
  // line its children up by box bottoms.
  filterActionsGroup: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
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
    height: 36,
    boxSizing: 'border-box',
  },
  select: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 14,
    height: 36,
    boxSizing: 'border-box',
  },
  // Inline checkbox + label control sized to match the buttons so
  // every element in the actions row shares the same baseline.
  toggleControl: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 36,
    padding: '0 4px',
    fontSize: 13,
    color: '#374151',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  refreshButton: {
    padding: '0 16px',
    height: 36,
    boxSizing: 'border-box',
    borderRadius: 6,
    border: '1px solid var(--color-brand-navy)',
    background: 'var(--color-brand-navy)',
    color: '#FFFFFF',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
  },
  exportButton: {
    padding: '0 16px',
    height: 36,
    boxSizing: 'border-box',
    borderRadius: 6,
    border: '1px solid var(--color-brand-navy)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-brand-navy)',
    fontSize: 14,
    fontWeight: 500,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
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
    background: 'var(--color-bg-card)',
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
    background: 'var(--color-bg-card)',
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
    border: 'var(--border-normal)',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
  bulkApproveBtn: {
    background: '#059669',
    color: 'var(--color-text-on-brand)',
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
    background: 'var(--color-bg-card)',
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
  buttonApprove: { background: '#059669', color: 'var(--color-text-on-brand)' },
  buttonReject: { background: '#DC2626', color: 'var(--color-text-on-brand)' },
  buttonReopen: { background: 'var(--color-text-tertiary)', color: 'var(--color-text-on-brand)' },
};
