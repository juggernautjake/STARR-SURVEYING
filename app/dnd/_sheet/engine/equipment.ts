// app/dnd/_sheet/engine/equipment.ts — equipment core (Phase C14, §6.18).
//
// The general (any-character) inventory model: equip/unequip, attunement (cap 3),
// weight & encumbrance, and currency. Items carry effects (C13) that apply while
// the item is active (equipped/attuned) — `collectItemEffects` resolves those
// item-relative conditions into a flat Effect[] the resolver can consume, so a
// worn item's bonuses feed straight into the derived numbers (AC etc., C15/C18).
// (This is the generalized model; Lazzuh's legacy themed inventory migrates onto
// it later — not this slice.)
import type { Effect } from './effects';

export type ItemKind = 'armor' | 'shield' | 'weapon' | 'ammunition' | 'item' | 'magic_item' | 'consumable';

export type ArmorType = 'light' | 'medium' | 'heavy' | 'shield';

export interface ArmorSpec {
  armorType: ArmorType;
  /** Body armor: the base AC. Shield: the AC bonus (e.g. 2). */
  baseAC: number;
  /** DEX contribution cap: light = uncapped (omit), medium = 2 (default), heavy = 0. */
  dexCap?: number | null;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
}

export type WeaponProperty =
  | 'finesse'
  | 'versatile'
  | 'two-handed'
  | 'thrown'
  | 'reach'
  | 'light'
  | 'heavy'
  | 'loading'
  | 'ammunition';

export interface WeaponSpec {
  category: 'simple' | 'martial';
  /** Damage dice, e.g. '1d8'. */
  damage: string;
  damageType: string;
  properties?: WeaponProperty[];
  /** Alternate dice when wielded two-handed (versatile weapons), e.g. '1d10'. */
  versatileDamage?: string;
  range?: { normal: number; long: number };
  mastery?: string;
  /** Intrinsic bonuses scoped to THIS weapon (e.g. a +1 weapon) — not global effects. */
  attackBonus?: number;
  damageBonus?: number;
}

export interface EquipItem {
  id: string;
  name: string;
  kind: ItemKind;
  qty: number;
  /** Weight in lb per unit. */
  weight?: number;
  equipped?: boolean;
  attuned?: boolean;
  requiresAttunement?: boolean;
  /** Armor/shield stats (drives computed AC — C15). */
  armor?: ArmorSpec;
  /** Weapon stats (auto-generates an attack entry — C16). */
  weapon?: WeaponSpec;
  /** Effects contributed while the item is active (equipped/attuned). */
  effects?: Effect[];
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export const ATTUNEMENT_CAP = 3;
const COIN_WEIGHT = 0.02; // 50 coins per pound

const setItem = (items: EquipItem[], id: string, patch: Partial<EquipItem>): EquipItem[] =>
  items.map((it) => (it.id === id ? { ...it, ...patch } : it));

export function equip(items: EquipItem[], id: string, on = true): EquipItem[] {
  return setItem(items, id, { equipped: on });
}
export const unequip = (items: EquipItem[], id: string): EquipItem[] => equip(items, id, false);

export function attunedCount(items: EquipItem[]): number {
  return items.filter((it) => it.attuned).length;
}

/** Whether `id` can be attuned right now (requires attunement, not already attuned, under the cap). */
export function canAttune(items: EquipItem[], id: string): { ok: boolean; reason?: string } {
  const it = items.find((i) => i.id === id);
  if (!it) return { ok: false, reason: 'No such item.' };
  if (!it.requiresAttunement) return { ok: false, reason: 'Item does not require attunement.' };
  if (it.attuned) return { ok: false, reason: 'Already attuned.' };
  if (attunedCount(items) >= ATTUNEMENT_CAP) return { ok: false, reason: `Attunement limit (${ATTUNEMENT_CAP}) reached.` };
  return { ok: true };
}

/** Attune if allowed (no-op otherwise — pair with canAttune for UI messaging). */
export function attune(items: EquipItem[], id: string): EquipItem[] {
  return canAttune(items, id).ok ? setItem(items, id, { attuned: true }) : items;
}
export const unattune = (items: EquipItem[], id: string): EquipItem[] => setItem(items, id, { attuned: false });

export const coinWeight = (c: Currency): number => (c.cp + c.sp + c.ep + c.gp + c.pp) * COIN_WEIGHT;
export const itemsWeight = (items: EquipItem[]): number =>
  items.reduce((sum, it) => sum + (it.weight ?? 0) * Math.max(0, it.qty), 0);
export const totalWeight = (items: EquipItem[], currency?: Currency): number =>
  itemsWeight(items) + (currency ? coinWeight(currency) : 0);

/** 2024 carrying capacity = STR × 15 (lb). */
export const carryingCapacity = (strScore: number): number => strScore * 15;

export type Encumbrance = 'none' | 'encumbered' | 'heavily' | 'over';
/** Variant encumbrance thresholds: STR×5 encumbered, STR×10 heavily, STR×15 over-capacity. */
export function encumbranceLevel(weight: number, strScore: number): Encumbrance {
  if (weight > strScore * 15) return 'over';
  if (weight > strScore * 10) return 'heavily';
  if (weight > strScore * 5) return 'encumbered';
  return 'none';
}

/** Total wealth expressed in gold pieces. */
export const totalGold = (c: Currency): number => c.pp * 10 + c.gp + c.ep * 0.5 + c.sp * 0.1 + c.cp * 0.01;

/**
 * Flatten the effects contributed by currently-active (equipped/attuned) items into
 * an Effect[] the resolver consumes. Item-relative conditions ('equipped'/'attuned')
 * are resolved here against the item's own state; other conditions (e.g. 'raging')
 * are preserved for the global context to filter later.
 */
export function collectItemEffects(items: EquipItem[]): Effect[] {
  const out: Effect[] = [];
  for (const it of items) {
    if (!it.equipped && !it.attuned) continue;
    for (const e of it.effects ?? []) {
      if (e.condition === 'equipped' && !it.equipped) continue;
      if (e.condition === 'attuned' && !it.attuned) continue;
      const condition = e.condition === 'equipped' || e.condition === 'attuned' ? undefined : e.condition;
      out.push({ ...e, condition, source: e.source ?? it.name });
    }
  }
  return out;
}
