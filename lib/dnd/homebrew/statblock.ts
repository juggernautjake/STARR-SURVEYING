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
  /**
   * Ability MODIFIERS, for systems that have no scores at all.
   *
   * Pathfinder 2e's remaster prints a creature's abilities only as modifiers — `Dex +3`, `Wis -1`. There is
   * no 14 behind that +3, and there is no formula that recovers one. Writing the modifier into `abilities`
   * would render "+3" as a SCORE of 3, i.e. a crippling weakness where the source states a strength: not a
   * rounding error, an inversion.
   *
   * So this is a separate, optional field rather than a reinterpretation of the existing one. A renderer
   * shows scores when it has them and modifiers when it does not — and, importantly, a negative value is
   * legal here where `abilities` rejects anything below 1.
   */
  abilityMods?: Partial<Record<StatblockAbility, number>>;
  /** Proficiency bonus, where the system uses one. Absent is normal, not missing. */
  proficiencyBonus?: number;
  /** Saving throws and skills as written — "DEX +5, CON +6". Free text for the same reason as `acNote`:
   *  which saves exist, and how they are named, is a per-system question. */
  saves?: string;
  skills?: string;

  // ── P13-1: the rest of a creature ──────────────────────────────────────────────────────────────────
  //
  // Everything below is OPTIONAL and additive: a statblock saved before this existed still parses, and a
  // homebrew item that only ever had AC and HP renders exactly as it did. That is the whole design
  // constraint — this model is already persisted inside `payload`, so it can only ever grow.
  //
  // FREE TEXT WHERE THE SYSTEMS DISAGREE, structure where they do not. `senses`, `languages`,
  // `resistances` and friends are strings for the same reason `saves` and `acNote` already are: which
  // damage types exist, and how they are named and qualified ("bludgeoning, piercing and slashing from
  // nonmagical attacks"), is a per-system question, and a picker would be wrong more often than helpful.
  // Actions ARE structured, because a sheet has to render and roll them individually.

  /** "darkvision 60 ft., passive Perception 13". */
  senses?: string;
  /** "Common, Draconic" — or "understands Common but can't speak". */
  languages?: string;
  /** 5e challenge rating or PF2/IG creature level, as written: "1/4", "13", "-1". A string because CR is
   *  not a number in 5e (fractions below 1) and the systems do not share a scale. */
  cr?: string;
  /** XP award where the system prints one separately from CR. */
  xp?: number;
  resistances?: string;
  immunities?: string;
  vulnerabilities?: string;
  /** Condition immunities — "charmed, frightened, prone". Named separately from `immunities` because 5e
   *  and PF2 both print them as their own line, and folding them together loses that. */
  conditionImmunities?: string;
  /** Spellcasting as written — the full block, including DC, attack bonus and the prepared list. Prose
   *  because a creature's casting is not a character's: it rarely follows a class progression. */
  spellcasting?: string;
  /** Traits, actions, reactions and the rest, in one list, each tagged with `kind`. One list rather than
   *  six fields so ordering is authored and rendering is a single loop — and so a system with a category
   *  we have not thought of can be added without another top-level field. */
  entries?: StatblockEntry[];
}

/** Which block an entry prints under. `trait` is the unheaded material above Actions in a 5e statblock. */
export const STATBLOCK_ENTRY_KINDS = ['trait', 'action', 'bonus', 'reaction', 'legendary', 'lair'] as const;
export type StatblockEntryKind = (typeof STATBLOCK_ENTRY_KINDS)[number];

export const ENTRY_KIND_LABELS: Record<StatblockEntryKind, string> = {
  trait: 'Traits',
  action: 'Actions',
  bonus: 'Bonus Actions',
  reaction: 'Reactions',
  legendary: 'Legendary Actions',
  lair: 'Lair Actions',
};

export interface StatblockEntry {
  kind: StatblockEntryKind;
  name: string;
  /** Full rules text, as printed. */
  body: string;
  /** An attack's to-hit, where it has one — "+7". Kept separate from `body` so a sheet can offer the roll
   *  without parsing prose, which is how a stat block becomes clickable rather than merely readable. */
  toHit?: string;
  /** "2d6 + 4 slashing". Same reasoning as `toHit`. */
  damage?: string;
  /** PF2/IG action cost, where the system has one: 1, 2, 3, 'reaction', 'free'. */
  cost?: string;
  /**
   * How often it can be used — `"3/Day"`, `"Recharge 5–6"`, `"1/Turn"` (owner question 2026-07-29:
   * *"shouldn't creatures also have access to legendary resistances in some cases?"*).
   *
   * Its own field rather than left inside the name, because this is a RESOURCE A DM SPENDS mid-fight, not
   * a label. Legendary Resistance is the clearest case: "3/Day" is the whole mechanic — a boss that can
   * refuse three failed saves plays completely differently from one that can refuse none — and printed
   * inside `name` it is something you track on paper beside the screen.
   *
   * Free text, like `cost` and for the same reason: 5e writes "3/Day" and "Recharge 5-6", PF2 writes
   * frequency traits, and a picker would be wrong more often than helpful. P13-7's playable sheet is what
   * turns this into a counter you click down; storing it now is what makes that possible later.
   */
  uses?: string;
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
  const entries = readEntries(r.entries);
  for (const k of STATBLOCK_ABILITIES) {
    const v = num(abilitiesRaw[k], 1, 99);
    if (v !== undefined) abilities[k] = v;
  }
  // Modifiers use their own range: −10…+20 covers every published creature, and NEGATIVES ARE LEGAL here
  // where a score below 1 is not. Reusing the score range would have silently dropped every PF2 creature's
  // negative modifiers — a Goblin Warrior's Wis −1 would vanish and read as "no Wisdom listed".
  const modsRaw = (r.abilityMods && typeof r.abilityMods === 'object' ? r.abilityMods : {}) as Record<string, unknown>;
  const abilityMods: Partial<Record<StatblockAbility, number>> = {};
  for (const k of STATBLOCK_ABILITIES) {
    const v = num(modsRaw[k], -10, 20);
    if (v !== undefined) abilityMods[k] = v;
  }
  return {
    ...(num(r.ac, 0, 99) !== undefined ? { ac: num(r.ac, 0, 99) } : {}),
    ...(str(r.acNote) ? { acNote: str(r.acNote) } : {}),
    ...(num(r.hp, 0, 9999) !== undefined ? { hp: num(r.hp, 0, 9999) } : {}),
    ...(str(r.hitDice) ? { hitDice: str(r.hitDice) } : {}),
    ...(str(r.speed) ? { speed: str(r.speed) } : {}),
    ...(Object.keys(abilities).length ? { abilities } : {}),
    ...(Object.keys(abilityMods).length ? { abilityMods } : {}),
    ...(num(r.proficiencyBonus, 0, 20) !== undefined ? { proficiencyBonus: num(r.proficiencyBonus, 0, 20) } : {}),
    ...(str(r.saves) ? { saves: str(r.saves) } : {}),
    ...(str(r.skills) ? { skills: str(r.skills) } : {}),
    ...(str(r.senses) ? { senses: str(r.senses) } : {}),
    ...(str(r.languages) ? { languages: str(r.languages) } : {}),
    ...(str(r.cr) ? { cr: str(r.cr) } : {}),
    ...(num(r.xp, 0, 1000000) !== undefined ? { xp: num(r.xp, 0, 1000000) } : {}),
    ...(str(r.resistances) ? { resistances: str(r.resistances) } : {}),
    ...(str(r.immunities) ? { immunities: str(r.immunities) } : {}),
    ...(str(r.vulnerabilities) ? { vulnerabilities: str(r.vulnerabilities) } : {}),
    ...(str(r.conditionImmunities) ? { conditionImmunities: str(r.conditionImmunities) } : {}),
    ...(str(r.spellcasting) ? { spellcasting: str(r.spellcasting) } : {}),
    ...(entries.length ? { entries } : {}),
  };
}

/**
 * Read the entry list defensively. An entry with no name AND no body is DROPPED — same rule as every other
 * field here: a half-parsed action is worse than a missing one, because a DM reads it off the page
 * mid-combat and cannot tell it is incomplete. An unrecognised `kind` falls back to `action` rather than
 * being discarded, since the text is real content and losing it would be the greater harm.
 */
function readEntries(raw: unknown): StatblockEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: StatblockEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    const name = str(e.name) ?? '';
    const body = str(e.body) ?? '';
    if (!name && !body) continue;
    const kindRaw = typeof e.kind === 'string' ? e.kind : '';
    const kind = (STATBLOCK_ENTRY_KINDS as readonly string[]).includes(kindRaw)
      ? (kindRaw as StatblockEntryKind)
      : 'action';
    out.push({
      kind,
      name,
      body,
      ...(str(e.toHit) ? { toHit: str(e.toHit) } : {}),
      ...(str(e.damage) ? { damage: str(e.damage) } : {}),
      ...(str(e.cost) ? { cost: str(e.cost) } : {}),
      ...(str(e.uses) ? { uses: str(e.uses) } : {}),
    });
  }
  return out;
}

/** Entries of one kind, in authored order — the renderer's loop, one heading at a time. */
export function entriesOfKind(s: Statblock, kind: StatblockEntryKind): StatblockEntry[] {
  return (s.entries ?? []).filter((e) => e.kind === kind);
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
    && !s.abilities
    // P13-1's fields count too. Without this a creature described entirely by its ACTIONS — no AC, no HP,
    // which is exactly how a hazard or a swarm token is written — reports empty and the renderer omits the
    // block, silently hiding everything the author typed. Adding fields to the model without adding them
    // here is how "it saved but nothing showed" bugs are born.
    && s.xp === undefined
    && !s.senses && !s.languages && !s.cr && !s.resistances && !s.immunities
    && !s.vulnerabilities && !s.conditionImmunities && !s.spellcasting
    && !(s.entries && s.entries.length);
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
