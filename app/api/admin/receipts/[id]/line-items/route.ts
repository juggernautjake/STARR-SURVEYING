// app/api/admin/receipts/[id]/line-items/route.ts — edit, add and retire the lines on a receipt.
//
// Owner, 2026-08-17: *"We should also be able to edit the list of items on the receipt … mark each
// individual item as a business expense or not … We need to be able to remove items, and we need to
// be able to add items too … removed items should not actually be removed, they should just be
// flagged. The user should have to give a reason."*
//
//   GET    → every line for the receipt, removed ones included, with the review summary
//   POST   → add a line a person says was on the paper. Requires a reason.
//   PATCH  → correct a line, or rule on whether it is a business expense
//   DELETE → RETIRE a line (soft). Requires a reason. Nothing is ever hard-deleted here.
//
// ── WHY DELETE DOES NOT DELETE ──────────────────────────────────────────────────────────────────
//
// A receipt is a tax record, and "this was on the paper and we are not claiming it" is a different
// statement from "this was never on the paper". A hard delete collapses both into the same absence,
// which is the one thing a bookkeeper cannot reconstruct later. So the row stays, `removed_at` is
// stamped, and the reason travels with it.
//
// The reason is also enforced by a CHECK constraint (seed 597) rather than only here: this route is
// one caller, and the constraint refuses an unexplained removal on behalf of every caller that has
// not been written yet.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  describeLineItemReview, summariseLineItems, validateAmountCents, validateDescription,
  validateQuantity, validateReason, type LineItem,
} from '@/lib/receipts/line-items';

export const runtime = 'nodejs';

const SELECT =
  'id, receipt_id, description, amount_cents, quantity, position, source, '
  + 'is_business_expense, business_expense_note, added_by, added_reason, '
  + 'removed_at, removed_by, removed_reason, edited_at, edited_by';

/** `/api/admin/receipts/{id}/line-items` — the id is the segment before the last. */
function receiptIdFrom(req: NextRequest): string | null {
  const seg = new URL(req.url).pathname.split('/').filter(Boolean);
  return seg[seg.length - 2] ?? null;
}

/** Explicitly discriminated: `'error' in gate` cannot narrow a union of two object literals whose
 *  members are optional, and the handlers then type as possibly returning undefined. */
type Gate = { ok: false; response: NextResponse } | { ok: true; email: string };

async function requireAdmin(): Promise<Gate> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { ok: false, response: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  }
  return { ok: true, email: session.user.email };
}

/** The receipt's own business/personal answer, which an unruled line follows. */
async function receiptIsBusiness(receiptId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('receipts').select('expense_nature').eq('id', receiptId).maybeSingle();
  // `expense_nature` is null until somebody answers, and an unanswered receipt is treated as
  // business — which is what every total on the books already assumes.
  return (data as { expense_nature?: string | null } | null)?.expense_nature !== 'personal';
}

async function listWithSummary(receiptId: string) {
  const { data, error } = await supabaseAdmin
    .from('receipt_line_items')
    .select(SELECT)
    .eq('receipt_id', receiptId)
    .order('position', { ascending: true });
  if (error) return { error };
  const items = (data ?? []) as LineItem[];
  const totals = summariseLineItems(items, await receiptIsBusiness(receiptId));
  return { items, totals, review: describeLineItemReview(totals) };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const receiptId = receiptIdFrom(req);
  if (!receiptId) return NextResponse.json({ error: 'Missing receipt id' }, { status: 400 });

  const result = await listWithSummary(receiptId);
  if ('error' in result && result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  return NextResponse.json(result);
}, { routeName: 'admin/receipts.line-items.get' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const receiptId = receiptIdFrom(req);
  if (!receiptId) return NextResponse.json({ error: 'Missing receipt id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const desc = validateDescription(body?.description);
  if (!desc.ok) return NextResponse.json({ error: desc.error }, { status: 400 });
  const amount = validateAmountCents(body?.amount_cents ?? null);
  if (!amount.ok) return NextResponse.json({ error: amount.error }, { status: 400 });
  const qty = validateQuantity(body?.quantity ?? null);
  if (!qty.ok) return NextResponse.json({ error: qty.error }, { status: 400 });
  // A line that is not on the paper has to say why it is on the record.
  const reason = validateReason(body?.reason, 'add');
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

  // Appended, not inserted mid-list: the AI's positions describe the printed order, and pushing a
  // hand-added line into the middle would claim it was printed somewhere it was not.
  const { data: last } = await supabaseAdmin
    .from('receipt_line_items')
    .select('position').eq('receipt_id', receiptId)
    .order('position', { ascending: false }).limit(1).maybeSingle();
  const nextPosition = ((last as { position?: number | null } | null)?.position ?? -1) + 1;

  const { error } = await supabaseAdmin.from('receipt_line_items').insert({
    receipt_id: receiptId,
    description: String(body.description).trim(),
    amount_cents: body.amount_cents ?? null,
    quantity: body.quantity ?? null,
    position: nextPosition,
    source: 'user',
    added_by: gate.email,
    added_reason: String(body.reason).trim(),
    is_business_expense: typeof body.is_business_expense === 'boolean' ? body.is_business_expense : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(await listWithSummary(receiptId), { status: 201 });
}, { routeName: 'admin/receipts.line-items.post' });

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const receiptId = receiptIdFrom(req);
  if (!receiptId) return NextResponse.json({ error: 'Missing receipt id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Which line?' }, { status: 400 });

  const update: Record<string, unknown> = {};
  let correctsTheReading = false;

  if (body.description !== undefined) {
    const v = validateDescription(body.description);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    update.description = String(body.description).trim();
    correctsTheReading = true;
  }
  if (body.amount_cents !== undefined) {
    const v = validateAmountCents(body.amount_cents);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    update.amount_cents = body.amount_cents;
    correctsTheReading = true;
  }
  if (body.quantity !== undefined) {
    const v = validateQuantity(body.quantity);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    update.quantity = body.quantity;
    correctsTheReading = true;
  }
  if (body.is_business_expense !== undefined) {
    const v = body.is_business_expense;
    if (v !== null && typeof v !== 'boolean') {
      return NextResponse.json({ error: 'is_business_expense must be true, false or null.' }, { status: 400 });
    }
    // NOT a correction of the reading — the AI never claimed to know this — so it does not stamp
    // `edited_at`. It IS a decision, so `linesToReplaceOnReextract` still protects the row.
    update.is_business_expense = v;
    if (body.business_expense_note !== undefined) {
      update.business_expense_note = body.business_expense_note ? String(body.business_expense_note).trim() : null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  // `edited_at` marks that a human corrected what the AI READ, which is the flag a re-extraction
  // reads to decide whether it may replace the line. Ruling on business/personal is a different
  // kind of statement and is protected separately.
  if (correctsTheReading) {
    update.edited_at = new Date().toISOString();
    update.edited_by = gate.email;
  }

  const { error } = await supabaseAdmin
    .from('receipt_line_items').update(update)
    .eq('id', id).eq('receipt_id', receiptId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(await listWithSummary(receiptId));
}, { routeName: 'admin/receipts.line-items.patch' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const receiptId = receiptIdFrom(req);
  if (!receiptId) return NextResponse.json({ error: 'Missing receipt id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Which line?' }, { status: 400 });

  // Un-removing is allowed and needs no reason: putting back something you excluded by mistake is a
  // correction of your own decision, and demanding a justification for it would leave people stuck
  // with a wrong exclusion rather than fixing it.
  if (body.restore === true) {
    const { error } = await supabaseAdmin
      .from('receipt_line_items')
      .update({ removed_at: null, removed_by: null, removed_reason: null })
      .eq('id', id).eq('receipt_id', receiptId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(await listWithSummary(receiptId));
  }

  const reason = validateReason(body?.reason, 'remove');
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('receipt_line_items')
    .update({
      removed_at: new Date().toISOString(),
      removed_by: gate.email,
      removed_reason: String(body.reason).trim(),
    })
    .eq('id', id).eq('receipt_id', receiptId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(await listWithSummary(receiptId));
}, { routeName: 'admin/receipts.line-items.delete' });
