// app/admin/components/payroll/RaiseHistory.tsx
'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatDate } from './PayrollConstants';

interface Raise {
  id: string;
  user_email: string;
  previous_rate: number;
  new_rate: number;
  raise_amount: number;
  raise_percentage: number;
  reason: string;
  effective_date: string;
  approved_by: string;
  next_review_date: string | null;
  notes: string;
  created_at: string;
}

interface RaiseHistoryProps {
  email: string;
  isAdmin: boolean;
  onRaiseRecorded?: () => void;
}

export default function RaiseHistory({ email, isAdmin, onRaiseRecorded }: RaiseHistoryProps) {
  const [raises, setRaises] = useState<Raise[]>([]);
  const [nextReview, setNextReview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    new_rate: '',
    reason: '',
    effective_date: new Date().toISOString().split('T')[0],
    next_review_date: '',
    notes: '',
  });

  useEffect(() => {
    loadRaises();
  }, [email]);

  async function loadRaises() {
    try {
      const res = await fetch(`/api/admin/payroll/raises?email=${email}`);
      const data = await res.json();
      setRaises(data.raises || []);
      setNextReview(data.next_review_date);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function submitRaise(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/payroll/raises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: email,
          new_rate: parseFloat(form.new_rate),
          reason: form.reason,
          effective_date: form.effective_date,
          next_review_date: form.next_review_date || null,
          notes: form.notes,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ new_rate: '', reason: '', effective_date: new Date().toISOString().split('T')[0], next_review_date: '', notes: '' });
        loadRaises();
        onRaiseRecorded?.();
      }
    } catch { /* ignore */ }
  }

  if (loading) return <div className="payroll-loading">Loading raise history...</div>;

  return (
    <div className="payroll-raises">
      <div className="payroll-raises__header">
        <h3 className="payroll-raises__title">Pay Raise History</h3>
        <div className="payroll-raises__header-right">
          {nextReview && (
            <span className="payroll-raises__next-review">
              Next Review: <strong>{formatDate(nextReview)}</strong>
            </span>
          )}
          {isAdmin && (
            <button
              className="payroll-btn payroll-btn--primary"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? 'Cancel' : 'Record Raise'}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form className="payroll-raises__form" onSubmit={submitRaise}>
          <div className="payroll-form-row">
            <div className="payroll-form-group">
              <label>New Hourly Rate ($)</label>
              <input
                type="number"
                step="0.25"
                required
                value={form.new_rate}
                onChange={e => setForm(f => ({ ...f, new_rate: e.target.value }))}
                placeholder="e.g. 25.00"
              />
            </div>
            <div className="payroll-form-group">
              <label>Effective Date</label>
              <input
                type="date"
                required
                value={form.effective_date}
                onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
              />
            </div>
            <div className="payroll-form-group">
              <label>Next Review Date</label>
              <input
                type="date"
                value={form.next_review_date}
                onChange={e => setForm(f => ({ ...f, next_review_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="payroll-form-group">
            <label>Reason</label>
            <select
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            >
              <option value="">Select reason...</option>
              <option value="annual_review">Annual Review</option>
              <option value="promotion">Promotion</option>
              <option value="certification">New Certification</option>
              <option value="performance">Performance</option>
              <option value="market_adjustment">Market Adjustment</option>
              <option value="role_change">Role Change</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="payroll-form-group">
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes about this raise..."
            />
          </div>
          <button type="submit" className="payroll-btn payroll-btn--primary">Record Raise</button>
        </form>
      )}

      {raises.length === 0 ? (
        <div className="payroll-raises__empty">No raise history recorded</div>
      ) : (
        <div className="payroll-raises__timeline">
          {raises.map((raise, i) => (
            <div key={raise.id} className="payroll-raises__item">
              <div className="payroll-raises__item-dot" />
              <div className="payroll-raises__item-content">
                <div className="payroll-raises__item-header">
                  <span className="payroll-raises__item-date">{formatDate(raise.effective_date)}</span>
                  <span className={`payroll-raises__item-change ${raise.raise_amount >= 0 ? 'payroll-raises__item-change--positive' : 'payroll-raises__item-change--negative'}`}>
                    {raise.raise_amount >= 0 ? '+' : ''}{formatCurrency(raise.raise_amount)}/hr
                    ({raise.raise_percentage >= 0 ? '+' : ''}{raise.raise_percentage}%)
                  </span>
                </div>
                <div className="payroll-raises__item-rates">
                  {formatCurrency(raise.previous_rate)}/hr → <strong>{formatCurrency(raise.new_rate)}/hr</strong>
                </div>
                {raise.reason && (
                  <div className="payroll-raises__item-reason">
                    Reason: {raise.reason.replace(/_/g, ' ')}
                  </div>
                )}
                {raise.notes && (
                  <div className="payroll-raises__item-notes">{raise.notes}</div>
                )}
                <div className="payroll-raises__item-meta">
                  Approved by {raise.approved_by.split('@')[0]}
                  {i === 0 && raise.next_review_date && ` • Next review: ${formatDate(raise.next_review_date)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
