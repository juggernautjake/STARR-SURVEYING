// app/api/admin/invoices/route.ts
//
// P3b of payment-infrastructure-2026-06-18.md — office-side invoice
// list + create.
//
//   GET   /api/admin/invoices                    → { invoices: [...] }
//   POST  /api/admin/invoices  application/json  → { invoice }
//
// POST body:
//   {
//     customer_email, customer_name, customer_phone,
//     billing_address: { street, city, state, zip },
//     line_items: [{ description, quantity, unit_price_cents, total_cents }],
//     tax_cents?, notes?, due_at?, job_id?,
//   }
//
// The route auto-mints invoice_number + public_slug, computes
// totals, and writes a `draft` row. The /send endpoint flips it to
// `issued`.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  computeInvoiceTotals,
  generateInvoiceNumber,
  generatePublicSlug,
  normalizeLineItem,
} from '@/lib/payments/invoice-number';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, public_slug, status, customer_name, customer_email, total_cents, issued_at, due_at, paid_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoices: data ?? [] });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await req.json()) as Record<string, unknown>;

  const lineItems = Array.isArray(body.line_items)
    ? body.line_items.map(normalizeLineItem).filter((r): r is NonNullable<typeof r> => r !== null)
    : [];
  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'At least one line item is required.' }, { status: 400 });
  }

  const taxCents = typeof body.tax_cents === 'number' ? body.tax_cents : 0;
  const totals = computeInvoiceTotals(lineItems, taxCents);

  // Generate identifiers — retry on the rare slug/number collision.
  let invoice_number = '';
  let public_slug = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    invoice_number = generateInvoiceNumber(new Date(), Math.random);
    public_slug = generatePublicSlug(Math.random);
    const { data: collision } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .or(`invoice_number.eq.${invoice_number},public_slug.eq.${public_slug}`)
      .maybeSingle();
    if (!collision) break;
    if (attempt === 4) {
      return NextResponse.json({ error: 'Could not generate a unique invoice number — please retry.' }, { status: 500 });
    }
  }

  const insertRow: Record<string, unknown> = {
    invoice_number,
    public_slug,
    customer_email: typeof body.customer_email === 'string' ? body.customer_email.trim() || null : null,
    customer_name: typeof body.customer_name === 'string' ? body.customer_name.trim() || null : null,
    customer_phone: typeof body.customer_phone === 'string' ? body.customer_phone.trim() || null : null,
    billing_address: body.billing_address && typeof body.billing_address === 'object' ? body.billing_address : {},
    line_items: lineItems,
    subtotal_cents: totals.subtotal_cents,
    tax_cents: totals.tax_cents,
    total_cents: totals.total_cents,
    notes: typeof body.notes === 'string' ? body.notes : null,
    due_at: typeof body.due_at === 'string' ? body.due_at : null,
    job_id: typeof body.job_id === 'string' ? body.job_id : null,
    status: 'draft',
    created_by: session.user.email ?? null,
  };

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .insert(insertRow)
    .select('id, invoice_number, public_slug, status, customer_name, customer_email, total_cents, due_at, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invoice });
});
