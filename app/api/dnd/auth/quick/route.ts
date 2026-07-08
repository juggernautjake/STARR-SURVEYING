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

const MIN = 4;

/** Normalize a display name into the stable unique key (trim, collapse ws, lowercase). */
function quickKey(name: string): string {
  return `quick:${name.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (name.length < MIN) {
      return NextResponse.json({ error: 'Name must be at least 4 characters.' }, { status: 400 });
    }
    if (password.length < MIN) {
      return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 });
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

    // First use of this name → claim it.
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
