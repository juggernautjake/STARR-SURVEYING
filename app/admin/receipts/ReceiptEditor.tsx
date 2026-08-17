'use client';
// app/admin/receipts/ReceiptEditor.tsx — correct anything the AI read off the paper.
//
// Owner, 2026-08-16: *"We also need to be able to edit all of the details of a receipt once it has
// been analyzed … I uploaded a receipt that had the date 8/12/2016, but because the ink quality was
// poor when the receipt was printed, it looked like 8/2/2026."*
//
// Until this existed, the receipts page could change a receipt's CATEGORY, tax flag, note, job,
// payer and card — every bookkeeping decision ABOUT the receipt — and not one thing the receipt
// actually says. A misread date had no fix: re-running the AI reads the same faded ink the same
// way, and rejecting the receipt throws away a real expense.
//
// ── WHY THE FIELDS THE AI DOUBTED ARE MARKED IN HERE TOO ────────────────────────────────────────
//
// The point of the form is to fix what is wrong, and the receipt is a photo of a piece of paper the
// person is holding. Showing which fields the AI itself wants checked turns "read all seventeen
// fields against the photo" into "check these three" — which is the difference between a review
// that happens and one that does not.

import { useCallback, useMemo, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { reviewNeeds } from '@/lib/receipts/review-needs';

/** Only what the editor reads. The page's row type is much wider. */
export interface EditableReceipt {
  id: string;
  vendor_name?: string | null;
  vendor_address?: string | null;
  transaction_at?: string | null;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  tip_cents?: number | null;
  service_charge_cents?: number | null;
  total_cents?: number | null;
  payment_method?: string | null;
  payment_last4?: string | null;
  card_match_status?: string | null;
  ai_confidence_per_field?: Record<string, number> | null;
  ai_extras?: Record<string, unknown> | null;
}

/** Cents ⇄ the dollars people type. Kept as strings so a half-typed "12." does not become 12. */
function centsToInput(v: number | null | undefined): string {
  if (typeof v !== 'number') return '';
  return (v / 100).toFixed(2);
}
function inputToCents(s: string): number | null | 'invalid' {
  const t = s.trim();
  if (t === '') return null;
  if (!/^-?\d*\.?\d{0,2}$/.test(t)) return 'invalid';
  const n = Number(t);
  if (!Number.isFinite(n)) return 'invalid';
  return Math.round(n * 100);
}

/** `transaction_at` is a timestamp; the input is a plain date. Formatted from LOCAL parts — the
 *  toISOString() split would show the previous day for anyone west of Greenwich, which on a form
 *  about a misread DATE would be its own bug. */
function dateToInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONEY_FIELDS = [
  ['subtotal_cents', 'Subtotal'],
  ['tax_cents', 'Tax'],
  ['tip_cents', 'Tip'],
  ['service_charge_cents', 'Service charge'],
  ['total_cents', 'Total'],
] as const;

export function ReceiptEditor({
  row, onSave, busy,
}: {
  row: EditableReceipt;
  /** Hands the validated patch up to the page's existing `onMutate`, which owns the PATCH, the
   *  error surface and the reload. Doing the fetch in here would mean a second copy of all three,
   *  and a save that reported failure differently from every other action on the row. */
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const extras = (row.ai_extras ?? {}) as Record<string, unknown>;
  const initial = useMemo(() => ({
    vendor_name: row.vendor_name ?? '',
    vendor_address: row.vendor_address ?? '',
    transaction_at: dateToInput(row.transaction_at),
    subtotal_cents: centsToInput(row.subtotal_cents),
    tax_cents: centsToInput(row.tax_cents),
    tip_cents: centsToInput(row.tip_cents),
    service_charge_cents: centsToInput(row.service_charge_cents),
    total_cents: centsToInput(row.total_cents),
    payment_method: row.payment_method ?? '',
    payment_last4: row.payment_last4 ?? '',
    card_brand: (extras.card_brand as string) ?? '',
    card_holder_name: (extras.card_holder_name as string) ?? '',
    receipt_number: (extras.receipt_number as string) ?? '',
    vendor_phone: (extras.vendor_phone as string) ?? '',
    discount_cents: centsToInput(extras.discount_cents as number | null),
  }), [row, extras]);

  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError('');
  };

  /** Which fields the AI wants a human to confirm — marked in the form so the eye goes there. */
  const flagged = useMemo(() => new Set(reviewNeeds(row).map((n) => n.field)), [row]);

  const save = useCallback(async () => {
    setError('');
    const patch: Record<string, unknown> = {
      vendor_name: form.vendor_name.trim() || null,
      vendor_address: form.vendor_address.trim() || null,
      transaction_at: form.transaction_at || null,
      payment_method: form.payment_method || null,
      payment_last4: form.payment_last4.trim() || null,
      card_brand: form.card_brand.trim() || null,
      card_holder_name: form.card_holder_name.trim() || null,
      receipt_number: form.receipt_number.trim() || null,
      vendor_phone: form.vendor_phone.trim() || null,
    };
    for (const [key] of MONEY_FIELDS) {
      const c = inputToCents(form[key]);
      if (c === 'invalid') { setError(`${key.replace('_cents', '')} is not an amount.`); return; }
      patch[key] = c;
    }
    const disc = inputToCents(form.discount_cents);
    if (disc === 'invalid') { setError('Discount is not an amount.'); return; }
    patch.discount_cents = disc;

    setSaving(true);
    try {
      await onSave(patch);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [form, onSave]);

  if (!open) {
    return (
      <button type="button" style={s.openBtn} disabled={busy} onClick={() => { setForm(initial); setOpen(true); }}>
        <Pencil size={13} strokeWidth={2} aria-hidden /> Correct details
      </button>
    );
  }

  const field = (key: keyof typeof form, label: string, type = 'text', extra: Record<string, unknown> = {}) => (
    <label style={s.label}>
      <span style={s.labelText}>
        {label}
        {/* The AI's own doubt, in the place where it can be resolved. */}
        {flagged.has(key as string) && <span style={s.check} title="The AI flagged this — check it against the photo">check</span>}
      </span>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
        style={s.input}
        {...extra}
      />
    </label>
  );

  return (
    <div style={s.panel}>
      <div style={s.head}>
        <strong style={s.title}>Correct what the AI read</strong>
        <button type="button" style={s.close} onClick={() => setOpen(false)} aria-label="Close">
          <X size={14} strokeWidth={2} />
        </button>
      </div>
      <p style={s.hint}>
        Read these off the photo. Anything you change is recorded as your correction, and the AI&apos;s
        confidence note for that field is dropped.
      </p>

      <div style={s.grid}>
        {field('vendor_name', 'Vendor')}
        {field('transaction_at', 'Date', 'date')}
        {field('vendor_address', 'Vendor address')}
        {field('vendor_phone', 'Vendor phone')}
      </div>

      <div style={s.grid}>
        {MONEY_FIELDS.map(([key, label]) => (
          <div key={key}>{field(key, label, 'text', { inputMode: 'decimal', placeholder: '0.00' })}</div>
        ))}
        {field('discount_cents', 'Discount', 'text', { inputMode: 'decimal', placeholder: '0.00' })}
      </div>

      <div style={s.grid}>
        <label style={s.label}>
          <span style={s.labelText}>Payment method</span>
          <select value={form.payment_method} onChange={(e) => set('payment_method')(e.target.value)} style={s.input}>
            <option value="">Not stated</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="other">Other</option>
          </select>
        </label>
        {field('payment_last4', 'Card last four', 'text', { inputMode: 'numeric', maxLength: 4, placeholder: '4054' })}
        {field('card_brand', 'Card brand')}
        {field('card_holder_name', 'Cardholder name')}
        {field('receipt_number', 'Receipt number')}
      </div>

      {error && <p role="alert" style={s.error}>{error}</p>}

      <div style={s.actions}>
        <button type="button" style={s.cancel} onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
        <button type="button" style={s.save} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save corrections'}
        </button>
      </div>
    </div>
  );
}

// Bare `var(--theme-*)`: themes.css is loaded by the root layout, so a hex fallback is dead code
// that only re-introduces the literal the colour scanner exists to stop.
const s: Record<string, React.CSSProperties> = {
  openBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    height: 'var(--button-height-sm)', padding: '0 10px',
    fontSize: 12, fontWeight: 600,
    color: 'var(--theme-fg-secondary)', background: 'var(--theme-bg-surface)',
    border: '1px solid var(--theme-border)', borderRadius: 6, cursor: 'pointer',
  },
  panel: {
    marginTop: 10, padding: 12, borderRadius: 8,
    border: '1px solid var(--theme-border)', background: 'var(--theme-bg-elevated)',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 13, color: 'var(--theme-fg-primary)' },
  close: { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--theme-fg-muted)', padding: 2 },
  hint: { margin: '0 0 10px', fontSize: 12, lineHeight: 1.5, color: 'var(--theme-fg-muted)' },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 8, marginBottom: 10,
  },
  label: { display: 'grid', gap: 3 },
  labelText: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 600, color: 'var(--theme-fg-secondary)',
  },
  check: {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
    color: 'var(--theme-warning)', border: '1px solid var(--theme-warning)',
    borderRadius: 3, padding: '0 3px',
  },
  input: {
    height: 'var(--input-height)', boxSizing: 'border-box', padding: '0 8px',
    fontSize: 13, fontFamily: 'inherit', width: '100%',
    color: 'var(--theme-fg-primary)', background: 'var(--theme-bg-surface)',
    border: '1px solid var(--theme-border)', borderRadius: 6,
  },
  error: { margin: '0 0 8px', fontSize: 12, color: 'var(--theme-danger)' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  cancel: {
    height: 'var(--button-height)', padding: '0 14px', fontSize: 13, fontWeight: 600,
    color: 'var(--theme-fg-secondary)', background: 'var(--theme-bg-surface)',
    border: '1px solid var(--theme-border)', borderRadius: 6, cursor: 'pointer',
  },
  save: {
    height: 'var(--button-height)', padding: '0 16px', fontSize: 13, fontWeight: 600,
    color: 'var(--theme-accent-fg)', background: 'var(--theme-accent)',
    border: 'none', borderRadius: 6, cursor: 'pointer',
  },
};
