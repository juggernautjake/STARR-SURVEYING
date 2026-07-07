// app/dnd/_sheet/engine/attack-roll.ts — attack builder → roll engine (Phase C18).
//
// Fires a computed AttackEntry (C16) through the dice engine: a d20 to-hit with the
// entry's total to-hit bonus + adv/dis, crit on a natural 20 (double the damage
// DICE, not the flat mod), miss on a natural 1, and hit-vs-AC when a target AC is
// given. Damage = the weapon dice (+ any extra dice, e.g. a flametongue's fire) +
// the entry's damage mod + situational bonuses. Save-based attacks skip the to-hit
// and use the character's COMPUTED save DC (from apply.ts / spell.saveDC).
import type { AbilityKey } from '../rules/dnd';
import { rollD20, rollDamage, type Advantage, type D20Roll, type DamageRoll } from '../lib/dice';
import type { AttackEntry } from './weapons';

export interface AttackRollOptions {
  advantage?: boolean;
  disadvantage?: boolean;
  situationalToHit?: number;
  situationalDamage?: number;
  /** Extra damage dice added on top, e.g. '1d6' (flametongue), '2d6' (sneak attack). */
  extraDamageDice?: string;
  /** If provided, the result reports hit/miss against this AC. */
  targetAC?: number;
}

/** adv + dis cancel to a flat roll (5e/2024). */
export function rollMode(o: AttackRollOptions): Advantage {
  const adv = !!o.advantage;
  const dis = !!o.disadvantage;
  if (adv && dis) return 'flat';
  return adv ? 'adv' : dis ? 'dis' : 'flat';
}

export interface AttackRollResult {
  toHit: D20Roll;
  crit: boolean;
  fumble: boolean;
  /** vs targetAC — null when no AC was supplied. Nat 20 always hits, nat 1 always misses. */
  hit: boolean | null;
  damage: DamageRoll;
  /** damage total incl. the entry's damage mod + situational (dice already crit-doubled). */
  damageTotal: number;
}

export function rollAttack(attack: AttackEntry, opts: AttackRollOptions = {}): AttackRollResult {
  const toHit = rollD20(attack.toHit + (opts.situationalToHit ?? 0), rollMode(opts));
  const crit = toHit.crit;
  const fumble = toHit.fumble;

  const damageExpr = attack.damageDice + (opts.extraDamageDice ? `+${opts.extraDamageDice}` : '');
  const damage = rollDamage(damageExpr, crit);
  const damageTotal = damage.total + attack.damageMod + (opts.situationalDamage ?? 0);

  const hit = opts.targetAC == null ? null : crit ? true : fumble ? false : toHit.total >= opts.targetAC;

  return { toHit, crit, fumble, hit, damage, damageTotal };
}

export interface SaveAttackInput {
  /** The attacker's computed save DC (e.g. spell save DC from apply.ts). */
  saveDC: number;
  saveAbility: AbilityKey;
  damageDice: string;
  damageMod?: number;
}

export interface SaveAttackResult {
  saveDC: number;
  saveAbility: AbilityKey;
  damage: DamageRoll;
  fullDamage: number;
  /** Damage on a successful save (half, rounded down) — the common "half on save". */
  halfDamage: number;
}

export function rollSaveAttack(input: SaveAttackInput): SaveAttackResult {
  const damage = rollDamage(input.damageDice);
  const fullDamage = damage.total + (input.damageMod ?? 0);
  return {
    saveDC: input.saveDC,
    saveAbility: input.saveAbility,
    damage,
    fullDamage,
    halfDamage: Math.floor(fullDamage / 2),
  };
}
