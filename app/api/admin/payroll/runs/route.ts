// app/api/admin/payroll/runs/route.ts — Payroll runs & pay stubs, READ-ONLY HISTORY
//
// This is the retired payroll engine. It still answers GET (historical runs, and the stubs that
// record payments actually made) and PUT (an existing draft must still be finishable or
// cancellable), but POST is closed — see the note above it. New payroll is a payout batch:
// `/admin/payouts`, `POST /api/admin/payroll/pay-owed`, `/api/cron/payout-prepare`.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { buildPayStubNotification } from '@/lib/notifications/payout';

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

// ── POST: CLOSED. This engine no longer creates work (S9c, 2026-08-18) ────────────────────────
//
// D2 (2026-08-12) decided that `payout_batches` + `payout_batch_items` is the surviving payroll
// engine and that `payroll_runs` + `pay_stubs` becomes **read-only history**. This is the step that
// makes that true: new payroll is prepared at `/admin/payouts` (by hand via
// `POST /api/admin/payroll/pay-owed`, or weekly by `/api/cron/payout-prepare`), and nothing creates
// a `payroll_runs` row any more.
//
// ── WHY IT WAS SAFE TO CLOSE THIS, AND WHY IT WAS NOT BEFORE ─────────────────────────────────────
//
// Closing this door was tried FIRST, on 2026-08-12, and was wrong — `planAdvanceRecovery` was called
// in exactly one place in the whole codebase, and that place was the body of this handler. Retiring
// it then would have silently stopped the firm ever recovering a pay advance again. Nothing would
// have failed; the money would just have stopped coming back.
//
// Everything that only lived here has since been re-homed, and each has a guard test in
// `__tests__/payroll/one-pay-model.test.ts` that fails if it goes missing again:
//
//   advance recovery   → `pay-owed` and `cron/payout-prepare`, both writing a `pay_advance_repayments`
//                        row per (advance, payout item), and withholding via `recovered_cents`
//                        rather than netting `total_cents` (S9a′, seed 588).
//   crediting a balance→ already on the batch path: an `account`-method item marked paid
//                        (`lib/payroll/account-credit.ts`). S5 decided approval must NOT credit.
//   a wage statement   → `lib/payroll/payment-statement.ts`, built from figures that exist.
//
// ── AND WHAT DELIBERATELY DID NOT MOVE: THE TAX LINES ────────────────────────────────────────────
//
// This engine withheld flat ESTIMATES (12% federal, 6.2% SS, 1.45% medicare) and paid net; the
// surviving one withholds nothing and pays gross, with W-2/1099 classification handled downstream by
// a tax preparer. So `pay_stubs` generation was NOT ported (S9b): it would print "Federal Tax
// −$120.00" and a net figure on a document an employee is entitled to, while the payment they
// actually received was the gross amount. Whether the firm should be withholding at all is an
// accountant's decision, not this codebase's — and until it is answered, inventing the figures is
// the one thing that must not happen. `lib/payroll/pay-stub.ts` is kept, uncalled and tested, for
// exactly that decision, the same way `effective-rate.ts` is kept for the parked progression system.
//
// ── 410, NOT 404 OR A SILENT SUCCESS ─────────────────────────────────────────────────────────────
//
// 410 Gone says the route existed, is deliberately retired, and is not coming back — a 404 would
// read as a typo or a broken deploy and send somebody looking for a bug. The message names where
// payroll happens now, because an error that only says "no" leaves the person who has to pay
// somebody this week with nowhere to go.
//
// GET and PUT stay. Historical runs and their stubs are records of payments actually made, and an
// existing draft must still be finishable or cancellable by somebody.
export const POST = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  return NextResponse.json({
    error:
      'Payroll runs are no longer created here. This engine is retired and kept for history only — '
      + 'pay is now prepared as a payout batch, which is the path with dispatch methods, an approval, '
      + 'ACH export, void and employee-visible history. Go to /admin/payouts and prepare a payout for '
      + 'what is owed; the weekly cron does the same thing on a timer.',
    where: '/admin/payouts',
  }, { status: 410 });
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
    // ── A RUN WITH NO STUBS CANNOT BE COMPLETED (found in a browser, 2026-08-18) ────────────────
    //
    // The live database holds exactly one payroll run: a draft over a 2019 period, created
    // 2026-08-13, reading "2 employees · Gross $200.00 · Net $160.70" — with **zero `pay_stubs`
    // rows behind it**, and zero approved hours anywhere in that week. Where its totals came from
    // is not recoverable; that they describe nobody is.
    //
    // Pressing "Complete & Credit Balances" on it would have credited nothing (the loop below has
    // nothing to iterate) and flipped the row to `completed` — leaving a record that reads, on
    // every screen and in every report, as a payroll of $160.70 that was paid. That is this
    // document's recurring failure exactly: an empty result wearing the clothes of a finished one.
    // The POST side already refused to CREATE such a run; nothing refused to complete one.
    //
    // Cancelling it is still allowed, and is what should happen to this row.
    const { count: stubCount } = await supabaseAdmin
      .from('pay_stubs')
      .select('id', { count: 'exact', head: true })
      .eq('payroll_run_id', id);

    if (!stubCount) {
      return NextResponse.json({
        error: 'This run has no pay stubs, so completing it would credit nobody while recording a '
             + 'payroll that happened. Cancel it instead — and prepare a payout at /admin/payouts, '
             + 'which is where pay is settled now.',
        where: '/admin/payouts',
      }, { status: 409 });
    }

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
