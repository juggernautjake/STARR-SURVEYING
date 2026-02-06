// app/admin/components/payroll/PayrollRunPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatDate, formatDateTime, PAYROLL_STATUSES } from './PayrollConstants';

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
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    pay_period_start: '',
    pay_period_end: '',
    notes: '',
  });

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

  async function createRun(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ pay_period_start: '', pay_period_end: '', notes: '' });
        loadRuns();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create payroll run');
      }
    } catch { /* ignore */ }
    setCreating(false);
  }

  async function updateRunStatus(id: string, status: string) {
    if (status === 'completed' && !confirm('Complete this payroll run? This will credit employee balances.')) return;
    if (status === 'cancelled' && !confirm('Cancel this payroll run?')) return;

    try {
      await fetch('/api/admin/payroll/runs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      loadRuns();
      if (selectedRun?.id === id) {
        setSelectedRun(prev => prev ? { ...prev, status } : null);
      }
    } catch { /* ignore */ }
  }

  if (loading) return <div className="payroll-loading">Loading payroll runs...</div>;

  return (
    <div className="payroll-runs">
      <div className="payroll-runs__header">
        <h3 className="payroll-runs__title">Payroll Runs</h3>
        <button className="payroll-btn payroll-btn--primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : 'New Payroll Run'}
        </button>
      </div>

      {showCreate && (
        <form className="payroll-runs__form" onSubmit={createRun}>
          <div className="payroll-form-row">
            <div className="payroll-form-group">
              <label>Pay Period Start</label>
              <input
                type="date"
                required
                value={form.pay_period_start}
                onChange={e => setForm(f => ({ ...f, pay_period_start: e.target.value }))}
              />
            </div>
            <div className="payroll-form-group">
              <label>Pay Period End</label>
              <input
                type="date"
                required
                value={form.pay_period_end}
                onChange={e => setForm(f => ({ ...f, pay_period_end: e.target.value }))}
              />
            </div>
          </div>
          <div className="payroll-form-group">
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes..."
            />
          </div>
          <button type="submit" className="payroll-btn payroll-btn--primary" disabled={creating}>
            {creating ? 'Generating...' : 'Generate Payroll'}
          </button>
          <p className="payroll-runs__form-note">
            This will auto-calculate pay for all active employees based on their time entries for this period.
          </p>
        </form>
      )}

      {/* Runs List */}
      <div className="payroll-runs__list">
        {runs.length === 0 ? (
          <div className="payroll-runs__empty">No payroll runs yet. Create one to get started.</div>
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
                  <span className="payroll-badge" style={{ backgroundColor: statusInfo.color + '20', color: statusInfo.color }}>
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
                    <table className="payroll-runs__stubs-table">
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
                    </table>
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
