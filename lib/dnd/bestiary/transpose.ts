// lib/dnd/bestiary/transpose.ts — carry a creature into another system (B4-1).
//
// Owner: *"We also need to be able to transpose any creature into any other system."*
//
// ── G5 IS THE WHOLE DESIGN: "TRANSPOSITION NEVER INVENTS RULES" ──────────────────────────────────────
//
// It would be easy to write a function that turns a CR 5 ogre into a "level 5 PF2 ogre" by copying the
// numbers across, and it would be wrong in a way nobody notices until someone runs the fight. The systems'
// numbers are not on the same scale:
//
//   · 5e AC runs roughly 10–25 across the whole game. PF2 AC runs 14–54, because it climbs with level.
//     Copying an AC of 18 onto a level-15 PF2 creature makes it hit-on-a-2.
//   · 5e HP at CR 20 is ~300. PF2 HP at level 20 is ~450. Same idea, different curve.
//   · A 5e save DC is 8 + prof + mod. A PF2 DC is a different formula against a different baseline.
//
// There is no published conversion table for any of that, and deriving one here would be inventing rules —
// exactly what G5 forbids and exactly the kind of invention that reads as authoritative on a stat block.
//
// So this module does the honest thing: **convert what has a DEFINED correspondence, and MARK everything
// else** rather than guessing. The result carries the original values verbatim with a note saying they need
// a human, which is both truthful and more useful than a plausible number — a DM can eyeball an AC; they
// cannot eyeball whether a number was invented.
//
// What genuinely converts:
//   · **Ability scores ↔ modifiers.** `floor((score − 10) / 2)` is 5e's own published rule, and PF2 states
//     abilities as exactly that modifier. This is a real, lossless-in-one-direction mapping.
//   · **Size**, which both systems name the same way.
//   · **Type**, where the vocabularies overlap; the ones that do not are marked.
//   · **Prose** — traits, actions, descriptions — which are text in both.
//
// PURE. No DB, no AI. The AI-assisted homebrew transpose (`lib/dnd/homebrew/transpose.ts`) is a different
// tool for a different job: it REWRITES a piece into a system's idiom and asks a human to approve it. This
// one is arithmetic and honesty, and it is what should run first — if a number converts exactly, no model
// should be asked to imagine it.
import { STATBLOCK_ABILITIES, type Statblock, type StatblockAbility } from '@/lib/dnd/homebrew/statblock';

export type BestiarySystem = 'dnd5e-2014' | 'dnd5e-2024' | 'pathfinder2e' | 'intuitive-games';

export interface TransposeInput {
  name: string;
  system: string;
  type?: string | null;
  size?: string | null;
  cr?: string | null;
  statblock: Statblock;
}

export interface TransposeResult {
  system: BestiarySystem;
  name: string;
  type?: string;
  size?: string;
  statblock: Statblock;
  /** Everything that could NOT be converted, each as a sentence a DM can act on. This is the deliverable
   *  as much as the statblock is — a transposition with an empty list is either trivial or lying. */
  unmapped: string[];
  /** One line for the sheet, so a reader always knows what they are looking at. */
  note: string;
}

/** 5e's own rule. The only exact ability conversion either system defines. */
export const scoreToMod = (score: number): number => Math.floor((score - 10) / 2);

/** The inverse, which is LOSSY: +3 could have come from 16 or 17, and this picks the even one. Marked
 *  wherever it is used, because a reader deserves to know the score was reconstructed rather than stated. */
export const modToScore = (mod: number): number => 10 + mod * 2;

/** Creature types both systems name. PF2 has `animal`/`beast` where 5e has only `beast`, and several PF2
 *  types (`astral`, `dream`, `time`, `petitioner`, `shade`, `spirit`, `monitor`, `fungus`) have no 5e
 *  equivalent at all — those are marked rather than mapped to something approximate. */
const TYPE_MAP: Record<string, Partial<Record<BestiarySystem, string>>> = {
  aberration:  { 'dnd5e-2014': 'aberration', pathfinder2e: 'aberration' },
  beast:       { 'dnd5e-2014': 'beast',      pathfinder2e: 'animal' },
  animal:      { 'dnd5e-2014': 'beast',      pathfinder2e: 'animal' },
  celestial:   { 'dnd5e-2014': 'celestial',  pathfinder2e: 'celestial' },
  construct:   { 'dnd5e-2014': 'construct',  pathfinder2e: 'construct' },
  dragon:      { 'dnd5e-2014': 'dragon',     pathfinder2e: 'dragon' },
  elemental:   { 'dnd5e-2014': 'elemental',  pathfinder2e: 'elemental' },
  fey:         { 'dnd5e-2014': 'fey',        pathfinder2e: 'fey' },
  fiend:       { 'dnd5e-2014': 'fiend',      pathfinder2e: 'fiend' },
  giant:       { 'dnd5e-2014': 'giant',      pathfinder2e: 'giant' },
  humanoid:    { 'dnd5e-2014': 'humanoid',   pathfinder2e: 'humanoid' },
  monstrosity: { 'dnd5e-2014': 'monstrosity', pathfinder2e: 'beast' },
  ooze:        { 'dnd5e-2014': 'ooze',       pathfinder2e: 'ooze' },
  plant:       { 'dnd5e-2014': 'plant',      pathfinder2e: 'plant' },
  undead:      { 'dnd5e-2014': 'undead',     pathfinder2e: 'undead' },
};

const isPf2 = (s: string) => s === 'pathfinder2e';
const family = (s: string): BestiarySystem => (s as BestiarySystem);

/**
 * Convert a creature to another system.
 *
 * The returned statblock is deliberately INCOMPLETE where the source has no honest counterpart: AC, HP and
 * DCs are carried over unchanged and named in `unmapped`, so a DM knows to set them rather than trusting a
 * number this module made up.
 */
export function transposeCreature(input: TransposeInput, target: BestiarySystem): TransposeResult {
  const from = input.system;
  const unmapped: string[] = [];
  const sb = input.statblock ?? {};
  const out: Statblock = {};

  if (from === target) {
    return { system: target, name: input.name, statblock: { ...sb }, unmapped: [], note: 'Same system — nothing to convert.' };
  }

  // ── abilities: the one exact conversion ──────────────────────────────────────────────────────────
  const toPf2 = isPf2(target);
  const fromPf2 = isPf2(from);

  if (fromPf2 && !toPf2 && sb.abilityMods) {
    const abilities: Partial<Record<StatblockAbility, number>> = {};
    for (const k of STATBLOCK_ABILITIES) {
      const m = sb.abilityMods[k];
      if (m !== undefined) abilities[k] = Math.max(1, modToScore(m));
    }
    if (Object.keys(abilities).length) out.abilities = abilities;
    unmapped.push(
      'Ability scores were reconstructed from modifiers (+3 → 16). Pathfinder 2e states only the modifier, '
      + 'so the odd-numbered score that would give the same modifier is equally valid.',
    );
  } else if (!fromPf2 && toPf2 && sb.abilities) {
    const mods: Partial<Record<StatblockAbility, number>> = {};
    for (const k of STATBLOCK_ABILITIES) {
      const s = sb.abilities[k];
      if (s !== undefined) mods[k] = scoreToMod(s);
    }
    if (Object.keys(mods).length) out.abilityMods = mods;
  } else {
    // Same ability convention on both sides — carry whichever the source used.
    if (sb.abilities) out.abilities = { ...sb.abilities };
    if (sb.abilityMods) out.abilityMods = { ...sb.abilityMods };
  }

  // ── prose carries unchanged ──────────────────────────────────────────────────────────────────────
  // Text is text. An action's rules wording may reference mechanics the target does not have, which is
  // flagged below rather than rewritten — rewriting is the AI transpose's job, not arithmetic's.
  if (sb.speed) out.speed = sb.speed;
  if (sb.senses) out.senses = sb.senses;
  if (sb.languages) out.languages = sb.languages;
  if (sb.resistances) out.resistances = sb.resistances;
  if (sb.immunities) out.immunities = sb.immunities;
  if (sb.vulnerabilities) out.vulnerabilities = sb.vulnerabilities;
  if (sb.conditionImmunities) out.conditionImmunities = sb.conditionImmunities;
  if (sb.entries?.length) out.entries = sb.entries.map((e) => ({ ...e }));

  // ── the numbers that DO NOT convert ──────────────────────────────────────────────────────────────
  if (sb.ac !== undefined) {
    out.ac = sb.ac;
    unmapped.push(
      `AC ${sb.ac} was carried over unchanged. The two systems' armour classes are on different scales `
      + '(5e spans roughly 10–25 across the whole game; Pathfinder 2e climbs with level to the 50s), and no '
      + 'published conversion exists. Set this from the target system\'s own table for the intended level.',
    );
  }
  if (sb.hp !== undefined) {
    out.hp = sb.hp;
    if (sb.hitDice) out.hitDice = sb.hitDice;
    unmapped.push(
      `HP ${sb.hp} was carried over unchanged. Hit points scale differently in each system, so this is the `
      + 'source figure rather than an equivalent one.',
    );
  }
  if (sb.saves) {
    out.saves = sb.saves;
    unmapped.push(
      fromPf2
        ? 'Saves are Pathfinder 2e\'s Fortitude/Reflex/Will. 5e uses six ability saves; the closest reading '
          + 'is Fort→CON, Ref→DEX, Will→WIS, but the numbers still need setting for the target system.'
        : 'Saves are 5e\'s per-ability bonuses. Pathfinder 2e has three (Fortitude/Reflex/Will) on a '
          + 'different scale, so these carry across as a reference rather than a conversion.',
    );
  }
  if (sb.skills) out.skills = sb.skills;
  if (sb.spellcasting) {
    out.spellcasting = sb.spellcasting;
    unmapped.push('Spellcasting is quoted verbatim: the spell lists, slots and DCs differ per system and have no mapping.');
  }

  // ── tier ─────────────────────────────────────────────────────────────────────────────────────────
  if (input.cr) {
    out.cr = input.cr;
    unmapped.push(
      fromPf2
        ? `Source level ${input.cr} is kept as-is. A Pathfinder 2e level and a 5e challenge rating measure `
          + 'different things and are not interchangeable.'
        : `Source CR ${input.cr} is kept as-is. Pathfinder 2e rates creatures by level, which is not the `
          + 'same quantity as a challenge rating.',
    );
  }

  // ── type + size ──────────────────────────────────────────────────────────────────────────────────
  const t = (input.type ?? '').trim().toLowerCase();
  // Type lives on the ROW (`dnd_creatures.type`), not inside the statblock — so the mapped value is
  // returned at the top level of the result rather than written into `out`.
  const mappedType = t ? TYPE_MAP[t]?.[target] : undefined;
  if (t && !mappedType) {
    unmapped.push(`Creature type "${input.type}" has no counterpart in the target system; leave it or pick the nearest.`);
  }

  const entriesNote = sb.entries?.length
    ? 'Action and trait text is quoted verbatim and may reference mechanics the target system does not have '
      + '(recharge, actions-per-turn, degrees of success). Rewriting it is a job for the AI transpose, not this one.'
    : null;
  if (entriesNote) unmapped.push(entriesNote);

  return {
    system: target,
    name: input.name,
    ...(mappedType ? { type: mappedType } : {}),
    ...(input.size ? { size: input.size } : {}),   // both systems use the same size words
    statblock: out,
    unmapped,
    note:
      `Transposed from ${from} to ${target}. ${unmapped.length} thing(s) need a human — this converts what `
      + 'has a defined correspondence and marks the rest rather than inventing numbers.',
  };
}

/** True when the two systems share the ability convention, so a caller can skip the reconstruction note. */
export function sharesAbilityConvention(a: string, b: string): boolean {
  return isPf2(a) === isPf2(b);
}

export { family };
