// app/api/dnd/systems/route.ts — the game systems a character can be built against (Phase V).
// GET returns the seeded systems (DB, falling back to the static list) for the builder's picker.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';

export async function GET() {
  try {
    const { data } = await supabaseAdmin.from('dnd_systems').select('key, name, publisher, notes').order('name');
    if (data && data.length) return NextResponse.json({ systems: data });
  } catch {
    /* fall through to the static list */
  }
  return NextResponse.json({ systems: GAME_SYSTEMS });
}
