// __tests__/dnd/currency-all-systems.test.ts — money works on every system (P1-2, audit C-3).
//
// WHAT THIS SLICE ACTUALLY FOUND. `lib/dnd/currency.ts` was built system-agnostic and has shipped
// `DEFAULT_CURRENCIES_PF2` and `DEFAULT_CURRENCIES_IG` all along, and the PF2 sheet already RENDERED a
// money row. But nothing on earth could write `pf2.currencies` or `ig.currencies` — no edit op, no builder
// field, no route. Both sheets rendered `defaultCurrencies(system)` and always would have. A display with
// no write path is decoration, not a feature, and it is the kind that reviews well: the row is right there
// on the sheet showing 0 gp.
//
// So the assertions that matter are the round-trips — write a coin, read it back — plus the drift guard
// against 5e's older inline implementation.
import { describe, it, expect } from 'vitest';
import { applyCurrencyEdit, matchCurrency, defaultCurrencies, type Currency } from '@/lib/dnd/currency';
import { applyPf2Edit, parsePf2Edit, PF2_EDIT_OPS } from '@/lib/dnd/systems/pathfinder2e/edit';
import { applyIgEdit, parseIgEdit, IG_EDIT_OPS } from '@/lib/dnd/systems/intuitive-games/edit';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { applySheetEdits } from '@/lib/dnd/sheet-edits';

const gp = (amount: number): Currency => ({ id: 'cur-gold', name: 'Gold', abbrev: 'gp', amount, rate: 100 });

describe('the shared purse helper', () => {
  it('adds a currency', () => {
    const out = applyCurrencyEdit([], { op: 'add_currency', name: 'Gold', abbrev: 'gp', amount: 12, rate: 100 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Gold', abbrev: 'gp', amount: 12, rate: 100 });
  });

  it('upserts by name rather than duplicating', () => {
    const once = applyCurrencyEdit([], { op: 'add_currency', name: 'Gold', amount: 5 });
    const twice = applyCurrencyEdit(once, { op: 'add_currency', name: 'gold', amount: 9 });
    expect(twice).toHaveLength(1);
    expect(twice[0].amount).toBe(9);
  });

  it('sets an existing coin, matched by name, abbrev or id', () => {
    const list = [gp(10)];
    for (const key of ['Gold', 'gp', 'cur-gold']) {
      expect(applyCurrencyEdit(list, { op: 'set_currency', currency: key, amount: 3 })[0].amount).toBe(3);
    }
  });

  it('refuses to invent a coin on set — "set my gold to 5" with no gold is a typo, not an instruction', () => {
    expect(applyCurrencyEdit([], { op: 'set_currency', currency: 'Gold', amount: 5 })).toEqual([]);
  });

  it('removes, and leaves the list alone when nothing matches', () => {
    expect(applyCurrencyEdit([gp(10)], { op: 'remove_currency', currency: 'gp' })).toEqual([]);
    expect(applyCurrencyEdit([gp(10)], { op: 'remove_currency', currency: 'Platinum' })).toHaveLength(1);
  });

  it('floors amounts at zero and refuses a rate of zero', () => {
    // A currency worth 0 base units would collapse every conversion in `exchangeRate`.
    expect(applyCurrencyEdit([], { op: 'add_currency', name: 'Gold', amount: -50 })[0].amount).toBe(0);
    expect(applyCurrencyEdit([], { op: 'add_currency', name: 'Gold', rate: 0 })[0].rate).toBe(1);
    expect(applyCurrencyEdit([gp(1)], { op: 'set_currency', currency: 'gp', rate: 0 })[0].rate).toBe(100);
  });

  it('never mutates the list it was given', () => {
    const list = [gp(10)];
    applyCurrencyEdit(list, { op: 'set_currency', currency: 'gp', amount: 999 });
    expect(list[0].amount).toBe(10);
  });

  it('matchCurrency is case-insensitive and ignores blanks', () => {
    expect(matchCurrency([gp(1)], 'GOLD')?.id).toBe('cur-gold');
    expect(matchCurrency([gp(1)], '   ')).toBeNull();
    expect(matchCurrency(undefined, 'gp')).toBeNull();
  });
});

describe('PF2 can hold money — the C-3 gap', () => {
  const base = blankPF2Character('Test');

  it('exposes the three ops', () => {
    for (const op of ['add_currency', 'set_currency', 'remove_currency']) {
      expect(PF2_EDIT_OPS as readonly string[]).toContain(op);
    }
  });

  it('round-trips a coin onto the sidecar', () => {
    // THE regression. Before P1-2 there was no op that could write this field at all.
    const withGold = applyPf2Edit(base, { op: 'add_currency', name: 'Gold', abbrev: 'gp', amount: 25, rate: 100 });
    expect(withGold.currencies).toHaveLength(1);
    expect(withGold.currencies![0].amount).toBe(25);

    const spent = applyPf2Edit(withGold, { op: 'set_currency', currency: 'gp', amount: 5 });
    expect(spent.currencies![0].amount).toBe(5);

    expect(applyPf2Edit(spent, { op: 'remove_currency', currency: 'gp' }).currencies).toEqual([]);
  });

  it('leaves the rest of the character untouched', () => {
    const out = applyPf2Edit(base, { op: 'add_currency', name: 'Gold', amount: 1 });
    expect(out.combat).toEqual(base.combat);
    expect(out.identity).toEqual(base.identity);
  });

  it('parses the ops with their fields intact', () => {
    // The per-op whitelist in `parsePf2Edit` is why this needs its own check: an op can pass the enum and
    // still arrive at the engine with every field stripped.
    const parsed = parsePf2Edit({ op: 'add_currency', name: 'Gold', abbrev: 'gp', amount: 7, rate: 100 });
    expect(parsed).toEqual({ edit: { op: 'add_currency', name: 'Gold', abbrev: 'gp', amount: 7, rate: 100 } });
    expect(parsePf2Edit({ op: 'set_currency', currency: 'gp', amount: 2 }))
      .toEqual({ edit: { op: 'set_currency', currency: 'gp', amount: 2 } });
  });

  it('rejects the ops when they name nothing', () => {
    expect(parsePf2Edit({ op: 'add_currency' })).toHaveProperty('error');
    expect(parsePf2Edit({ op: 'set_currency', amount: 5 })).toHaveProperty('error');
    expect(parsePf2Edit({ op: 'remove_currency' })).toHaveProperty('error');
  });
});

describe('IG can hold money too', () => {
  const base = blankIGCharacter('Test');

  it('exposes the three ops', () => {
    for (const op of ['add_currency', 'set_currency', 'remove_currency']) {
      expect(IG_EDIT_OPS as readonly string[]).toContain(op);
    }
  });

  it('round-trips a coin onto the sidecar', () => {
    const withCoin = applyIgEdit(base, { op: 'add_currency', name: 'Marks', abbrev: 'mk', amount: 40, rate: 1 });
    expect(withCoin.currencies).toHaveLength(1);
    expect(withCoin.currencies![0]).toMatchObject({ name: 'Marks', amount: 40 });
    expect(applyIgEdit(withCoin, { op: 'remove_currency', currency: 'mk' }).currencies).toEqual([]);
  });

  it('parses the ops with their fields intact', () => {
    expect(parseIgEdit({ op: 'add_currency', name: 'Marks', amount: 3 }))
      .toEqual({ edit: { op: 'add_currency', name: 'Marks', amount: 3 } });
    expect(parseIgEdit({ op: 'remove_currency' })).toHaveProperty('error');
  });

  it('and damage still has to be positive despite `amount` now allowing 0', () => {
    // The schema's `minimum` was relaxed to 0 so a purse can hold 0 coins. The "damage must be positive"
    // rule moved nowhere — it was always enforced in the parser, which is the better place for it.
    expect(parseIgEdit({ op: 'apply_damage', amount: 0 })).toHaveProperty('error');
    expect(parseIgEdit({ op: 'heal', amount: 0 })).toHaveProperty('error');
  });
});

describe('the shared helper agrees with 5e’s older inline implementation', () => {
  // 5e is deliberately NOT re-pointed at `applyCurrencyEdit` — that is a behaviour-preserving refactor of a
  // well-tested path and deserves its own slice. This is the guard that stops the two drifting in the
  // meantime: same inputs, same purse.
  const run5e = (edits: Parameters<typeof applySheetEdits>[1]) =>
    applySheetEdits({ currencies: [] } as never, edits).currencies ?? [];

  const strip = (list: Currency[]) => list.map(({ name, abbrev, amount, rate }) => ({ name, abbrev, amount, rate }));

  it('on add', () => {
    const edit = { op: 'add_currency' as const, name: 'Gold', abbrev: 'gp', amount: 12, rate: 100 };
    expect(strip(run5e([edit]))).toEqual(strip(applyCurrencyEdit([], edit)));
  });

  it('on add-then-set', () => {
    const edits = [
      { op: 'add_currency' as const, name: 'Gold', abbrev: 'gp', amount: 12, rate: 100 },
      { op: 'set_currency' as const, currency: 'gp', amount: 4 },
    ];
    const shared = edits.reduce<Currency[]>((acc, e) => applyCurrencyEdit(acc, e), []);
    expect(strip(run5e(edits))).toEqual(strip(shared));
  });

  it('on add-then-remove', () => {
    const edits = [
      { op: 'add_currency' as const, name: 'Gold', abbrev: 'gp', amount: 12, rate: 100 },
      { op: 'remove_currency' as const, currency: 'Gold' },
    ];
    const shared = edits.reduce<Currency[]>((acc, e) => applyCurrencyEdit(acc, e), []);
    expect(strip(run5e(edits))).toEqual(strip(shared));
    expect(shared).toEqual([]);
  });

  it('and both refuse to create a coin on set', () => {
    const edit = { op: 'set_currency' as const, currency: 'Gold', amount: 5 };
    expect(run5e([edit])).toEqual([]);
    expect(applyCurrencyEdit([], edit)).toEqual([]);
  });
});

describe('both sheets render a purse even before one is written', () => {
  it('each system has default coins to fall back on', () => {
    expect(defaultCurrencies('pathfinder2e').length).toBeGreaterThan(0);
    expect(defaultCurrencies('intuitive-games').length).toBeGreaterThan(0);
  });
});
