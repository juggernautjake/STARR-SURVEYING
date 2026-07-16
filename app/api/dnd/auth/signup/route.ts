// app/api/dnd/auth/signup/route.ts — simple pseudo-account creation (name + password only).
//
// The user explicitly de-scoped real auth: "the login is not an actual login or authentication…
// just a name and a password, nothing else. The name and password must both be at least four
// letters long." So there is NO email, NO invite code, NO email verification here. This exists only
// to keep each player's characters under the right identity and keep DM/player stuff separate.
//
// The name is the identity, stored in dnd_users.email as `name:<normalized>` (the column is UNIQUE
// NOT NULL and already holds synthetic keys like `quick:andrew` — same convention, no schema change).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, setDndSession, nameToKey } from '@/lib/dnd/auth';

const MIN = 4;

export async function POST(req: NextRequest) {
  try {
    const { name, password } = await req.json();
    const displayName = String(name ?? '').trim();
    const pw = String(password ?? '');

    // Both at least four characters — the only rule the user asked for.
    if (displayName.length < MIN) {
      return NextResponse.json({ error: `Name must be at least ${MIN} characters.` }, { status: 400 });
    }
    if (pw.length < MIN) {
      return NextResponse.json({ error: `Password must be at least ${MIN} characters.` }, { status: 400 });
    }

    const key = nameToKey(displayName);
    const { data: existing } = await supabaseAdmin.from('dnd_users').select('id').eq('email', key).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'That name is taken — pick another, or sign in if it’s yours.' }, { status: 409 });
    }

    // bcrypt-hashed even though this is a pseudo-login — never store the password in plain text.
    const password_hash = await hashPassword(pw);
    const { data: user, error } = await supabaseAdmin
      .from('dnd_users')
      .insert({ email: key, password_hash, display_name: displayName })
      .select('id, email, display_name, avatar_url')
      .single();
    if (error || !user) {
      return NextResponse.json({ error: error?.message ?? 'Could not create the account.' }, { status: 500 });
    }

    setDndSession({ id: user.id, email: user.email, display_name: user.display_name });
    return NextResponse.json({ user: { id: user.id, display_name: user.display_name } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Signup failed.' }, { status: 500 });
  }
}
