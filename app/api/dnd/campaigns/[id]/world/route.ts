// app/api/dnd/campaigns/[id]/world/route.ts — the node tree, for the player console.
//
// Owner, 2026-07-29: *"the custom viewer that has all of the space sounds and stuff is also totally plugged
// in to show descriptions and locations and information and images of places and thumbnails."*
//
// The console is vanilla JS in an iframe; it cannot import `loadMapTree`, so it needs an endpoint. This is
// that endpoint, and it is deliberately the SAME function the React world page uses — two readers of one
// tree must not be two queries that can disagree about what a player may see.
//
// ── G3 IS ENFORCED HERE, NOT IN THE CONSOLE ──────────────────────────────────────────────────────────
//
// A player's response contains no unpublished node, no `dm_notes`, and no DM-only pin. That is a property
// of what `loadMapTree(..., { isDm: false })` SELECTs, not of what the console chooses to render — because
// the console is a static file a curious player can read, and anything sent to it is disclosed. A hidden
// location filtered in JavaScript is not hidden.
//
// The response is also deliberately SMALL: name, tier, blurb, image, and the parent/child links. The
// console needs a readout and a thumbnail, not the whole row — `grid`, `bounds` and the object list would
// be dead weight on every poll.
// Plain handler, matching every sibling route under app/api/dnd (see `maps/route.ts`) rather than the
// `withErrorHandler` wrapper the /admin API uses.
import { NextRequest, NextResponse } from 'next/server';
import { getCampaignRole } from '@/lib/dnd/auth';
import { loadMapTree } from '@/lib/dnd/maps/query';
import { sanitizeGrid } from '@/lib/dnd/maps/grid';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const campaignId = params.id;

  // Membership is the gate. `getCampaignRole` returns null for a non-member, and a campaign's geography is
  // exactly the kind of thing a DM would not want handed to a stranger who guessed the id.
  const role = await getCampaignRole(campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });

  try {
    const { nodes, pins } = await loadMapTree(campaignId, { isDm: role === 'dm' });

    return NextResponse.json({
      isDm: role === 'dm',
      nodes: nodes.map((n) => ({
        id: n.id,
        parentId: n.parent_id,
        name: n.name,
        tier: n.tier,
        depth: n.depth,
        blurb: n.blurb,
        imageUrl: n.image_url,
        // The join back to a stardust body. Null means the console falls back to a name match.
        consoleRef: n.console_ref,
        // Only meaningful to a DM — a player's rows are all published by construction, so sending it is
        // not a leak, and it lets a DM see at a glance what the party cannot.
        published: n.published,
      })),
      pins: pins.map((p) => ({
        id: p.id,
        nodeId: p.map_node_id,
        childNodeId: p.child_node_id,
        x: p.x,
        y: p.y,
        icon: p.icon,
        label: p.label,
      })),
    });
  } catch (err) {
    // The console polls this. A 500 with a body it can read beats an unhandled throw, which Next renders
    // as an HTML error page that the console's `res.json()` then fails on with a parse error — hiding the
    // real cause behind a second, unrelated one.
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Could not load the world: ${message}` }, { status: 500 });
  }
}

// ── Authoring (M4-4) ─────────────────────────────────────────────────────────────────────────────────
//
// Until this existed the whole map stack was unreachable: the schema was live, the browser worked, the
// console was wired — and there was no way to create a single node. Read-only infrastructure nobody can
// put data into is the same defect as an unwired component, arriving from the other direction.
//
// DM ONLY. A player may read a published tree; only the DM shapes it.
//
// FIELD WHITELISTS, NOT `...body`. Mass assignment here would let a caller set `depth` (which the trigger
// owns), `campaign_id` (moving a node between campaigns), or `id`. Every writable field is named.

/** Tiers the schema's CHECK constraint accepts. Rejected here too, so the caller gets a sentence rather
 *  than a Postgres constraint name. */
const TIERS = ['space', 'world', 'continent', 'province', 'city', 'district', 'site'];

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Postgres raises for the rules the triggers own — depth over 7, a cycle, a bad tier. Those messages are
 * written FOR a DM ("Seven levels is the maximum. Place this location in a shallower parent.") so they are
 * passed through rather than replaced with a generic 500. A constraint name is not an error message.
 */
function dbError(message: string): NextResponse {
  const friendly =
    /nesting limit|own ancestor|already cyclic/.test(message) ? message
    : /dnd_map_nodes_tier_known/.test(message) ? 'That is not a tier this app knows about.'
    : /render_2d_only/.test(message) ? 'Only 2D maps can be created right now.'
    : /name_present/.test(message) ? 'A location needs a name.'
    : /console_ref/.test(message) ? 'Another location is already linked to that map body.'
    : message;
  return NextResponse.json({ error: friendly }, { status: 400 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const campaignId = params.id;
  if ((await getCampaignRole(campaignId)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can build the world.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = str(body?.name, 120);
  if (!name) return NextResponse.json({ error: 'A location needs a name.' }, { status: 400 });

  const tier = TIERS.includes(body?.tier) ? body.tier : 'site';
  const parentId = str(body?.parentId, 64);

  // The parent must belong to THIS campaign. Without the check a DM could nest their world under a node
  // id belonging to someone else's campaign — the FK would accept it, since it only requires the row to
  // exist. `depth` is deliberately not sent: the trigger derives it.
  if (parentId) {
    const { data: parent, error } = await supabaseAdmin
      .from('dnd_map_nodes').select('id').eq('id', parentId).eq('campaign_id', campaignId).maybeSingle();
    if (error) return dbError(error.message);
    if (!parent) return NextResponse.json({ error: 'That parent is not in this campaign.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('dnd_map_nodes')
    .insert({
      campaign_id: campaignId,
      parent_id: parentId,
      name,
      tier,
      blurb: str(body?.blurb, 4000),
      image_url: str(body?.imageUrl, 2000),
      console_ref: str(body?.consoleRef, 200),
      published: body?.published === true,
    })
    .select('id, name, tier, depth, parent_id, published')
    .single();

  if (error) return dbError(error.message);
  return NextResponse.json({ node: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const campaignId = params.id;
  if ((await getCampaignRole(campaignId)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can build the world.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const nodeId = str(body?.nodeId, 64);
  if (!nodeId) return NextResponse.json({ error: 'Which location?' }, { status: 400 });

  // Only the named fields, and only when PRESENT — so a partial update does not blank everything the
  // caller left out. `undefined` means "not mentioned"; an explicit null means "clear it".
  const patch: Record<string, unknown> = {};
  if ('name' in body) {
    const n = str(body.name, 120);
    if (!n) return NextResponse.json({ error: 'A location needs a name.' }, { status: 400 });
    patch.name = n;
  }
  if ('tier' in body) {
    if (!TIERS.includes(body.tier)) return NextResponse.json({ error: 'Unknown tier.' }, { status: 400 });
    patch.tier = body.tier;
  }
  if ('blurb' in body) patch.blurb = str(body.blurb, 4000);
  if ('imageUrl' in body) patch.image_url = str(body.imageUrl, 2000);
  if ('consoleRef' in body) patch.console_ref = str(body.consoleRef, 200);
  if ('published' in body) patch.published = body.published === true;
  if ('sortOrder' in body && Number.isFinite(Number(body.sortOrder))) patch.sort_order = Number(body.sortOrder);
  // M4-1 — the grid. `sanitizeGrid` is the WRITE half of `lib/dnd/maps/grid.ts`: it emits exactly one
  // canonical shape, so the aliases the reader tolerates (`size_px`, `unit_ft`) never get written again,
  // and a colour that is not a colour never reaches the `style` attribute the overlay puts it in.
  //
  // Null is a meaningful value here — "this node has no battle grid" — so it is stored as `{}` rather than
  // rejected. The column is NOT NULL with a `{}` default, and `readGrid` treats both as no grid.
  if ('grid' in body) patch.grid = sanitizeGrid(body.grid) ?? {};
  // Re-parenting is allowed; the cycle and depth triggers police it and their messages are surfaced.
  if ('parentId' in body) patch.parent_id = str(body.parentId, 64);

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  // `.eq('campaign_id')` is the authorization, not a filter: without it a DM of campaign A could edit any
  // node in campaign B by id.
  const { data, error } = await supabaseAdmin
    .from('dnd_map_nodes')
    .update(patch)
    .eq('id', nodeId)
    .eq('campaign_id', campaignId)
    .select('id, name, tier, depth, parent_id, published')
    .maybeSingle();

  if (error) return dbError(error.message);
  if (!data) return NextResponse.json({ error: 'No such location in this campaign.' }, { status: 404 });
  return NextResponse.json({ node: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const campaignId = params.id;
  if ((await getCampaignRole(campaignId)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can build the world.' }, { status: 403 });
  }

  const nodeId = new URL(req.url).searchParams.get('nodeId');
  if (!nodeId) return NextResponse.json({ error: 'Which location?' }, { status: 400 });

  // DELETING CASCADES to the whole subtree (the FK says so). Count first and return it, so the UI can name
  // what it is about to destroy — "delete Ironrow and the 6 locations inside it" — rather than offering a
  // bare confirm. The plan's M4-4 asks for exactly that.
  const { count, error: countErr } = await supabaseAdmin
    .from('dnd_map_nodes')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('parent_id', nodeId);
  if (countErr) return dbError(countErr.message);

  const { error } = await supabaseAdmin
    .from('dnd_map_nodes').delete().eq('id', nodeId).eq('campaign_id', campaignId);
  if (error) return dbError(error.message);

  return NextResponse.json({ ok: true, directChildrenRemoved: count ?? 0 });
}
