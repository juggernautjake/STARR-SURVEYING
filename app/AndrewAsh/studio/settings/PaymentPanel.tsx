'use client';
// app/AndrewAsh/studio/settings/PaymentPanel.tsx — how Andrew tells the invoice page to take money.
//
// ── THE OFF SWITCH IS THE DEFAULT, AND THAT IS THE POINT ────────────────────────────────────────
//
// Every method starts disabled with an empty handle. A portal that advertises a Venmo handle he does
// not have sends a client's money to a stranger with a similar username, and both of them find out a
// week later. Nothing appears on an invoice until he has typed the destination himself.
//
// ── CARD IS A STATUS, NOT A SETTING ─────────────────────────────────────────────────────────────
//
// Stripe is not in this list because it cannot be switched on from a form — it needs his own account,
// his own keys, and an environment variable. So the panel REPORTS whether card payment is live and
// says exactly what is missing. A toggle that promises something a redeploy has to deliver is a lie
// with a nice affordance.

import { useState } from 'react';
import { Check, CreditCard, Loader2 } from 'lucide-react';

import type { PaymentMethod } from '@/lib/voice/payments';

const CATALOG: { id: PaymentMethod['id']; label: string; placeholder: string; hint: string }[] = [
  { id: 'zelle', label: 'Zelle', placeholder: 'the email or phone on your bank account', hint: 'No fee, lands in a day or two. The one most business clients will actually use.' },
  { id: 'venmo', label: 'Venmo', placeholder: '@andrew-ash', hint: 'Fine for coaching students. Use a business profile — personal Venmo for business income is against their terms.' },
  { id: 'cashapp', label: 'Cash App', placeholder: '$andrewash', hint: 'Same caution as Venmo.' },
  { id: 'paypal', label: 'PayPal', placeholder: 'paypal.me name or your PayPal email', hint: 'Takes about 3%. Worth having for clients abroad.' },
  { id: 'check', label: 'Check by mail', placeholder: 'who to make it payable to', hint: 'Some production companies pay no other way. Put the postal address in the note below.' },
  { id: 'other', label: 'Bank transfer / other', placeholder: 'e.g. ACH — details on request', hint: 'Never put a full account number here: this page is public to anyone with an invoice link.' },
];

interface Props {
  methods: PaymentMethod[];
  note: string | null;
  cardLive: boolean;
  cardMissing: string[];
}

export default function PaymentPanel({ methods, note, cardLive, cardMissing }: Props): React.ReactElement {
  const [rows, setRows] = useState<PaymentMethod[]>(() =>
    CATALOG.map((c) => {
      const saved = methods.find((m) => m.id === c.id);
      return saved ?? { id: c.id, label: c.label, handle: '', enabled: false };
    }),
  );
  const [payNote, setPayNote] = useState(note ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<PaymentMethod>): void {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/voice/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Everything is sent, enabled or not, so a handle he types today survives being switched off
        // and back on next month.
        body: JSON.stringify({ paymentMethods: rows, paymentNote: payNote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not save.');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  const liveCount = rows.filter((r) => r.enabled && r.handle.trim()).length;

  return (
    <div className="vaPanel">
      <div className="vaPanelHead">
        <h2 className="vaPanelTitle">Getting paid</h2>
        {saved && (
          <span className="vaMuted" style={{ fontSize: '0.75rem', color: 'var(--va-accent)' }}>
            <Check size={12} aria-hidden style={{ verticalAlign: -1 }} /> Saved
          </span>
        )}
      </div>

      <p className="vaHint" style={{ margin: '0 0 18px' }}>
        These appear on every invoice you send. Turn on the ones you actually watch — an option nobody
        checks is how a client pays you and you find out in April.
      </p>

      <div className="vaPayRows">
        {CATALOG.map((c) => {
          const row = rows.find((r) => r.id === c.id)!;
          return (
            <div key={c.id} className={`vaPayRow${row.enabled ? ' vaPayRowOn' : ''}`}>
              <label className="vaPayRowToggle">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => update(c.id, { enabled: e.target.checked })}
                />
                <span className="vaPayRowLabel">{c.label}</span>
              </label>
              <input
                className="vaInput vaPayRowInput"
                value={row.handle}
                placeholder={c.placeholder}
                aria-label={`${c.label} — where clients send it`}
                onChange={(e) => update(c.id, { handle: e.target.value })}
              />
              <p className="vaHint vaPayRowHint">{c.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="vaField" style={{ marginTop: 20 }}>
        <label className="vaLabel" htmlFor="va-pay-note">A line above the payment options</label>
        <textarea
          id="va-pay-note"
          className="vaTextarea"
          rows={2}
          value={payNote}
          placeholder="e.g. Zelle is easiest. Please put the invoice number in the note."
          onChange={(e) => {
            setPayNote(e.target.value);
            setSaved(false);
          }}
        />
        <p className="vaHint">Optional. If you post cheques, the address goes here.</p>
      </div>

      <div className="vaBtnRow" style={{ marginTop: 18, alignItems: 'center' }}>
        <button type="button" className="vaBtn vaBtnSolid vaBtnSm" disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Check size={14} aria-hidden />}
          Save
        </button>
        <span className="vaMuted" style={{ fontSize: '0.75rem' }}>
          {liveCount === 0
            ? 'Nothing switched on — invoices will just say to reply to your email.'
            : `${liveCount} option${liveCount === 1 ? '' : 's'} on your invoices.`}
        </span>
      </div>

      {error && (
        <p className="vaError" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {/* ── Card status ── */}
      <div className="vaCardStatus">
        <CreditCard size={16} aria-hidden style={{ color: cardLive ? 'var(--va-accent)' : 'var(--va-text-muted)', flex: 'none' }} />
        <div>
          <strong style={{ color: 'var(--va-text)', fontSize: '0.875rem' }}>
            {cardLive ? 'Card payment is on' : 'Card payment is off'}
          </strong>
          <p className="vaHint" style={{ margin: '5px 0 0' }}>
            {cardLive ? (
              <>
                Clients can pay by card on the invoice page. Stripe keeps about 2.9% + 30¢, and the
                money lands in your bank two days later.
              </>
            ) : (
              <>
                To switch it on you need a Stripe account of your own, and these still to be set on the
                host:{' '}
                {cardMissing.map((name, i) => (
                  <span key={name}>
                    {i > 0 ? ', ' : ''}
                    <code>{name}</code>
                  </span>
                ))}
                . Until then, invoices show the options above, which is genuinely fine for a first
                year — most clients prefer a transfer anyway, and it costs you nothing.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
