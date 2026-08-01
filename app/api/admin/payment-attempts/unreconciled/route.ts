// app/api/admin/payment-attempts/unreconciled/route.ts — the claims nobody has matched to money (C1-2).
//
//   GET ?days=5  → { claims: [...], asOf, afterDays }
//
// The analysis: *"The deep-link methods rely on the customer pressing 'I sent it', so the office queue is
// a claim, not a fact. A report of claims with no matching payment after N days is the control that makes
// it trustworthy."*
//
// ── A WORKLIST, NOT AN ALERT ───────────────────────────────────────────────────────────────────────
//
// Almost every row here is a customer who genuinely paid and an office that has not reconciled the bank
// yet. The wording says "check the bank", not "unpaid", because the one thing that would waste this
// feature is somebody chasing a paying customer over a Zelle that simply had not settled.
//
// Admin-gated like every other route under `/api/admin`, and the rule is stated because the data is
// customer payment behaviour: who claimed what, when, and whether it arrived.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  STALE_AFTER_DAYS, describeClaim, staleClaims,
  type AttemptRow, type PaymentRow,
} from '@/lib/payments/reconcile';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Bounded both ways. Zero would list every claim ever made, including the one submitted a minute ago,
  // and a list that includes everything is a list nobody reads.
  const raw = Number(req.nextUrl.searchParams.get('days'));
  const afterDays = Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.round(raw))) : STALE_AFTER_DAYS;

  const { data: attempts, error: aErr } = await supabaseAdmin
    .from('payment_attempts')
    .select('id, invoice_id, method, intended_amount_cents, status, created_at, resulted_in_payment_id, payer_email');
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const invoiceIds = [...new Set(((attempts ?? []) as AttemptRow[]).map((a) => a.invoice_id))];
  // Only the invoices a claim points at. Reading every payment ever taken to answer a question about
  // eleven of them is the kind of query that is free today and a timeout in two years.
  const { data: payments } = invoiceIds.length
    ? await supabaseAdmin
      .from('payments')
      .select('id, invoice_id, amount_cents, method, status, cleared_at, created_at')
      .in('invoice_id', invoiceIds)
    : { data: [] as PaymentRow[] };

  const asOf = Date.now();
  const claims = staleClaims((attempts ?? []) as AttemptRow[], (payments ?? []) as PaymentRow[], { asOf, afterDays });

  // The invoice numbers, so the office can act without a second lookup per row.
  const claimInvoiceIds = [...new Set(claims.map((c) => c.attempt.invoice_id))];
  const { data: invoices } = claimInvoiceIds.length
    ? await supabaseAdmin
      .from('customer_invoices')
      .select('id, invoice_number, customer_name, total_cents')
      .in('id', claimInvoiceIds)
    : { data: [] as Array<{ id: string; invoice_number: string; customer_name: string | null; total_cents: number }> };
  type InvoiceRow = { id: string; invoice_number: string; customer_name: string | null; total_cents: number };
  const byId = new Map(((invoices ?? []) as InvoiceRow[]).map((i) => [i.id, i]));

  return NextResponse.json({
    asOf: new Date(asOf).toISOString(),
    afterDays,
    claims: claims.map((c) => ({
      id: c.attempt.id,
      method: c.attempt.method,
      reason: c.reason,
      ageDays: c.ageDays,
      claimedCents: c.attempt.intended_amount_cents,
      paidCents: c.paidCents,
      payerEmail: c.attempt.payer_email,
      invoice: byId.get(c.attempt.invoice_id) ?? null,
      // The sentence the office reads. Built server-side so the API and any UI cannot word it two
      // different ways — and the wording is the part that keeps this a worklist rather than an accusation.
      note: describeClaim(c),
    })),
  });
});
