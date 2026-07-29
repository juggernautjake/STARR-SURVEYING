// app/api/dnd/auth/login/route.ts — email + password login (Phase B, B2).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyPassword, setDndSession, nameToKey } from '@/lib/dnd/auth';
import { checkRateLimit, rateLimitSubject, rateLimitHeaders } from '@/lib/dnd/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // The pseudo-login is name-based (no email). `name` is the primary field; `email` is still
    // accepted so the legacy email login and the `quick:` accounts keep working.
    const name = String(body?.name ?? '').trim();
    const email = String(body?.email ?? '').trim();
    const password = String(body?.password ?? '');
    if ((!name && !email) || !password) {
      return NextResponse.json({ error: 'Name and password are required.' }, { status: 400 });
    }
    // Brute-force control (P2-1, audit F-2). There was no attempt counter, no lockout and no backoff, on a
    // four-character password minimum with bcrypt cost 10 — roughly 50ms per guess, which is ample for an
    // unthrottled attacker. Keyed on the NAME being attempted as well as the caller's address, so a
    // distributed attack on one account is limited even when each source address looks quiet.
    //
    // Counted BEFORE the password is verified. Counting only failures would let an attacker with one
    // correct credential reset their own budget, and the cost being controlled is the guess itself.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    for (const subject of [rateLimitSubject({ ip }), `name:${(name || email).toLowerCase()}`]) {
      const gate = await checkRateLimit('login', subject);
      if (!gate.allowed) {
        return NextResponse.json({ error: gate.message }, { status: 429, headers: rateLimitHeaders(gate, 'login') });
      }
    }

    // A name resolves to its synthetic key; an email is used as-is (lower-cased).
    const key = name ? nameToKey(name) : email.toLowerCase();
    const { data: user } = await supabaseAdmin
      .from('dnd_users')
      .select('id, email, display_name, avatar_url, password_hash')
      .eq('email', key)
      .maybeSingle();

    // constant-ish response to avoid leaking which names exist
    if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: 'Invalid name or password.' }, { status: 401 });
    }

    setDndSession({ id: user.id, email: user.email, display_name: user.display_name });
    return NextResponse.json({
      user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Login failed.' }, { status: 500 });
  }
}
