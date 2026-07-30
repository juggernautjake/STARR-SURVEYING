// lib/dnd/bestiary/planes.ts — "creatures from every plane", as a filter rather than a claim (B5-2).
//
// Owner's brief: *"a full and robust list of all kinds of creatures from every plane and every kind of
// alignment."* G7 lists **plane** among the filters the bestiary must offer. The B5 audit reported the gap
// bluntly: 8 of 5,025 creatures carry an environment, because neither source publishes environment data —
// so the control would have been empty.
//
// ── WHAT IS ACTUALLY PUBLISHED, AND WHAT IS NOT ──────────────────────────────────────────────────────
//
// Measured over the finished catalogue before writing any of this:
//
//   · **A creature's TYPE states its plane of origin.** This is not a derivation and not a house reading —
//     it is what the type MEANS. A fiend is defined as a native of the Lower Planes, a celestial of the
//     Upper Planes, an elemental of the Inner/Elemental Planes, a fey of the Feywild. 1,090 creatures.
//
//   · **The prose names a specific plane** for a smaller set: the Abyss on 223, an Elemental Plane on 84,
//     the Ethereal on 74, the Astral on 18. More precise where it exists, absent where it does not.
//
//   · **Terrestrial environment — arctic, forest, swamp — is NOT derivable.** Neither source publishes it,
//     and the prose is not a substitute: 148 descriptions mention "forest" and 48 mention "swamp", but a
//     Cloud Giant's history paragraph mentioning a swamp does not put it in one. That half stays absent
//     and is reported as absent, which is the whole point of the audit that found it.
//
// ── WHY TYPE, NOT A STORED COLUMN ────────────────────────────────────────────────────────────────────
//
// The plane IS the type for these creatures, so storing it would duplicate a fact and let the two
// disagree after a re-import. Deriving it keeps the filter in the database (a `tags` query, per B1-1's
// rule that filtering happens in SQL rather than in the page) and keeps it correct for free.

import type { CreatureTag } from './taxonomy';

/** A plane a creature can be filtered by. The key is what appears in a URL. */
export interface PlaneDef {
  key: string;
  label: string;
  /** The standard creature type this plane is the origin of.
   *
   *  Typed as `CreatureTag` rather than `string` so a plane cannot name a type the taxonomy does not
   *  have — which would compile fine and then silently filter to nothing forever. */
  tag: CreatureTag;
  /** Stated on the page, so a reader can see this is published cosmology rather than our guess. */
  basis: string;
  /** More specific planes the prose may name, checked in order. */
  refine?: Array<{ match: RegExp; label: string }>;
}

export const PLANES: PlaneDef[] = [
  {
    key: 'lower',
    label: 'The Lower Planes',
    tag: 'fiend',
    basis: 'Fiends are defined as natives of the Lower Planes.',
    refine: [
      { match: /\babyss(al)?\b/i, label: 'The Abyss' },
      { match: /\bnine hells\b|\bbaator\b/i, label: 'The Nine Hells' },
      { match: /\bgehenna\b/i, label: 'Gehenna' },
      { match: /\bhades\b/i, label: 'Hades' },
    ],
  },
  {
    key: 'upper',
    label: 'The Upper Planes',
    tag: 'celestial',
    basis: 'Celestials are defined as natives of the Upper Planes.',
    refine: [
      { match: /\bmount celestia\b|\bcelestia\b/i, label: 'Mount Celestia' },
      { match: /\belysium\b/i, label: 'Elysium' },
      { match: /\barborea\b/i, label: 'Arborea' },
    ],
  },
  {
    key: 'elemental',
    label: 'The Elemental Planes',
    tag: 'elemental',
    basis: 'Elementals are defined as natives of the Elemental Planes.',
    refine: [
      { match: /\bplane of fire\b/i, label: 'The Elemental Plane of Fire' },
      { match: /\bplane of water\b/i, label: 'The Elemental Plane of Water' },
      { match: /\bplane of air\b/i, label: 'The Elemental Plane of Air' },
      { match: /\bplane of earth\b/i, label: 'The Elemental Plane of Earth' },
    ],
  },
  {
    key: 'feywild',
    label: 'The Feywild',
    tag: 'fey',
    basis: 'Fey are defined as natives of the Feywild.',
  },
  {
    // HEDGED ON PURPOSE. The published wording for aberrations is "alien entities … MANY of them from the
    // Far Realm" — many, not all. Stating it as flatly as the four above would overclaim, so the label and
    // the basis both say so, and it sits apart from the definitional four.
    key: 'far',
    label: 'The Far Realm (many)',
    tag: 'aberration',
    basis: 'Aberrations are alien entities, many of them originating in the Far Realm — the source says "many", not "all".',
  },
];

/** Undead and constructs are deliberately absent: both are MADE, usually on the Material Plane, so giving
 *  them a plane of origin would invent a fact the rules do not state. */
export const PLANE_KEYS = PLANES.map((p) => p.key);

export const planeByKey = (key: string | null | undefined): PlaneDef | null =>
  PLANES.find((p) => p.key === key) ?? null;

export interface PlaneReading {
  key: string;
  /** The most specific plane we can honestly name. */
  label: string;
  basis: string;
  /** True when the prose named a specific plane rather than the type implying a family. */
  specific: boolean;
}

/**
 * The plane a creature comes from, or null when its type does not imply one.
 *
 * NULL FOR MOST CREATURES, and that is correct: a wolf, a goblin and an iron golem are Material Plane
 * natives or constructs, and inventing a planar origin for them is the failure this module exists to
 * avoid — the same rule that keeps 80% of Intuitive Games creatures without a stance.
 */
export function planeFor(c: { tags?: string[] | null; description?: string | null }): PlaneReading | null {
  const tags = c.tags ?? [];
  const def = PLANES.find((p) => tags.includes(p.tag));
  if (!def) return null;

  const prose = c.description ?? '';
  for (const r of def.refine ?? []) {
    if (r.match.test(prose)) {
      return { key: def.key, label: r.label, basis: `${def.basis} This one's own text names ${r.label}.`, specific: true };
    }
  }
  return { key: def.key, label: def.label, basis: def.basis, specific: false };
}
