// app/api/dnd/encounters/[id]/route.ts — encounter detail + turn advance (G4).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { orderEntries, advanceTurn } from '@/lib/dnd/initiative';

interface Enc { id: string; session_id: string; name: string | null; round: number; current_turn_index: number; status: string }

async function loadEncounter(id: string): Promise<{ enc: Enc; campaignId: string } | null> {
  const { data } = await supabaseAdmin.from('dnd_encounters').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  const enc = data as Enc;
  const { data: sess } = await supabaseAdmin.from('dnd_sessions').select('campaign_id').eq('id', enc.session_id).maybeSingle();
  return { enc, campaignId: (sess as { campaign_id: string } | null)?.campaign_id ?? '' };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const loaded = await loadEncounter(params.id);
  if (!loaded) return NextResponse.json({ error: 'Encounter not found.' }, { status: 404 });
  if ((await getCampaignRole(loaded.campaignId)) === null) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  const { data: rows } = await supabaseAdmin
    .from('dnd_initiative_entries')
    .select('id, character_id, name, token_url, initiative, hp, max_hp, conditions, sort_order, legendary_max, legendary_used')
    .eq('encounter_id', params.id);
  const entries = orderEntries((rows ?? []) as { initiative: number | null; sort_order: number }[]) as unknown as { id: string }[];
  const currentEntryId = entries[loaded.enc.current_turn_index]?.id ?? null;

  return NextResponse.json({ encounter: loaded.enc, entries, currentEntryId });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const loaded = await loadEncounter(params.id);
  if (!loaded) return NextResponse.json({ error: 'Encounter not found.' }, { status: 404 });
  if ((await getCampaignRole(loaded.campaignId)) !== 'dm') return NextResponse.json({ error: 'DM only.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.action === 'next' || body.action === 'prev') {
    const { count } = await supabaseAdmin.from('dnd_initiative_entries').select('id', { count: 'exact', head: true }).eq('encounter_id', params.id);
    const next = advanceTurn(count ?? 0, loaded.enc.current_turn_index, loaded.enc.round, body.action);
    patch.current_turn_index = next.index;
    patch.round = next.round;
  } else if (body.action === 'reset') {
    patch.current_turn_index = 0;
    patch.round = 1;
  }
  if (typeof body.name === 'string') patch.name = body.name;
  if (body.status && ['prep', 'live', 'done'].includes(body.status)) patch.status = body.status;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('dnd_encounters').update(patch).eq('id', params.id).select('*').single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed.' }, { status: 500 });

  // A new round refreshes every combatant's legendary actions (L7).
  if (typeof patch.round === 'number' && patch.round > loaded.enc.round) {
    await supabaseAdmin.from('dnd_initiative_entries').update({ legendary_used: 0 }).eq('encounter_id', params.id);
  }
  return NextResponse.json({ encounter: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const loaded = await loadEncounter(params.id);
  if (!loaded) return NextResponse.json({ error: 'Encounter not found.' }, { status: 404 });
  if ((await getCampaignRole(loaded.campaignId)) !== 'dm') return NextResponse.json({ error: 'DM only.' }, { status: 403 });
  const { error } = await supabaseAdmin.from('dnd_encounters').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
