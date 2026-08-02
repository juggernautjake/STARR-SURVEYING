// app/admin/equipment/inventory/inventory-types.ts — the row shape and the option lists.
//
// Split out for platform audit item 18. The dialogs and the table both read these, and a second
// copy of a shape that mirrors /api/admin/equipment is how the two halves drift.

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
  // seeds/238 — richer metadata
  photo_url: string | null;
  // Pre-signed via ?include_photo_urls=1 (seeds/243 bucket).
  photo_signed_url?: string | null;
  condition: string | null;
  condition_updated_at: string | null;
  acquired_at: string | null;
  acquired_cost_cents: number | null;
  useful_life_months: number | null;
  next_calibration_due_at: string | null;
  warranty_expires_at: string | null;
  unit: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  vendor: string | null;
  cost_per_unit_cents: number | null;
  home_location: string | null;
  is_personal: boolean;
  retired_at: string | null;
  retired_reason: string | null;
  serial_suspect: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogueResponse {
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

export type StatusFilter =
  | ''
  | 'available'
  | 'in_use'
  | 'maintenance'
  | 'loaned_out'
  | 'lost'
  | 'retired';

export type ItemKindFilter = '' | 'durable' | 'consumable' | 'kit';

export const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'available', label: 'Available' },
  { value: 'in_use', label: 'In use' },
  { value: 'maintenance', label: 'In maintenance' },
  { value: 'loaned_out', label: 'Loaned out' },
  { value: 'lost', label: 'Lost' },
  { value: 'retired', label: 'Retired' },
];

export const ITEM_KIND_OPTIONS: Array<{ value: ItemKindFilter; label: string }> = [
  { value: '', label: 'All kinds' },
  { value: 'durable', label: 'Durable (per-unit)' },
  { value: 'consumable', label: 'Consumable (bulk)' },
  { value: 'kit', label: 'Kit (bundle)' },
];

export const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  available: { bg: '#DCFCE7', fg: '#15803D' },
  in_use: { bg: '#DBEAFE', fg: '#1D4ED8' },
  maintenance: { bg: '#FEF3C7', fg: '#92400E' },
  loaned_out: { bg: '#E0E7FF', fg: '#4338CA' },
  lost: { bg: '#FEE2E2', fg: '#B91C1C' },
  retired: { bg: 'var(--color-bg-subtle)', fg: 'var(--color-text-tertiary)' },
};

export const CONDITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'No condition recorded' },
  { value: 'new', label: 'New (out of box)' },
  { value: 'good', label: 'Good (full working order)' },
  { value: 'fair', label: 'Fair (works, cosmetic damage)' },
  { value: 'poor', label: 'Poor (works with caveats)' },
  { value: 'damaged', label: 'Damaged (functional but compromised)' },
  { value: 'needs_repair', label: 'Needs repair (route to maintenance)' },
];

export const CONDITION_COLORS: Record<string, { bg: string; fg: string }> = {
  new: { bg: '#DCFCE7', fg: '#15803D' },
  good: { bg: 'var(--color-success-bg)', fg: '#047857' },
  fair: { bg: '#FEF9C3', fg: '#854D0E' },
  poor: { bg: '#FED7AA', fg: '#9A3412' },
  damaged: { bg: '#FEE2E2', fg: '#B91C1C' },
  needs_repair: { bg: '#FCE7F3', fg: '#9F1239' },
};
