// lib/dnd/maps/tree.ts — walking the map tree (M3-2).
//
// The owner's drill-down: *"we can have a space map with worlds, and then we can select a world to zoom in
// on, and then that world can have locations on it that we can click on to load that location's map, and
// that location could have even more locations in it."* Which means two questions get asked constantly —
// *where am I* (the breadcrumb: Space / Aurelia / Vances Reach / Ironrow / The Cut) and *what can I go into
// from here* (the children).
//
// PURE, AND SEPARATE FROM THE QUERY, for a reason that is specific rather than stylistic: the same walk has
// to run against a DM's full tree and a player's filtered one. If ancestry lived in the SQL, the two views
// would be two queries that could disagree about the shape of the world — and the one that disagrees
// silently is the player's. Handing both the same function means a player's breadcrumb is the DM's
// breadcrumb with rows removed, never a different computation.
//
// Every function here is defensive about a MALFORMED TREE. `dnd_map_nodes` enforces acyclicity and depth in
// Postgres (seed 465), but this module also runs against rows that were filtered for a player — and
// filtering can orphan a node whose parent the player cannot see. An orphan must render as a root, not
// crash the page or loop forever.

export interface MapNodeLike {
  id: string;
  parent_id: string | null;
  name: string;
  tier: string;
  depth: number;
  sort_order?: number;
  published?: boolean;
}

/** The hard ceiling from the schema. Used as a loop bound so a corrupt tree fails fast rather than hangs. */
export const MAX_MAP_DEPTH = 7;

/**
 * The chain from the root down to `id`, inclusive. `[]` when the id is not in `nodes`.
 *
 * TERMINATES ON A CYCLE rather than spinning. The database forbids cycles, but this also runs over
 * player-filtered rows and over whatever a future import produces, and a breadcrumb that hangs the render
 * loop is a worse failure than one that stops early.
 */
export function ancestry<T extends MapNodeLike>(nodes: readonly T[], id: string): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: T[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    // A node whose parent is absent from `nodes` — normal for a player whose view is filtered — simply
    // ends the walk. It becomes the top of the trail rather than an error.
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    if (out.length > MAX_MAP_DEPTH + 1) break;
  }
  return out.reverse();
}

/** Direct children of `parentId` (or the roots when null), in the DM's chosen order. */
export function childrenOf<T extends MapNodeLike>(nodes: readonly T[], parentId: string | null): T[] {
  return nodes
    .filter((n) => (n.parent_id ?? null) === parentId)
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        // Stable, human tiebreak: two nodes a DM never explicitly ordered should still not swap places
        // between renders, which is what an unstable sort would do.
        a.name.localeCompare(b.name),
    );
}

/**
 * The roots to show for a campaign.
 *
 * A TRUE ROOT IS `parent_id === null`, but a player's filtered rows can contain a node whose parent was
 * filtered out — an orphan. Treating orphans as roots is what stops a player seeing an empty world when the
 * DM has published a city but not the continent above it. The alternative (showing nothing) is the bug
 * this function exists to avoid.
 */
export function rootsOf<T extends MapNodeLike>(nodes: readonly T[]): T[] {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes
    .filter((n) => n.parent_id === null || !ids.has(n.parent_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
}

/** Every descendant of `id`, excluding `id`. Breadth-first, cycle-safe. */
export function descendantsOf<T extends MapNodeLike>(nodes: readonly T[], id: string): T[] {
  const out: T[] = [];
  const seen = new Set<string>([id]);
  let frontier = childrenOf(nodes, id);
  let hops = 0;
  while (frontier.length && hops <= MAX_MAP_DEPTH) {
    const next: T[] = [];
    for (const n of frontier) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
      next.push(...childrenOf(nodes, n.id));
    }
    frontier = next;
    hops += 1;
  }
  return out;
}

/** Can `candidateParent` become the parent of `nodeId` without making a cycle? Mirrors the DB trigger, so
 *  the UI can grey out an illegal drop target instead of letting the DM discover it via an error toast. */
export function canReparent<T extends MapNodeLike>(
  nodes: readonly T[],
  nodeId: string,
  candidateParentId: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (candidateParentId === null) return { ok: true };
  if (candidateParentId === nodeId) return { ok: false, reason: 'A map cannot contain itself.' };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = byId.get(candidateParentId);
  if (!parent) return { ok: false, reason: 'That parent no longer exists.' };

  // Its own descendant? Walk UP from the candidate looking for the node.
  const chain = ancestry(nodes, candidateParentId);
  if (chain.some((n) => n.id === nodeId)) {
    return { ok: false, reason: 'That location is already inside this one.' };
  }

  // Depth: the moved node's own subtree has to fit under the new parent too. Checking only the node
  // itself is the bug the DB trigger's cascade exists for — a legal move for the node can still push a
  // grandchild past 7.
  const subtreeHeight = heightOf(nodes, nodeId);
  const resulting = parent.depth + 1 + subtreeHeight;
  if (resulting > MAX_MAP_DEPTH) {
    return {
      ok: false,
      reason: `Too deep — that would put this location's contents at level ${resulting} of ${MAX_MAP_DEPTH}.`,
    };
  }
  return { ok: true };
}

/** How many levels sit BELOW `id` (0 for a leaf). */
export function heightOf<T extends MapNodeLike>(nodes: readonly T[], id: string): number {
  const kids = childrenOf(nodes, id);
  if (!kids.length) return 0;
  return 1 + Math.max(...kids.map((k) => heightOf(nodes, k.id)));
}

export interface Crumb {
  id: string;
  name: string;
  tier: string;
  isCurrent: boolean;
}

/** The breadcrumb for a node: Space / Aurelia / Vances Reach / Ironrow / The Cut. */
export function breadcrumb<T extends MapNodeLike>(nodes: readonly T[], id: string): Crumb[] {
  const chain = ancestry(nodes, id);
  return chain.map((n, i) => ({
    id: n.id,
    name: n.name,
    tier: n.tier,
    isCurrent: i === chain.length - 1,
  }));
}
