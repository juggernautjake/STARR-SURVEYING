// app/admin/components/payroll/PayrollRunPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCurrency, formatDate, PAYROLL_STATUSES } from './PayrollConstants';
import { withAlpha } from '@/lib/admin/color-alpha';

interface PayrollRun {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  run_date: string;
  status: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
  processed_by: string;
  notes: string;
}

interface PayStub {
  id: string;
  user_email: string;
  user_name: string;
  regular_hours: number;
  overtime_hours: number;
  effective_rate: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  disbursement_status: string;
}

export default function PayrollRunPanel() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [stubs, setStubs] = useState<PayStub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  async function loadRuns() {
    try {
      const res = await fetch('/api/admin/payroll/runs');
      const data = await res.json();
      setRuns(data.runs || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function selectRun(run: PayrollRun) {
    setSelectedRun(run);
    try {
      const res = await fetch(`/api/admin/payroll/runs?id=${run.id}`);
      const data = await res.json();
      setStubs(data.stubs || []);
    } catch { /* ignore */ }
  }

  async function updateRunStatus(id: string, status: string) {
    if (status === 'completed' && !confirm('Complete this payroll run? This will credit employee balances.')) return;
    if (status === 'cancelled' && !confirm('Cancel this payroll run?')) return;

    try {
      const res = await fetch('/api/admin/payroll/runs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });

      // ── A REFUSAL HAS TO REACH THE PERSON WHO PRESSED THE BUTTON ────────────────────────────
      //
      // This used to discard the response entirely, so the route's 409 — "this run has no pay
      // stubs, completing it would credit nobody" — arrived as nothing at all: the list reloaded,
      // the badge still said Draft, and the only reading available was "the button is broken".
      // Saying why is the whole point of refusing.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `That could not be done (${res.status}).`);
        return;
      }
      setError(null);
      loadRuns();
      if (selectedRun?.id === id) {
        setSelectedRun(prev => prev ? { ...prev, status } : null);
      }
    } catch {
      setError('That could not be done — the request did not reach the server.');
    }
  }

  if (loading) return <div className="payroll-loading">Loading payroll runs...</div>;

  return (
    <div className="payroll-runs">
      <div className="payroll-runs__header">
        <h3 className="payroll-runs__title">Payroll Runs (history)</h3>
        <Link className="payroll-btn payroll-btn--primary" href="/admin/payouts">
          Prepare a payout
        </Link>
      </div>

      {/* ── THE BUTTON THAT USED TO BE HERE MADE A PAYROLL RUN (S9c, 2026-08-18) ─────────────────
          Pay is now prepared as a payout batch, and `POST /api/admin/payroll/runs` answers 410.
          Leaving "New Payroll Run" on screen would have been a button whose only possible outcome
          is an error dialog — which is worse than removing it, because somebody with wages to pay
          would press it, read a refusal, and have nowhere to go. So the button is replaced by the
          one that does the job, and this panel says plainly what it is now for. */}
      <p className="payroll-runs__form-note">
        These are the pay periods run by the retired payroll engine, kept because they record
        payments that were actually made. Pay is now prepared as a payout batch on{' '}
        <Link href="/admin/payouts">Payouts</Link> — that is the path with dispatch methods, an
        approval, ACH export, void and employee-visible history.
      </p>

      {error && (
        <div className="payroll-runs__error" role="alert">{error}</div>
      )}

      {/* Runs List */}
      <div className="payroll-runs__list">
        {runs.length === 0 ? (
          <div className="payroll-runs__empty">
            No payroll runs. Nothing was ever paid through this engine — see Payouts for what has.
          </div>
        ) : (
          runs.map(run => {
            const statusInfo = PAYROLL_STATUSES[run.status] || { label: run.status, color: '#6B7280' };
            const isSelected = selectedRun?.id === run.id;

            return (
              <div key={run.id} className={`payroll-runs__item ${isSelected ? 'payroll-runs__item--selected' : ''}`}>
                <div className="payroll-runs__item-header" onClick={() => selectRun(run)}>
                  <div className="payroll-runs__item-period">
                    {formatDate(run.pay_period_start)} — {formatDate(run.pay_period_end)}
                  </div>
                  <span className="payroll-badge" style={{ backgroundColor: withAlpha(statusInfo.color, 12.55), color: statusInfo.color }}>
                    {statusInfo.label}
                  </span>
                </div>

                <div className="payroll-runs__item-stats">
                  <span>{run.employee_count} employees</span>
                  <span>Gross: {formatCurrency(run.total_gross)}</span>
                  <span>Net: <strong>{formatCurrency(run.total_net)}</strong></span>
                </div>

                {run.status === 'draft' && (
                  <div className="payroll-runs__item-actions">
                    <button className="payroll-btn payroll-btn--sm payroll-btn--primary" onClick={() => updateRunStatus(run.id, 'completed')}>
                      Complete & Credit Balances
                    </button>
                    <button className="payroll-btn payroll-btn--sm payroll-btn--danger" onClick={() => updateRunStatus(run.id, 'cancelled')}>
                      Cancel
                    </button>
                  </div>
                )}

                {/* Stubs for selected run */}
                {isSelected && stubs.length > 0 && (
                  <div className="payroll-runs__stubs">
                    <h4>Employee Breakdown</h4>
                    <div className="admin-table-wrap"><table className="payroll-runs__stubs-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Hours</th>
                          <th>Rate</th>
                          <th>Gross</th>
                          <th>Deductions</th>
                          <th>Net</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stubs.map(stub => (
                          <tr key={stub.id}>
                            <td>{stub.user_name || stub.user_email.split('@')[0]}</td>
                            <td>{stub.regular_hours + stub.overtime_hours}h {stub.overtime_hours > 0 ? `(${stub.overtime_hours}h OT)` : ''}</td>
                            <td>{formatCurrency(stub.effective_rate)}/hr</td>
                            <td>{formatCurrency(stub.gross_pay)}</td>
                            <td>-{formatCurrency(stub.total_deductions)}</td>
                            <td><strong>{formatCurrency(stub.net_pay)}</strong></td>
                            <td>
                              <span className={`payroll-badge payroll-badge--${stub.disbursement_status}`}>
                                {stub.disbursement_status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td><strong>Totals</strong></td>
                          <td><strong>{stubs.reduce((s, st) => s + st.regular_hours + st.overtime_hours, 0)}h</strong></td>
                          <td></td>
                          <td><strong>{formatCurrency(stubs.reduce((s, st) => s + st.gross_pay, 0))}</strong></td>
                          <td><strong>-{formatCurrency(stubs.reduce((s, st) => s + st.total_deductions, 0))}</strong></td>
                          <td><strong>{formatCurrency(stubs.reduce((s, st) => s + st.net_pay, 0))}</strong></td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table></div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
