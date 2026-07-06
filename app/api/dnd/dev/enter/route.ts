// app/api/dnd/dev/enter/route.ts — open-access "enter as" (Phase L2). When
// DND_OPEN_ACCESS is on, a visitor picks a roster identity on the /dnd home page and
// this sets the normal dnd_session cookie for that user (no password) — so every
// existing auth-gated page/route works unchanged. Restricted to the seeded demo
// roster so it's not a general passwordless login even when open access is on.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { setDndSession, isDndOpenAccess } from '@/lib/dnd/auth';
import { DEMO_DM_USER_ID, DEMO_GUEST_USER_ID, DEMO_PLAYERS } from '@/lib/dnd/constants';

const ROSTER = new Set<string>([DEMO_DM_USER_ID, DEMO_GUEST_USER_ID, ...DEMO_PLAYERS.map((p) => p.userId)]);

export async function POST(req: NextRequest) {
  if (!isDndOpenAccess()) return NextResponse.json({ error: 'Open access is disabled.' }, { status: 403 });

  const { userId } = await req.json().catch(() => ({}));
  if (!userId || !ROSTER.has(String(userId))) {
    return NextResponse.json({ error: 'Unknown identity.' }, { status: 400 });
  }
  const { data } = await supabaseAdmin.from('dnd_users').select('id, email, display_name').eq('id', userId).maybeSingle();
  const user = data as { id: string; email: string; display_name: string } | null;
  if (!user) return NextResponse.json({ error: 'Identity not found.' }, { status: 404 });

  setDndSession(user);
  return NextResponse.json({ ok: true });
}
