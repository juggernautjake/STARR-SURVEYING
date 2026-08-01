// app/api/dnd/maps/search/route.ts — a player rolls, the server says what they found. M6-1.
//
// POST { nodeId, characterId, skill, total } → { found: [...] }
//
// ── THE SHAPE IS THE SECURITY ──────────────────────────────────────────────────────────────────────
//
// The client sends **a roll** and receives **what that roll found**. It never receives a list to filter,
// and it never learns a DC. `loadMapObjects` already refuses to send a `dm`-visibility object to a
// player — every hidden object is one — and this route is the only way one can ever cross to a player,
// one discovery at a time, after the server has done the comparison.
//
// A payload saying *"there is a thing here, DC 18"* would be the same leak as sending the object, one
// step removed: a player could read it in devtools and decide whether searching was worth an action.
//
// ── THE ROLL IS NOT TRUSTED BLINDLY, AND THAT LIMIT IS STATED ──────────────────────────────────────
//
// `total` comes from the client. This route bounds it to a sane range and records it on the discovery row
// (`found_by_roll`) so the DM has an audit trail — which is what the plan asks for: *"through the
// existing roller, so the result is auditable"*. It does NOT re-derive the roll from the character sheet,
// because a search can legitimately carry advantage, guidance, a bardic die and a DM's flat bonus, and
// re-deriving would refuse half the rolls a real table makes.
//
// So the honest description is: the DC stays secret, the comparison is server-side, and the roll is
// logged. A player who edits their total in devtools is doing what a player who lies about a d20 at the
// table is doing, and the DM can see it in the log either way.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getDndUser, getCampaignRole } from '@/lib/dnd/auth';
import { search, type HiddenObject } from '@/lib/dnd/maps/discovery';

/** A d20 check cannot plausibly land outside this. Bounds a typo, not an attacker. */
const MIN_TOTAL = -20;
const MAX_TOTAL = 100;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await getDndUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const nodeId = typeof body.nodeId === 'string' ? body.nodeId : '';
  const characterId = typeof body.characterId === 'string' ? body.characterId : '';
  const skill = typeof body.skill === 'string' ? body.skill.trim() : '';
  const total = Number(body.total);

  if (!nodeId || !characterId || !skill) {
    return NextResponse.json({ error: 'nodeId, characterId and skill are required.' }, { status: 400 });
  }
  if (!Number.isFinite(total) || total < MIN_TOTAL || total > MAX_TOTAL) {
    return NextResponse.json({ error: `total must be a number between ${MIN_TOTAL} and ${MAX_TOTAL}.` }, { status: 400 });
  }

  // The node decides the campaign, and the campaign decides whether this user may search at all.
  const { data: node } = await supabaseAdmin
    .from('dnd_map_nodes').select('id, campaign_id').eq('id', nodeId).maybeSingle();
  const campaignId = (node as { campaign_id?: string } | null)?.campaign_id;
  if (!campaignId) return NextResponse.json({ error: 'Map not found.' }, { status: 404 });

  const role = await getCampaignRole(campaignId);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // The character must belong to this campaign. Without this a member could search using another
  // campaign's character id and quietly write discoveries onto it.
  const { data: character } = await supabaseAdmin
    .from('dnd_characters').select('id, campaign_id').eq('id', characterId).maybeSingle();
  if ((character as { campaign_id?: string } | null)?.campaign_id !== campaignId) {
    return NextResponse.json({ error: 'That character is not in this campaign.' }, { status: 403 });
  }

  // Hidden objects on this node. Read with the admin client on purpose — this is the server doing the
  // comparison the client is not allowed to do.
  const { data: hiddenRows } = await supabaseAdmin
    .from('dnd_map_objects')
    .select('id, label, description, data')
    .eq('map_node_id', nodeId)
    .eq('kind', 'hidden');

  const objects = (hiddenRows ?? []) as HiddenObject[];
  if (!objects.length) return NextResponse.json({ found: [] });

  const { data: existing } = await supabaseAdmin
    .from('dnd_map_discoveries')
    .select('map_object_id')
    .eq('character_id', characterId)
    .in('map_object_id', objects.map((o) => o.id));
  const alreadyFound = new Set(
    ((existing ?? []) as Array<{ map_object_id: string }>).map((r) => r.map_object_id),
  );

  const result = search(objects, { skill, total, alreadyFound });

  if (result.toRecord.length) {
    // `onConflict` on the table's own unique (map_object_id, character_id): a second search that finds
    // the same thing must be a no-op, not a duplicate row or a 500.
    await supabaseAdmin.from('dnd_map_discoveries').upsert(
      result.toRecord.map((objectId) => ({
        map_object_id: objectId,
        character_id: characterId,
        found_by_roll: Math.round(total),
      })),
      { onConflict: 'map_object_id,character_id', ignoreDuplicates: true },
    );
  }

  // ONLY the finds. `misses` is deliberately not returned: telling a player "3 things here you failed to
  // find" is the map pointing at the secrets it just refused to show them.
  return NextResponse.json({ found: result.found });
}, { routeName: 'dnd/maps/search' });
