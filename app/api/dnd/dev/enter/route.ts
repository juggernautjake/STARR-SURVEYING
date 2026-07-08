// app/api/dnd/dev/enter/route.ts — open-access "enter as" (Phase L2). When
// DND_OPEN_ACCESS is on, a visitor picks a roster identity on the /dnd home page and
// this sets the normal dnd_session cookie for that user (no password) — so every
// existing auth-gated page/route works unchanged. Restricted to the seeded demo
// roster so it's not a general passwordless login even when open access is on.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { setDndSession, isDndOpenAccess } from '@/lib/dnd/auth';
import { DEMO_DM_USER_ID, DEMO_GUEST_USER_ID, DEMO_PLAYERS } from '@/lib/dnd/constants';

const DEMO_ROSTER = new Set<string>([DEMO_DM_USER_ID, DEMO_GUEST_USER_ID, ...DEMO_PLAYERS.map((p) => p.userId)]);

export async function POST(req: NextRequest) {
  if (!isDndOpenAccess()) return NextResponse.json({ error: 'Open access is disabled.' }, { status: 403 });

  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: 'Unknown identity.' }, { status: 400 });

  // Allow the seeded demo roster (fast path) OR any member of any campaign — so the
  // per-campaign lobby can "enter as" that campaign's players/DM. Still not a general
  // passwordless login: the id must belong to a real campaign participant.
  if (!DEMO_ROSTER.has(String(userId))) {
    const { data: mem } = await supabaseAdmin.from('dnd_campaign_members').select('user_id').eq('user_id', String(userId)).limit(1);
    if (!mem || mem.length === 0) return NextResponse.json({ error: 'Unknown identity.' }, { status: 400 });
  }

  const { data } = await supabaseAdmin.from('dnd_users').select('id, email, display_name, password_hash').eq('id', userId).maybeSingle();
  const user = data as { id: string; email: string; display_name: string; password_hash: string | null } | null;
  if (!user) return NextResponse.json({ error: 'Identity not found.' }, { status: 404 });

  // A password-protected account may NOT be entered passwordlessly — that would defeat the
  // whole point of assigning private characters to a person. Those accounts must sign in
  // with their name + password (the pseudo-login). Only passwordless identities (e.g. the
  // shared Guest used for "＋ New Character") can be entered directly.
  if (user.password_hash) {
    return NextResponse.json({ error: 'This account is password-protected — sign in with your name and password.' }, { status: 403 });
  }

  setDndSession({ id: user.id, email: user.email, display_name: user.display_name });
  return NextResponse.json({ ok: true });
}
