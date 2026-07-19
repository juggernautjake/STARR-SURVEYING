// derive-ac.ts — compute Armor Class from equipped inventory items (DND_ITEM_BUILDER, Slice 5).
// Pure + testable. Reads the live InvItem model (not the dormant engine's EquipItem shape):
//   • equipped body armor sets the base — light = base + DEX, medium = base + min(DEX, cap 2),
//     heavy = base (no DEX). No equipped body armor → the character's manual AC is the base.
//   • an equipped shield adds its bonus.
//   • every equipped/attuned item's `ac`-add effects stack on top (e.g. Ring of Protection +1).
import type { InvItem, ActiveEffect, ArmorStats } from '../types'
import { isItemActive } from '@/lib/dnd/effects/ledger'

export interface AcResult {
  ac: number
  base: number
  shield: number
  effectBonus: number
  fromEquipment: boolean // true when equipped armor/shield/effects drive it (vs the manual value)
  source: string // human note, e.g. "Breastplate + Shield + Ring of Protection"
}

function acEffectBonus(items: InvItem[], autoAttune: boolean): { bonus: number; sources: string[] } {
  let bonus = 0
  const sources: string[] = []
  for (const it of items) {
    // Use the SAME activation rule as the effect ledger (isItemActive): equipped is always required, and
    // attunement is satisfied by the attuned flag OR the auto-attune preference. This closes the old
    // split-brain where AC counted an attuned-but-unequipped item's bonus while the ledger (HP/saves/etc.)
    // did not — a Ring of Protection now moves AC and every other stat under one rule.
    if (!isItemActive(it, autoAttune)) continue
    for (const e of it.effects ?? []) {
      if (e.target === 'ac' && e.operation === 'add' && typeof e.value === 'number') {
        bonus += e.value
        sources.push(e.source || it.name)
      }
    }
  }
  return { bonus, sources }
}

export type AbilityMods = Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>>

/** The ability bonus an armor contributes on top of its base AC.
 *
 *  The CATEGORY supplies the defaults — light adds full dex, medium adds dex capped
 *  at 2, heavy adds nothing — but an item may override both which ability it scales
 *  with (`modAbility`) and how much of it counts (`modCap`), which is what makes
 *  homebrew armor expressible. `dexCap` is the older field and is still honoured so
 *  items saved before this existed keep their behaviour. */
export function armorModBonus(a: ArmorStats, dexMod: number, abilityMods?: AbilityMods): number {
  const ability = a.modAbility ?? (a.category === 'heavy' ? 'none' : 'dex')
  if (ability === 'none') return 0
  const raw = ability === 'dex' ? (abilityMods?.dex ?? dexMod) : (abilityMods?.[ability] ?? 0)
  const cap = a.modCap ?? a.dexCap ?? (a.category === 'medium' ? 2 : null)
  return cap == null ? raw : Math.min(raw, cap)
}

/** Compute AC from the inventory + any active temporary effects. `manualAc` is the
 *  character's hand-set / unarmored value, used as the base when no body armor is equipped.
 *  `abilityMods` lets armor scale off an ability other than dex; without it only dex works. */
export function deriveAc(inventory: InvItem[] | undefined, dexMod: number, manualAc: number, activeEffects?: ActiveEffect[], autoAttune = true, abilityMods?: AbilityMods): AcResult {
  const items = inventory ?? []
  // "Worn" = equipped by the flag OR by the 'equipped' TAG — the SAME predicate the ledger's isEquipped
  // uses (and that acEffectBonus above already honors). Without this, a body armor equipped via the tag
  // (as the rest of the engine recognizes it) had its +ac EFFECTS counted but its ARMOR BASE ignored, so
  // the sheet showed the unarmored/manual AC instead of the armor's. Attuned-alone is NOT worn — you don't
  // gain armor AC from attuning without donning it (and the attuned-effects question is tracked separately).
  const isWorn = (i: InvItem) => i.equipped === true || i.tags?.includes('equipped') === true
  const bodyArmor = items.find((i) => i.kind === 'armor' && isWorn(i) && i.armor)
  const shieldItem = items.find((i) => i.kind === 'shield' && isWorn(i) && i.armor)
  const itemEff = acEffectBonus(items, autoAttune)
  // Active temporary effects (consumed buffs / DM boons) contribute their +ac too.
  let activeBonus = 0
  const activeSources: string[] = []
  for (const ae of activeEffects ?? []) {
    for (const e of ae.effects ?? []) {
      if (e.target === 'ac' && e.operation === 'add' && typeof e.value === 'number') { activeBonus += e.value; activeSources.push(ae.label) }
    }
  }
  const effectBonus = itemEff.bonus + activeBonus
  const effectSources = [...itemEff.sources, ...activeSources]

  let base = manualAc
  let baseSource = 'unarmored / manual'
  if (bodyArmor?.armor) {
    const a = bodyArmor.armor
    const b = a.baseAC ?? 10
    base = b + armorModBonus(a, dexMod, abilityMods)
    baseSource = bodyArmor.name
  }

  const shield = shieldItem?.armor ? shieldItem.armor.baseAC ?? 2 : 0
  const fromEquipment = !!bodyArmor || !!shieldItem || effectBonus !== 0
  const sourceParts = [baseSource, ...(shieldItem ? [shieldItem.name] : []), ...effectSources]
  return { ac: base + shield + effectBonus, base, shield, effectBonus, fromEquipment, source: sourceParts.join(' + ') }
}
