// app/api/public/pay-gate/route.ts
//
// S7 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — temporary password wall for
// the customer-facing /pay portal, while the payment system is still being
// finished. Removable at launch by clearing the PAY_PORTAL_PASSWORD env var
// (gate then reports `required: false` and the portal is open to everyone).
//
//   GET  /api/public/pay-gate   → { required, unlocked }
//   POST /api/public/pay-gate   { password } → sets the unlock cookie or 401
//
// The unlock cookie stores a hash of the password (not the password itself),
// httpOnly, so rotating PAY_PORTAL_PASSWORD invalidates old unlocks. This is a
// soft launch gate, NOT account security — real customer auth is the invoice
// number + slug on the invoice itself.

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const COOKIE = 'pay_gate';

function expectedToken(password: string): string {
  return createHash('sha256').update(`pay-gate:${password}`).digest('hex').slice(0, 32);
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const password = process.env.PAY_PORTAL_PASSWORD ?? '';
  const required = password.length > 0;
  const cookie = req.cookies.get(COOKIE)?.value ?? '';
  const unlocked = !required || cookie === expectedToken(password);
  return NextResponse.json({ required, unlocked });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const password = process.env.PAY_PORTAL_PASSWORD ?? '';
  if (password.length === 0) {
    // Gate disabled — nothing to unlock.
    return NextResponse.json({ ok: true, required: false });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const attempt = typeof body.password === 'string' ? body.password : '';
  if (attempt !== password) {
    return NextResponse.json({ ok: false, error: 'Incorrect password.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, expectedToken(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
});
