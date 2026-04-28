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

// ── Add Unit modal (Phase F10.1c-ii) ───────────────────────────────────────
// Modal overlay form that POSTs to /api/admin/equipment. Keeps to the
// most-useful create fields (name + item_kind required; brand / model /
// serial / location / notes optional). Cost basis, calibration, and
// vehicle assignment are deferred to the F10.1d inline-edit flow so the
// modal stays scannable. Consumable-only fields (unit, quantity_on_hand,
// low_stock_threshold) appear conditionally when item_kind='consumable'.

interface AddUnitModalProps {
  onClose: () => void;
  onCreated: (item: EquipmentRow) => void;
}

const ITEM_KIND_RADIO: Array<{ value: 'durable' | 'consumable' | 'kit'; label: string; hint: string }> = [
  { value: 'durable', label: 'Durable', hint: 'One row per physical unit (e.g. a total station)' },
  { value: 'consumable', label: 'Consumable', hint: 'One row per SKU + quantity_on_hand (paint, lath, ribbon)' },
  { value: 'kit', label: 'Kit', hint: 'Pre-bundled grouping that checks out as a unit' },
];

function AddUnitModal({ onClose, onCreated }: AddUnitModalProps) {
  const { safeFetch } = usePageError('AddUnitModal');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state. Strings throughout; numbers parsed at submit time.
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'durable' | 'consumable' | 'kit'>('durable');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [homeLocation, setHomeLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [qrCodeId, setQrCodeId] = useState(''); // empty → auto-generate server-side
  // Consumable-only.
  const [unit, setUnit] = useState('');
  const [quantityOnHand, setQuantityOnHand] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const trimmedName = name.trim();
      if (!trimmedName) {
        setError('Name is required.');
        return;
      }
      const body: Record<string, unknown> = {
        name: trimmedName,
        item_kind: kind,
      };
      if (category.trim()) body.category = category.trim();
      if (brand.trim()) body.brand = brand.trim();
      if (model.trim()) body.model = model.trim();
      if (serialNumber.trim()) body.serial_number = serialNumber.trim();
      if (homeLocation.trim()) body.home_location = homeLocation.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (qrCodeId.trim()) body.qr_code_id = qrCodeId.trim();

      if (kind === 'consumable') {
        if (unit.trim()) body.unit = unit.trim();
        if (quantityOnHand.trim()) {
          const n = parseInt(quantityOnHand.trim(), 10);
          if (!Number.isInteger(n) || n < 0) {
            setError('Quantity on hand must be a non-negative integer.');
            return;
          }
          body.quantity_on_hand = n;
        }
        if (lowStockThreshold.trim()) {
          const n = parseInt(lowStockThreshold.trim(), 10);
          if (!Number.isInteger(n) || n < 0) {
            setError('Low-stock threshold must be a non-negative integer.');
            return;
          }
          body.low_stock_threshold = n;
        }
      }

      setSubmitting(true);
      const res = await safeFetch<{ item: EquipmentRow }>(
        '/api/admin/equipment',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      setSubmitting(false);
      if (res?.item) {
        onCreated(res.item);
      } else {
        // safeFetch already reported to Sentry; show a user-visible
        // hint so the form doesn't silently fail.
        setError('Create failed. Check the error log; the form is unchanged.');
      }
    },
    [
      brand,
      category,
      homeLocation,
      kind,
      lowStockThreshold,
      model,
      name,
      notes,
      onCreated,
      qrCodeId,
      quantityOnHand,
      safeFetch,
      serialNumber,
      unit,
    ]
  );

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <form
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Add inventory unit</h2>
          <button
            type="button"
            style={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div style={styles.modalBody}>
          <label style={styles.formField}>
            <span style={styles.formLabel}>Name *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.formInput}
              maxLength={200}
              required
              autoFocus
              placeholder="Total Station — Trimble S9 #1"
            />
          </label>

          <fieldset style={styles.fieldset}>
            <legend style={styles.formLabel}>Item kind *</legend>
            {ITEM_KIND_RADIO.map((opt) => (
              <label key={opt.value} style={styles.radioRow}>
                <input
                  type="radio"
                  name="item_kind"
                  value={opt.value}
                  checked={kind === opt.value}
                  onChange={() => setKind(opt.value)}
                />
                <span>
                  <strong>{opt.label}</strong>{' '}
                  <span style={styles.muted}>· {opt.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div style={styles.formGrid}>
            <label style={styles.formField}>
              <span style={styles.formLabel}>Category</span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={styles.formInput}
                placeholder="total_station / gps_rover / paint / …"
              />
            </label>
            <label style={styles.formField}>
              <span style={styles.formLabel}>Home location</span>
              <input
                type="text"
                value={homeLocation}
                onChange={(e) => setHomeLocation(e.target.value)}
                style={styles.formInput}
                placeholder="Cage shelf B2 / Truck 3"
              />
            </label>
          </div>

          {kind !== 'consumable' ? (
            <div style={styles.formGrid}>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Brand</span>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  style={styles.formInput}
                  placeholder="Trimble / Topcon / Leica"
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Model</span>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={styles.formInput}
                  placeholder="S9"
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Serial number</span>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  style={styles.formInput}
                  placeholder="SN12345"
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>QR code (optional)</span>
                <input
                  type="text"
                  value={qrCodeId}
                  onChange={(e) =>
                    setQrCodeId(e.target.value.toUpperCase())
                  }
                  style={styles.formInput}
                  placeholder="auto-generated when blank"
                  maxLength={64}
                />
              </label>
            </div>
          ) : (
            <div style={styles.formGrid}>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Unit</span>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  style={styles.formInput}
                  placeholder="can / roll / bundle / lb"
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Quantity on hand</span>
                <input
                  type="number"
                  value={quantityOnHand}
                  onChange={(e) => setQuantityOnHand(e.target.value)}
                  style={styles.formInput}
                  min={0}
                  step={1}
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Low-stock threshold</span>
                <input
                  type="number"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  style={styles.formInput}
                  min={0}
                  step={1}
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>QR code (optional)</span>
                <input
                  type="text"
                  value={qrCodeId}
                  onChange={(e) =>
                    setQrCodeId(e.target.value.toUpperCase())
                  }
                  style={styles.formInput}
                  placeholder="auto-generated when blank"
                  maxLength={64}
                />
              </label>
            </div>
          )}

          <label style={styles.formField}>
            <span style={styles.formLabel}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...styles.formInput, minHeight: 60 }}
              placeholder="Anything bookkeeping or maintenance should know"
            />
          </label>

          <p style={styles.modalHint}>
            ▸ Cost basis, calibration, and warranty fields land via the
            inline-edit flow (Phase F10.1d). Use this form for the
            initial create; refine later.
          </p>

          {error ? <div style={styles.actionMsgWarn}>{error}</div> : null}
        </div>

        <footer style={styles.modalFooter}>
          <button
            type="button"
            style={styles.refreshBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={styles.submitBtn}
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Creating…' : 'Create unit'}
          </button>
        </footer>
      </form>
    </div>
  );
}

// ── Edit Unit modal (Phase F10.1d-ii) ──────────────────────────────────────
// PATCH-driven edit modal that pre-fills from the row data passed in by
// the catalogue. Shows the same name + brand/model/serial OR
// unit/qty/threshold conditional block as the Add modal PLUS a cost-basis
// + calibration block that the Add modal explicitly defers here.
//
// item_kind is shown but read-only — changing kind would invalidate
// every downstream relationship (kit memberships, template line items,
// reservations) so kind changes go through retire-and-recreate.
//
// retired_at + retired_reason are NOT editable here — those flow through
// the dedicated F10.1e retire action so the audit trail captures the
// transition reason consistently.

interface EditUnitModalProps {
  row: EquipmentRow;
  onClose: () => void;
  onUpdated: (item: EquipmentRow) => void;
}

function EditUnitModal({ row, onClose, onUpdated }: EditUnitModalProps) {
  const { safeFetch } = usePageError('EditUnitModal');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the row data. Date columns rendered as YYYY-MM-DD for
  // <input type="date">; cents columns as plain integer strings.
  const initialIso = (iso: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 10) : '';
  const initialNum = (n: number | null) =>
    n == null ? '' : String(n);

  const [name, setName] = useState(row.name ?? '');
  const [category, setCategory] = useState(row.category ?? '');
  const [brand, setBrand] = useState(row.brand ?? '');
  const [model, setModel] = useState(row.model ?? '');
  const [serialNumber, setSerialNumber] = useState(row.serial_number ?? '');
  const [homeLocation, setHomeLocation] = useState(row.home_location ?? '');
  const [notes, setNotes] = useState(row.notes ?? '');
  const [qrCodeId, setQrCodeId] = useState(row.qr_code_id ?? '');
  const [currentStatus, setCurrentStatus] = useState<StatusFilter>(
    (row.current_status as StatusFilter) ?? 'available'
  );

  // Cost basis (editable on both durables + kits + consumables —
  // capitalised consumables exist).
  const [acquiredAt, setAcquiredAt] = useState(initialIso(row.acquired_cost_cents != null ? null : null));
  const [acquiredCost, setAcquiredCost] = useState(initialNum(row.acquired_cost_cents));
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(initialNum(row.useful_life_months));
  // Calibration / warranty (durable / kit only, but UI doesn't gate —
  // a consumable with no cal date stays clean either way).
  const [nextCalibrationDueAt, setNextCalibrationDueAt] = useState(
    initialIso(row.next_calibration_due_at)
  );
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState(
    initialIso(row.warranty_expires_at)
  );
  // Consumable accounting.
  const [unit, setUnit] = useState(row.unit ?? '');
  const [quantityOnHand, setQuantityOnHand] = useState(initialNum(row.quantity_on_hand));
  const [lowStockThreshold, setLowStockThreshold] = useState(
    initialNum(row.low_stock_threshold)
  );
  const [vendor, setVendor] = useState(row.vendor ?? '');
  const [costPerUnit, setCostPerUnit] = useState(initialNum(row.cost_per_unit_cents));

  const isConsumable = row.item_kind === 'consumable';

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setError('Name cannot be empty.');
        return;
      }

      const update: Record<string, unknown> = {
        name: trimmedName,
        category: category.trim() || null,
        notes: notes.trim() || null,
        home_location: homeLocation.trim() || null,
        current_status: currentStatus || 'available',
      };

      if (qrCodeId.trim()) {
        update.qr_code_id = qrCodeId.trim();
      }

      if (!isConsumable) {
        update.brand = brand.trim() || null;
        update.model = model.trim() || null;
        update.serial_number = serialNumber.trim() || null;
      } else {
        update.unit = unit.trim() || null;
        update.vendor = vendor.trim() || null;
        if (quantityOnHand.trim()) {
          const n = parseInt(quantityOnHand.trim(), 10);
          if (!Number.isInteger(n) || n < 0) {
            setError('Quantity on hand must be a non-negative integer.');
            return;
          }
          update.quantity_on_hand = n;
        } else {
          update.quantity_on_hand = null;
        }
        if (lowStockThreshold.trim()) {
          const n = parseInt(lowStockThreshold.trim(), 10);
          if (!Number.isInteger(n) || n < 0) {
            setError('Low-stock threshold must be a non-negative integer.');
            return;
          }
          update.low_stock_threshold = n;
        } else {
          update.low_stock_threshold = null;
        }
        if (costPerUnit.trim()) {
          const n = parseInt(costPerUnit.trim(), 10);
          if (!Number.isInteger(n) || n < 0) {
            setError('Cost per unit must be a non-negative integer (cents).');
            return;
          }
          update.cost_per_unit_cents = n;
        } else {
          update.cost_per_unit_cents = null;
        }
      }

      // Cost basis (always editable so the §5.12.10 promote-receipt
      // flow can backfill via this surface too).
      if (acquiredCost.trim()) {
        const n = parseInt(acquiredCost.trim(), 10);
        if (!Number.isInteger(n) || n < 0) {
          setError('Acquired cost must be a non-negative integer (cents).');
          return;
        }
        update.acquired_cost_cents = n;
      } else {
        update.acquired_cost_cents = null;
      }
      if (usefulLifeMonths.trim()) {
        const n = parseInt(usefulLifeMonths.trim(), 10);
        if (!Number.isInteger(n) || n < 0) {
          setError('Useful life (months) must be a non-negative integer.');
          return;
        }
        update.useful_life_months = n;
      } else {
        update.useful_life_months = null;
      }
      if (acquiredAt.trim()) {
        update.acquired_at = `${acquiredAt}T00:00:00.000Z`;
      }

      // Calibration + warranty.
      if (nextCalibrationDueAt.trim()) {
        update.next_calibration_due_at = `${nextCalibrationDueAt}T00:00:00.000Z`;
      } else {
        update.next_calibration_due_at = null;
      }
      if (warrantyExpiresAt.trim()) {
        update.warranty_expires_at = `${warrantyExpiresAt}T00:00:00.000Z`;
      } else {
        update.warranty_expires_at = null;
      }

      setSubmitting(true);
      const res = await safeFetch<{ item: EquipmentRow }>(
        `/api/admin/equipment/${row.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      );
      setSubmitting(false);
      if (res?.item) {
        onUpdated(res.item);
      } else {
        setError('Save failed. Check the error log; the form is unchanged.');
      }
    },
    [
      acquiredAt,
      acquiredCost,
      brand,
      category,
      costPerUnit,
      currentStatus,
      homeLocation,
      isConsumable,
      lowStockThreshold,
      model,
      name,
      nextCalibrationDueAt,
      notes,
      onUpdated,
      qrCodeId,
      quantityOnHand,
      row.id,
      safeFetch,
      serialNumber,
      unit,
      usefulLifeMonths,
      vendor,
      warrantyExpiresAt,
    ]
  );

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <form
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            Edit unit · <code style={styles.code}>{row.qr_code_id ?? '(no QR)'}</code>
          </h2>
          <button
            type="button"
            style={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div style={styles.modalBody}>
          <p style={styles.modalHint}>
            Item kind <strong>{row.item_kind ?? '(unset)'}</strong> is locked
            (changing kind invalidates kit memberships, templates, and
            reservations). Use retire + recreate if you need to change kind.
          </p>

          <label style={styles.formField}>
            <span style={styles.formLabel}>Name *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.formInput}
              maxLength={200}
              required
            />
          </label>

          <div style={styles.formGrid}>
            <label style={styles.formField}>
              <span style={styles.formLabel}>Category</span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={styles.formInput}
              />
            </label>
            <label style={styles.formField}>
              <span style={styles.formLabel}>Status</span>
              <select
                value={currentStatus}
                onChange={(e) => setCurrentStatus(e.target.value as StatusFilter)}
                style={styles.formInput}
              >
                {STATUS_OPTIONS.filter((o) => o.value !== '').map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.formField}>
              <span style={styles.formLabel}>Home location</span>
              <input
                type="text"
                value={homeLocation}
                onChange={(e) => setHomeLocation(e.target.value)}
                style={styles.formInput}
              />
            </label>
            <label style={styles.formField}>
              <span style={styles.formLabel}>QR code</span>
              <input
                type="text"
                value={qrCodeId}
                onChange={(e) => setQrCodeId(e.target.value.toUpperCase())}
                style={styles.formInput}
                maxLength={64}
              />
            </label>
          </div>

          {!isConsumable ? (
            <div style={styles.formGrid}>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Brand</span>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  style={styles.formInput}
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Model</span>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={styles.formInput}
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Serial number</span>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  style={styles.formInput}
                />
              </label>
            </div>
          ) : (
            <div style={styles.formGrid}>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Unit</span>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  style={styles.formInput}
                  placeholder="can / roll / bundle"
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Quantity on hand</span>
                <input
                  type="number"
                  value={quantityOnHand}
                  onChange={(e) => setQuantityOnHand(e.target.value)}
                  style={styles.formInput}
                  min={0}
                  step={1}
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Low-stock threshold</span>
                <input
                  type="number"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  style={styles.formInput}
                  min={0}
                  step={1}
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Vendor</span>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  style={styles.formInput}
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Cost per unit (cents)</span>
                <input
                  type="number"
                  value={costPerUnit}
                  onChange={(e) => setCostPerUnit(e.target.value)}
                  style={styles.formInput}
                  min={0}
                  step={1}
                  placeholder="e.g. 450 = $4.50"
                />
              </label>
            </div>
          )}

          <fieldset style={styles.fieldset}>
            <legend style={styles.formLabel}>Cost basis (§5.12.10 tax tie-in)</legend>
            <div style={styles.formGrid}>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Acquired cost (cents)</span>
                <input
                  type="number"
                  value={acquiredCost}
                  onChange={(e) => setAcquiredCost(e.target.value)}
                  style={styles.formInput}
                  min={0}
                  step={1}
                  placeholder="e.g. 4000000 = $40,000"
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Acquired at</span>
                <input
                  type="date"
                  value={acquiredAt}
                  onChange={(e) => setAcquiredAt(e.target.value)}
                  style={styles.formInput}
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Useful life (months)</span>
                <input
                  type="number"
                  value={usefulLifeMonths}
                  onChange={(e) => setUsefulLifeMonths(e.target.value)}
                  style={styles.formInput}
                  min={0}
                  step={1}
                  placeholder="60 = 5 years"
                />
              </label>
            </div>
          </fieldset>

          <fieldset style={styles.fieldset}>
            <legend style={styles.formLabel}>Calibration / warranty (§5.12.7.4 calendar)</legend>
            <div style={styles.formGrid}>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Next calibration due</span>
                <input
                  type="date"
                  value={nextCalibrationDueAt}
                  onChange={(e) => setNextCalibrationDueAt(e.target.value)}
                  style={styles.formInput}
                />
              </label>
              <label style={styles.formField}>
                <span style={styles.formLabel}>Warranty expires</span>
                <input
                  type="date"
                  value={warrantyExpiresAt}
                  onChange={(e) => setWarrantyExpiresAt(e.target.value)}
                  style={styles.formInput}
                />
              </label>
            </div>
          </fieldset>

          <label style={styles.formField}>
            <span style={styles.formLabel}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...styles.formInput, minHeight: 60 }}
            />
          </label>

          <p style={styles.modalHint}>
            ▸ Retire / un-retire flows through the dedicated F10.1e
            action; this form does not edit retired_at.
          </p>

          {error ? <div style={styles.actionMsgWarn}>{error}</div> : null}
        </div>

        <footer style={styles.modalFooter}>
          <button
            type="button"
            style={styles.refreshBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={styles.submitBtn}
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </form>
    </div>
  );
}

// ── Retire / Restore modal (Phase F10.1e-ii) ───────────────────────────────
// Single component handles both modes via the `mode` prop. Retire requires
// a reason picker (canonical enum + freeform); restore is optional reason
// only. POSTs to /retire or /restore from the F10.1e-i endpoints.

interface RetireRestoreModalProps {
  row: EquipmentRow;
  mode: 'retire' | 'restore';
  onClose: () => void;
  onCompleted: (item: { id: string; name: string | null }) => void;
}

const RETIRE_REASON_OPTIONS = [
  { value: 'sold', label: 'Sold' },
  { value: 'traded', label: 'Traded in' },
  { value: 'scrapped', label: 'Scrapped' },
  { value: 'donated', label: 'Donated' },
  { value: 'lost', label: 'Lost' },
  { value: 'stolen', label: 'Stolen' },
  { value: 'damaged_beyond_repair', label: 'Damaged beyond repair' },
  { value: 'obsolete', label: 'Obsolete / superseded' },
  { value: 'transfer_out', label: 'Transferred to another firm' },
  { value: 'other', label: 'Other (specify in notes)' },
];

function RetireRestoreModal({
  row,
  mode,
  onClose,
  onCompleted,
}: RetireRestoreModalProps) {
  const { safeFetch } = usePageError(`${mode}-modal`);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonValue, setReasonValue] = useState(
    mode === 'retire' ? RETIRE_REASON_OPTIONS[0].value : ''
  );
  const [notes, setNotes] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      // For retire: reason is required; "other" forces a non-empty notes
      // field so the audit-log line is meaningful.
      if (mode === 'retire') {
        if (!reasonValue) {
          setError('Pick a reason.');
          return;
        }
        if (reasonValue === 'other' && !notes.trim()) {
          setError('Describe the reason in notes when picking "Other".');
          return;
        }
      }

      const path =
        mode === 'retire'
          ? `/api/admin/equipment/${row.id}/retire`
          : `/api/admin/equipment/${row.id}/restore`;

      const body: Record<string, unknown> = {};
      if (mode === 'retire') {
        // Server stores the canonical reason; if the user picked
        // "other" we use the notes as the reason itself.
        body.reason = reasonValue === 'other' ? notes.trim() : reasonValue;
        if (notes.trim() && reasonValue !== 'other') {
          body.notes = notes.trim();
        }
      } else if (notes.trim()) {
        body.reason = notes.trim();
      }

      setSubmitting(true);
      const res = await safeFetch<{ item: { id: string; name: string | null } }>(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      setSubmitting(false);
      if (res?.item) {
        onCompleted(res.item);
      } else {
        setError(
          `${mode === 'retire' ? 'Retire' : 'Restore'} failed. Check the error log; the row is unchanged.`
        );
      }
    },
    [mode, notes, onCompleted, reasonValue, row.id, safeFetch]
  );

  const isRetire = mode === 'retire';

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <form
        style={{ ...styles.modal, maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {isRetire ? 'Retire unit' : 'Restore unit'} ·{' '}
            <code style={styles.code}>{row.qr_code_id ?? '(no QR)'}</code>
          </h2>
          <button
            type="button"
            style={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div style={styles.modalBody}>
          <p style={styles.modalHint}>
            {isRetire
              ? `Retiring "${row.name ?? '(unnamed)'}" soft-archives the row — it stays in the audit log + depreciation closeout but drops out of the active catalogue. The action writes an equipment_events row (per §5.12.1) so chain-of-custody stays clean. You can restore later.`
              : `Restoring "${row.name ?? '(unnamed)'}" clears retired_at + retired_reason and flips current_status back to 'available'. The audit log captures the restore so the §5.12.7.3 history tab still shows the full lifecycle.`}
          </p>

          {isRetire ? (
            <fieldset style={styles.fieldset}>
              <legend style={styles.formLabel}>Reason *</legend>
              {RETIRE_REASON_OPTIONS.map((opt) => (
                <label key={opt.value} style={styles.radioRow}>
                  <input
                    type="radio"
                    name="retire_reason"
                    value={opt.value}
                    checked={reasonValue === opt.value}
                    onChange={() => setReasonValue(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <label style={styles.formField}>
            <span style={styles.formLabel}>
              {isRetire
                ? reasonValue === 'other'
                  ? 'Notes * (used as the reason)'
                  : 'Notes (optional)'
                : 'Reason / context (optional)'}
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...styles.formInput, minHeight: 60 }}
              placeholder={
                isRetire
                  ? reasonValue === 'other'
                    ? 'Describe the reason — recorded in equipment_events.'
                    : 'Optional context the audit log will preserve.'
                  : 'e.g. "Found in storage during inventory audit"'
              }
              maxLength={500}
            />
          </label>

          {error ? <div style={styles.actionMsgWarn}>{error}</div> : null}
        </div>

        <footer style={styles.modalFooter}>
          <button
            type="button"
            style={styles.refreshBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              ...styles.submitBtn,
              background: isRetire ? '#B91C1C' : '#15803D',
            }}
            disabled={submitting}
          >
            {submitting
              ? isRetire
                ? 'Retiring…'
                : 'Restoring…'
              : isRetire
                ? 'Retire unit'
                : 'Restore unit'}
          </button>
        </footer>
      </form>
    </div>
  );
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

  const items = data?.items ?? [];

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
          No inventory rows match these filters. Apply{' '}
          <code>seeds/233</code> if this is a fresh database, or import
          your fleet via the F10.1h CSV importer when it ships.
        </div>
      ) : (
        <table style={styles.table}>
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
                  <td style={styles.tdRight}>
                    <div style={styles.rowActionBar}>
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
  addBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  rowActionBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#1D3095',
    fontWeight: 500,
  },
  rowActionBar: {
    display: 'inline-flex',
    gap: 6,
    justifyContent: 'flex-end',
  },
  bulkBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    marginBottom: 12,
    background: '#EFF6FF',
    border: '1px solid #BFDBFE',
    borderRadius: 8,
    fontSize: 13,
    color: '#1E3A8A',
  },
  bulkLabel: {
    flex: 1,
  },
  thCheckbox: {
    textAlign: 'left',
    padding: '10px 8px 10px 14px',
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
    width: 32,
  },
  tdCheckbox: {
    padding: '10px 8px 10px 14px',
    borderBottom: '1px solid #F3F4F6',
    width: 32,
    verticalAlign: 'middle',
  },
  rowActionBtnRetire: {
    background: 'transparent',
    border: '1px solid #FCA5A5',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: 500,
  },
  rowActionBtnRestore: {
    background: 'transparent',
    border: '1px solid #86EFAC',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#15803D',
    fontWeight: 500,
  },
  submitBtn: {
    background: '#15803D',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  actionMsgOk: {
    background: '#F0FDF4',
    border: '1px solid #86EFAC',
    color: '#15803D',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  actionMsgWarn: {
    background: '#FEF3C7',
    border: '1px solid #FCD34D',
    color: '#92400E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  modalBackdrop: {
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
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  modalTitle: { fontSize: 16, fontWeight: 600, margin: 0 },
  modalClose: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#6B7280',
    lineHeight: 1,
    padding: 4,
  },
  modalBody: {
    padding: 20,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '12px 20px',
    borderTop: '1px solid #E2E5EB',
    background: '#FAFBFC',
    borderRadius: '0 0 12px 12px',
  },
  modalHint: {
    fontSize: 12,
    color: '#6B7280',
    margin: 0,
    fontStyle: 'italic',
  },
  formField: { display: 'flex', flexDirection: 'column', gap: 4 },
  formLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
  },
  formInput: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  fieldset: {
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  radioRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 13,
    cursor: 'pointer',
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
