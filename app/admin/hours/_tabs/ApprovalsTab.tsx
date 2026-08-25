// app/admin/hours-approval/page.tsx — Admin approval of employee time logs
'use client';
import '../../styles/AdminTimeLogs.css';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../../hooks/usePageError';
import { computeHoursFlags, effectiveHours } from '@/lib/hours/hours-flags';
import { detectLateEntry, countLateEntries, type PeriodLock } from '@/lib/hours/late-entry';
import { describeSnapshot } from '@/lib/hours/period-snapshot';
import { decidedPay } from '@/lib/hours/summarise';
import { countByStatus, filterLogs, statusOf } from '@/lib/hours/status-view';
import { useFocusHighlight } from '@/lib/admin/use-focus-highlight';
import PayDecisionModal from './PayDecisionModal';
import { useSearchParams } from 'next/navigation';

interface TimeLog {
  id: string;
  user_email: string;
  log_date: string;
  work_type: string;
  hours: number;
  description: string;
  notes: string | null;
  job_name: string | null;
  /** The job this day was worked on, when there is one. Read by the duplicate check: two crews on
   *  two jobs for the same four hours is not one entry submitted twice. */
  job_id: string | null;
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
  /** Set when the office created this entry rather than the employee. NULL means self-submitted —
   *  see seed 585. Not the same question as `approved_by`, which agrees with it on office-entered
   *  rows and cannot distinguish them from an ordinary approval. */
  entered_by: string | null;
  /**
   * What an approver DECIDED this entry is worth, when they decided anything.
   *
   * `/api/admin/time-logs` has always attached this — it exists so the money on this page can be
   * right — but the interface did not declare it, so every read of it was dropped and the totals
   * showed the pre-decision figure. Setting pay via "Set pay" writes `time_log_pay_decisions` and
   * never touches `daily_time_logs.total_pay`, so the two disagree by design; the decision wins.
   */
  pay_decision: { total_pay: number | null } | null;
  created_at: string;
}

interface WorkType {
  work_type: string;
  label: string;
  icon: string;
  base_rate: number;
}

/** One row of `/api/admin/payroll/owed`. Mirrors OwedRow on the server. */
interface OwedRow {
  user_email: string;
  owedCents: number;
  undecidedHours: number;
  lastPayoutAt: string | null;
  statement: string;
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
  repaid_amount?: number;
  /** Still owed. Zero unless the advance has been paid out. */
  outstanding?: number;
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
  // ── THE MISSING LINE ────────────────────────────────────────────────────────────────────────
  //
  // Without this, `mon` keeps the CURRENT time of day, and every caller immediately does
  // `.toISOString().split('T')[0]`. West of Greenwich, any local time past about 19:00 has already
  // rolled over in UTC — so opening this page on a Wednesday evening in Texas produced a week
  // starting **Tuesday**, and the header read "Tue, Aug 11 — Mon, Aug 17".
  //
  // It is not only cosmetic. `weekStart` is sent to the API as the week filter and compared against
  // `pay_period_locks.period_start` for an exact match, so a real Monday–Sunday lock silently failed
  // to match and the "this period is locked" banner never appeared for anybody working late.
  //
  // `MyHoursPanel`'s copy of this function has always had the line; this one did not. Two
  // implementations of the same rule, and only one of them right — which is the argument for there
  // being one.
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

/**
 * `YYYY-MM-DD` from the date's LOCAL parts.
 *
 * Deliberately not `.toISOString().split('T')[0]`, which is the trap documented at length in
 * `getMonday` above: a Date at local midnight is the PREVIOUS day in UTC anywhere west of
 * Greenwich, so a month built as `new Date(y, m, 1)` would be sent to the API as the 31st of the
 * month before and quietly drop a day off one end of the range.
 */
function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatCurrency(n: number) {
  return '$' + n.toFixed(2);
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
export default function HoursApprovalPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction, reportPageError } = usePageError('HoursApprovalPage');
  const [tab, setTab] = useState<ApprovalTab>('pending');
  // ── EVERY STATUS FOR THE WEEK, FILTERED ON THE CLIENT (owner, 2026-08-16) ────────────────────
  //
  // *"We need to see all of the submitted/pending hours, the rejected hours, the adjusted hours,
  // the accepted hours and the hours that were added by the boss."*
  //
  // The page used to ask the server for ONE status set at a time, which made two things impossible:
  // a count per status (you cannot count what you did not fetch), and noticing that a day exists in
  // a status you are not currently looking at. A week of one firm's time logs is a handful of rows —
  // fetching the week once and filtering in the browser costs nothing and makes the strip honest.
  const [weekLogs, setWeekLogs] = useState<TimeLog[]>([]);
  /** Who put the day on the record. `entered_by` is set only when the office entered it — see the
   *  insert in `/api/admin/time-logs`, where NULL means the employee claimed it themselves. Those
   *  are different assertions about the same eight hours, so they are filterable, not just
   *  printable. */
  const [filterSource, setFilterSource] = useState<'all' | 'office' | 'employee'>('all');
  /**
   * How much time the list covers.
   *
   * The page has always worked in weeks, and the tab called "All Entries" was all STATUSES for one
   * week — so a day entered for last month was not on it, and the only way to find it was to guess
   * the week and page back to it. Approving still happens a week at a time (that is what a pay
   * period is, and the lock is week-shaped), so the week stays the default and this widens only the
   * READING of the list.
   */
  const [range, setRange] = useState<'week' | 'month' | 'all'>('week');
  // N5 — when arriving from an alert link `?focus=<logId>`, scroll to + flash
  // that time-log entry once the list has loaded.
  useFocusHighlight({ deps: [weekLogs.length] });
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set<string>());

  // ── EVERYTHING AWAITING A DECISION, NOT JUST THIS WEEK'S ─────────────────────────────────────
  //
  // This page opens on the CURRENT week. On 2026-08-24 that week was empty and the page said "No
  // time logs for this period" — while four entries sat awaiting review in the weeks before it,
  // including somebody's whole Monday. An approver who opens the queue and is told there is
  // nothing here closes it, and the hours stay unpaid.
  //
  // "Is anything waiting?" is not a question about the week on screen, so it is not asked with the
  // week's filters. One unfiltered read of what is still pending or disputed, kept beside the
  // week's data rather than mixed into it, so the week's own totals cannot drift.
  const [outstanding, setOutstanding] = useState<{ count: number; oldest: string | null; people: number }>(
    { count: 0, oldest: null, people: 0 },
  );

  // ── THE NOTIFICATION HAS TO LAND SOMEWHERE USEFUL (owner request, 2026-08-05) ─────────────
  //
  // *"…will get a notification where they can be linked to see the submitted hours and address
  // it."*
  //
  // This page read no URL parameters at all, so a link from a notification opened the default
  // queue — current week, everybody — and the approver had to find the submission again. A link
  // that makes you repeat the search is the built-but-unreachable defect wearing a URL.
  //
  // `?employee=` and `?date=` come from `hoursApprovalLink()`; `?status=` lets the same link open
  // on what still needs deciding. Read ONCE as the initial state rather than kept in sync, so an
  // approver who then changes a filter is not fighting the URL.
  const searchParams = useSearchParams();
  const linkedEmail = searchParams.get('employee') ?? '';
  const linkedDate = searchParams.get('date');
  const linkedStatus = searchParams.get('status');

  // Filters
  const [filterEmail, setFilterEmail] = useState(linkedEmail);
  // The review queue surfaces everything that needs an admin decision:
  // pending submissions AND disputed entries (so a dispute can't get stuck
  // unseen). The comma list is expanded server-side into an IN() filter.
  const [filterStatus, setFilterStatus] = useState(linkedStatus || 'pending,disputed');
  // The week CONTAINING the linked date, not the date itself — the page works in weeks, and
  // jumping to a Thursday would otherwise show a week starting on Thursday.
  const [weekStart, setWeekStart] = useState(() =>
    getMonday(linkedDate ? new Date(`${linkedDate}T00:00:00`) : new Date()).toISOString().split('T')[0]);
  // H6 — whether THIS week (weekStart .. weekStart+6) is locked for editing.
  const [weekLock, setWeekLock] = useState<
    {
      period_start: string; period_end: string; locked_by: string;
      /** Seed 587 — what the period held at the instant it was closed. Absent on locks taken before
       *  snapshots existed, which is deliberately distinguishable from a period that held nothing. */
      closed_hours?: number | null;
      closed_pay_cents?: number | null;
      closed_entry_count?: number | null;
      closed_people?: number | null;
      /** The payout prepared when this week was closed (seed 589), when one was. */
      payout_batch_id?: string | null;
    } | null
  >(null);
  /** Set while a payout is being prepared from a closed week, so the button cannot be pressed twice. */
  const [preparingPayout, setPreparingPayout] = useState(false);
  /** Every lock overlapping the visible week, for the late-entry check. See `lib/hours/late-entry.ts`:
   *  an entry added AFTER its week was closed off belongs to that week but is paid in the next
   *  payout, and until now looked identical to one submitted on time. */
  const [weekLocks, setWeekLocks] = useState<PeriodLock[]>([]);
  /**
   * EVERY entry in the visible week — all employees, all statuses — regardless of the filters.
   *
   * The close snapshot counts the whole period, so comparing it against `logs` compared a superset
   * against a filtered subset: the default tab shows `pending,disputed` only, so "N entries have
   * arrived since the close" computed a negative and the sentence could never appear on the tab it
   * was rendered on. Worse for the case it exists to catch — an office-entered late day arrives
   * `approved`, so it is invisible in that filter by definition.
   */
  const [periodLogs, setPeriodLogs] = useState<TimeLog[]>([]);

  // ── SET PAY (owner request, 2026-08-04) ──────────────────────────────────────────────────
  //
  // *"The boss might choose to pay the rate for drawing for 2 hours and the field work rate for 6
  // hours, or he might want to just give them the base pay for the whole time, or he will pay them
  // some unique amount."*
  //
  // Approve / Adjust / Reject could change the HOURS but never the RATE, so an approver who
  // disagreed with what a day was worth had no move except to reject it. This is the missing verb.
  const [payLogId, setPayLogId] = useState<string | null>(null);

  // ── WHAT EACH PERSON IS OWED, WHILE YOU DECIDE ────────────────────────────────────────────
  //
  // *"This will all be calculated to show how much is owed since the last payout to that
  // employee."*
  //
  // Approving an hour is a decision about money, and this screen showed only the hours in front of
  // it. The running balance — every approved hour minus every payout — belongs next to the person's
  // name, not on a different page somebody has to go and find.
  const [owedByEmail, setOwedByEmail] = useState<Record<string, OwedRow>>({});

  // Reject/adjust modal
  const [actionModal, setActionModal] = useState<{ type: 'reject' | 'adjust'; logId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adjustHours, setAdjustHours] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  // ── Logging hours FOR an employee (owner request, 2026-08-12) ───────────────────────────────
  //
  // *"The employer will also be able to log hours for employees and create entries setting the hours
  // and pay for the employee."*
  //
  // Until now there was no way at all: the only insert into `daily_time_logs` hard-coded the caller's
  // own email. A crew member who never submitted a day simply had no day, and the office could
  // correct hours that existed but could not create one.
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryForm, setEntryForm] = useState({
    user_email: '',
    log_date: new Date().toISOString().split('T')[0],
    hours: '',
    work_type: '',
    description: '',
    notes: '',
  });
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  /** Confirmation of the last office-entered day, shown on the page rather than in the modal that
   *  just closed — otherwise the only evidence the save worked disappears with the dialog. */
  const [entryNotice, setEntryNotice] = useState<string | null>(null);
  /** Who the office can enter hours for. Loaded once with the page. */
  const [staff, setStaff] = useState<Array<{ email: string; name: string | null }>>([]);

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
      // NO `status` param — the period comes back whole and the status filter is applied below, so
      // the counts strip can say how many rejected/adjusted/approved days exist without the
      // approver having to go looking for them one filter at a time.
      if (range === 'week') {
        params.set('week_start', weekStart);
      } else if (range === 'month') {
        // The calendar month CONTAINING the week on screen, so stepping the week and then widening
        // lands somewhere predictable rather than jumping to today.
        const anchor = new Date(`${weekStart}T00:00:00`);
        const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
        params.set('date_from', toISODate(from));
        params.set('date_to', toISODate(to));
      }
      // 'all' sends no date filter at all — every entry this firm has, newest first.

      const [logsRes, advRes, bonRes] = await Promise.all([
        fetch(`/api/admin/time-logs?${params.toString()}`),
        fetch('/api/admin/time-logs/advances'),
        fetch('/api/admin/time-logs/bonuses'),
      ]);

      if (logsRes.ok) {
        const data = await logsRes.json();
        setWeekLogs(data.logs || []);
        if (data.work_types?.length) setWorkTypes(data.work_types);
      }
      // Balances are loaded with everything else rather than per group, so opening the page is
      // one round-trip and not one per employee.
      try {
        const owedRes = await fetch('/api/admin/payroll/owed');
        if (owedRes.ok) {
          const body = await owedRes.json();
          const map: Record<string, OwedRow> = {};
          for (const row of (body.owed ?? []) as OwedRow[]) map[row.user_email] = row;
          setOwedByEmail(map);
        }
      } catch {
        // A balance that fails to load leaves the hours usable. It is absent rather than wrong,
        // and the header simply does not render it.
      }
      // Who the office can enter hours for. Picked from a list rather than typed: a typo'd address
      // would create a timesheet for a person who does not exist, which nobody would ever open and
      // which anything summing hours by email would still count.
      try {
        const staffRes = await fetch('/api/admin/employees/options');
        if (staffRes.ok) {
          const body = await staffRes.json();
          setStaff((body.employees ?? []) as Array<{ email: string; name: string | null }>);
        }
      } catch { /* the picker is empty; the rest of the page is unaffected */ }

      // Unfiltered by date and by person, deliberately: this is the number that tells an approver
      // the queue is not empty even when the week they happen to be looking at is.
      try {
        const outRes = await fetch('/api/admin/time-logs?status=pending,disputed');
        if (outRes.ok) {
          const rows = ((await outRes.json()).logs ?? []) as TimeLog[];
          const dates = rows.map((l) => l.log_date).filter(Boolean).sort();
          setOutstanding({
            count: rows.length,
            oldest: dates[0] ?? null,
            people: new Set(rows.map((l) => l.user_email)).size,
          });
        }
      } catch {
        // The banner simply does not render. It must never be the reason the page fails to load.
      }

      if (advRes.ok) {
        const data = await advRes.json();
        setAdvances(data.advances || []);
      }
      if (bonRes.ok) {
        const data = await bonRes.json();
        setBonuses(data.bonuses || []);
      }

      // Lock state for the visible week.
      const weekEnd = addDays(weekStart, 6);
      const lockRes = await fetch(`/api/admin/time-logs/lock-period?from=${weekStart}&to=${weekEnd}`);
      if (lockRes.ok) {
        const data = await lockRes.json();
        const exact = (data.locks || []).find(
          (l: { period_start: string; period_end: string }) => l.period_start === weekStart && l.period_end === weekEnd,
        );
        setWeekLock(exact || null);
        // The unfiltered week, for the snapshot comparison and the late-entry count. Only fetched
        // when the week is actually locked — there is nothing to compare against otherwise.
        if (exact) {
          try {
            const allRes = await fetch(`/api/admin/time-logs?date_from=${weekStart}&date_to=${weekEnd}`);
            if (allRes.ok) setPeriodLogs(((await allRes.json()).logs ?? []) as TimeLog[]);
          } catch { /* the banner falls back to saying only what the period held at close */ }
        } else {
          setPeriodLogs([]);
        }
        // ALL overlapping locks, not just the exact-week one. An entry is late relative to whichever
        // lock covers its own day — a monthly close, or a week that was locked, unlocked and locked
        // again — and the exact-match row above only answers "is the week I am looking at locked".
        setWeekLocks((data.locks || []) as PeriodLock[]);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Failed to load'));
    } finally {
      setLoading(false);
    }
    // `filterStatus` is NOT a dependency any more — it filters the fetched period on the client, so
    // changing a status chip must not re-hit the network (and must not be able to change what the
    // counts are computed from). `range` is, because it changes what is fetched.
  }, [filterEmail, weekStart, range, reportPageError]);

  /**
   * Create a time entry on somebody else's behalf.
   *
   * Posts to the same endpoint the employee's own timesheet uses, with `user_email` naming whose day
   * it is — so an office-entered day is an ordinary row that every existing screen, total and payout
   * already understands, rather than a second kind of entry with its own rules.
   */
  const submitEntryForEmployee = async () => {
    setEntryError(null);
    const hrs = parseFloat(entryForm.hours);
    if (!entryForm.user_email) { setEntryError('Pick whose hours these are.'); return; }
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) { setEntryError('Enter hours between 0 and 24.'); return; }
    // The API requires it, and it is the field that makes the entry mean something six months later
    // when somebody asks what this day was.
    if (!entryForm.description.trim()) { setEntryError('Say what the work was.'); return; }

    setEntrySaving(true);
    try {
      const res = await fetch('/api/admin/time-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: entryForm.user_email,
          entries: [{
            log_date: entryForm.log_date,
            hours: hrs,
            work_type: entryForm.work_type || null,
            description: entryForm.description.trim(),
            notes: entryForm.notes.trim() || undefined,
          }],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Could not save the entry (HTTP ${res.status}).`);
      setShowEntryForm(false);
      setEntryForm((f) => ({ ...f, hours: '', description: '', notes: '' }));

      // ── LAND WHERE THE ENTRY ACTUALLY IS (owner, 2026-08-16: "actually see those hours entered") ──
      //
      // This used to close the modal and re-run `loadData()` against WHATEVER filter was active —
      // and the active one is almost always the default, `pending,disputed`. An office-entered day
      // is inserted `approved` (the admin entering it IS the approver), so the reload could not
      // return the row that had just been created. The save worked, the employee was notified, and
      // the screen showed nothing: indistinguishable from a silent failure, on the one action whose
      // whole point is that somebody can see the result.
      //
      // The same trap a week wide: an entry dated outside the week on screen is invisible even on
      // "All Entries", which is week-scoped. So move BOTH axes to the row that was just written.
      const savedDate = entryForm.log_date;
      setTab('history');
      setFilterStatus('all');
      setWeekStart(getMonday(new Date(`${savedDate}T00:00:00`)).toISOString().split('T')[0]);
      setFilterEmail('');
      setEntryNotice(
        `Added ${hrs}h for ${entryForm.user_email} on ${formatDate(savedDate)} — approved, and they have been notified.`,
      );
      // `loadData` is driven by the filter state above; setting it is what triggers the reload.
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : String(e));
    } finally {
      setEntrySaving(false);
    }
  };

  /**
   * Prepare the payout for a week that has just been closed, and record which batch it produced.
   *
   * ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────────────────────────
   *
   * It does not pay "this week's hours". The surviving engine is balance-driven on purpose — the
   * batch settles everything each person is owed at this moment, which is usually this week plus
   * anything older that had not been paid. Building a period-scoped payout instead would drop hours
   * logged late, which is the exact failure `lib/payroll/owed.ts` was written to prevent.
   *
   * So the link means "closing this week is what prompted this payout", which is the question
   * somebody actually asks six weeks later. Nothing is sent: the batch is a DRAFT.
   */
  const preparePayoutForWeek = async () => {
    if (!weekLock || preparingPayout) return;
    if (!confirm(
      'Prepare a payout for everybody who is owed?\n\n'
      + 'This creates a DRAFT batch — nothing is sent until you dispatch it. It covers everything '
      + 'currently owed, not only this week, so nobody with older unpaid hours is missed.',
    )) return;

    setPreparingPayout(true);
    try {
      const res = await fetch('/api/admin/payroll/pay-owed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: `Closing ${weekLock.period_start} – ${weekLock.period_end}` }),
      });
      const json = await res.json();
      if (!res.ok) {
        // 409 means nobody had a positive balance, which is an ordinary outcome and not an error to
        // bury — the week is still closed either way.
        alert(json.error ?? `The payout could not be prepared (HTTP ${res.status}).`);
        return;
      }
      // Record what the close produced. Best-effort: the batch exists and is correct regardless, and
      // failing here would leave somebody thinking no payout was made.
      const batchId = json?.batch?.id ?? json?.batch_id;
      if (batchId) {
        await fetch('/api/admin/time-logs/lock-period', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period_start: weekLock.period_start,
            period_end: weekLock.period_end,
            payout_batch_id: batchId,
          }),
        }).catch(() => { /* the batch is still findable on /admin/payouts */ });
      }
      await loadData();
    } finally {
      setPreparingPayout(false);
    }
  };

  const toggleWeekLock = async () => {
    const weekEnd = addDays(weekStart, 6);
    if (weekLock) {
      if (!confirm('Unlock this pay period so employees can edit their hours again?')) return;
      await fetch(`/api/admin/time-logs/lock-period?period_start=${weekStart}&period_end=${weekEnd}`, { method: 'DELETE' });
    } else {
      if (!confirm('Lock this pay period? Employees will no longer be able to edit or add hours for this week (you can still adjust them).')) return;
      await fetch('/api/admin/time-logs/lock-period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_start: weekStart, period_end: weekEnd }),
      });
    }
    await loadData();
  };

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

    // ── DO NOT LET TWO CLICKS APPROVE A DAY TWICE ────────────────────────────────────
    //
    // "Select All Pending" then "Approve Selected" is two clicks, and that is the point — a week
    // of ordinary hours should not take twenty. But on 2026-08-24 the queue held two identical
    // 7.56-hour rows for one Monday, and those same two clicks would have paid both of them.
    //
    // The flag was already on screen. This is the difference between showing somebody a warning
    // and making sure they read it: bulk approve is the one action that can act on a duplicate
    // without anybody ever looking at the entry itself.
    //
    // Named rather than counted. "2 possible duplicates" is a number to click past; the date and
    // the description are what let the approver decide inside the dialog.
    const chosen = logs.filter((l) => selected.has(l.id));
    const groups = new Map<string, number>();
    for (const l of chosen) {
      const key = [l.user_email, l.log_date, effectiveHours(l), (l.description ?? '').trim(), l.job_id ?? ''].join('|');
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const repeated = [...groups.entries()].filter(([, n]) => n > 1);
    if (repeated.length > 0) {
      const lines = repeated.map(([key, n]) => {
        const [email, date, hours, description] = key.split('|');
        return `  • ${email} — ${date}, ${hours}h "${description.slice(0, 50)}" ×${n}`;
      });
      const ok = confirm([
        'You are about to approve entries that look like the same day submitted more than once:',
        '',
        ...lines,
        '',
        'Approving all of them pays those hours more than once. Cancel to reject the extra copies first.',
      ].join('\n'));
      if (!ok) return;
    }

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
      if (action === 'adjust') {
        // Pre-fill the current hours so the admin edits from the real value.
        const log = logs.find((l) => l.id === logId);
        setAdjustHours(log ? String(log.adjusted_hours ?? log.hours) : '');
        setAdjustNote('');
      }
      setActionModal({ type: action, logId });
    }
  };

  /**
   * @param thenApprove after a successful adjustment, approve in the same click.
   *
   * Sequential, not one request: `adjust` and `approve` are separate transitions on the API, each with
   * its own notification to the employee, and collapsing them server-side would mean inventing a
   * fourth action whose failure mode ("adjusted but not approved") is exactly the state we are trying
   * to stop stranding people in. Two calls, and the second only runs if the first succeeded.
   */
  const submitAction = async (thenApprove = false) => {
    if (!actionModal) return;
    if (actionModal.type === 'reject') {
      await fetch('/api/admin/time-logs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: actionModal.logId, action: 'reject', rejection_reason: rejectReason }),
      });
    } else {
      const hrs = parseFloat(adjustHours);
      if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) {
        alert('Enter the corrected hours (between 0 and 24).');
        return;
      }
      if (!adjustNote.trim()) {
        alert('Please add a reason for the adjustment — the employee is notified of the change and your reason.');
        return;
      }
      const res = await fetch('/api/admin/time-logs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actionModal.logId, action: 'adjust',
          adjusted_hours: hrs,
          adjustment_note: adjustNote.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error ?? 'The adjustment could not be saved.');
        return;
      }
      // Only if the adjustment actually landed. Approving an adjustment that failed to save would
      // approve the ORIGINAL hours while the approver believes they approved the corrected ones.
      if (thenApprove) {
        await fetch('/api/admin/time-logs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: actionModal.logId, action: 'approve' }),
        });
      }
    }
    setActionModal(null);
    setRejectReason('');
    setAdjustHours('');
    setAdjustNote('');
    await loadData();
  };

  // Advance actions
  // ── APPROVING IS NOT PAYING (pay consolidation C-17, 2026-08-04) ──────────────────────────
  //
  // Approve records the decision and, optionally, how much comes back each pay period. It does
  // NOT make the advance recoverable — "Mark paid" does that, because recovering against money
  // that was blessed but never handed over takes back something the person never received.
  const approveAdvance = async (id: string) => {
    const payDate = prompt('Pay date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!payDate) return;
    // Blank means the whole balance comes out of the next cheque, which is right for a small
    // advance. A larger one is spread by entering a figure. Either way a cheque is never
    // emptied — a quarter of net pay is always protected.
    const instalment = prompt('Recover how much per pay period? Leave blank to take it all from the next cheque.', '');
    const perPeriod = instalment === null ? null : parseFloat(instalment);

    const res = await fetch('/api/admin/time-logs/advances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id, action: 'approve', pay_date: payDate,
        ...(Number.isFinite(perPeriod) && (perPeriod as number) > 0 ? { repay_per_period: perPeriod } : {}),
      }),
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => ({}));
      alert(problem.error || 'Could not approve that advance.');
      return;
    }
    await loadData();
  };

  /** The money has actually left. This is what puts the advance into recovery. */
  const markAdvancePaid = async (id: string) => {
    if (!confirm('Mark this advance as paid out? It will start coming back out of upcoming paycheques.')) return;
    const res = await fetch('/api/admin/time-logs/advances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'mark_paid' }),
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => ({}));
      alert(problem.error || 'Could not mark that advance as paid.');
      return;
    }
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

  // ── THE WEEK, THEN THE FILTERS ────────────────────────────────────────────────────────────────
  //
  // `weekLogs` is every status for the week on screen; `logs` is what the current filters leave.
  // Both exist because the counts have to describe the WEEK — a strip that counted only what passed
  // the filter would always read "Rejected 0" while you were looking at pending, which is precisely
  // the blindness this was asked to fix.
  const statusCounts = countByStatus(weekLogs);
  const logs = filterLogs(weekLogs, { status: filterStatus, source: filterSource });

  // Group logs by employee
  const byEmployee = new Map<string, TimeLog[]>();
  for (const log of logs) {
    const arr = byEmployee.get(log.user_email) || [];
    arr.push(log);
    byEmployee.set(log.user_email, arr);
  }

  // Counted off the WEEK, not the filtered view: the tab badge answers "is there anything waiting",
  // and it must not read zero merely because you are currently looking at approved days.
  const pendingCount = weekLogs.filter((l) => statusOf(l) === 'pending' || statusOf(l) === 'disputed').length;
  const pendingAdvances = advances.filter((a) => a.status === 'pending').length;

  if (!session?.user?.email || !session.user.roles?.includes('admin')) {
    return <div className="tl-loading">Admin access required</div>;
  }

  return (
    <div className="tl-page">
      {/* ── WHAT IS WAITING, WHEREVER IT IS ────────────────────────────────────────────────────

          This page opens on the current week. On 2026-08-24 that week was empty, so it said "No
          time logs for this period" — and four entries were awaiting review in the weeks before
          it, one of them a whole day. An empty queue and an unwatched one look identical, and
          only one of them means somebody is not getting paid.

          Shown only when the week on screen does NOT already account for everything outstanding,
          so an approver working a normal week never sees it. One click widens the range to
          everything, which is where the work is. */}
      {!loading && outstanding.count > pendingCount && (
        <div className="tl-outstanding" role="status">
          <span className="tl-outstanding__icon" aria-hidden="true">&#128276;</span>
          <span className="tl-outstanding__text">
            <strong>
              {outstanding.count} {outstanding.count === 1 ? 'entry is' : 'entries are'} waiting for your decision
            </strong>
            {' '}across {outstanding.people} {outstanding.people === 1 ? 'person' : 'people'}
            {outstanding.oldest && <> &mdash; the oldest is from <strong>{formatDate(outstanding.oldest)}</strong></>}
            {pendingCount === 0
              ? <>. None of them are in the period you are looking at.</>
              : <>, and {outstanding.count - pendingCount} of them {outstanding.count - pendingCount === 1 ? 'is' : 'are'} outside it.</>}
          </span>
          <button
            type="button"
            className="tl-btn tl-btn--sm tl-btn--primary"
            onClick={() => {
              // The oldest outstanding entry is the one that has been waiting longest, so that is
              // the week to open on. Widening to "all" as well, because a second person's entry in
              // a different week would otherwise be the next thing to go unnoticed.
              if (outstanding.oldest) setWeekStart(getMonday(new Date(`${outstanding.oldest}T00:00:00`)).toISOString().split('T')[0]);
              setRange('all');
              setFilterStatus('pending,disputed');
            }}
          >
            Show me
          </button>
        </div>
      )}

      {/* Week navigation. The arrows step the week even when a wider range is showing, because the
          week is still what gets locked and paid — widening changes what you can SEE, not the
          period you are working. */}
      <div className="tl-week-nav">
        <button className="tl-btn tl-btn--sm" onClick={prevWeek} disabled={range === 'all'}>&#9664; Prev</button>
        <span className="tl-week-nav__label">
          {range === 'week' && <>{formatDate(weekStart)} &mdash; {formatDate(weekEndStr)}</>}
          {range === 'month' && new Date(`${weekStart}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          {range === 'all' && 'All time'}
        </span>
        <button className="tl-btn tl-btn--sm" onClick={nextWeek} disabled={range === 'all'}>Next &#9654;</button>

        {/* How far the list reaches. "All Entries" used to mean every STATUS for one week, which is
            why a day entered for last month looked like it had not saved. */}
        <div className="tl-range" role="group" aria-label="How much time to show">
          {(['week', 'month', 'all'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`tl-range__btn ${range === r ? 'tl-range__btn--on' : ''}`}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {r === 'week' ? 'This week' : r === 'month' ? 'This month' : 'All time'}
            </button>
          ))}
        </div>
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
          {/* An adjustment IS the new number of hours — see `effectiveHours`. This card summed raw
              `hours`, so cutting a ten-hour day to eight left the approver's own page still reporting
              ten while the employee's week summary (fixed earlier) reported eight. */}
          <div className="tl-summary-card__value">{logs.reduce((s, l) => s + effectiveHours(l), 0).toFixed(1)}h</div>
          <div className="tl-summary-card__label">Total Hours</div>
        </div>
        <div className="tl-summary-card">
          <div className="tl-summary-card__icon">&#128176;</div>
          {/* `decidedPay`, not `total_pay`. The approver sets pay on THIS page via "Set pay", which
              writes `time_log_pay_decisions` and never touches `daily_time_logs.total_pay` — so this
              card showed the pre-decision figure and disagreed with the employee's own screen, which
              reads the decision. The hours card above was fixed to use `effectiveHours`; the dollars
              beside it were left on the raw column. */}
          <div className="tl-summary-card__value">
            {formatCurrency(logs.reduce((s, l) => s + (decidedPay(l) ?? 0), 0))}
          </div>
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
        <button className={`tl-tabs__btn ${tab === 'pending' ? 'tl-tabs__btn--active' : ''}`} onClick={() => { setTab('pending'); setFilterStatus('pending,disputed'); }}>
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

      {/* ── EVERY STATUS FOR THE WEEK, IN ONE ROW (owner, 2026-08-16) ──────────────────────────────
          *"We need to see all of the submitted/pending hours, the rejected hours, the adjusted
          hours, the accepted hours and the hours that were added by the boss."*

          These five states existed and were reachable only by opening "All Entries" and choosing
          from a dropdown — so a rejected day, or a day the office entered, was something you had to
          already suspect in order to find. Each chip is a count for the WEEK on screen and a filter
          for it, and a chip reading 0 is deliberately still rendered: "no rejected hours this week"
          is an answer, and hiding the chip makes it look like the question cannot be asked. */}
      {(tab === 'pending' || tab === 'history') && (
        <div className="tl-status-strip" role="group" aria-label="Filter by status">
          {([
            { key: 'all', label: 'All', count: weekLogs.length, mod: 'all' },
            { key: 'pending,disputed', label: 'Awaiting review', count: statusCounts.pending + statusCounts.disputed, mod: 'pending' },
            { key: 'approved', label: 'Approved', count: statusCounts.approved, mod: 'approved' },
            { key: 'adjusted', label: 'Adjusted', count: statusCounts.adjusted, mod: 'adjusted' },
            { key: 'rejected', label: 'Rejected', count: statusCounts.rejected, mod: 'rejected' },
            { key: 'disputed', label: 'Disputed', count: statusCounts.disputed, mod: 'disputed' },
          ] as const).map((c) => (
            <button
              key={c.key}
              type="button"
              className={`tl-status-chip tl-status-chip--${c.mod} ${filterStatus === c.key ? 'tl-status-chip--on' : ''}`}
              aria-pressed={filterStatus === c.key}
              onClick={() => { setTab('history'); setFilterStatus(c.key); }}
            >
              <span className="tl-status-chip__count">{c.count}</span>
              <span className="tl-status-chip__label">{c.label}</span>
            </button>
          ))}

          {/* Who put it on the record — a different question from what state it is in, so it is a
              separate control rather than a sixth status. An office-entered day is `approved` the
              moment it is written, so it would otherwise be invisible among every other approved day. */}
          <span className="tl-status-strip__divider" aria-hidden />
          <button
            type="button"
            className={`tl-status-chip tl-status-chip--office ${filterSource === 'office' ? 'tl-status-chip--on' : ''}`}
            aria-pressed={filterSource === 'office'}
            onClick={() => { setTab('history'); setFilterStatus('all'); setFilterSource(filterSource === 'office' ? 'all' : 'office'); }}
            title="Days the office entered on an employee’s behalf, rather than the employee submitting them"
          >
            <span className="tl-status-chip__count">{statusCounts.office}</span>
            <span className="tl-status-chip__label">Added by office</span>
          </button>
          {filterSource !== 'all' && (
            <button type="button" className="tl-status-strip__clear" onClick={() => setFilterSource('all')}>
              Clear source filter
            </button>
          )}
        </div>
      )}

      {/* The save confirmation lives here, not in the modal that closed on top of it. */}
      {entryNotice && (
        <div className="tl-entry-notice" role="status">
          <span>{entryNotice}</span>
          <button type="button" onClick={() => setEntryNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

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
          {/* The status <select> that used to sit here is gone: the chip strip above does the same
              job and does it better — it shows the COUNT of each status without being opened, which
              is the whole reason a rejected day used to go unnoticed. Leaving both would be two
              controls for one filter, drifting apart the first time one of them gains a state. */}
          {/* Log a day the employee never submitted. Sits beside the lock rather than in a menu:
              the moment you need it is while you are looking at a week with a hole in it. */}
          <button
            className="tl-btn tl-btn--sm"
            onClick={() => { setEntryError(null); setShowEntryForm(true); }}
            title="Create a time entry on an employee’s behalf — they are notified"
          >
            ＋ Add hours for someone
          </button>
          {/* H6 — approve & lock the pay period (week) so employees can't edit it. */}
          <button
            className={`tl-btn tl-btn--sm ${weekLock ? 'tl-btn--danger' : 'tl-btn--primary'} tl-lock-btn`}
            onClick={toggleWeekLock}
            title={weekLock ? `Locked by ${weekLock.locked_by}` : 'Lock this week so employees can no longer edit it'}
          >
            {weekLock ? '🔒 Week locked — Unlock' : '🔓 Lock this week'}
          </button>
        </div>
      )}
      {weekLock && (tab === 'pending' || tab === 'history') && (
        <p className="tl-lock-note">
          This pay period is locked — employees can&apos;t edit these hours. You can still adjust any entry (the employee is notified).
          {/* What it held when you closed it, and what has moved since. A closed week that has
              quietly gained three entries looks exactly like one that has not, and the difference is
              a payout. Says nothing at all for a period closed before snapshots were recorded —
              inventing the figure by re-totalling today is what the snapshot exists to prevent. */}
          {(() => {
            // `periodLogs`, not `logs` — the snapshot counted the whole period, so the comparison
            // has to as well. See the note on `periodLogs`.
            const line = describeSnapshot(weekLock, periodLogs.length);
            const late = countLateEntries(periodLogs, weekLocks);
            return (
              <>
                {line && <> <strong>{line}</strong></>}
                {late > 0 && (
                  <> {late} {late === 1 ? 'entry' : 'entries'} arrived after the close — they belong to this week but will be paid in the next payout.</>
                )}
              </>
            );
          })()}
          {/* S7 — closing a week and paying for it were two unconnected acts, so "did we ever pay
              the week we closed?" could only be answered by comparing dates by eye. */}
          {weekLock.payout_batch_id ? (
            <> <a href={`/admin/payouts/runs/${weekLock.payout_batch_id}`}>See the payout this close prepared →</a></>
          ) : (
            <>
              {' '}
              <button
                type="button"
                className="tl-btn tl-btn--sm"
                onClick={preparePayoutForWeek}
                disabled={preparingPayout}
              >
                {preparingPayout ? 'Preparing…' : 'Prepare the payout'}
              </button>
            </>
          )}
        </p>
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
            // Same rule as the page total, and the same rule `computeHoursFlags` below already used —
            // the per-employee heading was the third number on this screen disagreeing with the other two.
            const empTotal = empLogs.reduce((s, l) => s + effectiveHours(l), 0);
            // Same rule as the page total: the decision wins over the rules' figure.
            const empPay = empLogs.reduce((s, l) => s + (decidedPay(l) ?? 0), 0);
            const empFlags = computeHoursFlags(empLogs);
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
                    {/* The running balance, so approving is done with the whole picture in view.
                        Rendered only when it loaded — an absent balance says nothing, which is
                        better than a zero that reads as "paid up". */}
                    {owedByEmail[email] && (
                      <span
                        className={`tl-employee-group__owed ${owedByEmail[email].owedCents < 0 ? 'tl-employee-group__owed--over' : ''}`}
                        title={owedByEmail[email].statement}
                      >
                        {owedByEmail[email].owedCents < 0
                          ? `overpaid ${formatCurrency(-owedByEmail[email].owedCents / 100)}`
                          : `${formatCurrency(owedByEmail[email].owedCents / 100)} owed`}
                      </span>
                    )}
                  </div>
                </div>

                {/* H5 — conflict/totals flags so an admin spots missed clock-outs,
                    suspect period totals, and unresolved entries at a glance. */}
                {empFlags.length > 0 && (
                  <div className="tl-employee-group__flags">
                    {empFlags.map((f, i) => (
                      <span key={i} className={`tl-flag tl-flag--${f.kind}`}>&#9888; {f.message}</span>
                    ))}
                  </div>
                )}

                {empLogs.map((log) => {
                  const wt = workTypes.find((w) => w.work_type === log.work_type);
                  const isSelected = selected.has(log.id);
                  return (
                    <div key={log.id} data-focus-id={log.id} className={`tl-approval-entry ${isSelected ? 'tl-approval-entry--selected' : ''}`}>
                      {(log.status === 'pending' || log.status === 'disputed') && (
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(log.id)} className="tl-approval-entry__check" />
                      )}
                      <div className="tl-approval-entry__main">
                        <div className="tl-approval-entry__top">
                          <span className="tl-approval-entry__icon">{wt?.icon || '📋'}</span>
                          <span className="tl-approval-entry__type">{activityLabel(log.work_type, wt?.label)}</span>
                          <span className="tl-approval-entry__date">{formatDate(log.log_date)}</span>
                          {/* The headline is the hours that COUNT, so the row agrees with both totals.
                              When they differ, the submitted figure is shown struck through beside it
                              rather than hidden — an approver needs to see what the employee claimed as
                              well as what was allowed, and quietly replacing the number would erase the
                              only evidence that a change was made. */}
                          <span className="tl-approval-entry__hours">
                            {log.adjusted_hours != null && log.adjusted_hours !== log.hours && (
                              <s className="tl-approval-entry__hours-was" title={`Employee submitted ${log.hours}h`}>{log.hours}h</s>
                            )}
                            {effectiveHours(log)}h
                          </span>
                          <span className="tl-badge" style={{ backgroundColor: `${STATUS_COLORS[log.status] || '#6B7280'}20`, color: STATUS_COLORS[log.status] || '#6B7280' }}>
                            {log.status}
                          </span>
                          {/* Beside the status, not buried in the meta line below it. An office-entered
                              day is `approved` from birth, so on a list of approved days the status
                              badge alone cannot tell you which ones the employee never submitted. */}
                          {log.entered_by && (
                            <span className="tl-badge tl-badge--office" title={`Entered by ${log.entered_by} — not submitted by the employee`}>
                              office
                            </span>
                          )}
                        </div>
                        <div className="tl-approval-entry__desc">{log.description}</div>
                        {/* "The employee claimed this" and "the office recorded this" are different
                            assertions about the same hours, and a pay dispute turns on which. */}
                        {log.entered_by && (
                          <div className="tl-approval-entry__meta">Entered by {log.entered_by} — not submitted by the employee</div>
                        )}
                        {/* Arrived after its own week was closed off. The running-balance model pays
                            it in the next payout either way; this is what makes the event visible,
                            so a closed week can be told apart from one that has moved since. */}
                        {(() => {
                          const late = detectLateEntry(log, weekLocks);
                          return late.isLate ? (
                            <div className="tl-approval-entry__meta">⏱ {late.note}</div>
                          ) : null;
                        })()}
                        {log.job_name && <div className="tl-approval-entry__meta">Job: {log.job_name}</div>}
                        {log.notes && <div className="tl-approval-entry__meta">Notes: {log.notes}</div>}
                        {log.rejection_reason && <div className="tl-approval-entry__rejection">Rejection: {log.rejection_reason}</div>}
                        {log.adjustment_note && (
                          <div className="tl-approval-entry__adjustment">
                            Adjusted {log.hours}h → <strong>{log.adjusted_hours ?? log.hours}h</strong>: {log.adjustment_note}
                          </div>
                        )}
                        {log.status === 'disputed' && (
                          <div className="tl-approval-entry__dispute">
                            &#9888; Disputed by employee — resolve with Approve, Adjust, or Reject{log.notes ? `: ${log.notes}` : ''}
                          </div>
                        )}

                        {/* Rate breakdown */}
                        {log.effective_rate && (
                          <div className="tl-approval-entry__rate-breakdown">
                            Base: {formatCurrency(log.base_rate || 0)} + Role: {formatCurrency(log.role_bonus || 0)} + Seniority: {formatCurrency(log.seniority_bonus || 0)} + Creds: {formatCurrency(log.credential_bonus || 0)} = <strong>{formatCurrency(log.effective_rate)}/hr</strong>
                            {log.total_pay && <> | Total: <strong>{formatCurrency(log.total_pay)}</strong></>}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {(log.status === 'pending' || log.status === 'disputed') ? (
                        <div className="tl-approval-entry__actions">
                          <button className="tl-btn tl-btn--sm tl-btn--primary" onClick={() => singleAction(log.id, 'approve')}>Approve</button>
                          <button className="tl-btn tl-btn--sm" onClick={() => setPayLogId(log.id)}>Set pay</button>
                          <button className="tl-btn tl-btn--sm" onClick={() => singleAction(log.id, 'adjust')}>Adjust</button>
                          <button className="tl-btn tl-btn--sm tl-btn--danger" onClick={() => singleAction(log.id, 'reject')}>Reject</button>
                        </div>
                      ) : (
                        // Already approved/adjusted/rejected: an admin can still
                        // revise any employee's hours (with a reason; they're
                        // notified). H3 of the hours-correction plan.
                        <div className="tl-approval-entry__actions">
                          {/* Approve was MISSING here, which stranded every adjusted entry.
                              `adjust` sets the status to 'adjusted', which is not 'pending', so the row
                              fell into this branch and lost the Approve button — the approver could
                              re-adjust forever but never finish. The API never had this restriction;
                              only the UI did.
                              Offered whenever the entry is not already approved, which also lets a
                              rejection be reversed — a correction the API likewise always allowed. */}
                          {log.status !== 'approved' && (
                            <button className="tl-btn tl-btn--sm tl-btn--primary" onClick={() => singleAction(log.id, 'approve')}>Approve</button>
                          )}
                          {/* Pay stays revisable after approval — a payroll correction is a normal
                              event, and the decision keeps its own history either way. */}
                          <button className="tl-btn tl-btn--sm" onClick={() => setPayLogId(log.id)}>Set pay</button>
                          <button className="tl-btn tl-btn--sm" onClick={() => singleAction(log.id, 'adjust')}>Adjust</button>
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
                    <span className={`tl-badge ${
                      adv.status === 'denied' || adv.status === 'cancelled' ? 'tl-badge--rejected'
                        : adv.status === 'pending' ? 'tl-badge--pending'
                        : 'tl-badge--approved'
                    }`}>
                      {adv.status}
                    </span>
                    {adv.status === 'pending' && (
                      <div className="tl-advance-card__actions">
                        <button className="tl-btn tl-btn--sm tl-btn--primary" onClick={() => approveAdvance(adv.id)}>Approve</button>
                        <button className="tl-btn tl-btn--sm tl-btn--danger" onClick={() => denyAdvance(adv.id)}>Deny</button>
                      </div>
                    )}
                    {adv.status === 'approved' && (
                      <div className="tl-advance-card__actions">
                        <button className="tl-btn tl-btn--sm tl-btn--primary" onClick={() => markAdvancePaid(adv.id)}>Mark paid</button>
                      </div>
                    )}
                    {adv.status === 'paid' && (adv.outstanding ?? 0) > 0 && (
                      <span className="tl-advance-card__balance">
                        {formatCurrency(adv.outstanding ?? 0)} still to recover
                      </span>
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

      {/* Set-pay modal. Mounted here, next to the action modal, so the "Set pay" buttons above
          actually open something — an unmounted modal is this codebase's most common defect. */}
      {payLogId && (
        <PayDecisionModal
          timeLogId={payLogId}
          onClose={() => setPayLogId(null)}
          onSaved={loadData}
        />
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
                  <label>Reason for adjustment (required)</label>
                  <textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Explain the adjustment..." rows={2} />
                </div>
                <p className="tl-modal__hint">The employee is notified of this change and your reason.</p>
              </>
            )}
            <div className="tl-modal__actions">
              <button className="tl-btn" onClick={() => setActionModal(null)}>Cancel</button>
              {/* Adjusting is almost always followed by approving — the correction IS the decision. Two
                  buttons rather than one so the approver can still adjust and leave it for later (e.g.
                  to check something before committing the pay), but the common path is one click.
                  `Adjust & approve` is the primary because it is the one that finishes the job. */}
              {actionModal.type === 'adjust' && (
                <button className="tl-btn" onClick={() => submitAction(false)}>Adjust only</button>
              )}
              <button className="tl-btn tl-btn--primary" onClick={() => submitAction(true)}>
                {actionModal.type === 'reject' ? 'Reject' : 'Adjust & approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log hours for an employee. Same endpoint the employee's own timesheet posts to. */}
      {showEntryForm && (
        <div className="tl-modal-overlay" onClick={() => setShowEntryForm(false)}>
          <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add hours for an employee</h3>
            <div className="tl-form-group">
              <label htmlFor="entry-who">Whose hours</label>
              <select
                id="entry-who"
                value={entryForm.user_email}
                onChange={(e) => setEntryForm({ ...entryForm, user_email: e.target.value })}
              >
                <option value="">Choose an employee…</option>
                {staff.map((s) => (
                  <option key={s.email} value={s.email}>{s.name ? `${s.name} — ${s.email}` : s.email}</option>
                ))}
              </select>
            </div>
            <div className="tl-form-group">
              <label htmlFor="entry-date">Date</label>
              <input
                id="entry-date" type="date" value={entryForm.log_date}
                onChange={(e) => setEntryForm({ ...entryForm, log_date: e.target.value })}
              />
            </div>
            <div className="tl-form-group">
              <label htmlFor="entry-hours">Hours</label>
              <input
                id="entry-hours" type="number" min="0.25" max="24" step="0.25" value={entryForm.hours}
                onChange={(e) => setEntryForm({ ...entryForm, hours: e.target.value })}
                placeholder="8"
              />
            </div>
            <div className="tl-form-group">
              <label htmlFor="entry-activity">Activity (optional)</label>
              <select
                id="entry-activity"
                value={entryForm.work_type}
                onChange={(e) => setEntryForm({ ...entryForm, work_type: e.target.value })}
              >
                {/* Optional on purpose, matching the employee's own form: leaving it blank prices
                    the day at the person's base pay rather than forcing a rate to be chosen now. */}
                <option value="">No activity — pay at their base rate</option>
                {workTypes.map((w) => (
                  <option key={w.work_type} value={w.work_type}>{w.label ?? w.work_type}</option>
                ))}
              </select>
            </div>
            <div className="tl-form-group">
              <label htmlFor="entry-desc">What was the work</label>
              <input
                id="entry-desc" type="text" value={entryForm.description}
                onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
                placeholder="Boundary survey on the Henry tract"
              />
            </div>
            <div className="tl-form-group">
              <label htmlFor="entry-notes">Notes (optional)</label>
              <textarea
                id="entry-notes" rows={2} value={entryForm.notes}
                onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                placeholder="Why the office is entering this"
              />
            </div>
            {entryError && <p className="tl-modal__hint" role="alert">{entryError}</p>}
            {/* Both consequences stated before the button, because neither is obvious: the entry
                does not go into anybody's approval queue, and the employee finds out. */}
            <p className="tl-modal__hint">
              Entered by you, so it is approved immediately — it will not appear in the pending
              queue. The employee is notified, with the hours and what they were priced at.
            </p>
            <div className="tl-modal__actions">
              <button className="tl-btn" onClick={() => setShowEntryForm(false)} disabled={entrySaving}>Cancel</button>
              <button className="tl-btn tl-btn--primary" onClick={submitEntryForEmployee} disabled={entrySaving}>
                {entrySaving ? 'Saving…' : 'Add entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
