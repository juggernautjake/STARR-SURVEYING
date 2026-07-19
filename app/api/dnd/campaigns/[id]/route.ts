// app/api/dnd/campaigns/[id]/route.ts — campaign detail (Phase E3).
// Returns the campaign + members (with display names) + characters + sessions for
// a campaign the caller belongs to. Read-gated by membership.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { characterIdsInCampaign } from '@/lib/dnd/characters';
import { readCampaignPreferences, writeCampaignPreferencesToTheme } from '@/lib/dnd/campaign-preferences';
import { rosterRoleOf } from '@/lib/dnd/roster';
import { normalizeApproval } from '@/lib/dnd/campaign-approval';

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

  // Roster = every character in this campaign (join table ∪ legacy home-campaign column).
  const charIds = await characterIdsInCampaign(params.id);
  const { data: charRows } = charIds.length
    ? await supabaseAdmin
        .from('dnd_characters')
        .select('id, name, token_url, art_url, owner_user_id, played_by_user_id, is_npc, roster_role, sheet_type')
        .in('id', charIds)
        .order('is_npc', { ascending: true })
    : { data: [] };
  const characters = (charRows ?? []) as {
    id: string; name: string; token_url: string | null; art_url: string | null;
    owner_user_id: string | null; played_by_user_id: string | null; is_npc: boolean; roster_role: string | null; sheet_type: string | null;
  }[];

  // DM approval state per character (Area approval) — stored on the roster join row. Merged in below so the DM
  // sees who's approved / awaiting review, and a player sees their own build's status.
  const { data: approvalRows } = charIds.length
    ? await supabaseAdmin.from('dnd_campaign_characters').select('character_id, approval').eq('campaign_id', params.id).in('character_id', charIds)
    : { data: [] };
  const approvalByChar = new Map(((approvalRows ?? []) as { character_id: string; approval: unknown }[]).map((r) => [r.character_id, normalizeApproval(r.approval)]));

  // Names for members + character owners/players (owners may not be campaign members).
  const nameIds = Array.from(new Set([
    ...members.map((m) => m.user_id),
    ...characters.map((c) => c.owner_user_id).filter((v): v is string => !!v),
    ...characters.map((c) => c.played_by_user_id).filter((v): v is string => !!v),
  ]));
  const { data: userRows } = nameIds.length
    ? await supabaseAdmin.from('dnd_users').select('id, display_name, avatar_url').in('id', nameIds)
    : { data: [] };
  const userById = new Map(((userRows ?? []) as { id: string; display_name: string; avatar_url: string | null }[]).map((u) => [u.id, u]));

  const { data: sessions } = await supabaseAdmin
    .from('dnd_sessions')
    .select('id, title, status, scheduled_at, sort_order')
    .eq('campaign_id', params.id)
    .order('sort_order', { ascending: true });

  return NextResponse.json({
    campaign: { ...campaign, role },
    // Normalized DM preferences (Area P2) — the effective campaign-wide settings the sheets/rollers read.
    // Read through the pure helper so a legacy campaign (no stored prefs) still returns the full vanilla set.
    preferences: readCampaignPreferences((campaign as { theme?: unknown }).theme),
    members: members.map((m) => ({
      userId: m.user_id,
      role: m.role,
      displayName: userById.get(m.user_id)?.display_name ?? 'Unknown',
      avatarUrl: userById.get(m.user_id)?.avatar_url ?? null,
    })),
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      token_url: c.token_url ?? c.art_url ?? null,
      is_npc: c.is_npc,
      rosterRole: rosterRoleOf(c.roster_role, c.is_npc),
      sheet_type: c.sheet_type ?? undefined,
      ownerUserId: c.owner_user_id,
      ownerName: c.owner_user_id ? userById.get(c.owner_user_id)?.display_name ?? null : null,
      playedByUserId: c.played_by_user_id ?? null,
      playedByName: c.played_by_user_id ? userById.get(c.played_by_user_id)?.display_name ?? null : null,
      approval: approvalByChar.get(c.id) ?? null,
    })),
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
  // Custom-content policy (IG builder Slice 5): false = vanilla-only campaign.
  if ('allow_custom' in body) patch.allow_custom = !!body.allow_custom;

  // Art banner, campaign notes, and the DM's campaign preferences (Area P2) all live in the `theme` jsonb.
  // `notes` is the player-visible campaign info; `dmNotes` is the DM's private prep (never sent to players);
  // `preferences` is the normalized CampaignPreferences the sheets/rollers read. Merge so unspecified keys
  // are preserved.
  const themeKeys = ['artUrl', 'notes', 'dmNotes', 'preferences'] as const;
  if (themeKeys.some((k) => k in body)) {
    const { data: cur } = await supabaseAdmin.from('dnd_campaigns').select('theme').eq('id', params.id).maybeSingle();
    let theme = ((cur?.theme as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    if ('artUrl' in body) theme.artUrl = body.artUrl ? String(body.artUrl) : null;
    if ('notes' in body) theme.notes = typeof body.notes === 'string' ? body.notes : '';
    if ('dmNotes' in body) theme.dmNotes = typeof body.dmNotes === 'string' ? body.dmNotes : '';
    // Preferences go through the pure normalizer, so a partial/corrupt/hostile body is sanitised to valid
    // vanilla-defaulted settings before it ever reaches the DB.
    if ('preferences' in body) theme = writeCampaignPreferencesToTheme(theme, body.preferences);
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
  return NextResponse.json({ campaign: data, preferences: readCampaignPreferences((data as { theme?: unknown }).theme) });
}
