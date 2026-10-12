// lib/payouts/mark-item.ts — one place that moves a payout line between pending / sent / paid / failed.
//
// Lifted out of app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts (2026-10-11) so that the
// dispatch buttons, Commit (lib/payouts/commit.ts) and the PayPal status sync all change a line the same
// way — including the `account` credit, which must happen exactly once per line however many times the
// line is marked paid. Behaviour is unchanged from the route; its comments explain the why.

import { supabaseAdmin } from '@/lib/supabase';
import { planAccountCredit, type BalanceTransaction } from '@/lib/payroll/account-credit';
import { disbursedCents } from '@/lib/payroll/disbursement';
import { batchStatusFromItems, type PayoutBatchStatus, type PayoutItemStatus } from './dispatch';

export interface MarkResult { ok: boolean; status?: number; error?: string; item_status?: PayoutItemStatus; batch_status?: PayoutBatchStatus }

export interface MarkBody {
  status: PayoutItemStatus;
  external_ref?: string | null;
  failure_reason?: string | null;
  /** Extra columns to write with the status (provider ids, check id). */
  extra?: Record<string, unknown>;
}

export async function markPayoutItem(batchId: string, itemId: string, body: MarkBody): Promise<MarkResult> {
  const { data: batch } = await supabaseAdmin.from('payout_batches').select('id, status, label').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, status: 404, error: 'Batch not found' };
  if (batch.status !== 'approved' && batch.status !== 'dispatched') {
    return { ok: false, status: 409, error: `Cannot mark items on a batch in status "${batch.status}".` };
  }

  // Fetch the current row so we know whether this is the FIRST non-pending transition (stamps
  // attempted_at on the way out of pending; subsequent state shuffles don't re-stamp).
  const { data: currentItem } = await supabaseAdmin
    .from('payout_batch_items')
    .select('attempted_at, paid_at, status')
    .eq('id', itemId)
    .eq('batch_id', batchId)
    .maybeSingle();
  if (!currentItem) return { ok: false, status: 404, error: 'Payout line not found' };
  const nowIso = new Date().toISOString();

  const updates: Record<string, unknown> = { status: body.status, ...(body.extra ?? {}) };
  if (body.status === 'sent' || body.status === 'paid' || body.status === 'failed') {
    // First non-pending transition stamps attempted_at — even if it was a failure.
    if (!currentItem?.attempted_at) {
      updates.attempted_at = nowIso;
    }
  }
  if (body.status === 'sent' || body.status === 'paid') {
    if (body.external_ref !== undefined) updates.external_ref = body.external_ref?.slice(0, 200) ?? null;
    updates.failure_reason = null;
  }
  if (body.status === 'paid') {
    // P22 QA — preserve the ORIGINAL paid_at on subsequent flips so the audit trail anchors to the
    // first clear.
    if (!currentItem?.paid_at) {
      updates.paid_at = nowIso;
    }
  }
  if (body.status === 'pending') {
    updates.external_ref = null;
    updates.failure_reason = null;
    updates.paid_at = null;
    // Re-opening to pending clears attempted_at so a successful retry stamps fresh.
    updates.attempted_at = null;
  }
  if (body.status === 'failed') {
    updates.failure_reason = body.failure_reason?.slice(0, 500) ?? null;
  }
  const status = body.status;

  const { error: itemErr } = await supabaseAdmin.from('payout_batch_items').update(updates).eq('id', itemId).eq('batch_id', batchId);
  if (itemErr) return { ok: false, status: 500, error: itemErr.message };

  // An `account` line credits the person's balance, once per line (see the original route's H-11 note).
  if (status === 'paid') {
    try {
      const { data: item } = await supabaseAdmin
        .from('payout_batch_items').select('user_email, total_cents, recovered_cents, fee_cents, method').eq('id', itemId).maybeSingle();
      const row = item as { user_email: string; total_cents: number; recovered_cents: number | null; fee_cents: number | null; method: string | null } | null;
      if (row?.method === 'account') {
        const [{ data: profile }, { data: existing }] = await Promise.all([
          supabaseAdmin.from('employee_profiles').select('available_balance').eq('user_email', row.user_email).maybeSingle(),
          supabaseAdmin.from('balance_transactions').select('reference_type, reference_id, amount').eq('user_email', row.user_email).eq('reference_type', 'payout_batch_item'),
        ]);
        const plan = planAccountCredit({
          method: row.method,
          amountCents: disbursedCents(row),
          payoutItemId: itemId,
          currentBalanceDollars: Number((profile as { available_balance: number } | null)?.available_balance ?? 0),
          existingTransactions: (existing ?? []) as BalanceTransaction[],
          batchLabel: (batch as { label?: string | null }).label ?? null,
        });
        if (plan.credit) {
          await supabaseAdmin.from('balance_transactions').insert({
            user_email: row.user_email, transaction_type: 'credit', amount: plan.amountDollars,
            balance_before: plan.balanceBefore, balance_after: plan.balanceAfter, description: plan.description,
            reference_type: 'payout_batch_item', reference_id: itemId, status: 'completed', processed_at: nowIso,
          });
          await supabaseAdmin.from('employee_profiles').update({ available_balance: plan.balanceAfter }).eq('user_email', row.user_email);
        } else if (plan.reason) {
          console.log(`[payouts/mark] no account credit for ${itemId}: ${plan.reason}`);
        }
      }
    } catch (err) {
      console.error('[payouts/mark] could not credit the account:', err instanceof Error ? err.message : String(err));
    }
  }

  // A check line marked paid means the check was handed over: the check is now ISSUED.
  if (status === 'paid') {
    const { data: withCheck } = await supabaseAdmin.from('payout_batch_items').select('check_id').eq('id', itemId).maybeSingle();
    const checkId = (withCheck as { check_id?: string | null } | null)?.check_id;
    if (checkId) {
      await supabaseAdmin.from('payout_checks').update({ status: 'issued', issued_at: nowIso }).eq('id', checkId).eq('status', 'printed');
    }
  }

  const batchStatus = await rollBatchStatus(batchId, batch.status as PayoutBatchStatus);
  return { ok: true, item_status: status, batch_status: batchStatus };
}

/** Recompute the batch header from its lines and stamp dispatched / completed. */
export async function rollBatchStatus(batchId: string, current: PayoutBatchStatus): Promise<PayoutBatchStatus> {
  const { data: items } = await supabaseAdmin.from('payout_batch_items').select('status').eq('batch_id', batchId);
  const next = batchStatusFromItems((items ?? []) as Array<{ status: PayoutItemStatus }>, current);
  if (next !== current) {
    const stamps: Record<string, unknown> = { status: next };
    if (next === 'dispatched') stamps.dispatched_at = new Date().toISOString();
    if (next === 'completed') stamps.completed_at = new Date().toISOString();
    await supabaseAdmin.from('payout_batches').update(stamps).eq('id', batchId);
  }
  return next;
}
