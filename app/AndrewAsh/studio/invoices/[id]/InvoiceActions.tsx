'use client';
// app/AndrewAsh/studio/invoices/[id]/InvoiceActions.tsx — send it, get paid, record it.
//
// ── THE PAY LINK IS THE PRODUCT ─────────────────────────────────────────────────────────────────
//
// The single most useful thing this page does is produce a URL Andrew can paste into an email. A
// client who has to log in to pay is a client who pays late; a link that opens straight onto the
// amount and a card field is a client who pays now. Copy-to-clipboard is therefore the primary
// action once the invoice is sent, not an afterthought in a menu.
//
// ── RECORD A PAYMENT DEFAULTS TO THE FULL BALANCE ───────────────────────────────────────────────
//
// Because that is what happens almost every time. Partial payments are possible and are the
// exception, so they cost one edit rather than making the common case cost one.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Check, Copy, ExternalLink, Loader2, Send, Trash2 } from 'lucide-react';
import { formatCents, parseCents } from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

const METHODS = [
  { id: 'stripe', label: 'Card (Stripe)' },
  { id: 'zelle', label: 'Zelle' },
  { id: 'venmo', label: 'Venmo' },
  { id: 'cashapp', label: 'Cash App' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'check', label: 'Cheque' },
  { id: 'cash', label: 'Cash' },
  { id: 'other', label: 'Something else' },
];

interface Props {
  id: string;
  status: string;
  derived: string;
  balanceCents: number;
  totalCents: number;
  accessToken: string;
  clientEmail: string | null;
  invoiceNumber: string;
}

export default function InvoiceActions({
  id,
  status,
  derived,
  balanceCents: balance,
  accessToken,
  clientEmail,
  invoiceNumber,
}: Props): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState(String((balance / 100).toFixed(2)));
  const [method, setMethod] = useState('stripe');
  const [reference, setReference] = useState('');
  const [pending, setPending] = useState(false);

  // Built in the browser so it carries whatever host the studio is actually being used on — localhost
  // in development, the real domain in production, and the new domain after the site moves. A URL
  // baked at build time would be wrong in at least one of those.
  const payUrl = typeof window !== 'undefined' ? `${window.location.origin}${BASE_PATH}/invoice/${accessToken}` : '';

  async function patch(body: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/voice/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const mailto = clientEmail
    ? `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(
        `Invoice ${invoiceNumber}`,
      )}&body=${encodeURIComponent(`Hi,\n\nHere is invoice ${invoiceNumber}. You can view and pay it here:\n\n${payUrl}\n\nThanks!\n`)}`
    : null;

  return (
    <>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      {status === 'draft' ? (
        <div className="vaPanel">
          <div className="vaPanelHead">
            <h2 className="vaPanelTitle">Not sent yet</h2>
          </div>
          <p className="vaMuted" style={{ fontSize: '0.875rem', marginBottom: 16 }}>
            Nobody can see this. Sending locks the line items — after that, changes mean voiding it and
            raising a new one, which is how invoices are supposed to work.
          </p>
          <button
            type="button"
            className="vaBtn vaBtnSolid vaBtnSm"
            style={{ width: '100%' }}
            disabled={busy === 'send'}
            onClick={() => void patch({ send: true }, 'send')}
          >
            {busy === 'send' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Send size={14} aria-hidden />}
            Mark as sent
          </button>
        </div>
      ) : (
        <div className="vaPanel">
          <div className="vaPanelHead">
            <h2 className="vaPanelTitle">The payment link</h2>
          </div>
          <p className="vaMuted" style={{ fontSize: '0.875rem', marginBottom: 12 }}>
            Send this to the client. It opens straight onto the amount — no account, no login.
          </p>
          <div className="vaCopyRow">
            <input className="vaInput" readOnly value={payUrl} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="vaBtn vaBtnOutline vaBtnSm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(payUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  // Clipboard access can be refused (insecure origin, permissions). The input is
                  // already selectable, so say so rather than failing silently.
                  setError('Could not copy — select the link and copy it manually.');
                }
              }}
            >
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="vaStudioActions">
            {mailto && (
              <a href={mailto} className="vaBtn vaBtnSolid vaBtnSm">
                <Send size={13} aria-hidden /> Email it
              </a>
            )}
            <a href={payUrl} target="_blank" rel="noopener noreferrer" className="vaBtn vaBtnGhost vaBtnSm">
              <ExternalLink size={13} aria-hidden /> Preview
            </a>
          </div>
        </div>
      )}

      {balance > 0 && derived !== 'void' && (
        <div className="vaPanel">
          <div className="vaPanelHead">
            <h2 className="vaPanelTitle">Record a payment</h2>
          </div>
          <p className="vaMuted" style={{ fontSize: '0.875rem', marginBottom: 14 }}>
            Card payments record themselves. Use this for a cheque, a transfer, or cash.
          </p>

          <div className="vaField">
            <label className="vaLabel" htmlFor="va-pay-amount">Amount</label>
            <input
              id="va-pay-amount"
              className="vaInput"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="vaHint">Owing: {formatCents(balance)}</p>
          </div>

          <div className="vaField">
            <label className="vaLabel" htmlFor="va-pay-method">How</label>
            <select id="va-pay-method" className="vaSelect" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="vaField">
            <label className="vaLabel" htmlFor="va-pay-ref">Reference (optional)</label>
            <input
              id="va-pay-ref"
              className="vaInput"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque number, transfer note"
            />
          </div>

          <label className="vaCheckRow">
            <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} />
            <span>They said they have paid, but it has not landed yet</span>
          </label>

          <button
            type="button"
            className="vaBtn vaBtnSolid vaBtnSm"
            style={{ width: '100%' }}
            disabled={busy === 'pay'}
            onClick={async () => {
              const cents = parseCents(amount);
              if (cents <= 0) {
                setError('Enter an amount.');
                return;
              }
              const ok = await patch(
                { payment: { amountCents: cents, method, reference, pending } },
                'pay',
              );
              if (ok) setReference('');
            }}
          >
            {busy === 'pay' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Check size={14} aria-hidden />}
            Record it
          </button>
        </div>
      )}

      <div className="vaPanel">
        <div className="vaStudioActions">
          {status !== 'void' && status !== 'draft' && (
            <button
              type="button"
              className="vaBtn vaBtnGhost vaBtnSm"
              disabled={busy === 'void'}
              onClick={() => {
                if (!window.confirm('Void this invoice? It stays on the record but is no longer owed.')) return;
                void patch({ void: true }, 'void');
              }}
            >
              <Ban size={13} aria-hidden /> Void it
            </button>
          )}
          {status === 'draft' && (
            <button
              type="button"
              className="vaBtn vaBtnGhost vaBtnSm"
              style={{ color: '#ff9c7e' }}
              disabled={busy === 'delete'}
              onClick={async () => {
                if (!window.confirm('Delete this draft?')) return;
                setBusy('delete');
                await fetch(`/api/voice/invoices/${id}`, { method: 'DELETE' });
                router.push(`${BASE_PATH}/studio/invoices`);
              }}
            >
              <Trash2 size={13} aria-hidden /> Delete draft
            </button>
          )}
        </div>
      </div>
    </>
  );
}
