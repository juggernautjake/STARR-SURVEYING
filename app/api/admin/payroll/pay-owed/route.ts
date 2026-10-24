// app/api/admin/payroll/pay-owed/route.ts
//
// PAY WHAT IS OWED
// ════════════════
//
// *"We can also set scheduled payouts… that will pay approved hours, or we can just do a random
// payout at anytime."*
//
//   GET   — a preview: who is owed what, and what a batch would contain. Changes nothing.
//   POST  — build the batch.
//
// This is the "random payout at anytime" half. The scheduled half (H-13) will call the same code on
// a timer, because a scheduled payout and an ad-hoc one differ only in what triggered them — and a
// second implementation is how the pay formula reached four copies.
//
// ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────────────
//
// **It does not move money.** It creates a `payout_batches` draft with one line per person. The
// money leaves when somebody dispatches it — uploads the ACH CSV to the bank, sends the Venmo,
// writes the cheque — and marks the line paid. Every method in the vocabulary carries
// `sendsItself: false`, and this route is the reason that flag is honest.
//
// A draft nonetheless COMMITS the money: `loadOwed` subtracts committed payouts, so the balance
// falls the moment the batch exists. That is deliberate. If drafts did not count, pressing the
// button twice would build two batches for the same hours and somebody would be paid double.

// ── SINCE 2026-10-11 ───────────────────────────────────────────────────────────────────────────
//
// The line-building moved to lib/payouts/build-batch.ts, shared with the Friday cron, and each line is
// now resolved against the firm's payout settings (lib/payouts/routing.ts): the method actually used
// (choice → default → fallback), its fee, and — when nothing works — the reason, so the preview shows
// exactly what Commit will do.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { disbursedCents } from '@/lib/payroll/disbursement';
import { planOwedBatch, createOwedBatch } from '@/lib/payouts/build-batch';
import { describePolicy } from '@/lib/payouts/routing';

// GET: what a batch would contain. Changes nothing.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const only = new URL(req.url).searchParams.getAll('email');
  const { plan, error } = await planOwedBatch(only);
  if (error || !plan) return NextResponse.json({ error: `No preview — ${error}` }, { status: 500 });

  return NextResponse.json({
    lines: plan.lines.map(({ recoveries: _r, ...l }) => ({ ...l, disbursed_cents: disbursedCents(l) })),
    skipped: plan.skipped,
    // What the bank account actually pays once advances and fees are held back. Distinct from
    // `totalCents`, which is what the batch SETTLES — see lib/payroll/disbursement.ts.
    disbursedCents: plan.disbursedCents,
    recoveredCents: plan.recoveredCents,
    feeCents: plan.feeCents,
    totalCents: plan.totalCents,
    policy: describePolicy(plan.policy),
    blocked: plan.blocked,
    // Kept for older screens: people who cannot be paid yet.
    missingMethod: plan.blocked.map((b) => b.user_email),
  });
}, { routeName: 'payroll/pay-owed' });

// POST: build the batch.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const only: string[] = Array.isArray(body.emails) ? body.emails : [];
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  const today = new Date().toISOString().slice(0, 10);

  const { created, error, status, skipped } = await createOwedBatch({
    only,
    label: label ?? `Approved hours through ${today}`,
    notes,
    createdBy: session.user.email,
    repaymentNote: `Recovered from the payout prepared ${today}`,
  });
  if (!created) return NextResponse.json({ error, ...(skipped ? { skipped } : {}) }, { status: status ?? 500 });
  const { batch, plan } = created;

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'payout_batch_from_hours',
      entity_type: 'payout_batches',
      entity_id: batch.id,
      metadata: { lines: plan.lines.length, total_cents: plan.totalCents, fee_cents: plan.feeCents, skipped: plan.skipped.length, blocked: plan.blocked.length },
    });
  } catch { /* ignore */ }

  // Tell each person their pay is queued — not that it has arrived. The NET figure in the title: what
  // will actually reach them after any advance repayment or method fee.
  for (const line of plan.lines) {
    const withheld: string[] = [];
    if (line.recovered_cents > 0) withheld.push(`$${(line.recovered_cents / 100).toFixed(2)} goes against your pay advance`);
    if (line.fee_cents > 0 && line.fee_note) withheld.push(line.fee_note.replace(/\.$/, ''));
    try {
      await notify({
        user_email: line.user_email,
        type: 'payout_queued',
        title: `$${(disbursedCents(line) / 100).toFixed(2)} queued for payment`,
        body: withheld.length
          ? `Your approved hours came to $${(line.total_cents / 100).toFixed(2)}; ${withheld.join('; ')}. You will see it here when it goes out.`
          : 'Your approved hours are in a payout that has been prepared. You will see it here when it goes out.',
        link: '/admin/pay?tab=my-pay',
        source_type: 'payout_batches',
        source_id: batch.id,
      });
    } catch { /* a notification failure must not undo a payout */ }
  }

  return NextResponse.json({
    batch,
    lines: plan.lines.length,
    totalCents: plan.totalCents,
    feeCents: plan.feeCents,
    skipped: plan.skipped,
    blocked: plan.blocked,
    missingMethod: plan.blocked.map((b) => b.user_email),
  }, { status: 201 });
}, { routeName: 'payroll/pay-owed' });
