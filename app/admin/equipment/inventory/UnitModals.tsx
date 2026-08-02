'use client';
// app/admin/equipment/inventory/UnitModals.tsx — add, edit, retire and restore a unit.
//
// Lifted out of page.tsx for platform audit item 18 (2,392 lines). Three dialogs, moved verbatim.
// They are one file rather than three because they are one lifecycle — a unit is created here,
// corrected here, and taken out of service here — and they share the same shell styles.
import { useCallback, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { usePageError } from '../../hooks/usePageError';
import type { EquipmentRow } from './inventory-types';
import { CONDITION_OPTIONS, STATUS_OPTIONS, type StatusFilter } from './inventory-types';
import { styles } from './inventory-styles';


// ── Add Unit modal (Phase F10.1c-ii) ───────────────────────────────────────
// Modal overlay form that POSTs to /api/admin/equipment. Keeps to the
// most-useful create fields (name + item_kind required; brand / model /
// serial / location / notes optional). Cost basis, calibration, and
// vehicle assignment are deferred to the F10.1d inline-edit flow so the
// modal stays scannable. Consumable-only fields (unit, quantity_on_hand,
// low_stock_threshold) appear conditionally when item_kind='consumable'.

export interface AddUnitModalProps {
  onClose: () => void;
  onCreated: (item: EquipmentRow) => void;
}

export const ITEM_KIND_RADIO: Array<{ value: 'durable' | 'consumable' | 'kit'; label: string; hint: string }> = [
  { value: 'durable', label: 'Durable', hint: 'One row per physical unit (e.g. a total station)' },
  { value: 'consumable', label: 'Consumable', hint: 'One row per SKU + quantity_on_hand (paint, lath, ribbon)' },
  { value: 'kit', label: 'Kit', hint: 'Pre-bundled grouping that checks out as a unit' },
];

export function AddUnitModal({ onClose, onCreated }: AddUnitModalProps) {
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
  const [condition, setCondition] = useState(''); // seeds/238 — empty = unrecorded
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
      if (condition) body.condition = condition;

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
      condition,
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
            <X size={15} strokeWidth={2.5} aria-hidden="true" />
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
            <span style={styles.formLabel}>Condition</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              style={styles.formInput}
            >
              {CONDITION_OPTIONS.map((o) => (
                <option key={o.value || 'unrecorded'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span style={styles.modalHint}>
              ▸ Physical condition — distinct from current_status
              (lifecycle). Server stamps the timestamp when set.
            </span>
          </label>

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
            ▸ Cost basis, calibration dates, warranty info, and
            photos all get added through the Edit screen — use this
            form for the basic intake, then open Edit once the row
            is created.
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

export interface EditUnitModalProps {
  row: EquipmentRow;
  onClose: () => void;
  onUpdated: (item: EquipmentRow) => void;
}

export function EditUnitModal({ row, onClose, onUpdated }: EditUnitModalProps) {
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
  const [condition, setCondition] = useState(row.condition ?? '');
  // Photo upload state — uses POST /api/admin/equipment/[id]/photo
  // separately from the main PATCH because uploads are multipart
  // and the rest of the form is JSON.
  const [photoSignedUrl, setPhotoSignedUrl] = useState<string | null>(
    row.photo_signed_url ?? null
  );
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
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

  const handlePhotoUpload = useCallback(
    async (file: File) => {
      setPhotoError(null);
      // Client-side mirror of the F10.1 upload endpoint constraints
      // — fail fast before the multipart roundtrip.
      const ALLOWED = new Set([
        'image/jpeg',
        'image/png',
        'image/heic',
        'image/heif',
        'image/webp',
      ]);
      if (!ALLOWED.has(file.type)) {
        setPhotoError(
          `Type "${file.type}" not supported. Use JPEG / PNG / HEIC / HEIF / WEBP.`
        );
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setPhotoError('File too large — 10 MB max.');
        return;
      }

      setPhotoUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(
          `/api/admin/equipment/${row.id}/photo`,
          { method: 'POST', body: fd }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPhotoError(json.error ?? `Upload failed (${res.status})`);
          return;
        }
        if (json.signed_url) {
          setPhotoSignedUrl(json.signed_url as string);
        }
      } catch (err) {
        setPhotoError(
          err instanceof Error ? err.message : 'Upload failed'
        );
      } finally {
        setPhotoUploading(false);
        if (photoInputRef.current) photoInputRef.current.value = '';
      }
    },
    [row.id]
  );

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
        // seeds/238 — empty string ⇒ explicit null (clears the
        // condition + the paired condition_updated_at server-side).
        condition: condition || null,
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
      condition,
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
            <X size={15} strokeWidth={2.5} aria-hidden="true" />
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

          <div style={styles.photoBlock}>
            <span style={styles.formLabel}>Photo</span>
            <div style={styles.photoRow}>
              {photoSignedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoSignedUrl}
                  alt="Equipment"
                  style={styles.photoPreview}
                />
              ) : (
                <div style={{ ...styles.photoPlaceholder, display: "inline-flex", alignItems: "center", gap: "0.4rem" }}><Camera size={16} strokeWidth={1.75} /> No photo yet</div>
              )}
              <div style={styles.photoControls}>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePhotoUpload(file);
                  }}
                />
                <button
                  type="button"
                  style={styles.fileBtn}
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                >
                  {photoUploading
                    ? 'Uploading…'
                    : photoSignedUrl
                      ? 'Replace photo'
                      : 'Upload photo'}
                </button>
                <span style={styles.modalHint}>
                  ▸ JPEG / PNG / HEIC / HEIF / WEBP up to 10 MB.
                  Replaces any existing photo on this unit.
                </span>
                {photoError ? (
                  <div style={styles.actionMsgWarn}>{photoError}</div>
                ) : null}
              </div>
            </div>
          </div>

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
            <legend style={styles.formLabel}>Cost basis (for depreciation + tax)</legend>
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
            <legend style={styles.formLabel}>Calibration &amp; warranty dates</legend>
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
            <span style={styles.formLabel}>Condition</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              style={styles.formInput}
            >
              {CONDITION_OPTIONS.map((o) => (
                <option key={o.value || 'unrecorded'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {row.condition_updated_at && row.condition === condition ? (
              <span style={styles.modalHint}>
                ▸ Last updated{' '}
                {new Date(row.condition_updated_at).toLocaleDateString()}.
                Changing this stamps a new timestamp server-side.
              </span>
            ) : (
              <span style={styles.modalHint}>
                ▸ Stamps condition_updated_at server-side. Distinct
                from the lifecycle status above.
              </span>
            )}
          </label>

          <label style={styles.formField}>
            <span style={styles.formLabel}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...styles.formInput, minHeight: 60 }}
            />
          </label>

          <p style={styles.modalHint}>
            ▸ To retire or un-retire a unit, use the Retire action
            from the row menu. This form covers edits to active gear
            only.
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

export interface RetireRestoreModalProps {
  row: EquipmentRow;
  mode: 'retire' | 'restore';
  onClose: () => void;
  onCompleted: (item: { id: string; name: string | null }) => void;
}

export const RETIRE_REASON_OPTIONS = [
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

export function RetireRestoreModal({
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
            <X size={15} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </header>

        <div style={styles.modalBody}>
          <p style={styles.modalHint}>
            {isRetire
              ? `Retiring "${row.name ?? '(unnamed)'}" hides this unit from the active catalog and any future reservations. History is preserved for auditing + depreciation purposes — you can restore it later if needed.`
              : `Restoring "${row.name ?? '(unnamed)'}" brings it back into the active catalog and resets the status to 'available'. The activity history still shows the full retire/restore trail.`}
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
              background: isRetire ? 'var(--color-error-text)' : 'var(--color-success-text)',
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
