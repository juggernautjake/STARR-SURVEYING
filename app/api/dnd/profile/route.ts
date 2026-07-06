// app/api/dnd/profile/route.ts — update the signed-in dnd user's profile (Phase B, B7).
// Display-name edit; avatar upload lives in ./avatar/route.ts.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';

export async function PATCH(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { displayName } = await req.json();
    const name = String(displayName ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Display name is required.' }, { status: 400 });
    if (name.length > 60) return NextResponse.json({ error: 'Display name is too long.' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('dnd_users')
      .update({ display_name: name })
      .eq('id', session.userId)
      .select('id, email, display_name, avatar_url')
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Could not update profile.' }, { status: 500 });
    }
    return NextResponse.json({ user: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Update failed.' }, { status: 500 });
  }
}
