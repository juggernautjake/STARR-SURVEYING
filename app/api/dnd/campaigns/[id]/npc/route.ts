// app/api/dnd/campaigns/[id]/npc/route.ts — QUICK NPC generation for the campaign (Slice 31).
//
// The DM gives a sentence ("a nervous dock guard who owes money") and gets a complete, playable NPC
// sheet in the campaign, under a roster role. This lifts the exact machinery the streamer flow uses
// (blank sheet → AI kit via the shared edit pipeline → save), generalised off the streamer character
// so it works from the campaign manage page. DM-gated; the plain sheet stands if the AI is off.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { applySheetEdits, SHEET_EDIT_TOOL, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { normalizeSystem, systemLabel } from '@/lib/dnd/systems';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

const SYSTEM =
  'You are a tabletop RPG NPC architect. You receive a blank character sheet (JSON) and a one-line brief. ' +
  'Call the edit_sheet tool with a complete, valid, level-appropriate kit that fits the brief: name, level, ' +
  'all six ability scores (raw values like 14, never modifiers), AC/HP/speed, a couple of save proficiencies, ' +
  'a few skills, one or two attacks, one or two signature features, and a little inventory. Express every ' +
  'mechanic using ONLY the named game system’s rules — never another system’s, never invented. Keep it ' +
  'grounded in the brief; a mundane brief gets mundane stats, a dangerous one gets a real threat.';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the campaign DM can create NPCs.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const description = String((body as { brief?: unknown }).brief ?? '').trim().slice(0, 400);
  if (!description) return NextResponse.json({ error: 'Describe the NPC in a sentence.' }, { status: 400 });
  const rosterRole = ['generic_npc', 'special_npc'].includes(String((body as { rosterRole?: unknown }).rosterRole))
    ? String((body as { rosterRole?: unknown }).rosterRole)
    : 'generic_npc';
  const askedName = String((body as { name?: unknown }).name ?? '').trim().slice(0, 60);

  // The campaign's system grounds the AI (so a PF2 campaign gets a PF2 NPC, not a 5e one).
  const { data: camp } = await supabaseAdmin.from('dnd_campaigns').select('system').eq('id', params.id).maybeSingle();
  const system = normalizeSystem((camp as { system?: string } | null)?.system);

  const name = askedName || 'Newcomer';
  const seed = blankCharacter(name);

  // Create the shell up-front so the DM always gets a sheet even if the AI is off/slow.
  const { data: created, error: cErr } = await supabaseAdmin
    .from('dnd_characters')
    .insert({
      campaign_id: params.id, name, sheet_type: 'default', is_npc: true, roster_role: rosterRole,
      owner_user_id: session.userId, visibility: 'private', data: seed, ai_generated: true, system,
    })
    .select('id, name')
    .single();
  if (cErr || !created) return NextResponse.json({ error: cErr?.message ?? 'Could not create the NPC.' }, { status: 500 });

  let aiUsed = false;
  if (dndAiConfigured()) {
    try {
      const result = await dndToolCall<{ edits: SheetEdit[] }>({
        system: SYSTEM,
        user: `Game system: ${systemLabel(system)}.\nBlank sheet for "${name}".\n\nBrief: ${description}`,
        tools: [SHEET_EDIT_TOOL],
        toolChoice: { type: 'tool', name: 'edit_sheet' },
        maxTokens: 4096,
        temperature: 0.6,
      });
      const edits = result?.input?.edits;
      if (Array.isArray(edits) && edits.length) {
        const updated: Character = applySheetEdits(seed, edits);
        await supabaseAdmin.from('dnd_characters').update({ data: updated, name: updated.meta.name || name }).eq('id', created.id);
        aiUsed = true;
      }
    } catch { /* keep the plain sheet */ }
  }

  return NextResponse.json({ character: { id: created.id, name: created.name }, aiUsed });
}
