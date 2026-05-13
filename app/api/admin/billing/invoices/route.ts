// app/api/admin/billing/invoices/route.ts
//
// Invoice list API for the customer billing portal. Phase D-2.
// Reads from public.invoices (mirrored from Stripe via webhook).

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) {
    return NextResponse.json({ invoices: [] });
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id, stripe_invoice_id, number, status, amount_due_cents, amount_paid_cents, amount_refunded_cents, currency, period_start, period_end, hosted_invoice_url, invoice_pdf_url, created_at')
    .eq('org_id', user.default_org_id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[billing/invoices] query failed', error);
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }

  const invoices = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    stripeInvoiceId: r.stripe_invoice_id as string,
    number: (r.number as string | null) ?? null,
    status: r.status as string,
    amountDueCents: (r.amount_due_cents as number) ?? 0,
    amountPaidCents: (r.amount_paid_cents as number) ?? 0,
    amountRefundedCents: (r.amount_refunded_cents as number) ?? 0,
    currency: (r.currency as string) ?? 'usd',
    periodStart: (r.period_start as string | null) ?? null,
    periodEnd: (r.period_end as string | null) ?? null,
    hostedUrl: (r.hosted_invoice_url as string | null) ?? null,
    pdfUrl: (r.invoice_pdf_url as string | null) ?? null,
    createdAt: r.created_at as string,
  }));

  return NextResponse.json({ invoices });
}
