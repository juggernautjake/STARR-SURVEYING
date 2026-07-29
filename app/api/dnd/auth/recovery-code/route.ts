// app/api/dnd/auth/recovery-code/route.ts — issue a one-time recovery code (P2-4b, audit F-3).
//
// Shown ONCE, here, and never again — only its bcrypt hash is stored, so nothing on the server can
// reproduce it. That is the property that makes the code safe to have; it also means the response body is
// the single moment it exists in readable form, which the UI has to treat accordingly.
//
// Requires the current password, not merely a session. Issuing a fresh credential is exactly as sensitive
// as changing the password: someone at a borrowed machine must not be able to mint themselves a permanent
// way back in.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, hashPassword, verifyPassword } from '@/lib/dnd/auth';
import { loginSubjects, callerIp } from '@/lib/dnd/password-policy';
import { checkRateLimit, rateLimitHeaders } from '@/lib/dnd/rate-limit';
import { generateRecoveryCode } from '@/lib/dnd/recovery';

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const password = String(body?.password ?? '');
  if (!password) return NextResponse.json({ error: 'Your password is required to generate a code.' }, { status: 400 });

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
  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
    return NextResponse.json({ error: 'That is not your password.' }, { status: 401 });
  }

  // `crypto.randomBytes` is injected rather than imported by the generator, so the code-shaping logic stays
  // pure and testable with a deterministic source.
  const code = generateRecoveryCode((n) => crypto.randomBytes(n));
  const recovery_hash = await hashPassword(code);

  const { error } = await supabaseAdmin
    .from('dnd_users')
    .update({ recovery_hash, recovery_set_at: new Date().toISOString() })
    .eq('id', session.userId);
  // A missing column (seed 458 not applied) surfaces as a real error rather than a silent success that
  // hands someone a code the server did not keep — the one failure mode that would be actively harmful.
  if (error) {
    return NextResponse.json(
      { error: 'Could not save a recovery code. If this persists, the recovery migration may not be applied.' },
      { status: 500 },
    );
  }

  // Generating a NEW code invalidates the previous one, because the column holds exactly one hash. Said
  // plainly in the response so nobody keeps trusting an older slip of paper.
  return NextResponse.json({ code, replacedPrevious: true });
}
