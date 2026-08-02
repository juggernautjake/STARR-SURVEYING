// app/api/voice/auth/login/route.ts — sign in to the studio.
//
// ── THE RESPONSE IS THE SAME WHETHER THE ACCOUNT EXISTS OR NOT ──────────────────────────────────
//
// "No account with that email" and "wrong password" are one message: "Email or password is not
// right." Distinguishing them turns the login form into an account-enumeration oracle — anyone can
// discover which addresses have studio accounts, which is the first step of a targeted attack and is
// worth nothing to a legitimate user who already knows their own email.
//
// The timing is levelled too. Without the dummy hash comparison, a missing account returns in ~1ms
// and a wrong password in ~80ms (bcrypt is deliberately slow), so the response TIME answers the
// question the response BODY refuses to.

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';
import { setVoiceSession, verifyPassword } from '@/lib/voice/auth';
import { normalizeIdentifier } from '@/lib/voice/auth-rules';

// A real bcrypt hash of a random string. Compared against when no account is found, purely so the
// failure path costs the same wall-clock time as the wrong-password path.
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  // Username OR email — `va_users.email` is really the unique login key. Normalised the same way it
  // was normalised on the way in, or `Jake` would never match the stored `jake`.
  const email = normalizeIdentifier(body.email ?? '');
  const password = String(body.password ?? '');

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are both required.' }, { status: 400 });
  }

  // Either column signs you in. `.or()` rather than two round trips, and `maybeSingle` is replaced by
  // `limit(1)` because a malformed row set (the same string in one person's email and another's
  // username — prevented by the indexes, but not by this query) would make `maybeSingle` throw rather
  // than simply pick one.
  const { data: rows, error } = await supabaseAdmin
    .from('va_users')
    .select('*')
    .or(`email.eq.${email},username.eq.${email}`)
    .limit(1);

  const user = rows?.[0] ?? null;

  if (error) {
    console.error('[voice/auth] lookup failed:', error.message);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return NextResponse.json({ error: 'Email or password is not right.' }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: 'Email or password is not right.' }, { status: 401 });
  }

  setVoiceSession(user);
  // Best-effort: a failed timestamp write must not fail the sign-in.
  void supabaseAdmin.from('va_users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  return NextResponse.json({ ok: true });
}
