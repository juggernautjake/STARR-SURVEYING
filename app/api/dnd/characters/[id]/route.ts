// app/api/dnd/characters/[id]/route.ts — load/save a single character (Phase C4).
// GET: read (owner/DM, or campaign/public per visibility). PATCH: save the sheet
// `data` (+ a whitelist of top-level fields) — owner or DM only.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCharacterAccess, campaignsForCharacter } from '@/lib/dnd/characters';
import { isSelectableSheetStyle } from '@/lib/dnd/sheet-styles';
import { isRosterRole } from '@/lib/dnd/roster';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  const { character, isOwner, isDM } = res.access;
  return NextResponse.json({ character, access: { isOwner, isDM, canWrite: res.access.canWrite } });
}

// Fields a PATCH may set. `data` is the whole sheet state (the primary payload);
// the rest cover media/descriptions/theme edits. Unknown keys are ignored.
// `played_by_user_id` assigns who plays the character (ownership never changes) and is
// gated to the owner/DM below.
const WRITABLE = ['data', 'bio', 'name', 'theme', 'art_url', 'token_url', 'visibility', 'quick_stats', 'is_library', 'played_by_user_id', 'sheet_type', 'roster_role'] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.canWrite) {
    return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const key of WRITABLE) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No writable fields in body.' }, { status: 400 });
  }
  if ('name' in patch && !String(patch.name ?? '').trim()) {
    return NextResponse.json({ error: 'name cannot be empty.' }, { status: 400 });
  }
  if ('visibility' in patch && !['private', 'campaign', 'public'].includes(String(patch.visibility))) {
    return NextResponse.json({ error: 'Invalid visibility.' }, { status: 400 });
  }
  // Roster category (Slice 30): pc | special_npc | generic_npc. Editorial only, DM/owner sets it.
  // Keep is_npc in sync so existing NPC-vs-PC filters and defaults stay correct.
  if ('roster_role' in patch) {
    const rr = String(patch.roster_role);
    if (!isRosterRole(rr)) {
      return NextResponse.json({ error: 'Invalid roster role.' }, { status: 400 });
    }
    patch.is_npc = rr !== 'pc';
  }
  // Sheet style (Slice 7): only a known, user-selectable style may be chosen via the
  // browser — never the AI-only `custom` or an arbitrary string.
  if ('sheet_type' in patch && !isSelectableSheetStyle(patch.sheet_type)) {
    return NextResponse.json({ error: 'Invalid sheet style.' }, { status: 400 });
  }
  // Who plays the character (ownership stays put). Only the owner or a DM may reassign,
  // and the new player must be a member of a campaign the character is in (or null to
  // reset to the owner playing it themselves).
  if ('played_by_user_id' in patch) {
    if (!res.access.isOwner && !res.access.isDM) {
      return NextResponse.json({ error: 'Only the owner or DM can set who plays this character.' }, { status: 403 });
    }
    const next = patch.played_by_user_id;
    if (next === null || next === undefined || next === '') {
      patch.played_by_user_id = null;
    } else {
      const campaignIds = await campaignsForCharacter(params.id, res.access.character.campaign_id);
      let ok = false;
      if (campaignIds.length) {
        const { data: mem } = await supabaseAdmin
          .from('dnd_campaign_members')
          .select('user_id')
          .in('campaign_id', campaignIds)
          .eq('user_id', String(next))
          .limit(1);
        ok = ((mem ?? []) as unknown[]).length > 0;
      }
      if (!ok) return NextResponse.json({ error: 'That player is not a member of this character’s campaign.' }, { status: 400 });
      patch.played_by_user_id = String(next);
    }
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('dnd_characters')
    .update(patch)
    .eq('id', params.id)
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not save character.' }, { status: 500 });
  }
  return NextResponse.json({ character: data });
}

// DELETE: permanently remove a character and its per-character data. OWNER ONLY — deletion is irreversible,
// so a DM or assigned player (who can WRITE) must not be able to erase someone's character; only the person
// who owns it can. The UI gates this behind a typed confirmation. Child rows keyed by `character_id` are
// removed first (best-effort — a table absent in a given deployment shouldn't block the delete), then the
// character row itself.
const CHILD_TABLES = [
  'dnd_sheet_edits',
  'dnd_character_uploads',
  'dnd_roll_log',
  'dnd_campaign_characters',
  'dnd_stream_messages',
  'dnd_stream_replies',
  'dnd_stream_polls',
  'dnd_stream_state',
] as const;

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.isOwner) {
    return NextResponse.json({ error: 'Only the character’s owner can delete it.' }, { status: 403 });
  }

  // Remove per-character child rows first so nothing is orphaned. Best-effort: an error on one table (e.g.
  // it doesn't exist in this deployment) is logged-and-ignored rather than aborting the whole delete.
  for (const table of CHILD_TABLES) {
    try {
      await supabaseAdmin.from(table).delete().eq('character_id', params.id);
    } catch {
      // ignore — the character row delete below is the operation that matters.
    }
  }

  const { error } = await supabaseAdmin.from('dnd_characters').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message ?? 'Could not delete character.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: params.id });
}
