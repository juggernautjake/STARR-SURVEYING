// app/api/dnd/auth/login/route.ts — email + password login (Phase B, B2).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyPassword, setDndSession, nameToKey } from '@/lib/dnd/auth';

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
