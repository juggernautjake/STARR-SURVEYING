'use client';
// app/admin/payments/inbox/UnreconciledClaims.tsx — the claims nobody matched to money (C1-2).
//
// The inbox above this shows claims WAITING on the office. This shows the ones that have been waiting too
// long, which is a different question and the one nobody was asking: a pledge sits in the queue looking
// exactly the same on day one and day forty.
//
// ── IT SITS ON THE PAGE THE OFFICE ALREADY OPENS ───────────────────────────────────────────────────
//
// A report on its own route is a report nobody opens. This is the same screen, below the queue it is
// about, and it is silent when there is nothing to say — so it costs no attention on the days it has no
// news, which is most days.
import { useEffect, useState } from 'react';

interface Claim {
  id: string;
  method: string;
  reason: 'no_payment' | 'amount_mismatch';
  ageDays: number;
  claimedCents: number;
  paidCents: number;
  payerEmail: string | null;
  invoice: { id: string; invoice_number: string; customer_name: string | null; total_cents: number } | null;
  note: string;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function UnreconciledClaims(): React.ReactElement | null {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/admin/payment-attempts/unreconciled')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) setClaims(j.claims ?? []); })
      // A failure is SHOWN, not swallowed. A reconciliation report that quietly renders nothing when its
      // request fails is indistinguishable from one saying everything is fine — which is the worst thing
      // a control like this can do, because its whole value is being trusted when it is silent.
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) {
    return (
      <section className="inbox-page__section" data-testid="unreconciled-error">
        <h2 className="inbox-page__section-title">Older claims</h2>
        <p role="alert">
          Could not load the unreconciled-claims check. This panel is not saying there is nothing to
          reconcile — it is saying it could not look.
        </p>
      </section>
    );
  }

  // Silent when there is nothing to say. An empty state here would be one more thing to read past on
  // every visit, and this panel's value is that its presence means something.
  if (!claims || claims.length === 0) return null;

  return (
    <section className="inbox-page__section" data-testid="unreconciled-claims">
      <h2 className="inbox-page__section-title">
        Older claims worth checking against the bank ({claims.length})
      </h2>
      <p className="inbox-page__lede">
        These customers said they sent money and nothing matching has been recorded since. Most will be
        payments the bank has not been reconciled for yet — this is a list to check, not a list to chase.
      </p>
      <ul className="inbox-page__list">
        {claims.map((c) => (
          <li key={c.id} className="inbox-page__item" data-testid="unreconciled-claim">
            <div>
              <strong>
                {c.invoice ? `${c.invoice.invoice_number} — ${c.invoice.customer_name ?? 'Customer'}` : 'Unknown invoice'}
              </strong>{' '}
              <span>{c.note}</span>
            </div>
            <div>
              {c.reason === 'amount_mismatch'
                ? `Claimed ${dollars(c.claimedCents)}, recorded ${dollars(c.paidCents)}`
                : `Claimed ${dollars(c.claimedCents)}`}
              {c.payerEmail ? ` · ${c.payerEmail}` : ''}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
