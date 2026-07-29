// lib/dnd/bestiary/taxonomy.ts — the brief's own categories, derived (P13-6).
//
// The owner asked for the bestiary to be browsable by the categories they think in: *"bosses, woodland
// creatures, massive creatures, demons, abbysal creatures, sea creatures, birds, common companion
// animals, etc."* None of those is a field in any source book — they are readings of `type`, `size`, `cr`
// and the creature's name, which is why they are derived here rather than hand-tagged onto 1,500 rows.
//
// DERIVED, AND THEREFORE ARGUABLE. Every rule below is a claim you can point at and disagree with, and
// re-running the import re-derives every tag. That is the whole design: a hand-tagged bestiary is one
// nobody can correct in bulk, and the second someone disagrees with "is an owlbear woodland" there is no
// single place to change it.
//
// A creature gets AS MANY tags as apply. A giant octopus is `sea` and `massive`; a vampire lord is
// `undead` and `boss`. Forcing one category per creature would make the filters lie — which is what a
// single `category` column would have done.
import { parseCr, type EligibilityInput } from './eligibility';

/** The browsable categories, in the order the library should offer them. */
export const CREATURE_TAGS = [
  'boss', 'massive', 'woodland', 'sea', 'bird', 'companion',
  'undead', 'demonic', 'abyssal', 'construct', 'folklore', 'dragon',
] as const;
export type CreatureTag = (typeof CREATURE_TAGS)[number];

export const TAG_LABELS: Record<CreatureTag, string> = {
  boss: 'Bosses', massive: 'Massive', woodland: 'Woodland', sea: 'Sea',
  bird: 'Birds', companion: 'Companions', undead: 'Undead', demonic: 'Demons',
  abyssal: 'Abyssal', construct: 'Constructs', folklore: 'Folklore', dragon: 'Dragons',
};

/** Word lists, matched whole-word against the creature's name. Short and literal on purpose — a long list
 *  becomes "everything is everything", and a tag that matches most of the bestiary is not a filter. */
const NAME_RULES: Partial<Record<CreatureTag, string[]>> = {
  woodland: ['wolf', 'bear', 'boar', 'deer', 'stag', 'elk', 'owlbear', 'badger', 'rabbit', 'fox', 'druid', 'dryad', 'treant', 'satyr'],
  sea: ['shark', 'octopus', 'squid', 'kraken', 'crab', 'fish', 'eel', 'whale', 'merfolk', 'sahuagin', 'hydra', 'serpent'],
  bird: ['eagle', 'hawk', 'raven', 'owl', 'vulture', 'roc', 'crow', 'falcon', 'peryton', 'cockatrice', 'harpy'],
  companion: ['dog', 'mastiff', 'cat', 'pony', 'horse', 'mule', 'camel', 'goat', 'mouse', 'rat', 'hawk', 'owl', 'frog', 'lizard', 'weasel'],
  folklore: ['banshee', 'wight', 'wraith', 'ghost', 'gargoyle', 'goblin', 'troll', 'ogre', 'giant', 'witch', 'hag', 'nymph', 'sphinx', 'minotaur'],
  abyssal: ['abyssal', 'demon', 'balor', 'marilith', 'vrock', 'hezrou', 'glabrezu', 'nalfeshnee', 'quasit'],
};

/** Types that map straight to a tag. */
const TYPE_TAGS: Record<string, CreatureTag> = {
  undead: 'undead', dragon: 'dragon', construct: 'construct', fiend: 'demonic', ooze: 'construct',
};

/** Sizes the brief would call "massive". */
const MASSIVE_SIZES = new Set(['huge', 'gargantuan']);

const hasWord = (name: string, words: string[]) =>
  words.some((w) => new RegExp(`\\b${w}s?\\b`, 'i').test(name));

/**
 * Every tag that applies. Deterministic and order-stable, so a re-import produces the same array and a
 * diff of the bestiary shows only what actually changed.
 */
export function creatureTags(c: EligibilityInput): CreatureTag[] {
  const name = (c.name ?? '').toLowerCase();
  const type = (c.type ?? '').trim().toLowerCase();
  const size = (c.size ?? '').trim().toLowerCase();
  const cr = parseCr(c.cr);
  const out = new Set<CreatureTag>();

  if (TYPE_TAGS[type]) out.add(TYPE_TAGS[type]);
  if (MASSIVE_SIZES.has(size)) out.add('massive');
  // A boss is a rating, not a name: CR 10 is the same threshold P13-9 uses for `boss-tier`, so the tag a
  // player filters on and the rule that grants variants cannot drift apart.
  if (cr !== null && cr >= 10) out.add('boss');

  for (const [tag, words] of Object.entries(NAME_RULES)) {
    if (words && hasWord(name, words)) out.add(tag as CreatureTag);
  }

  // A demon is abyssal by definition; the reverse is not true (an abyssal beast is not a demon), so this
  // implication runs one way only.
  if (out.has('demonic')) out.add('abyssal');

  // Preserve the declared order rather than insertion order, so the array is stable across runs.
  return CREATURE_TAGS.filter((t) => out.has(t));
}
