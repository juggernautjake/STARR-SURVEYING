// derive-ac.ts — compute Armor Class from equipped inventory items (DND_ITEM_BUILDER, Slice 5).
// Pure + testable. Reads the live InvItem model (not the dormant engine's EquipItem shape):
//   • equipped body armor sets the base — light = base + DEX, medium = base + min(DEX, cap 2),
//     heavy = base (no DEX). No equipped body armor → the character's manual AC is the base.
//   • an equipped shield adds its bonus.
//   • every equipped/attuned item's `ac`-add effects stack on top (e.g. Ring of Protection +1).
import type { InvItem, ActiveEffect } from '../types'

export interface AcResult {
  ac: number
  base: number
  shield: number
  effectBonus: number
  fromEquipment: boolean // true when equipped armor/shield/effects drive it (vs the manual value)
  source: string // human note, e.g. "Breastplate + Shield + Ring of Protection"
}

function acEffectBonus(items: InvItem[]): { bonus: number; sources: string[] } {
  let bonus = 0
  const sources: string[] = []
  for (const it of items) {
    // Active while equipped or attuned (the ItemBuilder's own "effects while equipped/attuned" rule).
    // NB: honor the `equipped` TAG too, not just the flag — the ledger's isEquipped does, so an item
    // equipped via tag was getting its STR bonus but not its AC bonus. (Whether attunement ALONE should
    // activate effects is a separate, contested question — the ledger uses equipped-only; left as-is.)
    if (!(it.equipped || it.tags?.includes('equipped') || it.attuned)) continue
    for (const e of it.effects ?? []) {
      if (e.target === 'ac' && e.operation === 'add' && typeof e.value === 'number') {
        bonus += e.value
        sources.push(e.source || it.name)
      }
    }
  }
  return { bonus, sources }
}

/** Compute AC from the inventory + any active temporary effects. `manualAc` is the
 *  character's hand-set / unarmored value, used as the base when no body armor is equipped. */
export function deriveAc(inventory: InvItem[] | undefined, dexMod: number, manualAc: number, activeEffects?: ActiveEffect[]): AcResult {
  const items = inventory ?? []
  const bodyArmor = items.find((i) => i.kind === 'armor' && i.equipped && i.armor)
  const shieldItem = items.find((i) => i.kind === 'shield' && i.equipped && i.armor)
  const itemEff = acEffectBonus(items)
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
    base = a.category === 'light' ? b + dexMod : a.category === 'medium' ? b + Math.min(dexMod, a.dexCap ?? 2) : b
    baseSource = bodyArmor.name
  }

  const shield = shieldItem?.armor ? shieldItem.armor.baseAC ?? 2 : 0
  const fromEquipment = !!bodyArmor || !!shieldItem || effectBonus !== 0
  const sourceParts = [baseSource, ...(shieldItem ? [shieldItem.name] : []), ...effectSources]
  return { ac: base + shield + effectBonus, base, shield, effectBonus, fromEquipment, source: sourceParts.join(' + ') }
}
