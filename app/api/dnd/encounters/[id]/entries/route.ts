// app/api/dnd/encounters/[id]/entries/route.ts — add an initiative entry (G4).
// A combatant references a character (PC or NPC) or is a manual add; each entry is
// an independent instance carrying this fight's HP/conditions.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { resolveHp } from '@/lib/dnd/combat-hp';
import { creatureCombatant } from '@/lib/dnd/homebrew/statblock';
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
    const { characterId, homebrewId, creatureId, creatureVariantId, name, initiative, hp, maxHp, tokenUrl } = await req.json();

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
    // A creature from the Content Studio (P6-14). The Studio could build a monster, render its statblock
    // and show its art, and there was no way to put it in a fight — a DM re-typed its name and HP by hand,
    // which is the work the Studio exists to remove, with a fresh chance to fat-finger the HP each time.
    //
    // `character_id` stays NULL for these: it is a foreign key into `dnd_characters` and a homebrew row is
    // not one. The entry is a self-contained instance either way — that is what the initiative model
    // already is — so nothing downstream needs to know which door the combatant came through.
    if (!characterId && homebrewId) {
      try {
        const { data: hb } = await supabaseAdmin
          .from('dnd_homebrew').select('name, image_url, payload, kind, owner_user_id, visibility')
          .eq('id', homebrewId).maybeSingle();
        const row = hb as { kind?: string; owner_user_id?: string; visibility?: string } | null;
        // Yours, or published. A DM may not pull a private creature out of someone else's Studio, and
        // "it is only an HP number" is not a reason to read another user's unpublished work.
        const readable = !!row && (row.owner_user_id === session.userId || row.visibility === 'public');
        if (row && row.kind !== 'creature') {
          return NextResponse.json({ error: 'That piece is not a creature.' }, { status: 400 });
        }
        const combatant = readable ? creatureCombatant(hb as Parameters<typeof creatureCombatant>[0]) : null;
        if (combatant) {
          if (!finalName) finalName = combatant.name;
          if (!finalToken) finalToken = combatant.tokenUrl;
          if (finalMax == null) finalMax = combatant.maxHp;
          if (finalHp == null) finalHp = combatant.hp;
        }
      } catch {
        /* the Studio table arrives with seed 455 — a manual add must still work without it */
      }
    }

    // ── A CATALOGUE CREATURE (B3-3) ──────────────────────────────────────────────────────────────
    //
    // The same door as `homebrewId`, for the 829 creatures in `dnd_creatures`. Kept as a separate branch
    // rather than folded into the homebrew one because the two tables answer READABILITY differently and
    // conflating them is how a private Studio piece would leak: homebrew is yours-or-published, whereas the
    // catalogue is licensed reference content that every member can already browse.
    //
    // A VARIANT resolves through the same path. `creatureVariantId` takes precedence when both are sent,
    // because a DM who picked "Elite Ogre" means the elite's HP, not the parent's — silently using the
    // parent would be the kind of wrong number this whole route exists to stop being re-typed.
    if (!characterId && !finalName && (creatureId || creatureVariantId)) {
      try {
        if (creatureVariantId) {
          const { data: v } = await supabaseAdmin
            .from('dnd_creature_variants').select('name, statblock').eq('id', creatureVariantId).maybeSingle();
          const row = v as { name?: string; statblock?: { hp?: number } } | null;
          if (row?.name) {
            finalName = row.name;
            if (finalMax == null) finalMax = row.statblock?.hp ?? null;
            if (finalHp == null) finalHp = row.statblock?.hp ?? null;
          }
        } else {
          const { data: cr } = await supabaseAdmin
            .from('dnd_creatures').select('name, image_url, statblock').eq('id', creatureId).maybeSingle();
          const row = cr as { name?: string; image_url?: string | null; statblock?: { hp?: number } } | null;
          if (row?.name) {
            finalName = row.name;
            if (!finalToken) finalToken = row.image_url ?? null;
            if (finalMax == null) finalMax = row.statblock?.hp ?? null;
            if (finalHp == null) finalHp = row.statblock?.hp ?? null;
          }
        }
      } catch {
        /* the bestiary tables arrive with seed 462 — a manual add must still work without them */
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
