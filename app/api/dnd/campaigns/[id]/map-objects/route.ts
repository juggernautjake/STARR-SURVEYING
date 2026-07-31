// app/api/dnd/campaigns/[id]/map-objects/route.ts — put things on a map, move them, take them off (M4-2).
//
//   POST   { nodeId, kind?, x, y, data, label?, visibility? }  → place
//   PATCH  { id, x?, y?, z?, visibility?, label?, data? }      → move / relayer / reveal
//   DELETE ?id=…                                               → remove
//
// DM ONLY, every verb. A map object is the DM's authored content — where the ambush is, which door is
// secret, what the party has not found yet — and a player who could write one could also move a token onto
// a trap or reveal a `dm` object by flipping its visibility. `getCampaignRole` is the gate, and it is
// checked against the campaign that owns the NODE rather than against the id in the URL: those are the same
// thing only if you check, and "the caller said this node is in their campaign" is not a check.
//
// ── THE RULES LIVE IN `lib/dnd/maps/tokens.ts`, NOT HERE ─────────────────────────────────────────────
//
// Snapping to the grid and clamping to the map are applied SERVER-SIDE from the node's own `grid` and
// `bounds`. A client that computes its own position is a client that can put a token outside the map —
// where the viewport's pan clamp means nothing could ever scroll to it — and a second implementation of
// snapping is a second answer to "which square is this on".
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { clampToMap, readToken, snapToGrid } from '@/lib/dnd/maps/tokens';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['image', 'prop', 'token', 'light', 'area', 'note', 'hidden']);
const VISIBILITIES = new Set(['dm', 'players', 'discovered']);

/** The node, and whether this caller is the DM of the campaign that actually owns it. */
async function nodeGate(nodeId: unknown) {
  if (typeof nodeId !== 'string' || !nodeId) {
    return { error: NextResponse.json({ error: 'nodeId is required.' }, { status: 400 }) };
  }
  const { data, error } = await supabaseAdmin
    .from('dnd_map_nodes').select('id, campaign_id, grid, bounds').eq('id', nodeId).maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!data) return { error: NextResponse.json({ error: 'No such map node.' }, { status: 404 }) };

  const node = data as { id: string; campaign_id: string; grid: Record<string, unknown>; bounds: Record<string, unknown> };
  // Against the node's OWN campaign. Trusting the URL's id here would let a DM of campaign A write objects
  // onto campaign B's map by pointing at B's node.
  if ((await getCampaignRole(node.campaign_id)) !== 'dm') {
    return { error: NextResponse.json({ error: 'Only the DM can place things on a map.' }, { status: 403 }) };
  }
  return { node };
}

/** Snap and clamp a position using the node's own grid and bounds. */
function place(node: { grid: Record<string, unknown>; bounds: Record<string, unknown> }, x: unknown, y: unknown) {
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  const snapped = snapToGrid(nx, ny, node.grid);
  return clampToMap(snapped.x, snapped.y, node.bounds as { maxX?: number; maxY?: number });
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const gate = await nodeGate(body.nodeId);
  if ('error' in gate) return gate.error;

  const kind = KINDS.has(String(body.kind)) ? String(body.kind) : 'token';
  const at = place(gate.node, body.x, body.y);
  if (!at) return NextResponse.json({ error: 'x and y must be numbers.' }, { status: 400 });

  const data = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>;
  // A TOKEN MUST BE BOUND TO SOMETHING, refused here rather than written and dropped at render time.
  // `readToken` already returns null for an unbound token and the map skips those — so without this check
  // the DM would place a token, see nothing appear, and have no idea why.
  if (kind === 'token' && !readToken(data)) {
    return NextResponse.json(
      { error: 'A token needs a character or creature to stand for — pass data.characterId, data.creatureId or data.creatureVariantId.' },
      { status: 400 },
    );
  }

  const visibility = VISIBILITIES.has(String(body.visibility)) ? String(body.visibility) : 'dm';
  const { data: created, error } = await supabaseAdmin
    .from('dnd_map_objects')
    .insert({
      map_node_id: gate.node.id,
      kind,
      x: at.x,
      y: at.y,
      data,
      // DM-ONLY BY DEFAULT. A thing the DM has just placed and not yet described should not appear on the
      // players' screen the instant it exists — revealing is a decision, and defaulting to visible would
      // make it an accident.
      visibility,
      label: typeof body.label === 'string' ? body.label.trim() || null : null,
      dm_notes: typeof body.dmNotes === 'string' ? body.dmNotes : null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ object: created }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (typeof body.id !== 'string') return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  // The object's node decides the campaign, and therefore the gate — the caller does not get to say.
  const { data: row } = await supabaseAdmin
    .from('dnd_map_objects').select('id, map_node_id').eq('id', body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'No such object.' }, { status: 404 });
  const gate = await nodeGate((row as { map_node_id: string }).map_node_id);
  if ('error' in gate) return gate.error;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.x !== undefined || body.y !== undefined) {
    const at = place(gate.node, body.x, body.y);
    if (!at) return NextResponse.json({ error: 'x and y must both be numbers to move.' }, { status: 400 });
    patch.x = at.x;
    patch.y = at.y;
  }
  if (Number.isFinite(Number(body.z))) patch.z = Math.round(Number(body.z));
  if (VISIBILITIES.has(String(body.visibility))) patch.visibility = String(body.visibility);
  if (typeof body.label === 'string') patch.label = body.label.trim() || null;
  if (typeof body.dmNotes === 'string') patch.dm_notes = body.dmNotes;
  if (body.data && typeof body.data === 'object') patch.data = body.data;

  const { error } = await supabaseAdmin.from('dnd_map_objects').update(patch).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const { data: row } = await supabaseAdmin
    .from('dnd_map_objects').select('id, map_node_id').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'No such object.' }, { status: 404 });
  const gate = await nodeGate((row as { map_node_id: string }).map_node_id);
  if ('error' in gate) return gate.error;

  const { error } = await supabaseAdmin.from('dnd_map_objects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
