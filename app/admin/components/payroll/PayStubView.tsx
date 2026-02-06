// app/admin/components/payroll/PayStubView.tsx
'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatDate, PAYROLL_STATUSES } from './PayrollConstants';

interface PayStub {
  id: string;
  payroll_run_id: string;
  user_email: string;
  user_name: string;
  pay_period_start: string;
  pay_period_end: string;
  regular_hours: number;
  overtime_hours: number;
  base_rate: number;
  overtime_rate: number;
  role_adjustment: number;
  cert_adjustment: number;
  effective_rate: number;
  gross_pay: number;
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  disbursement_status: string;
  job_hours: Array<{ job_id: string; hours: number; role: string }>;
  created_at: string;
}

interface PayStubViewProps {
  email: string;
  limit?: number;
}

export default function PayStubView({ email, limit = 10 }: PayStubViewProps) {
  const [stubs, setStubs] = useState<PayStub[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStub, setExpandedStub] = useState<string | null>(null);

  useEffect(() => {
    loadStubs();
  }, [email]);

  async function loadStubs() {
    try {
      const res = await fetch(`/api/admin/payroll/runs?limit=${limit}`);
      const data = await res.json();
      setStubs(data.stubs || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  if (loading) return <div className="payroll-loading">Loading pay stubs...</div>;

  return (
    <div className="payroll-stubs">
      <h3 className="payroll-stubs__title">Pay Stubs</h3>

      {stubs.length === 0 ? (
        <div className="payroll-stubs__empty">No pay stubs yet</div>
      ) : (
        <div className="payroll-stubs__list">
          {stubs.map(stub => {
            const isExpanded = expandedStub === stub.id;
            return (
              <div key={stub.id} className="payroll-stubs__item">
                <div
                  className="payroll-stubs__item-header"
                  onClick={() => setExpandedStub(isExpanded ? null : stub.id)}
                >
                  <div className="payroll-stubs__item-period">
                    {formatDate(stub.pay_period_start)} — {formatDate(stub.pay_period_end)}
                  </div>
                  <div className="payroll-stubs__item-summary">
                    <span className="payroll-stubs__hours">{stub.regular_hours + stub.overtime_hours}hrs</span>
                    <span className="payroll-stubs__gross">Gross: {formatCurrency(stub.gross_pay)}</span>
                    <span className="payroll-stubs__net">Net: <strong>{formatCurrency(stub.net_pay)}</strong></span>
                  </div>
                  <span className={`payroll-stubs__expand ${isExpanded ? 'payroll-stubs__expand--open' : ''}`}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>

                {isExpanded && (
                  <div className="payroll-stubs__detail">
                    <div className="payroll-stubs__detail-section">
                      <h4>Earnings</h4>
                      <table className="payroll-stubs__detail-table">
                        <tbody>
                          <tr>
                            <td>Regular Hours</td>
                            <td>{stub.regular_hours} hrs × {formatCurrency(stub.effective_rate)}</td>
                            <td>{formatCurrency(stub.regular_hours * stub.effective_rate)}</td>
                          </tr>
                          {stub.overtime_hours > 0 && (
                            <tr>
                              <td>Overtime Hours</td>
                              <td>{stub.overtime_hours} hrs × {formatCurrency(stub.overtime_rate || 0)}</td>
                              <td>{formatCurrency(stub.overtime_hours * (stub.overtime_rate || 0))}</td>
                            </tr>
                          )}
                          {stub.role_adjustment > 0 && (
                            <tr className="payroll-stubs__adj-row">
                              <td>Role Adjustment</td>
                              <td>+{formatCurrency(stub.role_adjustment)}/hr</td>
                              <td>included in rate</td>
                            </tr>
                          )}
                          {stub.cert_adjustment > 0 && (
                            <tr className="payroll-stubs__adj-row">
                              <td>Certification Bonus</td>
                              <td>+{formatCurrency(stub.cert_adjustment)}/hr</td>
                              <td>included in rate</td>
                            </tr>
                          )}
                          <tr className="payroll-stubs__total-row">
                            <td><strong>Gross Pay</strong></td>
                            <td></td>
                            <td><strong>{formatCurrency(stub.gross_pay)}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="payroll-stubs__detail-section">
                      <h4>Deductions</h4>
                      <table className="payroll-stubs__detail-table">
                        <tbody>
                          <tr><td>Federal Tax</td><td></td><td>-{formatCurrency(stub.federal_tax)}</td></tr>
                          {stub.state_tax > 0 && <tr><td>State Tax</td><td></td><td>-{formatCurrency(stub.state_tax)}</td></tr>}
                          <tr><td>Social Security (6.2%)</td><td></td><td>-{formatCurrency(stub.social_security)}</td></tr>
                          <tr><td>Medicare (1.45%)</td><td></td><td>-{formatCurrency(stub.medicare)}</td></tr>
                          {stub.other_deductions > 0 && <tr><td>Other</td><td></td><td>-{formatCurrency(stub.other_deductions)}</td></tr>}
                          <tr className="payroll-stubs__total-row">
                            <td><strong>Total Deductions</strong></td>
                            <td></td>
                            <td><strong>-{formatCurrency(stub.total_deductions)}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="payroll-stubs__detail-net">
                      <span>Net Pay</span>
                      <span className="payroll-stubs__detail-net-amount">{formatCurrency(stub.net_pay)}</span>
                    </div>

                    {stub.job_hours && Array.isArray(stub.job_hours) && stub.job_hours.length > 0 && (
                      <div className="payroll-stubs__detail-section">
                        <h4>Job Breakdown</h4>
                        <table className="payroll-stubs__detail-table">
                          <thead>
                            <tr><th>Job</th><th>Role</th><th>Hours</th></tr>
                          </thead>
                          <tbody>
                            {stub.job_hours.map((jh, i) => (
                              <tr key={i}>
                                <td>{jh.job_id.substring(0, 8)}...</td>
                                <td>{jh.role}</td>
                                <td>{Math.round(jh.hours * 100) / 100} hrs</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
