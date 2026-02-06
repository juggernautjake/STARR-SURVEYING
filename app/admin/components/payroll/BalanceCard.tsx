// app/admin/components/payroll/BalanceCard.tsx
'use client';

import { useState, useEffect } from 'react';
import { TRANSACTION_TYPES, WITHDRAWAL_STATUSES, formatCurrency, formatDateTime } from './PayrollConstants';

interface BalanceSummary {
  balance: number;
  total_earned: number;
  total_withdrawn: number;
  pending_withdrawals: number;
  available_for_withdrawal: number;
  bank_linked: boolean;
  bank_name: string;
  bank_account_last4: string;
  bank_verified: boolean;
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string;
  status: string;
  created_at: string;
}

interface Withdrawal {
  id: string;
  amount: number;
  destination: string;
  status: string;
  requested_at: string;
  reviewed_by: string | null;
  processed_at: string | null;
  rejection_reason: string | null;
  bank_name: string;
  bank_account_last4: string;
}

interface BalanceCardProps {
  email: string;
  isAdmin: boolean;
  isSelf: boolean;
}

export default function BalanceCard({ email, isAdmin, isSelf }: BalanceCardProps) {
  const [summary, setSummary] = useState<BalanceSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'withdrawals'>('overview');
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => {
    loadData();
  }, [email]);

  async function loadData() {
    try {
      const [summaryRes, txRes, wdRes] = await Promise.all([
        fetch(`/api/admin/payroll/balance?email=${email}&type=summary`),
        fetch(`/api/admin/payroll/balance?email=${email}&type=transactions&limit=20`),
        fetch(`/api/admin/payroll/balance?email=${email}&type=withdrawals&limit=20`),
      ]);
      const summaryData = await summaryRes.json();
      const txData = await txRes.json();
      const wdData = await wdRes.json();
      setSummary(summaryData);
      setTransactions(txData.transactions || []);
      setWithdrawals(wdData.withdrawals || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function requestWithdrawal(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) return;

    try {
      const res = await fetch('/api/admin/payroll/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      if (res.ok) {
        setShowWithdrawForm(false);
        setWithdrawAmount('');
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to request withdrawal');
      }
    } catch { /* ignore */ }
  }

  async function handleWithdrawalAction(id: string, action: string) {
    try {
      await fetch('/api/admin/payroll/balance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      loadData();
    } catch { /* ignore */ }
  }

  if (loading) return <div className="payroll-loading">Loading balance...</div>;
  if (!summary) return <div className="payroll-loading">No balance information available</div>;

  return (
    <div className="payroll-balance">
      {/* Balance Overview */}
      <div className="payroll-balance__overview">
        <div className="payroll-balance__main-card">
          <div className="payroll-balance__label">Available Balance</div>
          <div className="payroll-balance__amount">{formatCurrency(summary.balance)}</div>
          {summary.pending_withdrawals > 0 && (
            <div className="payroll-balance__pending">
              {formatCurrency(summary.pending_withdrawals)} pending withdrawal
            </div>
          )}
          {isSelf && (
            <div className="payroll-balance__actions">
              {summary.bank_linked ? (
                <button
                  className="payroll-btn payroll-btn--primary"
                  onClick={() => setShowWithdrawForm(!showWithdrawForm)}
                  disabled={summary.available_for_withdrawal <= 0}
                >
                  Transfer to Bank
                </button>
              ) : (
                <div className="payroll-balance__no-bank">
                  Link your bank account in your profile to enable withdrawals
                </div>
              )}
            </div>
          )}
        </div>

        <div className="payroll-balance__stats">
          <div className="payroll-balance__stat">
            <span className="payroll-balance__stat-label">Total Earned</span>
            <span className="payroll-balance__stat-value">{formatCurrency(summary.total_earned)}</span>
          </div>
          <div className="payroll-balance__stat">
            <span className="payroll-balance__stat-label">Total Withdrawn</span>
            <span className="payroll-balance__stat-value">{formatCurrency(summary.total_withdrawn)}</span>
          </div>
          <div className="payroll-balance__stat">
            <span className="payroll-balance__stat-label">Available to Transfer</span>
            <span className="payroll-balance__stat-value">{formatCurrency(summary.available_for_withdrawal)}</span>
          </div>
          {summary.bank_linked && (
            <div className="payroll-balance__stat">
              <span className="payroll-balance__stat-label">Bank Account</span>
              <span className="payroll-balance__stat-value">
                {summary.bank_name} ****{summary.bank_account_last4}
                {summary.bank_verified ? ' (Verified)' : ' (Unverified)'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Withdrawal Form */}
      {showWithdrawForm && (
        <form className="payroll-balance__withdraw-form" onSubmit={requestWithdrawal}>
          <div className="payroll-form-row">
            <div className="payroll-form-group">
              <label>Amount to Transfer</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={summary.available_for_withdrawal}
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                placeholder={`Max: ${formatCurrency(summary.available_for_withdrawal)}`}
                required
              />
            </div>
          </div>
          <div className="payroll-balance__withdraw-info">
            Transferring to {summary.bank_name} ****{summary.bank_account_last4}
          </div>
          <div className="payroll-balance__withdraw-actions">
            <button type="submit" className="payroll-btn payroll-btn--primary">Request Transfer</button>
            <button type="button" className="payroll-btn" onClick={() => setShowWithdrawForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="payroll-balance__tabs">
        <button
          className={`payroll-balance__tab ${activeTab === 'overview' ? 'payroll-balance__tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`payroll-balance__tab ${activeTab === 'transactions' ? 'payroll-balance__tab--active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
        <button
          className={`payroll-balance__tab ${activeTab === 'withdrawals' ? 'payroll-balance__tab--active' : ''}`}
          onClick={() => setActiveTab('withdrawals')}
        >
          Withdrawals
        </button>
      </div>

      {/* Transaction List */}
      {activeTab === 'transactions' && (
        <div className="payroll-balance__tx-list">
          {transactions.length === 0 ? (
            <div className="payroll-balance__empty">No transactions yet</div>
          ) : (
            transactions.map(tx => {
              const typeInfo = TRANSACTION_TYPES[tx.transaction_type] || { label: tx.transaction_type, icon: '📝', color: '#6B7280' };
              return (
                <div key={tx.id} className="payroll-balance__tx-item">
                  <div className="payroll-balance__tx-icon" style={{ color: typeInfo.color }}>{typeInfo.icon}</div>
                  <div className="payroll-balance__tx-info">
                    <div className="payroll-balance__tx-type">{typeInfo.label}</div>
                    <div className="payroll-balance__tx-desc">{tx.description}</div>
                    <div className="payroll-balance__tx-date">{formatDateTime(tx.created_at)}</div>
                  </div>
                  <div className={`payroll-balance__tx-amount ${tx.amount >= 0 ? 'payroll-balance__tx-amount--positive' : 'payroll-balance__tx-amount--negative'}`}>
                    {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Withdrawal List */}
      {activeTab === 'withdrawals' && (
        <div className="payroll-balance__wd-list">
          {withdrawals.length === 0 ? (
            <div className="payroll-balance__empty">No withdrawal requests</div>
          ) : (
            withdrawals.map(wd => {
              const statusInfo = WITHDRAWAL_STATUSES[wd.status] || { label: wd.status, color: '#6B7280' };
              return (
                <div key={wd.id} className="payroll-balance__wd-item">
                  <div className="payroll-balance__wd-info">
                    <div className="payroll-balance__wd-amount">{formatCurrency(wd.amount)}</div>
                    <div className="payroll-balance__wd-dest">
                      To: {wd.bank_name} ****{wd.bank_account_last4}
                    </div>
                    <div className="payroll-balance__wd-date">{formatDateTime(wd.requested_at)}</div>
                  </div>
                  <div className="payroll-balance__wd-status">
                    <span className="payroll-badge" style={{ backgroundColor: statusInfo.color + '20', color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                    {isAdmin && wd.status === 'pending' && (
                      <div className="payroll-balance__wd-actions">
                        <button className="payroll-btn payroll-btn--sm payroll-btn--primary" onClick={() => handleWithdrawalAction(wd.id, 'approve')}>Approve</button>
                        <button className="payroll-btn payroll-btn--sm payroll-btn--danger" onClick={() => handleWithdrawalAction(wd.id, 'reject')}>Reject</button>
                      </div>
                    )}
                    {isAdmin && wd.status === 'approved' && (
                      <button className="payroll-btn payroll-btn--sm payroll-btn--primary" onClick={() => handleWithdrawalAction(wd.id, 'process')}>Process</button>
                    )}
                    {isSelf && wd.status === 'pending' && (
                      <button className="payroll-btn payroll-btn--sm" onClick={() => handleWithdrawalAction(wd.id, 'cancel')}>Cancel</button>
                    )}
                  </div>
                  {wd.rejection_reason && (
                    <div className="payroll-balance__wd-reason">Reason: {wd.rejection_reason}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
