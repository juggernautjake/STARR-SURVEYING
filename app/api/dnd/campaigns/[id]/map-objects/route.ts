// app/api/dnd/campaigns/[id]/map-objects/route.ts — put things on a map, change them, take them off (M4-2).
//
//   POST   { nodeId, kind?, x, y, data, label?, visibility? }        → place
//   POST   { duplicateOf: <id> }                                     → copy, offset one cell
//   PATCH  { id, x?, y?, w?, h?, rotation?, z?, visibility?, … }     → move / resize / rotate / relayer
//   PATCH  { ids: [...], dx?, dy?, dz?, visibility? }                → the same change to a selection
//   DELETE ?id=…  |  ?ids=a,b,c                                      → remove
//
// DM ONLY, every verb. A map object is the DM's authored content — where the ambush is, which door is
// secret, what the party has not found yet — and a player who could write one could also move a token onto
// a trap or reveal a `dm` object by flipping its visibility. `getCampaignRole` is the gate, and it is
// checked against the campaign that owns the NODE rather than against the id in the URL: those are the same
// thing only if you check, and "the caller said this node is in their campaign" is not a check.
//
// ── THE RULES LIVE IN `lib/dnd/maps/tokens.ts` AND `object-edits.ts`, NOT HERE ───────────────────────
//
// Snapping to the grid and clamping to the map are applied SERVER-SIDE from the node's own `grid` and
// `bounds`. A client that computes its own position is a client that can put a token outside the map —
// where the viewport's pan clamp means nothing could ever scroll to it — and a second implementation of
// snapping is a second answer to "which square is this on".
//
// ── EVERY WRITE IS JOURNALLED, IN ONE BATCH PER REQUEST (G7) ────────────────────────────────────────
//
// G7: *"Map authoring is destructive by nature — drag something, lose its old position."* So every verb
// here records what the row was before and what it became, under a single batch id, and
// `map-objects/undo` walks it backwards. One request is one undo: removing four tokens is one press to
// get all four back, not four presses that each return one.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { clampToMap, readToken, snapToGrid } from '@/lib/dnd/maps/tokens';
import { readGrid } from '@/lib/dnd/maps/grid';
import {
  SIZEABLE_KINDS, clampSize, clampZ, duplicateOffset, normalizeRotation, summarizeEdit,
  type MapObjectRow,
} from '@/lib/dnd/maps/object-edits';
import { OBJECT_COLS, newBatchId, readDiscoveries, readObjects, record } from '@/lib/dnd/maps/journal';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['image', 'prop', 'token', 'light', 'area', 'note', 'hidden']);
const VISIBILITIES = new Set(['dm', 'players', 'discovered']);
/** One request may not touch more than this. A selection is a handful of pieces; a thousand ids is a
 *  script, and a bulk verb with no ceiling is the cheapest way to make a route expensive to call. */
const MAX_BULK = 100;

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

type Node = { grid: Record<string, unknown>; bounds: Record<string, unknown> };

/** Snap and clamp a position using the node's own grid and bounds. */
function place(node: Node, x: unknown, y: unknown, freehand = false) {
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  // THE SNAP OVERRIDE (M4-2). A grid is a convenience, not a law — a rug across a doorway or a torch on
  // a wall belongs between two cells, and a DM who has said "not this time" must be believed rather than
  // corrected. The clamp is NOT optional in the same way: it is what keeps an object inside the map,
  // where the viewport can actually reach it.
  const snapped = freehand ? { x: nx, y: ny } : snapToGrid(nx, ny, node.grid);
  return clampToMap(snapped.x, snapped.y, node.bounds as { maxX?: number; maxY?: number });
}

/** The ids a bulk verb is addressing, refused rather than silently truncated (G6). */
function readIds(raw: unknown): { ids: string[] } | { error: NextResponse } {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const ids = list.map((s) => String(s).trim()).filter(Boolean);
  if (!ids.length) return { error: NextResponse.json({ error: 'id or ids is required.' }, { status: 400 }) };
  if (ids.length > MAX_BULK) {
    return {
      error: NextResponse.json(
        { error: `That is ${ids.length} objects; ${MAX_BULK} is the most one request may change.` },
        { status: 400 },
      ),
    };
  }
  return { ids };
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // ── duplicate ────────────────────────────────────────────────────────────────────────────────────
  // The source decides the node, so a caller cannot copy someone else's object onto their own map by
  // naming their node — the same rule PATCH and DELETE follow.
  if (typeof body.duplicateOf === 'string') {
    const [src] = await readObjects([body.duplicateOf]);
    if (!src) return NextResponse.json({ error: 'No such object.' }, { status: 404 });
    const gate = await nodeGate(src.map_node_id);
    if ('error' in gate) return gate.error;

    const grid = readGrid(gate.node.grid);
    const { dx, dy } = duplicateOffset(grid?.size ?? null);
    const at = place(gate.node, src.x + dx, src.y + dy);
    const { id: _drop, ...rest } = src;
    const { data: copy, error } = await supabaseAdmin
      .from('dnd_map_objects')
      .insert({ ...rest, x: at?.x ?? src.x, y: at?.y ?? src.y })
      .select(OBJECT_COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const row = copy as unknown as MapObjectRow;
    await record(src.map_node_id, newBatchId(), session.userId, [
      { entityId: row.id, action: 'create', after: row, summary: summarizeEdit('create', row) },
    ]);
    return NextResponse.json({ object: { id: row.id } }, { status: 201 });
  }

  // ── place ────────────────────────────────────────────────────────────────────────────────────────
  const gate = await nodeGate(body.nodeId);
  if ('error' in gate) return gate.error;

  const kind = KINDS.has(String(body.kind)) ? String(body.kind) : 'token';
  const at = place(gate.node, body.x, body.y, body.freehand === true);
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
      // Size only where a size means something. A token's footprint comes from the creature's own size
      // category through the node's grid (M5-1b) — writing a width onto one would be the map holding a
      // second opinion about how big an Ogre is.
      ...(SIZEABLE_KINDS.has(kind) && Number.isFinite(Number(body.w)) ? { w: clampSize(Number(body.w)) } : {}),
      ...(SIZEABLE_KINDS.has(kind) && Number.isFinite(Number(body.h)) ? { h: clampSize(Number(body.h)) } : {}),
      data,
      // DM-ONLY BY DEFAULT. A thing the DM has just placed and not yet described should not appear on the
      // players' screen the instant it exists — revealing is a decision, and defaulting to visible would
      // make it an accident.
      visibility,
      label: typeof body.label === 'string' ? body.label.trim() || null : null,
      dm_notes: typeof body.dmNotes === 'string' ? body.dmNotes : null,
      description: typeof body.description === 'string' ? body.description : null,
    })
    .select(OBJECT_COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = created as unknown as MapObjectRow;
  await record(gate.node.id, newBatchId(), session.userId, [
    { entityId: row.id, action: 'create', after: row, summary: summarizeEdit('create', row) },
  ]);
  return NextResponse.json({ object: { id: row.id } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const picked = readIds(body.ids ?? body.id);
  if ('error' in picked) return picked.error;

  // Read the rows FIRST. They are both the `before` half of the journal and the gate's subject — the
  // object's node decides the campaign, so a caller naming their own node cannot reach someone else's
  // object.
  const before = await readObjects(picked.ids);
  if (!before.length) return NextResponse.json({ error: 'No such object.' }, { status: 404 });
  // One request, one map. A mixed set would need a gate per node and an undo entry per node, and there
  // is no interaction that produces one — a selection is made on the map the DM is looking at.
  const nodeIds = new Set(before.map((r) => r.map_node_id));
  if (nodeIds.size > 1) {
    return NextResponse.json({ error: 'Those objects are on different maps.' }, { status: 400 });
  }
  const gate = await nodeGate(before[0].map_node_id);
  if ('error' in gate) return gate.error;

  const bulk = Array.isArray(body.ids);
  const freehand = body.freehand === true;
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];

  for (const row of before) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // ABSOLUTE for one object, RELATIVE for a selection. Moving five tokens to the same x,y would stack
    // them on one square; a delta keeps the shape of the group, which is the only thing "move these"
    // can sensibly mean.
    if (bulk && (body.dx !== undefined || body.dy !== undefined)) {
      const at = place(gate.node, Number(row.x) + Number(body.dx ?? 0), Number(row.y) + Number(body.dy ?? 0), freehand);
      if (!at) return NextResponse.json({ error: 'dx and dy must be numbers.' }, { status: 400 });
      patch.x = at.x;
      patch.y = at.y;
    } else if (!bulk && (body.x !== undefined || body.y !== undefined)) {
      const at = place(gate.node, body.x, body.y, freehand);
      if (!at) return NextResponse.json({ error: 'x and y must both be numbers to move.' }, { status: 400 });
      patch.x = at.x;
      patch.y = at.y;
    }

    // Resize is refused for kinds that do not own their size, rather than written and ignored at render
    // time — a control that appears to work and does nothing is worse than one that is not offered.
    for (const [key, val] of [['w', body.w], ['h', body.h]] as const) {
      if (val === undefined) continue;
      if (!SIZEABLE_KINDS.has(row.kind)) {
        return NextResponse.json(
          { error: `A ${row.kind} has no size of its own — a token's footprint comes from the creature's size and the node's grid.` },
          { status: 400 },
        );
      }
      if (!Number.isFinite(Number(val))) return NextResponse.json({ error: 'w and h must be numbers.' }, { status: 400 });
      patch[key] = clampSize(Number(val));
    }

    if (body.rotation !== undefined) patch.rotation = normalizeRotation(Number(body.rotation));
    // Relative for a selection, so "send these to the back" keeps their order among themselves.
    if (body.dz !== undefined) patch.z = clampZ(Number(row.z) + Number(body.dz));
    else if (body.z !== undefined) patch.z = clampZ(Number(body.z));

    if (VISIBILITIES.has(String(body.visibility))) patch.visibility = String(body.visibility);
    if (typeof body.label === 'string') patch.label = body.label.trim() || null;
    if (typeof body.description === 'string') patch.description = body.description || null;
    if (typeof body.dmNotes === 'string') patch.dm_notes = body.dmNotes;
    if (typeof body.assetUrl === 'string') patch.asset_url = body.assetUrl.trim() || null;
    if (body.data && typeof body.data === 'object') patch.data = body.data;

    patches.push({ id: row.id, patch });
  }

  for (const p of patches) {
    const { error } = await supabaseAdmin.from('dnd_map_objects').update(p.patch).eq('id', p.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const after = await readObjects(picked.ids);
  const byId = new Map(after.map((r) => [r.id, r]));
  await record(
    gate.node.id,
    newBatchId(),
    session.userId,
    before.map((row) => ({
      entityId: row.id,
      action: 'update' as const,
      before: row,
      after: byId.get(row.id) ?? null,
      summary: summarizeEdit('update', row),
    })),
  );
  return NextResponse.json({ ok: true, changed: patches.length });
}

export async function DELETE(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const picked = readIds(req.nextUrl.searchParams.get('ids') ?? req.nextUrl.searchParams.get('id'));
  if ('error' in picked) return picked.error;

  const before = await readObjects(picked.ids);
  if (!before.length) return NextResponse.json({ error: 'No such object.' }, { status: 404 });
  if (new Set(before.map((r) => r.map_node_id)).size > 1) {
    return NextResponse.json({ error: 'Those objects are on different maps.' }, { status: 400 });
  }
  const gate = await nodeGate(before[0].map_node_id);
  if ('error' in gate) return gate.error;

  // Read the discoveries BEFORE the delete cascades them away — see `journal.readDiscoveries`. After the
  // delete they are gone and unrecoverable, so an undo would hand back the secret with the party's
  // knowledge of it silently erased.
  const discoveries = await readDiscoveries(picked.ids);

  const { error } = await supabaseAdmin.from('dnd_map_objects').delete().in('id', picked.ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const batch = newBatchId();
  await record(gate.node.id, batch, session.userId, [
    // Discoveries first, so `undoOrder`'s newest-first walk restores the OBJECT before the discovery
    // that references it — the FK would refuse it the other way round.
    ...discoveries.map((d) => ({
      entity: 'discovery' as const, entityId: d.id, action: 'delete' as const, before: d, summary: null,
    })),
    ...before.map((row) => ({
      entityId: row.id, action: 'delete' as const, before: row, summary: summarizeEdit('delete', row),
    })),
  ]);
  return NextResponse.json({ ok: true, removed: before.length });
}
