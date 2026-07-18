// lib/dnd/systems/intuitive-games/companions.ts — the FULL Intuitive Games companion-creature system, scraped
// verbatim from intuitivegames.net/companion-creatures (2026-07-18). This is what the earlier IG_COMPANION_*
// stubs (content.ts) said the site "did not publish" — it turns out the whole build system IS published: the
// four types, the features + aspects a companion can take, and the statistics rules (ability scores, natural
// weapons, size table, movement, HP, skills). This module holds that as data + a pure derivation so the app
// can BUILD a companion character sheet in full (HP, size mods, attacks) and surface it from the owner's sheet.
//
// Everything here is transcribed from the page (Ground Rule 2 — never invented).

export interface IGNamedRule { name: string; effect: string }

// ── The four companion TYPES (one per Archon subclass). Determine skill proficiency + ability adjustments. ──
export interface IGCompanionTypeDef { name: string; subclass: string; effect: string; sizeLimit?: string }
export const IG_COMPANION_TYPE_DEFS: IGCompanionTypeDef[] = [
  { name: 'Beast Companion', subclass: 'Beastmaster', effect: 'Gain an ability score increase to any one physical score. Take a −2 penalty to Intelligence. Gain a skill proficiency from: Acrobatics, Climb, Fly, Perception, Stealth, Swim. Many beasts should take an additional Intelligence penalty; if so, the beast gains a bonus to Constitution.' },
  { name: 'Elemental', subclass: 'Summoner', effect: 'Choose one of the 5 energy types; your companion gains resistance to that energy equal to twice your level. Skill proficiency: Arcane.' },
  { name: 'Familiar', subclass: 'Eldritch Binder', effect: 'Gain proficiency in any one skill. When rolling to assist the summoner with a proficient skill, the companion rolls with advantage.', sizeLimit: 'Small or Tiny' },
  { name: 'Swarm', subclass: 'Packmaster', effect: 'All companions take −4 Intelligence (minimum 1) and gain the Swarming stance (not the advanced stance, even at Packmaster level 5). Gain a skill proficiency from: Acrobatics, Climb, Fly, Perception, Stealth, Swim. Some swarm creatures should take an additional Intelligence penalty; if so, the creature gains a bonus to Constitution.', sizeLimit: 'Tiny or Small' },
];

// ── Standard FEATURES a companion can be built with (every companion starts with one, and may gain more). ──
export const IG_COMPANION_FEATURES: IGNamedRule[] = [
  { name: 'Ability Score Boost', effect: 'The creature increases any 2 ability scores.' },
  { name: 'Armor Proficiency', effect: 'The creature is proficient with armor. Non-humanoid armor is priced by size: Tiny half price, Small normal, Medium double, Large triple.' },
  { name: 'Enhanced Attacks', effect: 'The creature gains a +2 bonus on attacks with natural weapons.' },
  { name: 'Enhanced Sense', effect: 'The creature gains an extraordinary sense (chosen when acquired): Scent 100 ft, Darkvision 50 ft, Blindsight 30 ft, or Tremorsense 50 ft.' },
  { name: 'Favored Strike', effect: 'Requires exactly one natural weapon. That weapon deals an additional 1d6 damage.' },
  { name: 'Furious Strikes', effect: 'Requires more than one natural weapon. As an action, attack with two weapons at once; each deals 2 fewer damage. Counts as one attack for the MSP, but not for parry or redirect.' },
  { name: 'Natural Armor', effect: 'The creature gains DR 4. Can be taken multiple times; each additional time grants +2 DR.' },
  { name: 'New Movement Type', effect: 'Gain a movement type: Flight 20 ft, Climb 20 ft, Swim 20 ft, Fast (+10 ft base), Burrow 20 ft, Steady (ignore difficult terrain), or Nimble (auto-succeed saves vs one combat skill, e.g. immune to Trip). Check with your DM that the movement suits the creature.' },
  { name: 'New Skill Proficiency', effect: 'The creature gains proficiency in any one skill.' },
  { name: 'Poison/Venom', effect: 'Natural attacks gain a poison/venom effect dealing ability damage (Strength, Dexterity, or Intelligence — chosen once). On a hit both make Fortitude saves: crit success 1d6 ability damage + lose an action; success 1d6 ability damage; partial success 1 ability damage; failure no effect; crit failure no effect and immune to that poison from this source for 1 minute.' },
  { name: 'Reach', effect: "The creature's natural attacks threaten all hexes within 10 feet (it can still attack adjacent creatures). If it already has reach, increase it by 5 feet. Can only be selected once." },
];

// ── ASPECTS — supernatural/magical powers, granted ONLY when the Archon selects the Aspect class power. ──
export const IG_COMPANION_ASPECTS: IGNamedRule[] = [
  { name: 'Elemental Breath', effect: "A magical elemental breath (one chosen element) dealing 1d6 per 2 Archon levels. As a two-action activity, a 10-ft cone; targets make reflex saves. A proficient spray attack (can't be countered or redirected; one roll vs all targets). The Archon may spend an extra class power to expand the range to 20 ft." },
  { name: 'Energy Attacks', effect: "The creature deals elemental damage equal to its summoner's level with each attack. Only available to elementals or familiars." },
  { name: 'Linguist', effect: 'The creature can speak a common and an uncommon language (magical; needs Intelligence 8+, no physical speech required).' },
  { name: 'Massive', effect: 'The creature becomes Huge, gaining two ASBs to Strength and two ASPs to Dexterity; its reach increases by 5 feet. A familiar or swarm creature cannot take this Aspect.' },
  { name: 'Sorcerous', effect: 'The creature gains a single spell from the Wizard list, cast using its Charisma and Arcane skill (Archon level = caster level). Must be trained in Arcane.' },
  { name: 'Telepathy', effect: 'The creature communicates telepathically within 100 feet (in languages it knows, plus remembered images). Requires Intelligence 3+.' },
  { name: 'Verdant', effect: 'The companion becomes a plant creature: immune to nonlethal damage, DR equal to its Constitution modifier, but takes double fire damage.' },
];

// ── The size table — each size's reach + ability/stealth/damage-die modifiers. ──
export interface IGCompanionSize { name: string; reachFt: number; strMod: number; dexMod: number; stealthMod: number; damageStep: number; note: string }
export const IG_COMPANION_SIZES: IGCompanionSize[] = [
  { name: 'Tiny', reachFt: 0, strMod: -2, dexMod: 2, stealthMod: 4, damageStep: -2, note: 'Reach 0 ft; damage dice decreased twice.' },
  { name: 'Small', reachFt: 5, strMod: -1, dexMod: 1, stealthMod: 2, damageStep: -1, note: 'Damage dice decreased once.' },
  { name: 'Medium', reachFt: 5, strMod: 0, dexMod: 0, stealthMod: 0, damageStep: 0, note: 'No changes.' },
  { name: 'Large', reachFt: 10, strMod: 1, dexMod: -1, stealthMod: -2, damageStep: 1, note: 'Reach 10 ft; damage dice increased once.' },
];

// ── The build rules, verbatim, for the library + AI grounding. ──
export const IG_COMPANION_BUILD_RULES = [
  'Ability Scores: all scores except one start at 10; the last starts at 6 (normally Intelligence, though familiars often make Strength the low score). The companion then gains 6 total ability increases to any scores, applied AFTER the type-based ability changes.',
  'Natural Weapons: the creature is proficient with all its natural weapons. One weapon deals 1d10; multiple weapons each deal 1d6. A creature can have as many natural weapons as suits it, but must spend an action to attack.',
  'Hit Points: starting HP equals the creature’s Constitution score. After level 1, it gains 2 + its Constitution modifier HP per level.',
  'Skills: besides the skill granted by its type, a companion gains proficiency in one additional skill. It gains 2 + its Intelligence modifier skill ranks per level; a creature with Intelligence 6 or lower gains no skill ranks.',
  'Language: a companion with Intelligence 6+ understands one language (usually the Archon’s); Intelligence 10+ can be taught to read. Simple commands need no language.',
  'Mythical creatures: for a specific mythical creature (dragon, griffon…) it is recommended to add its iconic abilities at creation via the Aspect power (e.g. a Large dragon with a breath weapon at level 1).',
] as const;

// ── The site's worked example — a level-1 Tiger — kept as a reference statblock + a build test fixture. ──
export interface IGCompanionStatblock {
  name: string;
  type: string;
  level: number;
  size: IGCompanionSize['name'];
  speed: number;
  abilities: { STR: number; DEX: number; CON: number; INT: number; WIS: number; CHA: number };
  naturalWeapons: string;
  attackBonus: number;
  damage: string;
  hp: number;
  skills: string;
  features: string[];
}
export const IG_COMPANION_EXAMPLE_TIGER: IGCompanionStatblock = {
  name: 'Tiger', type: 'Beast Companion', level: 1, size: 'Large', speed: 40,
  abilities: { STR: 18, DEX: 18, CON: 16, INT: 2, WIS: 10, CHA: 10 },
  naturalWeapons: '1 bite / 4 claws', attackBonus: 5, damage: '1d8+4', hp: 16,
  skills: 'Grapple +5 (+1 level, +4 STR) · Stealth +3 (+1 level, +4 DEX, −2 size)',
  features: ['ASB: Str/Dex'],
};

const abilityMod = (score: number) => Math.floor((score - 10) / 2);

/**
 * Derive a companion's HP from the rules: HP at level 1 = Constitution score; each level after adds
 * 2 + the Constitution modifier (never less than 1 per level, matching the sheet's floor).
 */
export function igCompanionHp(conScore: number, level: number): number {
  const lvl = Math.max(1, level);
  const perLevel = Math.max(1, 2 + abilityMod(conScore));
  return conScore + perLevel * (lvl - 1);
}

/** The size table entry for a size name (case-insensitive), or Medium as the neutral default. */
export function igCompanionSize(name: string): IGCompanionSize {
  return IG_COMPANION_SIZES.find((s) => s.name.toLowerCase() === name.trim().toLowerCase()) ?? IG_COMPANION_SIZES[2];
}

/** Look up a companion feature or aspect's effect text by name (case-insensitive). */
export function igCompanionAbility(name: string): string | undefined {
  const key = name.trim().toLowerCase();
  return [...IG_COMPANION_FEATURES, ...IG_COMPANION_ASPECTS].find((f) => f.name.toLowerCase() === key)?.effect;
}
