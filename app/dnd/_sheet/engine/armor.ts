// app/dnd/_sheet/engine/armor.ts — armor → computed AC (Phase C15, §6.18).
//
// AC is DERIVED, never hand-stored: worn body armor sets the base (with the
// light/medium/heavy DEX rules), an equipped shield adds its bonus, and every
// AC effect (magic items, features — C13/C14) stacks on top. Change the armor or
// attune a +1 item and the AC recomputes. Class Unarmored Defense (e.g. Barbarian
// 10+DEX+CON) is passed in as `unarmoredBaseAC` since only the caller knows CON.
import type { EquipItem, ArmorSpec } from './equipment';
import { resolveNumeric, type Effect } from './effects';

/** Base AC contributed by a piece of body armor, applying the DEX rules. */
export function armorBaseAC(armor: ArmorSpec, dexMod: number): number {
  switch (armor.armorType) {
    case 'light':
      return armor.baseAC + dexMod; // full DEX
    case 'medium':
      return armor.baseAC + Math.min(dexMod, armor.dexCap ?? 2); // DEX capped (default +2)
    case 'heavy':
      return armor.baseAC; // no DEX
    case 'shield':
      return armor.baseAC; // a bonus; combined separately
  }
}

export interface ComputeACInput {
  items: EquipItem[];
  dexMod: number;
  /** Already-active effects (e.g. equipment.collectItemEffects + feature effects). */
  effects?: Effect[];
  /** Class Unarmored Defense base (10 + DEX + …), used when no body armor is worn. */
  unarmoredBaseAC?: number;
}

export interface ACResult {
  ac: number;
  base: number;
  shield: number;
  stealthDisadvantage: boolean;
  source: string;
}

/** Compute total AC from worn armor + shield + AC effects. */
export function computeAC(input: ComputeACInput): ACResult {
  const { items, dexMod } = input;
  const body = items.find((i) => i.equipped && i.armor && i.armor.armorType !== 'shield');
  const shieldItem = items.find((i) => i.equipped && i.armor && i.armor.armorType === 'shield');

  let base: number;
  let source: string;
  if (body?.armor) {
    base = armorBaseAC(body.armor, dexMod);
    source = body.name;
  } else {
    const unarmored = 10 + dexMod;
    if (input.unarmoredBaseAC != null && input.unarmoredBaseAC > unarmored) {
      base = input.unarmoredBaseAC;
      source = 'Unarmored Defense';
    } else {
      base = unarmored;
      source = 'Unarmored';
    }
  }

  const shield = shieldItem?.armor ? shieldItem.armor.baseAC : 0;
  // resolveNumeric layers AC effects: max(base+shield, any set_base) + stacking adds.
  const ac = resolveNumeric(input.effects ?? [], 'ac', base + shield);
  const stealthDisadvantage = !!body?.armor?.stealthDisadvantage;

  return { ac, base, shield, stealthDisadvantage, source };
}
