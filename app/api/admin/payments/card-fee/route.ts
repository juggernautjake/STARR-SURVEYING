// app/api/admin/payments/card-fee/route.ts — the card processing fee the office prices with.
//
//   GET → { card_fee: { bps, fixed_cents } | null }
//
// The quote calculator and the invoice builder are browser pages and cannot read the server's
// settings (CARD_FEE_PERCENT, CARD_FEE_FIXED_CENTS, NONCARD_DISCOUNT), so they ask here — and so
// price with exactly the fee the pay page will discount. lib/payments/pay-discount.ts.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { cardFee } from '@/lib/payments/pay-discount';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const fee = cardFee();
  return NextResponse.json({ card_fee: fee ? { bps: fee.bps, fixed_cents: fee.fixedCents } : null });
}, { routeName: 'admin/payments/card-fee' });
