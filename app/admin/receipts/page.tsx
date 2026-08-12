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
import { Trash2, Wrench, X, AlertTriangle, Landmark, Copy } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../hooks/usePageError';
import type { AdminReceiptRow } from './receipt-types';
import { MaintenancePicker, maintLinkStateChip, maintLinkStyles } from './MaintenanceLink';
import { PromoteToAssetPanel } from './PromoteToAsset';
import { receiptTaxLine } from '@/lib/finance/tax-summary';
import JobRefPicker from '@/app/admin/components/jobs/JobRefPicker';
import type { ReceiptAiHealth } from '@/app/api/admin/receipts/ai-health/route';

// ── Types — mirror app/api/admin/receipts/route.ts ────────────────────────────


interface ListResponse {
  receipts: AdminReceiptRow[];
  counters: {
    pending: number;
    approved: number;
    rejected: number;
    exported: number;
    /** R7 — only meaningful while the needs-review tab is active; the other tabs fetch a
     *  different set of rows and it reads 0. */
    needs_review: number;
    total: number;
  };
}

// R7 — 'needs_review' is not a receipt status; it is a question about the extraction, and a receipt
// in ANY status can be in it. It rides on the same tab strip because that is where a bookkeeper
// already chooses what to look at, and it is listed last so it does not displace the daily queue.
const STATUS_TABS = ['pending', 'approved', 'rejected', 'exported', 'needs_review'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const TAB_LABELS: Record<StatusTab, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  exported: 'Exported',
  needs_review: 'Needs review',
};

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
  /** Whether this deployment can run the AI at all, and what is waiting. Null until the first check. */
  const [aiHealth, setAiHealth] = useState<ReceiptAiHealth | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Bulk-approve selection (Batch JJ). Only meaningful on the
  // 'pending' tab — when the bookkeeper switches tabs we drop the
  // selection so a stale set can't leak to the wrong status.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkBusy, setBulkBusy] = useState(false);

  // ── THE JOB LIST USED TO BE FETCHED HERE, ALL 500 OF IT (R5, 2026-08-11) ──────────────────────
  //
  // This page pulled `/api/admin/jobs?limit=500` on mount and rendered every row into a native
  // `<select>` on each expanded receipt. Three things were wrong with that, and only the first is
  // cosmetic:
  //
  //   1. On a phone a 500-option `<select>` is a scroll wheel nobody can aim.
  //   2. It truncated at 500 SILENTLY — past that, the job you want is simply not in the list, and
  //      the control gives you no way to tell that from "this job does not exist".
  //   3. It could only ever offer jobs that already exist, which is exactly the case the owner
  //      raised: *"it might be that we have not created a job yet on the backend, but that we are
  //      working on that job."*
  //
  // `JobRefPicker` searches server-side, so there is no cap and no upfront fetch, and it can offer
  // to create the job when the search comes back empty.

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

  // Re-checked whenever the list reloads, so pressing "Run AI" and watching the notice clear is the
  // confirmation that the deployment is healthy again — rather than a stale banner that has to be
  // reasoned about. Silent on failure: a diagnostic that breaks the page it diagnoses is worse than
  // no diagnostic.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/admin/receipts/ai-health')
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => { if (!cancelled && h) setAiHealth(h as ReceiptAiHealth); })
      .catch(() => { /* non-admins get 403; the banner simply does not appear */ });
    return () => { cancelled = true; };
  }, [data]);

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

      {/* ── SAY WHEN THE AI IS NOT RUNNING (owner, 2026-08-12) ────────────────────────────────────
          Ten receipts sat unread for a day while every surface stayed quiet: `extractReceipt` throws
          before it claims the row when the API key is missing (so no error is recorded ON the row),
          the capture page's kick is `.catch(() => {})` by design, and the cron answers 200 `skipped`.
          Three reasonable local choices adding up to a system that could not tell anyone it was off.
          This is the one place that says it out loud. */}
      {aiHealth?.message && (
        <div style={aiHealth.canRun ? styles.aiNoticeWarn : styles.aiNoticeStop} role="status">
          <strong>{aiHealth.canRun ? 'Receipts are waiting' : 'The receipt AI is switched off'}</strong>
          <div>{aiHealth.message}</div>
          {/* Photos are safe either way, and that is the first thing anyone will want to know. */}
          {!aiHealth.canRun && (
            <div style={styles.aiNoticeCalm}>
              Every photo uploaded is already stored. Nothing has been lost, and the hourly sweep will
              read the backlog once the key is set.
            </div>
          )}
        </div>
      )}

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
            {TAB_LABELS[s]}{' '}
            <span style={styles.tabCount}>{counters[s] ?? 0}</span>
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
  // R7 — the manual extraction trigger's own state, kept apart from `busy` (which gates the
  // approve/reject workflow). Running the AI is not a workflow decision and must not disable the
  // buttons that are.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  const wrap = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    try {
      await onMutate(row.id, body, label);
    } finally {
      setBusy(null);
    }
  };

  /**
   * R7 — run the extraction on demand.
   *
   * The reason this button has to exist: before it, a receipt whose extraction failed was stuck
   * that way. `extraction_status = 'failed'` is terminal for both automatic paths — the capture
   * page's kick already happened, and the cron sweep deliberately skips `failed` rows so a
   * permanently unreadable photo is not re-billed every hour forever. Recovering a receipt meant a
   * database edit. Now it means a click.
   *
   * `force` is sent only when the receipt is already `done`, so a re-read is always an explicit
   * human choice and no automatic path can re-bill a finished receipt.
   */
  const runAi = async () => {
    if (aiBusy) return;
    const alreadyDone = row.extraction_status === 'done';
    if (
      alreadyDone &&
      typeof window !== 'undefined' &&
      !window.confirm(
        'Re-read this receipt with the AI? It costs a fraction of a cent, and it will only fill fields that are still empty — anything you have typed is kept.',
      )
    ) {
      return;
    }
    setAiBusy(true);
    setAiMsg(null);
    try {
      const res = await fetch(`/api/admin/receipts/${row.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: alreadyDone }),
      });
      const json = (await res.json().catch(() => null)) as {
        result?: { status: string; error?: string; costCents?: number };
        error?: string;
      } | null;
      if (!res.ok) throw new Error(json?.error ?? `request failed: ${res.status}`);
      if (json?.result?.status === 'done') {
        setAiMsg(
          `✓ Read it${json.result.costCents ? ` · ${formatCents(json.result.costCents)}` : ''}.`,
        );
      } else {
        // A per-receipt failure comes back 200 with a failed result — the endpoint reserves
        // non-2xx for "the AI is not available at all". Both are shown, in the words of what went
        // wrong, because "try again" is the right response to one and not to the other.
        setAiMsg(`⚠ ${json?.result?.error ?? 'The AI could not read this one.'}`);
      }
      await onRefresh();
    } catch (err) {
      setAiMsg(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiBusy(false);
    }
  };

  const total = formatCents(row.total_cents);
  const date = formatDateTime(row.transaction_at ?? row.created_at);
  // R6 — per-field confidence, defaulted so every read below is a plain lookup rather than a chain
  // of optional accesses. An absent entry means the AI did not populate that field, which is not the
  // same as low confidence and correctly leaves it unmarked.
  const conf: Record<string, number | undefined> = row.ai_confidence_per_field ?? {};
  const statusColor = STATUS_COLORS[row.status] ?? 'var(--color-text-tertiary)';

  // Build a compact AI-extraction status caption.
  const aiCaption = useMemo(() => {
    // ── "AI working…" WAS A GUESS, AND IT WAS WRONG FOR A DAY (owner, 2026-08-12) ─────────────────
    //
    // `queued` means "nothing has picked this up yet" and `running` means "a call is in flight". This
    // reported both as work in progress, so ten receipts that were never read said "AI working…"
    // indefinitely — the same failure the R3 note describes ("the queue cheerfully rendered 'AI
    // working…' about a worker that was never going to arrive"), still present because the caption
    // only ever looked at the status and never at the clock.
    //
    // A queue entry older than the time the whole pipeline is supposed to take is not in progress; it
    // is waiting for something that is not coming. Saying so is what sends someone to the banner.
    if (row.extraction_status === 'queued') {
      const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60_000;
      return ageMin > 10 ? 'AI has not read this yet — see the notice above' : 'Queued for AI…';
    }
    if (row.extraction_status === 'running') {
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
    // `created_at` joined the dependency list when the queued branch started reading the clock to
    // tell "just uploaded" from "nothing is coming". Omitting it would freeze the caption at whatever
    // it said on first render — the row would keep claiming "Queued for AI…" an hour later.
  }, [row.extraction_status, row.extraction_error, row.extraction_cost_cents, row.created_at]);

  return (
    <div style={styles.row}>
      {/* M7. This wrapper is the fix for a defect that had made the entire expanded panel — the photo,
          the AI summary, the review flags, every field and the line items — invisible.
          `styles.row` is `display: flex` (Batch JJ added it so the bulk-approve checkbox could sit
          beside the summary) with no `flexDirection`, so the checkbox, the summary button AND the
          expanded panel were three items in a ROW. The panel was laid out to the RIGHT of a button
          that is `width: 100%`, and `overflow: hidden` on the card then clipped it away entirely.
          Measured at 390px: the panel's box sat at x=269..553 inside a 326px card. On desktop it was
          equally misplaced and merely happened to still be on screen (x=678..1189 at 1280px).

          Nobody saw it because the `receipts` table is empty (R4), so no row has ever been expanded —
          the defect needed data to be visible, and R6 shipped its contents against tsc and unit tests.

          So: the card is a COLUMN of [header, expanded], and the checkbox + summary are a row inside
          the header. Expressed structurally rather than as a `flex-wrap` trick, because the intent is
          that the panel is BELOW the header, not that it happens to run out of room beside it. */}
      <div style={styles.rowHeader}>
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
      </div>

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

          {/* ── R6: what the AI read, before the raw fields ────────────────────────────────────
              Order is the argument. The summary is one sentence answering "what is this?", which is
              the question somebody scrolling fifty receipts is actually asking; the flags are the
              only thing that can require action. Both sit ABOVE the field list because a warning
              underneath twenty rows of data is a warning nobody meets until after they have
              decided. */}
          <div style={styles.aiPanel}>
            <div style={styles.aiHeaderRow}>
              {row.ai_extras?.summary ? (
                <p style={styles.aiSummary}>{row.ai_extras.summary}</p>
              ) : (
                <p style={styles.aiSummaryEmpty}>
                  {row.extraction_status === 'failed'
                    ? 'The AI could not read this one.'
                    : row.extraction_status === 'done'
                      ? 'Read by AI — no summary recorded.'
                      : row.extraction_status === 'running'
                        ? 'The AI is reading it now…'
                        : 'Not read by the AI yet.'}
                </p>
              )}
              <button
                type="button"
                onClick={() => void runAi()}
                disabled={aiBusy}
                style={styles.aiButton}
                title="Send the photo to Claude Vision and fill in the fields it can read."
              >
                {aiBusy
                  ? 'Reading…'
                  : row.extraction_status === 'done'
                    ? 'Run AI again'
                    : 'Run AI'}
              </button>
            </div>
            {aiMsg ? <div style={styles.aiMsg}>{aiMsg}</div> : null}

            {/* Advisory, and it must read that way. A band that fires on ordinary receipts is one
                people learn to scroll past — which is how the one real problem gets approved along
                with the rest. The extractor is told an empty array is the common, correct answer. */}
            {(row.ai_extras?.review_flags?.length ?? 0) > 0 ? (
              <div style={styles.flagBand} role="note">
                <strong style={styles.flagTitle}>
                  <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
                  Worth a look before approving
                </strong>
                <ul style={styles.flagList}>
                  {row.ai_extras!.review_flags!.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* A possible duplicate is surfaced, never auto-discarded: two $5 coffees on the same
                day are both real, and only a person can tell those from one receipt photographed
                twice. */}
            {row.dedup_match_id ? (
              <div style={styles.dupBand} role="note">
                <Copy size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
                Looks like a possible duplicate — same vendor, total and date as an earlier receipt
                from this person. Check before approving; it may still be a genuine second purchase.
              </div>
            ) : null}
          </div>

          <dl style={styles.fields}>
            {/* `conf` reads the per-field scores the extractor stored. The total is the one that
                matters most — a doubtful total is the difference between the books balancing and
                not — so it is marked like the rest rather than exempted for being important. */}
            <Field
              label="Vendor address"
              value={row.vendor_address}
              confidence={conf.vendor_address}
            />
            <Field
              label="Subtotal"
              value={formatCents(row.subtotal_cents)}
              confidence={conf.subtotal_cents}
            />
            <Field label="Tax" value={formatCents(row.tax_cents)} confidence={conf.tax_cents} />
            <Field label="Tip" value={formatCents(row.tip_cents)} confidence={conf.tip_cents} />
            <Field label="Total" value={total} confidence={conf.total_cents} />
            {row.ai_extras?.discount_cents ? (
              <Field label="Discount" value={formatCents(row.ai_extras.discount_cents)} />
            ) : null}
            <Field
              label="Payment"
              value={
                // Brand + method + last four is how a person identifies a card, so it is written
                // the way they would say it out loud rather than as three separate rows.
                [row.ai_extras?.card_brand, row.payment_method].filter(Boolean).join(' ') || null
              }
            />
            <Field label="Last 4" value={row.payment_last4} />
            <Field label="Receipt #" value={row.ai_extras?.receipt_number} />
            <Field label="Vendor phone" value={row.ai_extras?.vendor_phone} />
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
            {/* F7c — was an IIFE here. Moved to `receiptTaxLine()` because inline meant the only
                way to see its output was to expand a real receipt row in a browser, and F3b/F7a
                went out recorded as shipped-but-unverified for exactly that reason. The verdict AND
                the rule behind it, because the precedence is surprising the first time you meet it:
                a "fully deductible" category can correctly read "not our transaction". */}
            <Field label="Tax summary" value={receiptTaxLine(row)} />
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

          {/* R6 — the transcribed lines. This is the part a bookkeeper genuinely cannot rebuild
              later: the photo fades, the paper goes in a drawer, and "$84.19 at a hardware store"
              stops being answerable six months on. Rendered only when there are lines — a fuel slip
              or a toll has none, and an empty table would read as a failed extraction rather than a
              receipt that simply is not itemised. */}
          {row.line_items.length > 0 ? (
            <div style={styles.lineItems}>
              <strong style={styles.lineItemsTitle}>
                What was on it ({row.line_items.length}{' '}
                {row.line_items.length === 1 ? 'line' : 'lines'})
              </strong>
              {/* The wrapper scrolls, not the page (M4's rule): amounts stay column-aligned so they
                  can be compared, which is the only reason this is a table at all. */}
              <div style={styles.lineItemsScroll}>
                <table style={styles.lineTable}>
                  <thead>
                    <tr>
                      <th style={styles.lineTh}>Item</th>
                      <th style={{ ...styles.lineTh, ...styles.lineThNum }}>Qty</th>
                      <th style={{ ...styles.lineTh, ...styles.lineThNum }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.line_items.map((li) => (
                      <tr key={li.id}>
                        <td style={styles.lineTd}>{li.description || '—'}</td>
                        <td style={{ ...styles.lineTd, ...styles.lineTdNum }}>
                          {li.quantity ?? '—'}
                        </td>
                        <td style={{ ...styles.lineTd, ...styles.lineTdNum }}>
                          {formatCents(li.amount_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Transcription is not arithmetic, and saying so stops somebody treating the lines as
                  the authority when they disagree with the printed total. */}
              <p style={styles.lineItemsNote}>
                Read from the photo by AI. The receipt&rsquo;s own total above is what gets
                approved.
              </p>
            </div>
          ) : null}

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
            {/* R5 — searches server-side and can create the job it cannot find. The value is
                reconstructed from the columns the list API already annotates onto the row
                (`job_name` / `job_number`), so selecting a job needs no extra fetch to render
                what is currently selected. */}
            <div style={styles.editJob}>
              <JobRefPicker
                compact
                label="Job"
                value={
                  row.job_id
                    ? {
                        id: row.job_id,
                        name: row.job_name ?? '(unnamed job)',
                        job_number: row.job_number,
                      }
                    : null
                }
                disabled={!!busy}
                clearLabel="— Unassigned (office / overhead) —"
                onChange={(picked) =>
                  void wrap('assigning job', { job_id: picked?.id ?? null })
                }
              />
            </div>
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



/** Below this, the AI is telling us it was guessing — inferred or partial, per the prompt's own
 *  scale (1.0 printed and clear, 0.5 inferred, 0.2 best-guess). */
const LOW_CONFIDENCE = 0.6;

function Field({
  label,
  value,
  confidence,
}: {
  label: string;
  value: string | null | undefined;
  /** R6 — 0..1 the model reported for THIS field. Undefined when it didn't populate the field, or
   *  when no extraction has run. */
  confidence?: number | null;
}) {
  // Only the low ones are marked.
  //
  // The alternative — a percentage beside every value — was rejected: eighteen confident numbers
  // wearing "97%" teaches the eye to skip the badge, and then the one that says "20%" gets skipped
  // with them. Marking only what is doubtful means the mark still means something.
  const doubtful =
    typeof confidence === 'number' && Number.isFinite(confidence) && confidence < LOW_CONFIDENCE;
  return (
    <div style={styles.fieldRow}>
      <dt style={styles.fieldLabel}>{label}</dt>
      <dd style={styles.fieldValue}>
        {value || '—'}
        {doubtful && value ? (
          <span
            style={styles.lowConf}
            title={`The AI was ${Math.round(confidence! * 100)}% sure of this — check it against the photo.`}
          >
            ?
          </span>
        ) : null}
      </dd>
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
  return { pending: 0, approved: 0, rejected: 0, exported: 0, needs_review: 0, total: 0 };
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
    // Keeps the children inside the rounded corners. It is also what turned the misplaced expanded
    // panel from "off to the side" into "gone", so it is worth knowing this clips: anything that must
    // be visible has to be laid out inside the card, not merely appended to it.
    overflow: 'hidden',
    display: 'flex',
    // M7. Was absent, which defaulted to `row` and put the expanded panel beside the summary button
    // instead of below it. See the comment on the wrapper in the JSX.
    flexDirection: 'column',
  },
  // The checkbox and the summary button DO belong side by side — that is the part Batch JJ wanted,
  // and it stays a row. `alignItems: stretch` so the checkbox's hit area is the full row height.
  rowHeader: {
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
    // M7. This was `minmax(200px, 320px) 1fr`, a hard two-column split that cannot fit a phone: at
    // 390px the row has 334px of usable width, so the photo took 200 and the entire field list was
    // left 110 — and `1fr` will not shrink below its content's min-width, so a long merchant name or
    // job number pushed the row off the screen.
    //
    // `auto-fit` + `minmax(min(220px, 100%), 1fr)` collapses to ONE column whenever the container is
    // too narrow for two, and returns to two the moment there is room. The `min(220px, 100%)` is the
    // part that matters: a bare `minmax(220px, 1fr)` still demands 220px in a 180px container and
    // overflows it.
    //
    // It has to be expressed this way rather than in a media query because this is an inline style
    // object — no stylesheet can reach it, which is exactly how it stayed wrong.
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
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
  // ── R6 — the AI's reading, above the raw fields ────────────────────────────────────────────────
  aiPanel: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
  },
  // Wraps on a phone so the button drops under the sentence instead of squeezing it to one word
  // per line — M4's reformat-rather-than-overflow rule, applied at the point of change.
  aiHeaderRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 10,
    minWidth: 0,
  },
  aiSummary: {
    flex: '1 1 220px',
    margin: 0,
    fontSize: 14,
    lineHeight: 1.45,
    color: 'var(--theme-fg-primary, #1F2937)',
    fontStyle: 'italic',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  aiSummaryEmpty: {
    flex: '1 1 220px',
    margin: 0,
    fontSize: 13,
    color: 'var(--theme-fg-tertiary, #6B7280)',
    minWidth: 0,
  },
  aiButton: {
    flexShrink: 0,
    minHeight: 36,
    padding: '0 14px',
    borderRadius: 6,
    border: '1px solid var(--color-brand-navy, #1E3A5F)',
    background: 'transparent',
    color: 'var(--color-brand-navy, #1E3A5F)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  aiMsg: { fontSize: 12.5, color: 'var(--theme-fg-secondary, #374151)', overflowWrap: 'anywhere' },
  // The two states are deliberately different colours: amber means "something is waiting", red
  // means "this cannot run at all". Collapsing them would make a configuration outage look like a
  // queue that is merely slow — precisely the confusion that let ten receipts sit unread for a day.
  aiNoticeStop: {
    border: '1px solid #DC2626',
    background: '#FEF2F2',
    color: '#7F1D1D',
    borderRadius: 8,
    padding: '12px 14px',
    marginBottom: 16,
    fontSize: 13.5,
    lineHeight: 1.5,
    display: 'grid',
    gap: 6,
  },
  aiNoticeWarn: {
    border: '1px solid #F59E0B',
    background: '#FFFBEB',
    color: '#92400E',
    borderRadius: 8,
    padding: '12px 14px',
    marginBottom: 16,
    fontSize: 13.5,
    lineHeight: 1.5,
    display: 'grid',
    gap: 6,
  },
  aiNoticeCalm: { fontSize: 12.5, opacity: 0.85 },
  flagBand: {
    border: '1px solid #F59E0B',
    background: '#FFFBEB',
    borderRadius: 6,
    padding: '8px 12px',
    minWidth: 0,
  },
  flagTitle: { fontSize: 12.5, color: '#92400E', display: 'block', marginBottom: 4 },
  flagList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 12.5,
    color: '#92400E',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflowWrap: 'anywhere',
  },
  dupBand: {
    border: '1px solid #7C3AED',
    background: '#F5F3FF',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 12.5,
    color: '#5B21B6',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  // The doubt marker. Small, quiet, and only ever on values the model itself flagged as inferred —
  // see the note on `Field`.
  lowConf: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 15,
    height: 15,
    marginLeft: 6,
    borderRadius: '50%',
    border: '1px solid #D97706',
    color: '#D97706',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'help',
    verticalAlign: '1px',
  },
  // ── R6 — line items ───────────────────────────────────────────────────────────────────────────
  lineItems: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  lineItemsTitle: { fontSize: 13, color: 'var(--theme-fg-secondary, #374151)' },
  // M4's rule, applied here rather than left for the sweep: the TABLE scrolls, the page does not.
  // A table is the right form for this because the amounts are meant to be compared down the
  // column — restacking it into cards on a phone would destroy the only reason it is a table.
  lineItemsScroll: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    background: 'var(--color-bg-card, #FFFFFF)',
    minWidth: 0,
  },
  lineTable: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  lineTh: {
    textAlign: 'left',
    padding: '6px 10px',
    borderBottom: '1px solid #E5E7EB',
    color: 'var(--theme-fg-tertiary, #6B7280)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  lineThNum: { textAlign: 'right' },
  lineTd: {
    padding: '6px 10px',
    borderBottom: '1px solid #F3F4F6',
    color: 'var(--theme-fg-primary, #1F2937)',
  },
  lineTdNum: { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  lineItemsNote: {
    margin: 0,
    fontSize: 11.5,
    color: 'var(--theme-fg-tertiary, #6B7280)',
    fontStyle: 'italic',
  },
  fields: { margin: 0, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
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
  // The job picker owns a dropdown that is absolutely positioned against this box, so it needs a
  // width to grow into rather than the shrink-to-fit that `editLabel`'s siblings get. `minWidth: 0`
  // keeps it from forcing the flex row wider than the phone — the shape M4 exists to hunt down.
  editJob: { flex: '1 1 240px', minWidth: 0 },
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
