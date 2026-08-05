// app/api/admin/payouts/search/route.ts
//
// EVERY PAYOUT, AND ONE SPECIFIC PAYOUT
// ═════════════════════════════════════
//
// *"We need to be able to track all payouts for everyone and find specific payouts."*
//
//   GET ?q=&method=&status=&from=&to=&min=&max=&batch=&committedOnly=
//
// Reads `payout_batch_items` through `lib/payroll/payout-ledger.ts` — the one ledger. Note what
// this is NOT: `/admin/payout-log` is labelled "Payout History" and shows `payout_log`, whose
// columns are `old_rate` / `new_rate` / `old_role` / `new_role`. That is a record of pay CHANGES,
// not of payments, and somebody looking for "where is the record of the $190 we paid Jane" would
// find rate changes there. This endpoint is the one that answers that question.
//
// An empty query returns everything. "No criteria" means "show me all of them" — a search that
// opens blank because nothing was typed is the absence-as-answer defect in miniature.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { readPayouts, filterPayouts, totalPaidCents, isSettledPayout } from '@/lib/payroll/payout-ledger';
import { normalizePayoutMethod, payoutMethodLabel } from '@/lib/payouts/methods';

const num = (v: string | null): number | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const admin = isAdmin(session.user.roles);

  // An employee may search their OWN payouts — "when was I paid, and how" is a reasonable question
  // to be able to answer without asking the office. Anyone else's is an admin question.
  const requested = p.get('email');
  if (!admin && requested && requested.toLowerCase() !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scopeTo = admin ? (requested ?? undefined) : session.user.email;

  const { payouts, error } = await readPayouts({
    userEmail: scopeTo,
    from: p.get('from'),
    to: p.get('to'),
    limit: 5000,
  });

  // Named rather than swallowed. A search that quietly returns fewer rows than exist is worse than
  // one that fails, because the reader concludes the payment was never made.
  if (error) return NextResponse.json({ error: `The payout ledger could not be read: ${error}` }, { status: 500 });

  // Dollars in the query string, cents in the ledger. Converted here, once.
  const minDollars = num(p.get('min'));
  const maxDollars = num(p.get('max'));

  const results = filterPayouts(payouts, {
    text: p.get('q'),
    method: normalizePayoutMethod(p.get('method')),
    status: p.get('status'),
    batchId: p.get('batch'),
    minCents: minDollars === null ? null : Math.round(minDollars * 100),
    maxCents: maxDollars === null ? null : Math.round(maxDollars * 100),
    committedOnly: p.get('committedOnly') === 'true',
  });

  const settled = results.filter(isSettledPayout);

  return NextResponse.json({
    payouts: results.map((r) => ({ ...r, method_label: payoutMethodLabel(r.method) })),
    count: results.length,
    // Two totals, because they answer different questions. What was committed is what the firm
    // promised; what settled is what actually reached people. One number pretending to be both is
    // how a reconciliation goes wrong.
    totalCents: totalPaidCents(results),
    settledCents: totalPaidCents(settled),
    settledCount: settled.length,
    // Stated so an empty result is readable: nothing matched, versus nothing exists.
    ledgerSize: payouts.length,
  });
}, { routeName: 'payouts/search' });
