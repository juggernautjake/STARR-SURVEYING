// app/api/dnd/characters/[id]/stream/npc/route.ts — turn a chat viewer (or a DM alias)
// into a real NPC character sheet (Phase K). [id] is the STREAMER character, used to
// resolve the campaign + gate to its DM. The DM either supplies details (name/age/race/
// profession/level/class/notes) for a full AI-built kit, or asks for a generic commoner
// (mundane job, no special abilities). Creates a DM-owned NPC in the campaign, builds the
// sheet with the shared AI edit pipeline (falling back to a plain sheet if AI is off), and
// optionally links it to a DM alias.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { applySheetEdits, SHEET_EDIT_TOOL, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

const SYSTEM =
  'You are a D&D 5e character architect. You receive a blank character sheet (JSON) and a brief. ' +
  'Call the edit_sheet tool with a complete, valid, level-appropriate kit: name, level, all six ability ' +
  'scores (raw values like 14, never modifiers), AC/HP/speed, a couple of save proficiencies, a few skills, ' +
  'one or two attacks, one or two signature features, and a little inventory. Keep it grounded in the brief.';

interface Details {
  name?: string; age?: string | number; race?: string; profession?: string;
  level?: string | number; class?: string; notes?: string;
}

function brief(mode: string, chatter: string, chatterMsg: string | undefined, d: Details): string {
  if (mode === 'generic') {
    return `Build an ORDINARY commoner NPC — a normal person with a mundane profession (farmer, merchant, ` +
      `guard, cook, etc.), level 1, no special/magical abilities, plain stats. Name: "${d.name || chatter || 'Villager'}".`;
  }
  const parts = [
    d.name && `name "${d.name}"`,
    d.age != null && d.age !== '' && `age ${d.age}`,
    d.race && `race ${d.race}`,
    d.class && `class ${d.class}`,
    d.level != null && d.level !== '' && `level ${d.level}`,
    d.profession && `profession ${d.profession}`,
    d.notes && `notable details: ${d.notes}`,
  ].filter(Boolean).join(', ');
  const flavor = chatterMsg ? ` They started as a stream chatter (@${chatter}) who said: "${chatterMsg}".` : '';
  return `Build a full NPC with these specifics: ${parts || `name "${chatter || 'Newcomer'}"`}.${flavor}`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: streamer } = await supabaseAdmin
    .from('dnd_characters').select('campaign_id').eq('id', params.id).maybeSingle();
  const camp = (streamer as { campaign_id: string | null } | null)?.campaign_id;
  if (!camp) return NextResponse.json({ error: 'Streamer character not found.' }, { status: 404 });
  if ((await getCampaignRole(camp)) !== 'dm')
    return NextResponse.json({ error: 'Only the DM can create NPCs.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === 'detailed' ? 'detailed' : 'generic';
  const details: Details = body.details ?? {};
  const chatter = String(body.chatterUsername ?? '').trim().slice(0, 24);
  const chatterMsg = body.chatterMessage ? String(body.chatterMessage).slice(0, 240) : undefined;
  const aliasId = body.aliasId ? String(body.aliasId) : null;

  const name = String(details.name || chatter || (mode === 'generic' ? 'Villager' : 'Newcomer')).trim().slice(0, 60);
  const seed = blankCharacter(name);

  // Create the NPC shell up-front so the DM always gets a sheet, even if the AI is off/slow.
  const { data: created, error: cErr } = await supabaseAdmin
    .from('dnd_characters')
    .insert({
      campaign_id: camp, name, sheet_type: 'default', is_npc: true,
      owner_user_id: session.userId, visibility: 'private', data: seed, ai_generated: mode === 'detailed',
    })
    .select('id, name')
    .single();
  if (cErr || !created) return NextResponse.json({ error: cErr?.message ?? 'Could not create NPC.' }, { status: 500 });

  // Build the kit with the shared AI pipeline (best-effort; the plain sheet stands if it fails).
  let aiUsed = false;
  if (dndAiConfigured()) {
    try {
      const result = await dndToolCall<{ edits: SheetEdit[] }>({
        system: SYSTEM,
        user: `Blank sheet for "${name}".\n\n${brief(mode, chatter, chatterMsg, details)}`,
        tools: [SHEET_EDIT_TOOL],
        toolChoice: { type: 'tool', name: 'edit_sheet' },
        maxTokens: 4096,
        temperature: mode === 'generic' ? 0.3 : 0.6,
      });
      const edits = result?.input?.edits;
      if (Array.isArray(edits) && edits.length) {
        const updated: Character = applySheetEdits(seed, edits);
        await supabaseAdmin.from('dnd_characters')
          .update({ data: updated, name: updated.meta.name || name }).eq('id', created.id);
        aiUsed = true;
      }
    } catch { /* keep the plain sheet */ }
  }

  if (aliasId) {
    // Link the generated NPC to the DM's alias (ignore if the alias isn't theirs).
    await supabaseAdmin.from('dnd_stream_aliases')
      .update({ npc_character_id: created.id }).eq('id', aliasId).eq('user_id', session.userId);
  }

  return NextResponse.json({ character: { id: created.id, name: created.name }, aiUsed });
}
