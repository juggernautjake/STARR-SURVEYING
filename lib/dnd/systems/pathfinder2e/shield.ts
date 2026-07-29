// lib/dnd/systems/pathfinder2e/shield.ts — Raise a Shield, Shield Block, and a shield that breaks (P5-2).
//
// AUDIT FINDING C-2: `PF2_SHIELDS` has been catalogued with hardness, HP and Break Threshold since the data
// files were written, and `pf2Shield()` was exported and **never called**. So the rules engine had no Raise
// a Shield — a +2 circumstance bonus to AC and the single most-used defensive action in the game — no Shield
// Block, no shield damage, and no broken state.
//
// TWO RULES THIS FILE EXISTS TO GET RIGHT, because both are silently wrong if you guess:
//
//  1. **The bonus applies only while RAISED.** A shield in your hand does nothing. Modelling it as a
//     permanent AC item bonus (the tempting shortcut, since `acItemBonus` already exists) would hand every
//     shield user a permanent +2 they have not earned and quietly break every DC in the game for them.
//
//  2. **A shield's bonus is a CIRCUMSTANCE bonus.** PF2's bonus types do not stack with themselves — only
//     the largest circumstance bonus applies. Adding it to `acItemBonus`, which is an *item* bonus, would
//     make it stack with things it must not.
//
// Pure: no React, no DB.
import { PF2_SHIELDS, pf2Shield, type PF2ShieldDef } from './data/equipment';

/** A shield as it sits on a character: which one, how damaged, and whether it is up right now. */
export interface PF2ShieldState {
  /** Matches a `PF2_SHIELDS` name, or is a custom shield's own name. */
  name: string;
  /** Current Hit Points. Absent means undamaged. */
  currentHp?: number;
  /** Whether it is Raised right now. Ephemeral in fiction (it lasts until your next turn), but stored so
   *  the sheet's AC reflects what the player just did. */
  raised?: boolean;
  /** Overrides for a shield not in the catalogue — a homebrew or magical one. */
  acBonus?: number;
  hardness?: number;
  hp?: number;
  bt?: number;
}

/** The resolved numbers for a shield, catalogue values filled in behind any explicit overrides. */
export interface ResolvedShield {
  name: string;
  acBonus: number;
  hardness: number;
  maxHp: number;
  bt: number;
  currentHp: number;
  raised: boolean;
  /** At or below the Break Threshold. A broken shield gives NO bonus until repaired. */
  broken: boolean;
  /** Reduced to 0 HP — destroyed outright. */
  destroyed: boolean;
  speedPenalty: number;
  def: PF2ShieldDef | null;
}

/** Resolve a stored shield against the catalogue. An unknown name is fine — it resolves from the
 *  overrides, so a homebrew shield works without being added to the data file. */
export function resolveShield(s: PF2ShieldState | null | undefined): ResolvedShield | null {
  if (!s || !s.name?.trim()) return null;
  const def = pf2Shield(s.name);
  const maxHp = s.hp ?? def?.hp ?? 0;
  const bt = s.bt ?? def?.bt ?? 0;
  const currentHp = s.currentHp ?? maxHp;
  const destroyed = maxHp > 0 && currentHp <= 0;
  return {
    name: s.name,
    acBonus: s.acBonus ?? def?.acBonus ?? 0,
    hardness: s.hardness ?? def?.hardness ?? 0,
    maxHp,
    bt,
    currentHp,
    raised: !!s.raised,
    // `<=` matches the rule as written: at OR below the threshold it is broken.
    broken: maxHp > 0 && currentHp <= bt,
    destroyed,
    speedPenalty: def?.speedPenalty ?? 0,
    def: def ?? null,
  };
}

/**
 * The circumstance bonus to AC a shield is currently providing.
 *
 * Zero unless it is raised, and zero when broken — a broken shield gives nothing until repaired, which is
 * the part that makes Shield Block a real decision rather than free damage reduction.
 */
export function shieldAcBonus(shield: ResolvedShield | null): number {
  if (!shield || !shield.raised || shield.broken || shield.destroyed) return 0;
  return shield.acBonus;
}

export interface ShieldBlockResult {
  /** Damage that still reaches the character. */
  damageTaken: number;
  /** Damage the shield absorbed. */
  damageAbsorbed: number;
  /** Damage dealt to the shield itself. */
  shieldDamage: number;
  shieldHpAfter: number;
  brokeNow: boolean;
  destroyedNow: boolean;
  note: string;
}

/**
 * Shield Block: the shield's Hardness reduces the damage, and the shield takes the rest.
 *
 * The rule people get wrong is what happens to the OVERFLOW. The shield takes damage equal to the amount
 * that got through the Hardness — and if that leaves it at or under its Break Threshold it is broken; if it
 * drops to 0 it is destroyed. The character takes the same overflow. Hardness is not a shield-only shield:
 * it reduces the damage for *both*, which is why blocking a big hit still hurts.
 */
export function shieldBlock(shield: ResolvedShield | null, incoming: number): ShieldBlockResult | null {
  if (!shield || shield.broken || shield.destroyed || !shield.raised) return null;
  const dmg = Math.max(0, Math.round(incoming));
  const absorbed = Math.min(dmg, shield.hardness);
  const overflow = dmg - absorbed;
  const hpAfter = Math.max(0, shield.currentHp - overflow);
  const destroyedNow = shield.maxHp > 0 && hpAfter <= 0;
  const brokeNow = !shield.broken && shield.maxHp > 0 && hpAfter <= shield.bt;
  return {
    damageTaken: overflow,
    damageAbsorbed: absorbed,
    shieldDamage: overflow,
    shieldHpAfter: hpAfter,
    brokeNow,
    destroyedNow,
    note: destroyedNow
      ? `${shield.name} is destroyed.`
      : brokeNow
        ? `${shield.name} is broken — it gives no AC bonus until repaired.`
        : `${shield.name} absorbed ${absorbed}.`,
  };
}

/** The shields a picker should offer. */
export function shieldOptions(): PF2ShieldDef[] {
  return PF2_SHIELDS;
}

/** A one-line status for the sheet: "Steel Shield · raised · 14/20 HP". */
export function describeShield(shield: ResolvedShield | null): string {
  if (!shield) return '';
  const bits = [shield.name];
  if (shield.destroyed) bits.push('destroyed');
  else if (shield.broken) bits.push('broken');
  else if (shield.raised) bits.push(`raised (+${shield.acBonus} AC)`);
  else bits.push('not raised');
  if (shield.maxHp > 0) bits.push(`${shield.currentHp}/${shield.maxHp} HP`);
  return bits.join(' · ');
}
