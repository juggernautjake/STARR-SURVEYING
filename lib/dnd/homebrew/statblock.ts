// lib/dnd/homebrew/statblock.ts — the creature statblock's core numbers (P6-13).
//
// The owner's case: *"they would build the creature giving it stats and feats and abilities and actions and
// stuff, and a description, and they would also upload the image of the creature. Then there would be a
// complete statblock for that creature and their image would be shown too."*
//
// This is the numeric core only — AC, HP, speeds, the six abilities. Everything else a statblock shows
// (size, type, alignment, CR, senses, languages, resistances, traits, actions, reactions, legendary
// actions) is already declared as its own field in the `creature` kind spec, so it is collected there and
// merely *rendered* alongside these. Duplicating any of it here would create two places to change one fact.
//
// SYSTEM-NEUTRAL ON PURPOSE. Every system this platform supports describes a creature with an armour value,
// a hit-point total, a speed and six ability scores; they disagree about what the numbers MEAN (PF2's AC is
// not 5e's, its "level" is not a CR) and about everything layered on top. So this models only the shared
// skeleton and lets the surrounding fields carry each system's own vocabulary — rather than inventing a
// universal creature model that would be subtly wrong for all four.
//
// Pure: no React, no DB. The editor and the renderer both read it, which is what stops them disagreeing
// about what an empty statblock looks like.

/** The six ability scores, in the order every statblock in every one of these systems prints them. */
export const STATBLOCK_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type StatblockAbility = (typeof STATBLOCK_ABILITIES)[number];

export const ABILITY_LABELS: Record<StatblockAbility, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

export interface Statblock {
  ac?: number;
  /** Armour description — "natural armor", "chain shirt, shield". Free text: the phrasing differs per
   *  system and per creature, and a picker would be wrong more often than it was helpful. */
  acNote?: string;
  hp?: number;
  /** "8d10 + 16" — printed as written. Not derived from `hp`, because a homebrew creature may have a flat
   *  total with no dice at all, and computing one would be inventing a rule. */
  hitDice?: string;
  speed?: string;
  abilities?: Partial<Record<StatblockAbility, number>>;
  /** Proficiency bonus, where the system uses one. Absent is normal, not missing. */
  proficiencyBonus?: number;
  /** Saving throws and skills as written — "DEX +5, CON +6". Free text for the same reason as `acNote`:
   *  which saves exist, and how they are named, is a per-system question. */
  saves?: string;
  skills?: string;
}

const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : undefined;
};

const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
};

/**
 * Defensively read a stored statblock. Every field is optional and an out-of-range or unparseable value is
 * DROPPED rather than clamped — a creature with a typo'd AC should render without one, not with a silently
 * invented number a DM might read off the page mid-combat.
 */
export function normalizeStatblock(raw: unknown): Statblock {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const abilitiesRaw = (r.abilities && typeof r.abilities === 'object' ? r.abilities : {}) as Record<string, unknown>;
  const abilities: Partial<Record<StatblockAbility, number>> = {};
  for (const k of STATBLOCK_ABILITIES) {
    const v = num(abilitiesRaw[k], 1, 99);
    if (v !== undefined) abilities[k] = v;
  }
  return {
    ...(num(r.ac, 0, 99) !== undefined ? { ac: num(r.ac, 0, 99) } : {}),
    ...(str(r.acNote) ? { acNote: str(r.acNote) } : {}),
    ...(num(r.hp, 0, 9999) !== undefined ? { hp: num(r.hp, 0, 9999) } : {}),
    ...(str(r.hitDice) ? { hitDice: str(r.hitDice) } : {}),
    ...(str(r.speed) ? { speed: str(r.speed) } : {}),
    ...(Object.keys(abilities).length ? { abilities } : {}),
    ...(num(r.proficiencyBonus, 0, 20) !== undefined ? { proficiencyBonus: num(r.proficiencyBonus, 0, 20) } : {}),
    ...(str(r.saves) ? { saves: str(r.saves) } : {}),
    ...(str(r.skills) ? { skills: str(r.skills) } : {}),
  };
}

/** True when there is nothing to render. The detail page omits the block entirely rather than printing a
 *  grid of dashes, which reads as a broken statblock rather than an unfinished one.
 *
 *  Every numeric field is tested with `=== undefined`, NOT for falsiness. `!s.ac` was the first version and
 *  is wrong: it treats **AC 0** as an empty statblock. Unusual but legal (a helpless object, a swarm token),
 *  and the classic falsy-zero bug — invisible until the one creature that has it renders blank. The string
 *  fields can use falsiness safely, because `normalizeStatblock` has already turned `''` into `undefined`. */
export function isStatblockEmpty(s: Statblock): boolean {
  return s.ac === undefined
    && s.hp === undefined
    && s.proficiencyBonus === undefined
    && !s.speed && !s.hitDice && !s.saves && !s.skills && !s.acNote
    && !s.abilities;
}

/**
 * The 5e-style modifier for a score: `floor((score - 10) / 2)`.
 *
 * Shared by 5e (both editions), Pathfinder 2e and Intuitive Games — all three derive a modifier from a
 * score this way. It is NOT universal to tabletop games in general, so this lives here as a helper the
 * renderer opts into rather than as a property of `Statblock` itself.
 */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** "+3" / "−1" — signed, with a real minus sign rather than a hyphen, matching how the sheets render. */
export function formatModifier(mod: number): string {
  return mod < 0 ? `−${Math.abs(mod)}` : `+${mod}`;
}

/** The one-line AC + HP summary a card can show without rendering the whole block. Returns '' when there
 *  is nothing worth saying. */
/**
 * A homebrew creature as a COMBATANT — the fields the initiative tracker needs (P6-14).
 *
 * The Studio could build a creature, render its statblock and show its art, and there was no way to put it
 * in a fight: `/encounters/[id]/entries` accepted a `characterId` and nothing else, so a DM dropping their
 * own monster into combat re-typed its name and HP by hand — the exact work the Studio exists to remove,
 * with a fresh chance to fat-finger the HP every time.
 *
 * The plan's requirement was that "a creature dropped into a fight and a creature opened from the Studio
 * are the same object". This is that seam, and it is pure so the seam itself is testable.
 *
 * HP: `hp` is the creature's maximum, and the instance starts there. Both are returned rather than one,
 * because an initiative entry tracks current AND max separately — a combatant added at full health still
 * needs a max to count down from. A creature with no HP recorded returns `null` for both rather than a
 * guess: `normalizeStatblock` already DROPS an untrustworthy number, and inventing one here would put a
 * plausible wrong HP in front of a DM mid-combat, which is the failure that whole module is built against.
 */
export interface CreatureCombatant {
  name: string;
  tokenUrl: string | null;
  hp: number | null;
  maxHp: number | null;
}

export function creatureCombatant(row: {
  name?: unknown;
  image_url?: unknown;
  payload?: unknown;
} | null | undefined): CreatureCombatant | null {
  if (!row) return null;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) return null;
  const payload = row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {};
  const sb = normalizeStatblock(payload.statblock);
  const hp = sb.hp ?? null;
  return {
    name,
    // The creature's art doubles as its token. A separate token field would be a second thing to fill in
    // for a gain nobody asked for; the Studio's image is already the picture of this creature.
    tokenUrl: typeof row.image_url === 'string' && row.image_url ? row.image_url : null,
    hp,
    maxHp: hp,
  };
}

export function statblockBrief(s: Statblock): string {
  const parts: string[] = [];
  if (s.ac !== undefined) parts.push(`AC ${s.ac}`);
  if (s.hp !== undefined) parts.push(`HP ${s.hp}`);
  if (s.speed) parts.push(s.speed);
  return parts.join(' · ');
}
