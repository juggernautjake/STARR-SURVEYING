// app/api/dnd/campaigns/[id]/route.ts — campaign detail (Phase E3).
// Returns the campaign + members (with display names) + characters + sessions for
// a campaign the caller belongs to. Read-gated by membership.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const role = await getCampaignRole(params.id);
  if (role === null) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });

  const { data: campaign } = await supabaseAdmin
    .from('dnd_campaigns')
    .select('id, name, blurb, theme, created_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

  const { data: memberRows } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('user_id, role')
    .eq('campaign_id', params.id);
  const members = (memberRows ?? []) as { user_id: string; role: string }[];

  const userIds = members.map((m) => m.user_id);
  const { data: userRows } = userIds.length
    ? await supabaseAdmin.from('dnd_users').select('id, display_name, avatar_url').in('id', userIds)
    : { data: [] };
  const userById = new Map(((userRows ?? []) as { id: string; display_name: string; avatar_url: string | null }[]).map((u) => [u.id, u]));

  const { data: characters } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, name, token_url, art_url, owner_user_id, is_npc, sheet_type')
    .eq('campaign_id', params.id)
    .order('is_npc', { ascending: true });

  const { data: sessions } = await supabaseAdmin
    .from('dnd_sessions')
    .select('id, title, status, scheduled_at, sort_order')
    .eq('campaign_id', params.id)
    .order('sort_order', { ascending: true });

  return NextResponse.json({
    campaign: { ...campaign, role },
    members: members.map((m) => ({
      userId: m.user_id,
      role: m.role,
      displayName: userById.get(m.user_id)?.display_name ?? 'Unknown',
      avatarUrl: userById.get(m.user_id)?.avatar_url ?? null,
    })),
    characters: characters ?? [],
    sessions: sessions ?? [],
  });
}
