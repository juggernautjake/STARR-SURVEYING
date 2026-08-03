// lib/dnd/magic-items/index.ts — which system has a magic-item catalogue, and how one reaches a sheet.
//
// The dispatcher deliberately does NOT pretend every system has the same surface. 5e has a catalogue of
// named items; PF2 puts the same maths in RUNES (a +1 striking weapon is two runes, not an item name) and
// models them already; IG publishes Eldritch Jewel enchantments. Flattening those into one `MagicItem[]`
// would impose 5e's structure on two systems that chose a different one — the bleed the edition modules
// keep warning about. So the catalogue is 5e's, and the other two are ANSWERED rather than emptied:
// `magicItemSurfaceFor` says what a player should be looking at instead, and where it lives.
import type { InvItem, ItemKind } from '@/app/dnd/_sheet/types';
import type { MagicItem, MagicItemCategory } from './model';
import { MAGIC_ITEMS_5E, MAGIC_ITEM_GAPS } from './dnd5e';

export * from './model';
export { MAGIC_ITEMS_5E, MAGIC_ITEM_GAPS };

/** The catalogue for a system. Empty for PF2/IG — see `magicItemSurfaceFor` for why that is an answer
 *  rather than a gap. */
export function magicItemsForSystem(system: string): readonly MagicItem[] {
  return system === 'dnd5e-2014' || system === 'dnd5e-2024' ? MAGIC_ITEMS_5E : [];
}

export interface MagicItemSurface {
  kind: 'catalogue' | 'runes' | 'enchantments' | 'none';
  /** One sentence a UI can print where the picker would otherwise be. */
  note: string;
}

/** What this system's magic-item surface actually IS, so a picker that finds no catalogue can say
 *  something true instead of rendering an empty list. */
export function magicItemSurfaceFor(system: string): MagicItemSurface {
  if (system === 'dnd5e-2014' || system === 'dnd5e-2024') {
    return { kind: 'catalogue', note: `${MAGIC_ITEMS_5E.length} SRD magic items — pick one to start from, then edit anything.` };
  }
  if (system === 'pathfinder2e') {
    return {
      kind: 'runes',
      note: 'Pathfinder puts this maths in runes rather than in item names — a +1 striking weapon is two runes. Add them on the weapon and armour editors, where they already drive the numbers.',
    };
  }
  if (system === 'intuitive-games') {
    return {
      kind: 'enchantments',
      note: 'Intuitive Games publishes Eldritch Jewel enchantments rather than a magic-item table. They are in the rules library under Magic items.',
    };
  }
  return { kind: 'none', note: 'No magic-item catalogue is published for this system.' };
}

/** SRD category → the sheet's `ItemKind`. `armor (shield)` is the one row where the parenthetical decides
 *  the kind rather than describing it, because the sheet treats a shield as its own kind. */
function itemKindFor(category: MagicItemCategory, appliesTo?: string): ItemKind {
  if (category === 'armor') return /shield/i.test(appliesTo ?? '') ? 'shield' : 'armor';
  if (category === 'weapon') return 'weapon';
  if (category === 'potion' || category === 'scroll') return 'consumable';
  return 'wondrous';
}

const uid = () => `i-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/**
 * A catalogue entry → a new inventory item, ready for the item builder to edit.
 *
 * ATTUNEMENT IS ENCODED BY PRESENCE, NOT BY A FLAG, and this is the whole reason the adapter exists
 * rather than being three lines at the call site. `InvItem` has no `requiresAttunement` field — the
 * engine's separate `EquipItem` does, but the sheet's ledger reads
 *
 *     const needsAttunement = i.attuned !== undefined      // lib/dnd/effects/ledger.ts
 *
 * so `undefined` means "no attunement needed", `false` means "needs attunement, not yet attuned", and
 * `true` means attuned. Writing `attuned: false` on every imported item would tell the sheet that a
 * Potion of Healing requires attunement; omitting it on an Amulet of Health would let its effects apply
 * unattuned. Both look identical in the builder and neither would throw.
 *
 * NOTHING IS ATTUNED ON IMPORT. Attunement is a player action with a cap of three, so importing an item
 * pre-attuned would spend one of those silently.
 *
 * NO EFFECTS ARE INVENTED. `effects` is left empty and the rules text goes in `desc` verbatim — the
 * catalogue carries prose, and guessing a numeric effect from it would change a character's stats on a
 * parse. The builder's existing effect editor is where that is authored, by hand, deliberately.
 */
export function magicItemToInvItem(item: MagicItem, opts: { id?: string } = {}): InvItem {
  const kind = itemKindFor(item.category, item.appliesTo);
  const inv: InvItem = {
    id: opts.id ?? uid(),
    name: item.name,
    desc: item.description,
    qty: 1,
    // `weapon` is a WIRING tag (it puts the row in the Attacks table), so it is applied only for weapons —
    // see the note on `InvItem.tags`. `magic` is descriptive and safe on everything.
    tags: kind === 'weapon' ? ['weapon', 'magic'] : ['magic'],
    kind,
  };
  if (item.attunement) inv.attuned = false;   // present-but-false — see above
  return inv;
}
