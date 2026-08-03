// app/api/voice/invoices/[id]/route.ts — edit an invoice, send it, and record payment against it.
//
// ── RECORDING A PAYMENT IS A LEDGER ENTRY, NOT A FIELD EDIT ─────────────────────────────────────
//
// `paid_cents` is never set directly. A payment inserts a row into `va_payments` and `paid_cents` is
// recomputed as the SUM of that client's succeeded payments. Two consequences worth the extra query:
//
//   · Partial payments compose. Three payments of $400 against a $1,200 invoice arrive at paid
//     without anyone doing arithmetic in their head.
//   · There is an audit trail. "Why does this say paid?" is answerable — by whom, when, how much, by
//     what method — which a mutated integer cannot answer at all.
//
// PENDING payments do not count. Offline methods (a cheque, a Venmo transfer) get recorded when the
// client SAYS they paid and confirmed when the money lands. Counting an unconfirmed payment as paid
// is how a freelancer delivers work against money that never arrived.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { notifyStudio } from '@/lib/voice/notifications';
import {
  balanceCents,
  computeInvoiceTotals,
  deriveInvoiceStatus,
  dueDateFrom,
  normalizeLineItems,
  type InvoiceStatus,
} from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

const METHODS = ['stripe', 'venmo', 'cashapp', 'zelle', 'paypal', 'check', 'cash', 'other'] as const;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from('va_invoices')
    .select('*, client:va_clients(id, name, email, company, address), payments:va_payments(*)')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ invoice: data });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const { data: invoice } = await supabaseAdmin.from('va_invoices').select('*').eq('id', params.id).maybeSingle();
  if (!invoice) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // ── RECORD A PAYMENT ──
  // Confirming or dismissing a payment a CLIENT declared from the invoice page. Same ledger, same
  // re-sum: 'confirm' flips one row to succeeded, 'reject' deletes the claim. Nothing else can move a
  // pending row, which is what keeps "they said they paid" and "the money is here" distinguishable.
  if (typeof body.settlePaymentId === 'string' && body.settlePaymentId) {
    const decision = body.settleAs === 'reject' ? 'reject' : 'confirm';

    if (decision === 'confirm') {
      const { error: upErr } = await supabaseAdmin
        .from('va_payments')
        .update({ status: 'succeeded', received_at: new Date().toISOString() })
        .eq('id', body.settlePaymentId)
        .eq('invoice_id', invoice.id)
        // Scoped to pending so a double-click cannot re-date a payment that already cleared.
        .eq('status', 'pending');
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    } else {
      const { error: delErr } = await supabaseAdmin
        .from('va_payments')
        .delete()
        .eq('id', body.settlePaymentId)
        .eq('invoice_id', invoice.id)
        .eq('status', 'pending');
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const { data: all } = await supabaseAdmin
      .from('va_payments')
      .select('amount_cents')
      .eq('invoice_id', invoice.id)
      .eq('status', 'succeeded');
    const paid = (all ?? []).reduce((sum: number, r: { amount_cents: number }) => sum + (r.amount_cents ?? 0), 0);

    patch.paid_cents = paid;
    const settled = balanceCents(invoice.total_cents, paid) === 0;
    // Cleared to null when a rejection drops the invoice back below its total: a paid_at left behind
    // on an unpaid invoice is a date that reads as fact.
    patch.paid_at = settled ? new Date().toISOString() : null;
    patch.status = deriveInvoiceStatus(
      {
        status: (invoice.status === 'draft' ? 'sent' : invoice.status) as InvoiceStatus,
        totalCents: invoice.total_cents,
        paidCents: paid,
        dueDate: invoice.due_date,
      },
      new Date(),
    );
  }

  if (body.payment && typeof body.payment === 'object') {
    const p = body.payment as Record<string, unknown>;
    const amount = Math.round(Number(p.amountCents) || 0);
    if (amount <= 0) return NextResponse.json({ error: 'Enter an amount.' }, { status: 400 });

    const method = (METHODS as readonly string[]).includes(String(p.method)) ? String(p.method) : 'other';

    const { error: payErr } = await supabaseAdmin.from('va_payments').insert({
      invoice_id: invoice.id,
      amount_cents: amount,
      method,
      reference: p.reference ? String(p.reference).slice(0, 200) : null,
      status: p.pending === true ? 'pending' : 'succeeded',
      note: p.note ? String(p.note).slice(0, 500) : null,
    });
    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });

    // Recompute from the ledger rather than adding to the stored figure — an add would compound any
    // earlier drift, and a re-sum cannot.
    const { data: all } = await supabaseAdmin
      .from('va_payments')
      .select('amount_cents')
      .eq('invoice_id', invoice.id)
      .eq('status', 'succeeded');

    const paid = (all ?? []).reduce((sum: number, r: { amount_cents: number }) => sum + (r.amount_cents ?? 0), 0);
    patch.paid_cents = paid;

    const nowPaid = balanceCents(invoice.total_cents, paid) === 0;
    if (nowPaid) patch.paid_at = new Date().toISOString();
    patch.status = deriveInvoiceStatus(
      { status: (invoice.status === 'draft' ? 'sent' : invoice.status) as InvoiceStatus, totalCents: invoice.total_cents, paidCents: paid, dueDate: invoice.due_date },
      new Date(),
    );

    if (nowPaid) {
      void notifyStudio({
        kind: 'invoice_paid',
        title: `${invoice.invoice_number} is paid in full`,
        body: 'Remember to set aside roughly 30% for tax.',
        href: `${BASE_PATH}/studio/invoices/${invoice.id}`,
        subjectType: 'invoice',
        subjectId: invoice.id,
      });
    }
  }

  // ── EDIT ──
  // Line items are only editable while the invoice is a draft. Changing what a client owes after they
  // have been sent a number is a credit note, not an edit, and silently rewriting it is how two
  // parties end up holding different invoices with the same number.
  if (body.lineItems !== undefined) {
    if (invoice.status !== 'draft') {
      return NextResponse.json(
        { error: 'This invoice has already been sent. Void it and raise a new one instead of editing it.' },
        { status: 409 },
      );
    }
    const items = normalizeLineItems(body.lineItems);
    const totals = computeInvoiceTotals(items, {
      taxRateBasisPoints: Number(body.taxRateBasisPoints) || 0,
      discountCents: Number(body.discountCents) || 0,
    });
    patch.line_items = items;
    patch.subtotal_cents = totals.subtotalCents;
    patch.tax_cents = totals.taxCents;
    patch.discount_cents = totals.discountCents;
    patch.total_cents = totals.totalCents;
  }

  if (typeof body.title === 'string') patch.title = body.title.slice(0, 200) || null;
  if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 2000) || null;
  if (typeof body.issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.issueDate)) {
    patch.issue_date = body.issueDate;
    if (typeof body.termsDays === 'number') patch.due_date = dueDateFrom(body.issueDate, body.termsDays);
  }
  if (typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) patch.due_date = body.dueDate;

  if (body.send === true) {
    patch.status = 'sent';
    patch.sent_at = new Date().toISOString();
  }
  if (body.void === true) patch.status = 'void';

  const { data, error } = await supabaseAdmin
    .from('va_invoices')
    .update(patch)
    .eq('id', params.id)
    .select('id, invoice_number, status, total_cents, paid_cents, access_token')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data: invoice } = await supabaseAdmin.from('va_invoices').select('status').eq('id', params.id).maybeSingle();
  // Only drafts can be deleted. A sent invoice is a document someone else holds a copy of; making it
  // vanish leaves a gap in the numbering and no record of why. Void it instead — that is what void is.
  if (invoice && invoice.status !== 'draft') {
    return NextResponse.json({ error: 'Only drafts can be deleted. Void this one instead.' }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from('va_invoices').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
