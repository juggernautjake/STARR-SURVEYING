// app/dnd/_sheet/engine/content.ts — custom/homebrew content → engine (Phase C19).
//
// The `dnd_content` library stores homebrew armor/weapons/items/feats/spells/…
// as { kind, name, rarity, requires_attunement, data:{ stats + effects[] } }.
// Because custom content is built from the SAME effect vocabulary (C13) and item
// specs (C14–C16), it plugs straight into the engine: an equippable content row
// converts to an EquipItem (armor/weapon/effects), and any content's granted
// effects feed the resolver. So a homebrew +2 axe or a +1-AC ring changes the
// exact same numbers a book item would.
import type { ArmorSpec, WeaponSpec, EquipItem } from './equipment';
import type { Effect } from './effects';

export type ContentKind =
  | 'armor'
  | 'weapon'
  | 'item'
  | 'magic_item'
  | 'feat'
  | 'feature'
  | 'spell'
  | 'ability'
  | 'attack';

export interface ContentData {
  weight?: number;
  armor?: ArmorSpec;
  weapon?: WeaponSpec;
  effects?: Effect[];
  [key: string]: unknown;
}

export interface ContentRow {
  id: string;
  kind: ContentKind;
  name: string;
  rarity?: string | null;
  requires_attunement?: boolean;
  data?: ContentData;
}

const EQUIPPABLE: ContentKind[] = ['armor', 'weapon', 'item', 'magic_item'];

export function isEquippable(kind: ContentKind): boolean {
  return EQUIPPABLE.includes(kind);
}

/** The effects a content row grants (for feats/features/spells applied to a character,
 *  or as an item's own effects). */
export function contentEffects(content: ContentRow): Effect[] {
  return content.data?.effects ?? [];
}

/**
 * Convert an equippable content row into an inventory EquipItem instance. `instanceId`
 * makes each drop independent (defaults to the content id). Non-equippable kinds
 * (feat/feature/spell/ability/attack) are not inventory — use contentEffects for those.
 */
export function contentToEquipItem(
  content: ContentRow,
  opts: { instanceId?: string; qty?: number } = {},
): EquipItem {
  if (!isEquippable(content.kind)) {
    throw new Error(`Content "${content.name}" (${content.kind}) is not an equippable item.`);
  }
  const d = content.data ?? {};
  return {
    id: opts.instanceId ?? content.id,
    name: content.name,
    kind: content.kind as EquipItem['kind'],
    qty: opts.qty ?? 1,
    weight: d.weight,
    requiresAttunement: content.requires_attunement,
    armor: d.armor,
    weapon: d.weapon,
    effects: d.effects,
  };
}
