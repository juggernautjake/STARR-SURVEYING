'use client';
// app/admin/receipts/ReceiptReadStatus.tsx — how a receipt was read, and how sure that reading is.
//
// Owner, 2026-10-07: "We need the analysis to be good every time and to get consistent results
// every time." Every receipt is read twice on zoomed sections and checked (lib/receipts/zoom-read.ts).
// This says which of three outcomes it reached, what the two reads disagreed on and how that was
// settled, and what the closer reading corrected — so a reviewer knows what was already checked
// and what still needs their eyes.
import './ReceiptReadStatus.css';

interface Details {
  method?: string;
  sections?: number;
  agreed?: string[];
  disputes?: Array<{ field: string; a: unknown; b: unknown; settled: unknown; certain: boolean }>;
  checks?: Array<{ check: string; ok: boolean; message?: string }>;
  notes?: string[];
  corrections?: Array<{ field: string; from: unknown; to: unknown }>;
}

const FIELD: Record<string, string> = {
  vendor_name: 'business', vendor_address: 'address', transaction_at: 'date', subtotal_cents: 'subtotal', tax_cents: 'tax',
  tip_cents: 'tip', discount_cents: 'discount', total_cents: 'total', payment_last4: 'card', receipt_number: 'receipt number',
  payment_method: 'payment method',
};
const show = (field: string, v: unknown) => (v == null ? 'nothing' : field.endsWith('_cents') ? `$${(Number(v) / 100).toFixed(2)}` : field === 'transaction_at' ? String(v).slice(0, 10) : String(v));

export function ReceiptReadStatus({ status, details }: { status: string | null; details: Details | null }): React.ReactElement | null {
  if (!status) return null;
  const d = details ?? {};
  const headline = status === 'agreed'
    ? 'Read twice — both readings agree and the figures add up.'
    : status === 'verified'
      ? 'Read twice — the readings differed, and a zoomed third look settled it.'
      : 'Needs a person to check — something could not be confirmed from the photo.';
  const failing = (d.checks ?? []).filter((c) => !c.ok);
  return (
    <section className={`rrs rrs--${status}`} data-testid="receipt-read-status">
      <p className="rrs__head"><span className="rrs__dot" aria-hidden="true" /> {headline}</p>
      {d.method && d.method !== 'single' ? (
        <p className="rrs__meta">{d.method === 'pdf-2' ? 'Read from the PDF' : `Cut into ${d.sections ?? '?'} zoomed sections`}{d.agreed?.length ? ` · agreed on ${d.agreed.length} key fields` : ''}</p>
      ) : null}
      {d.disputes?.length ? (
        <ul className="rrs__list">
          {d.disputes.map((x) => (
            <li key={x.field}>
              {FIELD[x.field] ?? x.field}: one reading said {show(x.field, x.a)}, the other {show(x.field, x.b)} → {show(x.field, x.settled)}{x.certain ? '' : ' (not certain — check it)'}
            </li>
          ))}
        </ul>
      ) : null}
      {d.corrections?.length ? (
        <p className="rrs__meta">Corrected from the earlier reading: {d.corrections.map((c) => `${FIELD[c.field] ?? c.field} ${show(c.field, c.from)} → ${show(c.field, c.to)}`).join('; ')}.</p>
      ) : null}
      {failing.length ? <ul className="rrs__list rrs__list--bad">{failing.map((c) => <li key={c.check}>{c.message ?? c.check}</li>)}</ul> : null}
    </section>
  );
}
