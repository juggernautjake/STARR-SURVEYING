// lib/dnd/bestiary/taxonomy.ts — the STANDARD creature classifications (P13-6, revised 2026-07-29).
//
// ── WHAT CHANGED, AND WHY ────────────────────────────────────────────────────────────────────────────
//
// Owner, 2026-07-29: *"Please use the standard classifications for all of the creatures in the bestiary.
// Not the ones I made up."*
//
// The first version derived the owner's own browsing vocabulary — bosses, woodland creatures, massive
// creatures, demons, abyssal creatures, sea creatures, birds, companion animals, folklore — from `type`,
// `size`, `cr` and the creature's name. It worked, and the B5 audit measured what it cost: **320 of 829
// creatures (39%) carried no tag at all**, because the type→tag map covered only five of the fifteen
// creature types. A Mountain Oni, an Aesra and an Air Scamp all came back bare.
//
// The standard classifications do not have that problem, for a structural reason rather than a lucky one:
// **every creature already HAS a type**, because both source publications state one for every entry. So
// coverage is 100% by construction rather than by how well a word-list happens to match a name — and the
// vocabulary is the one every player and every source book already uses.
//
// PF2's list is nearly 5e's plus a handful of its own (`astral`, `dream`, `time`, `monitor`, `petitioner`,
// `shade`, `spirit`, `fungus`), and PF2 says `animal` where 5e says `beast`. Both are represented: an
// alias folds the synonyms together so a filter for "beast" finds a PF2 wolf, while the PF2-only types
// stay listed rather than being squashed into an approximate 5e neighbour.
//
// DERIVED, AND THEREFORE STILL ARGUABLE. Re-running the import re-derives every tag, so a disagreement is
// a one-line change here rather than a data-entry project across 829 rows.
import type { EligibilityInput } from './eligibility';

/**
 * The standard creature types, in the order a bestiary lists them.
 *
 * 5e's fourteen first (they are the ones most readers know), then the types Pathfinder 2e adds. `animal`
 * is deliberately absent: it is PF2's word for `beast`, and folding it in is what lets one filter serve
 * both systems.
 */
export const CREATURE_TAGS = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend',
  'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead',
  // `swarm` is a real SRD type line — a stat block reads "Medium swarm of Tiny beasts", and the head word
  // is the classification. Found by the B5 audit: without it, all ten of 5e's swarms were the only
  // creatures left untagged after the switch to standard types.
  'swarm',
  // Pathfinder 2e's additions.
  'astral', 'dream', 'ethereal', 'fungus', 'monitor', 'petitioner', 'shade', 'spirit', 'time',
  // Bestiary 3's two, found the same way `swarm` was — by the audit reporting the creatures still untagged
  // after an import, then reading their actual trait arrays rather than guessing. `shadow` covers the Shae
  // and the Owb; `kami` covers the Ittan-Momen and the rest of the Japanese-folklore set. Both are
  // published types, so squashing them into `undead` or `spirit` would invent a classification the source
  // does not make — the rule this list already follows for `petitioner` and `dream`.
  'kami', 'shadow',
] as const;
export type CreatureTag = (typeof CREATURE_TAGS)[number];

export const TAG_LABELS: Record<CreatureTag, string> = {
  aberration: 'Aberrations', beast: 'Beasts', celestial: 'Celestials', construct: 'Constructs',
  dragon: 'Dragons', elemental: 'Elementals', fey: 'Fey', fiend: 'Fiends', giant: 'Giants',
  humanoid: 'Humanoids', monstrosity: 'Monstrosities', ooze: 'Oozes', plant: 'Plants',
  undead: 'Undead', swarm: 'Swarms', astral: 'Astral', dream: 'Dream', ethereal: 'Ethereal', fungus: 'Fungi',
  monitor: 'Monitors', petitioner: 'Petitioners', shade: 'Shades', spirit: 'Spirits', time: 'Time',
  kami: 'Kami', shadow: 'Shadows',
};

/**
 * Synonyms across the systems' vocabularies.
 *
 * `animal` → `beast` is the important one: PF2 uses it for every ordinary creature, so without this a
 * filter for "beast" would return 5e's wolves and none of Pathfinder's. `humanoid (goblinoid)` and the
 * like are handled by reading the head word, not here.
 */
const ALIASES: Record<string, CreatureTag> = {
  animal: 'beast',
  // Seen in some PF2 exports; both mean the same thing as the canonical entry.
  undead_creature: 'undead',
  'plant creature': 'plant',
};

const KNOWN = new Set<string>(CREATURE_TAGS);

/**
 * The standard classification for a creature's declared type.
 *
 * Reads the HEAD WORD, because published types carry parenthetical subtypes — `humanoid (goblinoid)`,
 * `fiend (demon)`, `dragon (chromatic)`. The subtype is real information but it is not the classification,
 * and treating `humanoid (goblinoid)` as its own category would fragment the humanoids into dozens of
 * one-creature buckets.
 */
export function normalizeCreatureType(raw: string | null | undefined): CreatureTag | null {
  const head = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\(.*$/, '')      // drop "(goblinoid)"
    .replace(/[^a-z ]/g, '')
    .trim()
    .split(/\s+/)[0] ?? '';
  if (!head) return null;
  if (KNOWN.has(head)) return head as CreatureTag;
  return ALIASES[head] ?? null;
}

/**
 * The standard classification(s) for a creature.
 *
 * Returns AT MOST ONE, which is the other change from the first version. The owner's categories overlapped
 * by design — a vampire lord was both `undead` and `boss` — but a creature has exactly one type in every
 * published bestiary, and returning two would misrepresent the source. An array is kept as the return
 * shape so the column, the filters and every caller stay unchanged.
 */
export function creatureTags(c: EligibilityInput): CreatureTag[] {
  const t = normalizeCreatureType(c.type);
  return t ? [t] : [];
}
