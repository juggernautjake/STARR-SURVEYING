// app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts
//
// P13 of payment-infrastructure-2026-06-18.md — per-line item state
// machine. The dispatch page calls this to flip an item between
// pending / sent / paid / failed as the office works the list.
//
//   POST  /api/admin/payouts/runs/{id}/items/{itemId}/mark
//     body: {
//       status: 'sent' | 'paid' | 'failed' | 'pending',
//       external_ref?: string,
//       failure_reason?: string,
//     }
//
// Side effect: after the row is updated, we recompute the batch
// status via `batchStatusFromItems` so the header rolls forward to
// `dispatched` / `completed` without a separate cron.
//
// Guard: the batch must be in `approved` or `dispatched` status —
// you can't mark items on a draft / voided batch.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { planAccountCredit, type BalanceTransaction } from '@/lib/payroll/account-credit';
import { disbursedCents } from '@/lib/payroll/disbursement';
import {
  batchStatusFromItems,
  type PayoutBatchStatus,
  type PayoutItemStatus,
} from '@/lib/payouts/dispatch';

const ALLOWED: PayoutItemStatus[] = ['sent', 'paid', 'failed', 'pending'];

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // …/runs/<id>/items/<itemId>/mark — mark is last, itemId is -2, id is -4.
  const itemId = segments[segments.length - 2];
  const batchId = segments[segments.length - 4];
  if (!itemId || !batchId) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: PayoutItemStatus;
    external_ref?: string;
    failure_reason?: string;
  };
  if (!body.status || !(ALLOWED as string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Unsupported status' }, { status: 400 });
  }

  const { data: batch } = await supabaseAdmin
    .from('payout_batches')
    // `label` is read because the account-credit description names the batch the money came from.
    // It was omitted here while `(batch as { label?: string }).label` was read below, so the
    // description silently fell back to the generic string on every credit — a cast asking for a
    // column the query never fetched, which the compiler cannot catch.
    .select('id, status, label')
    .eq('id', batchId)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (batch.status !== 'approved' && batch.status !== 'dispatched') {
    return NextResponse.json(
      { error: `Cannot mark items on a batch in status "${batch.status}".` },
      { status: 409 },
    );
  }

  // Fetch the current row so we know whether this is the FIRST
  // non-pending transition (stamps attempted_at on the way out of
  // pending; subsequent state shuffles don't re-stamp).
  const { data: currentItem } = await supabaseAdmin
    .from('payout_batch_items')
    .select('attempted_at, paid_at, status')
    .eq('id', itemId)
    .eq('batch_id', batchId)
    .maybeSingle();
  const nowIso = new Date().toISOString();

  const updates: Record<string, unknown> = {
    status: body.status,
  };
  if (body.status === 'sent' || body.status === 'paid' || body.status === 'failed') {
    // First non-pending transition stamps attempted_at — even if it
    // was a failure. Subsequent changes preserve the original.
    if (!currentItem?.attempted_at) {
      updates.attempted_at = nowIso;
    }
  }
  if (body.status === 'sent' || body.status === 'paid') {
    updates.external_ref = body.external_ref?.slice(0, 200) ?? null;
    updates.failure_reason = null;
  }
  if (body.status === 'paid') {
    // P22 QA — preserve the ORIGINAL paid_at on subsequent flips
    // so the audit trail anchors to the first clear. The mark
    // route can be called multiple times (e.g. office updates
    // external_ref after the row is already paid).
    if (!currentItem?.paid_at) {
      updates.paid_at = nowIso;
    }
  }
  if (body.status === 'pending') {
    updates.external_ref = null;
    updates.failure_reason = null;
    updates.paid_at = null;
    // Re-opening to pending clears attempted_at so a successful
    // retry stamps fresh.
    updates.attempted_at = null;
  }
  if (body.status === 'failed') {
    updates.failure_reason = body.failure_reason?.slice(0, 500) ?? null;
  }

  const { error: itemErr } = await supabaseAdmin
    .from('payout_batch_items')
    .update(updates)
    .eq('id', itemId)
    .eq('batch_id', batchId);
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });

  // ── AN `account` PAYOUT CREDITS THE PERSON'S BALANCE (H-11, 2026-08-05) ────────────────────
  //
  // *"We need to have money accounts for the employees."*
  //
  // The account machinery already existed — `available_balance`, `balance_transactions`, a
  // withdrawal flow that checks the balance and refuses without a linked bank. What was missing was
  // the only thing that matters: **nothing ever credited it.** `available_balance` was written by
  // one path, completing an old `payroll_runs` run, and pay now flows through payout batches. So the
  // account existed, the withdrawal screen worked, and the balance was permanently $0.00.
  //
  // `account` is a payout METHOD rather than a parallel system: the money has not left the firm, it
  // has changed shape from "we owe you for hours" to "we hold this for you". It leaves when they
  // withdraw it.
  //
  // Keyed to the ITEM. This route can be called repeatedly — the office updates an external
  // reference on a row that is already paid — and crediting on every call would inflate a balance
  // by the payout amount each time, with nothing about the number looking wrong.
  if (body.status === 'paid') {
    try {
      const { data: item } = await supabaseAdmin
        .from('payout_batch_items')
        // `recovered_cents` is not optional here. Crediting `total_cents` would put the GROSS amount
        // into the balance while the advance was simultaneously recorded as repaid — see below.
        .select('user_email, total_cents, recovered_cents, method')
        .eq('id', itemId)
        .maybeSingle();

      const row = item as {
        user_email: string; total_cents: number; recovered_cents: number | null; method: string | null;
      } | null;
      if (row?.method === 'account') {
        const [{ data: profile }, { data: existing }] = await Promise.all([
          supabaseAdmin.from('employee_profiles').select('available_balance').eq('user_email', row.user_email).maybeSingle(),
          supabaseAdmin
            .from('balance_transactions')
            .select('reference_type, reference_id, amount')
            .eq('user_email', row.user_email)
            .eq('reference_type', 'payout_batch_item'),
        ]);

        const plan = planAccountCredit({
          method: row.method,
          // ── THE DISBURSED FIGURE, NOT THE SETTLED ONE ─────────────────────────────────────────
          //
          // `account` is the one method where "paid" means "credited to their balance" rather than
          // "sent". Crediting `total_cents` would hand back the advance this very payout withheld:
          // the balance would rise by $1,000 while `pay_advance_repayments` recorded $200 repaid,
          // the employee could withdraw the full $1,000, and the firm would be $200 down.
          //
          // Nothing would look wrong. `owed` would read zero, the pay statement would correctly say
          // "$800 to be paid to you", and the balance would say $1,000 — three screens, three
          // different truths, all internally consistent. Every other rail already derives the amount
          // this way; this was the one that did not.
          amountCents: disbursedCents(row),
          payoutItemId: itemId,
          currentBalanceDollars: Number((profile as { available_balance: number } | null)?.available_balance ?? 0),
          existingTransactions: (existing ?? []) as BalanceTransaction[],
          batchLabel: (batch as { label?: string | null }).label ?? null,
        });

        if (plan.credit) {
          await supabaseAdmin.from('balance_transactions').insert({
            user_email: row.user_email,
            transaction_type: 'credit',
            amount: plan.amountDollars,
            balance_before: plan.balanceBefore,
            balance_after: plan.balanceAfter,
            description: plan.description,
            // What makes the credit idempotent — the check above has something to find.
            reference_type: 'payout_batch_item',
            reference_id: itemId,
            status: 'completed',
            processed_at: nowIso,
          });

          await supabaseAdmin
            .from('employee_profiles')
            .update({ available_balance: plan.balanceAfter })
            .eq('user_email', row.user_email);
        } else if (plan.reason) {
          // Logged rather than silent. "Already credited" is the expected case on a repeat call and
          // should be visible when somebody is working out why a balance did not move.
          console.log(`[payouts/mark] no account credit for ${itemId}: ${plan.reason}`);
        }
      }
    } catch (err) {
      // Named, and deliberately not fatal. The payout IS paid; failing the request here would leave
      // the office unsure whether to mark it again, which is how a double credit starts.
      console.error('[payouts/mark] could not credit the account:', err instanceof Error ? err.message : String(err));
    }
  }

  // Recompute parent batch status from the items.
  const { data: items } = await supabaseAdmin
    .from('payout_batch_items')
    .select('status')
    .eq('batch_id', batchId);
  const nextBatchStatus = batchStatusFromItems(
    (items ?? []) as Array<{ status: PayoutItemStatus }>,
    batch.status as PayoutBatchStatus,
  );
  if (nextBatchStatus !== batch.status) {
    const stamps: Record<string, unknown> = { status: nextBatchStatus };
    if (nextBatchStatus === 'dispatched') stamps.dispatched_at = new Date().toISOString();
    if (nextBatchStatus === 'completed') stamps.completed_at = new Date().toISOString();
    await supabaseAdmin.from('payout_batches').update(stamps).eq('id', batchId);
  }

  return NextResponse.json({ item_status: body.status, batch_status: nextBatchStatus });
});
