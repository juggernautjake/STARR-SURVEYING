// Pathfinder 2e inventory and Bulk (P5-1, audit finding C-1).
//
// PF2 had NO inventory at all — no field on the model, no panel among its nine, no coins — while
// `data/equipment.ts` shipped the full weapon/armour/shield/rune/item catalogue to the rules library only.
// A PF2 character could not record that they were carrying a rope.
//
// Bulk is the reason this needed a real model rather than a weight number: it is a core mechanic with
// combat consequences, and its arithmetic has two traps (the ten-Light rounding, and the `>` boundary).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bulkOf, totalBulk, bulkLimit, bulkMaximum, bulkState, bulkPenalty, investedCount, INVESTED_LIMIT,
  normalizeInventory, formatBulk, type PF2Item,
} from '@/lib/dnd/systems/pathfinder2e/inventory';
import { defaultCurrencies } from '@/lib/dnd/currency';

const item = (over: Partial<PF2Item> = {}): PF2Item =>
  ({ id: 'i', name: 'Thing', quantity: 1, ...over });

describe('bulkOf reads the notation the books use', () => {
  it('numbers, L, and negligible', () => {
    expect(bulkOf(2)).toBe(2);
    expect(bulkOf('2')).toBe(2);
    expect(bulkOf('L')).toBe(0.1);
    expect(bulkOf('l')).toBe(0.1);
    expect(bulkOf('—')).toBe(0);
    expect(bulkOf('-')).toBe(0);
    expect(bulkOf('')).toBe(0);
    expect(bulkOf(undefined)).toBe(0);
  });

  it('and treats anything unparseable as negligible rather than throwing', () => {
    expect(bulkOf('heavy')).toBe(0);
    expect(bulkOf(NaN)).toBe(0);
  });
});

describe('totalBulk', () => {
  it('multiplies by quantity', () => {
    expect(totalBulk([item({ bulk: 2, quantity: 3 })])).toBe(6);
  });

  it('TEN LIGHT ITEMS MAKE EXACTLY 1 BULK', () => {
    // The trap: summing 0.1 ten times in floating point gives 0.9999999999999999, so a character with ten
    // torches would read 0.9 and be one rounding error away from the wrong encumbrance. Summing first and
    // rounding once is what makes this come out right.
    expect(totalBulk([item({ bulk: 'L', quantity: 10 })])).toBe(1);
    expect(totalBulk(Array.from({ length: 10 }, (_, i) => item({ id: `i${i}`, bulk: 'L' })))).toBe(1);
  });

  it('ignores a negative or missing quantity rather than subtracting Bulk', () => {
    expect(totalBulk([item({ bulk: 5, quantity: -3 })])).toBe(0);
  });

  it('is 0 for an empty pack', () => {
    expect(totalBulk([])).toBe(0);
  });
});

describe('limits', () => {
  it('is 5 + Str modifier, max 5 above that', () => {
    expect(bulkLimit(3)).toBe(8);
    expect(bulkMaximum(3)).toBe(13);
    expect(bulkLimit(-1)).toBe(4);
  });

  it('CARRYING EXACTLY YOUR LIMIT IS FINE', () => {
    // PF2 says you become encumbered carrying MORE than 5 + Str. A `>=` here would penalise a legal load,
    // and it is the kind of off-by-one nobody notices until a player argues about it mid-session.
    expect(bulkState(8, 3)).toBe('ok');
    expect(bulkState(8.1, 3)).toBe('encumbered');
  });

  it('overloaded is beyond limit + 5', () => {
    expect(bulkState(13, 3)).toBe('encumbered');
    expect(bulkState(13.1, 3)).toBe('overloaded');
  });
});

describe('penalties are returned as data, in the game’s own words', () => {
  it('nothing when unencumbered', () => {
    const p = bulkPenalty(4, 3);
    expect(p).toMatchObject({ state: 'ok', speedPenalty: 0, checkPenalty: 0, note: '' });
  });

  it('encumbered costs 10 feet and −1 to Str/Dex checks', () => {
    const p = bulkPenalty(9, 3);
    expect(p.speedPenalty).toBe(10);
    expect(p.checkPenalty).toBe(-1);
    expect(p.note).toMatch(/Speed drops by 10 feet/);
  });

  it('overloaded says you cannot move, and keeps the encumbered penalties', () => {
    const p = bulkPenalty(99, 3);
    expect(p.state).toBe('overloaded');
    expect(p.note).toMatch(/cannot move/);
    expect(p.speedPenalty).toBe(10);
  });
});

describe('investment', () => {
  it('counts invested items against PF2’s daily cap', () => {
    expect(investedCount([item({ invested: true }), item({ id: 'b' })])).toBe(1);
    expect(INVESTED_LIMIT).toBe(10);
  });
});

describe('normalizeInventory drops what it cannot trust', () => {
  it('keeps real rows', () => {
    const r = normalizeInventory([{ id: 'x', name: 'Rope', quantity: 2, bulk: 'L', location: 'stowed' }]);
    expect(r).toEqual([{ id: 'x', name: 'Rope', quantity: 2, bulk: 'L', location: 'stowed' }]);
  });

  it('drops a nameless row rather than inventing "Unnamed"', () => {
    // An invented line on an equipment list is a thing a player will act on.
    expect(normalizeInventory([{ name: '  ' }, { name: 'Rope' }])).toHaveLength(1);
  });

  it('defaults a bad quantity to 1 and generates a missing id', () => {
    const r = normalizeInventory([{ name: 'Rope', quantity: -4 }]);
    expect(r[0].quantity).toBe(1);
    expect(r[0].id).toBeTruthy();
  });

  it('drops an unknown location instead of storing it', () => {
    expect(normalizeInventory([{ name: 'Rope', location: 'pocket' }])[0].location).toBeUndefined();
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'nope', 42, {}]) {
      expect(normalizeInventory(junk)).toEqual([]);
    }
  });
});

describe('formatBulk writes it the way the books do', () => {
  it('negligible, light, and numbers', () => {
    expect(formatBulk(0)).toBe('—');
    expect(formatBulk(0.1)).toBe('L');
    expect(formatBulk(0.3)).toBe('3L');
    expect(formatBulk(2)).toBe('2');
  });
});

describe('money reaches PF2 at last (audit C-3)', () => {
  it('the shared currency module already shipped PF2’s coins', () => {
    // It was built system-agnostic and simply never wired to anything but 5e.
    const c = defaultCurrencies('pathfinder2e');
    expect(c.length).toBeGreaterThan(0);
    expect(c.map((x) => x.abbrev)).toContain('gp');
  });
});

describe('the sheet actually shows it', () => {
  const panels = readFileSync(join(process.cwd(), 'app/dnd/_ui/pf2/usePf2Panels.tsx'), 'utf8');

  it('has an Equipment panel', () => {
    expect(panels).toContain("id: 'pf2-equipment'");
  });

  it('listed in the nav ALWAYS, not only when something is carried', () => {
    // A hidden Equipment section is how a player concludes PF2 has no inventory — which it did not, until
    // this slice.
    expect(panels).toMatch(/\{ id: 'pf2-equipment', label: 'Equipment' \}/);
  });

  it('reads the stored inventory defensively, so no migration is needed', () => {
    expect(panels).toContain('normalizeInventory(pf2.inventory)');
  });

  it('shows Bulk against the limit, and the penalty in words', () => {
    expect(panels).toContain('bulkLimit');
    expect(panels).toContain('bulkPenalty');
    expect(panels).toMatch(/penalty\.note/);
  });

  it('and shows money', () => {
    expect(panels).toContain('defaultCurrencies');
  });
});

describe('the item picker and in-place editing (P5-1b)', () => {
  const panels = readFileSync(join(process.cwd(), 'app/dnd/_ui/pf2/usePf2Panels.tsx'), 'utf8');
  const edit = readFileSync(join(process.cwd(), 'lib/dnd/systems/pathfinder2e/edit.ts'), 'utf8');

  it('adds gear from the CATALOGUE, carrying its real Bulk', () => {
    // The sheet's instruction was "add gear from the edit flow" — you left the sheet to record picking up a
    // rope. Choosing from `PF2_ITEMS` brings the item's real Bulk across, which is the number the
    // encumbrance line depends on; typing gear by hand is how a sheet ends up with a rope of unknown weight.
    expect(panels).toContain("from '@/lib/dnd/systems/pathfinder2e/data/equipment'");
    expect(panels).toMatch(/op: 'add_inventory_item', name: def\.name, quantity: 1, bulk: def\.bulk/);
  });

  it('edits quantity, location and invested in place', () => {
    // Before this, changing a quantity meant delete-and-retype, which silently discarded the notes and Bulk
    // already recorded against the item.
    expect(panels).toMatch(/op: 'update_inventory_item', name: it\.name, quantity:/);
    expect(panels).toMatch(/op: 'update_inventory_item', name: it\.name, location:/);
    expect(panels).toMatch(/op: 'update_inventory_item', name: it\.name, invested: !it\.invested/);
  });

  it('and the controls are gated on canEdit', () => {
    // Line-based rather than character-span or literal-newline matching: the comment block between the
    // guard and the control is long, and the file is CRLF — a `\n` in the needle matches nothing here.
    const lines = panels.split(/\r?\n/);
    const pickerLine = lines.findIndex((l) => l.includes('Add an item from the catalogue'));
    expect(pickerLine).toBeGreaterThan(-1);
    // The nearest preceding `canEdit &&` guard is the one wrapping it.
    const guardLine = lines.slice(0, pickerLine).map((l, i) => ({ l, i })).reverse().find((x) => x.l.includes('canEdit && ('))?.i ?? -1;
    expect(guardLine, 'the add-gear control must sit inside a canEdit guard').toBeGreaterThan(-1);
    expect(pickerLine - guardLine).toBeLessThan(12);
  });
});

describe('the update op itself', () => {
  const edit = readFileSync(join(process.cwd(), 'lib/dnd/systems/pathfinder2e/edit.ts'), 'utf8');

  it('is registered and handled', () => {
    expect(edit).toContain("'update_inventory_item'");
    expect(edit).toContain("case 'update_inventory_item': {");
  });

  it('treats quantity 0 as a real value, not "unset"', () => {
    // 0 is how you keep an item you have run out of. `if (edit.quantity)` would make it unsettable.
    expect(edit).toMatch(/edit\.quantity != null && Number\.isFinite\(edit\.quantity\)/);
  });

  it('and lets `invested` be turned OFF', () => {
    // A boolean checked for truthiness can only ever be set to true — un-investing would be impossible.
    expect(edit).toMatch(/edit\.invested != null \? \{ invested: edit\.invested \}/);
  });

  it('is a visible no-op when nothing matches, like remove', () => {
    expect(edit).toMatch(/if \(idx < 0\) return pf2;/);
  });

  it('THE PARSER now handles inventory ops at all', () => {
    // `parsePf2Edit` is a per-op whitelist, and inventory had NO branch: `add_inventory_item` passed the
    // enum check and reached the engine with every field except `op` stripped — a "Rope" with no quantity,
    // no Bulk and no location. Same shape as the currency ops in P1-2, found the same way.
    expect(edit).toMatch(/if \(op === 'add_inventory_item' \|\| op === 'update_inventory_item' \|\| op === 'remove_inventory_item'\)/);
    expect(edit).toMatch(/LOCATIONS\.includes\(location\)/);
    expect(edit).toMatch(/typeof o\.invested === 'boolean'/);
  });
});
