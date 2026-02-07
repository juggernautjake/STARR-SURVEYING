// app/admin/my-hours/page.tsx — Employee daily time logging
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';

interface WorkType {
  id: string;
  work_type: string;
  label: string;
  base_rate: number;
  icon: string;
  description: string;
  is_active: boolean;
}

interface TimeEntry {
  work_type: string;
  hours: number;
  description: string;
  notes: string;
  job_id: string;
  job_name: string;
}

interface TimeLog {
  id: string;
  user_email: string;
  log_date: string;
  work_type: string;
  hours: number;
  description: string;
  notes: string | null;
  job_name: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'disputed' | 'adjusted';
  rejection_reason: string | null;
  adjustment_note: string | null;
  adjusted_hours: number | null;
  base_rate: number | null;
  role_bonus: number | null;
  seniority_bonus: number | null;
  credential_bonus: number | null;
  effective_rate: number | null;
  total_pay: number | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
}

interface Advance {
  id: string;
  amount: number;
  reason: string;
  status: string;
  requested_at: string;
  reviewed_by: string | null;
  denial_reason: string | null;
  pay_date: string | null;
}

type ViewTab = 'log' | 'history' | 'advances';

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'tl-badge--pending' },
  approved: { label: 'Approved', cls: 'tl-badge--approved' },
  rejected: { label: 'Rejected', cls: 'tl-badge--rejected' },
  disputed: { label: 'Disputed', cls: 'tl-badge--disputed' },
  adjusted: { label: 'Adjusted', cls: 'tl-badge--adjusted' },
};

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatCurrency(n: number) {
  return '$' + n.toFixed(2);
}

export default function MyHoursPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction, reportPageError } = usePageError('MyHoursPage');
  const [tab, setTab] = useState<ViewTab>('log');
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Date selection — default to today
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Entries for the selected date
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  // Week view range
  const [weekStart, setWeekStart] = useState(() => {
    const mon = getMonday(new Date());
    return mon.toISOString().split('T')[0];
  });

  // Advance form
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [logsRes, advRes] = await Promise.all([
        fetch(`/api/admin/time-logs?week_start=${weekStart}`),
        fetch('/api/admin/time-logs/advances'),
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

      // Load work types if not loaded
      if (workTypes.length === 0) {
        const ratesRes = await fetch('/api/admin/time-logs/rates?table=work_types');
        if (ratesRes.ok) {
          const data = await ratesRes.json();
          if (data.work_types?.length) setWorkTypes(data.work_types);
        }
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, [weekStart, reportPageError, workTypes.length]);

  useEffect(() => { loadData(); }, [loadData]);

  // Pre-populate entries from existing logs for the selected date
  useEffect(() => {
    const dateStr = selectedDate;
    const existing = logs.filter((l) => l.log_date === dateStr);
    if (existing.length > 0) {
      setEntries(existing.map((l) => ({
        work_type: l.work_type,
        hours: l.hours,
        description: l.description,
        notes: l.notes || '',
        job_id: '',
        job_name: l.job_name || '',
      })));
    } else {
      setEntries([]);
    }
  }, [selectedDate, logs]);

  const addEntry = () => {
    setEntries((prev) => [...prev, {
      work_type: workTypes[0]?.work_type || 'field_work',
      hours: 0,
      description: '',
      notes: '',
      job_id: '',
      job_name: '',
    }]);
  };

  const updateEntry = (idx: number, field: keyof TimeEntry, value: string | number) => {
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalHours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const existingForDate = logs.filter((l) => l.log_date === selectedDate);
  const hasExistingPending = existingForDate.some((l) => l.status === 'pending');

  const submitEntries = async () => {
    if (entries.length === 0) return;
    const valid = entries.filter((e) => e.hours > 0 && e.description.trim());
    if (valid.length === 0) {
      alert('Please fill in hours and description for at least one entry');
      return;
    }
    if (totalHours > 24) {
      alert('Total hours cannot exceed 24 for a single day');
      return;
    }

    setSubmitting(true);
    try {
      // Delete existing pending logs for this date first (re-submit)
      if (hasExistingPending) {
        for (const log of existingForDate.filter((l) => l.status === 'pending')) {
          await fetch(`/api/admin/time-logs?id=${log.id}`, { method: 'DELETE' });
        }
      }

      const res = await fetch('/api/admin/time-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: valid.map((e) => ({
            log_date: selectedDate,
            work_type: e.work_type,
            hours: Number(e.hours),
            description: e.description.trim(),
            notes: e.notes.trim() || undefined,
            job_name: e.job_name.trim() || undefined,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to submit');
        return;
      }

      await loadData();
      setTab('history');
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Submit failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitAdvance = async () => {
    const amt = parseFloat(advanceAmount);
    if (!amt || amt <= 0 || !advanceReason.trim()) {
      alert('Please enter a valid amount and reason');
      return;
    }
    try {
      const res = await fetch('/api/admin/time-logs/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, reason: advanceReason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to submit');
        return;
      }
      setShowAdvanceForm(false);
      setAdvanceAmount('');
      setAdvanceReason('');
      await loadData();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Advance request failed'));
    }
  };

  const cancelAdvance = async (id: string) => {
    if (!confirm('Cancel this advance request?')) return;
    await fetch(`/api/admin/time-logs/advances?id=${id}`, { method: 'DELETE' });
    await loadData();
  };

  const disputeLog = async (logId: string) => {
    const note = prompt('Provide a note explaining the dispute:');
    if (!note) return;
    await fetch('/api/admin/time-logs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: logId, action: 'dispute', notes: note }),
    });
    await loadData();
  };

  // Week navigation
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
  const thisWeek = () => {
    setWeekStart(getMonday(new Date()).toISOString().split('T')[0]);
  };

  // Week days
  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    weekDays.push(d.toISOString().split('T')[0]);
  }

  const weekEndStr = weekDays[6];

  // Summary stats for the week
  const weekLogs = logs.filter((l) => l.log_date >= weekStart && l.log_date <= weekEndStr);
  const weekTotalHours = weekLogs.reduce((s, l) => s + l.hours, 0);
  const weekApproved = weekLogs.filter((l) => l.status === 'approved');
  const weekPending = weekLogs.filter((l) => l.status === 'pending');
  const weekRejected = weekLogs.filter((l) => l.status === 'rejected');
  const weekEstPay = weekLogs.reduce((s, l) => s + (l.total_pay || 0), 0);

  if (!session?.user?.email) return <div className="tl-loading">Please sign in</div>;

  return (
    <div className="tl-page">
      {/* Week navigation */}
      <div className="tl-week-nav">
        <button className="tl-btn tl-btn--sm" onClick={prevWeek}>&#9664; Prev</button>
        <button className="tl-btn tl-btn--sm" onClick={thisWeek}>This Week</button>
        <span className="tl-week-nav__label">
          {formatDate(weekStart)} &mdash; {formatDate(weekEndStr)}
        </span>
        <button className="tl-btn tl-btn--sm" onClick={nextWeek}>Next &#9654;</button>
      </div>

      {/* Week summary cards */}
      <div className="tl-summary-cards">
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#128337;</div>
          <div className="tl-summary-card__value">{weekTotalHours.toFixed(1)}h</div>
          <div className="tl-summary-card__label">Total Hours</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#9989;</div>
          <div className="tl-summary-card__value">{weekApproved.length}</div>
          <div className="tl-summary-card__label">Approved</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#9203;</div>
          <div className="tl-summary-card__value">{weekPending.length}</div>
          <div className="tl-summary-card__label">Pending</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#10060;</div>
          <div className="tl-summary-card__value">{weekRejected.length}</div>
          <div className="tl-summary-card__label">Rejected</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#128176;</div>
          <div className="tl-summary-card__value">{formatCurrency(weekEstPay)}</div>
          <div className="tl-summary-card__label">Est. Pay</div>
        </div>
      </div>

      {/* Day selector strip */}
      <div className="tl-day-strip">
        {weekDays.map((day) => {
          const dayLogs = logs.filter((l) => l.log_date === day);
          const dayHrs = dayLogs.reduce((s, l) => s + l.hours, 0);
          const hasRejected = dayLogs.some((l) => l.status === 'rejected');
          const allApproved = dayLogs.length > 0 && dayLogs.every((l) => l.status === 'approved');
          const isToday = day === new Date().toISOString().split('T')[0];
          return (
            <button
              key={day}
              className={`tl-day-btn ${selectedDate === day ? 'tl-day-btn--active' : ''} ${isToday ? 'tl-day-btn--today' : ''} ${hasRejected ? 'tl-day-btn--rejected' : ''} ${allApproved ? 'tl-day-btn--approved' : ''}`}
              onClick={() => { setSelectedDate(day); setTab('log'); }}
            >
              <span className="tl-day-btn__name">{new Date(day + 'T00:00:00').toLocaleDateString([], { weekday: 'short' })}</span>
              <span className="tl-day-btn__date">{new Date(day + 'T00:00:00').getDate()}</span>
              {dayHrs > 0 && <span className="tl-day-btn__hours">{dayHrs.toFixed(1)}h</span>}
            </button>
          );
        })}
      </div>

      {/* Tab navigation */}
      <div className="tl-tabs">
        <button className={`tl-tabs__btn ${tab === 'log' ? 'tl-tabs__btn--active' : ''}`} onClick={() => setTab('log')}>
          Log Hours
        </button>
        <button className={`tl-tabs__btn ${tab === 'history' ? 'tl-tabs__btn--active' : ''}`} onClick={() => setTab('history')}>
          Week History
        </button>
        <button className={`tl-tabs__btn ${tab === 'advances' ? 'tl-tabs__btn--active' : ''}`} onClick={() => setTab('advances')}>
          Pay Advances
        </button>
      </div>

      {loading && <div className="tl-loading">Loading...</div>}

      {/* LOG TAB */}
      {!loading && tab === 'log' && (
        <div className="tl-log-section">
          <div className="tl-log-header">
            <h3>Hours for {formatDate(selectedDate)}</h3>
            {existingForDate.length > 0 && !hasExistingPending && (
              <span className="tl-log-header__note">
                {existingForDate.some((l) => l.status === 'approved') ? 'Hours approved' :
                 existingForDate.some((l) => l.status === 'rejected') ? 'Hours rejected — edit and resubmit' :
                 'Hours submitted'}
              </span>
            )}
          </div>

          {entries.length === 0 && (
            <div className="tl-empty-day">
              <div className="tl-empty-day__icon">&#128203;</div>
              <p>No hours logged for this day</p>
              <button className="tl-btn tl-btn--primary" onClick={addEntry}>Add Hours</button>
            </div>
          )}

          {entries.map((entry, idx) => {
            const wt = workTypes.find((w) => w.work_type === entry.work_type);
            return (
              <div key={idx} className="tl-entry-card">
                <div className="tl-entry-card__header">
                  <span className="tl-entry-card__num">#{idx + 1}</span>
                  <button className="tl-btn tl-btn--sm tl-btn--danger" onClick={() => removeEntry(idx)}>Remove</button>
                </div>
                <div className="tl-entry-card__body">
                  <div className="tl-entry-card__row">
                    <div className="tl-form-group">
                      <label>Work Type</label>
                      <select
                        value={entry.work_type}
                        onChange={(e) => updateEntry(idx, 'work_type', e.target.value)}
                      >
                        {workTypes.filter((w) => w.is_active).map((w) => (
                          <option key={w.work_type} value={w.work_type}>
                            {w.icon} {w.label} ({formatCurrency(w.base_rate)}/hr base)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="tl-form-group tl-form-group--hours">
                      <label>Hours</label>
                      <input
                        type="number"
                        min="0.25"
                        max="24"
                        step="0.25"
                        value={entry.hours || ''}
                        onChange={(e) => updateEntry(idx, 'hours', parseFloat(e.target.value) || 0)}
                        placeholder="0.0"
                      />
                    </div>
                  </div>
                  {wt?.description && (
                    <div className="tl-entry-card__type-desc">{wt.description}</div>
                  )}
                  <div className="tl-form-group">
                    <label>What did you do? *</label>
                    <textarea
                      value={entry.description}
                      onChange={(e) => updateEntry(idx, 'description', e.target.value)}
                      placeholder="Describe what you worked on..."
                      rows={2}
                    />
                  </div>
                  <div className="tl-entry-card__row">
                    <div className="tl-form-group">
                      <label>Job / Project (optional)</label>
                      <input
                        type="text"
                        value={entry.job_name}
                        onChange={(e) => updateEntry(idx, 'job_name', e.target.value)}
                        placeholder="e.g. Smith Boundary Survey"
                      />
                    </div>
                    <div className="tl-form-group">
                      <label>Notes (optional)</label>
                      <input
                        type="text"
                        value={entry.notes}
                        onChange={(e) => updateEntry(idx, 'notes', e.target.value)}
                        placeholder="Additional notes..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {entries.length > 0 && (
            <div className="tl-log-footer">
              <button className="tl-btn" onClick={addEntry}>+ Add Another</button>
              <div className="tl-log-footer__total">
                Total: <strong>{totalHours.toFixed(1)} hours</strong>
              </div>
              <button
                className="tl-btn tl-btn--primary"
                onClick={submitEntries}
                disabled={submitting || totalHours === 0}
              >
                {submitting ? 'Submitting...' : hasExistingPending ? 'Update & Resubmit' : 'Submit Hours'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {!loading && tab === 'history' && (
        <div className="tl-history-section">
          <h3>Week of {formatDate(weekStart)}</h3>
          {weekLogs.length === 0 ? (
            <div className="tl-empty-day">
              <p>No hours logged this week</p>
            </div>
          ) : (
            <div className="tl-history-list">
              {weekDays.map((day) => {
                const dayLogs = weekLogs.filter((l) => l.log_date === day);
                if (dayLogs.length === 0) return null;
                const dayTotal = dayLogs.reduce((s, l) => s + l.hours, 0);
                return (
                  <div key={day} className="tl-history-day">
                    <div className="tl-history-day__header">
                      <span className="tl-history-day__title">{formatDate(day)}</span>
                      <span className="tl-history-day__total">{dayTotal.toFixed(1)}h</span>
                    </div>
                    {dayLogs.map((log) => {
                      const wt = workTypes.find((w) => w.work_type === log.work_type);
                      const badge = STATUS_BADGES[log.status] || STATUS_BADGES.pending;
                      return (
                        <div key={log.id} className="tl-history-entry">
                          <div className="tl-history-entry__left">
                            <span className="tl-history-entry__icon">{wt?.icon || '📋'}</span>
                            <div>
                              <div className="tl-history-entry__type">{wt?.label || log.work_type}</div>
                              <div className="tl-history-entry__desc">{log.description}</div>
                              {log.job_name && <div className="tl-history-entry__job">Job: {log.job_name}</div>}
                              {log.rejection_reason && (
                                <div className="tl-history-entry__rejection">Reason: {log.rejection_reason}</div>
                              )}
                              {log.adjustment_note && (
                                <div className="tl-history-entry__adjustment">
                                  Adjusted: {log.adjusted_hours}h — {log.adjustment_note}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="tl-history-entry__right">
                            <span className="tl-history-entry__hours">{log.hours}h</span>
                            <span className={`tl-badge ${badge.cls}`}>{badge.label}</span>
                            {log.effective_rate && (
                              <span className="tl-history-entry__rate">{formatCurrency(log.effective_rate)}/hr</span>
                            )}
                            {log.total_pay && (
                              <span className="tl-history-entry__pay">{formatCurrency(log.total_pay)}</span>
                            )}
                            {log.status === 'rejected' && (
                              <button className="tl-btn tl-btn--sm" onClick={() => disputeLog(log.id)}>Dispute</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ADVANCES TAB */}
      {!loading && tab === 'advances' && (
        <div className="tl-advances-section">
          <div className="tl-advances-header">
            <h3>Pay Advance Requests</h3>
            <button className="tl-btn tl-btn--primary" onClick={() => setShowAdvanceForm(!showAdvanceForm)}>
              {showAdvanceForm ? 'Cancel' : 'Request Advance'}
            </button>
          </div>

          {showAdvanceForm && (
            <div className="tl-advance-form">
              <div className="tl-form-group">
                <label>Amount ($)</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="tl-form-group">
                <label>Reason (required)</label>
                <textarea
                  value={advanceReason}
                  onChange={(e) => setAdvanceReason(e.target.value)}
                  placeholder="Explain why you need an advance..."
                  rows={3}
                />
              </div>
              <button className="tl-btn tl-btn--primary" onClick={submitAdvance}>Submit Request</button>
            </div>
          )}

          {advances.length === 0 ? (
            <div className="tl-empty-day">
              <p>No advance requests</p>
            </div>
          ) : (
            <div className="tl-advances-list">
              {advances.map((adv) => (
                <div key={adv.id} className="tl-advance-card">
                  <div className="tl-advance-card__left">
                    <div className="tl-advance-card__amount">{formatCurrency(adv.amount)}</div>
                    <div className="tl-advance-card__reason">{adv.reason}</div>
                    <div className="tl-advance-card__date">
                      Requested: {new Date(adv.requested_at).toLocaleDateString()}
                    </div>
                    {adv.pay_date && <div className="tl-advance-card__pay-date">Pay date: {adv.pay_date}</div>}
                    {adv.denial_reason && <div className="tl-advance-card__denial">Denied: {adv.denial_reason}</div>}
                  </div>
                  <div className="tl-advance-card__right">
                    <span className={`tl-badge ${adv.status === 'approved' ? 'tl-badge--approved' : adv.status === 'denied' ? 'tl-badge--rejected' : adv.status === 'paid' ? 'tl-badge--approved' : 'tl-badge--pending'}`}>
                      {adv.status.charAt(0).toUpperCase() + adv.status.slice(1)}
                    </span>
                    {adv.status === 'pending' && (
                      <button className="tl-btn tl-btn--sm tl-btn--danger" onClick={() => cancelAdvance(adv.id)}>Cancel</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
