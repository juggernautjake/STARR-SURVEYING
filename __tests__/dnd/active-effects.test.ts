// __tests__/dnd/active-effects.test.ts — the Active Effects panel (Slice 12).
//
// The scenario, from the request: you drink a potion that makes you strong for 12 hours, forget to
// end it, come back next session strong and have no idea why. The panel is what makes that
// visible. These tests pin the properties that make it trustworthy.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, InvItem } from '@/app/dnd/_sheet/types';
import type { Effect } from '@/app/dnd/_sheet/engine/effects';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const PANEL = read('app/dnd/_sheet/components/ActiveEffects.tsx');
const APP = read('app/dnd/_sheet/App.tsx');
const CSS = read('app/dnd/_sheet/styles/theme.css');

function item(over: Partial<InvItem> & { name: string; effects: Effect[] }): InvItem {
  return { id: over.name.toLowerCase().replace(/\W+/g, '-'), desc: '', qty: 1, tags: [], equipped: true, ...over } as InvItem;
}

describe('the panel is a READ of the ledger, not a second derivation', () => {
  it('renders through the ledger and the shared describeEffect', () => {
    // It used to format effects with a local fmtEffect and hand-list equipped items. That is the
    // exact drift the ledger exists to prevent: two places computing "what is this doing to me"
    // WILL disagree, and the sheet cannot say which is right.
    expect(PANEL).toContain('ledger.byTarget');
    expect(PANEL).not.toMatch(/function fmtEffect/);
  });

  it('groups by SOURCE — the question is "what is doing things to me"', () => {
    expect(PANEL).toMatch(/sourceKind/);
    expect(PANEL).toMatch(/contributions/);
  });
});

describe('it is on every template', () => {
  it('mounts above the tabs, not inside one', () => {
    // A tab-scoped panel is invisible from the other ten tabs — including the ones where the
    // surprising number is showing.
    expect(APP).toContain('<ActiveEffects />');
    const i = APP.indexOf('<ActiveEffects />');
    const tabpane = APP.indexOf('<div className="tabpane"');
    expect(i, 'must render before the tab panes').toBeLessThan(tabpane);
  });
});

describe('the empty state is stated, not hidden', () => {
  it('renders a message rather than returning null', () => {
    // A panel that vanishes when empty trains you not to look for it — and "is anything on me?"
    // is exactly the question it answers. Absence is a fact worth showing.
    expect(PANEL).not.toMatch(/return null/);
    expect(PANEL).toMatch(/Nothing is modifying/);
  });
});

describe('ending an effect removes its CAUSE', () => {
  it('unequips a worn item rather than "switching it off"', () => {
    // "Worn but off" is unrepresentable — pretending otherwise would make the sheet lie about
    // its own state.
    expect(PANEL).toMatch(/kind === 'item' \|\| row\.kind === 'attuned'/);
    expect(PANEL).toMatch(/equipped: false/);
  });

  it('drops a consumed effect without resurrecting the item', () => {
    // The potion was consumed when it was drunk; the effect outlives it.
    expect(PANEL).toMatch(/removeActiveEffect\(row\.id\)/);
  });

  it('offers no "end" for a class feature', () => {
    // A feature is not something you end — it is what the character IS.
    expect(PANEL).toMatch(/feature:\s*\{[^}]*end:\s*''/);
  });
});

describe('a suppressed contribution is shown, never hidden', () => {
  it('the panel renders an overridden marker', () => {
    // "My belt says +2 but my STR didn't move" is the confusion this panel exists to end, so a
    // contribution that lost must still be listed — saying it is doing nothing.
    expect(PANEL).toMatch(/suppressed/);
    expect(PANEL).toMatch(/overridden/);
    expect(CSS).toMatch(/\.ae-off-tag/);
  });

  it('the ledger actually reports the suppression the panel renders', () => {
    const c = blankCharacter('T');
    c.abilities = { ...c.abilities, str: 16 };
    c.inventory = [
      item({ name: 'Storm Giant Strength', effects: [{ target: 'ability_str', operation: 'set', value: 29 }] }),
      item({ name: 'Hill Giant Strength', effects: [{ target: 'ability_str', operation: 'set', value: 21 }] }),
    ];
    const led = buildLedger(c);
    const rows = led.explain('ability_str');
    expect(rows.find((r) => r.source === 'Hill Giant Strength')?.suppressed).toBe(true);
    expect(led.value('ability_str')).toBe(29);
  });
});

describe('durations are shown, never simulated', () => {
  it('says durations do not expire on their own', () => {
    // A table aid, not a simulation: the DM decides when time passes. Auto-expiring would make
    // the sheet wrong in the other direction, and silently.
    expect(PANEL).toMatch(/never run out on their own/);
    expect(PANEL).not.toMatch(/setInterval|setTimeout/);
  });

  it('surfaces an effect that outlived its item', () => {
    // The potion is long gone from the inventory; the panel must still explain the buff.
    const c = blankCharacter('T') as Character;
    c.activeEffects = [{
      id: 'p1', label: 'Potion of Storm Giant Strength', duration: '1 hour', source: 'Potion',
      effects: [{ target: 'ability_str', operation: 'set', value: 29 }],
    }];
    c.inventory = []; // consumed
    const led = buildLedger(c);
    expect(led.sources.map((s) => s.name)).toContain('Potion of Storm Giant Strength');
    expect(led.value('ability_str')).toBe(29);
  });
});

describe('styling is theme-token driven', () => {
  it('the panel CSS hardcodes no colour', () => {
    // It renders on every skin; a literal here breaks the light ones.
    const i = CSS.indexOf('.dnd-sheet .ae-row {');
    expect(i).toBeGreaterThan(-1);
    const block = CSS.slice(i, CSS.indexOf('}', i));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(block).toMatch(/var\(--line\)/);
  });
});
