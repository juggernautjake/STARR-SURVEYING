// app/api/admin/me/password/route.ts — set or change your OWN password.
//
// Owner, 2026-08-16: *"if a user uses their org registered credentials to login in the employee
// portal they can successfully login without necessarily having to use the login with google
// option."*
//
// The credentials provider and the login form both already worked. What did not exist anywhere in
// the app was a way for an account to ACQUIRE a password: `ensureRegisteredUser` (Google sign-in)
// and `POST /api/admin/users` both write `password_hash: ''` because the column is NOT NULL, and
// only public self-registration ever wrote a real hash. Four of five active staff were in that
// state. See `lib/auth/password.ts` for the measurement.
//
// GET  → { hasPassword } so the card can say "Set a password" or "Change password" truthfully
//        rather than guessing from whether the person has ever used Google.
// POST → { newPassword, currentPassword? } sets it.
//
// ── THE ONE RULE WORTH STATING ──────────────────────────────────────────────────────────────────
//
// Setting the FIRST password requires no current password, because there is nothing to type — the
// caller has already proved who they are with a valid session. Every subsequent change requires the
// old one even though the session is just as valid, because a signed-in tab left open on a shared
// machine should not convert into a permanent account takeover. Those are different risks and they
// get different answers.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth';
import { supabaseUnscoped } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  BCRYPT_COST, hasPassword, requiresCurrentPassword, validateNewPassword,
} from '@/lib/auth/password';

export const runtime = 'nodejs';

/** `supabaseUnscoped`, not `supabaseAdmin`: `registered_users` is an identity table, not tenant
 *  data, and the org-scope filter would be answering a different question. The row is pinned to the
 *  session's own email either way, so this reads and writes exactly one person — the caller. */
async function loadSelf(email: string) {
  const { data } = await supabaseUnscoped
    .from('registered_users')
    .select('id, email, password_hash, is_banned')
    .ilike('email', email)
    .maybeSingle();
  return data as { id: string; email: string; password_hash: string | null; is_banned: boolean } | null;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const me = await loadSelf(session.user.email);
  if (!me) return NextResponse.json({ error: 'No account' }, { status: 404 });

  return NextResponse.json({ hasPassword: hasPassword(me.password_hash), email: me.email });
}, { routeName: 'admin/me.password.get' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';

  const me = await loadSelf(session.user.email);
  if (!me) return NextResponse.json({ error: 'No account' }, { status: 404 });
  // A banned account keeps its session until the token expires (the ban is only checked at
  // credentials sign-in), so it is re-checked here. Otherwise "removed from the platform" would
  // still be able to hand itself a fresh way back in.
  if (me.is_banned) return NextResponse.json({ error: 'This account is disabled.' }, { status: 403 });

  const verdict = validateNewPassword(newPassword, currentPassword || undefined);
  if (!verdict.ok) return NextResponse.json({ error: verdict.message }, { status: 400 });

  if (requiresCurrentPassword(me.password_hash)) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Enter your current password.' }, { status: 400 });
    }
    const okNow = await bcrypt.compare(currentPassword, me.password_hash as string);
    if (!okNow) {
      return NextResponse.json({ error: 'That current password is not right.' }, { status: 400 });
    }
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const { error } = await supabaseUnscoped
    .from('registered_users')
    .update({ password_hash: hash, updated_at: new Date().toISOString() })
    .eq('id', me.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // `auth_provider` is deliberately NOT changed. It records how the account first arrived, and a
  // Google user who adds a password still signs in with Google most days — overwriting it would
  // lose that and change nothing about what works.
  return NextResponse.json({ ok: true, hasPassword: true });
}, { routeName: 'admin/me.password.post' });
