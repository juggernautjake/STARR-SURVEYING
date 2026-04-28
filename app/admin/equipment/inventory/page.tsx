// app/admin/equipment/inventory/page.tsx — Equipment catalogue (Phase F10.1b)
//
// Read-only list view for every row in equipment_inventory. Consumes
// the F10.1a GET /api/admin/equipment endpoint. Subsequent F10.1
// steps add:
//   F10.1c: Add Unit modal + POST endpoint
//   F10.1d: Inline edit (PATCH + form)
//   F10.1e: Retire action (soft-archive)
//   F10.1f-g: QR sticker PDFs (single + bulk)
//   F10.1h: Bulk CSV import
//
// Auth: admin / developer / tech_support / equipment_manager.
// Style mirrors /admin/finances/page.tsx (inline styles, no shared
// stylesheet) so this batch lands without touching shared CSS.
//
// Sidebar entry NOT yet added — that lands in F10.6 alongside the
// rest of the Equipment dashboard group. Reachable in F10.1+ via
// direct URL.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

interface EquipmentRow {
  id: string;
  name: string | null;
  category: string | null;
  item_kind: string | null;
  current_status: string | null;
  qr_code_id: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  notes: string | null;
  acquired_cost_cents: number | null;
  next_calibration_due_at: string | null;
  unit: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  home_location: string | null;
  is_personal: boolean;
  retired_at: string | null;
  retired_reason: string | null;
  serial_suspect: boolean;
  created_at: string;
  updated_at: string;
}

interface CatalogueResponse {
  items: EquipmentRow[];
  total_count: number | null;
  filters_applied: {
    status: string | null;
    category: string | null;
    item_kind: string | null;
    include_retired: boolean;
    q: string | null;
  };
  limit: number;
}

type StatusFilter =
  | ''
  | 'available'
  | 'in_use'
  | 'maintenance'
  | 'loaned_out'
  | 'lost'
  | 'retired';
type ItemKindFilter = '' | 'durable' | 'consumable' | 'kit';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'available', label: 'Available' },
  { value: 'in_use', label: 'In use' },
  { value: 'maintenance', label: 'In maintenance' },
  { value: 'loaned_out', label: 'Loaned out' },
  { value: 'lost', label: 'Lost' },
  { value: 'retired', label: 'Retired' },
];

const ITEM_KIND_OPTIONS: Array<{ value: ItemKindFilter; label: string }> = [
  { value: '', label: 'All kinds' },
  { value: 'durable', label: 'Durable (per-unit)' },
  { value: 'consumable', label: 'Consumable (bulk)' },
  { value: 'kit', label: 'Kit (bundle)' },
];

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  available: { bg: '#DCFCE7', fg: '#15803D' },
  in_use: { bg: '#DBEAFE', fg: '#1D4ED8' },
  maintenance: { bg: '#FEF3C7', fg: '#92400E' },
  loaned_out: { bg: '#E0E7FF', fg: '#4338CA' },
  lost: { bg: '#FEE2E2', fg: '#B91C1C' },
  retired: { bg: '#F3F4F6', fg: '#6B7280' },
};

function dollars(cents: number | null): string {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatCategory(raw: string | null): string {
  if (!raw) return '—';
  return raw
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function EquipmentInventoryPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('EquipmentInventoryPage');

  const [status, setStatus] = useState<StatusFilter>('');
  const [itemKind, setItemKind] = useState<ItemKindFilter>('');
  const [includeRetired, setIncludeRetired] = useState(false);
  const [q, setQ] = useState('');
  const [data, setData] = useState<CatalogueResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (itemKind) params.set('item_kind', itemKind);
    if (includeRetired) params.set('include_retired', '1');
    if (q.trim()) params.set('q', q.trim());
    return params.toString();
  }, [status, itemKind, includeRetired, q]);

  const fetchInventory = useCallback(async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    const json = await safeFetch<CatalogueResponse>(
      `/api/admin/equipment${queryString ? `?${queryString}` : ''}`
    );
    if (json) setData(json);
    setLoading(false);
  }, [session, safeFetch, queryString]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  const items = data?.items ?? [];

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Equipment inventory</h1>
        <p style={styles.subtitle}>
          Every durable instrument, consumable SKU, and kit Starr Surveying
          tracks. Filter by status / kind / retired-toggle, or search by name,
          model, or serial. Add / edit / retire / QR-print actions land in the
          next sub-batch (Phase F10.1c-f).
        </p>
      </header>

      <div style={styles.controls}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            style={styles.input}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Kind</span>
          <select
            value={itemKind}
            onChange={(e) => setItemKind(e.target.value as ItemKindFilter)}
            style={styles.input}
          >
            {ITEM_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Search</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name · model · serial"
            style={{ ...styles.input, minWidth: 220 }}
          />
        </label>
        <label style={styles.checkboxField}>
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(e) => setIncludeRetired(e.target.checked)}
          />
          <span>Include retired</span>
        </label>
        <button
          type="button"
          style={styles.refreshBtn}
          onClick={() => void fetchInventory()}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {data ? (
        <div style={styles.summary}>
          Showing <strong>{items.length}</strong>
          {data.total_count != null && data.total_count !== items.length
            ? ` of ${data.total_count}`
            : ''}{' '}
          row{items.length === 1 ? '' : 's'}
          {includeRetired ? ' (retired included)' : ''}
        </div>
      ) : null}

      {loading && !data ? (
        <div style={styles.empty}>Loading inventory…</div>
      ) : items.length === 0 ? (
        <div style={styles.empty}>
          No inventory rows match these filters. Apply{' '}
          <code>seeds/233</code> if this is a fresh database, or import
          your fleet via the F10.1h CSV importer when it ships.
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Kind</th>
              <th style={styles.th}>Serial / Model</th>
              <th style={styles.th}>QR</th>
              <th style={styles.th}>Location</th>
              <th style={styles.thRight}>Stock / Qty</th>
              <th style={styles.thRight}>Cost basis</th>
              <th style={styles.th}>Next cal due</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const statusKey = row.current_status ?? 'available';
              const statusColors =
                STATUS_COLORS[statusKey] ?? STATUS_COLORS.available;
              const isLowStock =
                row.item_kind === 'consumable' &&
                row.quantity_on_hand != null &&
                row.low_stock_threshold != null &&
                row.quantity_on_hand <= row.low_stock_threshold;
              return (
                <tr
                  key={row.id}
                  style={row.retired_at ? styles.retiredRow : undefined}
                >
                  <td style={styles.td}>
                    <strong>{row.name ?? '(unnamed)'}</strong>
                    {row.is_personal ? (
                      <span style={styles.personalBadge}>personal</span>
                    ) : null}
                    {row.serial_suspect ? (
                      <span style={styles.suspectBadge}>suspect SN</span>
                    ) : null}
                    {row.retired_at ? (
                      <span style={styles.retiredBadge}>retired</span>
                    ) : null}
                  </td>
                  <td style={styles.td}>{formatCategory(row.category)}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.statusPill,
                        background: statusColors.bg,
                        color: statusColors.fg,
                      }}
                    >
                      {formatCategory(row.current_status ?? 'available')}
                    </span>
                  </td>
                  <td style={styles.td}>{row.item_kind ?? '—'}</td>
                  <td style={styles.td}>
                    {row.serial_number || row.model || row.brand || '—'}
                  </td>
                  <td style={styles.td}>
                    {row.qr_code_id ? (
                      <code style={styles.code}>{row.qr_code_id}</code>
                    ) : (
                      <span style={styles.muted}>—</span>
                    )}
                  </td>
                  <td style={styles.td}>{row.home_location ?? '—'}</td>
                  <td style={styles.tdRight}>
                    {row.item_kind === 'consumable' ? (
                      <span style={isLowStock ? styles.lowStock : undefined}>
                        {row.quantity_on_hand ?? 0}
                        {row.unit ? ` ${row.unit}` : ''}
                        {isLowStock ? ' ⚠' : ''}
                      </span>
                    ) : (
                      <span style={styles.muted}>—</span>
                    )}
                  </td>
                  <td style={styles.tdRight}>
                    {dollars(row.acquired_cost_cents)}
                  </td>
                  <td style={styles.td}>
                    {formatDate(row.next_calibration_due_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p style={styles.note}>
        ▸ Activation gate: <code>seeds/233-237</code> must be applied to live
        Supabase before this page renders real data. Sidebar entry lands in
        Phase F10.6 alongside the rest of the Equipment dashboard group.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 1400, margin: '0 auto' },
  header: { marginBottom: 16 },
  h1: { fontSize: 22, fontWeight: 600, margin: '0 0 4px' },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: 0,
    maxWidth: 760,
    lineHeight: 1.5,
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 16,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    fontSize: 13,
    minWidth: 160,
  },
  checkboxField: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    paddingBottom: 8,
  },
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
  },
  summary: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
    background: '#F7F8FA',
    borderRadius: 12,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    color: '#6B7280',
    fontWeight: 500,
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  thRight: {
    textAlign: 'right',
    padding: '10px 14px',
    color: '#6B7280',
    fontWeight: 500,
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid #F3F4F6',
    verticalAlign: 'middle',
  },
  tdRight: {
    padding: '10px 14px',
    borderBottom: '1px solid #F3F4F6',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  retiredRow: {
    background: '#FAFAFA',
    color: '#9CA3AF',
  },
  statusPill: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  personalBadge: {
    marginLeft: 6,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#E0E7FF',
    color: '#4338CA',
    fontSize: 10,
    fontWeight: 600,
  },
  suspectBadge: {
    marginLeft: 6,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#FEE2E2',
    color: '#B91C1C',
    fontSize: 10,
    fontWeight: 600,
  },
  retiredBadge: {
    marginLeft: 6,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#F3F4F6',
    color: '#6B7280',
    fontSize: 10,
    fontWeight: 600,
  },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F7F8FA',
    padding: '2px 6px',
    borderRadius: 4,
  },
  muted: { color: '#9CA3AF' },
  lowStock: { color: '#B45309', fontWeight: 600 },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 24,
    fontStyle: 'italic',
  },
};
