// app/api/dnd/auth/password/route.ts — change your own password (P2-4a, audit F-3).
//
// The simplest half of recovery, and the one that was missing entirely: there was no way to change a
// password at all. Not "no reset flow" — no change control, for a signed-in user who knows their current
// password and simply wants a different one.
//
// Requires the OLD password even though the caller is already authenticated. A session cookie on a shared
// or borrowed machine should not be enough to lock the real owner out of their own account, which is
// exactly what changing the password without re-proving identity would allow.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, hashPassword, verifyPassword } from '@/lib/dnd/auth';
import { checkNewPassword, loginSubjects, callerIp } from '@/lib/dnd/password-policy';
import { checkRateLimit, rateLimitHeaders } from '@/lib/dnd/rate-limit';

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const current = String(body?.currentPassword ?? '');
  const next = String(body?.newPassword ?? '');
  if (!current) return NextResponse.json({ error: 'Your current password is required.' }, { status: 400 });

  // The new password is held to the CREATE floor — this is a password being set, so the 8-character rule
  // applies even though the account predates it. That is the one place an existing account is asked to meet
  // the new bar, and it is the right one: they are choosing a new secret, not being locked out of an old.
  const check = checkNewPassword(next);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // Throttled on the same counter as sign-in: this route verifies a password, so it is a guessing oracle
  // like any other.
  for (const subject of loginSubjects(session.displayName || session.email, callerIp(req.headers))) {
    const gate = await checkRateLimit('login', subject);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.message }, { status: 429, headers: rateLimitHeaders(gate, 'login') });
    }
  }

  const { data: user } = await supabaseAdmin
    .from('dnd_users')
    .select('id, password_hash')
    .eq('id', session.userId)
    .maybeSingle();
  const row = user as { id: string; password_hash: string | null } | null;
  if (!row?.password_hash || !(await verifyPassword(current, row.password_hash))) {
    return NextResponse.json({ error: 'That is not your current password.' }, { status: 401 });
  }

  const password_hash = await hashPassword(next);
  const { error } = await supabaseAdmin.from('dnd_users').update({ password_hash }).eq('id', session.userId);
  if (error) return NextResponse.json({ error: 'Could not change your password.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
