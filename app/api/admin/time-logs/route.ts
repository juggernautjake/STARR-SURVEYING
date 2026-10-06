// app/api/admin/time-logs/route.ts — Daily time log CRUD + pay calculation
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { findRecentDuplicate } from '@/lib/hours/duplicate-submission';
import { auditStamp, deleteTimeLogAudited } from '@/lib/hours/audit';
import { resolveHoursCaller } from '@/lib/hours/caller';
import { notify } from '@/lib/notifications';
import {
  buildHoursDecisionNotifications,
  buildHoursAdjustmentNotification,
} from '@/lib/notifications/hours-decision';
import { buildHoursEnteredForYouNotification } from '@/lib/notifications/hours-entered-for-you';
import { isDateLocked } from '@/lib/hours/period-lock';
import { canEmployeeEdit, canEmployeeDelete } from '@/lib/hours/permissions';
import { loadPayConfig, loadPersonPayFacts, rateFor } from '@/lib/payroll/pay-context';
import { UNSPECIFIED_WORK_TYPE } from '@/lib/payroll/resolve-rate';
import {
  buildHoursSubmittedNotifications,
  canDecideHours,
  approversWhoWantThis,
  type HoursNotifyPreference,
} from '@/lib/notifications/hours-submitted';

const LOCKED_MSG =
  'That pay period is locked. Ask a manager to adjust these hours — they can revise locked entries.';

// ── THE FOURTH COPY OF THE PAY FORMULA, RETIRED (owner request, 2026-08-04) ──────────────────
//
// *"We need one central consolidated model for all payments."*
//
// This file used to carry ~127 lines of private `getPayConfig` + `calculateEffectiveRate`: the
// fourth independent implementation of "what does this hour cost", and the one that actually
// stamped a rate onto submitted hours. It differed from the designed model in ways nobody could
// see from the outside:
//
//   • It matched a tier with `.eq('role_key', profile.job_title)` and **no alias bridge**, so a
//     profile reading 'survey_technician' matched no row in `role_tiers` (whose key is
//     'survey_tech') and silently lost its $6/hr role bonus.
//   • It ignored `user_pay_overrides` entirely, so a person on a pinned custom rate had their
//     hours logged at the formula rate anyway.
//   • It never consulted `employee_profiles.hourly_rate`, so an agreed $25 could be logged at the
//     $16 driving rate.
//   • It issued six sequential queries per entry, so a five-line timesheet was thirty round-trips.
//
// It is now `lib/payroll/resolve-rate.ts` through `lib/payroll/pay-context.ts`, the same call the
// rate picker and the approval screen make. See the header of `resolve-rate.ts` for the model.

// GET: List time logs — employees see own, admins see all (with filters)
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await resolveHoursCaller(req); // web session, or the mobile app's Supabase token
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const status = searchParams.get('status');
  // `auto` = this week. The hub's "hours this week" feed has always asked for it, and
  // `new Date('auto')` threw — dozens of "Invalid time value" 500s in error_reports.
  const weekStartRaw = searchParams.get('week_start');
  const weekStart = weekStartRaw === 'auto' ? currentMondayCentral() : weekStartRaw;

  const admin = isAdmin(session.user.roles);
  const self = session.user.email.toLowerCase();

  // ── DATES ARE CHECKED, NOT TRUSTED (2026-10-05) ──────────────────────────────────────────────
  //
  // `new Date('garbage').toISOString()` throws RangeError, and error_reports held dozens of
  // "Invalid time value" 500s from exactly that line. A bad date is the caller's mistake: say so
  // with a 400 rather than failing the whole page.
  for (const [name, value] of [['week_start', weekStart], ['date_from', dateFrom], ['date_to', dateTo]] as const) {
    if (value && !isIsoDate(value)) {
      return NextResponse.json({ error: `${name} must be YYYY-MM-DD` }, { status: 400 });
    }
  }

  // Non-admins can only view their own
  if (!admin && email && email.toLowerCase() !== self) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = supabaseAdmin
    .from('daily_time_logs')
    .select('*')
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });

  // ── `mine=1`: A PERSONAL VIEW IS PERSONAL, EVEN FOR AN ADMIN (2026-10-05) ────────────────────
  //
  // An admin calling this with no `email` gets every employee's rows — right for the approval
  // queue, and catastrophic for "My time", whose edit form deleted every pending row it had loaded
  // for a date before re-posting the day. On 2026-10-03 that erased four of another employee's
  // clock-outs. A personal screen now says so, and the server scopes it to the caller regardless of
  // role.
  const mine = searchParams.get('mine') === '1';
  // Emails are stored lowercased (see the insert below); compare that way so a mixed-case session
  // address does not quietly match nothing.
  const targetEmail = mine || !admin ? self : email?.toLowerCase();
  if (targetEmail) query = query.eq('user_email', targetEmail);

  if (dateFrom) query = query.gte('log_date', dateFrom);
  if (dateTo) query = query.lte('log_date', dateTo);
  // `status` accepts a single value or a comma list (e.g. "pending,disputed")
  // so the review queue can pull everything that needs an admin decision.
  if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
    query = statuses.length > 1 ? query.in('status', statuses) : query.eq('status', statuses[0]);
  }
  if (weekStart) {
    // Pure calendar arithmetic in UTC on a date with no time — no server time zone can move it.
    query = query.gte('log_date', weekStart).lte('log_date', addDaysIso(weekStart, 6));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The activity list, from the model rather than straight off the table. It matters because
  // `work_type_rates.base_rate` is meaningless for a `rate_mode = 'base'` activity — field work
  // pays the person's own rate, and the $20 in that column is never paid to anybody. A raw select
  // would hand that $20 to the client as though it were a price.
  const { workTypes } = await loadPayConfig();

  // ── ATTACH WHAT WAS ACTUALLY DECIDED ────────────────────────────────────────────────────────
  //
  // `daily_time_logs.total_pay` is what the rules priced the entry at when it was submitted. When
  // an approver has since decided otherwise — a split across rates, a flat amount, part of the day
  // left undecided — that decision lives in `time_log_pay_decisions`, and it is the number the
  // employee is actually being paid.
  //
  // Returning only the submitted figure would show somebody a total that is not what is going into
  // their pay, which is worse than showing nothing. Both are returned, so a screen can say "paid
  // $200, standard rates would have been $244" and the payout note that explains the difference —
  // *"the boss can add notes to the payout… if they want to make any explanations for why the pay
  // is what it is."*
  const logs = (data ?? []) as { id: string }[];
  let decisions: Record<string, unknown>[] = [];
  if (logs.length > 0) {
    const { data: rows, error: decisionError } = await supabaseAdmin
      .from('time_log_pay_decisions')
      .select('time_log_id, blocks, total_pay, undecided_hours, payout_note, decided_by, decided_at')
      .in('time_log_id', logs.map((l) => l.id));
    // Named, not swallowed: the hours themselves are still worth returning, but a caller that
    // silently sees no decisions would render every entry as though nobody had decided anything.
    if (decisionError) console.error('[time-logs] could not read pay decisions:', decisionError.message);
    decisions = (rows ?? []) as Record<string, unknown>[];
  }

  const byLog = new Map(decisions.map((d) => [d.time_log_id as string, d]));

  return NextResponse.json({
    logs: logs.map((log) => ({ ...log, pay_decision: byLog.get(log.id) ?? null })),
    work_types: workTypes || [],
  });
}, { routeName: 'time-logs' });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** This week's Monday on the business's calendar (Texas). `week_start=auto` asks for it. */
function currentMondayCentral(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` that is also a real calendar date. */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Add whole days to a `YYYY-MM-DD`, in UTC so the answer never depends on where the server is. */
function addDaysIso(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// POST: Submit daily time log entries
/** A reported lunch, or null when there is nothing to record.
 *
 *  The column's CHECK refuses anything over 8 hours (seeds/650) — a typo guard, since the realistic
 *  mistake is 45 typed into a box somebody thinks is hours. Clamping HERE as well means a bad value
 *  from an old client is stored as "not recorded" rather than failing the whole insert and taking
 *  the day's hours down with it. The hours are the thing that matters; the lunch is a note on them.
 */
function cleanLunch(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 480) return null;
  return n;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await resolveHoursCaller(req); // web session, or the mobile app's Supabase token
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { entries, user_email: forEmail, replace_ids: replaceIdsRaw } = body as {
    entries: Array<{
      log_date: string;
      work_type?: string | null;
      hours: number;
      job_id?: string;
      job_name?: string;
      description: string;
      notes?: string;
      role_on_job?: string | null;
      /** Minutes at lunch, reported at clock-out. See seeds/650: recorded, never deducted. */
      lunch_minutes?: number | null;
      /** A key the device made when this entry was created. A retry of the same clock-out carries
       *  the same key, and the second arrival returns the first row instead of making another. */
      client_submission_id?: string | null;
      /** Activity tags chosen at clock-in/out. Stored (uuid[]); invalid ids are dropped, never fatal. */
      activity_tag_ids?: string[] | null;
    }>;
    /** Whose timesheet these belong to. Admin only — see below. */
    user_email?: string;
    /**
     * Rows this submission REPLACES — the "edit my day and resubmit" flow.
     *
     * Previously the browser deleted the old rows itself and then posted the new ones, so a post
     * that failed left the day empty, and a form that had been handed another person's rows
     * deleted theirs too (2026-10-03). Now the server inserts first, then removes only rows that
     * belong to the same person as the new entries — never anybody else's.
     */
    replace_ids?: string[];
  };

  if (!entries || !entries.length) {
    return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
  }

  // ── LOGGING HOURS FOR SOMEBODY ELSE (owner request, 2026-08-12) ────────────────────────────────
  //
  // *"The employer will also be able to log hours for employees and create entries setting the hours
  // and pay for the employee."*
  //
  // This route had exactly one insert and it hard-coded the session's own email, so there was no way
  // for the office to record a crew member's day at all. `user_email` is now accepted — and is the
  // most dangerous field on this route, because a request that names somebody else writes into their
  // pay. So the check is explicit and fails closed: without `admin`, naming another person is
  // REFUSED rather than quietly ignored. Silently falling back to the caller's own timesheet would
  // put hours somewhere nobody looked for them.
  const actingAsAdmin = isAdmin(session.user.roles);
  const targetEmail = (forEmail ?? '').trim().toLowerCase() || session.user.email.toLowerCase();
  const onBehalf = targetEmail !== session.user.email.toLowerCase();
  if (onBehalf && !actingAsAdmin) {
    return NextResponse.json(
      { error: 'Only an admin can log hours for somebody else.' },
      { status: 403 },
    );
  }
  if (onBehalf) {
    // A typo'd address would create a timesheet for a person who does not exist, which nobody would
    // ever see and which would still be counted by anything summing hours by email.
    const { data: target } = await supabaseAdmin
      .from('registered_users')
      .select('email')
      .ilike('email', targetEmail)
      .maybeSingle();
    if (!target) {
      return NextResponse.json(
        { error: `No account for ${targetEmail}. Pick the employee from the list.` },
        { status: 400 },
      );
    }
  }

  // Validate total hours per date don't exceed 24
  const hoursByDate = new Map<string, number>();
  for (const e of entries) {
    // ── work_type IS NO LONGER REQUIRED (owner request, 2026-08-04) ─────────────────────────
    //
    // *"We should also be able to submit the hours without any payment option and the boss can
    // decide what is fair."*
    //
    // Requiring an activity forced everybody to pick a rate at submission time — which is the
    // moment they know least about how the day should be paid, and the least authority to decide.
    // An entry with no activity is now legitimate: it resolves to the person's agreed base pay, or
    // to `unset` if they have none, and lands in front of whoever approves it either way.
    if (!e.log_date || !e.hours || !e.description) {
      return NextResponse.json({ error: 'Each entry needs log_date, hours, and description' }, { status: 400 });
    }
    if (e.hours <= 0 || e.hours > 24) {
      return NextResponse.json({ error: 'Hours must be between 0 and 24' }, { status: 400 });
    }
    hoursByDate.set(e.log_date, (hoursByDate.get(e.log_date) || 0) + e.hours);
  }
  for (const [date, total] of hoursByDate) {
    if (total > 24) {
      return NextResponse.json({ error: `Total hours for ${date} exceed 24 (${total})` }, { status: 400 });
    }
  }

  // Employees can't submit/resubmit hours into a locked pay period.
  if (!actingAsAdmin) {
    for (const date of hoursByDate.keys()) {
      if (await isDateLocked(date)) {
        return NextResponse.json({ error: LOCKED_MSG }, { status: 423 });
      }
    }
  }

  // Config and the submitter's facts are read ONCE for the whole timesheet, not once per entry per
  // table. The retired inline calculator did six sequential queries per entry.
  const payConfig = await loadPayConfig();
  // The EMPLOYEE's pay facts, not the submitter's. An admin entering a crew member's day must price
  // it at that crew member's rate — using the session's own would pay everybody the office manager's
  // wage, which is the exact class of bug that only shows up on payday.
  const payFacts = await loadPersonPayFacts(targetEmail, payConfig);

  // Which of these days ALREADY had entries — read before the insert, because after it every day
  // has one. This is what makes "Jane updated 8h" honest rather than a guess: the employee edit
  // flow re-submits a whole day, so the question is "did we just replace something", not "was this
  // an UPDATE statement".
  const { data: priorRows } = await supabaseAdmin
    .from('daily_time_logs')
    .select('id, log_date, hours, description, job_id, created_at')
    .eq('user_email', targetEmail)
    .in('log_date', [...hoursByDate.keys()]);
  const prior = (priorRows ?? []) as Array<{
    id: string; log_date: string; hours: number | null;
    description: string | null; job_id: string | null; created_at: string;
  }>;
  const existingDates = new Set(prior.map((r) => r.log_date));

  // ── THE SAME DAY CANNOT BE SUBMITTED TWICE IN A ROW (2026-08-24) ─────────────────────────────
  //
  // `daily_time_logs` held two identical 7.56-hour rows for one person and one day, created 3.2
  // seconds apart, both reading "Clock-out entry from top-bar pill". Nobody worked fifteen hours:
  // the clock-out button stayed live for the whole round-trip and was pressed twice.
  //
  // That button is now guarded, and this is the layer that matters anyway. A UI guard cannot stop
  // a fetch the browser retried, a second tab, an offline queue flushing twice, or the next
  // surface somebody writes. This route is insert-only with no unique constraint behind it, so
  // the second copy of a day was always going to be accepted by whoever asked twice.
  //
  // The rule itself lives in `lib/hours/duplicate-submission.ts` — testable without a database,
  // and shared so the route's SUPPRESSION and the review queue's duplicate FLAG cannot drift into
  // disagreeing about what a duplicate is.
  // Rows being replaced are about to go, so they are not "already submitted" — otherwise an
  // unchanged resubmission would be echoed as a duplicate of the very row it is replacing, and then
  // that row would be deleted, leaving nothing.
  const replaceIds = new Set(
    (Array.isArray(replaceIdsRaw) ? replaceIdsRaw : []).filter((x): x is string => typeof x === 'string' && x.length > 0),
  );
  const priorForDuplicates = prior.filter((r) => !replaceIds.has(r.id));

  const actor = session.user.email.toLowerCase();
  const insertAction = onBehalf ? 'entered_by_office' : replaceIds.size > 0 ? 'resubmitted' : 'submitted';

  const nowMs = Date.now();
  const results = [];
  let duplicatesSuppressed = 0;
  for (const entry of entries) {
    // ── THE SAME CLOCK-OUT, ARRIVING AGAIN ───────────────────────────────────────────────────
    // A device that saved a clock-out while offline retries it until it is acknowledged. If the
    // first attempt landed but the reply was lost, the retry finds the row by its key.
    const clientKey = typeof entry.client_submission_id === 'string' && entry.client_submission_id.trim()
      ? entry.client_submission_id.trim().slice(0, 120)
      : null;
    if (clientKey) {
      const { data: already } = await supabaseAdmin
        .from('daily_time_logs')
        .select('*')
        .eq('client_submission_id', clientKey)
        .maybeSingle();
      if (already) {
        duplicatesSuppressed += 1;
        results.push(already);
        continue;
      }
    }

    const echo = findRecentDuplicate(priorForDuplicates, entry, nowMs);
    if (echo) {
      duplicatesSuppressed += 1;
      console.warn('[admin/time-logs] suppressed a duplicate submission', {
        user_email: targetEmail, log_date: entry.log_date, hours: entry.hours, existing_id: echo.id,
      });
      results.push(echo);
      continue;
    }

    const resolved = rateFor(payFacts, payConfig, { workType: entry.work_type });

    const { data, error } = await supabaseAdmin
      .from('daily_time_logs')
      .insert({
        user_email: targetEmail,
        // NULL for a self-submitted entry — see seed 585. "The employee claimed this" and "the
        // office recorded this" are different assertions about the same eight hours, and a wage
        // dispute turns on which one it was.
        entered_by: onBehalf ? session.user.email : null,
        log_date: entry.log_date,
        // NOT NULL in the schema, so an entry with no activity is stored as the explicit sentinel
        // rather than as an empty string. 'unspecified' matches no row in `work_type_rates`, which
        // is exactly what makes it resolve to base pay.
        work_type: entry.work_type || UNSPECIFIED_WORK_TYPE,
        hours: entry.hours,
        // ── A JOB NUMBER IS NOT A JOB ID (2026-10-05) ────────────────────────────────────────
        // The clock-in modal takes a free-text job number, and it arrived here as `job_id` — a
        // uuid column. "26159" failed the insert with a 500 and the clock-out was lost. Anything
        // that is not a uuid is kept as the job's NAME instead, so the hours always save and the
        // number is still on the row for whoever approves it.
        job_id: isUuid(entry.job_id) ? entry.job_id : null,
        job_name: entry.job_name || (entry.job_id && !isUuid(entry.job_id) ? String(entry.job_id).slice(0, 200) : null),
        description: entry.description,
        notes: entry.notes || null,
        // ── LUNCH (owner, 2026-09-19) ─────────────────────────────────────────────────────────
        // "whenever they log out, they should have the option of recording how long their lunch
        // time was … they can revize the payment to account for the time spent at lunch."
        //
        // Recorded, never subtracted — `hours` above is untouched. seeds/650 has the argument.
        //
        // NULL and 0 are different answers and both survive: NULL is "nobody was asked", which is
        // every office-entered row and every row before today; 0 is "asked, none taken". A `|| null`
        // would collapse the second into the first, so the check is explicit.
        lunch_minutes: cleanLunch(entry.lunch_minutes),
        // An admin entering hours IS the approver. Making them go and approve their own entry is
        // ceremony that produces a queue item nobody needs to look at — and a `pending` row the
        // employee could then edit, which would let them silently rewrite what the office recorded.
        status: onBehalf ? 'approved' : 'pending',
        approved_by: onBehalf ? session.user.email : null,
        approved_at: onBehalf ? new Date().toISOString() : null,
        // The bonus columns stay NULL. Under the simple model there are no bonuses to record —
        // an hour is worth the person's base pay or the activity's set rate, and nothing is
        // stacked. Writing 0 into them would draw a "+ $0.00 seniority" line on every screen that
        // reads this row, which is a graduated system pretending to be present.
        base_rate: resolved.rate,
        role_bonus: null,
        seniority_bonus: null,
        credential_bonus: null,
        effective_rate: resolved.rate,
        // Null, not zero, when no rate is set. A zero here would total into a pay period as
        // "worked for free" instead of "waiting on a decision", and the difference is somebody's
        // wages.
        total_pay: resolved.rate === null ? null : Math.round(resolved.rate * entry.hours * 100) / 100,
        client_submission_id: clientKey,
        // Were sent by every clock surface and dropped here until 2026-10-05. Only well-formed ids
        // are kept: a bad tag must never be the reason somebody's hours fail to save.
        activity_tag_ids: Array.isArray(entry.activity_tag_ids)
          ? (entry.activity_tag_ids.filter(isUuid).slice(0, 50) as string[])
          : null,
        // Who did this, for the hours history (seeds/664).
        ...auditStamp(actor, insertAction),
      })
      .select()
      .single();

    if (error) {
      // Two retries of one clock-out racing each other: the unique key let exactly one in. The
      // loser returns the winner's row — the hours are saved, once.
      if (clientKey && (error as { code?: string }).code === '23505') {
        const { data: winner } = await supabaseAdmin
          .from('daily_time_logs')
          .select('*')
          .eq('client_submission_id', clientKey)
          .maybeSingle();
        if (winner) { duplicatesSuppressed += 1; results.push(winner); continue; }
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Added to the same list the echo check reads, so two identical entries inside ONE request
    // collapse as well. A double-submit is the common case; a client looping over an array it
    // built twice is the same defect arriving by a different road.
    if (data) priorForDuplicates.push({
      id: data.id, log_date: data.log_date, hours: data.hours,
      description: data.description, job_id: data.job_id,
      created_at: data.created_at ?? new Date().toISOString(),
    });
    results.push(data);
  }

  // ── NOW, AND ONLY NOW, REMOVE WHAT WAS REPLACED ──────────────────────────────────────────────
  //
  // Every new row is saved before any old one goes, so a failure anywhere above leaves the old day
  // intact. And a row is removed only if it belongs to the SAME person as the new entries: many
  // people log the same date, and one person's resubmission must never touch another's hours —
  // whatever ids a confused or stale form sends.
  let replaced = 0;
  const replaceRefused: string[] = [];
  const keptIds = new Set(results.map((r) => (r as { id?: string } | null)?.id).filter(Boolean));
  for (const id of replaceIds) {
    if (keptIds.has(id)) continue; // a retry echoed this very row back — it is the new day now
    const { data: old } = await supabaseAdmin
      .from('daily_time_logs')
      .select('id, user_email, status, log_date')
      .eq('id', id)
      .maybeSingle();
    if (!old) continue; // already gone
    const sameOwner = String(old.user_email).toLowerCase() === targetEmail;
    const editable = actingAsAdmin || canEmployeeDelete(old.status);
    const locked = !actingAsAdmin && (await isDateLocked(old.log_date));
    if (!sameOwner || !editable || locked) {
      replaceRefused.push(id);
      console.warn('[admin/time-logs] refused to replace a row', {
        id, by: actor, row_owner: old.user_email, target: targetEmail, status: old.status,
      });
      continue;
    }
    const { error: delError } = await deleteTimeLogAudited(id, actor, 'replaced');
    if (delError) replaceRefused.push(id); else replaced += 1;
  }

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'time_logs_submitted',
      entity_type: 'daily_time_logs',
      entity_id: results[0]?.id,
      metadata: { count: results.length, dates: [...hoursByDate.keys()] },
    });
  } catch { /* ignore */ }

  // ── TELL WHOEVER APPROVES HOURS (owner request, 2026-08-05) ─────────────────────────────────
  //
  // *"When employees submit their hours or update their hours, whoever is in charge of handling
  // approving hours will get a notification where they can be linked to see the submitted hours."*
  //
  // Notifications ran one way only: approve/reject/adjust told the employee. Nothing told anybody
  // hours had ARRIVED, so a timesheet sat in `pending` until somebody happened to open the approval
  // page. An unwatched queue is the same defect as everything else here — an absence that looks
  // like nothing to do.
  //
  // One bell per approver per DAY submitted, carrying the hours, what the pay model made of them,
  // and a link that opens on this person's pending entries rather than on a generic queue.
  //
  // Best-effort throughout: a notification failure must never fail somebody's timesheet.
  //
  // Not sent when the office entered these hours: the row is already approved by the person who
  // created it, so "these hours need your decision" would point every admin at a decision that has
  // already been made. The employee is told instead, immediately below.
  try {
    const { data: approverRows } = onBehalf ? { data: [] } : await supabaseAdmin
      .from('registered_users')
      .select('email, roles')
      .contains('roles', ['admin']);

    const canDecide = ((approverRows ?? []) as { email: string; roles: string[] | null }[])
      .filter((u) => canDecideHours(u.roles))
      .map((u) => u.email);

    // Narrowed to the people who want it. Five admins means five bells for one crew member's
    // Tuesday, and a stream somebody has learned to ignore stops working for the one person who
    // did want it. Opt-OUT: a missing row means notify, so nobody is silently switched off.
    const { data: prefRows } = await supabaseAdmin
      .from('hours_notification_preferences')
      .select('user_email, notify_on_submit, only_for_emails')
      .in('user_email', canDecide);

    const approvers = approversWhoWantThis(
      canDecide,
      session.user.email,
      (prefRows ?? []) as HoursNotifyPreference[],
    );

    if (approvers.length > 0) {
      const submitterName = payFacts.name;

      // Grouped by date: a day submitted as four entries is one act by one person.
      for (const [logDate, hours] of hoursByDate) {
        const forDate = results.filter((r) => (r as { log_date: string }).log_date === logDate) as Array<{
          total_pay: number | null; hours: number; effective_rate: number | null;
        }>;

        const priced = forDate.filter((r) => r.total_pay !== null);
        const unpricedHours = forDate
          .filter((r) => r.total_pay === null)
          .reduce((sum, r) => sum + Number(r.hours || 0), 0);

        for (const n of buildHoursSubmittedNotifications(
          {
            employeeEmail: session.user.email,
            employeeName: submitterName,
            logDate,
            totalHours: Math.round(hours * 100) / 100,
            totalPayDollars: priced.length
              ? Math.round(priced.reduce((sum, r) => sum + Number(r.total_pay || 0), 0) * 100) / 100
              : null,
            unpricedHours: Math.round(unpricedHours * 100) / 100,
            entryCount: forDate.length,
            // Resubmission when this day already had entries before this request. The employee
            // edit flow deletes and re-inserts, so "did we just replace something" is the honest
            // question rather than "is this an UPDATE".
            isResubmission: existingDates.has(logDate),
          },
          approvers,
        )) {
          await notify(n);
        }
      }
    }
  } catch (err) {
    console.error('[time-logs] could not notify approvers of the submission:', err instanceof Error ? err.message : String(err));
  }

  // ── TELL THE EMPLOYEE, WHEN THE OFFICE ENTERED IT ─────────────────────────────────────────────
  //
  // The one write to a timesheet the owner did not make, arriving already approved. Without this,
  // hours and a rate appear on somebody's pay with nothing saying when, by whom, or that it happened
  // — and the person most likely to spot that it is wrong is the one who worked the day.
  if (onBehalf) {
    try {
      for (const [logDate, hours] of hoursByDate) {
        const forDate = results.filter((r) => (r as { log_date: string }).log_date === logDate) as Array<{
          total_pay: number | null;
        }>;
        const priced = forDate.filter((r) => r.total_pay !== null);
        const n = buildHoursEnteredForYouNotification({
          employeeEmail: targetEmail,
          enteredBy: session.user.email,
          logDate,
          hours: Math.round(hours * 100) / 100,
          // Null when nothing on the day has a rate — not zero. See the builder.
          payDollars: priced.length
            ? Math.round(priced.reduce((sum, r) => sum + Number(r.total_pay || 0), 0) * 100) / 100
            : null,
          entryCount: forDate.length,
        });
        if (n) await notify(n);
      }
    } catch (err) {
      console.error('[time-logs] could not tell the employee about an office-entered day:', err instanceof Error ? err.message : String(err));
    }
  }

  // `duplicates_suppressed` is reported rather than hidden. A client that submitted twice gets a
  // success carrying the rows that exist — which is the truth — and anything watching this route can
  // tell a genuine save from a swallowed retry without diffing the table.
  return NextResponse.json({
    logs: results,
    duplicates_suppressed: duplicatesSuppressed,
    replaced,
    replace_refused: replaceRefused,
  }, { status: 201 });
}, { routeName: 'time-logs' });

// PUT: Update a time log (employee can edit pending, admin can approve/reject/adjust)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, action, ...updates } = body as {
    id: string;
    action?: 'approve' | 'reject' | 'adjust' | 'dispute';
    hours?: number;
    description?: string;
    notes?: string;
    rejection_reason?: string;
    adjustment_note?: string;
    adjusted_hours?: number;
  };

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Fetch existing log
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('daily_time_logs')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Log not found' }, { status: 404 });

  const admin = isAdmin(session.user.roles);

  // Admin approval actions
  if (action && admin) {
    const decision = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'adjust' ? 'adjusted' : 'disputed';
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...auditStamp(session.user.email, decision),
    };

    if (action === 'approve') {
      updateData.status = 'approved';
      updateData.approved_by = session.user.email;
      updateData.approved_at = new Date().toISOString();
    } else if (action === 'reject') {
      updateData.status = 'rejected';
      updateData.approved_by = session.user.email;
      updateData.approved_at = new Date().toISOString();
      updateData.rejection_reason = updates.rejection_reason || 'Rejected by admin';
    } else if (action === 'adjust') {
      updateData.status = 'adjusted';
      updateData.approved_by = session.user.email;
      updateData.approved_at = new Date().toISOString();
      updateData.adjustment_note = updates.adjustment_note || '';
      updateData.adjusted_hours = updates.adjusted_hours;
      // Recalculate pay with adjusted hours.
      //
      // ── NULL, NOT ZERO — AND NOT `|| 0` ────────────────────────────────────────────────────────
      //
      // This was `(existing.effective_rate || 0) * updates.adjusted_hours`, which turned an entry
      // nobody had priced yet into one worth exactly $0.00. The creation path a few hundred lines up
      // gets this right and says why: *"a zero here would total into a pay period as 'worked for
      // free' instead of 'waiting on a decision', and the difference is somebody's wages."*
      //
      // The consequence was not cosmetic. In `lib/payroll/owed.ts` a `payDollars` of 0 is finite, so
      // it takes the PRICED branch: the hours move into `paidHours`, leave `undecidedHours`, and the
      // one sentence that would have surfaced them — "9h are approved but not yet priced" — stops
      // printing. The person is never paid for that day and nothing says so.
      //
      // Rounded for the same reason the creation path rounds: 25.5 × 7.1 is 181.04999999999998 in
      // floating point, and a NUMERIC column should not be storing that.
      if (updates.adjusted_hours) {
        const rate = existing.effective_rate;
        updateData.total_pay = rate === null || rate === undefined
          ? null
          : Math.round(Number(rate) * updates.adjusted_hours * 100) / 100;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('daily_time_logs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await supabaseAdmin.from('activity_log').insert({
        user_email: session.user.email,
        action_type: `time_log_${action}`,
        entity_type: 'daily_time_logs',
        entity_id: id,
        metadata: { employee: existing.user_email, action },
      });
    } catch { /* ignore */ }

    // Notify the employee of the decision. Single-entry approve/reject/adjust
    // previously sent nothing (only the bulk approve route notified); adjust in
    // particular must tell the worker the new hours + reason. Best-effort — a
    // notification failure must not fail the decision.
    try {
      if (action === 'adjust') {
        const n = buildHoursAdjustmentNotification({
          user_email: existing.user_email,
          log_date: existing.log_date,
          original_hours: existing.hours,
          adjusted_hours: updates.adjusted_hours,
          reason: updates.adjustment_note,
        });
        if (n) await notify(n);
      } else if (action === 'approve' || action === 'reject') {
        // `data`, not `existing`. `existing` is the row as it was BEFORE this update, so its
        // `rejection_reason` is whatever the last rejection said — usually null. Passing it would
        // have quietly produced a rejection notice with no reason on it, which is exactly the
        // failure this notification was widened to fix. The bulk route already gets this right
        // because it notifies from its own `.select()`.
        const [n] = buildHoursDecisionNotifications([data ?? existing], action === 'approve');
        if (n) await notify(n);
      }
    } catch { /* ignore notification failures */ }

    return NextResponse.json({ log: data });
  }

  // Employee dispute
  if (action === 'dispute' && String(existing.user_email).toLowerCase() === session.user.email.toLowerCase()) {
    const { data, error } = await supabaseAdmin
      .from('daily_time_logs')
      .update({
        status: 'disputed',
        notes: updates.notes || existing.notes,
        updated_at: new Date().toISOString(),
        ...auditStamp(session.user.email, 'disputed'),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ log: data });
  }

  // Employee editing their own pending entry
  if (String(existing.user_email).toLowerCase() !== session.user.email.toLowerCase() && !admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!admin && !canEmployeeEdit(existing.status)) {
    return NextResponse.json({ error: 'Can only edit pending or rejected entries' }, { status: 400 });
  }
  if (!admin && (await isDateLocked(existing.log_date))) {
    return NextResponse.json({ error: LOCKED_MSG }, { status: 423 });
  }

  const editUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    ...auditStamp(session.user.email, 'edited'),
  };
  if (updates.hours !== undefined) editUpdates.hours = updates.hours;
  if (updates.description !== undefined) editUpdates.description = updates.description;
  if (updates.notes !== undefined) editUpdates.notes = updates.notes;

  // If hours changed, recalculate. Same rule as the adjust path above — null stays null, because a
  // zero is a decision that the work was worth nothing, and nobody made that decision here.
  if (updates.hours !== undefined) {
    const rate = existing.effective_rate;
    editUpdates.total_pay = rate === null || rate === undefined
      ? null
      : Math.round(Number(rate) * updates.hours * 100) / 100;
    editUpdates.status = 'pending'; // re-submit for approval
  }

  const { data, error } = await supabaseAdmin
    .from('daily_time_logs')
    .update(editUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data });
}, { routeName: 'time-logs' });

// DELETE: Remove a pending/rejected time log (employee own, or admin any)
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('daily_time_logs')
    // `log_date` too: the lock check below reads it, and without it every check asked about
    // `undefined` and answered "not locked".
    .select('user_email, status, log_date')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const admin = isAdmin(session.user.roles);
  if (!admin && String(existing.user_email).toLowerCase() !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Employees may remove their own pending OR rejected logs — a rejected
  // log is theirs to fix (the my-hours "edit & resubmit" flow deletes the
  // old editable rows and re-creates them). Approved/adjusted/disputed logs
  // are locked and can only be changed by an admin.
  if (!admin && !canEmployeeDelete(existing.status)) {
    return NextResponse.json({ error: 'Can only delete pending or rejected entries' }, { status: 400 });
  }
  if (!admin && (await isDateLocked(existing.log_date))) {
    return NextResponse.json({ error: LOCKED_MSG }, { status: 423 });
  }

  // Recorded with who did it, and the whole row kept, so it can be restored from Hours history.
  const { error } = await deleteTimeLogAudited(id, session.user.email, 'deleted');
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'time-logs' });
