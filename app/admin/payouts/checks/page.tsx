'use client';
// app/admin/payouts/checks/page.tsx — the check register: every number ever used, voids included.
//
// A number is never reused. A spoiled, lost or wrong check is VOIDED here with a reason; "Void and
// reissue" gives the same payment a NEW number, ready to print from its batch.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import '../../components/payouts/Payouts.css';

interface Check {
  id: string; check_number: number; batch_id: string | null; payee_name: string; payee_email: string | null; amount_cents: number;
  issue_date: string; status: string; void_reason: string | null; reissue_of: string | null; created_at: string; issued_at: string | null;
}
const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<string, string> = { printed: 'one', issued: 'auto', cleared: 'paid', void: 'failed', stale: 'warn' };

export default function CheckRegisterPage() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/payouts/checks');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ tone: 'bad', text: json.error ?? 'Could not load checks.' }); return; }
    setChecks(json.checks);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const doVoid = async (c: Check, reissue: boolean) => {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/payouts/checks/${c.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'void', reason, reissue }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !json.ok) { setMsg({ tone: 'bad', text: json.error ?? 'Not voided.' }); return; }
    setMsg({ tone: 'good', text: json.newNumber ? `Check #${c.check_number} voided. Reissued as #${json.newNumber} — print it from the payout.` : `Check #${c.check_number} voided.${json.error ? ` ${json.error}` : ''}` });
    setVoiding(null); setReason('');
    await load();
  };

  return (
    <main className="po" style={{ maxWidth: 1000, margin: '0 auto', padding: '1.25rem 1rem 4rem' }} data-testid="check-register">
      <Link href="/admin/payouts/settings" className="po-small">← Payout settings</Link>
      <h1 style={{ margin: '0.2rem 0', fontSize: '1.5rem' }}>Check register</h1>
      <p className="po-muted">Every check number ever used. Void a spoiled or lost check here — it is never reused; reissue gives the payment a new number.</p>
      {msg && <div className={`po-note po-note--${msg.tone}`} role="status" style={{ margin: '0.6rem 0' }}>{msg.text}</div>}
      {!checks ? <p className="po-muted">Loading…</p> : checks.length === 0 ? <p className="po-muted">No checks yet. They are numbered when a payout with check payments is committed.</p> : (
        <div className="po-card po-wrap">
          <table className="po-table">
            <thead><tr><th>#</th><th>Payee</th><th className="n">Amount</th><th>Date</th><th>Status</th><th /></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.check_number}</b></td>
                  <td>{c.payee_name}<div className="po-small">{c.payee_email}</div></td>
                  <td className="n">{money(c.amount_cents)}</td>
                  <td>{c.issue_date}</td>
                  <td>
                    <span className={`po-tag po-tag--${TONE[c.status] ?? 'hand'}`}>{c.status}</span>
                    {c.void_reason && <div className="po-small">{c.void_reason}</div>}
                    {c.reissue_of && <div className="po-small">Reissue</div>}
                  </td>
                  <td>
                    {c.batch_id && <Link className="po-btn po-btn--small" href={`/admin/payouts/runs/${c.batch_id}`}>Payout</Link>}{' '}
                    {(c.status === 'printed' || c.status === 'issued' || c.status === 'stale') && (voiding === c.id ? (
                      <div className="po-stack" style={{ marginTop: '0.4rem', minWidth: 220 }}>
                        <input type="text" placeholder="Why? (spoiled, lost, wrong amount…)" value={reason} onChange={(e) => setReason(e.target.value)} />
                        <div className="po-row">
                          <button type="button" className="po-btn po-btn--small" disabled={busy || !reason.trim()} onClick={() => doVoid(c, true)}>Void and reissue</button>
                          <button type="button" className="po-btn po-btn--small po-btn--danger" disabled={busy || !reason.trim()} onClick={() => doVoid(c, false)}>Void only</button>
                          <button type="button" className="po-btn po-btn--small" onClick={() => { setVoiding(null); setReason(''); }}>Cancel</button>
                        </div>
                      </div>
                    ) : <button type="button" className="po-btn po-btn--small" onClick={() => setVoiding(c.id)}>Void…</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
