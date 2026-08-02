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

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are both required.' }, { status: 400 });
  }

  const { data: user, error } = await supabaseAdmin
    .from('va_users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

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
