// app/admin/hours-approval/page.tsx — Admin approval of employee time logs
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';

interface TimeLog {
  id: string;
  user_email: string;
  log_date: string;
  work_type: string;
  hours: number;
  description: string;
  notes: string | null;
  job_name: string | null;
  status: string;
  rejection_reason: string | null;
  adjustment_note: string | null;
  adjusted_hours: number | null;
  base_rate: number | null;
  role_bonus: number | null;
  seniority_bonus: number | null;
  credential_bonus: number | null;
  effective_rate: number | null;
  total_pay: number | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

interface WorkType {
  work_type: string;
  label: string;
  icon: string;
  base_rate: number;
}

interface Advance {
  id: string;
  user_email: string;
  amount: number;
  reason: string;
  status: string;
  requested_at: string;
  reviewed_by: string | null;
  denial_reason: string | null;
  pay_date: string | null;
}

interface Bonus {
  id: string;
  user_email: string;
  amount: number;
  bonus_type: string;
  reason: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  created_by: string;
}

type ApprovalTab = 'pending' | 'history' | 'advances' | 'bonuses';

const STATUS_COLORS: Record<string, string> = {
  pending: '#D97706',
  approved: '#059669',
  rejected: '#DC2626',
  disputed: '#7C3AED',
  adjusted: '#0891B2',
};

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon;
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatCurrency(n: number) {
  return '$' + n.toFixed(2);
}

export default function HoursApprovalPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction, reportPageError } = usePageError('HoursApprovalPage');
  const [tab, setTab] = useState<ApprovalTab>('pending');
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set<string>());

  // Filters
  const [filterEmail, setFilterEmail] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);

  // Reject/adjust modal
  const [actionModal, setActionModal] = useState<{ type: 'reject' | 'adjust'; logId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adjustHours, setAdjustHours] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  // Bonus form
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusForm, setBonusForm] = useState({
    user_email: '', amount: '', bonus_type: 'performance', reason: '',
    scheduled_date: new Date().toISOString().split('T')[0], scheduled_time: '09:00', notes: '',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterEmail) params.set('email', filterEmail);
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
      params.set('week_start', weekStart);

      const [logsRes, advRes, bonRes] = await Promise.all([
        fetch(`/api/admin/time-logs?${params.toString()}`),
        fetch('/api/admin/time-logs/advances'),
        fetch('/api/admin/time-logs/bonuses'),
      ]);

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
        if (data.work_types?.length) setWorkTypes(data.work_types);
      }
      if (advRes.ok) {
        const data = await advRes.json();
        setAdvances(data.advances || []);
      }
      if (bonRes.ok) {
        const data = await bonRes.json();
        setBonuses(data.bonuses || []);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [filterEmail, filterStatus, weekStart, reportPageError]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const pendingIds = logs.filter((l) => l.status === 'pending' || l.status === 'disputed').map((l) => l.id);
    setSelected(new Set<string>(pendingIds));
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    try {
      const res = await fetch('/api/admin/time-logs/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], action: 'approve' }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed');
        return;
      }
      setSelected(new Set<string>());
      await loadData();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Approve failed'));
    }
  };

  const bulkReject = async () => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    try {
      await fetch('/api/admin/time-logs/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], action: 'reject', rejection_reason: reason }),
      });
      setSelected(new Set<string>());
      await loadData();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Reject failed'));
    }
  };

  const singleAction = async (logId: string, action: 'approve' | 'reject' | 'adjust') => {
    if (action === 'approve') {
      await fetch('/api/admin/time-logs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: logId, action: 'approve' }),
      });
      await loadData();
    } else {
      setActionModal({ type: action, logId });
    }
  };

  const submitAction = async () => {
    if (!actionModal) return;
    if (actionModal.type === 'reject') {
      await fetch('/api/admin/time-logs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: actionModal.logId, action: 'reject', rejection_reason: rejectReason }),
      });
    } else {
      await fetch('/api/admin/time-logs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actionModal.logId, action: 'adjust',
          adjusted_hours: parseFloat(adjustHours),
          adjustment_note: adjustNote,
        }),
      });
    }
    setActionModal(null);
    setRejectReason('');
    setAdjustHours('');
    setAdjustNote('');
    await loadData();
  };

  // Advance actions
  const approveAdvance = async (id: string) => {
    const payDate = prompt('Pay date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!payDate) return;
    await fetch('/api/admin/time-logs/advances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'approve', pay_date: payDate }),
    });
    await loadData();
  };

  const denyAdvance = async (id: string) => {
    const reason = prompt('Reason for denial:');
    if (!reason) return;
    await fetch('/api/admin/time-logs/advances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'deny', denial_reason: reason }),
    });
    await loadData();
  };

  // Bonus actions
  const submitBonus = async () => {
    const amt = parseFloat(bonusForm.amount);
    if (!bonusForm.user_email || !amt || !bonusForm.reason || !bonusForm.scheduled_date) {
      alert('Fill in all required fields');
      return;
    }
    try {
      const res = await fetch('/api/admin/time-logs/bonuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: bonusForm.user_email,
          amount: amt,
          bonus_type: bonusForm.bonus_type,
          reason: bonusForm.reason,
          scheduled_date: bonusForm.scheduled_date,
          scheduled_time: bonusForm.scheduled_time + ':00',
          notes: bonusForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed');
        return;
      }
      setShowBonusForm(false);
      setBonusForm({ user_email: '', amount: '', bonus_type: 'performance', reason: '', scheduled_date: new Date().toISOString().split('T')[0], scheduled_time: '09:00', notes: '' });
      await loadData();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Bonus creation failed'));
    }
  };

  const cancelBonus = async (id: string) => {
    if (!confirm('Cancel this bonus?')) return;
    await fetch('/api/admin/time-logs/bonuses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'cancel' }),
    });
    await loadData();
  };

  const markBonusPaid = async (id: string) => {
    await fetch('/api/admin/time-logs/bonuses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'pay' }),
    });
    await loadData();
  };

  // Week nav
  const prevWeek = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };
  const nextWeek = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };

  const weekEndStr = (() => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  })();

  // Group logs by employee
  const byEmployee = new Map<string, TimeLog[]>();
  for (const log of logs) {
    const arr = byEmployee.get(log.user_email) || [];
    arr.push(log);
    byEmployee.set(log.user_email, arr);
  }

  const pendingCount = logs.filter((l) => l.status === 'pending' || l.status === 'disputed').length;
  const pendingAdvances = advances.filter((a) => a.status === 'pending').length;

  if (!session?.user?.email || session.user.role !== 'admin') {
    return <div className="tl-loading">Admin access required</div>;
  }

  // Admin-only page guard
  if (session?.user && session.user.role !== 'admin') return null;

  return (
    <div className="tl-page">
      {/* Week navigation */}
      <div className="tl-week-nav">
        <button className="tl-btn tl-btn--sm" onClick={prevWeek}>&#9664; Prev</button>
        <span className="tl-week-nav__label">{formatDate(weekStart)} &mdash; {formatDate(weekEndStr)}</span>
        <button className="tl-btn tl-btn--sm" onClick={nextWeek}>Next &#9654;</button>
      </div>

      {/* Summary */}
      <div className="tl-summary-cards">
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#9203;</div>
          <div className="tl-summary-card__value">{pendingCount}</div>
          <div className="tl-summary-card__label">Pending Review</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#128101;</div>
          <div className="tl-summary-card__value">{byEmployee.size}</div>
          <div className="tl-summary-card__label">Employees</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#128337;</div>
          <div className="tl-summary-card__value">{logs.reduce((s, l) => s + l.hours, 0).toFixed(1)}h</div>
          <div className="tl-summary-card__label">Total Hours</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#128176;</div>
          <div className="tl-summary-card__value">{formatCurrency(logs.reduce((s, l) => s + (l.total_pay || 0), 0))}</div>
          <div className="tl-summary-card__label">Total Pay</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#128178;</div>
          <div className="tl-summary-card__value">{pendingAdvances}</div>
          <div className="tl-summary-card__label">Advance Requests</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tl-tabs">
        <button className={`tl-tabs__btn ${tab === 'pending' ? 'tl-tabs__btn--active' : ''}`} onClick={() => { setTab('pending'); setFilterStatus('pending'); }}>
          Pending {pendingCount > 0 && <span className="tl-tabs__count">{pendingCount}</span>}
        </button>
        <button className={`tl-tabs__btn ${tab === 'history' ? 'tl-tabs__btn--active' : ''}`} onClick={() => { setTab('history'); setFilterStatus('all'); }}>
          All Entries
        </button>
        <button className={`tl-tabs__btn ${tab === 'advances' ? 'tl-tabs__btn--active' : ''}`} onClick={() => setTab('advances')}>
          Advances {pendingAdvances > 0 && <span className="tl-tabs__count">{pendingAdvances}</span>}
        </button>
        <button className={`tl-tabs__btn ${tab === 'bonuses' ? 'tl-tabs__btn--active' : ''}`} onClick={() => setTab('bonuses')}>
          Bonuses
        </button>
      </div>

      {/* Filters */}
      {(tab === 'pending' || tab === 'history') && (
        <div className="tl-filters">
          <input
            className="tl-search"
            type="text"
            placeholder="Filter by email..."
            value={filterEmail}
            onChange={(e) => setFilterEmail(e.target.value)}
          />
          {tab === 'history' && (
            <select className="tl-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="disputed">Disputed</option>
              <option value="adjusted">Adjusted</option>
            </select>
          )}
        </div>
      )}

      {loading && <div className="tl-loading">Loading...</div>}

      {/* PENDING / HISTORY TABS */}
      {!loading && (tab === 'pending' || tab === 'history') && (
        <div className="tl-approval-section">
          {/* Bulk actions */}
          {tab === 'pending' && pendingCount > 0 && (
            <div className="tl-bulk-actions">
              <button className="tl-btn tl-btn--sm" onClick={selectAll}>Select All Pending</button>
              {selected.size > 0 && (
                <>
                  <span className="tl-bulk-actions__count">{selected.size} selected</span>
                  <button className="tl-btn tl-btn--sm tl-btn--primary" onClick={bulkApprove}>Approve Selected</button>
                  <button className="tl-btn tl-btn--sm tl-btn--danger" onClick={bulkReject}>Reject Selected</button>
                </>
              )}
            </div>
          )}

          {/* Grouped by employee */}
          {[...byEmployee.entries()].map(([email, empLogs]) => {
            const empTotal = empLogs.reduce((s, l) => s + l.hours, 0);
            const empPay = empLogs.reduce((s, l) => s + (l.total_pay || 0), 0);
            return (
              <div key={email} className="tl-employee-group">
                <div className="tl-employee-group__header">
                  <div>
                    <span className="tl-employee-group__email">{email.split('@')[0]}</span>
                    <span className="tl-employee-group__domain">@{email.split('@')[1]}</span>
                  </div>
                  <div className="tl-employee-group__stats">
                    <span>{empTotal.toFixed(1)}h</span>
                    <span>{formatCurrency(empPay)}</span>
                  </div>
                </div>

                {empLogs.map((log) => {
                  const wt = workTypes.find((w) => w.work_type === log.work_type);
                  const isSelected = selected.has(log.id);
                  return (
                    <div key={log.id} className={`tl-approval-entry ${isSelected ? 'tl-approval-entry--selected' : ''}`}>
                      {(log.status === 'pending' || log.status === 'disputed') && (
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(log.id)} className="tl-approval-entry__check" />
                      )}
                      <div className="tl-approval-entry__main">
                        <div className="tl-approval-entry__top">
                          <span className="tl-approval-entry__icon">{wt?.icon || '📋'}</span>
                          <span className="tl-approval-entry__type">{wt?.label || log.work_type}</span>
                          <span className="tl-approval-entry__date">{formatDate(log.log_date)}</span>
                          <span className="tl-approval-entry__hours">{log.hours}h</span>
                          <span className="tl-badge" style={{ backgroundColor: `${STATUS_COLORS[log.status] || '#6B7280'}20`, color: STATUS_COLORS[log.status] || '#6B7280' }}>
                            {log.status}
                          </span>
                        </div>
                        <div className="tl-approval-entry__desc">{log.description}</div>
                        {log.job_name && <div className="tl-approval-entry__meta">Job: {log.job_name}</div>}
                        {log.notes && <div className="tl-approval-entry__meta">Notes: {log.notes}</div>}
                        {log.rejection_reason && <div className="tl-approval-entry__rejection">Rejection: {log.rejection_reason}</div>}
                        {log.adjustment_note && <div className="tl-approval-entry__adjustment">Adjusted to {log.adjusted_hours}h: {log.adjustment_note}</div>}

                        {/* Rate breakdown */}
                        {log.effective_rate && (
                          <div className="tl-approval-entry__rate-breakdown">
                            Base: {formatCurrency(log.base_rate || 0)} + Role: {formatCurrency(log.role_bonus || 0)} + Seniority: {formatCurrency(log.seniority_bonus || 0)} + Creds: {formatCurrency(log.credential_bonus || 0)} = <strong>{formatCurrency(log.effective_rate)}/hr</strong>
                            {log.total_pay && <> | Total: <strong>{formatCurrency(log.total_pay)}</strong></>}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {(log.status === 'pending' || log.status === 'disputed') && (
                        <div className="tl-approval-entry__actions">
                          <button className="tl-btn tl-btn--sm tl-btn--primary" onClick={() => singleAction(log.id, 'approve')}>Approve</button>
                          <button className="tl-btn tl-btn--sm" onClick={() => singleAction(log.id, 'adjust')}>Adjust</button>
                          <button className="tl-btn tl-btn--sm tl-btn--danger" onClick={() => singleAction(log.id, 'reject')}>Reject</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {logs.length === 0 && <div className="tl-empty-day"><p>No time logs for this period</p></div>}
        </div>
      )}

      {/* ADVANCES TAB */}
      {!loading && tab === 'advances' && (
        <div className="tl-advances-section">
          {advances.length === 0 ? (
            <div className="tl-empty-day"><p>No advance requests</p></div>
          ) : (
            <div className="tl-advances-list">
              {advances.map((adv) => (
                <div key={adv.id} className="tl-advance-card">
                  <div className="tl-advance-card__left">
                    <div className="tl-advance-card__employee">{adv.user_email}</div>
                    <div className="tl-advance-card__amount">{formatCurrency(adv.amount)}</div>
                    <div className="tl-advance-card__reason">{adv.reason}</div>
                    <div className="tl-advance-card__date">
                      Requested: {new Date(adv.requested_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="tl-advance-card__right">
                    <span className={`tl-badge ${adv.status === 'approved' ? 'tl-badge--approved' : adv.status === 'denied' ? 'tl-badge--rejected' : adv.status === 'paid' ? 'tl-badge--approved' : 'tl-badge--pending'}`}>
                      {adv.status}
                    </span>
                    {adv.status === 'pending' && (
                      <div className="tl-advance-card__actions">
                        <button className="tl-btn tl-btn--sm tl-btn--primary" onClick={() => approveAdvance(adv.id)}>Approve</button>
                        <button className="tl-btn tl-btn--sm tl-btn--danger" onClick={() => denyAdvance(adv.id)}>Deny</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BONUSES TAB */}
      {!loading && tab === 'bonuses' && (
        <div className="tl-bonuses-section">
          <div className="tl-advances-header">
            <h3>Scheduled Bonuses</h3>
            <button className="tl-btn tl-btn--primary" onClick={() => setShowBonusForm(!showBonusForm)}>
              {showBonusForm ? 'Cancel' : 'Schedule Bonus'}
            </button>
          </div>

          {showBonusForm && (
            <div className="tl-advance-form">
              <div className="tl-entry-card__row">
                <div className="tl-form-group">
                  <label>Employee Email *</label>
                  <input type="email" value={bonusForm.user_email} onChange={(e) => setBonusForm({ ...bonusForm, user_email: e.target.value })} placeholder="employee@starr-surveying.com" />
                </div>
                <div className="tl-form-group tl-form-group--hours">
                  <label>Amount ($) *</label>
                  <input type="number" min="1" step="0.01" value={bonusForm.amount} onChange={(e) => setBonusForm({ ...bonusForm, amount: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="tl-entry-card__row">
                <div className="tl-form-group">
                  <label>Bonus Type</label>
                  <select value={bonusForm.bonus_type} onChange={(e) => setBonusForm({ ...bonusForm, bonus_type: e.target.value })}>
                    <option value="performance">Performance</option>
                    <option value="holiday">Holiday</option>
                    <option value="referral">Referral</option>
                    <option value="retention">Retention</option>
                    <option value="spot">Spot</option>
                    <option value="completion">Job Completion</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="tl-form-group">
                  <label>Scheduled Date *</label>
                  <input type="date" value={bonusForm.scheduled_date} onChange={(e) => setBonusForm({ ...bonusForm, scheduled_date: e.target.value })} />
                </div>
                <div className="tl-form-group">
                  <label>Time</label>
                  <input type="time" value={bonusForm.scheduled_time} onChange={(e) => setBonusForm({ ...bonusForm, scheduled_time: e.target.value })} />
                </div>
              </div>
              <div className="tl-form-group">
                <label>Reason *</label>
                <textarea value={bonusForm.reason} onChange={(e) => setBonusForm({ ...bonusForm, reason: e.target.value })} placeholder="Reason for the bonus..." rows={2} />
              </div>
              <div className="tl-form-group">
                <label>Notes (optional)</label>
                <input type="text" value={bonusForm.notes} onChange={(e) => setBonusForm({ ...bonusForm, notes: e.target.value })} placeholder="Internal notes..." />
              </div>
              <button className="tl-btn tl-btn--primary" onClick={submitBonus}>Schedule Bonus</button>
            </div>
          )}

          {bonuses.length === 0 ? (
            <div className="tl-empty-day"><p>No scheduled bonuses</p></div>
          ) : (
            <div className="tl-advances-list">
              {bonuses.map((b) => (
                <div key={b.id} className="tl-advance-card">
                  <div className="tl-advance-card__left">
                    <div className="tl-advance-card__employee">{b.user_email}</div>
                    <div className="tl-advance-card__amount">{formatCurrency(b.amount)}</div>
                    <div className="tl-advance-card__reason">{b.reason}</div>
                    <div className="tl-advance-card__date">
                      Type: {b.bonus_type} | Scheduled: {b.scheduled_date} at {b.scheduled_time}
                    </div>
                    <div className="tl-advance-card__date">Created by: {b.created_by}</div>
                  </div>
                  <div className="tl-advance-card__right">
                    <span className={`tl-badge ${b.status === 'paid' ? 'tl-badge--approved' : b.status === 'cancelled' ? 'tl-badge--rejected' : 'tl-badge--pending'}`}>
                      {b.status}
                    </span>
                    {b.status === 'scheduled' && (
                      <div className="tl-advance-card__actions">
                        <button className="tl-btn tl-btn--sm tl-btn--primary" onClick={() => markBonusPaid(b.id)}>Mark Paid</button>
                        <button className="tl-btn tl-btn--sm tl-btn--danger" onClick={() => cancelBonus(b.id)}>Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div className="tl-modal-overlay" onClick={() => setActionModal(null)}>
          <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{actionModal.type === 'reject' ? 'Reject Time Entry' : 'Adjust Hours'}</h3>
            {actionModal.type === 'reject' ? (
              <div className="tl-form-group">
                <label>Reason for rejection</label>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why hours are being rejected..." rows={3} />
              </div>
            ) : (
              <>
                <div className="tl-form-group">
                  <label>Adjusted hours</label>
                  <input type="number" min="0.25" max="24" step="0.25" value={adjustHours} onChange={(e) => setAdjustHours(e.target.value)} placeholder="New hour amount" />
                </div>
                <div className="tl-form-group">
                  <label>Note (explain adjustment)</label>
                  <textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Explain the adjustment..." rows={2} />
                </div>
              </>
            )}
            <div className="tl-modal__actions">
              <button className="tl-btn" onClick={() => setActionModal(null)}>Cancel</button>
              <button className="tl-btn tl-btn--primary" onClick={submitAction}>
                {actionModal.type === 'reject' ? 'Reject' : 'Adjust'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
