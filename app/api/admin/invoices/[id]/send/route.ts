// app/api/admin/invoices/[id]/send/route.ts
//
// P3b of payment-infrastructure-2026-06-18.md — sends an invoice to
// the customer via Resend with a payment link, then flips the row's
// status from `draft` → `issued` (or re-sends if it's already
// `issued`).
//
//   POST  /api/admin/invoices/{id}/send  application/json
//     body: { to?: string }    // override recipient, defaults to invoice.customer_email
//
// Returns { sent: true, resend_id: string|null, pay_link: string }.
//
// In dev (no RESEND_API_KEY), the route logs the send + still flips
// the status so the office can preview the flow end-to-end.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { buildInvoicePayLink } from '@/lib/payments/invoice-number';
import {
  buildInvoiceEmailHtml,
  buildInvoiceEmailSubject,
  buildInvoiceEmailText,
} from '@/lib/payments/invoice-email';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // …/invoices/<id>/send — id is the second-to-last segment.
  const invoiceId = segments[segments.length - 2];
  if (!invoiceId) {
    return NextResponse.json({ error: 'Missing invoice id' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { to?: string };

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, public_slug, status, customer_name, customer_email, line_items, subtotal_cents, tax_cents, total_cents, due_at, notes')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  if (invoice.status === 'voided') {
    return NextResponse.json({ error: 'Cannot send a voided invoice.' }, { status: 409 });
  }

  const recipient = (body.to ?? invoice.customer_email ?? '').trim();
  if (!recipient) {
    return NextResponse.json({ error: 'No customer email on file. Type a recipient address.' }, { status: 400 });
  }

  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'https://starr-surveying.com';
  const payLink = buildInvoicePayLink(host, invoice.public_slug);

  const subject = buildInvoiceEmailSubject({ invoice_number: invoice.invoice_number });
  const html = buildInvoiceEmailHtml({
    invoice_number: invoice.invoice_number,
    customer_name: invoice.customer_name,
    pay_link: payLink,
    line_items: Array.isArray(invoice.line_items) ? invoice.line_items : [],
    subtotal_cents: invoice.subtotal_cents ?? 0,
    tax_cents: invoice.tax_cents ?? 0,
    total_cents: invoice.total_cents ?? 0,
    due_at: invoice.due_at,
    notes: invoice.notes,
  });
  const text = buildInvoiceEmailText({
    invoice_number: invoice.invoice_number,
    customer_name: invoice.customer_name,
    pay_link: payLink,
    line_items: Array.isArray(invoice.line_items) ? invoice.line_items : [],
    subtotal_cents: invoice.subtotal_cents ?? 0,
    tax_cents: invoice.tax_cents ?? 0,
    total_cents: invoice.total_cents ?? 0,
    due_at: invoice.due_at,
    notes: invoice.notes,
  });

  let resendId: string | null = null;
  let sendError: string | null = null;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY && RESEND_API_KEY !== 'your_resend_api_key') {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Starr Surveying <info@starr-surveying.com>',
          to: [recipient],
          reply_to: 'info@starr-surveying.com',
          subject,
          html,
          text,
        }),
      });
      if (resp.ok) {
        const json = (await resp.json()) as { id?: string };
        resendId = json.id ?? null;
      } else {
        sendError = `Resend returned ${resp.status}: ${await resp.text()}`;
      }
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
    }
  } else {
    sendError = 'RESEND_API_KEY not configured (dev mode)';
    console.log(`[invoice-send] DEV — would send to ${recipient}: ${subject}\n${payLink}`);
  }

  // Flip the status to `issued` if it was a draft; leave `issued`
  // alone on re-sends. Stamp issued_at the first time only.
  const updates: Record<string, unknown> = {};
  if (invoice.status === 'draft') {
    updates.status = 'issued';
    updates.issued_at = new Date().toISOString();
  }
  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('invoices').update(updates).eq('id', invoice.id);
  }

  return NextResponse.json({
    sent: !sendError,
    resend_id: resendId,
    send_error: sendError,
    pay_link: payLink,
    recipient,
  });
});
