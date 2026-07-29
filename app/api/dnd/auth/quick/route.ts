// app/api/dnd/auth/quick/route.ts — the "pseudo login" (Phase P).
//
// NOT real authentication: anyone can sign in with just a NAME + PASSWORD (each ≥ 4
// chars, no other rules). Its only job is to let people track the characters they own
// and the campaigns they DM. First time a name is used it's claimed (password stored);
// after that the same name must use the same password, so a name is loosely "owned".
//
// It rides on the existing dnd_users table by stashing a synthetic key in the unique
// `email` column: `quick:<normalized-name>`. That can't collide with real emails
// (which contain `@` and never the `quick:` prefix) or invite-based accounts.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, verifyPassword, setDndSession } from '@/lib/dnd/auth';
import { checkName, checkNewPassword, loginSubjects, callerIp } from '@/lib/dnd/password-policy';
import { checkRateLimit, rateLimitHeaders } from '@/lib/dnd/rate-limit';

/** Normalize a display name into the stable unique key (trim, collapse ws, lowercase). */
function quickKey(name: string): string {
  return `quick:${name.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    const nameCheck = checkName(name);
    if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.error }, { status: 400 });

    // NOTE: the PASSWORD length is deliberately NOT checked here. This one handler both claims a name and
    // signs in to an existing one, and the check used to run before that branch — so raising the floor from
    // 4 to 8 in place would have rejected every existing player whose password is four characters, at
    // sign-in, on their own account. The floor is applied on the create path below, where it belongs.
    if (!password) return NextResponse.json({ error: 'Password is required.' }, { status: 400 });

    // Brute-force control (P2-3, audit F-2). This route verifies a password against a stored bcrypt hash
    // and had NO throttle: P2-1 limited `auth/login`, the legacy email route, while every real sign-in
    // comes through here. Counted BEFORE verification, so a correct guess cannot refund the attempt.
    const ip = callerIp(req.headers);
    for (const subject of loginSubjects(name, ip)) {
      const gate = await checkRateLimit('login', subject);
      if (!gate.allowed) {
        return NextResponse.json({ error: gate.message }, { status: 429, headers: rateLimitHeaders(gate, 'login') });
      }
    }

    const key = quickKey(name);
    const { data: existing } = await supabaseAdmin
      .from('dnd_users')
      .select('id, email, display_name, avatar_url, password_hash')
      .eq('email', key)
      .maybeSingle();

    if (existing) {
      // Name already claimed → the password must match (this is how a name stays "owned").
      if (!existing.password_hash || !(await verifyPassword(password, existing.password_hash))) {
        return NextResponse.json(
          { error: 'That name is taken and the password does not match.' },
          { status: 401 },
        );
      }
      setDndSession({ id: existing.id, email: existing.email, display_name: existing.display_name });
      return NextResponse.json({
        user: { id: existing.id, email: existing.email, display_name: existing.display_name, avatar_url: existing.avatar_url },
        created: false,
      });
    }

    // First use of this name → claim it. THE floor applies here and only here (P2-3): this is the one
    // branch that sets a password, so it is the one branch entitled to have an opinion about its length.
    const pwCheck = checkNewPassword(password);
    if (!pwCheck.ok) return NextResponse.json({ error: pwCheck.error }, { status: 400 });

    const password_hash = await hashPassword(password);
    const { data: created, error } = await supabaseAdmin
      .from('dnd_users')
      .insert({ email: key, display_name: name, password_hash })
      .select('id, email, display_name, avatar_url')
      .single();

    if (error || !created) {
      // Unique-violation race: someone claimed the name a beat ago — treat as "taken".
      return NextResponse.json({ error: 'Could not sign in — please try again.' }, { status: 409 });
    }

    setDndSession({ id: created.id, email: created.email, display_name: created.display_name });
    return NextResponse.json({
      user: { id: created.id, email: created.email, display_name: created.display_name, avatar_url: created.avatar_url },
      created: true,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sign in failed.' }, { status: 500 });
  }
}
