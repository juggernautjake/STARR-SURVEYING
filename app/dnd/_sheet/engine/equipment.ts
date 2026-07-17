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

// ── Equip validation: the hard slot rules D&D shares ────────────────────────────────────────────
// A shield is `kind: 'shield'` or an armor entry whose armorType is 'shield'; body armour is any
// other armor. Two-handed weapons and shields fight over the off-hand. Where a system has no rule
// we return ok — this only enforces the universally-hard ones (Slice 10: "where a system has a hard
// rule, enforce it; where it doesn't, allow it and let the panel show the truth").
const isShieldItem = (x: EquipItem): boolean => x.kind === 'shield' || x.armor?.armorType === 'shield';
const isBodyArmorItem = (x: EquipItem): boolean => x.kind === 'armor' && x.armor?.armorType !== 'shield';
const isTwoHandedItem = (x: EquipItem): boolean => x.kind === 'weapon' && !!x.weapon?.properties?.includes('two-handed');

/** Whether `id` can be EQUIPPED right now, given what is already equipped. Enforces one body armour
 *  at a time, one shield, and two-handed-vs-shield mutual exclusion. Re-equipping something already on
 *  is a harmless no-op (ok). Pure — pair with `equip` (or `equipChecked`) for the UI. */
export function canEquip(items: EquipItem[], id: string): { ok: boolean; reason?: string } {
  const it = items.find((i) => i.id === id);
  if (!it) return { ok: false, reason: 'No such item.' };
  if (it.equipped) return { ok: true }; // already equipped — no slot conflict to create
  const others = items.filter((x) => x.equipped && x.id !== id);
  if (isBodyArmorItem(it) && others.some(isBodyArmorItem)) {
    return { ok: false, reason: 'Already wearing body armor — unequip it first.' };
  }
  if (isShieldItem(it)) {
    if (others.some(isShieldItem)) return { ok: false, reason: 'Already using a shield.' };
    if (others.some(isTwoHandedItem)) return { ok: false, reason: 'Cannot use a shield while wielding a two-handed weapon.' };
  }
  if (isTwoHandedItem(it) && others.some(isShieldItem)) {
    return { ok: false, reason: 'Cannot wield a two-handed weapon while using a shield.' };
  }
  return { ok: true };
}

/** Equip only if the slot rules allow it (no-op otherwise — pair with `canEquip` for UI messaging). */
export function equipChecked(items: EquipItem[], id: string): EquipItem[] {
  return canEquip(items, id).ok ? equip(items, id) : items;
}

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

/** The 5e size multiplier for carrying capacity / lifting: Tiny ×½, Small/Medium ×1, Large ×2, Huge ×4,
 *  Gargantuan ×8. Unknown/blank size defaults to ×1 (Medium). Case-insensitive; "Powerful Build" is
 *  modelled by the caller passing the one-size-larger value. This is what makes `size` mechanical, not
 *  cosmetic — a Large creature carries twice what its Strength alone would suggest. */
export function sizeCapacityMultiplier(size?: string | null): number {
  switch ((size ?? '').trim().toLowerCase()) {
    case 'tiny': return 0.5;
    case 'large': return 2;
    case 'huge': return 4;
    case 'gargantuan': return 8;
    default: return 1; // small / medium / unknown
  }
}

/** 2024 carrying capacity = STR × 15 (lb), scaled by the creature's size (Tiny ½ … Gargantuan ×8). */
export const carryingCapacity = (strScore: number, size?: string | null): number =>
  strScore * 15 * sizeCapacityMultiplier(size);

export type Encumbrance = 'none' | 'encumbered' | 'heavily' | 'over';
/** Variant encumbrance thresholds: STR×5 encumbered, STR×10 heavily, STR×15 over-capacity — each scaled
 *  by the size multiplier, so a Large character isn't "over" at a Medium character's weights. */
export function encumbranceLevel(weight: number, strScore: number, size?: string | null): Encumbrance {
  const m = sizeCapacityMultiplier(size);
  if (weight > strScore * 15 * m) return 'over';
  if (weight > strScore * 10 * m) return 'heavily';
  if (weight > strScore * 5 * m) return 'encumbered';
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
