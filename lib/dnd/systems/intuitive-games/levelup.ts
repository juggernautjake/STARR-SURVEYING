// lib/dnd/systems/intuitive-games/levelup.ts — the IG per-level progression (B12/B13).
//
// SOURCE: scraped verbatim from intuitivegames.net/character-building (2026-07-23). IG uses ONE universal
// level schedule for every class (levels 2–10) — what varies per SUBCLASS is only the option lists (which
// powers, specializations, and manifestation), and those are already catalogued in `IG_CLASS_DETAILS`. So
// this is real published data, not invention: `IG_LEVEL_SCHEDULE` is the fixed schedule the site's "Levels
// 2–10" accordion lists, and `igLevelBreakdown` joins it to a subclass's own options.
//
// Feats alternate (even levels → General, odd → Combat); two ability boosts land at 3/6/9; specialization at
// 4, greater specialization at 8, unique power at 6, capstone + manifestation at 10. Cumulative Solidas
// (starting wealth by level) is the site's table.
import { IG_CLASS_DETAILS } from './content';

export type IGGainKind =
  | 'trait'
  | 'ability-boosts'
  | 'feat-general'
  | 'feat-combat'
  | 'skill-proficiency'
  | 'subclass-power'
  | 'subclass-defensive-power'
  | 'specialization'
  | 'greater-specialization'
  | 'improved-stances'
  | 'unique-power'
  | 'capstone'
  | 'manifestation';

export interface IGLevelGain {
  kind: IGGainKind;
  label: string;
  /** True when the PLAYER picks (feat, trait, boost, subclass power, specialization, skill, capstone);
   *  false for an automatic grant (defensive power, improved stances, manifestation, DM-set unique power). */
  choose: boolean;
  /** How many to pick, when >1 (the two ability boosts). */
  count?: number;
  /** The legal options, when a short catalogued list exists (subclass powers/specializations, capstones).
   *  Absent where the pool is large (feats — the picker filters the full catalog) or DM/subclass-determined. */
  options?: string[];
}

export interface IGLevelRow {
  level: number;
  gains: IGLevelGain[];
  /** Cumulative starting Solidas (wealth) available by this level (site table). */
  solidasCumulative: number;
}

/** The scraped schedule. Each row's `gains` are in the order the site lists them; option lists are filled in
 *  per-subclass by `igLevelBreakdown` (kept out of the raw table because they depend on the chosen subclass). */
const SCHEDULE: { level: number; gains: { kind: IGGainKind; count?: number }[]; solidas: number }[] = [
  { level: 2, gains: [{ kind: 'trait' }, { kind: 'subclass-defensive-power' }, { kind: 'feat-general' }], solidas: 50 },
  { level: 3, gains: [{ kind: 'ability-boosts', count: 2 }, { kind: 'subclass-power' }, { kind: 'feat-combat' }], solidas: 75 },
  { level: 4, gains: [{ kind: 'skill-proficiency' }, { kind: 'specialization' }, { kind: 'feat-general' }], solidas: 115 },
  { level: 5, gains: [{ kind: 'improved-stances' }, { kind: 'subclass-power' }, { kind: 'feat-combat' }], solidas: 175 },
  { level: 6, gains: [{ kind: 'ability-boosts', count: 2 }, { kind: 'unique-power' }, { kind: 'feat-general' }], solidas: 265 },
  { level: 7, gains: [{ kind: 'trait' }, { kind: 'subclass-power' }, { kind: 'feat-combat' }], solidas: 400 },
  { level: 8, gains: [{ kind: 'skill-proficiency' }, { kind: 'greater-specialization' }, { kind: 'feat-general' }], solidas: 600 },
  { level: 9, gains: [{ kind: 'ability-boosts', count: 2 }, { kind: 'subclass-power' }, { kind: 'feat-combat' }], solidas: 900 },
  { level: 10, gains: [{ kind: 'capstone' }, { kind: 'manifestation' }, { kind: 'feat-general' }], solidas: 1350 },
];

const LABEL: Record<IGGainKind, string> = {
  trait: 'New Trait',
  'ability-boosts': 'Ability Score Boosts',
  'feat-general': 'General Feat',
  'feat-combat': 'Combat Feat',
  'skill-proficiency': 'New Skill Proficiency',
  'subclass-power': 'New Subclass Power',
  'subclass-defensive-power': 'Subclass Defensive Power',
  specialization: 'Specialization',
  'greater-specialization': 'Greater Specialization',
  'improved-stances': 'Improved version of all stances',
  'unique-power': 'Unique Power',
  capstone: 'Capstone',
  manifestation: 'Manifestation',
};

/** Kinds the player actively CHOOSES (vs automatic grants). */
const PLAYER_CHOICE: Set<IGGainKind> = new Set([
  'trait', 'ability-boosts', 'feat-general', 'feat-combat', 'skill-proficiency', 'subclass-power',
  'specialization', 'greater-specialization', 'capstone',
]);

/** The Level-10 Capstones (scraped from intuitivegames.net/character-building) — the player picks one. */
export const IG_CAPSTONES: { name: string; effect: string }[] = [
  { name: 'Ageless Wisdom', effect: 'Gain 2 Ability Score Boosts to Wisdom, and advantage on one chosen type of WIS check.' },
  { name: 'Alluring Charisma', effect: 'Gain 2 Ability Score Boosts to Charisma, and advantage on one chosen type of CHA check.' },
  { name: 'Genius Intelligence', effect: 'Gain 2 Ability Score Boosts to Intelligence, and advantage on one chosen type of INT check.' },
  { name: 'Icon of War', effect: 'Gain two combat feats.' },
  { name: 'Icon of Society', effect: 'Gain two general feats.' },
  { name: 'Legendary Attributes', effect: 'Gain 4 Ability Score Boosts.' },
  { name: 'Master of Skills', effect: 'Gain a +8 bonus on all checks with a chosen skill.' },
  { name: 'Mighty Constitution', effect: 'Gain 2 Ability Score Boosts to Constitution, and 10 extra HP.' },
  { name: 'Powerful Strength', effect: 'Gain 2 Ability Score Boosts to Strength, and advantage on one chosen type of STR check.' },
  { name: 'Precise Dexterity', effect: 'Gain 2 Ability Score Boosts to Dexterity, and advantage on one chosen type of DEX check.' },
  { name: 'Prosperity', effect: 'Acquire an additional 500 Solidas.' },
  { name: 'Ruthless', effect: 'On a critical hit, the target makes a Fortitude save vs the damage: crit fail = death; fail = loses all actions next turn.' },
];

const CAPSTONE_NAMES = IG_CAPSTONES.map((c) => c.name);

/** Find a class or subclass entry by name (case-insensitive). Subclasses carry powers/specializations. */
function igEntry(name: string) {
  const key = (name ?? '').trim().toLowerCase();
  return IG_CLASS_DETAILS.find((c) => c.name.toLowerCase() === key) ?? null;
}

/** The option list for a choice-gain, when a short catalogued one exists for this subclass. */
function optionsFor(kind: IGGainKind, entry: ReturnType<typeof igEntry>): string[] | undefined {
  if (!entry) return kind === 'capstone' ? CAPSTONE_NAMES : undefined;
  switch (kind) {
    case 'subclass-power':
      return entry.powers?.length ? entry.powers : undefined;
    case 'specialization':
    case 'greater-specialization':
      return entry.specializations?.length ? entry.specializations : undefined;
    case 'capstone':
      return CAPSTONE_NAMES;
    default:
      return undefined; // feats/traits/skills/boosts: large or free pools — the picker handles them
  }
}

/**
 * The IG level-by-level breakdown for a subclass from level 2 through `toLevel` (clamped 2–10). Every level's
 * gains are the scraped universal schedule; choice-gains carry the subclass's catalogued options where a
 * short list exists. Level 1 is the base build (class/subclass/background/ancestry/starting feats), handled
 * by the character builder, so the breakdown starts at 2.
 */
export function igLevelBreakdown(subclass: string, toLevel: number): IGLevelRow[] {
  const entry = igEntry(subclass);
  const n = Math.max(1, Math.min(10, Math.floor(Number(toLevel) || 1)));
  return SCHEDULE.filter((r) => r.level <= n).map((r) => ({
    level: r.level,
    solidasCumulative: r.solidas,
    gains: r.gains.map((g) => ({
      kind: g.kind,
      label: LABEL[g.kind],
      choose: PLAYER_CHOICE.has(g.kind),
      ...(g.count ? { count: g.count } : {}),
      ...(optionsFor(g.kind, entry) ? { options: optionsFor(g.kind, entry) } : {}),
    })),
  }));
}
