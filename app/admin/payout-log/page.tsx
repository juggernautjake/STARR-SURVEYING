// app/admin/payout-log/page.tsx — Payout history log (employees see own, admins see all)
'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { usePageError } from '../hooks/usePageError';

interface PayoutEntry {
  id: string;
  user_email: string;
  payout_type: string;
  amount: number;
  reason: string;
  details: string | null;
  old_rate: number | null;
  new_rate: number | null;
  old_role: string | null;
  new_role: string | null;
  processed_by: string | null;
  processed_at: string;
  status: string;
}

interface PayoutResponse {
  entries: PayoutEntry[];
  total: number;
  summary: { total_paid: number; total_deductions: number };
}

const PAYOUT_TYPES = [
  'weekly_payroll', 'pay_raise', 'bonus', 'advance', 'credential_bonus',
  'education_bonus', 'promotion_raise', 'performance_bonus', 'holiday_bonus',
  'referral_bonus', 'retention_bonus', 'spot_bonus', 'completion_bonus',
];

const TYPE_LABELS: Record<string, string> = {
  weekly_payroll: 'Weekly Payroll', pay_raise: 'Pay Raise', bonus: 'Bonus',
  advance: 'Advance', credential_bonus: 'Credential Bonus', education_bonus: 'Education Bonus',
  promotion_raise: 'Promotion Raise', performance_bonus: 'Performance Bonus',
  holiday_bonus: 'Holiday Bonus', referral_bonus: 'Referral Bonus',
  retention_bonus: 'Retention Bonus', spot_bonus: 'Spot Bonus',
  completion_bonus: 'Completion Bonus', advance_repayment: 'Advance Repayment',
  adjustment: 'Adjustment',
};

function typeIcon(t: string): string {
  if (t === 'weekly_payroll') return '\u{1F4B5}';
  if (t === 'pay_raise' || t === 'promotion_raise') return '\u{1F4C8}';
  if (['bonus', 'performance_bonus', 'holiday_bonus', 'spot_bonus', 'completion_bonus'].includes(t)) return '\u{1F381}';
  if (t === 'credential_bonus' || t === 'education_bonus') return '\u{1F393}';
  if (t === 'advance') return '\u{1F4B8}';
  if (t === 'advance_repayment') return '\u{1F504}';
  if (t === 'adjustment') return '\u{2699}\u{FE0F}';
  if (t === 'referral_bonus') return '\u{1F91D}';
  if (t === 'retention_bonus') return '\u{1F3C6}';
  return '\u{1F4B0}';
}

const fmtCurrency = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const PAGE_SIZE = 25;

export default function PayoutLogPage() {
  const { data: session } = useSession();
  const { safeFetch, reportPageError } = usePageError('PayoutLogPage');
  const isAdmin = session?.user?.role === 'admin';
  const email = session?.user?.email || '';

  const [entries, setEntries] = useState<PayoutEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ total_paid: 0, total_deductions: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [filterEmail, setFilterEmail] = useState('');
  const [filterType, setFilterType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Employee list for admin dropdown
  const [employees, setEmployees] = useState<{ email: string; name: string }[]>([]);

  useEffect(() => {
    if (isAdmin) {
      safeFetch<{ employees: { user_email: string; user_name: string }[] }>('/api/admin/payroll/employees')
        .then(data => {
          if (data?.employees) {
            setEmployees(data.employees.map((e: { user_email: string; user_name: string }) => ({ email: e.user_email, name: e.user_name })));
          }
        });
    }
  }, [isAdmin]);

  const buildUrl = useCallback((offset: number) => {
    const p = new URLSearchParams();
    const target = isAdmin ? filterEmail : email;
    if (target) p.set('email', target);
    if (filterType) p.set('type', filterType);
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(offset));
    return `/api/admin/payroll/payout-log?${p.toString()}`;
  }, [isAdmin, email, filterEmail, filterType, dateFrom, dateTo]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const data = await safeFetch<PayoutResponse>(buildUrl(0));
    if (data) {
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      setSummary(data.summary || { total_paid: 0, total_deductions: 0 });
    }
    setLoading(false);
  }, [buildUrl, safeFetch]);

  useEffect(() => {
    if (email) loadEntries();
  }, [email, loadEntries]);

  async function loadMore() {
    setLoadingMore(true);
    const data = await safeFetch<PayoutResponse>(buildUrl(entries.length));
    if (data?.entries) {
      setEntries(prev => [...prev, ...data.entries]);
    }
    setLoadingMore(false);
  }

  if (!session?.user) return null;

  const net = summary.total_paid - summary.total_deductions;
  const hasMore = entries.length < total;

  return (
    <div className="payroll-page">
      {/* Summary Cards */}
      <div className="payout-log__summary">
        <div className="payout-log__summary-card">
          <span className="payout-log__summary-val">{fmtCurrency(summary.total_paid)}</span>
          <span className="payout-log__summary-lbl">Total Paid</span>
        </div>
        <div className="payout-log__summary-card">
          <span className="payout-log__summary-val" style={{ color: '#EF4444' }}>{fmtCurrency(summary.total_deductions)}</span>
          <span className="payout-log__summary-lbl">Deductions</span>
        </div>
        <div className="payout-log__summary-card">
          <span className="payout-log__summary-val" style={{ color: net >= 0 ? '#059669' : '#EF4444' }}>{fmtCurrency(net)}</span>
          <span className="payout-log__summary-lbl">Net</span>
        </div>
      </div>

      {/* Filters */}
      <div className="payout-log__filters">
        {isAdmin && (
          <select className="payout-log__filter" value={filterEmail} onChange={e => setFilterEmail(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.email} value={emp.email}>{emp.name || emp.email}</option>
            ))}
          </select>
        )}
        <select className="payout-log__filter" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {PAYOUT_TYPES.map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
          ))}
        </select>
        <input className="payout-log__filter" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
        <input className="payout-log__filter" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
      </div>

      {/* Entries */}
      {loading ? (
        <div className="payout-log__empty">Loading payout history...</div>
      ) : entries.length === 0 ? (
        <div className="payout-log__empty">No payout entries found.</div>
      ) : (
        <div className="payout-log__list">
          {entries.map(entry => {
            const isPositive = entry.amount >= 0;
            return (
              <div key={entry.id} className="payout-log__item">
                <div className="payout-log__item-icon">{typeIcon(entry.payout_type)}</div>
                <div className="payout-log__item-info">
                  <div className="payout-log__item-type">{TYPE_LABELS[entry.payout_type] || entry.payout_type}</div>
                  <div className="payout-log__item-reason">{entry.reason}</div>
                  {entry.details && <div className="payout-log__item-details">{entry.details}</div>}
                  {isAdmin && entry.user_email && (
                    <div className="payout-log__item-details">{entry.user_email}</div>
                  )}
                </div>
                <div className="payout-log__item-right">
                  <div className={`payout-log__item-amount ${isPositive ? 'payout-log__item-amount--pos' : 'payout-log__item-amount--neg'}`}>
                    {isPositive ? '+' : '-'}{fmtCurrency(entry.amount)}
                  </div>
                  <div className="payout-log__item-date">{fmtDate(entry.processed_at)}</div>
                  {entry.old_rate != null && entry.new_rate != null && (
                    <div className="payout-log__item-rate">
                      ${entry.old_rate.toFixed(2)} &rarr; ${entry.new_rate.toFixed(2)}/hr
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {hasMore && !loading && (
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button
            className="payroll-btn payroll-btn--primary"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : `Load More (${entries.length} of ${total})`}
          </button>
        </div>
      )}
    </div>
  );
}
