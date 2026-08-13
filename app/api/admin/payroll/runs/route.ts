// app/api/admin/payroll/runs/route.ts — Payroll runs & pay stubs
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { buildPayStubNotification } from '@/lib/notifications/payout';
import { buildStubTotals, type PayableHours } from '@/lib/payroll/pay-stub';
import { planAdvanceRecovery, type OutstandingAdvance } from '@/lib/payroll/advance-recovery';
import { findPeriodOverlap, type ExistingSettlement } from '@/lib/payroll/engine-overlap';

interface TimeLogRow {
  id: string;
  user_email: string;
  log_date: string;
  work_type: string;
  hours: number;
  adjusted_hours: number | null;
  job_id: string | null;
  job_name: string | null;
  effective_rate: number | null;
  status: string;
}

interface DecisionRow {
  time_log_id: string;
  blocks: Array<{ hours: number; rate: number | null; work_type: string | null }>;
  total_pay: number;
  total_hours: number;
  undecided_hours: number;
}

// GET: List payroll runs or get specific run with stubs
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('id');
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  if (runId) {
    // Get specific run with pay stubs
    if (!isAdmin(session.user.roles)) {
      // Non-admin: only their own stub
      const { data: stub } = await supabaseAdmin
        .from('pay_stubs')
        .select('*')
        .eq('payroll_run_id', runId)
        .eq('user_email', session.user.email)
        .single();

      return NextResponse.json({ stub });
    }

    const { data: run } = await supabaseAdmin
      .from('payroll_runs')
      .select('*')
      .eq('id', runId)
      .single();

    const { data: stubs } = await supabaseAdmin
      .from('pay_stubs')
      .select('*')
      .eq('payroll_run_id', runId)
      .order('user_name');

    return NextResponse.json({ run, stubs: stubs || [] });
  }

  // List runs
  if (!isAdmin(session.user.roles)) {
    // Non-admin: list their pay stubs
    const { data: stubs, error } = await supabaseAdmin
      .from('pay_stubs')
      .select('*')
      .eq('user_email', session.user.email)
      .order('pay_period_end', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ stubs: stubs || [] });
  }

  const { data, error } = await supabaseAdmin
    .from('payroll_runs')
    .select('*')
    .order('pay_period_end', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data || [] });
}, { routeName: 'payroll/runs' });

// POST: Create a new payroll run (admin only)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { pay_period_start, pay_period_end, notes } = body;

  if (!pay_period_start || !pay_period_end) {
    return NextResponse.json({ error: 'pay_period_start and pay_period_end required' }, { status: 400 });
  }

  // ── HAS THIS WEEK ALREADY BEEN SETTLED? ───────────────────────────────────────────────────────
  //
  // Two payroll engines exist here and neither reads anything the other writes: this one, and
  // `payout_batches`. Both take the same approved hours as input, so a week paid by a batch on
  // Friday can be paid again by a run on Monday and nothing objects — the second engine simply does
  // what it was asked. `owed.ts` protects the running balance from over-payment; it does not stop
  // the second settlement being created, because neither engine consults it before building.
  //
  // See `lib/payroll/engine-overlap.ts` for why this is a period check rather than a row-level one:
  // neither engine records which time logs a payment covered.
  {
    const [{ data: runRows }, { data: batchRows }] = await Promise.all([
      supabaseAdmin
        .from('payroll_runs')
        .select('id, pay_period_start, pay_period_end, status')
        .lte('pay_period_start', pay_period_end)
        .gte('pay_period_end', pay_period_start),
      supabaseAdmin
        .from('payout_batches')
        .select('id, label, week_start, week_end, status')
        .lte('week_start', pay_period_end)
        .gte('week_end', pay_period_start),
    ]);

    const existing: ExistingSettlement[] = [
      ...((runRows ?? []) as Array<{ id: string; pay_period_start: string | null; pay_period_end: string | null; status: string }>)
        .map((r) => ({ id: r.id, kind: 'payroll_run' as const, from: r.pay_period_start, to: r.pay_period_end, status: r.status })),
      ...((batchRows ?? []) as Array<{ id: string; label: string | null; week_start: string | null; week_end: string | null; status: string }>)
        .map((b) => ({ id: b.id, kind: 'payout_batch' as const, from: b.week_start, to: b.week_end, status: b.status, label: b.label })),
    ];

    const overlap = findPeriodOverlap({ from: pay_period_start, to: pay_period_end }, existing);
    if (!overlap.ok) {
      // 409, not 400: the request is well-formed and the state is what refuses it.
      return NextResponse.json({ error: overlap.message, conflicts: overlap.conflicts }, { status: 409 });
    }
  }

  // Get all active employees
  const { data: employees } = await supabaseAdmin
    .from('employee_profiles')
    .select('*')
    .eq('is_active', true);

  if (!employees || employees.length === 0) {
    return NextResponse.json({ error: 'No active employees found' }, { status: 400 });
  }

  // ── APPROVED HOURS, PRICED BY THE ONE MODEL (pay consolidation, 2026-08-04) ─────────────────
  //
  // This engine used to read `job_time_entries` — a table with zero rows, and no relationship to
  // where hours are actually logged, which is `daily_time_logs`. So a payroll run produced a stub
  // of 0 hours for everybody and reported success. **An empty result read as a completed payroll.**
  //
  // It also computed its own rate: `hourly_rate + certBump + roleAdj`, off
  // `employee_certifications.pay_bump_amount` and `role_pay_adjustments`, sharing no table with any
  // other rate in the platform. Both of those belong to the parked progression system, so a stub
  // could pay a credential bump nobody is offered any more.
  //
  // Now: only APPROVED hours, at the rate already agreed for them — the approver's decision where
  // one exists, otherwise what the pay model resolved when the hours were submitted. Nothing is
  // re-derived here, so a stub cannot disagree with the screen the employee was shown.
  const { data: timeLogs, error: logsError } = await supabaseAdmin
    .from('daily_time_logs')
    .select('id, user_email, log_date, work_type, hours, adjusted_hours, job_id, job_name, effective_rate, status')
    .eq('status', 'approved')
    .gte('log_date', pay_period_start)
    .lte('log_date', pay_period_end);

  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 });

  // The approver's decisions for those entries. Where one exists it is what is being paid; the
  // rate stamped on the log is only what the rules said before anybody looked at it.
  const logIds = (timeLogs ?? []).map((l: { id: string }) => l.id);
  let decisions: DecisionRow[] = [];
  if (logIds.length > 0) {
    const { data: rows, error: decisionError } = await supabaseAdmin
      .from('time_log_pay_decisions')
      .select('time_log_id, blocks, total_pay, total_hours, undecided_hours')
      .in('time_log_id', logIds);
    // Refused rather than swallowed. Running payroll on the pre-decision figures would pay people
    // amounts an approver had explicitly overridden, and the stub would look perfectly normal.
    if (decisionError) {
      return NextResponse.json(
        { error: `Could not read the pay decisions for this period, so payroll was not run: ${decisionError.message}` },
        { status: 500 },
      );
    }
    decisions = (rows ?? []) as DecisionRow[];
  }
  const decisionByLog = new Map(decisions.map((d) => [d.time_log_id, d]));

  // Overtime settings, from the same config the rest of the platform reads.
  const { data: configRows } = await supabaseAdmin.from('pay_system_config').select('key, value');
  const config: Record<string, number> = {};
  for (const row of (configRows ?? []) as { key: string; value: number }[]) config[row.key] = Number(row.value);
  const overtimeThreshold = Number.isFinite(config.overtime_threshold_weekly) ? config.overtime_threshold_weekly : 40;
  const overtimeMultiplier = Number.isFinite(config.overtime_multiplier) ? config.overtime_multiplier : 1.5;

  // ── ADVANCES COME BACK OUT (C-17) ───────────────────────────────────────────────────────────
  //
  // The view is already filtered to advances that were actually PAID and still have a balance.
  // Approving is a decision and paying is an event; recovering against an approved-but-unpaid
  // advance would take back money that was never handed over.
  const { data: outstandingRows, error: advanceError } = await supabaseAdmin
    .from('pay_advances_outstanding')
    .select('id, user_email, outstanding, repay_per_period, paid_at, reason');

  // Refused, not skipped. Running payroll while blind to what people owe pays out money the firm
  // has already advanced, and the stubs would look entirely normal.
  if (advanceError) {
    return NextResponse.json(
      { error: `Could not read outstanding pay advances, so payroll was not run: ${advanceError.message}` },
      { status: 500 },
    );
  }

  const advancesByEmail = new Map<string, OutstandingAdvance[]>();
  for (const row of (outstandingRows ?? []) as (OutstandingAdvance & { user_email: string })[]) {
    const list = advancesByEmail.get(row.user_email) ?? [];
    list.push(row);
    advancesByEmail.set(row.user_email, list);
  }
  // Every recovery this run will make, applied only once the stubs exist and have ids.
  const pendingRecoveries: Array<{ userEmail: string; advanceId: string; amount: number }> = [];

  // Create payroll run
  const { data: run, error: runError } = await supabaseAdmin
    .from('payroll_runs')
    .insert({
      pay_period_start,
      pay_period_end,
      status: 'draft',
      processed_by: session.user.email,
      notes,
      employee_count: employees.length,
    })
    .select()
    .single();

  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  // Generate pay stubs for each employee
  const stubs = [];
  let totalGross = 0;
  let totalNet = 0;

  for (const emp of employees) {
    const employee = emp as { user_email: string; user_name: string | null };
    const mine = (timeLogs ?? []).filter((l: TimeLogRow) => l.user_email === employee.user_email) as TimeLogRow[];

    // Flatten to priced hours. A decision may split one entry across several rates, so one log can
    // yield several payable rows — which is exactly why the split is stored rather than blended.
    const payable: PayableHours[] = [];
    for (const log of mine) {
      const decision = decisionByLog.get(log.id);
      const hours = log.adjusted_hours != null ? Number(log.adjusted_hours) : Number(log.hours);

      if (decision && Array.isArray(decision.blocks) && decision.blocks.length > 0) {
        for (const block of decision.blocks) {
          payable.push({
            hours: Number(block.hours),
            rate: block.rate === null || block.rate === undefined ? null : Number(block.rate),
            workType: block.work_type ?? log.work_type,
            jobId: log.job_id,
            jobName: log.job_name,
            logDate: log.log_date,
          });
        }
        continue;
      }

      payable.push({
        hours,
        rate: log.effective_rate === null || log.effective_rate === undefined ? null : Number(log.effective_rate),
        workType: log.work_type,
        jobId: log.job_id,
        jobName: log.job_name,
        logDate: log.log_date,
      });
    }

    const totals = buildStubTotals({ entries: payable, overtimeThreshold, overtimeMultiplier });

    // Recovery comes out of NET, after tax — an advance is money already handed over, not a
    // pre-tax deduction. Taking it from gross would reduce the tax withheld on wages the person
    // genuinely earned.
    const recovery = planAdvanceRecovery({
      advances: advancesByEmail.get(employee.user_email) ?? [],
      netPay: totals.netPay,
    });
    for (const r of recovery.recoveries) {
      pendingRecoveries.push({ userEmail: employee.user_email, advanceId: r.advanceId, amount: r.amount });
    }

    stubs.push({
      payroll_run_id: run.id,
      user_email: employee.user_email,
      user_name: employee.user_name,
      pay_period_start,
      pay_period_end,
      regular_hours: totals.regularHours,
      overtime_hours: totals.overtimeHours,
      // The blended rate the period actually ran at. Null when nothing was paid, rather than 0,
      // which would read as "worked at no rate" instead of "worked no paid hours".
      base_rate: totals.regularRate,
      overtime_rate: totals.regularRate === null ? null : Math.round(totals.regularRate * overtimeMultiplier * 100) / 100,
      // Both belong to the parked progression system. NULL, not 0: a zero draws a "+ $0.00 role
      // adjustment" line on the stub, which is a system pretending to be present.
      role_adjustment: null,
      cert_adjustment: null,
      effective_rate: totals.regularRate,
      gross_pay: totals.grossPay,
      federal_tax: totals.federalTax,
      state_tax: totals.stateTax,
      social_security: totals.socialSecurity,
      medicare: totals.medicare,
      total_deductions: totals.totalDeductions,
      // Kept separate from the tax deductions above. An advance recovery is not a deduction from
      // earnings; it is the repayment of a loan, and rolling it into `total_deductions` would make
      // the tax figures on the stub wrong.
      other_deductions: recovery.totalRecovered || null,
      deduction_notes: recovery.note,
      net_pay: recovery.netAfterRecovery,
      job_hours: totals.jobHours,
      // Hours that were approved but never priced. On the stub so "why is this short" has an
      // answer, and so they are visibly owed rather than quietly gone.
      metadata: totals.unpaidHours > 0 ? { unpaid_hours: totals.unpaidHours } : null,
    });

    totalGross += totals.grossPay;
    totalNet += recovery.netAfterRecovery;
  }

  // Insert all stubs
  let insertedStubs: { id: string; user_email: string }[] = [];
  if (stubs.length > 0) {
    const { data: written, error: stubError } = await supabaseAdmin
      .from('pay_stubs')
      .insert(stubs)
      .select('id, user_email');

    if (stubError) return NextResponse.json({ error: stubError.message }, { status: 500 });
    insertedStubs = (written ?? []) as { id: string; user_email: string }[];
  }

  // ── Record the recoveries, now that the stubs have ids ──────────────────────────────────────
  //
  // Written AFTER the stubs and linked to them, so every repayment names the cheque it came out of.
  // A running total on the advance alone could not answer "which pay period took this", and could
  // not be reversed if a run is voided.
  //
  // The unique index on (advance_id, pay_stub_id) is what makes a re-run safe: a retry cannot
  // double-deduct, and the only evidence of a double deduction would have been a short cheque.
  if (pendingRecoveries.length > 0) {
    const stubIdByEmail = new Map(insertedStubs.map((s) => [s.user_email, s.id]));

    const rows = pendingRecoveries.map((r) => ({
      advance_id: r.advanceId,
      pay_stub_id: stubIdByEmail.get(r.userEmail) ?? null,
      user_email: r.userEmail,
      amount: r.amount,
      note: `Recovered on the ${pay_period_start} – ${pay_period_end} payroll run.`,
    }));

    const { error: repayError } = await supabaseAdmin.from('pay_advance_repayments').insert(rows);

    if (repayError) {
      // The stubs are already written and already show the reduced net. Leaving the advances
      // un-decremented would mean the same money is recovered again next period — the employee
      // pays twice. Say so loudly rather than returning a success the numbers do not support.
      console.error('[payroll/runs] recoveries were deducted but NOT recorded:', repayError.message);
      return NextResponse.json({
        error: 'The stubs were created, but the advance repayments could not be recorded. ' +
               'Void this run before processing it — otherwise the same advance will be recovered again next period.',
        run_id: run.id,
      }, { status: 500 });
    }

    // Move the balance on each advance, and close out any that are now fully repaid.
    for (const r of pendingRecoveries) {
      const { data: current } = await supabaseAdmin
        .from('pay_advance_requests')
        .select('amount, repaid_amount')
        .eq('id', r.advanceId)
        .maybeSingle();
      if (!current) continue;

      const row = current as { amount: number; repaid_amount: number };
      const repaid = Math.round((Number(row.repaid_amount) + r.amount) * 100) / 100;
      await supabaseAdmin
        .from('pay_advance_requests')
        .update({
          repaid_amount: repaid,
          // Only once it is genuinely clear. A rounding cent left behind would otherwise keep an
          // advance open forever, so the comparison allows for it.
          ...(repaid >= Number(row.amount) - 0.005 ? { status: 'repaid' } : {}),
        })
        .eq('id', r.advanceId);
    }
  }

  // Update run totals
  await supabaseAdmin
    .from('payroll_runs')
    .update({
      total_gross: Math.round(totalGross * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
      total_deductions: Math.round((totalGross - totalNet) * 100) / 100,
    })
    .eq('id', run.id);

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'payroll_run_created',
      entity_type: 'payroll_run',
      entity_id: run.id,
      metadata: { pay_period_start, pay_period_end, employee_count: employees.length, total_gross: totalGross },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ run: { ...run, total_gross: totalGross, total_net: totalNet }, stub_count: stubs.length }, { status: 201 });
}, { routeName: 'payroll/runs' });

// PUT: Update payroll run status (process/complete/cancel)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { id, status, notes } = body;
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });

  const validStatuses = ['draft', 'processing', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status };
  if (notes) updates.notes = notes;

  // If completing: credit employee balances
  if (status === 'completed') {
    const { data: stubs } = await supabaseAdmin
      .from('pay_stubs')
      .select('*')
      .eq('payroll_run_id', id)
      .eq('disbursement_status', 'pending');

    if (stubs && stubs.length > 0) {
      for (const stub of stubs) {
        const s = stub as { id: string; user_email: string; net_pay: number; pay_period_start: string; pay_period_end: string };
        // Get current balance
        const { data: profile } = await supabaseAdmin
          .from('employee_profiles')
          .select('available_balance, total_earned')
          .eq('user_email', s.user_email)
          .single();

        const balanceBefore = profile?.available_balance || 0;
        const balanceAfter = balanceBefore + s.net_pay;

        // Create balance transaction
        await supabaseAdmin.from('balance_transactions').insert({
          user_email: s.user_email,
          transaction_type: 'credit_payroll',
          amount: s.net_pay,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `Payroll credit for period`,
          reference_type: 'pay_stub',
          reference_id: s.id,
          status: 'completed',
          processed_at: new Date().toISOString(),
        });

        // Update employee balance
        await supabaseAdmin
          .from('employee_profiles')
          .update({
            available_balance: balanceAfter,
            total_earned: (profile?.total_earned || 0) + s.net_pay,
          })
          .eq('user_email', s.user_email);

        // Mark stub as credited
        await supabaseAdmin
          .from('pay_stubs')
          .update({ disbursement_status: 'credited', credited_at: new Date().toISOString() })
          .eq('id', s.id);

        // notifications-completeness-pass Slice 2 — the employee gets
        // a bell notification telling them the stub is ready + the
        // amount has been credited. Link to /admin/my-pay.
        const notice = buildPayStubNotification({
          user_email: s.user_email,
          net_pay: s.net_pay,
          pay_period_start: s.pay_period_start,
          pay_period_end: s.pay_period_end,
        });
        if (notice) await notify(notice);
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('payroll_runs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ run: data });
}, { routeName: 'payroll/runs' });
