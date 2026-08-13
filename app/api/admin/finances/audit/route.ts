// app/api/admin/finances/audit/route.ts
//
//   GET /api/admin/finances/audit?from=YYYY-MM-DD&to=YYYY-MM-DD[&narrative=0]
//
// Owner ask, 2026-08-08: *"run an AI audit of all receipts and expenditures and invoices for a given
// period to make sure they are all correct and make sense… easy to use with the click of a button."*
//
// ── TWO PASSES, AND THE ORDER IS THE WHOLE DESIGN ──────────────────────────────────────────────
//
//   1. `auditBooks()` — pure TypeScript. Every finding whose answer is a FACT: duplicates,
//      uncategorised rows, invoices marked paid with no payment behind them, inverted timestamps.
//      All computed from the rows themselves.
//   2. Claude — receives ONLY those findings and the period totals, and does the part that is
//      genuinely judgement: what to look at first, what the innocent explanation probably is, and
//      what pattern spans several findings that no single rule could see.
//
// The model never receives the ledger, so it cannot invent a number: every figure in its narrative
// was calculated in step 1. That constraint is the point. An audit that hallucinates a discrepancy
// costs somebody an afternoon hunting for money that was never missing, and after that happens once
// nobody runs the audit again.
//
// ── IT WORKS WITH THE AI SWITCHED OFF ──────────────────────────────────────────────────────────
//
// No API key, a timeout, a bad day at a third-party provider — the endpoint still returns the full
// deterministic report and says the narrative is unavailable. A financial control that goes dark
// when someone else's service does is not a control.

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { modelFor } from '@/lib/ai/models';
import { microsToCents } from '@/lib/integrations/google-ads/spend';
import {
  auditBooks,
  type AuditInvoice,
  type AuditPayment,
  type AuditReceipt,
} from '@/lib/finances/books-audit';

// The deterministic sweep is fast; the model pass is the slow half and it streams nothing, so give
// it room rather than truncating a report somebody is waiting on.
export const maxDuration = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const wantNarrative = url.searchParams.get('narrative') !== '0';

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return NextResponse.json({ error: 'from + to must be YYYY-MM-DD' }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be on or before to.' }, { status: 400 });
  }

  const fromTs = `${from}T00:00:00Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const [recRes, invRes, payRes, adRes] = await Promise.all([
    supabaseAdmin
      .from('receipts')
      .select('id, vendor_name, category, tax_deductible_flag, total_cents, status, transaction_at, created_at')
      .in('status', ['approved', 'exported'])
      .is('deleted_at', null)
      // Seed 590 — one purchase, two rows: the superseded bill is kept for its itemisation and
      // must not reach an audit total as a second expense.
      .is('superseded_by_receipt_id', null)
      // Seed 591 — a purchase somebody marked personal is not the business's, whatever card paid
      // for it. NULL still counts: a receipt nobody has questioned is a business purchase.
      .or('expense_nature.is.null,expense_nature.eq.business')
      .gte('transaction_at', fromTs)
      .lte('transaction_at', toTs),
    supabaseAdmin
      .from('customer_invoices')
      .select('id, invoice_number, status, customer_name, total_cents, issued_at, due_at, paid_at')
      .gte('created_at', fromTs)
      .lte('created_at', toTs),
    // Payments are fetched WITHOUT a date filter on purpose: an invoice raised in June and paid in
    // July must not be reported as "paid with no payment recorded" simply because the payment fell
    // outside the window being audited.
    supabaseAdmin.from('payments').select('invoice_id, amount_cents, status'),
    // `spend_date` is a DATE — bare YYYY-MM-DD, or the first day of the range is dropped.
    supabaseAdmin.from('ad_spend_daily').select('cost_micros').gte('spend_date', from).lte('spend_date', to),
  ]);

  const firstError = recRes.error || invRes.error || payRes.error || adRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const adSpendCents = microsToCents(
    ((adRes.data ?? []) as Array<{ cost_micros: number | string | null }>)
      .reduce((s, r) => s + Math.max(0, Number(r.cost_micros ?? 0)), 0),
  );

  const report = auditBooks({
    from,
    to,
    receipts: (recRes.data ?? []) as AuditReceipt[],
    invoices: (invRes.data ?? []) as AuditInvoice[],
    payments: (payRes.data ?? []) as AuditPayment[],
    adSpendCents,
  });

  if (!wantNarrative || report.findings.length === 0) {
    return NextResponse.json({
      ...report,
      narrative: report.findings.length === 0
        ? 'Nothing to flag. Every automated check passed for this period.'
        : null,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ...report,
      narrative: null,
      narrative_error: 'The written summary is offline (no API key). The checks above still ran.',
    });
  }

  const cfg = modelFor('reasoning');
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  const system = [
    'You are reviewing an automated audit of a small Texas land surveying firm\'s books for one period.',
    '',
    'THE FINDINGS BELOW ARE FACTS, ALREADY COMPUTED. Do not recalculate them, do not doubt them, and',
    'do not invent any figure that is not present. You are not being asked to audit the ledger — you',
    'are being asked what a competent bookkeeper would make of these findings.',
    '',
    'Write for the owner, who is a surveyor and not an accountant. Be concrete and calm. Specifically:',
    '  1. Open with one sentence on whether this period looks healthy or needs work.',
    '  2. Say what to look at FIRST and why — usually the largest high-severity item.',
    '  3. For each significant finding, give the most likely INNOCENT explanation as well as the',
    '     worrying one. Most of these turn out to be ordinary.',
    '  4. Note any pattern that spans several findings, which the individual rules cannot see.',
    '  5. If something is probably fine, say so plainly. Do not manufacture concern.',
    '',
    'Under 300 words. Plain prose, no headings, no markdown, no bullet characters.',
  ].join('\n');

  const brief = [
    `Period: ${from} to ${to}`,
    `Receipts: ${report.totals.receipt_count} totalling ${money(report.totals.receipt_cents)}`,
    `Invoices: ${report.totals.invoice_count} totalling ${money(report.totals.invoiced_cents)}, of which ${money(report.totals.paid_cents)} is paid`,
    `Advertising: ${money(report.totals.ad_spend_cents)}`,
    `Money the checks have questions about: ${money(report.questioned_cents)}`,
    '',
    'Findings:',
    ...report.findings.map(
      (f) => `- [${f.severity}] ${f.title} — ${f.detail}${f.amount_cents ? ` (${money(f.amount_cents)})` : ''}`,
    ),
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: cfg.model,
        max_tokens: 2000,
        // Read EVERY text block, not content[0]. On this model thinking is on by default, so the
        // response arrives as [thinking, text] and index 0 is a thinking block whose text is empty.
        // That exact mistake took down the FS definitions popup on 2026-08-06.
        output_config: { effort: 'medium' },
        system,
        messages: [{ role: 'user', content: brief }],
      },
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    const narrative = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return NextResponse.json({
      ...report,
      narrative: narrative || null,
      narrative_error: narrative ? undefined : 'The model returned no summary. The checks above still ran.',
    });
  } catch (err) {
    clearTimeout(timeout);
    // The deterministic report is the product; the narrative is a convenience. Failing the whole
    // request because the prose failed would throw away the half that cannot be wrong.
    return NextResponse.json({
      ...report,
      narrative: null,
      narrative_error:
        err instanceof Error && err.name === 'AbortError'
          ? 'The written summary timed out. The checks above still ran.'
          : 'The written summary could not be generated. The checks above still ran.',
    });
  }
}, { routeName: 'admin/finances/audit#get' });
