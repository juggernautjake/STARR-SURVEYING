// app/api/dnd/initiative-entries/[id]/route.ts — per-combatant edits (Phase G6).
// PATCH: apply damage/heal (delta, clamped to 0..max_hp), set HP/initiative/name/
// conditions. DELETE: remove the combatant. DM only.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

interface Entry { id: string; encounter_id: string; hp: number | null; max_hp: number | null; legendary_max: number; legendary_used: number }

async function loadEntry(id: string): Promise<{ entry: Entry; campaignId: string } | null> {
  const { data } = await supabaseAdmin.from('dnd_initiative_entries').select('id, encounter_id, hp, max_hp, legendary_max, legendary_used').eq('id', id).maybeSingle();
  if (!data) return null;
  const entry = data as Entry;
  const { data: enc } = await supabaseAdmin.from('dnd_encounters').select('session_id').eq('id', entry.encounter_id).maybeSingle();
  const sessionId = (enc as { session_id: string } | null)?.session_id;
  if (!sessionId) return { entry, campaignId: '' };
  const { data: sess } = await supabaseAdmin.from('dnd_sessions').select('campaign_id').eq('id', sessionId).maybeSingle();
  return { entry, campaignId: (sess as { campaign_id: string } | null)?.campaign_id ?? '' };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const loaded = await loadEntry(params.id);
  if (!loaded) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
  if ((await getCampaignRole(loaded.campaignId)) !== 'dm') return NextResponse.json({ error: 'DM only.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (body.delta != null) {
    const cur = loaded.entry.hp ?? loaded.entry.max_hp ?? 0;
    let next = cur + Number(body.delta);
    if (next < 0) next = 0;
    if (loaded.entry.max_hp != null && next > loaded.entry.max_hp) next = loaded.entry.max_hp;
    patch.hp = next;
  } else if (body.hp != null) {
    patch.hp = Number(body.hp);
  }
  if (body.maxHp != null) patch.max_hp = Number(body.maxHp);
  if (body.initiative != null) patch.initiative = Number(body.initiative);
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (Array.isArray(body.conditions)) patch.conditions = body.conditions.map(String);
  // Legendary actions (L7): set the pool size, spend one (clamped), or reset used.
  if (body.legendaryMax != null) patch.legendary_max = Math.max(0, Math.round(Number(body.legendaryMax)));
  if (body.legendarySpend != null) {
    const next = loaded.entry.legendary_used + Number(body.legendarySpend);
    patch.legendary_used = Math.max(0, Math.min(loaded.entry.legendary_max, next));
  } else if (body.legendaryUsed != null) {
    patch.legendary_used = Math.max(0, Number(body.legendaryUsed));
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('dnd_initiative_entries').update(patch).eq('id', params.id).select('*').single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed.' }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const loaded = await loadEntry(params.id);
  if (!loaded) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
  if ((await getCampaignRole(loaded.campaignId)) !== 'dm') return NextResponse.json({ error: 'DM only.' }, { status: 403 });
  const { error } = await supabaseAdmin.from('dnd_initiative_entries').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
