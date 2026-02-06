// app/admin/components/payroll/PayRateTable.tsx
'use client';

import { useState, useEffect } from 'react';
import { JOB_TITLES, formatCurrency } from './PayrollConstants';

interface PayRate {
  id: string;
  job_title: string;
  min_rate: number;
  max_rate: number;
  default_rate: number;
  description: string;
  effective_date: string;
}

interface RoleAdjustment {
  id: string;
  base_title: string;
  role_on_job: string;
  adjustment_type: string;
  adjustment_amount: number;
  description: string;
}

interface PayRateTableProps {
  isAdmin: boolean;
}

export default function PayRateTable({ isAdmin }: PayRateTableProps) {
  const [rates, setRates] = useState<PayRate[]>([]);
  const [adjustments, setAdjustments] = useState<RoleAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const res = await fetch('/api/admin/payroll/rates?type=both');
      const data = await res.json();
      setRates(data.standards || []);
      setAdjustments(data.adjustments || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function saveRate(id: string) {
    try {
      await fetch('/api/admin/payroll/rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          table: 'pay_rate_standards',
          min_rate: parseFloat(editValues.min_rate),
          max_rate: parseFloat(editValues.max_rate),
          default_rate: parseFloat(editValues.default_rate),
        }),
      });
      setEditingRate(null);
      loadData();
    } catch { /* ignore */ }
  }

  if (loading) return <div className="payroll-loading">Loading pay rates...</div>;

  return (
    <div className="payroll-rates">
      <div className="payroll-rates__section">
        <h3 className="payroll-rates__section-title">Standard Pay Rates by Position</h3>
        <table className="payroll-rates__table">
          <thead>
            <tr>
              <th>Position</th>
              <th>Min Rate</th>
              <th>Default Rate</th>
              <th>Max Rate</th>
              <th>Range</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rates.map(rate => {
              const titleInfo = JOB_TITLES[rate.job_title] || { label: rate.job_title, icon: '👤' };
              const isEditing = editingRate === rate.id;

              return (
                <tr key={rate.id}>
                  <td>
                    <span className="payroll-rates__title-cell">
                      <span>{titleInfo.icon}</span>
                      <span>{titleInfo.label}</span>
                    </span>
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.50"
                        className="payroll-rates__input"
                        value={editValues.min_rate}
                        onChange={e => setEditValues(v => ({ ...v, min_rate: e.target.value }))}
                      />
                    ) : formatCurrency(rate.min_rate)}
                  </td>
                  <td className="payroll-rates__default-cell">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.50"
                        className="payroll-rates__input"
                        value={editValues.default_rate}
                        onChange={e => setEditValues(v => ({ ...v, default_rate: e.target.value }))}
                      />
                    ) : <strong>{formatCurrency(rate.default_rate)}/hr</strong>}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.50"
                        className="payroll-rates__input"
                        value={editValues.max_rate}
                        onChange={e => setEditValues(v => ({ ...v, max_rate: e.target.value }))}
                      />
                    ) : formatCurrency(rate.max_rate)}
                  </td>
                  <td>
                    <div className="payroll-rates__range-bar">
                      <div
                        className="payroll-rates__range-fill"
                        style={{
                          left: '0%',
                          width: `${((rate.default_rate - rate.min_rate) / (rate.max_rate - rate.min_rate)) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                  {isAdmin && (
                    <td>
                      {isEditing ? (
                        <div className="payroll-rates__actions">
                          <button className="payroll-btn payroll-btn--sm payroll-btn--primary" onClick={() => saveRate(rate.id)}>Save</button>
                          <button className="payroll-btn payroll-btn--sm" onClick={() => setEditingRate(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button
                          className="payroll-btn payroll-btn--sm"
                          onClick={() => {
                            setEditingRate(rate.id);
                            setEditValues({
                              min_rate: String(rate.min_rate),
                              max_rate: String(rate.max_rate),
                              default_rate: String(rate.default_rate),
                            });
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="payroll-rates__section">
        <h3 className="payroll-rates__section-title">Role-Based Pay Adjustments</h3>
        <p className="payroll-rates__subtitle">
          When an employee fills a higher role on a specific job, they receive an hourly rate adjustment.
        </p>
        <table className="payroll-rates__table">
          <thead>
            <tr>
              <th>Base Position</th>
              <th>Acting As</th>
              <th>Adjustment</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map(adj => {
              const baseInfo = JOB_TITLES[adj.base_title] || { label: adj.base_title, icon: '👤' };
              const roleInfo = JOB_TITLES[adj.role_on_job] || { label: adj.role_on_job, icon: '👤' };
              return (
                <tr key={adj.id}>
                  <td>{baseInfo.icon} {baseInfo.label}</td>
                  <td>{roleInfo.icon} {roleInfo.label}</td>
                  <td className="payroll-rates__adjustment-cell">
                    +{adj.adjustment_type === 'percentage'
                      ? `${adj.adjustment_amount}%`
                      : formatCurrency(adj.adjustment_amount)}/hr
                  </td>
                  <td className="payroll-rates__desc-cell">{adj.description}</td>
                </tr>
              );
            })}
            {adjustments.length === 0 && (
              <tr><td colSpan={4} className="payroll-rates__empty">No role adjustments configured</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
