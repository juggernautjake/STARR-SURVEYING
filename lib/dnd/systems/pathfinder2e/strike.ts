// lib/dnd/systems/pathfinder2e/strike.ts — resolving a PF2 Strike into real numbers (S13b).
//
// The catalog stored weapon traits as strings ("deadly d10", "agile", "two-hand d12") and nothing
// consumed them, so a Rapier and a Shortsword rolled identically on a critical hit despite `deadly`
// being the entire point of the Rapier. This turns those strings into the maths.
//
// PF2 CRITS ARE NOT 5e CRITS, and this is the single easiest place to be silently wrong:
//   · 5e rolls the damage dice twice and adds modifiers once.
//   · PF2 DOUBLES THE ENTIRE DAMAGE TOTAL — dice AND modifiers — and THEN adds deadly/fatal dice.
// A naive "roll dice twice" implementation produces plausible numbers that are wrong all the time,
// which for a rules platform is worse than not implementing crits at all (Ground Rule 3).
//
// The trait rules modelled here, each of which changes a number:
//   · agile        — multiple attack penalty is −4/−8 instead of −5/−10
//   · deadly dX    — on a crit, add ONE die of dX (more at higher weapon potency), added AFTER
//                    doubling, so it is not itself doubled
//   · fatal dX     — on a crit, the weapon's damage die BECOMES dX and you add one extra dX die;
//                    the die substitution happens BEFORE doubling
//   · two-hand dX  — wielding it in two hands changes the damage die to dX
//   · versatile X  — may deal damage type X instead, at the wielder's choice
//   · propulsive   — add half your Strength modifier (if positive) to damage
//   · thrown       — melee weapon usable at range; Strength still applies to damage
//   · striking     — the striking rune line multiplies the number of WEAPON dice (not modifiers)
import type { PF2AttributeKey } from './model';

export type PF2StrikingRune = 'none' | 'striking' | 'greater' | 'major';

/** How many weapon damage dice the striking rune line grants. Striking multiplies the WEAPON dice
 *  only — never the attribute modifier, and never the deadly/fatal dice. */
export const STRIKING_DICE: Record<PF2StrikingRune, number> = { none: 1, striking: 2, greater: 3, major: 4 };

export interface PF2StrikeWeapon {
  name: string;
  /** Base damage die, e.g. "1d6". */
  damageDie: string;
  damageType: string;
  traits: string[];
}

export interface PF2StrikeContext {
  level: number;
  attributes: Partial<Record<PF2AttributeKey, number>>;
  /** Attack proficiency total (already includes level — see pf2Proficiency). */
  proficiency: number;
  /** Potency rune / other item bonus to the attack roll. */
  itemBonus?: number;
  striking?: PF2StrikingRune;
  /** Which Strike of the turn this is: 0 = first, 1 = second, 2+ = third or later. */
  strikeIndex?: number;
  /** Ranged/thrown Strikes use Dexterity to hit; melee uses Strength unless the weapon is finesse. */
  ranged?: boolean;
  /** Wielding a two-hand weapon in two hands. */
  twoHanded?: boolean;
  /** Flat modifiers already resolved from conditions/effects (a Frightened 2 gives −2). */
  extraAttack?: number;
  extraDamage?: number;
}

/** Does the weapon carry this trait? Matches the bare name AND the parameterised form, because
 *  several traits are stored with their argument attached ("thrown 10 ft", "versatile P"). Exact
 *  matching alone silently missed those — `thrown` never fired, so thrown weapons lost their
 *  Strength damage. */
const has = (traits: string[], t: string) =>
  traits.some((x) => {
    const n = x.trim().toLowerCase();
    return n === t || n.startsWith(`${t} `);
  });
/** Pull the die out of a parameterised trait, e.g. "deadly d10" → "d10". Returns null when absent,
 *  so a weapon without the trait is never given one by accident. */
export function traitDie(traits: string[], prefix: string): string | null {
  const hit = traits.find((x) => x.trim().toLowerCase().startsWith(`${prefix} `));
  if (!hit) return null;
  const m = hit.trim().match(/d(\d+)$/i);
  return m ? `d${m[1]}` : null;
}

const dieSize = (die: string): number => Number(die.replace(/^.*d/i, '')) || 0;
const dieCount = (die: string): number => Number(die.match(/^(\d+)d/i)?.[1] ?? 1);

/** The multiple attack penalty for this Strike. Agile weapons take −4/−8 rather than −5/−10, and
 *  the penalty stops growing after the third Strike. */
export function pf2Map(strikeIndex: number, traits: string[]): number {
  if (strikeIndex <= 0) return 0;
  const base = has(traits, 'agile') ? 4 : 5;
  return -Math.min(2, strikeIndex) * base;
}

export interface PF2StrikeResult {
  /** Total attack modifier, MAP and condition modifiers included. */
  attack: number;
  map: number;
  /** Damage expression on a normal hit, e.g. "2d6+4 slashing". */
  damage: string;
  /** Damage on a CRITICAL hit — the whole total doubled, then deadly/fatal dice added. */
  critDamage: string;
  /** The attribute that applied to damage, for the roll breakdown. */
  damageAttribute: PF2AttributeKey | null;
  /** Human-readable reasons, so the roller can show its work like the IG sheet does. */
  notes: string[];
}

/** Resolve a Strike into the numbers the roller needs. Pure. */
export function pf2ResolveStrike(weapon: PF2StrikeWeapon, ctx: PF2StrikeContext): PF2StrikeResult {
  const traits = weapon.traits ?? [];
  const notes: string[] = [];
  const str = ctx.attributes.STR ?? 0;
  const dex = ctx.attributes.DEX ?? 0;

  // To-hit attribute: ranged uses Dex; melee uses Str unless finesse lets you choose the better.
  let attackAttr: PF2AttributeKey = ctx.ranged ? 'DEX' : 'STR';
  if (!ctx.ranged && has(traits, 'finesse') && dex > str) {
    attackAttr = 'DEX';
    notes.push('finesse: using Dexterity to hit');
  }
  const attackMod = ctx.attributes[attackAttr] ?? 0;

  const map = pf2Map(ctx.strikeIndex ?? 0, traits);
  if (map) notes.push(`multiple attack penalty ${map}${has(traits, 'agile') ? ' (agile)' : ''}`);

  const attack = attackMod + ctx.proficiency + (ctx.itemBonus ?? 0) + map + (ctx.extraAttack ?? 0);

  // ── Damage dice ────────────────────────────────────────────────────────────────────────────
  // Order matters: two-hand and fatal SUBSTITUTE the die before striking multiplies the count.
  let die = weapon.damageDie;

  if (ctx.twoHanded) {
    const th = traitDie(traits, 'two-hand');
    if (th) { die = `1${th}`; notes.push(`two-hand: damage die becomes ${th}`); }
  }

  const striking = ctx.striking ?? 'none';
  const count = STRIKING_DICE[striking] * dieCount(die);
  if (striking !== 'none') notes.push(`${striking} striking: ${count} weapon dice`);

  const size = dieSize(die);

  // Damage attribute: melee and thrown add Strength; ranged adds nothing unless propulsive.
  let damageAttribute: PF2AttributeKey | null = null;
  let damageMod = 0;
  if (!ctx.ranged || has(traits, 'thrown')) {
    damageAttribute = 'STR';
    damageMod = str;
  } else if (has(traits, 'propulsive')) {
    damageAttribute = 'STR';
    // Propulsive adds HALF your Strength modifier, and only when it is positive — a negative
    // modifier is not halved into the damage, it simply does not apply.
    damageMod = str > 0 ? Math.floor(str / 2) : 0;
    notes.push('propulsive: half Strength to damage');
  }
  damageMod += ctx.extraDamage ?? 0;

  const modPart = damageMod > 0 ? `+${damageMod}` : damageMod < 0 ? `${damageMod}` : '';
  const damage = `${count}d${size}${modPart} ${weapon.damageType}`;

  // ── Critical damage ────────────────────────────────────────────────────────────────────────
  // PF2 doubles the WHOLE total (dice and modifiers), then adds deadly/fatal dice on top —
  // those extra dice are NOT doubled.
  const critCount = count * 2;
  const critMod = damageMod * 2;
  let critExtra = '';

  const fatal = traitDie(traits, 'fatal');
  const deadly = traitDie(traits, 'deadly');

  if (fatal) {
    // Fatal replaces the damage die entirely on a crit and adds one more die of that size.
    const fSize = dieSize(fatal);
    notes.push(`fatal ${fatal}: crit dice become ${fatal} plus one extra`);
    const critModPart = critMod > 0 ? `+${critMod}` : critMod < 0 ? `${critMod}` : '';
    return {
      attack, map, damage, critDamage: `${critCount + 1}d${fSize}${critModPart} ${weapon.damageType}`,
      damageAttribute, notes,
    };
  }

  if (deadly) {
    // Deadly adds its die AFTER doubling. The number of deadly dice rises with the striking rune
    // line (1 / 2 / 3 for striking / greater / major).
    const deadlyDice = striking === 'none' ? 1 : striking === 'striking' ? 1 : striking === 'greater' ? 2 : 3;
    critExtra = ` + ${deadlyDice}${deadly}`;
    notes.push(`deadly ${deadly}: +${deadlyDice}${deadly} on a critical hit`);
  }

  const critModPart = critMod > 0 ? `+${critMod}` : critMod < 0 ? `${critMod}` : '';
  return {
    attack, map,
    damage,
    critDamage: `${critCount}d${size}${critModPart}${critExtra} ${weapon.damageType}`,
    damageAttribute, notes,
  };
}
