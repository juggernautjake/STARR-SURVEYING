// lib/dnd/bestiary/aura.ts — the atmosphere around a creature's portrait.
//
// OWNER: *"Put cool effects around their pictures, and change the effects up depending on the kind of creature.
// Little bunnies should have a nice pleasant green or something flowing around their picture, and give a woodland
// vibe, while a zombie might have a green stench kind of effect and animation around their images. You would have
// to create the effects/animations around each image on a case by case basis depending on the kind of creature."*
//
// DERIVED PER KIND, NOT AUTHORED PER CREATURE — and the owner's own examples are why that is the right reading of
// the request. "Little bunnies" and "a zombie" are not two creatures, they are two KINDS: everything small and
// harmless and woodland wants the same drifting green, and everything shambling and dead wants the same rising
// stench. A per-creature table would need nine hundred entries, would be written for the first forty, and would
// leave the rest plain — so the bestiary would look cared-for exactly where someone had recently been working.
//
// So the aura comes from `type` + tags + challenge, and any creature can override it by name. Every creature is
// dressed on the day it is imported; the famous ones get hand-tuning. That is also what makes it correctable in
// bulk: disagree with how undead look and there is one place to change it, not four hundred.
//
// AND IT IS THE LOAD-BEARING VISUAL, not a garnish. Published monster art is copyrighted and not licensable, so
// most portraits will be public-domain illustration or a generated sigil. The aura is what makes a woodcut of a
// wolf and a generated emblem for an owlbear both look deliberate — it carries the feeling the picture cannot.
import { parseCr } from './eligibility';
import { CREATURE_TAGS } from './taxonomy';

/** What an aura looks like. Colours are literal here because a creature's atmosphere is its own, not the sheet's —
 *  a zombie is sickly green on every skin, which is the whole point of the effect. */
export interface AuraSpec {
  id: string;
  /** Core colour, as an `r, g, b` triple so the renderer can vary alpha. */
  rgb: string;
  /** Secondary, for the outer wash. */
  rgb2: string;
  /** The motion, which the stylesheet maps to a keyframe set. */
  motion: 'drift' | 'plume' | 'ember' | 'radiance' | 'glimmer' | 'wash' | 'gears' | 'bubble' | 'creep' | 'quake' | 'pulse' | 'still';
  /** How much particulate matter floats around it, 0…1. */
  density: number;
  /** One-line description of the feel, so a reader (and a future editor) can tell whether it landed. */
  feel: string;
}

/** By creature type — the coarse grain, and the one every source book agrees on. */
const BY_TYPE: Record<string, AuraSpec> = {
  beast: { id: 'beast', rgb: '104, 168, 92', rgb2: '58, 104, 60', motion: 'drift', density: 0.5, feel: 'dappled woodland light, drifting motes' },
  undead: { id: 'undead', rgb: '126, 168, 74', rgb2: '48, 66, 42', motion: 'plume', density: 0.8, feel: 'sickly green stench rising off it' },
  fiend: { id: 'fiend', rgb: '198, 72, 44', rgb2: '70, 22, 20', motion: 'ember', density: 0.75, feel: 'heat shimmer and rising sparks' },
  celestial: { id: 'celestial', rgb: '246, 222, 150', rgb2: '212, 168, 88', motion: 'radiance', density: 0.35, feel: 'warm radiance, a slow halo' },
  fey: { id: 'fey', rgb: '168, 120, 224', rgb2: '86, 196, 190', motion: 'glimmer', density: 0.7, feel: 'iridescent firefly glimmer' },
  dragon: { id: 'dragon', rgb: '214, 158, 68', rgb2: '128, 58, 36', motion: 'wash', density: 0.5, feel: 'elemental wash and a wingbeat pulse' },
  construct: { id: 'construct', rgb: '158, 170, 184', rgb2: '84, 94, 108', motion: 'gears', density: 0.3, feel: 'cold steel, turning glints' },
  ooze: { id: 'ooze', rgb: '176, 208, 78', rgb2: '96, 122, 46', motion: 'bubble', density: 0.65, feel: 'translucent, slowly bubbling' },
  elemental: { id: 'elemental', rgb: '96, 178, 220', rgb2: '44, 96, 140', motion: 'wash', density: 0.6, feel: 'roiling elemental flow' },
  aberration: { id: 'aberration', rgb: '206, 74, 168', rgb2: '58, 34, 96', motion: 'pulse', density: 0.7, feel: 'wrong colours drifting the wrong way' },
  plant: { id: 'plant', rgb: '116, 158, 74', rgb2: '62, 96, 48', motion: 'creep', density: 0.55, feel: 'creeping growth and spore drift' },
  giant: { id: 'giant', rgb: '186, 150, 96', rgb2: '96, 74, 46', motion: 'quake', density: 0.4, feel: 'earthen weight, ground shake' },
  monstrosity: { id: 'monstrosity', rgb: '150, 88, 168', rgb2: '68, 40, 84', motion: 'pulse', density: 0.55, feel: 'a bruised, uneasy pulse' },
  humanoid: { id: 'humanoid', rgb: '138, 152, 176', rgb2: '58, 70, 90', motion: 'still', density: 0.18, feel: 'nothing supernatural — a subtle vignette' },
  swarm: { id: 'swarm', rgb: '140, 128, 90', rgb2: '70, 62, 44', motion: 'glimmer', density: 0.9, feel: 'a restless, crawling mass' },
};

/** Tags beat type where the tag is more specific about the FEEL — a demon is a fiend, but abyssal is the mood. */
const BY_TAG: Record<string, Partial<AuraSpec>> = {
  abyssal: { rgb: '150, 44, 96', rgb2: '48, 14, 40', motion: 'ember', density: 0.85, feel: 'abyssal murk, embers falling upward' },
  demonic: { rgb: '198, 60, 52', rgb2: '58, 16, 18', motion: 'ember', density: 0.8, feel: 'infernal heat and cinders' },
  sea: { rgb: '68, 154, 186', rgb2: '24, 68, 104', motion: 'wash', density: 0.6, feel: 'cold currents and drifting silt' },
  bird: { rgb: '164, 190, 206', rgb2: '86, 112, 136', motion: 'drift', density: 0.4, feel: 'high thin air, a few loose feathers' },
  woodland: { rgb: '104, 172, 88', rgb2: '52, 100, 56', motion: 'drift', density: 0.55, feel: 'pleasant green, leaf-fall, woodland calm' },
  companion: { rgb: '186, 174, 128', rgb2: '104, 94, 70', motion: 'drift', density: 0.3, feel: 'warm and domestic' },
};

/** The unmistakable ones, by name. This is the per-creature escape hatch the derivation exists to make optional. */
const BY_NAME: Array<{ match: RegExp; spec: Partial<AuraSpec> }> = [
  { match: /\brabbit|hare|bunny\b/i, spec: { rgb: '132, 196, 108', rgb2: '64, 122, 68', motion: 'drift', density: 0.45, feel: 'gentle green drift — the owner\'s own example' } },
  { match: /\bzombie|ghoul|rotting\b/i, spec: { rgb: '126, 168, 74', rgb2: '44, 60, 38', motion: 'plume', density: 0.9, feel: 'thick green stench rolling off it — the owner\'s own example' } },
  { match: /\blich|wraith|banshee|spectre|specter|ghost\b/i, spec: { rgb: '96, 200, 190', rgb2: '28, 56, 72', motion: 'plume', density: 0.7, feel: 'cold spectral light, a rising chill' } },
  { match: /\bvampire\b/i, spec: { rgb: '176, 40, 60', rgb2: '48, 14, 26', motion: 'plume', density: 0.6, feel: 'blood-dark mist' } },
  { match: /\bred dragon|fire\b/i, spec: { rgb: '212, 88, 42', rgb2: '92, 28, 18', motion: 'ember', density: 0.8, feel: 'furnace heat' } },
  { match: /\bwhite dragon|frost|ice\b/i, spec: { rgb: '150, 208, 232', rgb2: '52, 104, 140', motion: 'wash', density: 0.6, feel: 'frost haze' } },
  { match: /\bgreen dragon|poison\b/i, spec: { rgb: '110, 168, 92', rgb2: '40, 76, 48', motion: 'plume', density: 0.7, feel: 'acrid green fumes' } },
  { match: /\bblue dragon|lightning|storm\b/i, spec: { rgb: '104, 152, 226', rgb2: '36, 56, 120', motion: 'pulse', density: 0.7, feel: 'static crackle' } },
  { match: /\bblack dragon|acid\b/i, spec: { rgb: '128, 176, 96', rgb2: '32, 44, 32', motion: 'bubble', density: 0.7, feel: 'caustic drip' } },
  { match: /\btreant|dryad\b/i, spec: { rgb: '112, 154, 76', rgb2: '58, 88, 46', motion: 'creep', density: 0.6, feel: 'old bark and slow growth' } },
];

const FALLBACK: AuraSpec = {
  id: 'unknown', rgb: '132, 146, 168', rgb2: '56, 66, 84', motion: 'still', density: 0.22,
  feel: 'a neutral vignette — nothing claimed about a creature we know nothing about',
};

export interface AuraInput {
  name: string;
  type?: string | null;
  tags?: string[];
  cr?: string | null;
}

/**
 * The aura for one creature.
 *
 * Precedence: NAME beats TAG beats TYPE. Most specific wins, which is the only ordering that lets a hand-tuned
 * signature monster survive a change to how its whole type looks.
 *
 * Challenge scales the INTENSITY rather than choosing the effect — a CR ¼ zombie and a CR 21 lich want the same
 * stench, at very different volumes. Deriving the effect from CR instead would make every boss look alike and
 * every minion look like nothing.
 */
export function auraFor(c: AuraInput): AuraSpec & { intensity: number; boss: boolean } {
  const type = (c.type ?? '').toLowerCase().split(/[\s(,]/)[0];
  let spec: AuraSpec = BY_TYPE[type] ?? FALLBACK;

  // THE FIRST TAG IN TAXONOMY ORDER WINS, and both halves of that matter.
  //
  // Taxonomy order, because the row's array order is incidental — it is whatever the importer happened to derive
  // first — and an aura that depends on it would differ between two creatures with the same tags. Caught in the
  // browser: a wolf is tagged `woodland` AND `companion`, and iterating the row applied companion last, so it came
  // out warm domestic ochre instead of woodland green. The comment here already claimed taxonomy order; the code
  // did not do it.
  //
  // FIRST rather than last, because `CREATURE_TAGS` is ordered from most to least characterful (bosses, massive,
  // woodland …). For a wolf that yields woodland, which is what a wolf should look like.
  const present = new Set(c.tags ?? []);
  const winner = CREATURE_TAGS.find((t) => present.has(t) && BY_TAG[t]);
  if (winner) spec = { ...spec, ...BY_TAG[winner], id: `${spec.id}-${winner}` };
  for (const { match, spec: over } of BY_NAME) {
    if (match.test(c.name)) {
      spec = { ...spec, ...over, id: `${spec.id}-named` };
      break;
    }
  }

  const cr = parseCr(c.cr);
  // A gentle curve: CR 0 sits at 0.45, CR 5 near 0.7, CR 20+ at 1. Linear would make everything under CR 5 look
  // switched off, and most of any bestiary is under CR 5.
  const intensity = cr === null ? 0.6 : Math.min(1, 0.45 + Math.sqrt(Math.max(0, cr)) / 6.5);
  const boss = (c.tags ?? []).includes('boss');

  return { ...spec, intensity: Math.round(intensity * 100) / 100, boss };
}

/**
 * A deterministic emblem for a creature with no usable picture.
 *
 * Published monster art cannot be licensed, so a real portrait will often be missing — and a bestiary of broken
 * image icons is worse than one that never promised pictures. This returns a stable pair of numbers derived from
 * the slug, which the renderer turns into a sigil: same creature, same emblem, forever, with no data to store.
 */
export function sigilFor(slug: string): { rotation: number; points: number; ring: number } {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // UNSIGNED throughout. `>>` coerces to int32, so a hash at or above 2^31 shifts to a NEGATIVE number and
  // `% 24` then returns a negative remainder — which drove `ring` to 0.41, outside the band the renderer
  // draws, for roughly half of all slugs. `>>>` is the unsigned shift and keeps the whole range positive.
  const n = h >>> 0;
  return {
    rotation: n % 360,
    // 3…9 points reads as a device rather than as a circle or a triangle.
    points: 3 + (n % 7),
    // 0.52…0.75 — the ring sits inside the frame with room for the silhouette.
    ring: 0.52 + ((n >>> 8) % 24) / 100,
  };
}
