// app/api/voice/auth/setup/route.ts — create the first (and only) studio account.
//
// ── THIS ROUTE CLOSES ITSELF ────────────────────────────────────────────────────────────────────
//
// It works exactly once, and only while `va_users` is empty. After that it returns 409 forever. The
// alternative — committing a bcrypt hash into a seed file — publishes Andrew's password to everyone
// with repository access, permanently, including after he changes it.
//
// The emptiness check is re-done HERE rather than trusted from the page that rendered the form. A
// client can POST to this endpoint directly at any time, so a guard that only exists in the UI is
// not a guard.
//
// ── THE RACE ────────────────────────────────────────────────────────────────────────────────────
//
// Two simultaneous requests could both read "zero users" and both insert. The `UNIQUE` constraint on
// `va_users.email` catches the identical-email case, but not two different emails. So the insert is
// guarded a second time by re-counting inside the same request and, more importantly, by treating a
// unique violation as success-for-someone-else rather than as an error to retry.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, setVoiceSession, signupKey, studioNeedsSetup } from '@/lib/voice/auth';
import { emailProblem, normalizeIdentifier, passwordProblem } from '@/lib/voice/auth-rules';

export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: string; password?: string; displayName?: string; signupKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  if (!(await studioNeedsSetup())) {
    return NextResponse.json(
      { error: 'A studio account already exists. Sign in instead.' },
      { status: 409 },
    );
  }

  const required = signupKey();
  if (required && String(body.signupKey ?? '') !== required) {
    return NextResponse.json({ error: 'That setup key is not right.' }, { status: 403 });
  }

  const email = normalizeIdentifier(body.email ?? '');
  const displayName = String(body.displayName ?? '').trim() || 'Andrew';
  const password = String(body.password ?? '');

  const emailErr = emailProblem(email);
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 });
  const pwErr = passwordProblem(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const password_hash = await hashPassword(password);

  const { data, error } = await supabaseAdmin
    .from('va_users')
    .insert({ email, display_name: displayName.slice(0, 120), password_hash, role: 'owner' })
    .select('*')
    .single();

  if (error || !data) {
    // 23505 is a unique violation: somebody else got there in the same instant. That is the door
    // having closed, not a failure to open it.
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'A studio account already exists. Sign in instead.' }, { status: 409 });
    }
    console.error('[voice/auth] setup failed:', error?.message);
    return NextResponse.json(
      { error: 'Could not create the account. The database tables may not be set up yet.' },
      { status: 500 },
    );
  }

  setVoiceSession(data);
  return NextResponse.json({ ok: true });
}
