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
        consoleRef: (n as unknown as { console_ref?: string | null }).console_ref ?? null,
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
