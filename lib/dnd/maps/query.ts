// lib/dnd/maps/query.ts — reading the map tree (M3-2).
//
// G3, RESTATED AS CODE: *"The DM's view and the player's view are different QUERIES, not the same payload
// with a flag."* A hidden item the client receives is a hidden item the client can reveal — view-source is
// not a security boundary, and neither is a React conditional. So `loadMapTree` takes `isDm` and changes
// what it SELECTS, not what it renders.
//
// Concretely, a player never receives:
//   - unpublished nodes,
//   - `dm_notes` on any object (the column is not in their select list at all),
//   - objects whose visibility is 'dm' — including every `hidden` object, which is the whole Perception-DC
//     mechanic. A discovered one arrives only because a `dnd_map_discoveries` row exists for their
//     character, which the server writes after comparing a roll it can see against a DC the client cannot.
//
// ERRORS ARE READ, NOT DISCARDED. `{ data }` without `error` is this repo's most repeated defect — it made
// the bestiary's `full-extract` report zero artifacts for a table that does not exist, and it hid a
// CHECK-constraint rejection that silently dropped every DM grant's audit row for months. An empty map and
// a broken map must not look the same, so a failure throws.
import { supabaseAdmin } from '@/lib/supabase';
import type { MapNodeLike } from './tree';

export interface MapNode extends MapNodeLike {
  campaign_id: string;
  blurb: string | null;
  image_url: string | null;
  render_kind: string;
  grid: Record<string, unknown>;
  bounds: Record<string, unknown>;
  published: boolean;
  sort_order: number;
  /** The stardust `instances[].id` this node represents in the player console (seed 466). Null = unlinked;
   *  the console then falls back to a case-insensitive name match. */
  console_ref: string | null;
}

export interface MapPin {
  id: string;
  map_node_id: string;
  child_node_id: string | null;
  x: number;
  y: number;
  icon: string | null;
  label: string | null;
  visibility: string;
}

const NODE_COLS =
  'id, campaign_id, parent_id, tier, depth, name, blurb, image_url, render_kind, grid, bounds, published, sort_order, console_ref';
const PIN_COLS = 'id, map_node_id, child_node_id, x, y, icon, label, visibility';

/**
 * Every map node in a campaign the viewer may see.
 *
 * The whole tree in one query rather than a node at a time: a campaign's node count is dozens, not
 * thousands, and the breadcrumb needs the ancestors anyway. One round trip beats seven.
 */
export async function loadMapTree(
  campaignId: string,
  opts: { isDm: boolean },
): Promise<{ nodes: MapNode[]; pins: MapPin[] }> {
  let nodeQ = supabaseAdmin.from('dnd_map_nodes').select(NODE_COLS).eq('campaign_id', campaignId);
  if (!opts.isDm) nodeQ = nodeQ.eq('published', true);

  const { data: nodeRows, error: nodeErr } = await nodeQ
    .order('depth', { ascending: true })
    .order('sort_order', { ascending: true });
  if (nodeErr) throw new Error(`map tree query failed: ${nodeErr.message}`);

  const nodes = (nodeRows ?? []) as unknown as MapNode[];
  if (!nodes.length) return { nodes: [], pins: [] };

  let pinQ = supabaseAdmin
    .from('dnd_map_pins')
    .select(PIN_COLS)
    .in('map_node_id', nodes.map((n) => n.id));
  // A DM-only pin marks a place the party has not been told about. `discovered` is handled per character
  // and is not resolvable here, so a player sees only what is explicitly published to them.
  if (!opts.isDm) pinQ = pinQ.eq('visibility', 'players');

  const { data: pinRows, error: pinErr } = await pinQ;
  if (pinErr) throw new Error(`map pins query failed: ${pinErr.message}`);

  return { nodes, pins: (pinRows ?? []) as unknown as MapPin[] };
}

// ── M5-1 / M4-2: the things ON a map ─────────────────────────────────────────────────────────────────
//
// `dnd_map_objects` shipped applied and complete with M1-3 — kinds, positions, z-order, per-object
// visibility, DM notes, and a `data` blob for the kind-specific fields — and **nothing has ever read or
// written it**. A table with no consumer is this codebase's signature defect, and here it is the exact
// thing standing between the map tree and running a session on it: a map you cannot put a token on is a
// picture.

/** The DM-only columns. Named once so a player query provably cannot include them. */
const OBJECT_DM_COLS = 'dm_notes';
const OBJECT_COLS =
  'id, map_node_id, kind, x, y, w, h, rotation, z, asset_url, label, description, data, visibility';

export type MapObjectKind = 'image' | 'prop' | 'token' | 'light' | 'area' | 'note' | 'hidden';
export type MapObjectVisibility = 'dm' | 'players' | 'discovered';

export interface MapObject {
  id: string;
  map_node_id: string;
  kind: MapObjectKind;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  rotation: number;
  z: number;
  asset_url: string | null;
  label: string | null;
  /** Read-aloud text (M6-3). Safe for players — `dm_notes` is the secret one. */
  description: string | null;
  /** Kind-specific fields: a token's `characterId`, a hidden object's `skill`/`dc`. */
  data: Record<string, unknown>;
  visibility: MapObjectVisibility;
  /** DM-only, and **absent rather than null** on a player payload — see below. */
  dm_notes?: string | null;
}

/**
 * Everything placed on a node, for the viewer who asked.
 *
 * TWO QUERIES, NOT ONE PAYLOAD WITH A FLAG — the rule this module's header already states, now with an
 * object table to apply it to. A player's query:
 *
 *   · does not SELECT `dm_notes`, so the column never crosses the wire. Sending it and hiding it in React
 *     would put every secret one view-source away, and "the client filters it" has never been a boundary.
 *   · matches `visibility = 'players'` only. A `dm` object — which is every `hidden` object, the whole
 *     Perception-DC mechanic — is not in the result set at all.
 *   · leaves `discovered` out too, deliberately: whether THIS party has found a thing is a per-character
 *     question answered by `dnd_map_discoveries`, and answering it here would need a character the caller
 *     has not supplied. Returning it "because they probably found it" is exactly the guess G3 forbids.
 *
 * So the DM branch and the player branch differ in their SELECT and their WHERE, which is the only version
 * a later refactor cannot accidentally undo by moving a conditional.
 */
export async function loadMapObjects(
  nodeIds: readonly string[],
  opts: { isDm: boolean },
): Promise<MapObject[]> {
  if (!nodeIds.length) return [];

  const cols = opts.isDm ? `${OBJECT_COLS}, ${OBJECT_DM_COLS}` : OBJECT_COLS;
  let q = supabaseAdmin.from('dnd_map_objects').select(cols).in('map_node_id', nodeIds as string[]);
  if (!opts.isDm) q = q.eq('visibility', 'players');

  // z ASC so a caller painting in order gets the layering the DM authored, without sorting it again and
  // getting a different answer for equal z.
  const { data, error } = await q.order('z', { ascending: true }).order('id', { ascending: true });
  if (error) throw new Error(`map objects query failed: ${error.message}`);
  return (data ?? []) as unknown as MapObject[];
}
