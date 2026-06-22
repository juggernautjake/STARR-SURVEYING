// app/api/admin/payment-attempts/route.ts
//
// P10 of payment-infrastructure-2026-06-18.md — admin-gated GET
// that lists every pending payment_attempts row + the invoice it
// belongs to. Backs `/admin/payments/inbox`.
//
//   GET  /api/admin/payment-attempts        → { attempts: [...] }
//
// Pending statuses: 'pledged' (cash / check) + 'pending_confirmation'
// (Venmo / CashApp / Zelle "I sent it" claims). Sort newest-first.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  interface RawAttempt {
    id: string;
    method: string;
    status: string;
    intended_amount_cents: number;
    payer_email: string | null;
    payer_message: string | null;
    external_ref: string | null;
    created_at: string;
    invoice_id: string;
  }
  interface RawInvoice {
    id: string;
    invoice_number: string;
    customer_name: string | null;
    customer_email: string | null;
    total_cents: number;
    status: string;
  }

  const { data: attempts, error } = await supabaseAdmin
    .from('payment_attempts')
    .select('id, method, status, intended_amount_cents, payer_email, payer_message, external_ref, created_at, invoice_id')
    .in('status', ['pledged', 'pending_confirmation'])
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const attemptRows = (attempts ?? []) as RawAttempt[];

  const invoiceIds = Array.from(new Set(attemptRows.map((a) => a.invoice_id)));
  const invoiceMap = new Map<string, RawInvoice>();
  if (invoiceIds.length > 0) {
    const { data: invoices } = await supabaseAdmin
      .from('customer_invoices')
      .select('id, invoice_number, customer_name, customer_email, total_cents, status')
      .in('id', invoiceIds);
    for (const inv of (invoices ?? []) as RawInvoice[]) {
      invoiceMap.set(inv.id, inv);
    }
  }

  return NextResponse.json({
    attempts: attemptRows.map((a) => ({
      ...a,
      invoice: invoiceMap.get(a.invoice_id) ?? null,
    })),
  });
});
