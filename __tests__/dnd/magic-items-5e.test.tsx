// __tests__/dnd/magic-items-5e.test.tsx — the SRD magic-item catalogue and the door to it (P8-2).
//
// The interesting failures here are not "is the list long enough". They are the three places where the
// source data has a shape that a reasonable import would flatten, plus the one encoding on the sheet that
// is invisible and load-bearing:
//
//   · rarity is not always one of the six ladder values;
//   · `requires_attunement` is free text carrying a RULE, not a boolean;
//   · `type` is a category and a restriction in one string;
//   · `InvItem.attuned` signals "requires attunement" BY BEING PRESENT — `undefined` vs `false` is the
//     difference between a Potion of Healing and an Amulet of Health, and both typecheck.
//
// A licence test is included for the same reason the bestiary has one: the API serves 1,618 magic items
// and only 237 of them are ours to ship, so a catalogue that quietly grew would be a licence incident
// rather than a content win.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MAGIC_ITEMS_5E, MAGIC_ITEM_GAPS, MAGIC_ITEM_RARITIES, MAGIC_ITEM_CATEGORIES,
  parseMagicItemRarity, parseAttunement, parseMagicItemType,
  magicItemRarityLabel, magicItemBrief, searchMagicItems,
  magicItemsForSystem, magicItemSurfaceFor, magicItemToInvItem,
} from '@/lib/dnd/magic-items';
import MagicItemPicker from '@/app/dnd/_sheet/components/MagicItemPicker';

const byKey = (k: string) => {
  const m = MAGIC_ITEMS_5E.find((x) => x.key === k);
  if (!m) throw new Error(`fixture missing: ${k}`);
  return m;
};

describe('the catalogue is the SRD subset, and only that', () => {
  it('ships 237 items — the SRD count, not the API total', () => {
    // Open5e serves 1,618 across five documents; four of them belong to publishers whose terms do not
    // let us redistribute. If this number jumps, the licence allowlist has been widened.
    expect(MAGIC_ITEMS_5E.length).toBe(237);
    expect(MAGIC_ITEM_GAPS.count).toBe(MAGIC_ITEMS_5E.length);
  });

  it('every row states its own licence and source rather than inheriting one from a comment', () => {
    for (const m of MAGIC_ITEMS_5E) {
      expect(m.licence).toBe('CC-BY-4.0');
      expect(m.source).toBe('SRD 5.1');
    }
  });

  it('every row has a key, a name and real rules text', () => {
    for (const m of MAGIC_ITEMS_5E) {
      expect(m.key).toMatch(/^[a-z0-9-]+$/);
      expect(m.name.trim().length).toBeGreaterThan(0);
      expect(m.description.trim().length).toBeGreaterThan(20);
    }
  });

  it('keys are unique', () => {
    expect(new Set(MAGIC_ITEMS_5E.map((m) => m.key)).size).toBe(MAGIC_ITEMS_5E.length);
  });

  it('every category is one of the nine the SRD itself uses', () => {
    for (const m of MAGIC_ITEMS_5E) expect(MAGIC_ITEM_CATEGORIES).toContain(m.category);
  });

  it('names what it does NOT have, so an absent item reads as “not catalogued”', () => {
    expect(MAGIC_ITEM_GAPS.notes.length).toBeGreaterThanOrEqual(3);
    expect(MAGIC_ITEM_GAPS.notes.join(' ')).toMatch(/Dungeon Master|CC-BY|redistribut/i);
  });
});

describe('trap 1 — rarity is not always one of the six', () => {
  it('a single ladder value becomes `rarity`', () => {
    expect(parseMagicItemRarity('very rare')).toEqual({ rarity: 'very rare' });
    expect(parseMagicItemRarity('Legendary')).toEqual({ rarity: 'legendary' });
  });

  it('a range or a condition is KEPT WHOLE as `rarityNote`, never flattened', () => {
    // "pick the first rarity mentioned" would call this one "uncommon", which is true of a third of it.
    expect(parseMagicItemRarity('uncommon (+1), rare (+2), or very rare (+3)'))
      .toEqual({ rarityNote: 'uncommon (+1), rare (+2), or very rare (+3)' });
    expect(parseMagicItemRarity('rarity by figurine')).toEqual({ rarityNote: 'rarity by figurine' });
    expect(parseMagicItemRarity('varies')).toEqual({ rarityNote: 'varies' });
  });

  it('exactly one of rarity / rarityNote is ever set on a catalogued item', () => {
    for (const m of MAGIC_ITEMS_5E) {
      expect(!!m.rarity && !!m.rarityNote).toBe(false);
      if (m.rarity) expect(MAGIC_ITEM_RARITIES).toContain(m.rarity);
    }
  });

  it('the real catalogue actually contains both shapes — otherwise this is untested in practice', () => {
    expect(MAGIC_ITEMS_5E.some((m) => m.rarity)).toBe(true);
    expect(MAGIC_ITEMS_5E.some((m) => m.rarityNote)).toBe(true);
  });

  it('one label function, so a picker and a sheet cannot disagree', () => {
    expect(magicItemRarityLabel({ rarity: 'rare' })).toBe('rare');
    expect(magicItemRarityLabel({ rarityNote: 'varies' })).toBe('varies');
    expect(magicItemRarityLabel({})).toBe('—');
  });
});

describe('trap 2 — requires_attunement is a rule, not a boolean', () => {
  it('empty means no attunement', () => {
    expect(parseAttunement('')).toEqual({ attunement: false });
    expect(parseAttunement(null)).toEqual({ attunement: false });
  });

  it('bare “requires attunement” is attunement with no restriction', () => {
    expect(parseAttunement('requires attunement')).toEqual({ attunement: true });
  });

  it('THE RESTRICTION IS KEPT — it is the half a player can fail to satisfy', () => {
    expect(parseAttunement('requires attunement by a druid')).toEqual({ attunement: true, attunementNote: 'by a druid' });
    expect(parseAttunement('requires attunement by a creature of evil alignment'))
      .toEqual({ attunement: true, attunementNote: 'by a creature of evil alignment' });
  });

  it('an unrecognised non-empty value still counts as attunement — the safe reading', () => {
    // Treating text we do not recognise as "no attunement" would let an item's effects apply for free.
    expect(parseAttunement('attunement required by a lich')).toEqual({ attunement: true, attunementNote: 'attunement required by a lich' });
  });

  it('a note is only ever present when attunement is true', () => {
    for (const m of MAGIC_ITEMS_5E) if (m.attunementNote) expect(m.attunement).toBe(true);
  });

  it('the catalogue really does carry restricted-attunement items', () => {
    expect(MAGIC_ITEMS_5E.some((m) => m.attunement && m.attunementNote)).toBe(true);
    expect(MAGIC_ITEMS_5E.some((m) => m.attunement && !m.attunementNote)).toBe(true);
    expect(MAGIC_ITEMS_5E.some((m) => !m.attunement)).toBe(true);
  });
});

describe('trap 3 — type is a category plus a restriction', () => {
  it('splits the parenthetical off', () => {
    expect(parseMagicItemType('Weapon (any axe or sword)')).toEqual({ category: 'weapon', appliesTo: 'any axe or sword' });
    expect(parseMagicItemType('Armor (medium or heavy)')).toEqual({ category: 'armor', appliesTo: 'medium or heavy' });
  });

  it('a bare category has no appliesTo rather than an empty string', () => {
    expect(parseMagicItemType('Wondrous item')).toEqual({ category: 'wondrous item' });
  });

  it('AN UNKNOWN CATEGORY IS REFUSED, not defaulted to “wondrous item”', () => {
    // A silent default files a mis-parsed row under the catch-all, where nobody notices it was
    // mis-parsed. The importer refuses by name instead, so a source-format change is visible.
    expect(parseMagicItemType('Vehicle (land)')).toBeNull();
    expect(parseMagicItemType('')).toBeNull();
  });
});

describe('trap 4 — attunement on a sheet is encoded BY PRESENCE', () => {
  // `lib/dnd/effects/ledger.ts`: `const needsAttunement = i.attuned !== undefined`.
  // So undefined = no attunement, false = needs it, true = attuned. All three typecheck; two are wrong
  // for any given item, and neither wrong one throws.
  it('an item that needs attunement arrives with `attuned` PRESENT and false', () => {
    const inv = magicItemToInvItem(byKey('amulet-of-health'));
    expect(Object.prototype.hasOwnProperty.call(inv, 'attuned')).toBe(true);
    expect(inv.attuned).toBe(false);
  });

  it('an item that does not need attunement arrives with `attuned` ABSENT, not false', () => {
    const potion = MAGIC_ITEMS_5E.find((m) => !m.attunement)!;
    const inv = magicItemToInvItem(potion);
    expect(Object.prototype.hasOwnProperty.call(inv, 'attuned')).toBe(false);
  });

  it('nothing is imported already attuned — attunement is a player action with a cap of three', () => {
    for (const m of MAGIC_ITEMS_5E) expect(magicItemToInvItem(m).attuned).not.toBe(true);
  });
});

describe('a catalogue entry becomes an editable inventory item', () => {
  it('carries the rules text across VERBATIM', () => {
    const src = byKey('amulet-of-health');
    expect(magicItemToInvItem(src).desc).toBe(src.description);
  });

  it('INVENTS NO EFFECTS — the numbers stay the player’s to author', () => {
    // The Amulet of Health says "your Constitution score is 19". Parsing that into a `set` effect is a
    // guess that changes a character's stats silently if it is wrong.
    for (const m of MAGIC_ITEMS_5E.slice(0, 60)) {
      const inv = magicItemToInvItem(m);
      expect(inv.effects ?? []).toHaveLength(0);
      expect(inv.weapon).toBeUndefined();
      expect(inv.armor).toBeUndefined();
    }
  });

  it('maps categories onto the sheet’s kinds, with shields split out of armour', () => {
    expect(magicItemToInvItem(byKey('animated-shield')).kind).toBe('shield');
    expect(magicItemToInvItem(byKey('adamantine-armor')).kind).toBe('armor');
    expect(magicItemToInvItem(byKey('amulet-of-health')).kind).toBe('wondrous');
    const potion = MAGIC_ITEMS_5E.find((m) => m.category === 'potion')!;
    expect(magicItemToInvItem(potion).kind).toBe('consumable');
    const weapon = MAGIC_ITEMS_5E.find((m) => m.category === 'weapon')!;
    expect(magicItemToInvItem(weapon).kind).toBe('weapon');
  });

  it('the `weapon` WIRING tag is applied only to weapons', () => {
    // `weapon` is not a label — it puts the row in the Attacks table. A wondrous item carrying it would
    // appear as an attack with no damage.
    const weapon = MAGIC_ITEMS_5E.find((m) => m.category === 'weapon')!;
    expect(magicItemToInvItem(weapon).tags).toContain('weapon');
    expect(magicItemToInvItem(byKey('amulet-of-health')).tags).not.toContain('weapon');
    expect(magicItemToInvItem(byKey('amulet-of-health')).tags).toContain('magic');
  });

  it('every catalogued item converts without throwing and lands on a real kind', () => {
    const kinds = new Set(['weapon', 'armor', 'shield', 'consumable', 'wondrous', 'gear']);
    for (const m of MAGIC_ITEMS_5E) {
      const inv = magicItemToInvItem(m);
      expect(kinds.has(inv.kind!)).toBe(true);
      expect(inv.qty).toBe(1);
      expect(inv.name).toBe(m.name);
    }
  });
});

describe('per-system surface — PF2 and IG are ANSWERED, not emptied', () => {
  it('both 5e editions share the SRD catalogue', () => {
    expect(magicItemsForSystem('dnd5e-2014').length).toBe(237);
    expect(magicItemsForSystem('dnd5e-2024').length).toBe(237);
  });

  it('PF2 gets no catalogue, and is told its maths lives in runes', () => {
    expect(magicItemsForSystem('pathfinder2e')).toHaveLength(0);
    const s = magicItemSurfaceFor('pathfinder2e');
    expect(s.kind).toBe('runes');
    expect(s.note).toMatch(/rune/i);
  });

  it('IG is pointed at its published enchantments rather than shown an empty list', () => {
    expect(magicItemsForSystem('intuitive-games')).toHaveLength(0);
    expect(magicItemSurfaceFor('intuitive-games').kind).toBe('enchantments');
  });

  it('an unknown system says so rather than claiming a catalogue', () => {
    expect(magicItemSurfaceFor('blades-in-the-dark').kind).toBe('none');
  });
});

describe('search', () => {
  it('finds by name, by category and by rarity', () => {
    expect(searchMagicItems(MAGIC_ITEMS_5E, 'amulet').some((m) => m.key === 'amulet-of-health')).toBe(true);
    expect(searchMagicItems(MAGIC_ITEMS_5E, 'wand').every((m) => magicItemBrief(m).toLowerCase().includes('wand'))).toBe(true);
    expect(searchMagicItems(MAGIC_ITEMS_5E, 'legendary').length).toBeGreaterThan(0);
  });

  it('an empty query returns everything rather than nothing', () => {
    expect(searchMagicItems(MAGIC_ITEMS_5E, '   ')).toHaveLength(MAGIC_ITEMS_5E.length);
  });

  it('is case-insensitive', () => {
    expect(searchMagicItems(MAGIC_ITEMS_5E, 'AMULET').length).toBe(searchMagicItems(MAGIC_ITEMS_5E, 'amulet').length);
  });
});

describe('the picker is a reachable door, not just a module', () => {
  // "Authored but not wired" is this repo's most common defect, so the door gets rendered rather than
  // grepped for.
  const html = renderToStaticMarkup(<MagicItemPicker onPick={() => {}} />);

  it('renders collapsed, naming how many items are behind it', () => {
    expect(html).toContain('Start from the SRD catalogue');
    expect(html).toContain('237 magic items');
  });

  it('says the catalogue is a STARTING POINT, since the builder underneath stays editable', () => {
    expect(html).toMatch(/editable/i);
  });

  it('is mounted in the item builder, and only when creating', () => {
    // On an edit it would be a "replace everything you typed" button above the fields it overwrites.
    const src = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'app/dnd/_sheet/components/ItemBuilder.tsx'), 'utf8');
    expect(src).toContain('<MagicItemPicker');
    expect(src).toMatch(/\{!initial && \(\s*<MagicItemPicker/);
  });
});
