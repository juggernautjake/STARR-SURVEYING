'use client';
// app/admin/payouts/runs/[id]/cash-sheet/page.tsx — the cash handed out for a payout, signed for.
//
// Cash is the one method that cannot leave a trail by itself, so the sheet IS the trail: who, how much
// (after any fee), and their signature. Print it, hand out the envelopes, file the signed sheet, and
// mark each line paid on the payout.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import '../../../../components/payouts/Payouts.css';

interface Line { id: string; user_email: string; user_name: string | null; send_cents: number; fee_cents: number; status: string }
const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CashSheetPage() {
  const { id } = useParams<{ id: string }>();
  const [label, setLabel] = useState('');
  const [lines, setLines] = useState<Line[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/payouts/runs/${id}/commit`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Could not load the payout.'); return; }
      setLabel(json.batch_label ?? '');
      const cash = (json.groups ?? []).find((g: { method: string }) => g.method === 'cash');
      setLines(cash ? cash.lines : []);
    })();
  }, [id]);

  const total = (lines ?? []).reduce((s, l) => s + l.send_cents, 0);
  return (
    <main className="po" style={{ maxWidth: 820, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
      <div className="po-row po-row--between po-noprint">
        <Link href={`/admin/payouts/runs/${id}`} className="po-small">← Back to the payout</Link>
        <button type="button" className="po-btn po-btn--primary" onClick={() => window.print()}>Print</button>
      </div>
      <h1 style={{ fontSize: '1.4rem', margin: '0.6rem 0 0.2rem' }}>Cash payments — signature sheet</h1>
      <p className="po-muted">{label} · printed {new Date().toLocaleDateString()}</p>
      {error && <div className="po-note po-note--bad">{error}</div>}
      {lines && lines.length === 0 && <p className="po-muted">No cash payments in this payout.</p>}
      {lines && lines.length > 0 && (
        <table className="po-table po-sheet" style={{ marginTop: '0.8rem' }}>
          <thead><tr><th>Name</th><th className="n">Amount</th><th style={{ width: '40%' }}>Received by (signature)</th><th>Date</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td><b>{l.user_name ?? l.user_email}</b><div className="po-small">{l.user_email}</div></td>
                <td className="n">{money(l.send_cents)}{l.fee_cents > 0 && <div className="po-small">after {money(l.fee_cents)} cash fee</div>}</td>
                <td style={{ borderBottom: '1px solid currentColor' }} />
                <td style={{ borderBottom: '1px solid currentColor' }} />
              </tr>
            ))}
            <tr><td><b>Total cash</b></td><td className="n"><b>{money(total)}</b></td><td /><td /></tr>
          </tbody>
        </table>
      )}
      <p className="po-small" style={{ marginTop: '1.5rem' }}>Handed out by: ______________________________ &nbsp; Date: ______________</p>
    </main>
  );
}
