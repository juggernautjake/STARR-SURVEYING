'use client';
// app/AndrewAsh/studio/invoices/[id]/SettleButtons.tsx — resolving a payment the client declared.
//
// A client pressed "I've sent it" on the invoice page. That wrote a PENDING row and moved no money.
// This is where the claim becomes a fact, or does not.
//
// Two buttons rather than one, because the honest outcomes are two: the money landed, or it did not
// and the row should stop cluttering the ledger. A single "confirm" leaves every mistaken or
// abandoned claim sitting on the invoice forever, and the way people deal with that is to confirm
// them — which is precisely the habit the pending state exists to prevent.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';

export default function SettleButtons({ invoiceId, paymentId }: { invoiceId: string; paymentId: string }): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function settle(settleAs: 'confirm' | 'reject'): Promise<void> {
    if (settleAs === 'reject' && !window.confirm('Remove this claim? Use it when the money never turned up.')) return;
    setBusy(settleAs);
    setError(null);
    try {
      const res = await fetch(`/api/voice/invoices/${encodeURIComponent(invoiceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlePaymentId: paymentId, settleAs }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'That did not go through.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setBusy(null);
    }
  }

  return (
    // nowrap: the two buttons are one control. Allowed to wrap, the bare × drops onto its own line
    // under "It arrived" and reads as an unlabelled third action rather than its counterpart.
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
      <button type="button" className="vaBtn vaBtnSolid vaBtnSm" disabled={busy !== null} onClick={() => void settle('confirm')}>
        {busy === 'confirm' ? <Loader2 size={12} aria-hidden className="vaSpin" /> : <Check size={12} aria-hidden />}
        It arrived
      </button>
      <button
        type="button"
        className="vaBtn vaBtnGhost vaBtnSm"
        disabled={busy !== null}
        onClick={() => void settle('reject')}
        aria-label="Remove this claim"
      >
        {busy === 'reject' ? <Loader2 size={12} aria-hidden className="vaSpin" /> : <X size={12} aria-hidden />}
      </button>
      {error && <span className="vaError" role="alert" style={{ fontSize: '0.75rem' }}>{error}</span>}
    </span>
  );
}
