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

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadOwed, type OwedRow } from '@/lib/payroll/owed-loader';
import { isPayoutMethod, type PayoutMethod } from '@/lib/payouts/methods';
import { notify } from '@/lib/notifications';
import { planAdvanceRecovery, type OutstandingAdvance } from '@/lib/payroll/advance-recovery';
import { disbursedCents, totalRecoveredCents } from '@/lib/payroll/disbursement';

/** Nobody is paid a fraction of a cent, and a zero line is not a payment. */
const MIN_PAYABLE_CENTS = 1;

interface PayableLine {
  user_email: string;
  user_name: string | null;
  /** What this line SETTLES — the full approved balance. See lib/payroll/disbursement.ts. */
  total_cents: number;
  /** Of that, how much is held back against an outstanding advance. */
  recovered_cents: number;
  /** Which advances that recovery clears, so repayment rows can be written against the item. */
  recoveries: Array<{ advanceId: string; amount: number }>;
  method: PayoutMethod | null;
  method_handle: string | null;
}

/**
 * Outstanding advances per person, oldest first.
 *
 * Reads the `pay_advances_outstanding` VIEW, never `pay_advance_requests` — the view filters to
 * advances actually PAID OUT. Approving an advance is a decision; paying it is an event, and
 * recovering against an approved-but-unpaid one takes back money never handed over.
 */
async function loadAdvances(emails: string[]): Promise<Map<string, OutstandingAdvance[]>> {
  const out = new Map<string, OutstandingAdvance[]>();
  if (emails.length === 0) return out;
  const { data } = await supabaseAdmin
    .from('pay_advances_outstanding')
    .select('id, user_email, outstanding, repay_per_period, paid_at')
    .in('user_email', emails);
  for (const a of (data ?? []) as Array<OutstandingAdvance & { user_email: string }>) {
    const list = out.get(a.user_email) ?? [];
    list.push(a);
    out.set(a.user_email, list);
  }
  return out;
}

/**
 * Turn balances into payable lines.
 *
 * Skips anything that is not a positive balance, and says why per person rather than silently
 * dropping them — "nobody appeared in the batch" is the kind of empty result this codebase keeps
 * finding, and an approver needs to know whether that means "everyone is paid up" or "everyone was
 * excluded for a reason".
 */
function toLines(
  rows: OwedRow[],
  methodByEmail: Map<string, { method: PayoutMethod | null; handle: string | null }>,
  advancesByEmail: Map<string, OutstandingAdvance[]> = new Map(),
) {
  const lines: PayableLine[] = [];
  const skipped: Array<{ user_email: string; reason: string }> = [];

  for (const row of rows) {
    if (row.owedCents < 0) {
      skipped.push({
        user_email: row.user_email,
        reason: `Overpaid by $${(-row.owedCents / 100).toFixed(2)} — needs a look, not a payment.`,
      });
      continue;
    }
    if (row.owedCents < MIN_PAYABLE_CENTS) {
      skipped.push({
        user_email: row.user_email,
        reason: row.inFlightCents > 0
          ? `Nothing further owed — $${(row.inFlightCents / 100).toFixed(2)} is already in a payout that has not gone out.`
          : 'Fully paid up on approved hours.',
      });
      continue;
    }

    const pay = methodByEmail.get(row.user_email);

    // ── TAKE BACK ANY OUTSTANDING ADVANCE ──────────────────────────────────────────────────────
    //
    // This is the recovery that used to live only in the retired payroll-run engine, and whose
    // absence would have turned every advance into a gift the moment that engine closed.
    //
    // `planAdvanceRecovery` works in DOLLARS (it was written for pay stubs) while everything on this
    // path is CENTS. Converting at the boundary and back, rather than reaching into the module, keeps
    // the one implementation of the rules — including the floor that never takes somebody's whole
    // cheque — and the 100× error stays impossible because neither unit crosses the call.
    const advances = advancesByEmail.get(row.user_email) ?? [];
    const plan = advances.length
      ? planAdvanceRecovery({ advances, netPay: row.owedCents / 100 })
      : null;
    const recoveredCents = plan ? Math.round(plan.totalRecovered * 100) : 0;

    lines.push({
      user_email: row.user_email,
      user_name: row.user_name,
      // NOT reduced by the recovery. `total_cents` is what this settles, and lib/payroll/owed.ts
      // counts it as paid — netting the recovery here would leave the person owed the advance for
      // ever and the firm would hand it straight back. See lib/payroll/disbursement.ts.
      total_cents: row.owedCents,
      recovered_cents: recoveredCents,
      recoveries: plan ? plan.recoveries.map((r) => ({ advanceId: r.advanceId, amount: r.amount })) : [],
      // No method is NOT a blocker. The batch is built, the line lands in the dispatch screen's
      // "Method not assigned" column, and somebody assigns it there. Refusing the whole batch
      // because one person has no Venmo handle on file would stop everyone else being paid.
      method: pay?.method ?? null,
      method_handle: pay?.handle ?? null,
    });
  }

  return { lines, skipped };
}

/** Each person's preferred method, where one is on file. */
async function loadMethods(emails: string[]) {
  const out = new Map<string, { method: PayoutMethod | null; handle: string | null }>();
  if (emails.length === 0) return out;

  const { data } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email, payout_method, payout_handle')
    .in('user_email', emails);

  for (const row of (data ?? []) as { user_email: string; payout_method: unknown; payout_handle: unknown }[]) {
    out.set(row.user_email, {
      method: isPayoutMethod(row.payout_method) ? row.payout_method : null,
      handle: typeof row.payout_handle === 'string' && row.payout_handle.trim() ? row.payout_handle.trim() : null,
    });
  }
  return out;
}

// GET: what a batch would contain. Changes nothing.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const only = new URL(req.url).searchParams.getAll('email');
  const { rows, error } = await loadOwed();
  if (error) return NextResponse.json({ error: `No preview — ${error}` }, { status: 500 });

  const scoped = only.length ? rows.filter((r) => only.includes(r.user_email)) : rows;
  // Preview and build must see the same advances, or the screen promises an amount the batch
  // does not send.
  const { lines, skipped } = toLines(
    scoped,
    await loadMethods(scoped.map((r) => r.user_email)),
    await loadAdvances(scoped.map((r) => r.user_email)),
  );

  return NextResponse.json({
    lines,
    skipped,
    // What the bank account actually pays once advances are held back. Distinct from `totalCents`
    // below, which is what the batch SETTLES — see lib/payroll/disbursement.ts.
    disbursedCents: lines.reduce((sum, l) => sum + disbursedCents(l), 0),
    recoveredCents: totalRecoveredCents(lines),
    totalCents: lines.reduce((sum, l) => sum + l.total_cents, 0),
    // Named so the screen can prompt for it rather than letting somebody discover it at the bank.
    missingMethod: lines.filter((l) => !l.method).map((l) => l.user_email),
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

  const { rows, error } = await loadOwed();
  // Refused, not partial. Building a batch from a balance we could not fully read pays wrong
  // amounts, and a payout is much harder to take back than to not make.
  if (error) return NextResponse.json({ error: `No payout was created — ${error}` }, { status: 500 });

  const scoped = only.length ? rows.filter((r) => only.includes(r.user_email)) : rows;
  const { lines, skipped } = toLines(
    scoped,
    await loadMethods(scoped.map((r) => r.user_email)),
    await loadAdvances(scoped.map((r) => r.user_email)),
  );

  if (lines.length === 0) {
    // A 200 with an empty batch would read as "paid". This says which of the two it is.
    return NextResponse.json({
      error: skipped.length
        ? 'Nobody has a positive balance to pay right now.'
        : 'No approved, unpaid hours were found.',
      skipped,
    }, { status: 409 });
  }

  const totalCents = lines.reduce((sum, l) => sum + l.total_cents, 0);
  const today = new Date().toISOString().slice(0, 10);

  const { data: batch, error: batchError } = await supabaseAdmin
    .from('payout_batches')
    .insert({
      label: label ?? `Approved hours through ${today}`,
      kind: 'hours',
      status: 'draft',
      total_cents: totalCents,
      notes,
      created_by: session.user.email,
    })
    .select('id, label, status, total_cents')
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: batchError?.message ?? 'Could not create the payout' }, { status: 500 });
  }

  const { data: insertedItems, error: itemError } = await supabaseAdmin
    .from('payout_batch_items')
    .insert(
      lines.map((l) => ({
        batch_id: batch.id,
        user_email: l.user_email,
        user_name: l.user_name,
        hours_cents: l.total_cents,
        total_cents: l.total_cents,
        // Withheld FROM the total, never subtracted from it — see the seed 588 header for why
        // netting it here would leave the person owed the advance for ever.
        recovered_cents: l.recovered_cents,
        method: l.method,
        method_handle: l.method_handle,
        status: 'pending',
        notes: `Approved hours owed as at ${today}`,
      })),
    )
    .select('id, user_email');

  if (itemError) {
    // Remove the header rather than leave a batch with a total and no lines — which would commit
    // money against nobody and hold down every balance it claimed to cover.
    await supabaseAdmin.from('payout_batches').delete().eq('id', batch.id);
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  // ── RECORD WHAT EACH RECOVERY CLEARED ─────────────────────────────────────────────────────────
  //
  // A running total on the advance alone cannot answer "which payout took this", and cannot be
  // reversed when a batch is voided. One row per (advance, item) — the unique index in seed 588
  // enforces it, because re-running a build must not deduct the same instalment twice.
  //
  // Written AFTER the items so each repayment can point at the item that took it. Best-effort: the
  // batch is already created and correct, and failing a whole payout because an audit row would not
  // write is the wrong trade. The withholding itself is still on the item as `recovered_cents`.
  const itemIdByEmail = new Map(
    ((insertedItems ?? []) as Array<{ id: string; user_email: string }>).map((i) => [i.user_email, i.id]),
  );
  const repayments = lines.flatMap((l) => {
    const itemId = itemIdByEmail.get(l.user_email);
    if (!itemId) return [];
    return l.recoveries.map((r) => ({
      advance_id: r.advanceId,
      payout_batch_item_id: itemId,
      pay_stub_id: null,
      user_email: l.user_email,
      amount: r.amount,
      note: `Recovered from the payout prepared ${today}`,
    }));
  });
  if (repayments.length > 0) {
    const { error: repayError } = await supabaseAdmin.from('pay_advance_repayments').insert(repayments);
    if (repayError) {
      console.error('[payroll/pay-owed] advance repayments could not be recorded:', repayError.message);
    }
  }

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'payout_batch_from_hours',
      entity_type: 'payout_batches',
      entity_id: batch.id,
      metadata: { lines: lines.length, total_cents: totalCents, skipped: skipped.length },
    });
  } catch { /* ignore */ }

  // Tell each person their pay is queued — not that it has arrived. A draft has not been sent, and
  // a notification that says "paid" before the money moves is a promise the platform cannot keep.
  for (const line of lines) {
    try {
      await notify({
        user_email: line.user_email,
        type: 'payout_queued',
        // The NET figure in the title. A title stating the gross when a smaller sum arrives is the
        // message somebody screenshots and queries — and they would be right to.
        title: `$${(disbursedCents(line) / 100).toFixed(2)} queued for payment`,
        body: line.recovered_cents > 0
          ? `Your approved hours came to $${(line.total_cents / 100).toFixed(2)}, and `
            + `$${(line.recovered_cents / 100).toFixed(2)} of that goes against your pay advance. `
            + 'You will see it here when it goes out.'
          : 'Your approved hours are in a payout that has been prepared. You will see it here when it goes out.',
        link: '/admin/my-pay',
        source_type: 'payout_batches',
        source_id: batch.id,
      });
    } catch { /* a notification failure must not undo a payout */ }
  }

  return NextResponse.json({
    batch,
    lines: lines.length,
    totalCents,
    skipped,
    missingMethod: lines.filter((l) => !l.method).map((l) => l.user_email),
  }, { status: 201 });
}, { routeName: 'payroll/pay-owed' });
