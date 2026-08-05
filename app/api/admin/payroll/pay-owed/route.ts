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

/** Nobody is paid a fraction of a cent, and a zero line is not a payment. */
const MIN_PAYABLE_CENTS = 1;

interface PayableLine {
  user_email: string;
  user_name: string | null;
  total_cents: number;
  method: PayoutMethod | null;
  method_handle: string | null;
}

/**
 * Turn balances into payable lines.
 *
 * Skips anything that is not a positive balance, and says why per person rather than silently
 * dropping them — "nobody appeared in the batch" is the kind of empty result this codebase keeps
 * finding, and an approver needs to know whether that means "everyone is paid up" or "everyone was
 * excluded for a reason".
 */
function toLines(rows: OwedRow[], methodByEmail: Map<string, { method: PayoutMethod | null; handle: string | null }>) {
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
    lines.push({
      user_email: row.user_email,
      user_name: row.user_name,
      total_cents: row.owedCents,
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
  const { lines, skipped } = toLines(scoped, await loadMethods(scoped.map((r) => r.user_email)));

  return NextResponse.json({
    lines,
    skipped,
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
  const { lines, skipped } = toLines(scoped, await loadMethods(scoped.map((r) => r.user_email)));

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

  const { error: itemError } = await supabaseAdmin.from('payout_batch_items').insert(
    lines.map((l) => ({
      batch_id: batch.id,
      user_email: l.user_email,
      user_name: l.user_name,
      hours_cents: l.total_cents,
      total_cents: l.total_cents,
      method: l.method,
      method_handle: l.method_handle,
      status: 'pending',
      notes: `Approved hours owed as at ${today}`,
    })),
  );

  if (itemError) {
    // Remove the header rather than leave a batch with a total and no lines — which would commit
    // money against nobody and hold down every balance it claimed to cover.
    await supabaseAdmin.from('payout_batches').delete().eq('id', batch.id);
    return NextResponse.json({ error: itemError.message }, { status: 500 });
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
        title: `$${(line.total_cents / 100).toFixed(2)} queued for payment`,
        body: 'Your approved hours are in a payout that has been prepared. You will see it here when it goes out.',
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
