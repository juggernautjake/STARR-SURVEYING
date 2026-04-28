/**
 * Equipment library — Phase F10.1i.
 *
 * Mobile projection of equipment_inventory (the seeds/233 table
 * surfaced by F10.1a + the seeds/233 mobile schema in
 * lib/db/schema.ts). Local-SQLite-first via PowerSync — every
 * lookup runs against the synced rows so QR scans resolve
 * instantly even at the cage's metal-shed dead-zone (per
 * §5.12.9.3 offline-first contract).
 *
 * v1 hooks (this batch):
 *   * useEquipmentByQr(qrCodeId) — primary scanner resolver.
 *     Returns the matching row (or null) + a loading flag.
 *     Drives the F10.1j scanner overlay's "scan to identify"
 *     UX.
 *   * useEquipment(id) — single-row fetch by UUID, used by
 *     drilldown screens.
 *   * useEquipmentList(filter?) — catalogue browse with optional
 *     status / category / item_kind filters. Powers the
 *     "what's in my truck right now" Me-tab section
 *     (§5.12.9.1, lands later).
 *
 * Read-only on mobile in v1 — Equipment Manager creates/edits via
 * the admin web (F10.1c-h). When §5.12.6 daily check-in/out lands
 * (F10.5), mobile gains a tracker.record-equivalent for the
 * transition events but the catalogue stays read-only here.
 *
 * PowerSync sync rule (server-side, lands during F10.5 activation):
 *   bucket: equipment-catalogue
 *   table : equipment_inventory
 *   filter: retired_at IS NULL OR retired_at > now() - interval '90 days'
 *           (keeps recently-retired rows visible for the audit
 *           drilldown without bloating the local cache w/ 7y of
 *           tombstones)
 */
import { useQuery } from '@powersync/react';

export interface EquipmentRow {
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
  acquired_at: string | null;
  acquired_cost_cents: number | null;
  useful_life_months: number | null;
  placed_in_service_at: string | null;
  last_calibrated_at: string | null;
  next_calibration_due_at: string | null;
  warranty_expires_at: string | null;
  service_contract_vendor: string | null;
  last_serviced_at: string | null;
  unit: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  last_restocked_at: string | null;
  vendor: string | null;
  cost_per_unit_cents: number | null;
  home_location: string | null;
  vehicle_id: string | null;
  is_personal: number; // 0 | 1
  owner_user_id: string | null;
  retired_at: string | null;
  retired_reason: string | null;
  serial_suspect: number; // 0 | 1
  created_at: string;
  updated_at: string;
}

const SELECT_ALL =
  'id, name, category, item_kind, current_status, qr_code_id, ' +
  'brand, model, serial_number, notes, ' +
  'acquired_at, acquired_cost_cents, useful_life_months, placed_in_service_at, ' +
  'last_calibrated_at, next_calibration_due_at, warranty_expires_at, ' +
  'service_contract_vendor, last_serviced_at, ' +
  'unit, quantity_on_hand, low_stock_threshold, last_restocked_at, ' +
  'vendor, cost_per_unit_cents, ' +
  'home_location, vehicle_id, is_personal, owner_user_id, ' +
  'retired_at, retired_reason, serial_suspect, ' +
  'created_at, updated_at';

/**
 * Resolve a QR code to its inventory row. Returns:
 *   * `row: EquipmentRow | null` — the matching row, or null if no
 *     row matches (typical for "scanned a sticker we don't own"
 *     surface).
 *   * `isLoading: boolean` — true while the local query runs.
 *   * `error: Error | undefined` — surfaces SQL errors (rare).
 *
 * The qrCodeId is normalised to uppercase before query because
 * the F10.1c-i POST + F10.1d-i PATCH endpoints both upper-case
 * before insert — keeping the lookup case-insensitive defensively
 * costs nothing.
 *
 * Pass `null` / empty string to disable the query (returns
 * `{ row: null, isLoading: false }` without hitting the db). Lets
 * the F10.1j scanner overlay component mount the hook
 * unconditionally + only fire when a scan completes.
 */
export function useEquipmentByQr(qrCodeId: string | null | undefined): {
  row: EquipmentRow | null;
  isLoading: boolean;
  error: Error | undefined;
} {
  const code = (qrCodeId ?? '').trim().toUpperCase();
  // PowerSync's useQuery doesn't expose a "skip" flag; querying
  // with an impossible value returns 0 rows quickly enough that
  // the disable-when-empty pattern is fine.
  const { data, isLoading, error } = useQuery<EquipmentRow>(
    `SELECT ${SELECT_ALL}
       FROM equipment_inventory
      WHERE qr_code_id = ?
        AND retired_at IS NULL
      LIMIT 1`,
    code ? [code] : ['__no_match__']
  );

  return {
    row: code ? (data?.[0] ?? null) : null,
    isLoading: code ? isLoading : false,
    error,
  };
}

/** Single-row lookup by UUID. Used by drilldown screens that have
 *  the id from a higher-level list (e.g. tapping a kit member
 *  inside a checked-out reservation). */
export function useEquipment(id: string | null | undefined): {
  row: EquipmentRow | null;
  isLoading: boolean;
  error: Error | undefined;
} {
  const { data, isLoading, error } = useQuery<EquipmentRow>(
    `SELECT ${SELECT_ALL}
       FROM equipment_inventory
      WHERE id = ?
      LIMIT 1`,
    id ? [id] : ['__no_match__']
  );
  return {
    row: id ? (data?.[0] ?? null) : null,
    isLoading: id ? isLoading : false,
    error,
  };
}

export interface EquipmentListFilter {
  status?: string;
  category?: string;
  itemKind?: 'durable' | 'consumable' | 'kit';
  includeRetired?: boolean;
}

/** Catalogue browse with optional filters. Returns rows ordered by
 *  name. Used by the §5.12.9.1 "what's in my truck right now" Me-tab
 *  section + future "find a substitute" suggestions when a
 *  reservation's preferred unit is unavailable.
 *
 *  Each filter argument compiles to its own WHERE clause; passing
 *  no filter at all returns the full active catalogue (which the
 *  PowerSync sync rule already caps at retired_at > now()-90d on
 *  the server side, so the result count is bounded). */
export function useEquipmentList(filter?: EquipmentListFilter): {
  rows: EquipmentRow[];
  isLoading: boolean;
  error: Error | undefined;
} {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (!filter?.includeRetired) {
    clauses.push('retired_at IS NULL');
  }
  if (filter?.status) {
    clauses.push('current_status = ?');
    params.push(filter.status);
  }
  if (filter?.category) {
    clauses.push('category = ?');
    params.push(filter.category);
  }
  if (filter?.itemKind) {
    clauses.push('item_kind = ?');
    params.push(filter.itemKind);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT ${SELECT_ALL}
                 FROM equipment_inventory
                 ${where}
                ORDER BY name COLLATE NOCASE ASC`;
  const { data, isLoading, error } = useQuery<EquipmentRow>(sql, params);
  return {
    rows: data ?? [],
    isLoading,
    error,
  };
}
