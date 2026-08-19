// app/api/admin/employees/[email]/password/route.ts — an admin issues a password to an employee.
//
// Owner, 2026-08-16: *"if the user has the correct credentials for their account, they can login to
// the platform without having to login on google chrome or something."*
//
// ── WHY THIS EXISTS AND IS NOT JUST THE SELF-SERVE ROUTE ────────────────────────────────────────
//
// `POST /api/admin/me/password` covers somebody who can already get in — they sign in with Google,
// then set a password for the days they cannot. It cannot help the case the owner is describing: a
// crew member who has **no working way in at all**. Setting your own first password requires a
// session, and getting a session is the thing that is broken.
//
// That is not hypothetical here. `password_hash` is `TEXT NOT NULL`, so both `ensureRegisteredUser`
// (Google auto-create) and `POST /api/admin/users` write `''`, and four of the five active staff
// were in that state on 2026-08-16 — able to sign in only through Google, on a machine with the
// right Google account already attached.
//
// ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────────────
//
// No "email the employee their password". The platform has Mailgun and Resend wired, so it would
// have been easy, and a password sitting in an inbox is a password that stays readable forever. The
// admin sets one, reads it out, and the employee changes it in their profile. The response says so
// rather than leaving it as folklore.
//
// No reading anything back. There is no GET: an admin has no business knowing whether a colleague
// has set a password, only the ability to grant one when asked.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseUnscoped } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { BCRYPT_COST, validateNewPassword } from '@/lib/auth/password';

export const runtime = 'nodejs';

/** `/api/admin/employees/{email}/password` — the segment before the last, and it is URL-encoded. */
function emailFrom(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const raw = segments[segments.length - 2];
  return raw ? decodeURIComponent(raw).toLowerCase() : null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Admin only, and it fails closed. This route hands somebody a way into another person's account,
  // which is the most dangerous thing in this folder.
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const target = emailFrom(req);
  if (!target) return NextResponse.json({ error: 'Missing employee' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const verdict = validateNewPassword(newPassword);
  if (!verdict.ok) return NextResponse.json({ error: verdict.message }, { status: 400 });

  const { data: user } = await supabaseUnscoped
    .from('registered_users')
    .select('id, email, name, is_banned')
    .ilike('email', target)
    .maybeSingle();
  if (!user) {
    return NextResponse.json({ error: `No account for ${target}.` }, { status: 404 });
  }
  const row = user as { id: string; email: string; name: string | null; is_banned: boolean };
  // Handing a password to a disabled account would quietly undo a removal.
  if (row.is_banned) {
    return NextResponse.json(
      { error: 'That account is disabled. Re-enable it before setting a password.' },
      { status: 409 },
    );
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const { error } = await supabaseUnscoped
    .from('registered_users')
    .update({ password_hash: hash, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Who granted access to whose account, on the record. An admin setting another person's password
  // is exactly the event somebody asks about later.
  try {
    await supabaseUnscoped.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'employee.password_set',
      entity_type: 'employee',
      entity_id: row.email,
      // `metadata` is jsonb. The old code put a bare sentence in it, which stores as a JSON string
      // and cannot be queried by subject — so "show me everything done to this account" could not
      // be answered from it. The sentence is kept; the subject is now a field.
      metadata: { subject_email: row.email, note: `Set the sign-in password for ${row.email}` },
    });
  } catch {
    // Never fail the operation because the note failed — but do not swallow it silently either.
    console.error('[employees.password] could not write activity_log for', row.email);
  }

  return NextResponse.json({
    ok: true,
    email: row.email,
    note: 'Tell them in person or by phone, not email, and ask them to change it in Profile → Password.',
  });
}, { routeName: 'admin/employees.password.post' });
