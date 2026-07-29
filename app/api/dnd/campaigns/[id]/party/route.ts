// app/api/dnd/campaigns/[id]/party/route.ts — every PC's defences on one screen (P3-7).
//
// DM-only. The numbers are computed server-side through `summarizeParty` so the whole `data` blob — which
// contains a player's private notes, backstory and inventory — never leaves the server. A client-side
// version of this panel would have shipped every sheet in full to whoever opened the page.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { characterIdsInCampaign } from '@/lib/dnd/characters';
import { summarizeParty, partySaveKeys } from '@/lib/dnd/party-overview';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // DM-only: this is a table of everyone's defences, which is the DM's view of the party and not a
  // player's view of each other.
  const role = await getCampaignRole(params.id);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the DM can see the party overview.' }, { status: 403 });

  // Join table ∪ legacy column, same as P3-4b — filtering on `campaign_id` alone silently misses most of
  // the roster.
  const charIds = await characterIdsInCampaign(params.id);
  const { data: rows } = charIds.length
    ? await supabaseAdmin
        .from('dnd_characters')
        .select('id, name, system, data, is_npc')
        .in('id', charIds)
        .eq('is_npc', false)
        .order('name', { ascending: true })
    : { data: [] };

  const members = summarizeParty((rows ?? []) as { id: string; name: string; system: string | null; data: unknown }[]);
  return NextResponse.json({ members, saveKeys: partySaveKeys(members) });
}
