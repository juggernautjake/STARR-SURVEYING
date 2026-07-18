// lib/dnd/equip-conflicts.ts — Phase 2, Area E1a. Equip-slot conflict detection on the LIVE sheet inventory
// (InvItem), plus the swap that resolves one. Pure + immutable, so the conflict dialog (E1b) is all
// presentation: it calls equipConflicts to build the choices, then resolveEquipSwap to apply the picked one.
//
// The rules enforced (5e): one body armor worn at a time · one shield · a two-handed weapon and a shield
// can't be held together. `equipLimits: off` (a preference) means the caller skips this entirely.

/** The subset of an inventory item this module needs — kept structural so it accepts the sheet's InvItem
 *  without importing the full sheet types (and so tests can pass minimal fixtures). */
export interface EquipConflictItem {
  id: string;
  name?: string;
  kind?: string; // 'weapon' | 'armor' | 'shield' | 'consumable' | 'wondrous' | 'gear'
  equipped?: boolean;
  weapon?: { properties?: string[] } | null;
  armor?: { category?: string } | null;
}

const isShield = (it: EquipConflictItem): boolean => it.kind === 'shield' || it.armor?.category === 'shield';
const isBodyArmor = (it: EquipConflictItem): boolean => it.kind === 'armor' && it.armor?.category !== 'shield';
const isTwoHanded = (it: EquipConflictItem): boolean =>
  it.kind === 'weapon' && !!it.weapon?.properties?.includes('two-handed');

/** How many of your two hands an item occupies: a two-handed weapon needs both, any other weapon or a shield
 *  needs one, everything else (body armor, worn gear) needs none. */
const handCost = (it: EquipConflictItem): number => {
  if (isTwoHanded(it)) return 2;
  if (it.kind === 'weapon') return 1;
  if (isShield(it)) return 1;
  return 0;
};

const label = (it: EquipConflictItem): string => (it.name && it.name.trim()) || 'that item';

/** One currently-equipped item that blocks equipping the target, with a plain-language reason the dialog
 *  shows on its swap button. */
export interface EquipConflict {
  id: string;
  name: string;
  reason: string;
}

/**
 * The currently-equipped items that would conflict with equipping `id`. Empty ⇒ equipping is free (no dialog
 * needed). Re-equipping something already on, or an unknown id, yields no conflicts.
 */
export function equipConflicts(items: EquipConflictItem[], id: string): EquipConflict[] {
  const target = items.find((i) => i.id === id);
  if (!target || target.equipped) return [];
  const others = items.filter((x) => x.equipped && x.id !== id);
  const out: EquipConflict[] = [];

  // One body armor worn at a time.
  if (isBodyArmor(target)) {
    for (const o of others) {
      if (isBodyArmor(o)) out.push({ id: o.id, name: label(o), reason: `You're already wearing ${label(o)} as body armor.` });
    }
  }
  // One shield at a time (independent of the hand count — you don't dual-wield shields).
  if (isShield(target)) {
    for (const o of others) {
      if (isShield(o)) out.push({ id: o.id, name: label(o), reason: `You're already using ${label(o)} as a shield.` });
    }
  }
  // Hands: a weapon or shield occupies hands; a two-handed weapon takes both. If equipping the target would
  // need more than two hands, every equipped hand-item is a candidate to free up — the dialog lets the player
  // pick which one(s) to unequip (the owner's sword+shield → equip a two-handed axe case yields both).
  const cost = handCost(target);
  if (cost > 0) {
    const handItems = others.filter((o) => handCost(o) > 0);
    const used = handItems.reduce((s, o) => s + handCost(o), 0);
    if (used + cost > 2) {
      for (const o of handItems) {
        const reason = isTwoHanded(target)
          ? `${label(target)} needs both hands — you're holding ${label(o)}.`
          : isTwoHanded(o)
            ? `You can't hold ${label(target)} while wielding ${label(o)} (two-handed).`
            : `Both hands are full — you're holding ${label(o)}.`;
        out.push({ id: o.id, name: label(o), reason });
      }
    }
  }
  // De-dupe (a shield can match both the one-shield rule and the hands rule).
  return out.filter((c, i) => out.findIndex((d) => d.id === c.id) === i);
}

/**
 * How many hands must be freed to equip `id` (0 ⇒ it fits already). The dialog uses this to know whether
 * unequipping a SINGLE chosen conflictor is enough (dual-wield: free 1) or ALL of them are required
 * (a two-handed weapon over a sword+shield: free 2).
 */
export function handsToFree(items: EquipConflictItem[], id: string): number {
  const target = items.find((i) => i.id === id);
  if (!target || target.equipped) return 0;
  const cost = handCost(target);
  if (cost === 0) return 0;
  const used = items
    .filter((x) => x.equipped && x.id !== id)
    .reduce((s, o) => s + handCost(o), 0);
  return Math.max(0, used + cost - 2);
}

/**
 * Apply a swap: unequip each id in `unequipIds`, then equip the target `id`. Pure — returns a new array,
 * inputs untouched. Passing an empty `unequipIds` simply equips the target (used when there was no conflict,
 * or `equipLimits: off`).
 */
export function resolveEquipSwap<T extends EquipConflictItem>(items: T[], id: string, unequipIds: string[]): T[] {
  const drop = new Set(unequipIds);
  return items.map((it) => {
    if (it.id === id) return { ...it, equipped: true };
    if (drop.has(it.id)) return { ...it, equipped: false };
    return it;
  });
}
