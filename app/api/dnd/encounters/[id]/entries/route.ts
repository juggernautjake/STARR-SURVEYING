// app/api/dnd/encounters/[id]/entries/route.ts — add an initiative entry (G4).
// A combatant references a character (PC or NPC) or is a manual add; each entry is
// an independent instance carrying this fight's HP/conditions.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { resolveHp } from '@/lib/dnd/combat-hp';
import type { CharacterSystem } from '@/lib/dnd/systems';

async function encounterCampaign(encounterId: string): Promise<string | null> {
  const { data: enc } = await supabaseAdmin.from('dnd_encounters').select('session_id').eq('id', encounterId).maybeSingle();
  const sessionId = (enc as { session_id: string } | null)?.session_id;
  if (!sessionId) return null;
  const { data: sess } = await supabaseAdmin.from('dnd_sessions').select('campaign_id').eq('id', sessionId).maybeSingle();
  return (sess as { campaign_id: string } | null)?.campaign_id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const campaignId = await encounterCampaign(params.id);
  if (!campaignId) return NextResponse.json({ error: 'Encounter not found.' }, { status: 404 });
  if ((await getCampaignRole(campaignId)) !== 'dm') return NextResponse.json({ error: 'DM only.' }, { status: 403 });

  try {
    const { characterId, name, initiative, hp, maxHp, tokenUrl } = await req.json();

    // Derive display fields + HP from the character when one is referenced and not
    // overridden (G6: PC/NPC HP auto-seeds from the sheet's combat block on add).
    let finalName = name ? String(name).trim() : '';
    let finalToken = tokenUrl ?? null;
    let finalHp = hp == null ? null : Number(hp);
    let finalMax = maxHp == null ? null : Number(maxHp);
    if (characterId) {
      // `system` is selected because HP lives in a different place per system (P1-1). Reading only
      // `data.combat` — the 5e shape — is what put PF2 and IG combatants in the tracker with null HP.
      const { data: ch } = await supabaseAdmin.from('dnd_characters').select('name, token_url, data, system').eq('id', characterId).maybeSingle();
      const c = ch as { name: string; token_url: string | null; data?: unknown; system?: string | null } | null;
      if (c) {
        if (!finalName) finalName = c.name;
        if (!finalToken) finalToken = c.token_url;
        const resolved = resolveHp(c.system as CharacterSystem, c.data);
        if (finalMax == null && resolved.maxHp != null) finalMax = resolved.maxHp;
        if (finalHp == null && resolved.currentHp != null) finalHp = resolved.currentHp;
      }
    }
    if (!finalName) return NextResponse.json({ error: 'A combatant name (or character) is required.' }, { status: 400 });

    const { count } = await supabaseAdmin.from('dnd_initiative_entries').select('id', { count: 'exact', head: true }).eq('encounter_id', params.id);

    const { data, error } = await supabaseAdmin
      .from('dnd_initiative_entries')
      .insert({
        encounter_id: params.id,
        character_id: characterId ?? null,
        name: finalName,
        token_url: finalToken,
        initiative: initiative == null ? null : Number(initiative),
        hp: finalHp,
        max_hp: finalMax,
        sort_order: count ?? 0,
      })
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not add entry.' }, { status: 500 });
    return NextResponse.json({ entry: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Add failed.' }, { status: 500 });
  }
}
