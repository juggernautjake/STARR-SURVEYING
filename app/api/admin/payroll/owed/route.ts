// app/api/admin/payroll/owed/route.ts
//
// WHAT EACH PERSON IS OWED RIGHT NOW
// ══════════════════════════════════
//
// *"This will all be calculated to show how much is owed since the last payout to that employee."*
//
//   GET                  — every employee with a balance (admin only)
//   GET ?email=<email>   — one person; an employee may ask about themselves
//
// The read is `lib/payroll/owed-loader.ts` and the arithmetic is `lib/payroll/owed.ts`, shared with
// the payout builder so the number shown and the number paid cannot differ.
//
// The balance is a **running total**, not a date window: every approved hour minus every committed
// payout. A window loses late-logged entries — somebody who forgets Thursday and logs it next week
// produces a row dated before a payout that already went out, and a date filter drops it silently.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadOwed } from '@/lib/payroll/owed-loader';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = new URL(req.url).searchParams.get('email');
  const admin = isAdmin(session.user.roles);

  // A person may always ask what they are owed. Anyone else's balance is an admin question.
  if (!admin && email && email.toLowerCase() !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { rows, error } = await loadOwed(admin ? email : session.user.email);
  if (error) {
    // Refused rather than partial. A balance missing its decisions or its payouts is a wrong number
    // presented as a right one, and it is the number somebody gets paid.
    return NextResponse.json({ error: `No balance was calculated — ${error}` }, { status: 500 });
  }

  return NextResponse.json({
    owed: rows,
    totalOwedCents: rows.reduce((sum, r) => sum + Math.max(0, r.owedCents), 0),
    // Counted separately: an overpayment is not a negative debt to net off against what other
    // people are owed. Netting them would make a firm-wide total that pays nobody correctly.
    overpaid: rows.filter((r) => r.owedCents < 0).map((r) => ({ user_email: r.user_email, byCents: -r.owedCents })),
  });
}, { routeName: 'payroll/owed' });
