// app/api/dnd/characters/[id]/campaigns/route.ts — which campaigns this character is in, and which it could
// join (S11: "a clear and easy way to take character into and out of a campaign").
//
// READ ONLY, deliberately. The mutations already exist and already carry their authorization:
//   · join  → POST   /api/dnd/campaigns/[id]/join-character
//   · leave → DELETE /api/dnd/campaigns/[id]/characters/[characterId]
// Adding a third write path here would mean a third copy of "may this caller do that", which is exactly how
// a UI ends up offering a button the server refuses. This endpoint answers WHAT TO OFFER; the decision is
// `lib/dnd/campaign-membership.ts`, shared with the panel.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { getCharacterAccess, campaignsForCharacter } from '@/lib/dnd/characters';
import { membershipView, type CampaignRef } from '@/lib/dnd/campaign-membership';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });

  const characterCampaignIds = await campaignsForCharacter(params.id, res.access.character.campaign_id);

  // The caller's own campaigns, with their role — the only ones they can add a character to.
  const { data: memberRows } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('campaign_id, role')
    .eq('user_id', session.userId);
  const roles = new Map<string, 'dm' | 'player'>();
  for (const r of (memberRows ?? []) as { campaign_id: string; role: string }[]) {
    roles.set(r.campaign_id, r.role === 'dm' ? 'dm' : 'player');
  }

  // Names for everything we might render: the caller's campaigns AND the character's own roster, so a
  // membership the caller can't see still shows a real name instead of an id.
  const allIds = Array.from(new Set([...roles.keys(), ...characterCampaignIds]));
  const names = new Map<string, string>();
  if (allIds.length) {
    const { data: campRows } = await supabaseAdmin
      .from('dnd_campaigns')
      .select('id, name')
      .in('id', allIds);
    for (const c of (campRows ?? []) as { id: string; name: string | null }[]) {
      names.set(c.id, (c.name ?? '').trim() || 'Untitled campaign');
    }
  }

  const callerCampaigns: CampaignRef[] = Array.from(roles.entries())
    .map(([id, role]) => ({ id, name: names.get(id) ?? 'Untitled campaign', role }));
  const extraNames = Object.fromEntries(
    characterCampaignIds.filter((id) => !roles.has(id)).map((id) => [id, names.get(id) ?? 'A campaign you are not in']),
  );

  const view = membershipView(callerCampaigns, characterCampaignIds, extraNames);
  return NextResponse.json({ ...view, isOwner: res.access.isOwner });
}
