// app/api/voice/team/route.ts — adding a second person to the studio.
//
// The setup route creates the FIRST account and then closes permanently. This is how the second one
// gets made: an existing signed-in owner adds it. That is the right shape — account creation on this
// platform is either "nobody exists yet" or "somebody who is already in vouches for you", and there
// is never an open registration form.
//
// Both accounts here are owners. There is no meaningful privilege split between Andrew and the person
// who built the site for him, and inventing one would be ceremony over a two-person business. The
// `assistant` role exists in the schema for when that stops being true.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession, hashPassword, setVoiceSession, verifyPassword } from '@/lib/voice/auth';
import { emailProblem, normalizeIdentifier, passwordProblem } from '@/lib/voice/auth-rules';

export async function GET(): Promise<NextResponse> {
  const session = getVoiceSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('va_users')
    .select('id, email, display_name, role, last_login_at, created_at')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = getVoiceSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: { email?: string; password?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const email = normalizeIdentifier(body.email ?? '');
  const displayName = String(body.displayName ?? '').trim() || email.split('@')[0];
  const password = String(body.password ?? '');

  const emailErr = emailProblem(email);
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 });
  const pwErr = passwordProblem(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  // A small cap, stated as a rule rather than left implicit. This is a two-person business; a studio
  // quietly accumulating twelve accounts is a sign something has gone wrong, not a feature.
  const { count } = await supabaseAdmin.from('va_users').select('id', { count: 'exact', head: true });
  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: 'That is five studio accounts already. Remove one before adding another.' },
      { status: 409 },
    );
  }

  const password_hash = await hashPassword(password);

  const { data, error } = await supabaseAdmin
    .from('va_users')
    .insert({ email, display_name: displayName.slice(0, 120), password_hash, role: 'owner' })
    .select('id, email, display_name, role')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Someone already uses that email address.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

/**
 * Change a username, a display name or a password.
 *
 * ── CHANGING YOUR OWN PASSWORD REQUIRES THE CURRENT ONE ─────────────────────────────────────────
 *
 * Not because the session is untrusted — it is — but because a session left open on a shared or
 * stolen laptop is the exact case a password change locks the real owner out of. Asking for the
 * current password costs the legitimate user four seconds and costs an opportunist the whole attack.
 *
 * ── RESETTING SOMEONE ELSE'S DOES NOT ───────────────────────────────────────────────────────────
 *
 * With two owner accounts and no email delivery configured, "Andrew forgot his password" has to be
 * solvable by the other person, and there is no current password to supply. That is a real privilege
 * — each owner can lock the other out — and it is the correct trade for a two-person studio where the
 * alternative is a support ticket to a developer. It is stated plainly in the UI.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const session = getVoiceSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: { id?: string; email?: string; displayName?: string; password?: string; currentPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const targetId = body.id ?? session.userId;
  const isSelf = targetId === session.userId;

  const { data: target } = await supabaseAdmin
    .from('va_users')
    .select('id, email, password_hash')
    .eq('id', targetId)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: 'No such account.' }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (typeof body.email === 'string' && body.email.trim()) {
    const problem = emailProblem(body.email);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    patch.email = normalizeIdentifier(body.email);
  }

  if (typeof body.displayName === 'string' && body.displayName.trim()) {
    patch.display_name = body.displayName.trim().slice(0, 120);
  }

  if (typeof body.password === 'string' && body.password) {
    const problem = passwordProblem(body.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    if (isSelf) {
      const ok = await verifyPassword(String(body.currentPassword ?? ''), target.password_hash);
      if (!ok) return NextResponse.json({ error: 'That current password is not right.' }, { status: 403 });
    }
    patch.password_hash = await hashPassword(body.password);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('va_users')
    .update(patch)
    .eq('id', targetId)
    .select('id, email, display_name, role')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Someone already uses that username.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Changing your OWN username or password re-issues the cookie: the session payload carries the
  // email and display name, so without this the header would keep showing the old name until the
  // 14-day session expired.
  if (isSelf) {
    setVoiceSession({ id: data.id, email: data.email, display_name: data.display_name, role: data.role });
  }

  return NextResponse.json({ user: data });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const session = getVoiceSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which account?' }, { status: 400 });

  // Removing yourself would sign you out mid-action and, if you were the only account, would reopen
  // first-run setup to whoever visited next.
  if (id === session.userId) {
    return NextResponse.json({ error: 'You cannot remove your own account.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('va_users').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
