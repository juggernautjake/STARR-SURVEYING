// app/api/dnd/auth/recover/route.ts — redeem a recovery code (P2-4b, audit F-3).
//
// The route that closes F-3: name + recovery code + a new password, and you are back in — without the owner
// editing the database, which was the only previous option and is not one anybody would find.
//
// SINGLE USE. Redeeming clears `recovery_hash`, so a code cannot become a permanent second password. This
// is the difference between a recovery mechanism and a second, weaker credential on every account forever.
//
// UNIFORM FAILURE. Every wrong path — unknown name, no code issued, wrong code — returns the same message.
// A distinct "no code has been issued for that account" would confirm which names exist and which are
// recoverable, and this is an unauthenticated endpoint. `auth/login` already gets this right and the
// reasoning is the same.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, verifyPassword, setDndSession, nameToKey } from '@/lib/dnd/auth';
import { checkNewPassword, loginSubjects, callerIp } from '@/lib/dnd/password-policy';
import { checkRateLimit, rateLimitHeaders } from '@/lib/dnd/rate-limit';
import { looksLikeRecoveryCode, formatRecoveryCode } from '@/lib/dnd/recovery';

/** One message for every failure. Named so the uniformity is deliberate and greppable. */
const REFUSAL = 'That name and recovery code do not match.';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ');
  const code = String(body?.code ?? '');
  const newPassword = String(body?.newPassword ?? '');

  if (!name || !code) return NextResponse.json({ error: 'A name and recovery code are required.' }, { status: 400 });
  const check = checkNewPassword(newPassword);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // Throttled before anything else. This is an unauthenticated endpoint that verifies a secret, so it is
  // the single most attractive guessing target in the API.
  for (const subject of loginSubjects(name, callerIp(req.headers))) {
    const gate = await checkRateLimit('login', subject);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.message }, { status: 429, headers: rateLimitHeaders(gate, 'login') });
    }
  }

  // Cheap shape check so a malformed code never reaches bcrypt — and, deliberately, it returns the SAME
  // refusal as a wrong code rather than "that is not a valid code", which would let an attacker map the
  // alphabet and length for free.
  if (!looksLikeRecoveryCode(code)) return NextResponse.json({ error: REFUSAL }, { status: 401 });

  // Both account shapes: `name:` (signup/register) and `quick:` (the hub's claim flow) are the same person
  // as far as recovery is concerned, and someone who claimed a name through the hub is exactly as locked
  // out as anyone else.
  const keys = [nameToKey(name), `quick:${name.toLowerCase()}`];
  const { data: rows } = await supabaseAdmin
    .from('dnd_users')
    .select('id, recovery_hash')
    .in('email', keys);
  const candidates = (rows ?? []) as { id: string; recovery_hash: string | null }[];

  for (const row of candidates) {
    if (!row.recovery_hash) continue;
    if (!(await verifyPassword(formatRecoveryCode(code), row.recovery_hash))) continue;

    const password_hash = await hashPassword(newPassword);
    // Clear the code in the SAME update that sets the password, so there is no window in which the code has
    // been spent but still works.
    const { error } = await supabaseAdmin
      .from('dnd_users')
      .update({ password_hash, recovery_hash: null, recovery_set_at: null })
      .eq('id', row.id);
    if (error) return NextResponse.json({ error: 'Could not reset your password.' }, { status: 500 });

    const { data: fresh } = await supabaseAdmin
      .from('dnd_users')
      .select('id, email, display_name, avatar_url')
      .eq('id', row.id)
      .maybeSingle();
    const user = fresh as { id: string; email: string; display_name: string; avatar_url: string | null } | null;
    if (user) setDndSession({ id: user.id, email: user.email, display_name: user.display_name });
    return NextResponse.json({ ok: true, user });
  }

  return NextResponse.json({ error: REFUSAL }, { status: 401 });
}
