// __tests__/dnd/map-tree.test.ts — walking the map tree (M3-2).
//
// These functions run against TWO different row sets: the DM's whole tree, and a player's filtered view.
// That is the reason they are pure and shared rather than SQL — two queries could disagree about the shape
// of the world, and the one that disagrees silently would be the player's. So the cases that matter most
// here are the malformed ones: an orphan whose parent was filtered away, and a cycle that the database
// forbids but a filtered or imported set might still contain.
import { describe, it, expect } from 'vitest';
import {
  ancestry, breadcrumb, canReparent, childrenOf, descendantsOf, heightOf, rootsOf, MAX_MAP_DEPTH,
  type MapNodeLike,
} from '@/lib/dnd/maps/tree';

const n = (id: string, parent: string | null, name: string, depth: number, tier = 'site', sort = 0): MapNodeLike =>
  ({ id, parent_id: parent, name, depth, tier, sort_order: sort });

/** Space → Aurelia → Vances Reach → Ironrow → The Cut → Kettle Corner. The owner's own example. */
const TREE: MapNodeLike[] = [
  n('space', null, 'Space', 1, 'space'),
  n('aurelia', 'space', 'Aurelia', 2, 'world'),
  n('reach', 'aurelia', 'Vances Reach', 3, 'continent'),
  n('ironrow', 'reach', 'Ironrow', 4, 'city'),
  n('cut', 'ironrow', 'The Cut', 5, 'district'),
  n('kettle', 'cut', 'Kettle Corner', 6, 'site'),
  // A sibling world, so ordering and sibling isolation are exercised.
  n('brackis', 'space', 'Brackis', 2, 'world', 1),
  // A SECOND deep branch, deliberately not under Aurelia. The depth rule needs a target that is deep but
  // NOT a descendant of the node being moved — without this, every "too deep" target was also a
  // descendant, so the cycle rule fired first and the depth rule was never actually exercised.
  n('b3', 'brackis', 'Sunder', 3, 'continent'),
  n('b4', 'b3', 'Ash Marches', 4, 'province'),
  n('b5', 'b4', 'Kiln', 5, 'city'),
  n('b6', 'b5', 'Emberside', 6, 'district'),
  // A leaf with nothing beneath it, for the contrast case below.
  n('leaf', 'space', 'Waystation', 2, 'site', 2),
];

describe('ancestry', () => {
  it('walks from the root down to the node, inclusive', () => {
    expect(ancestry(TREE, 'kettle').map((x) => x.name)).toEqual([
      'Space', 'Aurelia', 'Vances Reach', 'Ironrow', 'The Cut', 'Kettle Corner',
    ]);
  });

  it('a root is its own whole chain', () => {
    expect(ancestry(TREE, 'space').map((x) => x.id)).toEqual(['space']);
  });

  it('returns nothing for an unknown id', () => {
    expect(ancestry(TREE, 'nope')).toEqual([]);
  });

  it('stops cleanly when a parent is missing — the PLAYER-FILTERED case', () => {
    // The DM published Ironrow but not the continent above it. The player's rows contain a node whose
    // parent_id points at something they cannot see. That must read as "Ironrow is the top of what I can
    // see", not as an error and not as an empty page.
    const filtered = TREE.filter((x) => !['space', 'aurelia', 'reach'].includes(x.id));
    expect(ancestry(filtered, 'kettle').map((x) => x.name)).toEqual(['Ironrow', 'The Cut', 'Kettle Corner']);
  });

  it('TERMINATES on a cycle instead of hanging the render', () => {
    // Postgres forbids this (seed 465), but this module also runs over filtered and imported rows, and a
    // breadcrumb that spins is a worse failure than one that stops early.
    const cyclic: MapNodeLike[] = [
      n('a', 'c', 'A', 1), n('b', 'a', 'B', 2), n('c', 'b', 'C', 3),
    ];
    const out = ancestry(cyclic, 'c');
    expect(out.length).toBeLessThanOrEqual(MAX_MAP_DEPTH + 1);
    expect(new Set(out.map((x) => x.id)).size).toBe(out.length); // no id twice
  });
});

describe('childrenOf', () => {
  it('returns direct children only, never grandchildren', () => {
    // Aurelia and Brackis both have deep subtrees; none of that may appear here.
    expect(childrenOf(TREE, 'space').map((x) => x.name)).toEqual(['Aurelia', 'Brackis', 'Waystation']);
  });

  it('returns the roots for null', () => {
    expect(childrenOf(TREE, null).map((x) => x.id)).toEqual(['space']);
  });

  it('honours sort_order, then name — so two unordered nodes never swap between renders', () => {
    const unordered = [
      n('p', null, 'Parent', 1),
      n('z', 'p', 'Zeta', 2, 'site', 0),
      n('a', 'p', 'Alpha', 2, 'site', 0),
      n('m', 'p', 'Mid', 2, 'site', -1),
    ];
    expect(childrenOf(unordered, 'p').map((x) => x.name)).toEqual(['Mid', 'Alpha', 'Zeta']);
  });

  it('is empty for a leaf', () => {
    expect(childrenOf(TREE, 'kettle')).toEqual([]);
  });
});

describe('rootsOf', () => {
  it('finds the true root', () => {
    expect(rootsOf(TREE).map((x) => x.id)).toEqual(['space']);
  });

  it('TREATS AN ORPHAN AS A ROOT — otherwise a player sees an empty world', () => {
    // This is the whole point of the function. If the DM published a city but not the continent above it,
    // the city has a parent_id the player cannot resolve. Showing nothing would be the bug.
    const filtered = TREE.filter((x) => ['ironrow', 'cut', 'kettle'].includes(x.id));
    expect(rootsOf(filtered).map((x) => x.name)).toEqual(['Ironrow']);
  });

  it('handles several roots', () => {
    const two = [n('a', null, 'Alpha', 1), n('b', null, 'Beta', 1)];
    expect(rootsOf(two).map((x) => x.name)).toEqual(['Alpha', 'Beta']);
  });

  it('is empty for no nodes', () => {
    expect(rootsOf([])).toEqual([]);
  });
});

describe('descendantsOf', () => {
  it('collects the whole subtree, excluding the node itself', () => {
    expect(descendantsOf(TREE, 'ironrow').map((x) => x.id).sort()).toEqual(['cut', 'kettle']);
  });

  it('does not leak into a SIBLING subtree', () => {
    // Brackis has its own four-level chain; walking down from Aurelia must not pick up any of it, even
    // though both hang off Space.
    const fromAurelia = descendantsOf(TREE, 'aurelia').map((x) => x.id).sort();
    expect(fromAurelia).toEqual(['cut', 'ironrow', 'kettle', 'reach']);
  });

  it('is empty for a genuine leaf', () => {
    expect(descendantsOf(TREE, 'kettle')).toEqual([]);
    expect(descendantsOf(TREE, 'leaf')).toEqual([]);
  });

  it('is cycle-safe', () => {
    const cyclic = [n('a', 'b', 'A', 1), n('b', 'a', 'B', 2)];
    expect(() => descendantsOf(cyclic, 'a')).not.toThrow();
  });
});

describe('heightOf', () => {
  it('is 0 for a leaf', () => {
    expect(heightOf(TREE, 'kettle')).toBe(0);
  });

  it('counts the levels below a node', () => {
    expect(heightOf(TREE, 'ironrow')).toBe(2); // cut, kettle
    expect(heightOf(TREE, 'space')).toBe(5);
  });
});

describe('canReparent — mirrors the DB trigger so the UI can grey out an illegal drop', () => {
  it('allows a legal move', () => {
    expect(canReparent(TREE, 'brackis', 'aurelia').ok).toBe(true);
  });

  it('allows detaching to a root', () => {
    expect(canReparent(TREE, 'ironrow', null).ok).toBe(true);
  });

  it('refuses a node into itself', () => {
    const r = canReparent(TREE, 'ironrow', 'ironrow');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/itself/i);
  });

  it('refuses a node into its own descendant', () => {
    const r = canReparent(TREE, 'aurelia', 'kettle');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/already inside/i);
  });

  it('refuses a missing parent', () => {
    expect(canReparent(TREE, 'ironrow', 'ghost').ok).toBe(false);
  });

  it('COUNTS THE SUBTREE, not just the node — the bug the DB cascade exists for', () => {
    // Ironrow has 2 levels beneath it (The Cut → Kettle Corner). Emberside sits at depth 6 and is in a
    // different branch, so the cycle rule does not apply. The move would put Kettle Corner at depth 9.
    // A check that looked only at the moved node would call this legal.
    const r = canReparent(TREE, 'ironrow', 'b6');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too deep/i);
  });

  it('allows a LEAF into the same slot the tall subtree was refused from', () => {
    // The contrast that proves the refusal above is about the subtree's height rather than the target
    // simply being deep: Waystation has nothing under it, so depth 6 + 1 = 7 fits exactly.
    expect(canReparent(TREE, 'leaf', 'b6').ok).toBe(true);
  });

  it('and refuses that same leaf one level deeper, at the boundary', () => {
    // Depth 7 is the last legal level, so a child of a depth-7 node is the first illegal one. Boundaries
    // are where an off-by-one lives.
    const atSeven = [...TREE, n('b7', 'b6', 'Cinder Lane', 7, 'site')];
    const r = canReparent(atSeven, 'leaf', 'b7');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too deep/i);
  });
});

describe('breadcrumb', () => {
  it("is the owner's own example, in order", () => {
    expect(breadcrumb(TREE, 'kettle').map((c) => c.name)).toEqual([
      'Space', 'Aurelia', 'Vances Reach', 'Ironrow', 'The Cut', 'Kettle Corner',
    ]);
  });

  it('marks exactly the last crumb as current', () => {
    const trail = breadcrumb(TREE, 'kettle');
    expect(trail.filter((c) => c.isCurrent).map((c) => c.name)).toEqual(['Kettle Corner']);
  });

  it('carries the tier, so the UI can show scale without a second lookup', () => {
    expect(breadcrumb(TREE, 'ironrow').map((c) => c.tier)).toEqual(['space', 'world', 'continent', 'city']);
  });

  it('is empty for an unknown node rather than throwing', () => {
    expect(breadcrumb(TREE, 'nope')).toEqual([]);
  });
});
