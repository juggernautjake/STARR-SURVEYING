// lib/dnd/maps/html-world.ts — a map for a node that has no art (M2-2).
//
// OWNER: *"for now just use the 2d version with html to represent all of the worlds and stuff."*
//
// THE POINT IS THAT A DM NEVER FACES AN EMPTY MAP. A node with no `image_url` is the normal case, not the
// broken one: seven tiers deep means a campaign is dozens of maps, and nobody is going to source art for a
// province before they know whether the province survives contact with the party. So an unillustrated node
// renders as generated geometry that reads as *the right kind of place* — a starfield for space, a disc
// with landmasses for a world, a street lattice for a city — and the DM can replace it with real art
// whenever they like.
//
// DETERMINISTIC FROM THE NODE ID, which is the property that makes it usable rather than a novelty. The
// same world looks the same every time it is opened, on every device, for every player — so a DM can say
// "the big southern continent" and be understood, and a screenshot in the campaign notes still matches the
// map a month later. Nothing here reads `Math.random()` or the clock.
//
// PURE DATA, NO JSX. This returns a spec; the renderer draws it. That split is what lets the interesting
// half — determinism, tier vocabulary, the palette, feature counts scaling with tier — be asserted in a
// test rather than eyeballed in a browser, and it means a future SVG or canvas renderer reuses all of it.

/** The seven tiers, as `dnd_map_nodes.tier` stores them. */
export type MapTier = 'space' | 'world' | 'continent' | 'province' | 'city' | 'district' | 'site';

export const MAP_TIERS: readonly MapTier[] = [
  'space', 'world', 'continent', 'province', 'city', 'district', 'site',
] as const;

/** What a generated map is made of. Every shape is in a 0–100 space so the renderer can scale freely. */
export interface WorldFeature {
  kind: 'star' | 'nebula' | 'disc' | 'landmass' | 'region' | 'road' | 'block' | 'room';
  x: number;
  y: number;
  /** Radius for round things, width for rectangular ones. */
  r: number;
  /** Rectangular height; absent for round things. */
  h?: number;
  rotation?: number;
  /** 0–1, the renderer's alpha. */
  alpha: number;
  /** Index into `palette`, so a re-skin changes one array. */
  tone: number;
}

export interface WorldVisual {
  tier: MapTier;
  /** rgb triples, darkest first. The renderer picks background from [0] and features by `tone`. */
  palette: string[];
  features: WorldFeature[];
  /** A short description of what this depicts — used as the image's accessible label, so a generated map
   *  is not an unlabelled decorative blob to a screen reader. */
  label: string;
}

// ── seeded randomness ───────────────────────────────────────────────────────────────────────────────
//
// FNV-1a then a xorshift, the same shape `sigilFor` uses in the bestiary. Unsigned throughout: `>>` coerces
// to int32, and a hash at or above 2^31 shifts negative — which produced out-of-range values in the
// bestiary's sigil for roughly half of all inputs before it was caught. Not repeating that here.

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A deterministic 0–1 generator. Same seed, same sequence, forever. */
function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

// ── per-tier vocabulary ─────────────────────────────────────────────────────────────────────────────
//
// Each tier gets its own palette and its own kind of geometry, because the whole job is that a reader can
// tell at a glance WHAT SCALE they are looking at. A city that looks like a continent has failed even if it
// is pretty.

interface TierSpec {
  palette: string[];
  /** How many features, before the id's own variation. */
  count: number;
  build: (r: () => number, i: number, count: number) => WorldFeature;
  label: string;
}

const star = (r: () => number): WorldFeature => ({
  kind: 'star',
  x: r() * 100,
  y: r() * 100,
  // Mostly pinpricks with a few brighter ones — a uniform field reads as noise, not as a sky.
  r: r() < 0.88 ? 0.25 + r() * 0.4 : 0.7 + r() * 0.8,
  alpha: 0.35 + r() * 0.65,
  tone: r() < 0.8 ? 1 : 2,
});

const TIERS: Record<MapTier, TierSpec> = {
  space: {
    palette: ['3,7,18', '226,232,240', '148,197,253', '129,90,200'],
    count: 130,
    label: 'a starfield',
    build: (r, i, count) => {
      // A few nebulae behind the stars. Built first (lowest index) so the renderer's paint order puts
      // them behind without needing a z-sort.
      if (i < 3) {
        return { kind: 'nebula', x: 15 + r() * 70, y: 15 + r() * 70, r: 18 + r() * 26, alpha: 0.1 + r() * 0.14, tone: 3 };
      }
      // ONE call. An earlier version read `star(r) && {...star(r)}`, which built a star, threw it away,
      // and built another — burning five RNG draws per star instead of five, silently shifting the whole
      // sequence. Deterministic either way, which is exactly why it would never have shown up as a bug.
      const s = star(r);
      return { ...s, tone: i > count - 8 ? 2 : 1 };
    },
  },
  world: {
    palette: ['8,32,54', '38,92,64', '86,132,74', '198,186,140'],
    count: 7,
    label: 'a world seen from orbit',
    build: (r, i) =>
      i === 0
        // The ocean disc first — everything else sits on it.
        ? { kind: 'disc', x: 50, y: 50, r: 44, alpha: 1, tone: 0 }
        : {
            kind: 'landmass',
            // Kept inside the disc: a continent hanging off the edge of the planet reads as a bug.
            x: 50 + (r() - 0.5) * 56,
            y: 50 + (r() - 0.5) * 56,
            r: 7 + r() * 15,
            rotation: r() * 360,
            alpha: 0.9,
            tone: r() < 0.7 ? 1 : 2,
          },
  },
  continent: {
    palette: ['22,38,30', '58,102,66', '120,140,80', '176,152,104'],
    count: 9,
    label: 'a continent divided into regions',
    build: (r) => ({
      kind: 'region',
      x: r() * 100,
      y: r() * 100,
      r: 14 + r() * 22,
      rotation: r() * 360,
      alpha: 0.5 + r() * 0.3,
      tone: 1 + Math.floor(r() * 3),
    }),
  },
  province: {
    palette: ['28,36,28', '72,104,66', '138,150,92', '190,170,120'],
    count: 14,
    label: 'a province of settlements and country',
    build: (r) => ({
      kind: 'region',
      x: r() * 100,
      y: r() * 100,
      r: 8 + r() * 14,
      rotation: r() * 360,
      alpha: 0.45 + r() * 0.35,
      tone: 1 + Math.floor(r() * 3),
    }),
  },
  city: {
    palette: ['18,20,26', '58,62,74', '120,116,104', '198,178,132'],
    count: 22,
    label: 'a city street plan',
    build: (r, i) =>
      // Alternating long roads and the blocks between them — the lattice is what says "city" at a glance.
      i % 3 === 0
        ? {
            kind: 'road',
            x: r() * 100,
            y: r() * 100,
            r: 30 + r() * 60,
            h: 0.8 + r() * 1.2,
            rotation: r() < 0.5 ? 0 + r() * 12 : 90 + r() * 12,
            alpha: 0.7,
            tone: 2,
          }
        : {
            kind: 'block',
            x: r() * 100,
            y: r() * 100,
            r: 4 + r() * 9,
            h: 4 + r() * 9,
            rotation: r() < 0.5 ? 0 : 90,
            alpha: 0.4 + r() * 0.4,
            tone: 1,
          },
  },
  district: {
    palette: ['20,18,22', '64,58,62', '132,120,104', '206,186,140'],
    count: 18,
    label: 'a district of buildings and alleys',
    build: (r) => ({
      kind: 'block',
      x: r() * 100,
      y: r() * 100,
      r: 6 + r() * 12,
      h: 6 + r() * 12,
      rotation: r() < 0.7 ? 0 : 90,
      alpha: 0.5 + r() * 0.4,
      tone: 1 + Math.floor(r() * 2),
    }),
  },
  site: {
    palette: ['24,20,18', '78,66,54', '150,128,96', '222,204,164'],
    count: 8,
    label: 'a floor plan',
    build: (r) => ({
      kind: 'room',
      x: 8 + r() * 74,
      y: 8 + r() * 74,
      r: 12 + r() * 24,
      h: 10 + r() * 22,
      rotation: 0,
      alpha: 0.55 + r() * 0.35,
      tone: 1 + Math.floor(r() * 3),
    }),
  },
};

/** A tier we do not recognise falls back to `site` — the smallest, least presumptuous scale. Better a
 *  plain floor plan than a starfield for something that turned out to be a tavern. */
export function tierOf(raw: string | null | undefined): MapTier {
  const t = (raw ?? '').trim().toLowerCase();
  return (MAP_TIERS as readonly string[]).includes(t) ? (t as MapTier) : 'site';
}

/**
 * The generated map for one node.
 *
 * Deterministic in BOTH inputs: the same (id, tier) always produces the same picture, and two nodes at the
 * same tier look different because their ids differ. That is the whole contract — a DM's world has to be
 * recognisable, and two adjacent provinces have to be distinguishable.
 */
export function worldVisual(nodeId: string, tier: string | null | undefined): WorldVisual {
  const t = tierOf(tier);
  const spec = TIERS[t];
  // The tier is folded into the seed so re-tiering a node genuinely redraws it — a city promoted to a
  // province should not keep the city's street plan under a province palette.
  const r = rng(hash32(`${nodeId}:${t}`));
  const features: WorldFeature[] = [];
  for (let i = 0; i < spec.count; i++) features.push(spec.build(r, i, spec.count));
  return { tier: t, palette: spec.palette, features, label: spec.label };
}
