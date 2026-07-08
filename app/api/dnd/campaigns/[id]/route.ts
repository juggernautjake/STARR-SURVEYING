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
    .select('id, name, token_url, art_url, owner_user_id, is_npc, sheet_type, claimable')
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

// PATCH — DM-only campaign edits (Phase P): name, blurb, and the campaign art banner
// (stored in the `theme` jsonb as `artUrl`). Only the fields provided are changed.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can edit the campaign.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.blurb === 'string') patch.blurb = body.blurb;

  // Art banner + campaign notes all live in the `theme` jsonb. `notes` is the
  // player-visible campaign info; `dmNotes` is the DM's private prep (never sent to
  // players). Merge so unspecified keys are preserved.
  const themeKeys = ['artUrl', 'notes', 'dmNotes'] as const;
  if (themeKeys.some((k) => k in body)) {
    const { data: cur } = await supabaseAdmin.from('dnd_campaigns').select('theme').eq('id', params.id).maybeSingle();
    const theme = ((cur?.theme as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    if ('artUrl' in body) theme.artUrl = body.artUrl ? String(body.artUrl) : null;
    if ('notes' in body) theme.notes = typeof body.notes === 'string' ? body.notes : '';
    if ('dmNotes' in body) theme.dmNotes = typeof body.dmNotes === 'string' ? body.dmNotes : '';
    patch.theme = theme;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('dnd_campaigns')
    .update(patch)
    .eq('id', params.id)
    .select('id, name, blurb, theme')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed.' }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
