// app/admin/equipment/consumables/page.tsx — §5.12.7.5 (F10.6-d-ii)
//
// Consumables low-stock + restock view. Flat table consuming
// the F10.6-d-i aggregator at GET /api/admin/equipment/consumables.
// Per-row reorder badge surfaces the reorder_now / reorder_soon
// / ok tier; restock / threshold / discontinue modals land in
// F10.6-d-iii as a follow-up batch.
//
// Sort defaults to days-remaining ASC (lowest rolls top) per
// the spec; clicking a header column re-sorts client-side.
//
// Auth: EQUIPMENT_ROLES via aggregator.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

type ReorderBadge = 'reorder_now' | 'reorder_soon' | 'ok';

interface ConsumableRow {
  id: string;
  name: string | null;
  category: string | null;
  unit: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  vendor: string | null;
  cost_per_unit_cents: number | null;
  last_restocked_at: string | null;
  consumed_30d: number;
  daily_rate: number | null;
  days_remaining: number | null;
  reorder_badge: ReorderBadge;
}

interface ConsumablesResponse {
  rows: ConsumableRow[];
  summary: {
    total: number;
    reorder_now: number;
    reorder_soon: number;
    ok: number;
    window_days: number;
  };
}

type SortKey = 'days_remaining' | 'name' | 'consumed_30d' | 'on_hand';

interface RestockTarget {
  id: string;
  name: string;
  vendor: string | null;
  unit: string | null;
  current_on_hand: number;
}

interface ThresholdTarget {
  id: string;
  name: string;
  unit: string | null;
  current_threshold: number | null;
  current_on_hand: number;
}

interface DiscontinueTarget {
  id: string;
  name: string;
  unit: string | null;
  current_on_hand: number;
}

function formatDaysRemaining(d: number | null): string {
  if (d === null) return '—';
  if (d >= 999) return '999+';
  if (d < 1) return '<1';
  return d.toFixed(1);
}

function formatCurrency(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

export default function EquipmentConsumablesPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('EquipmentConsumablesPage');

  const [data, setData] = useState<ConsumablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReorderBadge | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('days_remaining');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [restockTarget, setRestockTarget] = useState<RestockTarget | null>(null);
  const [thresholdTarget, setThresholdTarget] = useState<ThresholdTarget | null>(null);
  const [discontinueTarget, setDiscontinueTarget] = useState<DiscontinueTarget | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchConsumables = useCallback(async () => {
    setLoading(true);
    const res = await safeFetch<ConsumablesResponse>(
      '/api/admin/equipment/consumables'
    );
    setLoading(false);
    if (res) setData(res);
  }, [safeFetch]);

  useEffect(() => {
    void fetchConsumables();
  }, [fetchConsumables]);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    let rows =
      filter === 'all'
        ? data.rows.slice()
        : data.rows.filter((r) => r.reorder_badge === filter);
    rows.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'days_remaining') {
        const av = a.days_remaining ?? Number.POSITIVE_INFINITY;
        const bv = b.days_remaining ?? Number.POSITIVE_INFINITY;
        if (av !== bv) return (av - bv) * dir;
        return (a.name ?? a.id).localeCompare(b.name ?? b.id);
      }
      if (sortKey === 'name') {
        return (
          (a.name ?? a.id).localeCompare(b.name ?? b.id) * dir
        );
      }
      if (sortKey === 'consumed_30d') {
        return (a.consumed_30d - b.consumed_30d) * dir;
      }
      // on_hand
      const av = a.quantity_on_hand ?? 0;
      const bv = b.quantity_on_hand ?? 0;
      return (av - bv) * dir;
    });
    return rows;
  }, [data, filter, sortKey, sortDir]);

  const onHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'asc');
    }
  };

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Consumables — low-stock + restock</h1>
          <p style={styles.subtitle}>
            §5.12.7.5 — sorted by days-remaining ASC (lowest rolls
            float to the top). Burn rate from the trailing 30 days
            of returned consumables.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchConsumables()}
          style={styles.refreshBtn}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      {data ? (
        <>
          <div style={styles.summaryBar}>
            <FilterChip
              label={`All · ${data.summary.total}`}
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
            <FilterChip
              label={`Reorder NOW · ${data.summary.reorder_now}`}
              active={filter === 'reorder_now'}
              accent="red"
              onClick={() => setFilter('reorder_now')}
            />
            <FilterChip
              label={`Reorder soon · ${data.summary.reorder_soon}`}
              active={filter === 'reorder_soon'}
              accent="amber"
              onClick={() => setFilter('reorder_soon')}
            />
            <FilterChip
              label={`OK · ${data.summary.ok}`}
              active={filter === 'ok'}
              accent="green"
              onClick={() => setFilter('ok')}
            />
            <span style={styles.muted}>
              Window: trailing {data.summary.window_days} days
            </span>
          </div>

          {visibleRows.length === 0 ? (
            <div style={styles.empty}>
              No rows match the current filter.
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Status</th>
                  <th
                    style={styles.thSortable}
                    onClick={() => onHeaderClick('name')}
                  >
                    Name {sortIndicator(sortKey, sortDir, 'name')}
                  </th>
                  <th style={styles.th}>Category</th>
                  <th
                    style={styles.thSortableRight}
                    onClick={() => onHeaderClick('on_hand')}
                  >
                    On hand {sortIndicator(sortKey, sortDir, 'on_hand')}
                  </th>
                  <th style={styles.thRight}>Threshold</th>
                  <th
                    style={styles.thSortableRight}
                    onClick={() => onHeaderClick('consumed_30d')}
                  >
                    30d used {sortIndicator(sortKey, sortDir, 'consumed_30d')}
                  </th>
                  <th
                    style={styles.thSortableRight}
                    onClick={() => onHeaderClick('days_remaining')}
                  >
                    Days left {sortIndicator(sortKey, sortDir, 'days_remaining')}
                  </th>
                  <th style={styles.th}>Vendor</th>
                  <th style={styles.thRight}>Unit cost</th>
                  <th style={styles.thRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} style={rowStyleFor(r.reorder_badge)}>
                    <td style={styles.td}>
                      <BadgePill badge={r.reorder_badge} />
                    </td>
                    <td style={styles.td}>
                      <Link
                        href={`/admin/equipment/${r.id}`}
                        style={styles.link}
                      >
                        {r.name ?? r.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td style={styles.td}>
                      {r.category ?? <span style={styles.muted}>—</span>}
                    </td>
                    <td style={styles.tdRight}>
                      {r.quantity_on_hand ?? 0}
                      {r.unit ? <span style={styles.muted}> {r.unit}</span> : null}
                    </td>
                    <td style={styles.tdRight}>
                      {r.low_stock_threshold ?? (
                        <span style={styles.muted}>—</span>
                      )}
                    </td>
                    <td style={styles.tdRight}>{r.consumed_30d}</td>
                    <td style={styles.tdRight}>
                      {formatDaysRemaining(r.days_remaining)}
                    </td>
                    <td style={styles.td}>
                      {r.vendor ?? <span style={styles.muted}>—</span>}
                    </td>
                    <td style={styles.tdRight}>
                      {formatCurrency(r.cost_per_unit_cents)}
                    </td>
                    <td style={styles.tdRight}>
                      <div style={styles.actionRow}>
                        <button
                          type="button"
                          style={styles.actionBtn}
                          onClick={() => {
                            setActionMsg(null);
                            setRestockTarget({
                              id: r.id,
                              name: r.name ?? r.id,
                              vendor: r.vendor,
                              unit: r.unit,
                              current_on_hand: r.quantity_on_hand ?? 0,
                            });
                          }}
                        >
                          Restock
                        </button>
                        <button
                          type="button"
                          style={styles.actionBtnSecondary}
                          onClick={() => {
                            setActionMsg(null);
                            setThresholdTarget({
                              id: r.id,
                              name: r.name ?? r.id,
                              unit: r.unit,
                              current_threshold: r.low_stock_threshold,
                              current_on_hand: r.quantity_on_hand ?? 0,
                            });
                          }}
                        >
                          Threshold
                        </button>
                        <button
                          type="button"
                          style={styles.actionBtnDanger}
                          onClick={() => {
                            setActionMsg(null);
                            setDiscontinueTarget({
                              id: r.id,
                              name: r.name ?? r.id,
                              unit: r.unit,
                              current_on_hand: r.quantity_on_hand ?? 0,
                            });
                          }}
                        >
                          Discontinue
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {actionMsg ? <div style={styles.actionMsg}>{actionMsg}</div> : null}
          <p style={styles.note}>
            ▸ Click a row name to drill into the catalogue page.
            Discontinued rows drop off this list once they retire.
          </p>
        </>
      ) : loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : (
        <div style={styles.empty}>
          Failed to load. Check the error log; refresh.
        </div>
      )}

      {restockTarget ? (
        <RestockModal
          target={restockTarget}
          onClose={() => setRestockTarget(null)}
          onRestocked={(newOnHand) => {
            const t = restockTarget;
            setRestockTarget(null);
            setActionMsg(
              `✓ Restocked ${t.name}. On-hand now ${newOnHand}.`
            );
            void fetchConsumables();
          }}
        />
      ) : null}

      {thresholdTarget ? (
        <ThresholdModal
          target={thresholdTarget}
          onClose={() => setThresholdTarget(null)}
          onUpdated={(newThreshold) => {
            const t = thresholdTarget;
            setThresholdTarget(null);
            setActionMsg(
              `✓ Updated ${t.name} threshold to ${newThreshold}.`
            );
            void fetchConsumables();
          }}
        />
      ) : null}

      {discontinueTarget ? (
        <DiscontinueModal
          target={discontinueTarget}
          onClose={() => setDiscontinueTarget(null)}
          onDiscontinued={() => {
            const t = discontinueTarget;
            setDiscontinueTarget(null);
            setActionMsg(
              `✓ Marked ${t.name} discontinued. It drops off this list ` +
                'on next refetch.'
            );
            void fetchConsumables();
          }}
        />
      ) : null}
    </div>
  );
}

function RestockModal({
  target,
  onClose,
  onRestocked,
}: {
  target: RestockTarget;
  onClose: () => void;
  onRestocked: (newOnHand: number) => void;
}) {
  const { safeFetch } = usePageError('RestockModal');
  const [quantity, setQuantity] = useState('1');
  const [costDollars, setCostDollars] = useState('');
  const [vendor, setVendor] = useState(target.vendor ?? '');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const qty = parseInt(quantity.trim(), 10);
      if (!Number.isInteger(qty) || qty < 1) {
        setError('Quantity must be a positive integer.');
        return;
      }
      const body: Record<string, unknown> = { quantity_added: qty };
      if (costDollars.trim()) {
        const dollars = parseFloat(costDollars.trim());
        if (!Number.isFinite(dollars) || dollars < 0) {
          setError('Cost must be a non-negative number.');
          return;
        }
        body.cost_cents = Math.round(dollars * 100);
      }
      if (vendor.trim()) body.vendor = vendor.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (photoUrl.trim()) body.receipt_photo_url = photoUrl.trim();

      setSubmitting(true);
      const res = await safeFetch<{
        new_quantity_on_hand: number;
      }>(`/api/admin/equipment/${target.id}/restock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSubmitting(false);
      if (res?.new_quantity_on_hand !== undefined) {
        onRestocked(res.new_quantity_on_hand);
      } else {
        setError('Restock failed. Check the error log; the form is unchanged.');
      }
    },
    [quantity, costDollars, vendor, notes, photoUrl, safeFetch, target, onRestocked]
  );

  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <form
        style={modalStyles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header style={modalStyles.header}>
          <div>
            <h2 style={modalStyles.title}>Restock arrived</h2>
            <p style={modalStyles.subtitle}>
              {target.name} · current on-hand{' '}
              <strong>
                {target.current_on_hand}
                {target.unit ? ` ${target.unit}` : ''}
              </strong>
            </p>
          </div>
          <button
            type="button"
            style={modalStyles.close}
            onClick={onClose}
            aria-label="Close"
            disabled={submitting}
          >
            ✕
          </button>
        </header>

        <div style={modalStyles.body}>
          <label style={modalStyles.field}>
            <span style={modalStyles.label}>Quantity added *</span>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min={1}
              step={1}
              required
              autoFocus
              style={modalStyles.input}
            />
            <span style={modalStyles.hint}>
              ▸ Increments quantity_on_hand by this number.
              Stamps last_restocked_at + writes an audit event.
            </span>
          </label>

          <div style={modalStyles.gridRow}>
            <label style={modalStyles.field}>
              <span style={modalStyles.label}>Total cost ($)</span>
              <input
                type="number"
                value={costDollars}
                onChange={(e) => setCostDollars(e.target.value)}
                min={0}
                step={0.01}
                placeholder="optional"
                style={modalStyles.input}
              />
              <span style={modalStyles.hint}>
                ▸ Per-unit cost = total / quantity. Updates
                cost_per_unit_cents when set.
              </span>
            </label>
            <label style={modalStyles.field}>
              <span style={modalStyles.label}>Vendor</span>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="optional"
                style={modalStyles.input}
              />
            </label>
          </div>

          <label style={modalStyles.field}>
            <span style={modalStyles.label}>Receipt photo URL</span>
            <input
              type="text"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="paste URL from a prior receipt upload"
              style={modalStyles.input}
            />
            <span style={modalStyles.hint}>
              ▸ Attaches to the audit-trail event row.
              File-bucket-upload UI is a future polish.
            </span>
          </label>

          <label style={modalStyles.field}>
            <span style={modalStyles.label}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...modalStyles.input, minHeight: 60 }}
              placeholder="optional context — e.g. 'short-shipped: ordered 100, received 75'"
            />
          </label>

          {error ? <div style={modalStyles.error}>⚠ {error}</div> : null}
        </div>

        <footer style={modalStyles.footer}>
          <button
            type="button"
            style={modalStyles.secondaryBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={modalStyles.primaryBtn}
            disabled={submitting}
          >
            {submitting ? 'Restocking…' : 'Restock'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function FilterChip({
  label,
  active,
  accent,
  onClick,
}: {
  label: string;
  active: boolean;
  accent?: 'red' | 'amber' | 'green';
  onClick: () => void;
}) {
  const base: React.CSSProperties = {
    padding: '4px 10px',
    border: '1px solid #E2E5EB',
    background: active ? '#1D3095' : '#FFFFFF',
    color: active ? '#FFFFFF' : '#374151',
    borderRadius: 999,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  };
  if (active && accent === 'red') {
    base.background = '#B91C1C';
    base.borderColor = '#B91C1C';
  } else if (active && accent === 'amber') {
    base.background = '#B45309';
    base.borderColor = '#B45309';
  } else if (active && accent === 'green') {
    base.background = '#15803D';
    base.borderColor = '#15803D';
  }
  return (
    <button type="button" onClick={onClick} style={base}>
      {label}
    </button>
  );
}

function BadgePill({ badge }: { badge: ReorderBadge }) {
  if (badge === 'reorder_now') {
    return (
      <span style={{ ...styles.pill, ...styles.pillRed }}>Reorder NOW</span>
    );
  }
  if (badge === 'reorder_soon') {
    return (
      <span style={{ ...styles.pill, ...styles.pillAmber }}>Reorder soon</span>
    );
  }
  return <span style={{ ...styles.pill, ...styles.pillGreen }}>OK</span>;
}

function sortIndicator(
  current: SortKey,
  dir: 'asc' | 'desc',
  key: SortKey
): string {
  if (current !== key) return '';
  return dir === 'asc' ? '↑' : '↓';
}

function rowStyleFor(badge: ReorderBadge): React.CSSProperties {
  if (badge === 'reorder_now') {
    return { background: '#FEF2F2' };
  }
  if (badge === 'reorder_soon') {
    return { background: '#FFFBEB' };
  }
  return {};
}

function ThresholdModal({
  target,
  onClose,
  onUpdated,
}: {
  target: ThresholdTarget;
  onClose: () => void;
  onUpdated: (newThreshold: number) => void;
}) {
  const { safeFetch } = usePageError('ThresholdModal');
  const [threshold, setThreshold] = useState(
    target.current_threshold !== null
      ? String(target.current_threshold)
      : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const parsed = parseInt(threshold.trim(), 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setError('Threshold must be a non-negative integer.');
        return;
      }
      setSubmitting(true);
      const res = await safeFetch<{ row?: { low_stock_threshold: number | null } }>(
        `/api/admin/equipment/${target.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ low_stock_threshold: parsed }),
        }
      );
      setSubmitting(false);
      if (res?.row || res) {
        onUpdated(parsed);
      } else {
        setError('Update failed. Check the error log; the form is unchanged.');
      }
    },
    [threshold, safeFetch, target, onUpdated]
  );

  const previewBadge = (() => {
    const t = parseInt(threshold.trim(), 10);
    if (!Number.isInteger(t) || t < 0) return null;
    if (target.current_on_hand <= t) {
      return (
        <span style={modalStyles.previewRed}>
          ⚠ Current on-hand ({target.current_on_hand}) is at-or-below
          this threshold — row will flag Reorder NOW.
        </span>
      );
    }
    return (
      <span style={modalStyles.previewGreen}>
        ✓ Current on-hand ({target.current_on_hand}) is above this
        threshold.
      </span>
    );
  })();

  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <form
        style={modalStyles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header style={modalStyles.header}>
          <div>
            <h2 style={modalStyles.title}>Update threshold</h2>
            <p style={modalStyles.subtitle}>
              {target.name} · current threshold{' '}
              <strong>
                {target.current_threshold ?? '—'}
                {target.unit ? ` ${target.unit}` : ''}
              </strong>
            </p>
          </div>
          <button
            type="button"
            style={modalStyles.close}
            onClick={onClose}
            aria-label="Close"
            disabled={submitting}
          >
            ✕
          </button>
        </header>
        <div style={modalStyles.body}>
          <label style={modalStyles.field}>
            <span style={modalStyles.label}>New low-stock threshold *</span>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              min={0}
              step={1}
              required
              autoFocus
              style={modalStyles.input}
            />
            <span style={modalStyles.hint}>
              ▸ Drives the reorder-NOW gate in the F10.3-b
              availability check + the F10.6-d-i aggregator's
              badge tier. Use 0 to remove the floor entirely.
            </span>
          </label>
          {previewBadge ? (
            <div style={modalStyles.previewBox}>{previewBadge}</div>
          ) : null}
          {error ? <div style={modalStyles.error}>⚠ {error}</div> : null}
        </div>
        <footer style={modalStyles.footer}>
          <button
            type="button"
            style={modalStyles.secondaryBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={modalStyles.primaryBtn}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Save threshold'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function DiscontinueModal({
  target,
  onClose,
  onDiscontinued,
}: {
  target: DiscontinueTarget;
  onClose: () => void;
  onDiscontinued: () => void;
}) {
  const { safeFetch } = usePageError('DiscontinueModal');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    setError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Please provide a reason for the audit log.');
      return;
    }
    setSubmitting(true);
    const body: Record<string, unknown> = { reason: trimmed };
    if (notes.trim()) body.notes = notes.trim();
    const res = await safeFetch<{
      row?: { retired_at: string | null };
    }>(`/api/admin/equipment/${target.id}/retire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (res?.row || res) {
      onDiscontinued();
    } else {
      setError('Discontinue failed. Check the error log.');
    }
  }, [reason, notes, safeFetch, target, onDiscontinued]);

  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <div
        style={modalStyles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header style={modalStyles.header}>
          <h2 style={modalStyles.title}>Mark discontinued?</h2>
          <button
            type="button"
            style={modalStyles.close}
            onClick={onClose}
            aria-label="Close"
            disabled={submitting}
          >
            ✕
          </button>
        </header>
        <div style={modalStyles.body}>
          <p style={modalStyles.warningCopy}>
            Soft-archives <strong>{target.name}</strong>. Sets
            <code style={modalStyles.code}>retired_at = now()</code>;
            row drops off this list + the F10.3-b availability
            check refuses future reservations. Templates that pin
            this row surface in the §5.12.7.8 cleanup queue
            (F10.6-f). Reservation history is preserved per the
            §5.12.11.K chain-of-custody rule.
          </p>
          {target.current_on_hand > 0 ? (
            <div style={modalStyles.warningBox}>
              ⚠ {target.current_on_hand}
              {target.unit ? ` ${target.unit}` : ''} still on hand.
              Confirm you want to retire this anyway — the count
              becomes inaccessible after discontinue.
            </div>
          ) : null}
          <label style={modalStyles.field}>
            <span style={modalStyles.label}>Reason *</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. switched vendors / no longer stocked / formula change"
              style={modalStyles.input}
              required
              autoFocus
            />
          </label>
          <label style={modalStyles.field}>
            <span style={modalStyles.label}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...modalStyles.input, minHeight: 60 }}
              placeholder="optional context"
            />
          </label>
          {error ? <div style={modalStyles.error}>⚠ {error}</div> : null}
        </div>
        <footer style={modalStyles.footer}>
          <button
            type="button"
            style={modalStyles.secondaryBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            style={modalStyles.dangerBtn}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? 'Discontinuing…' : 'Mark discontinued'}
          </button>
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 1300, margin: '0 auto' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  h1: { fontSize: 22, fontWeight: 600, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#6B7280', margin: 0 },
  refreshBtn: {
    padding: '8px 14px',
    border: 'none',
    borderRadius: 6,
    background: '#1D3095',
    color: '#FFFFFF',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 500,
  },
  summaryBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    background: '#F9FAFB',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    marginBottom: 12,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
    fontSize: 13,
  },
  th: {
    textAlign: 'left' as const,
    padding: '10px 12px',
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
    padding: '10px 12px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  thSortable: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  thSortableRight: {
    textAlign: 'right' as const,
    padding: '10px 12px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #F1F2F4',
  },
  tdRight: {
    padding: '10px 12px',
    borderBottom: '1px solid #F1F2F4',
    textAlign: 'right' as const,
  },
  link: { color: '#1D3095', textDecoration: 'none', fontWeight: 500 },
  muted: { color: '#9CA3AF' },
  empty: {
    padding: 32,
    textAlign: 'center' as const,
    color: '#6B7280',
    fontSize: 13,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
  },
  pill: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    letterSpacing: '0.04em',
  },
  pillRed: { background: '#FEE2E2', color: '#7F1D1D' },
  pillAmber: { background: '#FEF3C7', color: '#78350F' },
  pillGreen: { background: '#DCFCE7', color: '#166534' },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 16,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
  actionRow: {
    display: 'flex',
    gap: 6,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    padding: '4px 10px',
    background: '#FFFFFF',
    border: '1px solid #1D3095',
    color: '#1D3095',
    borderRadius: 6,
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 500,
  },
  actionBtnSecondary: {
    padding: '4px 10px',
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    color: '#374151',
    borderRadius: 6,
    fontSize: 11,
    cursor: 'pointer',
  },
  actionBtnDanger: {
    padding: '4px 10px',
    background: '#FFFFFF',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    borderRadius: 6,
    fontSize: 11,
    cursor: 'pointer',
  },
  actionMsg: {
    margin: '12px 0',
    padding: '10px 14px',
    background: '#DCFCE7',
    border: '1px solid #86EFAC',
    color: '#166534',
    borderRadius: 8,
    fontSize: 13,
  },
};

const modalStyles: Record<string, React.CSSProperties> = {
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
  title: { fontSize: 16, fontWeight: 600, margin: '0 0 4px' },
  subtitle: { fontSize: 12, color: '#6B7280', margin: 0 },
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
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
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
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#374151' },
  input: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  hint: { fontSize: 11, color: '#6B7280', fontStyle: 'italic' as const },
  error: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
  },
  primaryBtn: {
    background: '#15803D',
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
  previewBox: {
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
    background: '#F9FAFB',
    border: '1px solid #E2E5EB',
  },
  previewRed: { color: '#7F1D1D' },
  previewGreen: { color: '#166534' },
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
  warningCopy: {
    margin: 0,
    fontSize: 13,
    color: '#374151',
    lineHeight: 1.5,
  },
  warningBox: {
    padding: 10,
    background: '#FFFBEB',
    border: '1px solid #FCD34D',
    color: '#78350F',
    borderRadius: 6,
    fontSize: 12,
  },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 12,
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
    margin: '0 4px',
  },
};
