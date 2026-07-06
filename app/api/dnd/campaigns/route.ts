// app/api/dnd/campaigns/route.ts — DM campaigns (Phase E2).
// GET lists the campaigns the signed-in user belongs to (with their role); POST
// creates a campaign and makes the creator its DM.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';

export async function GET() {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: memberships, error: mErr } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('campaign_id, role')
    .eq('user_id', session.userId);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const mems = (memberships ?? []) as { campaign_id: string; role: string }[];
  const ids = mems.map((m) => m.campaign_id);
  if (ids.length === 0) return NextResponse.json({ campaigns: [] });

  const roleById = new Map(mems.map((m) => [m.campaign_id, m.role]));
  const { data: campaigns, error } = await supabaseAdmin
    .from('dnd_campaigns')
    .select('id, name, blurb, theme, created_at')
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    campaigns: ((campaigns ?? []) as { id: string }[]).map((c) => ({ ...c, role: roleById.get(c.id) ?? 'player' })),
  });
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { name, blurb } = await req.json();
    if (!name || !String(name).trim()) return NextResponse.json({ error: 'Campaign name is required.' }, { status: 400 });

    const { data: campaign, error } = await supabaseAdmin
      .from('dnd_campaigns')
      .insert({ dm_user_id: session.userId, name: String(name).trim(), blurb: blurb ? String(blurb).trim() : null })
      .select('id, name, blurb, theme, created_at')
      .single();
    if (error || !campaign) return NextResponse.json({ error: error?.message ?? 'Could not create campaign.' }, { status: 500 });

    const { error: memErr } = await supabaseAdmin
      .from('dnd_campaign_members')
      .insert({ campaign_id: campaign.id, user_id: session.userId, role: 'dm' });
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

    return NextResponse.json({ campaign: { ...campaign, role: 'dm' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Create failed.' }, { status: 500 });
  }
}
