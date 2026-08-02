// app/api/voice/invoices/route.ts — list and create invoices.
//
// ── TOTALS ARE COMPUTED HERE, NEVER ACCEPTED FROM THE CLIENT ────────────────────────────────────
//
// The browser sends line items. It does NOT send a total, and if it did, this route would ignore it.
// `computeInvoiceTotals` in lib/voice/money.ts is the only thing allowed to derive a total, so the
// number on the invoice, the number in the portal, and the number charged to a card are the same
// number by construction rather than by three call sites agreeing.
//
// It also means a client cannot post `{ total_cents: 1 }` alongside real line items and pay a dollar
// for a $1,200 job — which is the version of this bug that matters.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { generatePrefixedToken } from '@/lib/voice/tokens';
import {
  computeInvoiceTotals,
  dueDateFrom,
  nextDocumentNumber,
  normalizeLineItems,
} from '@/lib/voice/money';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function GET(): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from('va_invoices')
    .select('*, client:va_clients(id, name, email, company)')
    .order('issue_date', { ascending: false })
    .limit(400);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoices: data ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: {
    clientId?: string;
    title?: string;
    lineItems?: unknown;
    taxRateBasisPoints?: number;
    discountCents?: number;
    notes?: string;
    issueDate?: string;
    contractId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  if (!body.clientId) return NextResponse.json({ error: 'Choose a client first.' }, { status: 400 });

  const items = normalizeLineItems(body.lineItems);
  const totals = computeInvoiceTotals(items, {
    taxRateBasisPoints: body.taxRateBasisPoints,
    discountCents: body.discountCents,
  });

  // Settings supply the prefix and the payment terms, so changing "net 14" to "net 30" is one field
  // in one place rather than a number retyped on every invoice.
  const { data: settings } = await supabaseAdmin
    .from('va_settings')
    .select('invoice_prefix, invoice_terms_days')
    .eq('id', 1)
    .maybeSingle();

  const prefix = settings?.invoice_prefix || 'AAV';
  const terms = Number.isFinite(settings?.invoice_terms_days) ? settings.invoice_terms_days : 14;

  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.issueDate ?? ''))
    ? String(body.issueDate)
    : new Date().toISOString().slice(0, 10);
  const year = Number(issueDate.slice(0, 4));

  // Numbering is derived from the highest EXISTING number, not from a count — deleting a draft must
  // not cause the next invoice to reuse a number a client already has in their inbox.
  const { data: existing } = await supabaseAdmin
    .from('va_invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}-${year}-%`);

  const invoiceNumber = nextDocumentNumber(
    prefix,
    (existing ?? []).map((r: { invoice_number: string }) => r.invoice_number),
    year,
  );

  const { data, error } = await supabaseAdmin
    .from('va_invoices')
    .insert({
      client_id: body.clientId,
      contract_id: body.contractId ?? null,
      invoice_number: invoiceNumber,
      title: body.title?.slice(0, 200) ?? null,
      line_items: items,
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      discount_cents: totals.discountCents,
      total_cents: totals.totalCents,
      status: 'draft',
      issue_date: issueDate,
      due_date: dueDateFrom(issueDate, terms),
      notes: body.notes?.slice(0, 2000) ?? null,
      access_token: generatePrefixedToken('inv'),
    })
    .select('id, invoice_number')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}
