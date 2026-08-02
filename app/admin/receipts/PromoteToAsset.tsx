'use client';
// app/admin/receipts/PromoteToAsset.tsx — F10.9's promote-a-receipt-to-an-asset panel + modal.
//
// Lifted out of app/admin/receipts/page.tsx for platform audit item 18. Verbatim; the panel already
// took everything it needed as props.
import { useState } from 'react';
import { AlertTriangle, Landmark, X } from 'lucide-react';
import Link from 'next/link';
import type { AdminReceiptRow } from './receipt-types';
// The modal chrome is the picker's — one dialog style for both, rather than a second copy that
// drifts the first time somebody adjusts a padding.
import { pickerStyles } from './MaintenanceLink';

// ────────────────────────────────────────────────────────────
// F10.9 — Promote-to-asset panel + modal
// ────────────────────────────────────────────────────────────
//
// Renders inside the expanded receipt row when category =
// 'equipment'. Three states:
//   * Already promoted → green badge + link to the asset.
//   * Approved/exported but not yet promoted → "Promote to asset"
//     button that opens a modal.
//   * Pending/rejected → greyed hint "Approve first to promote."

export const ASSET_DEPRECIATION_METHODS: Array<{ value: string; label: string }> = [
  { value: 'straight_line', label: 'Straight-line (default)' },
  { value: 'macrs_5yr', label: 'MACRS — 5 year' },
  { value: 'macrs_7yr', label: 'MACRS — 7 year' },
  { value: 'section_179', label: 'Section 179 (full expense year 1)' },
  { value: 'bonus_first_year', label: 'Bonus first-year depreciation' },
  { value: 'none', label: 'None (do not depreciate)' },
];

export const ASSET_ITEM_KINDS: Array<{ value: string; label: string }> = [
  { value: 'durable', label: 'Durable (default)' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'kit', label: 'Kit' },
];

export function PromoteToAssetPanel({
  row,
  onRefresh,
}: {
  row: AdminReceiptRow;
  onRefresh: () => Promise<void>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const isApproved =
    row.status === 'approved' || row.status === 'exported';

  // Already promoted — show a confirmation badge + link.
  if (row.promoted_to_equipment_id) {
    return (
      <div style={promoteStyles.panel}>
        <div style={promoteStyles.headerRow}>
          <strong style={promoteStyles.title}>
            <Landmark size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Promoted to capital asset
          </strong>
          <Link
            href={`/admin/equipment/${row.promoted_to_equipment_id}`}
            style={promoteStyles.assetLink}
          >
            View asset →
          </Link>
        </div>
        <p style={promoteStyles.emptyHint}>
          This receipt is on the depreciation ledger.{' '}
          <code style={promoteStyles.code}>
            {row.promoted_to_equipment_id.slice(0, 8)}
          </code>
          . The Batch QQ tax summary will skip it on the receipts
          side so the dollars don&apos;t double-count.
        </p>
      </div>
    );
  }

  return (
    <div style={promoteStyles.panel}>
      <div style={promoteStyles.headerRow}>
        <strong style={promoteStyles.title}>
          <Landmark size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Promote to capital asset?
        </strong>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={!isApproved}
          style={
            isApproved
              ? promoteStyles.linkBtn
              : promoteStyles.linkBtnDisabled
          }
        >
          Promote to asset
        </button>
      </div>
      <p style={promoteStyles.emptyHint}>
        {isApproved
          ? 'Creates an inventory row carrying this receipt’s total as the cost basis. The depreciation worker amortizes over multiple years instead of one.'
          : 'Approve the receipt first; capital-asset promotion only fires on approved or exported receipts.'}
      </p>

      {modalOpen ? (
        <PromoteToAssetModal
          row={row}
          onClose={() => setModalOpen(false)}
          onPromoted={async () => {
            setModalOpen(false);
            await onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}

export function PromoteToAssetModal({
  row,
  onClose,
  onPromoted,
}: {
  row: AdminReceiptRow;
  onClose: () => void;
  onPromoted: () => Promise<void>;
}) {
  const [name, setName] = useState(row.vendor_name ?? '');
  const [category, setCategory] = useState('');
  const [itemKind, setItemKind] = useState('durable');
  const [depreciationMethod, setDepreciationMethod] =
    useState('straight_line');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState('');
  const [placedInServiceAt, setPlacedInServiceAt] = useState(
    row.transaction_at
      ? row.transaction_at.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        receipt_id: row.id,
        name: name.trim(),
        item_kind: itemKind,
        depreciation_method: depreciationMethod,
        placed_in_service_at: placedInServiceAt,
      };
      if (category.trim()) body.category = category.trim();
      const trimmedLife = usefulLifeMonths.trim();
      if (trimmedLife) {
        const n = Number.parseInt(trimmedLife, 10);
        if (!Number.isInteger(n) || n <= 0) {
          throw new Error('Useful life must be a positive integer.');
        }
        body.useful_life_months = n;
      }
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch(
        '/api/admin/equipment/promote-from-receipt',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `request failed: ${res.status}`);
      }
      await onPromoted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={pickerStyles.backdrop} onClick={onClose}>
      <div
        style={pickerStyles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header style={pickerStyles.header}>
          <h2 style={pickerStyles.title}>Promote to capital asset</h2>
          <button
            type="button"
            onClick={onClose}
            style={pickerStyles.close}
            aria-label="Close"
            disabled={submitting}
          >
            <X size={15} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </header>
        <div style={pickerStyles.body}>
          <p style={pickerStyles.copy}>
            Creates an{' '}
            <code style={pickerStyles.code}>equipment_inventory</code>{' '}
            row carrying{' '}
            {row.total_cents !== null
              ? `$${(row.total_cents / 100).toFixed(2)}`
              : 'this receipt&apos;s total'}{' '}
            as the cost basis. The §5.12.10 depreciation worker
            amortizes over the chosen method instead of letting
            the receipt land as a single-year Schedule C expense.
          </p>

          <label style={pickerStyles.checkboxRow}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                width: 110,
              }}
            >
              Name *
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Trimble TSC7 #4"
              style={{ ...pickerStyles.input, flex: 1 }}
              disabled={submitting}
            />
          </label>
          <label style={pickerStyles.checkboxRow}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                width: 110,
              }}
            >
              Category
            </span>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. total_station"
              style={{ ...pickerStyles.input, flex: 1 }}
              disabled={submitting}
            />
          </label>
          <label style={pickerStyles.checkboxRow}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                width: 110,
              }}
            >
              Item kind
            </span>
            <select
              value={itemKind}
              onChange={(e) => setItemKind(e.target.value)}
              style={{ ...pickerStyles.input, flex: 1 }}
              disabled={submitting}
            >
              {ASSET_ITEM_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label style={pickerStyles.checkboxRow}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                width: 110,
              }}
            >
              Method
            </span>
            <select
              value={depreciationMethod}
              onChange={(e) => setDepreciationMethod(e.target.value)}
              style={{ ...pickerStyles.input, flex: 1 }}
              disabled={submitting}
            >
              {ASSET_DEPRECIATION_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label style={pickerStyles.checkboxRow}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                width: 110,
              }}
            >
              Useful life
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
              placeholder="months (optional)"
              style={{ ...pickerStyles.input, flex: 1 }}
              disabled={submitting}
            />
          </label>
          <label style={pickerStyles.checkboxRow}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                width: 110,
              }}
            >
              In service
            </span>
            <input
              type="date"
              value={placedInServiceAt}
              onChange={(e) => setPlacedInServiceAt(e.target.value)}
              style={{ ...pickerStyles.input, flex: 1 }}
              disabled={submitting}
            />
          </label>
          <label
            style={{
              ...pickerStyles.checkboxRow,
              alignItems: 'flex-start',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                width: 110,
                paddingTop: 8,
              }}
            >
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context for the EM."
              style={{ ...pickerStyles.input, flex: 1, minHeight: 60 }}
              disabled={submitting}
            />
          </label>

          {error ? <div style={{ ...pickerStyles.error, display: "inline-flex", alignItems: "center", gap: "0.4rem" }}><AlertTriangle size={14} strokeWidth={2} /> {error}</div> : null}
        </div>
        <footer style={pickerStyles.footer}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={pickerStyles.cancelBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{
              ...pickerStyles.cancelBtn,
              background: 'var(--color-brand-navy)',
              color: 'var(--color-text-on-brand)',
              borderColor: 'var(--color-brand-navy)',
            }}
          >
            {submitting ? 'Promoting…' : 'Promote'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export const promoteStyles: Record<string, React.CSSProperties> = {
  panel: {
    marginTop: 12,
    padding: 12,
    background: 'var(--color-warning-surface)',
    border: '1px solid var(--color-brand-gold)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap' as const,
  },
  title: {
    color: 'var(--color-warning-text)',
    fontSize: 13,
  },
  emptyHint: {
    margin: 0,
    fontSize: 11,
    color: 'var(--color-warning-text)',
    fontStyle: 'italic' as const,
  },
  linkBtn: {
    background: 'var(--color-warning-text)',
    color: 'var(--color-text-on-brand)',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  linkBtnDisabled: {
    background: 'transparent',
    color: 'var(--color-warning-text)',
    border: '1px solid var(--color-warning-text)',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  assetLink: {
    color: 'var(--color-warning-text)',
    textDecoration: 'underline',
    fontSize: 12,
    fontWeight: 600,
  },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: 'var(--color-bg-card)',
    padding: '1px 6px',
    borderRadius: 4,
    margin: '0 2px',
    color: 'var(--color-warning-text)',
  },
};
