// app/api/voice/expenses/[id]/route.ts — correcting or removing one expense.
//
// Editing is unrestricted and deletion is permanent, which is the opposite of the invoice rules — and
// deliberately so. An invoice is a document a second party holds a copy of; an expense is Andrew's
// own record of his own spending. Nobody else is relying on it, so the cost of a mistake is that he
// fixes it, and imposing an audit trail on a $12 cable would only make him stop logging cables.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { EXPENSE_CATEGORIES } from '@/lib/voice/expenses';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.description === 'string' && body.description.trim()) {
    patch.description = body.description.trim().slice(0, 300);
  }
  if (typeof body.vendor === 'string') patch.vendor = body.vendor.slice(0, 200) || null;
  if (Number.isFinite(Number(body.amountCents))) {
    const amount = Math.round(Number(body.amountCents));
    if (amount <= 0) return NextResponse.json({ error: 'Enter an amount.' }, { status: 400 });
    patch.amount_cents = amount;
  }
  if (typeof body.spentOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.spentOn)) patch.spent_on = body.spentOn;
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(String(body.category))) patch.category = String(body.category);
  if (Number.isFinite(Number(body.businessPct))) {
    patch.business_pct = Math.max(0, Math.min(100, Math.round(Number(body.businessPct))));
  }
  if (typeof body.isCapital === 'boolean') patch.is_capital = body.isCapital;
  if (typeof body.billable === 'boolean') patch.billable = body.billable;
  if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 1000) || null;
  if (typeof body.receiptMediaId === 'string') patch.receipt_media_id = body.receiptMediaId || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('va_expenses')
    .update(patch)
    .eq('id', params.id)
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();
  const { error } = await supabaseAdmin.from('va_expenses').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
