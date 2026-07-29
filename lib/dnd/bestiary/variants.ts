// lib/dnd/bestiary/variants.ts — how a weakened or elite version is DERIVED (P13-10).
//
// The brief wants three versions of the creatures that earn them (P13-9 decides which). This is the
// arithmetic, and the plan's own requirement is that it be **stated and testable** — so every number here
// is either quoted from a published adjustment or labelled as ours.
//
// ── GROUND RULE 3 APPLIES HARDEST HERE ──────────────────────────────────────────────────────────────
//
// Pathfinder 2e PUBLISHES Weak and Elite adjustments; those are rules, and we apply them. D&D 5e does
// NOT publish anything equivalent, so the 5e path is a HOUSE FORMULA and says so in `derivation` on every
// row it produces — the string a DM reads in the library. Presenting our arithmetic as though it were
// WotC's would be exactly the invented-rule failure Ground Rule 3 exists to stop.
//
// `damage` is deliberately NOT adjusted. PF2's published adjustment does change damage, but the exact
// per-attack rule is more than "±2 everywhere" and this module has not verified it against the source —
// so it is left alone and flagged, rather than guessed at. A creature whose attacks hit for the base
// amount is wrong in a small, visible way; one whose damage was silently invented is wrong in a way
// nobody can see. `DAMAGE_UNVERIFIED` records the gap so it is a known hole, not a forgotten one.
import type { Statblock } from '@/lib/dnd/homebrew/statblock';
import { parseCr, type EligibilityInput, type VariantReason } from './eligibility';

export type VariantTier = 'weak' | 'base' | 'elite';

/** Left undone on purpose — see the header. Named so a later slice can find every place it matters. */
export const DAMAGE_UNVERIFIED =
  'Damage is unchanged: the published per-attack adjustment has not been verified against its source, and '
  + 'guessing it would put an invented number on a stat block a DM reads mid-combat.';

/**
 * Pathfinder 2e's HP adjustment, which is banded by level rather than flat. Quoted from the published
 * Weak/Elite adjustments: ±10 at level 1, ±15 at 2–4, ±20 at 5–19, ±30 at 20+.
 */
export function pf2HpDelta(level: number): number {
  if (level >= 20) return 30;
  if (level >= 5) return 20;
  if (level >= 2) return 15;
  return 10;
}

/** The flat ±2 PF2 applies to AC, attack modifiers, DCs and saves. */
const PF2_FLAT = 2;

/**
 * Our 5e house formula, and the reasoning, because a formula nobody can argue with is one nobody can
 * correct:
 *   · **HP ±25%** — the lever with the least knock-on effect. It changes how long a fight lasts without
 *     touching how often anything hits, which is what a DM re-tiering an encounter usually wants.
 *   · **AC ±1, attack ±1** — deliberately smaller than PF2's ±2. 5e's bounded accuracy means ±2 to AC is
 *     roughly a 10% swing in every attack against it, which compounds far faster than the same number
 *     does in PF2.
 *   · **CR is NOT recomputed.** 5e's CR is derived from offensive and defensive numbers through a table
 *     this module does not implement, and printing a CR we made up would be worse than printing none.
 *     The variant carries the parent's CR with its tier in the name, which is what published 5e variants
 *     do anyway ("Fire Giant Dreadnought" is not a re-rated Fire Giant).
 */
const HOUSE_5E = { hpPct: 0.25, ac: 1, attack: 1 } as const;

export interface VariantResult {
  tier: VariantTier;
  name: string;
  statblock: Statblock;
  /** The sentence stored in `dnd_creature_variants.derivation` and shown in the library. */
  derivation: string;
  notes: string[];
}

const isPf2 = (system: string) => system === 'pathfinder2e';

/** Shift every signed modifier in a written line — "DEX +5, CON +6" → "DEX +7, CON +8". Leaves anything
 *  that is not a signed number alone, so prose survives untouched. */
export function shiftModifiers(text: string, delta: number): string {
  return text.replace(/([+-])(\d+)/g, (_m, sign: string, digits: string) => {
    const next = (sign === '-' ? -Number(digits) : Number(digits)) + delta;
    return next < 0 ? `-${Math.abs(next)}` : `+${next}`;
  });
}

/**
 * Derive a variant. Returns null for `base` (the parent IS the base — inventing a duplicate row for it
 * would give two places to fix one typo, which is why seed 462 only stores a base row when it differs)
 * and null when the creature is not eligible, so the caller cannot accidentally generate three versions
 * of a rabbit.
 */
export function deriveVariant(
  creature: EligibilityInput & { statblock: Statblock },
  tier: VariantTier,
  reason: VariantReason,
): VariantResult | null {
  if (tier === 'base' || reason === 'none') return null;

  const sb = creature.statblock;
  const dir = tier === 'elite' ? 1 : -1;
  const out: Statblock = { ...sb };
  const notes: string[] = [DAMAGE_UNVERIFIED];
  let derivation: string;

  if (isPf2(creature.system)) {
    const level = parseCr(creature.cr) ?? 1;
    const hp = pf2HpDelta(level);
    if (sb.ac !== undefined) out.ac = Math.max(0, sb.ac + dir * PF2_FLAT);
    if (sb.hp !== undefined) out.hp = Math.max(1, sb.hp + dir * hp);
    if (sb.saves) out.saves = shiftModifiers(sb.saves, dir * PF2_FLAT);
    if (sb.skills) out.skills = shiftModifiers(sb.skills, dir * PF2_FLAT);
    if (sb.entries) {
      out.entries = sb.entries.map((e) => (e.toHit ? { ...e, toHit: shiftModifiers(e.toHit, dir * PF2_FLAT) } : e));
    }
    derivation = tier === 'elite'
      ? `Pathfinder 2e Elite adjustment: +${PF2_FLAT} to AC, attacks, DCs and saves; +${hp} HP at level ${level}.`
      : `Pathfinder 2e Weak adjustment: −${PF2_FLAT} to AC, attacks, DCs and saves; −${hp} HP at level ${level}.`;
  } else {
    if (sb.ac !== undefined) out.ac = Math.max(0, sb.ac + dir * HOUSE_5E.ac);
    if (sb.hp !== undefined) out.hp = Math.max(1, Math.round(sb.hp * (1 + dir * HOUSE_5E.hpPct)));
    if (sb.entries) {
      out.entries = sb.entries.map((e) => (e.toHit ? { ...e, toHit: shiftModifiers(e.toHit, dir * HOUSE_5E.attack) } : e));
    }
    // Said out loud, on every row: this is ours, not the published game's.
    derivation = tier === 'elite'
      ? `Starr Tabletop house formula (not an official rule): +${HOUSE_5E.hpPct * 100}% HP, +${HOUSE_5E.ac} AC, +${HOUSE_5E.attack} to attacks. CR unchanged.`
      : `Starr Tabletop house formula (not an official rule): −${HOUSE_5E.hpPct * 100}% HP, −${HOUSE_5E.ac} AC, −${HOUSE_5E.attack} to attacks. CR unchanged.`;
    notes.push('Challenge rating is left as written — 5e derives CR from a table this does not implement, and a made-up CR is worse than none.');
  }

  return {
    tier,
    name: tier === 'elite' ? `Elite ${creature.name}` : `Weak ${creature.name}`,
    statblock: out,
    derivation,
    notes,
  };
}
