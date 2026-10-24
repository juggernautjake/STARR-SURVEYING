// app/api/cron/payout-prepare/route.ts
//
// SCHEDULED PAYOUT PREPARATION
// ════════════════════════════
//
// *"We can also set scheduled payouts from the linked business bank account too that will pay
// approved hours, or we can just do a random payout at anytime."*
//
// H-13 of HOURS_TO_PAYOUT_2026-08-05, and the half of that sentence a cron can honestly do.
//
// ── IT PREPARES. IT DOES NOT PAY. ───────────────────────────────────────────────────────────────
//
// There is no bank integration. The rail is an ACH CSV the office uploads to PNC, so nothing in
// this repository can move money on a timer. What this does is build the **draft batch** from
// approved, unpaid hours and tell the admins it is ready — turning "remember to run payroll on
// Friday" into "payroll is sitting there waiting for you on Friday".
//
// A cron that claimed to have paid people would be the worst version of the defect this whole
// codebase keeps finding: a screen saying money moved when it did not. Every notification below
// says *prepared*, and the batch is a `draft` until a human dispatches it.
//
// ── WHY IT REUSES THE AD-HOC PATH ───────────────────────────────────────────────────────────────
//
// A scheduled payout and a hand-pressed one differ only in what triggered them. The balance, the
// skip rules, the missing-method handling and the "queued, not paid" notification are all identical
// — so this calls the same `loadOwed` the ad-hoc route and the approval queue use. A second
// implementation is exactly how the pay formula reached four copies.
//
// Vercel cron config (vercel.json):
//   { "path": "/api/cron/payout-prepare", "schedule": "0 13 * * 5" }
//   UTC. 13:00 UTC = 8am CST on Friday — a batch waiting when the office opens, with the working
//   day still ahead to send it.
//
// Auth: Authorization: Bearer <CRON_SECRET>.
//
// Idempotent in the way that matters: `loadOwed` subtracts COMMITTED payouts, so a batch created by
// one run leaves nothing owed for the next. Running this twice in a morning produces one batch and
// then a no-op, rather than paying anybody twice.

// Since 2026-10-11 the batch is built by lib/payouts/build-batch.ts — the SAME builder as the "Pay what
// is owed" button — so a scheduled batch resolves methods, fallbacks and fees exactly like a hand-built
// one. Lines that cannot be paid yet are counted in the admin notification.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { canDecideHours } from '@/lib/notifications/hours-submitted';
import { createOwedBatch } from '@/lib/payouts/build-batch';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/payout-prepare] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { created, error, status } = await createOwedBatch({
    label: `Scheduled — approved hours through ${today}`,
    notes: 'Prepared automatically. Nothing has been sent — commit this batch to pay it.',
    createdBy: 'system:cron',
    repaymentNote: `Recovered from the scheduled payout prepared ${today}`,
  });
  if (!created) {
    // Everybody being paid up is the normal Friday outcome once the firm is in rhythm — not an error.
    if (status === 409) return NextResponse.json({ prepared: false, reason: error, people: 0 });
    // Refused, loudly. A scheduled run that quietly built a batch from a balance it could not fully
    // read would pay wrong amounts on a timer, with nobody watching.
    console.error('[cron/payout-prepare] no batch prepared —', error);
    return NextResponse.json({ error: `No batch prepared — ${error ?? 'could not create the batch'}` }, { status: status ?? 500 });
  }
  const { batch, plan } = created;
  const people = plan.lines.length;
  const blocked = plan.blocked.length;

  // Tell the people who can actually send it.
  const { data: adminRows } = await supabaseAdmin.from('registered_users').select('email, roles').contains('roles', ['admin']);
  const admins = ((adminRows ?? []) as { email: string; roles: string[] | null }[]).filter((u) => canDecideHours(u.roles)).map((u) => u.email);
  for (const email of admins) {
    try {
      await notify({
        user_email: email,
        type: 'payout_prepared',
        title: `Payout ready to commit — ${money(plan.totalCents)}`,
        // "Prepared", never "paid". Nothing has left the bank and the wording must not suggest it.
        body: `${people} ${people === 1 ? 'person' : 'people'}, ${money(plan.totalCents)} of approved hours. `
          + 'Nothing has been sent yet — open the batch to commit it.'
          + (blocked > 0 ? ` ${blocked} cannot be paid until their payment details are fixed.` : ''),
        link: `/admin/payouts/runs/${batch.id}`,
        source_type: 'payout_batches',
        source_id: batch.id,
      });
    } catch { /* a notification failure must not undo a prepared batch */ }
  }

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: 'system:cron',
      action_type: 'payout_batch_prepared',
      entity_type: 'payout_batches',
      entity_id: batch.id,
      metadata: { people, total_cents: plan.totalCents, fee_cents: plan.feeCents, blocked },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ prepared: true, batch_id: batch.id, people, totalCents: plan.totalCents, missingMethod: blocked, blocked, notified: admins.length });
}, { routeName: 'cron/payout-prepare' });
