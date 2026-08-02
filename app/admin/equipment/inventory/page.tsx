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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Camera, AlertTriangle } from 'lucide-react';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';
import {
  CONDITION_COLORS, CONDITION_OPTIONS, ITEM_KIND_OPTIONS, STATUS_COLORS, STATUS_OPTIONS,
  type CatalogueResponse, type EquipmentRow, type ItemKindFilter, type StatusFilter,
} from './inventory-types';
import { styles } from './inventory-styles';
import { AddUnitModal, EditUnitModal, RetireRestoreModal } from './UnitModals';







// seeds/238 condition enum (physical condition, separate from
// current_status lifecycle). Order = pickability sequence on the
// modal (best-condition-first).


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
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRow, setEditingRow] = useState<EquipmentRow | null>(null);
  const [retireRow, setRetireRow] = useState<EquipmentRow | null>(null);
  const [restoreRow, setRestoreRow] = useState<EquipmentRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (itemKind) params.set('item_kind', itemKind);
    if (includeRetired) params.set('include_retired', '1');
    // Always pre-sign photo URLs for the catalogue thumbnail
    // column. Server costs 1 storage roundtrip per row that has
    // a photo, in parallel.
    params.set('include_photo_urls', '1');
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

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  // Selection state derives off the visible items so toggling
  // filters drops out-of-view rows from selection automatically
  // (avoids "I selected 5 but only see 2" confusion).
  const visibleIds = useMemo(
    () => new Set(items.map((r) => r.id)),
    [items]
  );
  const visibleSelectedIds = useMemo(
    () => Array.from(selectedIds).filter((id) => visibleIds.has(id)),
    [selectedIds, visibleIds]
  );
  const allVisibleSelected =
    items.length > 0 && visibleSelectedIds.length === items.length;
  const someVisibleSelected = visibleSelectedIds.length > 0;

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        items.forEach((r) => next.delete(r.id));
      } else {
        items.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }, [allVisibleSelected, items]);

  // Bulk-print helper. Hits POST /api/admin/equipment/qr-stickers
  // with either ids[] (when selection is active) or the current
  // filter object (the "print all matching" path). Returns a PDF
  // blob that we trigger a browser download on; reads the
  // X-Stickers-Skipped header for the toast.
  //
  // safeFetch isn't used here because it parses JSON; the response
  // is a binary PDF on success. Errors come back as JSON so we
  // sniff Content-Type and surface the message inline.
  const bulkPrint = useCallback(
    async (mode: 'selected' | 'filtered') => {
      if (!session?.user?.email) return;
      setActionMsg(null);
      setPrinting(true);
      try {
        const body =
          mode === 'selected'
            ? { ids: Array.from(selectedIds) }
            : {
                filter: {
                  status: status || undefined,
                  item_kind: itemKind || undefined,
                  include_retired: includeRetired,
                  // q is NOT forwarded — server doesn't support it
                  // on the bulk endpoint (kept tighter to match
                  // the catalogue filter columns).
                },
              };
        const res = await fetch('/api/admin/equipment/qr-stickers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({
            error: `HTTP ${res.status}`,
          }));
          setActionMsg(
            `⚠ Print failed: ${err.error ?? `HTTP ${res.status}`}`
          );
          return;
        }
        const printed = res.headers.get('X-Stickers-Printed') ?? '?';
        const skipped = res.headers.get('X-Stickers-Skipped') ?? '0';
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cd = res.headers.get('Content-Disposition') ?? '';
        const fnMatch = cd.match(/filename="([^"]+)"/);
        a.download =
          fnMatch?.[1] ??
          `equipment_qr_${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setActionMsg(
          `✓ Printed ${printed} sticker${printed === '1' ? '' : 's'}` +
            (skipped !== '0'
              ? ` · ${skipped} skipped (no QR — assign via Edit)`
              : '') +
            '.'
        );
        if (mode === 'selected') {
          setSelectedIds(new Set());
        }
      } catch (err) {
        setActionMsg(
          `⚠ Print failed: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        setPrinting(false);
      }
    },
    [includeRetired, itemKind, selectedIds, session, status]
  );

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Equipment inventory</h1>
        <p style={styles.subtitle}>
          The master catalog of every instrument, kit, vehicle
          accessory, and consumable the firm tracks. Filter by
          status, type, or whether something has been retired, or
          search by name, model, or serial number. Use the row
          actions to add new gear, edit details, retire items, or
          print a QR sticker for the case.
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
        <button
          type="button"
          style={styles.addBtn}
          onClick={() => {
            setActionMsg(null);
            setShowAddModal(true);
          }}
        >
          + Add unit
        </button>
        <button
          type="button"
          style={styles.refreshBtn}
          onClick={() => void bulkPrint('filtered')}
          disabled={printing || loading || items.length === 0}
          title="Print every row matching the current filters as a multi-page QR PDF"
        >
          {printing ? 'Printing…' : 'Print all QR (filtered)'}
        </button>
      </div>

      {actionMsg ? (
        <div
          style={
            actionMsg.startsWith('✓')
              ? styles.actionMsgOk
              : styles.actionMsgWarn
          }
        >
          {actionMsg}
        </div>
      ) : null}

      {showAddModal ? (
        <AddUnitModal
          onClose={() => setShowAddModal(false)}
          onCreated={(item) => {
            setShowAddModal(false);
            setActionMsg(
              `✓ Added "${item.name ?? '(unnamed)'}" — QR ${item.qr_code_id ?? '(none)'}.`
            );
            void fetchInventory();
          }}
        />
      ) : null}

      {editingRow ? (
        <EditUnitModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onUpdated={(item) => {
            setEditingRow(null);
            setActionMsg(`✓ Saved changes to "${item.name ?? '(unnamed)'}".`);
            void fetchInventory();
          }}
        />
      ) : null}

      {retireRow ? (
        <RetireRestoreModal
          row={retireRow}
          mode="retire"
          onClose={() => setRetireRow(null)}
          onCompleted={(item) => {
            setRetireRow(null);
            setActionMsg(`✓ Retired "${item.name ?? '(unnamed)'}".`);
            void fetchInventory();
          }}
        />
      ) : null}

      {restoreRow ? (
        <RetireRestoreModal
          row={restoreRow}
          mode="restore"
          onClose={() => setRestoreRow(null)}
          onCompleted={(item) => {
            setRestoreRow(null);
            setActionMsg(
              `✓ Restored "${item.name ?? '(unnamed)'}" to active inventory.`
            );
            void fetchInventory();
          }}
        />
      ) : null}

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

      {selectedIds.size > 0 ? (
        <div style={styles.bulkBar}>
          <span style={styles.bulkLabel}>
            <strong>{selectedIds.size}</strong> selected
            {selectedIds.size > visibleSelectedIds.length
              ? ` (${visibleSelectedIds.length} on this view)`
              : ''}
          </span>
          <button
            type="button"
            style={styles.refreshBtn}
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
          <button
            type="button"
            style={styles.addBtn}
            onClick={() => void bulkPrint('selected')}
            disabled={printing}
            title="Bulk-print QR stickers for every selected row"
          >
            {printing ? 'Printing…' : `Print ${selectedIds.size} QR`}
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div style={styles.empty}>Loading inventory…</div>
      ) : items.length === 0 ? (
        <div style={styles.empty}>
          No equipment matches these filters. Try clearing them, or
          add your first unit with the &ldquo;Add unit&rdquo; button.
        </div>
      ) : (
        <div className="admin-table-wrap"><table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.thCheckbox}>
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        someVisibleSelected && !allVisibleSelected;
                    }
                  }}
                  checked={allVisibleSelected}
                  onChange={() => toggleAllVisible()}
                  aria-label={
                    allVisibleSelected
                      ? 'Deselect all visible rows'
                      : 'Select all visible rows'
                  }
                />
              </th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Condition</th>
              <th style={styles.th}>Kind</th>
              <th style={styles.th}>Serial / Model</th>
              <th style={styles.th}>QR</th>
              <th style={styles.th}>Location</th>
              <th style={styles.thRight}>Stock / Qty</th>
              <th style={styles.thRight}>Cost basis</th>
              <th style={styles.th}>Next cal due</th>
              <th style={styles.thRight}>Actions</th>
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
                  <td style={styles.tdCheckbox}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select ${row.name ?? row.id}`}
                    />
                  </td>
                  <td style={styles.td}>
                    <div style={styles.nameCell}>
                      {row.photo_signed_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.photo_signed_url}
                          alt=""
                          style={styles.thumbnail}
                          loading="lazy"
                        />
                      ) : row.photo_url ? (
                        <div
                          style={styles.thumbnailFallback}
                          title="Photo on file (signed URL unavailable; refresh)"
                        >
                          <Camera size={16} strokeWidth={1.75} aria-hidden="true" />
                        </div>
                      ) : (
                        <div
                          style={styles.thumbnailEmpty}
                          aria-hidden="true"
                        />
                      )}
                      <div style={styles.nameStack}>
                        <strong>{row.name ?? '(unnamed)'}</strong>
                        <div style={styles.nameBadges}>
                          {row.is_personal ? (
                            <span style={styles.personalBadge}>
                              personal
                            </span>
                          ) : null}
                          {row.serial_suspect ? (
                            <span style={styles.suspectBadge}>
                              suspect SN
                            </span>
                          ) : null}
                          {row.retired_at ? (
                            <span style={styles.retiredBadge}>
                              retired
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
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
                  <td style={styles.td}>
                    {row.condition ? (
                      (() => {
                        const c = CONDITION_COLORS[row.condition] ?? {
                          bg: 'var(--color-bg-subtle)',
                          fg: 'var(--color-text-tertiary)',
                        };
                        return (
                          <span
                            style={{
                              ...styles.statusPill,
                              background: c.bg,
                              color: c.fg,
                            }}
                            title={
                              row.condition_updated_at
                                ? `Last checked ${new Date(row.condition_updated_at).toLocaleDateString()}`
                                : undefined
                            }
                          >
                            {formatCategory(row.condition)}
                          </span>
                        );
                      })()
                    ) : (
                      <span style={styles.muted}>—</span>
                    )}
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
                        {isLowStock ? <AlertTriangle size={12} strokeWidth={2.5} style={{ verticalAlign: "middle", marginLeft: "0.25rem", color: "var(--color-error)" }} aria-label="Low stock" /> : null}
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
                  <td style={styles.tdRight}>
                    <div style={styles.rowActionBar}>
                      <a
                        href={`/admin/equipment/${row.id}`}
                        style={styles.rowActionBtn}
                        title="Open drilldown — full metadata + assignment history"
                      >
                        View
                      </a>
                      <button
                        type="button"
                        style={styles.rowActionBtn}
                        onClick={() => {
                          setActionMsg(null);
                          setEditingRow(row);
                        }}
                        disabled={!!row.retired_at}
                        title={
                          row.retired_at
                            ? 'Restore the row first to edit it.'
                            : 'Edit unit details'
                        }
                      >
                        Edit
                      </button>
                      {row.qr_code_id ? (
                        <a
                          href={`/api/admin/equipment/${row.id}/qr-sticker`}
                          style={styles.rowActionBtn}
                          title="Download a label-printer-ready QR sticker PDF (Brother DK-1201, 2.4×1.1 in)"
                        >
                          QR
                        </a>
                      ) : null}
                      {row.retired_at ? (
                        <button
                          type="button"
                          style={styles.rowActionBtnRestore}
                          onClick={() => {
                            setActionMsg(null);
                            setRestoreRow(row);
                          }}
                          title="Restore this unit to active inventory"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={styles.rowActionBtnRetire}
                          onClick={() => {
                            setActionMsg(null);
                            setRetireRow(row);
                          }}
                          title="Soft-archive this unit (audit trail preserved)"
                        >
                          Retire
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}

    </div>
  );
}

