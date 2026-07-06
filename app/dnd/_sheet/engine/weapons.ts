// app/dnd/_sheet/engine/weapons.ts — weapons → attack entries (Phase C16, §6.18).
//
// Equipping a weapon auto-generates an attack entry with the to-hit and damage
// computed from the character: ability (finesse → best of STR/DEX; ranged → DEX;
// else STR) + proficiency + the weapon's own bonus + general attack/damage effects.
// Versatile weapons switch dice two-handed. Per-weapon magic bonuses live on the
// WeaponSpec (attackBonus/damageBonus) so they scope to THAT weapon; ctx.effects is
// for GENERAL attack/damage bonuses that apply to every attack. (Character-specific
// conditional damage like Rage/Surge is layered at roll time — C18 / the sheet.)
import type { AbilityKey } from '../rules/dnd';
import type { EquipItem, WeaponSpec, WeaponProperty } from './equipment';
import { resolveNumeric, type Effect } from './effects';

export interface AttackContext {
  mods: Record<AbilityKey, number>;
  proficiencyBonus: number;
  proficientCategories?: ('simple' | 'martial')[];
  proficientWeapons?: string[];
  /** General attack/damage effects (targets 'attack', 'damage', 'attack_and_damage'). */
  effects?: Effect[];
  /** For versatile weapons: wield two-handed to use the larger die. */
  twoHanded?: boolean;
}

export interface AttackEntry {
  id: string;
  name: string;
  ability: AbilityKey;
  toHit: number;
  damageDice: string;
  damageType: string;
  damageMod: number;
  properties: WeaponProperty[];
  range?: { normal: number; long: number };
  mastery?: string;
  proficient: boolean;
}

function attackAbility(weapon: WeaponSpec, mods: Record<AbilityKey, number>): AbilityKey {
  const props = weapon.properties ?? [];
  if (props.includes('finesse')) return mods.dex >= mods.str ? 'dex' : 'str';
  if (props.includes('ammunition')) return 'dex'; // bows/crossbows
  return 'str';
}

/** Build the attack entry for a single weapon item. */
export function buildAttack(item: EquipItem & { weapon: WeaponSpec }, ctx: AttackContext): AttackEntry {
  const w = item.weapon;
  const props = w.properties ?? [];
  const ability = attackAbility(w, ctx.mods);
  const abilityMod = ctx.mods[ability];

  const proficient =
    (ctx.proficientCategories ?? []).includes(w.category) || (ctx.proficientWeapons ?? []).includes(item.name);

  const effects = ctx.effects ?? [];
  const atkFromEffects = resolveNumeric(effects, 'attack') + resolveNumeric(effects, 'attack_and_damage');
  const dmgFromEffects = resolveNumeric(effects, 'damage') + resolveNumeric(effects, 'attack_and_damage');

  const toHit = abilityMod + (proficient ? ctx.proficiencyBonus : 0) + (w.attackBonus ?? 0) + atkFromEffects;

  const useVersatile = ctx.twoHanded && props.includes('versatile') && !!w.versatileDamage;
  const damageDice = useVersatile ? (w.versatileDamage as string) : w.damage;
  const damageMod = abilityMod + (w.damageBonus ?? 0) + dmgFromEffects;

  return {
    id: item.id,
    name: item.name,
    ability,
    toHit,
    damageDice,
    damageType: w.damageType,
    damageMod,
    properties: props,
    range: w.range,
    mastery: w.mastery,
    proficient,
  };
}

/** Auto-generate attack entries for every equipped weapon in the inventory. */
export function attacksFromInventory(items: EquipItem[], ctx: AttackContext): AttackEntry[] {
  return items
    .filter((i): i is EquipItem & { weapon: WeaponSpec } => !!i.equipped && !!i.weapon)
    .map((i) => buildAttack(i, ctx));
}
