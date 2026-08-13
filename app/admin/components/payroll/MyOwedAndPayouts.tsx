'use client';

// app/admin/components/payroll/MyOwedAndPayouts.tsx
//
// WHAT YOU ARE OWED, AND WHAT YOU HAVE BEEN PAID
// ══════════════════════════════════════════════
//
// H-10 of HOURS_TO_PAYOUT_2026-08-05. The employee's side of the same question the approval queue
// answers for the boss, read from the same endpoints so the two cannot disagree.
//
// ── WHY THIS IS NOT `profile.available_balance` ─────────────────────────────────────────────────
//
// My Pay already showed an "Available Balance" from `employee_profiles.available_balance`. That
// field is written by ONE path: completing a `payroll_runs` run, which credits it and writes a
// `balance_transactions` row. Pay now flows through payout batches, which never touch it.
//
// So somebody with forty approved, unpaid hours saw **$0.00** — a number that reads as "you are
// paid up" and means "nothing has been through the old engine". That is the defect this codebase
// keeps finding, on the screen where it costs the most trust.
//
// The two numbers are kept apart rather than merged, because they answer different questions:
//
//   Owed              — approved hours minus committed payouts. What the firm owes you.
//   Available balance — the withdrawal account: money credited to you that you have not drawn out.
//
// A person can be owed $400 and have $0 available, and both are true.

import { useCallback, useEffect, useState } from 'react';
import { formatCurrency } from './PayrollConstants';
import { disbursedCents } from '@/lib/payroll/disbursement';
import { summarisePayment } from '@/lib/payroll/payment-statement';

interface OwedSummary {
  owedCents: number;
  settledCents: number;
  inFlightCents: number;
  undecidedHours: number;
  lastPayoutAt: string | null;
  statement: string;
}

interface PayoutRow {
  id: string;
  amount_cents: number;
  /** Of the amount, how much was held back to repay a pay advance. Absent means none. */
  recovered_cents?: number | null;
  method_label: string;
  reference: string | null;
  status: string | null;
  paid_at: string | null;
  batch_label: string | null;
  batch_status: string | null;
}

const money = (cents: number) => formatCurrency(cents / 100);

export default function MyOwedAndPayouts({ email }: { email: string }) {
  const [owed, setOwed] = useState<OwedSummary | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [owedRes, payoutRes] = await Promise.all([
        fetch(`/api/admin/payroll/owed?email=${encodeURIComponent(email)}`),
        fetch(`/api/admin/payouts/search?email=${encodeURIComponent(email)}`),
      ]);

      if (owedRes.ok) {
        const body = await owedRes.json();
        // The endpoint returns a list even for one person; an empty list means no approved hours,
        // which is a real state and not an error.
        setOwed(body.owed?.[0] ?? null);
      } else {
        const body = await owedRes.json().catch(() => ({}));
        // Named rather than shown as zero. "We could not work out your balance" and "you are owed
        // nothing" must never look the same on somebody's pay screen.
        setError(body.error || 'Your balance could not be worked out.');
      }

      if (payoutRes.ok) setPayouts((await payoutRes.json()).payouts ?? []);
    } catch {
      setError('Your balance could not be worked out.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="payroll-loading">Loading what you are owed…</div>;

  return (
    <div className="payroll-owed-section">
      <h3>What you are owed</h3>

      {error && <div className="tl-pay-error">{error}</div>}

      {!error && (
        <div className="payroll-owed-card">
          <div className="payroll-owed-card__amount">
            {owed ? money(Math.max(0, owed.owedCents)) : formatCurrency(0)}
          </div>
          <p className="payroll-owed-card__statement">
            {owed
              ? owed.statement
              : 'No approved hours yet. Hours appear here once your manager has approved them.'}
          </p>
          {owed && owed.undecidedHours > 0 && (
            <p className="payroll-owed-card__note">
              {owed.undecidedHours}h of your approved hours have no rate set yet, so no amount is
              attached to them. Your manager decides what those are worth.
            </p>
          )}
        </div>
      )}

      <h3>Your payouts</h3>
      {payouts.length === 0 ? (
        <p className="payroll-owed-empty">No payouts recorded yet.</p>
      ) : (
        <ul className="payroll-owed-list">
          {payouts.map((p) => (
            <li key={p.id} className="payroll-owed-list__row">
              {/* The DISBURSED figure — what actually reached them. `amount_cents` is what the
                  payment settles, which is larger whenever an advance was repaid out of it, and
                  showing the larger number beside a smaller bank deposit is the discrepancy
                  somebody queries. See lib/payroll/disbursement.ts. */}
              <span className="payroll-owed-list__amount">
                {money(disbursedCents({ total_cents: p.amount_cents, recovered_cents: p.recovered_cents }))}
              </span>
              <span className="payroll-owed-list__method">
                {p.method_label}
                {p.reference ? ` · ${p.reference}` : ''}
              </span>
              <span className="payroll-owed-list__when">
                {/* A payout with no date has not gone out. Rendering today's date, or nothing,
                    would both read as though it had. */}
                {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : 'not sent yet'}
              </span>
              {p.batch_status === 'voided' && (
                <span className="payroll-owed-list__voided">cancelled — this money was not sent</span>
              )}
              {p.status === 'failed' && (
                <span className="payroll-owed-list__voided">failed — you are still owed this</span>
              )}
              {/* Why this payment is smaller than the hours behind it. Rendered only when something
                  was actually withheld — a note on every ordinary payout is one people stop
                  reading. An unexplained smaller number is the thing that starts an argument. */}
              {(p.recovered_cents ?? 0) > 0 && (
                <span className="payroll-owed-list__method">
                  {summarisePayment({
                    total_cents: p.amount_cents,
                    recovered_cents: p.recovered_cents,
                    status: p.status,
                    paid_at: p.paid_at,
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
