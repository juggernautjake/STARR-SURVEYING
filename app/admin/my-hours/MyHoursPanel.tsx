'use client';
// app/admin/my-hours/MyHoursPanel.tsx
//
// Extracted body of /admin/my-hours (employee daily time logging) for
// reuse in the Hub at /admin/me?tab=hours (admin-nav redesign Phase 2
// slice 2b/6).

import '../styles/AdminTimeLogs.css';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';
import { summarizeWeek } from '@/lib/payroll/week-summary';
import {
  summariseHours, totalOf, labelFor, type Grain, type SummarisableLog,
} from '@/lib/hours/summarise';

interface WorkType {
  id: string;
  work_type: string;
  label: string;
  base_rate: number;
  icon: string;
  description: string;
  is_active: boolean;
}

/** One rate as the consolidated model resolves it. Mirrors `ResolvedRate` in lib/payroll. */
interface ResolvedRate {
  rate: number | null;
  source: 'manual' | 'override' | 'activity' | 'base' | 'unset';
  explanation: string;
}

/** `/api/admin/time-logs/rates` → `menu`: every option, priced for the person asking. */
interface RateMenu {
  /** No rate at all — the hours are recorded, the money is left to whoever approves. */
  unpriced: ResolvedRate;
  base: ResolvedRate;
  activities: Array<{
    work_type: string;
    label: string;
    icon: string | null;
    base_rate: number;
    /** 'base' pays the person's own rate; 'flat' pays base_rate to everybody. */
    rate_mode: 'base' | 'flat';
    resolved: ResolvedRate;
  }>;
}

interface PayBasis {
  job_title: string | null;
  tier_label: string | null;
  base_pay: number | null;
  note: string | null;
}

/**
 * The dropdown value meaning **no rate at all**, and the default for a new row.
 *
 * *"The pay rate selection should be optional, and it shouldn't be pointing to a specific pay rate
 * by default. It should only point to a specific pay rate if the user selects one."*
 *
 * Deliberately distinct from `BASE_PAY` below. "No particular activity" still resolves to a
 * number — the person's base pay. This one resolves to nothing at all: the hours are recorded and
 * whoever approves them decides what they are worth.
 */
const NO_RATE = 'unpriced';

/** Ordinary work at the person's own base pay, with no particular activity named. */
const BASE_PAY = '';

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
  /** Set when the OFFICE entered this day rather than you (seed 585). Shown on the row, because
   *  hours you did not submit appearing on your own timesheet is indistinguishable from a day you
   *  forgot filling in — and the person most likely to spot that it is wrong is you. */
  entered_by: string | null;
  /**
   * What the approver decided, when they decided anything. Null means nobody has overridden the
   * rules, so `total_pay` above is the operative figure — the two are kept distinct rather than
   * merged, because "the rules said so" and "a person said so" are different claims.
   */
  pay_decision: {
    blocks: Array<{ hours: number; label: string; rate: number | null }>;
    total_pay: number;
    undecided_hours: number;
    payout_note: string | null;
    decided_by: string;
    decided_at: string;
  } | null;
}

interface Advance {
  /** How much has been recovered from pay so far. */
  repaid_amount?: number;
  /** Still owed. Zero unless the advance has actually been paid out. */
  outstanding?: number;
  id: string;
  amount: number;
  reason: string;
  status: string;
  requested_at: string;
  reviewed_by: string | null;
  denial_reason: string | null;
  pay_date: string | null;
}

type ViewTab = 'log' | 'history' | 'totals' | 'advances';

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

/**
 * The label for a logged activity. The two sentinels are internal — 'unpriced' means the
 * submitter attached no rate and 'unspecified' means ordinary work with no particular activity —
 * and neither should ever appear verbatim on a timesheet.
 */
function activityLabel(workType: string, label?: string | null): string {
  if (workType === 'unpriced') return 'No rate attached';
  if (workType === 'unspecified') return 'General work';
  return label || workType;
}
function formatCurrency(n: number) {
  return '$' + n.toFixed(2);
}

export default function MyHoursPanel() {
  const { data: session } = useSession();
  const { safeFetch, safeAction, reportPageError } = usePageError('MyHoursPage');
  const [tab, setTab] = useState<ViewTab>('log');
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [rateMenu, setRateMenu] = useState<RateMenu | null>(null);
  const [payBasis, setPayBasis] = useState<PayBasis | null>(null);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [advancesOwed, setAdvancesOwed] = useState(0);
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

  // ── Totals by day / week / month / year (owner request, 2026-08-12) ──────────────────────────
  //
  // *"They will be able to review their hours by day, week, month, and year."*
  //
  // A separate fetch from the week view rather than summing `logs`: the week view deliberately loads
  // one week, and totalling a year out of it would silently report a year as seven days. The range
  // is asked for explicitly and the arithmetic lives in `lib/hours/summarise.ts`.
  // ── IS THIS WEEK LOCKED? ─────────────────────────────────────────────────────────────────────
  //
  // `pay_period_locks` freezes employee edits for its dates, enforced in the time-logs route with a
  // 423. This page knew nothing about it: an employee whose week had been locked saw the ordinary
  // form, filled in a day, pressed submit, and found out from a failed save. The office had a lock
  // banner; the people the lock actually constrains did not.
  const [weekLock, setWeekLock] = useState<{ period_start: string; period_end: string; locked_by: string } | null>(null);

  const [grain, setGrain] = useState<Grain>('week');
  const [rangeLogs, setRangeLogs] = useState<TimeLog[] | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  // Advance form
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  // The server refuses a second open request and says why ("you already have a $200 request
  // pending"). That sentence belongs on the page, not in a browser alert box that disappears
  // the moment it is dismissed.
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const weekEnd = (() => {
        const d = new Date(`${weekStart}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 6);
        return d.toISOString().slice(0, 10);
      })();

      const [logsRes, advRes, lockRes] = await Promise.all([
        fetch(`/api/admin/time-logs?week_start=${weekStart}`),
        fetch('/api/admin/time-logs/advances'),
        fetch(`/api/admin/time-logs/lock-period?from=${weekStart}&to=${weekEnd}`),
      ]);

      // Best-effort. A lock that fails to load leaves the form usable and the server still refuses
      // the save with its own message — the banner is the courtesy, not the enforcement.
      if (lockRes.ok) {
        const data = await lockRes.json();
        const locks = (data.locks ?? []) as Array<{ period_start: string; period_end: string; locked_by: string }>;
        setWeekLock(locks.find((l) => l.period_start <= weekStart && l.period_end >= weekStart) ?? locks[0] ?? null);
      } else {
        setWeekLock(null);
      }

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
        if (data.work_types?.length) setWorkTypes(data.work_types);
      }
      if (advRes.ok) {
        const data = await advRes.json();
        setAdvances(data.advances || []);
        setAdvancesOwed(data.total_outstanding ?? 0);
      }

      // ── PRICED FOR THIS PERSON, NOT THE LIST PRICE (owner report, 2026-08-04) ─────────────
      //
      // *"On my payment page it shows my base pay is $25 an hour, but when I go to my hours to log
      // hours, it shows a bunch of different roles and stuff all at different pay rates… but it
      // doesn't show the $25. This is inconsistent."*
      //
      // The old call was `?table=work_types`, which returns the raw `work_type_rates` rows — the
      // firm's list prices, identical for a party chief and an intern, and with the person's own
      // agreed rate nowhere on the screen.
      //
      // Dropping the `table` filter is what turns the response into the consolidated menu: the same
      // activities, each priced for whoever is asking, plus a `base` entry for the agreed rate.
      const ratesRes = await fetch('/api/admin/time-logs/rates');
      if (ratesRes.ok) {
        const data = await ratesRes.json();
        if (data.menu) {
          setRateMenu(data.menu);
          setPayBasis(data.effective_basis ?? null);
        }
        if (data.work_types?.length) setWorkTypes(data.work_types);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, [weekStart, reportPageError]);

  useEffect(() => { loadData(); }, [loadData]);

  /**
   * How far back each grain looks.
   *
   * Chosen so the screen answers the question the grain implies rather than returning everything:
   * "by day" means the last few weeks of days, "by year" means the years you have worked here. A
   * single unbounded fetch would grow without limit on a phone.
   */
  const RANGE_DAYS: Record<Grain, number> = { day: 45, week: 180, month: 730, year: 3650 };

  useEffect(() => {
    if (tab !== 'totals') return;
    let cancelled = false;
    (async () => {
      setRangeLoading(true);
      try {
        const to = new Date();
        const from = new Date(to.getTime() - RANGE_DAYS[grain] * 86_400_000);
        // No `status` param at all. The route treats `status` as a literal value or comma list, so
        // `status=all` would filter to entries whose status is the string "all" and return nothing —
        // the approval page handles its "All Statuses" option client-side for the same reason.
        // Omitting it is what actually means "every status".
        const params = new URLSearchParams({
          date_from: from.toISOString().slice(0, 10),
          date_to: to.toISOString().slice(0, 10),
        });
        const res = await fetch(`/api/admin/time-logs?${params.toString()}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setRangeLogs((data.logs ?? []) as TimeLog[]);
        }
      } catch (err) {
        if (!cancelled) reportPageError(err instanceof Error ? err : new Error('Failed to load totals'));
      } finally {
        if (!cancelled) setRangeLoading(false);
      }
    })();
    // The grain can change while a fetch is in flight; without this, a slow "year" response can land
    // after a fast "day" one and paint the wrong totals under the wrong heading.
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, grain, reportPageError]);

  const buckets = useMemo(
    () => summariseHours((rangeLogs ?? []) as SummarisableLog[], grain),
    [rangeLogs, grain],
  );
  const rangeTotal = useMemo(() => totalOf(buckets), [buckets]);

  // Pre-populate the editable form with this day's EDITABLE logs (pending or
  // rejected). Approved/adjusted/disputed logs are locked: they're shown
  // read-only below and must NOT be pre-filled, or re-submitting the day
  // would create duplicate pending rows alongside the locked ones.
  useEffect(() => {
    const editable = logs.filter(
      (l) => l.log_date === selectedDate && (l.status === 'pending' || l.status === 'rejected'),
    );
    if (editable.length > 0) {
      setEntries(editable.map((l) => ({
        // 'unspecified' is the stored form of "base pay, no activity"; the dropdown spells that as
        // an empty string. Left unmapped it would match no option and the select would silently
        // fall back to its first entry, changing what the person had submitted.
        work_type: l.work_type === 'unspecified' ? BASE_PAY : l.work_type,
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
      // No rate at all. Picking one is a decision, and pre-selecting anything on the submitter's
      // behalf — even their own base pay — attaches a number to hours nobody has chosen to price.
      work_type: NO_RATE,
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
  // Editable = pending or rejected (the form replaces these on submit).
  // Locked = approved/adjusted/disputed (shown read-only; only an admin changes them).
  const editableForDate = existingForDate.filter((l) => l.status === 'pending' || l.status === 'rejected');
  const lockedForDate = existingForDate.filter(
    (l) => l.status === 'approved' || l.status === 'adjusted' || l.status === 'disputed',
  );
  const hasExistingEditable = editableForDate.length > 0;
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
      // Replace this date's editable (pending/rejected) logs with the freshly
      // submitted entries. Locked logs (approved/adjusted/disputed) are left
      // untouched so we never duplicate already-approved hours.
      for (const log of editableForDate) {
        await fetch(`/api/admin/time-logs?id=${log.id}`, { method: 'DELETE' });
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
        const problem = await res.json().catch(() => ({}));
        setAdvanceError(problem.error || 'Could not submit that request.');
        return;
      }
      setAdvanceError(null);

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
        const problem = await res.json().catch(() => ({}));
        setAdvanceError(problem.error || 'Could not submit that request.');
        return;
      }
      setAdvanceError(null);
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

  // Summary stats for the week.
  //
  // Computed in `lib/payroll/week-summary.ts` rather than inline, because every figure here was
  // previously answering a slightly different question from the one on its label: "Est. Pay"
  // summed rejected entries too, it read the rate the rules set rather than what the approver
  // decided, the status counts were of ENTRIES not hours, and an adjustment from 10h to 8h left
  // the total reading 10. See that file for the full account.
  const weekLogs = logs.filter((l) => l.log_date >= weekStart && l.log_date <= weekEndStr);
  const week = summarizeWeek(weekLogs);

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
          <div className="tl-summary-card__value">{week.totalHours.toFixed(1)}h</div>
          <div className="tl-summary-card__label">Total Hours</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#9989;</div>
          <div className="tl-summary-card__value">{week.approvedHours.toFixed(1)}h</div>
          <div className="tl-summary-card__label">Approved</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#9203;</div>
          <div className="tl-summary-card__value">{week.pendingHours.toFixed(1)}h</div>
          <div className="tl-summary-card__label">Awaiting approval</div>
        </div>
        {week.rejectedHours > 0 && (
          <div className="tl-summary-card">
            <div className="tl-summary-card__icon">&#10060;</div>
            <div className="tl-summary-card__value">{week.rejectedHours.toFixed(1)}h</div>
            <div className="tl-summary-card__label">Rejected</div>
          </div>
        )}
        {/* Approved pay is what is actually coming. Pending pay sits beside it rather than in
            it, because a figure that mixes settled and unsettled money is not usable for
            either purpose. */}
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#128176;</div>
          <div className="tl-summary-card__value">{formatCurrency(week.approvedPay)}</div>
          <div className="tl-summary-card__label">Approved pay</div>
        </div>
        {week.pendingPay > 0 && (
          <div className="tl-summary-card">
            <div className="tl-summary-card__icon">&#9203;</div>
            <div className="tl-summary-card__value">{formatCurrency(week.pendingPay)}</div>
            <div className="tl-summary-card__label">Pending approval</div>
          </div>
        )}
      </div>

      {/* Approved hours nobody has priced yet. They pay nothing until somebody sets a rate, so
          without this line the week simply shows less money than expected and nothing says why. */}
      {week.undecidedHours > 0 && (
        <div className="tl-week-undecided">
          {week.undecidedHours.toFixed(1)}h approved but not yet priced — no pay is attached to those
          hours until a rate is set.
        </div>
      )}

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
        <button className={`tl-tabs__btn ${tab === 'totals' ? 'tl-tabs__btn--active' : ''}`} onClick={() => setTab('totals')}>
          Totals
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
                {existingForDate.some((l) => l.status === 'rejected') ? 'Hours rejected — edit and resubmit' :
                 lockedForDate.length > 0 ? 'Hours submitted' :
                 'Hours submitted'}
              </span>
            )}
          </div>

          <p className="tl-log-help">
            Forgot to clock in or out? Add or remove hours for any day here, then
            submit them — your manager approves them at the end of the pay period.
          </p>

          {/* Said BEFORE the form, not after a failed save. The server enforces this with a 423
              either way; what was missing was anybody telling the person it applied to them. */}
          {weekLock && (
            <p className="tl-lock-note" role="status">
              This week has been closed off for payroll by {weekLock.locked_by}, so you can’t add or
              change hours for it. Anything already submitted still counts. If a day is missing or
              wrong, ask them to add it for you.
            </p>
          )}

          {/*
            The facts every rate on this page is computed from, stated on the page that uses them.
            Without this, the person sees numbers that differ from the one figure they were told
            they earn and has no way to tell which is right — which is exactly the report that
            started this work.
          */}
          {payBasis && (
            <div className="tl-pay-basis">
              {payBasis.base_pay != null && (
                <span><strong>{formatCurrency(payBasis.base_pay)}/hr</strong> agreed base pay</span>
              )}
              {payBasis.tier_label && <span>{payBasis.tier_label}</span>}
              {payBasis.note && <span className="tl-pay-basis__note">{payBasis.note}</span>}
              {payBasis.base_pay != null && (
                <span className="tl-pay-basis__note">
                  Most work pays your base pay. A few activities have a set rate that is the same for
                  everyone — those are marked below.
                </span>
              )}
            </div>
          )}

          {/* Locked hours (approved / adjusted / disputed) — read-only. */}
          {lockedForDate.length > 0 && (
            <div className="tl-locked-list">
              {lockedForDate.map((l) => {
                const badge = STATUS_BADGES[l.status];
                const shownHours = l.adjusted_hours != null ? l.adjusted_hours : l.hours;
                return (
                  <div key={l.id} className="tl-locked-row">
                    <span className="tl-locked-row__hours">{shownHours.toFixed(2)}h</span>
                    <span className="tl-locked-row__desc">{l.description}</span>
                    {badge && <span className={`tl-badge ${badge.cls}`}>{badge.label}</span>}
                  </div>
                );
              })}
              <p className="tl-locked-note">
                These hours are locked. To change approved hours, ask your manager
                to adjust them.
              </p>
            </div>
          )}

          {entries.length === 0 && (
            <div className="tl-empty-day">
              <div className="tl-empty-day__icon">&#128203;</div>
              <p>{lockedForDate.length > 0 ? 'Add more hours for this day' : 'No hours logged for this day'}</p>
              <button className="tl-btn tl-btn--primary" onClick={addEntry}>Add Hours</button>
            </div>
          )}

          {entries.map((entry, idx) => {
            const wt = workTypes.find((w) => w.work_type === entry.work_type);
            // The rate THIS person earns for the selected activity — or, with nothing selected, the
            // agreed base pay. Falls back to null (rather than a list price) when the menu has not
            // loaded, so a stale number never stands in for the real one.
            const resolved = entry.work_type === NO_RATE
              ? rateMenu?.unpriced ?? null
              : entry.work_type
                ? rateMenu?.activities.find((a) => a.work_type === entry.work_type)?.resolved ?? null
                : rateMenu?.base ?? null;
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
                        {/*
                          First, and selectable — the owner asked for both halves of this: "we
                          should also be able to just apply the base pay too" and "we should be able
                          to submit the hours without any payment option and the boss can decide
                          what is fair". Those are the same row: no activity, agreed base pay, and a
                          decision left to whoever approves it.
                        */}
                        {/* First, and the default. Optional means optional: an entry can be
                            submitted with no rate on it at all. */}
                        <option value={NO_RATE}>No pay rate — let whoever approves decide</option>
                        {rateMenu?.base.rate != null && (
                          <option value={BASE_PAY}>
                            Base pay ({formatCurrency(rateMenu.base.rate)}/hr) — no specific activity
                          </option>
                        )}
                        {/*
                          Priced from the menu, never from `work_type_rates.base_rate` — for an
                          ordinary activity that column is ignored entirely (field work pays the
                          person's own rate), so showing it would put a number on screen that
                          nobody is ever paid.
                        */}
                        {(rateMenu?.activities ?? []).map((a) => (
                          <option key={a.work_type} value={a.work_type}>
                            {a.icon} {a.label}
                            {a.resolved.rate != null ? ` — ${formatCurrency(a.resolved.rate)}/hr` : ''}
                            {a.rate_mode === 'flat' ? ' (set rate)' : ''}
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
                  {/*
                    Where the number came from, shown rather than implied. "$25.00/hr — base pay,
                    the rate for field work" and "$15.00/hr — the set rate for driving, the same for
                    everyone" are both checkable; a bare figure is what made this look like two
                    systems disagreeing.
                  */}
                  {resolved && (
                    <div className={`tl-entry-card__rate tl-entry-card__rate--${resolved.source}`}>
                      <span className="tl-entry-card__rate-amount">
                        {resolved.rate != null ? `${formatCurrency(resolved.rate)}/hr` : 'Rate not set'}
                      </span>
                      <span className="tl-entry-card__rate-why">{resolved.explanation}</span>
                      {resolved.rate != null && entry.hours > 0 && (
                        <span className="tl-entry-card__rate-total">
                          = {formatCurrency(resolved.rate * entry.hours)} for {entry.hours}h
                        </span>
                      )}
                    </div>
                  )}
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
              {/* Disabled rather than left to fail: the server refuses a locked week with a 423
                  regardless, and letting somebody fill in a whole day first is the part that wastes
                  their time. `weekLock` covers the WEEK being viewed, which is the week these
                  entries belong to. */}
              <button
                className="tl-btn tl-btn--primary"
                onClick={submitEntries}
                disabled={submitting || totalHours === 0 || !!weekLock}
                title={weekLock ? 'This week is closed for payroll — ask your manager to add it for you.' : undefined}
              >
                {weekLock ? 'Week closed for payroll'
                  : submitting ? 'Submitting...'
                    : hasExistingEditable ? 'Update & Resubmit' : 'Submit Hours'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TOTALS TAB ────────────────────────────────────────────────────────────────────────
          *"They will be able to review their hours by day, week, month, and year."*

          Three numbers per period, not one: what is settled, what is still waiting on somebody, and
          what has no rate attached. "40h" alone cannot answer the question people actually open this
          screen with, which is whether they are going to be paid for it. */}
      {tab === 'totals' && (
        <div className="tl-history-section">
          <div className="tl-tabs" style={{ marginBottom: '0.75rem' }}>
            {(['day', 'week', 'month', 'year'] as Grain[]).map((g) => (
              <button
                key={g}
                className={`tl-tabs__btn ${grain === g ? 'tl-tabs__btn--active' : ''}`}
                onClick={() => setGrain(g)}
              >
                {g === 'day' ? 'By day' : g === 'week' ? 'By week' : g === 'month' ? 'By month' : 'By year'}
              </button>
            ))}
          </div>

          {rangeLoading && <div className="tl-loading">Loading…</div>}

          {!rangeLoading && buckets.length === 0 && (
            <div className="tl-empty-day"><p>No hours logged in this period.</p></div>
          )}

          {!rangeLoading && buckets.length > 0 && (
            <>
              <div className="tl-history-day">
                <div className="tl-history-day__header">
                  <span className="tl-history-day__title">
                    All {buckets.length} {grain === 'day' ? 'days' : `${grain}s`}
                  </span>
                  <span className="tl-history-day__total">
                    {rangeTotal.hours.toFixed(1)}h · {formatCurrency(rangeTotal.pay)}
                  </span>
                </div>
              </div>

              <div className="tl-history-list">
                {buckets.map((b) => (
                  <div key={b.key} className="tl-history-day">
                    <div className="tl-history-day__header">
                      <span className="tl-history-day__title">{labelFor(b, grain)}</span>
                      <span className="tl-history-day__total">
                        {b.hours.toFixed(1)}h · {formatCurrency(b.pay)}
                      </span>
                    </div>
                    <div className="tl-history-entry">
                      <div className="tl-history-entry__left">
                        <div>
                          <div className="tl-history-entry__desc">
                            {b.entries} {b.entries === 1 ? 'entry' : 'entries'}
                            {b.settledHours > 0 && ` · ${b.settledHours.toFixed(1)}h approved`}
                          </div>
                          {/* Each of these is a different thing to chase, so none of them is
                              folded into the headline figure. */}
                          {b.awaitingHours > 0 && (
                            <div className="tl-history-entry__job">
                              {b.awaitingHours.toFixed(1)}h still waiting on a decision
                            </div>
                          )}
                          {b.unpricedHours > 0 && (
                            <div className="tl-history-entry__job">
                              {b.unpricedHours.toFixed(1)}h with no rate set yet — the pay above does
                              not include them
                            </div>
                          )}
                          {b.rejectedHours > 0 && (
                            <div className="tl-history-entry__rejection">
                              {b.rejectedHours.toFixed(1)}h rejected — not counted above
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
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
                              <div className="tl-history-entry__type">{activityLabel(log.work_type, wt?.label)}</div>
                              <div className="tl-history-entry__desc">{log.description}</div>
                              {log.entered_by && (
                                <div className="tl-history-entry__job">
                                  Entered for you by {log.entered_by}. If this is wrong, tell them.
                                </div>
                              )}
                              {log.job_name && <div className="tl-history-entry__job">Job: {log.job_name}</div>}
                              {log.rejection_reason && (
                                <div className="tl-history-entry__rejection">Reason: {log.rejection_reason}</div>
                              )}
                              {log.adjustment_note && (
                                <div className="tl-history-entry__adjustment">
                                  Adjusted: {log.adjusted_hours}h — {log.adjustment_note}
                                </div>
                              )}
                              {/*
                                What was actually decided, and why. The owner asked for the note so
                                the boss could "make any explanations for why the pay is what it
                                is" — a note nobody can read would not do that job.
                              */}
                              {log.pay_decision && (
                                <div className="tl-history-entry__decision">
                                  {log.pay_decision.blocks.length > 1 && (
                                    <div className="tl-history-entry__split">
                                      {log.pay_decision.blocks.map((b, i) => (
                                        <span key={i}>
                                          {b.hours}h {b.label}
                                          {b.rate != null ? ` at ${formatCurrency(b.rate)}/hr` : ' — not yet priced'}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {log.pay_decision.undecided_hours > 0 && (
                                    <div className="tl-history-entry__undecided">
                                      {log.pay_decision.undecided_hours}h still awaiting a rate.
                                    </div>
                                  )}
                                  {log.pay_decision.payout_note && (
                                    <div className="tl-history-entry__payout-note">
                                      &ldquo;{log.pay_decision.payout_note}&rdquo; — {log.pay_decision.decided_by}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="tl-history-entry__right">
                            <span className="tl-history-entry__hours">{log.hours}h</span>
                            <span className={`tl-badge ${badge.cls}`}>{badge.label}</span>
                            {/* The submitted-rate line is suppressed once a decision exists: showing
                                both without saying which is which is how "$25 or $30.50?" happened
                                in the first place. */}
                            {!log.pay_decision && log.effective_rate && (
                              <span className="tl-history-entry__rate">{formatCurrency(log.effective_rate)}/hr</span>
                            )}
                            {log.pay_decision ? (
                              <span className="tl-history-entry__pay tl-history-entry__pay--decided">
                                {formatCurrency(log.pay_decision.total_pay)}
                              </span>
                            ) : log.total_pay ? (
                              <span className="tl-history-entry__pay">{formatCurrency(log.total_pay)}</span>
                            ) : null}
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
            {/* Stated up front. An advance comes back out of a later cheque, so somebody
                deciding whether to ask for another needs to know what they already owe. */}
            {advancesOwed > 0 && (
              <span className="tl-advances-owed">
                {formatCurrency(advancesOwed)} still to come out of upcoming pay
              </span>
            )}
            <button className="tl-btn tl-btn--primary" onClick={() => setShowAdvanceForm(!showAdvanceForm)}>
              {showAdvanceForm ? 'Cancel' : 'Request Advance'}
            </button>
          </div>

          {advanceError && <div className="tl-pay-error">{advanceError}</div>}

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
                    {/* What is left to repay, and what has come back. Shown only once the money
                        has actually been paid out — before that there is nothing owed. */}
                    {adv.status === 'paid' && (
                      <div className="tl-advance-card__balance">
                        {formatCurrency(adv.outstanding ?? 0)} still to be recovered
                        {(adv.repaid_amount ?? 0) > 0 && (
                          <> &mdash; {formatCurrency(adv.repaid_amount ?? 0)} already repaid</>
                        )}
                      </div>
                    )}
                    {adv.status === 'repaid' && (
                      <div className="tl-advance-card__balance">Fully repaid.</div>
                    )}
                    {adv.status === 'approved' && (
                      <div className="tl-advance-card__balance">
                        Approved &mdash; waiting to be paid out. Nothing is recovered until it is.
                      </div>
                    )}
                  </div>
                  <div className="tl-advance-card__right">
                    <span className={`tl-badge ${
                      adv.status === 'denied' || adv.status === 'cancelled' ? 'tl-badge--rejected'
                        : adv.status === 'pending' ? 'tl-badge--pending'
                        : 'tl-badge--approved'
                    }`}>
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
