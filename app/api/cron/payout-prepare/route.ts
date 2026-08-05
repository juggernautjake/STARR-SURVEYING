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

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { loadOwed } from '@/lib/payroll/owed-loader';
import { canDecideHours } from '@/lib/notifications/hours-submitted';
import { isPayoutMethod, type PayoutMethod } from '@/lib/payouts/methods';

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

  const { rows, error } = await loadOwed();
  if (error) {
    // Refused, loudly. A scheduled run that quietly built a batch from a balance it could not
    // fully read would pay wrong amounts on a timer, with nobody watching.
    console.error('[cron/payout-prepare] no batch prepared —', error);
    return NextResponse.json({ error: `No batch prepared — ${error}` }, { status: 500 });
  }

  const payable = rows.filter((r) => r.owedCents > 0);
  if (payable.length === 0) {
    // Not an error. Everybody being paid up is the normal Friday outcome once the firm is in
    // rhythm, and logging it as a failure would train somebody to ignore the alert.
    return NextResponse.json({ prepared: false, reason: 'Nobody has a positive balance.', people: 0 });
  }

  const { data: profileRows } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email, payout_method, payout_handle')
    .in('user_email', payable.map((r) => r.user_email));

  const methodByEmail = new Map<string, { method: PayoutMethod | null; handle: string | null }>();
  for (const p of (profileRows ?? []) as { user_email: string; payout_method: unknown; payout_handle: unknown }[]) {
    methodByEmail.set(p.user_email, {
      method: isPayoutMethod(p.payout_method) ? p.payout_method : null,
      handle: typeof p.payout_handle === 'string' && p.payout_handle.trim() ? p.payout_handle.trim() : null,
    });
  }

  const totalCents = payable.reduce((sum, r) => sum + r.owedCents, 0);
  const today = new Date().toISOString().slice(0, 10);

  const { data: batch, error: batchError } = await supabaseAdmin
    .from('payout_batches')
    .insert({
      label: `Scheduled — approved hours through ${today}`,
      kind: 'hours',
      status: 'draft',
      total_cents: totalCents,
      notes: 'Prepared automatically. Nothing has been sent — dispatch this batch to pay it.',
      created_by: 'system:cron',
    })
    .select('id, label, total_cents')
    .single();

  if (batchError || !batch) {
    console.error('[cron/payout-prepare] could not create the batch:', batchError?.message);
    return NextResponse.json({ error: batchError?.message ?? 'Could not create the batch' }, { status: 500 });
  }

  const { error: itemError } = await supabaseAdmin.from('payout_batch_items').insert(
    payable.map((r) => {
      const pay = methodByEmail.get(r.user_email);
      return {
        batch_id: batch.id,
        user_email: r.user_email,
        user_name: r.user_name,
        hours_cents: r.owedCents,
        total_cents: r.owedCents,
        // No method on file is not a blocker — the line lands in the dispatch screen's
        // "Method not assigned" column. Refusing the whole run because one person has no Venmo
        // handle would stop everybody else being paid, on a schedule, silently.
        method: pay?.method ?? null,
        method_handle: pay?.handle ?? null,
        status: 'pending',
        notes: `Approved hours owed as at ${today}`,
      };
    }),
  );

  if (itemError) {
    // Remove the header rather than leave a batch with a total and no lines — which would commit
    // money against nobody and hold down every balance it claimed to cover, until somebody noticed.
    await supabaseAdmin.from('payout_batches').delete().eq('id', batch.id);
    console.error('[cron/payout-prepare] could not create the lines:', itemError.message);
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const missingMethod = payable.filter((r) => !methodByEmail.get(r.user_email)?.method).length;

  // Tell the people who can actually send it.
  const { data: adminRows } = await supabaseAdmin
    .from('registered_users')
    .select('email, roles')
    .contains('roles', ['admin']);

  const admins = ((adminRows ?? []) as { email: string; roles: string[] | null }[])
    .filter((u) => canDecideHours(u.roles))
    .map((u) => u.email);

  for (const email of admins) {
    try {
      await notify({
        user_email: email,
        type: 'payout_prepared',
        title: `Payout ready to send — ${money(totalCents)}`,
        // "Prepared", never "paid". Nothing has left the bank and the wording must not suggest it.
        body:
          `${payable.length} ${payable.length === 1 ? 'person' : 'people'}, ${money(totalCents)} of approved hours. ` +
          'Nothing has been sent yet — open the batch to dispatch it.' +
          (missingMethod > 0 ? ` ${missingMethod} need a payment method assigned first.` : ''),
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
      metadata: { people: payable.length, total_cents: totalCents, missing_method: missingMethod },
    });
  } catch { /* ignore */ }

  return NextResponse.json({
    prepared: true,
    batch_id: batch.id,
    people: payable.length,
    totalCents,
    missingMethod,
    notified: admins.length,
  });
}, { routeName: 'cron/payout-prepare' });
