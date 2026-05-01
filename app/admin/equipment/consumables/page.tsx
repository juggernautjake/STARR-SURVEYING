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
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={styles.note}>
            ▸ Restock-arrived / update-threshold / mark-discontinued
            inline actions land in F10.6-d-iii. Click a row name to
            drill into the catalogue page.
          </p>
        </>
      ) : loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : (
        <div style={styles.empty}>
          Failed to load. Check the error log; refresh.
        </div>
      )}
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
};
