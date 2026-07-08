// app/api/dnd/campaigns/[id]/members/route.ts — the DM adds a player (Phase Q).
// Adds an EXISTING account (by its sign-in name) straight into the campaign as a player.
// If nobody has claimed that name yet, the DM is told to have them sign in once first (or
// use an invite) — we never pre-create a passwordless account, since that would block the
// real person from claiming the name later.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

/** Pseudo-login key for a display name (matches /api/dnd/auth/quick). */
function quickKey(name: string): string {
  return `quick:${name.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can add players.' }, { status: 403 });

  const { name } = await req.json().catch(() => ({}));
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return NextResponse.json({ error: 'A player name is required.' }, { status: 400 });

  // Resolve by pseudo-login key first, then by display name (case-insensitive).
  let { data: user } = await supabaseAdmin.from('dnd_users').select('id, display_name').eq('email', quickKey(clean)).maybeSingle();
  if (!user) {
    const { data: byName } = await supabaseAdmin.from('dnd_users').select('id, display_name').ilike('display_name', clean).limit(1);
    user = (byName ?? [])[0] ?? null;
  }
  if (!user) {
    return NextResponse.json({ error: `No account named “${clean}” yet — have them sign in once first, or send an invite.` }, { status: 404 });
  }

  const { data: existing } = await supabaseAdmin
    .from('dnd_campaign_members').select('role').eq('campaign_id', params.id).eq('user_id', user.id).maybeSingle();
  if (existing) return NextResponse.json({ error: `${user.display_name} is already in this campaign.` }, { status: 409 });

  const { error } = await supabaseAdmin.from('dnd_campaign_members').insert({ campaign_id: params.id, user_id: user.id, role: 'player' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: { userId: user.id, displayName: user.display_name, role: 'player' } });
}
