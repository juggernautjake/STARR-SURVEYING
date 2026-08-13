// app/admin/payouts/withdrawals/page.tsx — the queue that was missing.
//
// Owner, 2026-08-12: *"they can see the money that they have earned and withdraw it to their private
// accounts."*
//
// The withdrawal API has had `approve`, `reject` and `process` since it was written, and nothing in
// the entire application called any of them. An employee could ask for their wages and there was no
// screen anywhere that showed anybody they had asked — the same shape of defect as an unwatched
// hours queue, but about money already earned.
//
// ── THE THREE STATES, AND WHY THEY ARE THREE ─────────────────────────────────────────────────────
//
// `approved` and `sent` are deliberately separate steps rather than one button. Approving says the
// firm agrees it is owed; sending says the transfer has actually gone. Collapsing them would mean
// the balance drops the moment somebody nods at it, and an employee whose rent depends on the
// difference between "agreed" and "arrived" is exactly who this screen is for.
'use client';

import { useCallback, useEffect, useState } from 'react';

interface WithdrawalRow {
  id: string;
  user_email: string;
  amount: number;
  destination: string | null;
  bank_name: string | null;
  bank_account_last4: string | null;
  status: string;
  requested_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  processed_at: string | null;
  notes: string | null;
}

/** Requests still waiting on somebody. Everything else is history. */
const OPEN = new Set(['pending', 'approved', 'processing']);

const money = (n: number) => `$${Number(n ?? 0).toFixed(2)}`;

const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting for a decision',
  approved: 'Approved — not sent yet',
  processing: 'Being sent',
  completed: 'Sent',
  rejected: 'Declined',
  cancelled: 'Cancelled by the employee',
};

export default function WithdrawalQueuePage() {
  const [rows, setRows] = useState<WithdrawalRow[] | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  /** Per-employee: the balance does not match its own ledger. Keyed by email, absent when healthy. */
  const [integrity, setIntegrity] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/payroll/balance?type=queue');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          res.status === 403
            // Names the role, because "access denied" leaves somebody guessing which of their
            // permissions is missing and who can grant it.
            ? 'You need the Finance role (or admin) to review withdrawals.'
            : json.error || `The queue could not be loaded (HTTP ${res.status}).`,
        );
      }
      setRows((json.withdrawals ?? []) as WithdrawalRow[]);
      setBalances((json.balances ?? {}) as Record<string, number>);
      setIntegrity((json.integrity ?? {}) as Record<string, string>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (row: WithdrawalRow, action: 'approve' | 'reject' | 'process') => {
    setError(null);
    setNotice(null);

    let reason: string | undefined;
    if (action === 'reject') {
      // Asked for here as well as enforced server-side. The employee is told the reason, and a
      // refusal about wages with nothing attached leaves them with nowhere to go.
      const answer = window.prompt(`Why is ${row.user_email}’s ${money(row.amount)} withdrawal being declined?\n\nThey are told this.`);
      if (answer === null) return;
      if (!answer.trim()) { setError('A reason is required to decline a withdrawal.'); return; }
      reason = answer.trim();
    }
    if (action === 'process' && !window.confirm(
      `Confirm ${money(row.amount)} has actually been sent to ${row.user_email}.\n\n`
      + 'This takes it off their balance and tells them it has gone. Only do this once the transfer is really made.',
    )) return;

    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/payroll/balance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action, rejection_reason: reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `That did not work (HTTP ${res.status}).`);
      setNotice(
        action === 'approve' ? 'Approved. The employee has been told it is agreed but not yet sent.'
          : action === 'reject' ? 'Declined, with your reason sent to the employee.'
            : 'Marked as sent and taken off their balance.',
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (error && !rows) {
    return <main className="admin-page" style={{ padding: '1.25rem' }}><p className="admin-error">{error}</p></main>;
  }
  if (!rows) {
    return <main className="admin-page" style={{ padding: '1.25rem' }}><p>Loading withdrawals…</p></main>;
  }

  const open = rows.filter((r) => OPEN.has(r.status));
  const settled = rows.filter((r) => !OPEN.has(r.status));

  const card = (row: WithdrawalRow) => {
    const balance = balances[row.user_email];
    // The figure an approver needs and would otherwise open a second screen per person to find.
    const covered = balance === undefined ? null : balance >= Number(row.amount);
    return (
      <div
        key={row.id}
        style={{
          border: '1px solid var(--color-border)', borderRadius: 8,
          padding: '0.8rem 0.9rem', marginBottom: '0.6rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '1.05rem' }}>{money(row.amount)}</strong>
          <span>{row.user_email}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            {STATUS_LABEL[row.status] ?? row.status}
            {row.requested_at ? ` · asked ${new Date(row.requested_at).toLocaleDateString()}` : ''}
          </span>
        </div>

        <p style={{ margin: '0.35rem 0 0', fontSize: '0.83rem', color: 'var(--color-text-secondary)' }}>
          {/* Last four only, never the full number — this screen does not need it and should not
              carry it. */}
          {row.destination === 'bank_account' && row.bank_account_last4
            ? `To ${row.bank_name ?? 'their bank'} ····${row.bank_account_last4}`
            : `To ${(row.destination ?? 'their account').replace(/_/g, ' ')}`}
          {covered === false && ' · their balance no longer covers this'}
          {covered === true && balance !== undefined && ` · balance ${money(balance)}`}
        </p>
        {/* The balance does not add up to its own recorded movements. Shown at the moment somebody
            is about to send money against it, which is the last useful point to find out. */}
        {integrity[row.user_email] && (
          <p
            style={{
              margin: '0.4rem 0 0', padding: '0.5rem 0.6rem', borderRadius: 6, fontSize: '0.82rem',
              border: '1px solid var(--theme-warning, #f59e0b)',
              background: 'color-mix(in srgb, var(--theme-warning, #f59e0b) 13%, transparent)',
              fontWeight: 600,
            }}
            role="alert"
          >
            {integrity[row.user_email]}
          </p>
        )}
        {row.notes && <p style={{ margin: '0.3rem 0 0', fontSize: '0.83rem' }}>“{row.notes}”</p>}
        {row.rejection_reason && (
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.83rem' }}>Declined: {row.rejection_reason}</p>
        )}
        {row.reviewed_by && (
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            Reviewed by {row.reviewed_by}
          </p>
        )}

        {OPEN.has(row.status) && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
            {row.status === 'pending' && (
              <>
                <button
                  type="button"
                  onClick={() => void act(row, 'approve')}
                  disabled={busyId === row.id || covered === false}
                  title={covered === false ? 'Their balance no longer covers this amount' : undefined}
                  style={btn(true)}
                >
                  Approve
                </button>
                <button type="button" onClick={() => void act(row, 'reject')} disabled={busyId === row.id} style={btn(false)}>
                  Decline
                </button>
              </>
            )}
            {(row.status === 'approved' || row.status === 'processing') && (
              <>
                {/* Separate from approval on purpose — see the header. */}
                <button type="button" onClick={() => void act(row, 'process')} disabled={busyId === row.id} style={btn(true)}>
                  Mark as sent
                </button>
                <button type="button" onClick={() => void act(row, 'reject')} disabled={busyId === row.id} style={btn(false)}>
                  Decline after all
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="admin-page" style={{ padding: '1.25rem', maxWidth: 860 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.35rem' }}>Withdrawal requests</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Money employees have asked to take out of the balance they have earned. Approving agrees it
        is owed; “mark as sent” records that the transfer has actually gone and takes it off their
        balance. They are told at every step.
      </p>

      {notice && <p style={{ fontSize: '0.85rem', marginBottom: '0.8rem' }}>{notice}</p>}
      {error && <p className="admin-error" style={{ marginBottom: '0.8rem' }}>{error}</p>}

      <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
        Waiting {open.length > 0 && `(${open.length})`}
      </h2>
      {open.length === 0
        ? <p style={{ fontSize: '0.88rem', marginBottom: '1.2rem' }}>Nothing is waiting for a decision.</p>
        : open.map(card)}

      {settled.length > 0 && (
        <>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '1.2rem 0 0.5rem' }}>Already decided</h2>
          {settled.map(card)}
        </>
      )}
    </main>
  );
}

const btn = (primary: boolean): React.CSSProperties => ({
  padding: '0.4rem 0.8rem', borderRadius: 6,
  border: primary ? 'none' : '1px solid var(--color-border)',
  background: primary ? 'var(--gradient-green, linear-gradient(180deg, #10b981, #059669))' : 'var(--color-surface)',
  color: primary ? '#fff' : 'var(--color-text)',
  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
});
