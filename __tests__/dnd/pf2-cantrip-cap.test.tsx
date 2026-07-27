// __tests__/dnd/pf2-cantrip-cap.test.tsx — S7c enforcement, the half that can be aimed correctly.
//
// 5e's S7b established that AIMING the cap is the whole risk, and PF2 splits the same way:
//   · CANTRIPS are a known list for every caster, so the number bites at pick time → capped here.
//   · LEVELLED spells are not. A PREPARED caster's sheet list is the spellbook or the whole tradition,
//     both far larger than what is cast in a day, so capping the picker would refuse spells the class
//     plainly has. That cap belongs on the prepare step, as 5e put it on the prepared toggle.
//   · REDUCED casters (Magus, Summoner) stay uncapped, because their tables are genuinely not modelled —
//     inventing one is the bug this whole strand exists to undo.
//
// So this enforces exactly one number, and the tests below are mostly about what it must NOT do.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PF2BuildPicks from '@/app/dnd/_ui/PF2BuildPicks';
import { pf2SpellCountsFor } from '@/lib/dnd/systems/pathfinder2e/spell-counts';
import { PF2_ALL_SPELLS } from '@/lib/dnd/systems/pathfinder2e/data';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const noop = () => {};
const cantrips = PF2_ALL_SPELLS.filter((s) => s.rank === 0).map((s) => s.name);

const render = (props: Partial<React.ComponentProps<typeof PF2BuildPicks>> = {}) =>
  renderToStaticMarkup(
    <PF2BuildPicks
      kind="spell" className="Wizard" ancestry="Human" level={5} tradition="arcane"
      selected={[]} onToggle={noop} {...props}
    />,
  );

describe('the budget is stated before anything is picked', () => {
  it('shows Cantrips n/N up front, not only on refusal', () => {
    // S7b's finding, unchanged: a cap discovered by being refused reads as a bug; the same number shown
    // in advance reads as a rule.
    expect(render({ cantripLimit: 5 })).toContain('Cantrips 0/5');
  });

  it('counts what is already chosen', () => {
    expect(render({ cantripLimit: 5, selected: cantrips.slice(0, 2) })).toContain('Cantrips 2/5');
  });

  it('says nothing when the class has no modelled count', () => {
    // A reduced caster must not be shown a budget it does not have.
    expect(render()).not.toContain('Cantrips 0/');
  });

  it('names where the LEVELLED limit really lives, so its absence is not read as "unlimited"', () => {
    expect(render({ cantripLimit: 5 })).toContain('limited by your slots per rank');
  });
});

describe('an over-count caster is never broken', () => {
  it('reports the overage instead of hiding it', () => {
    const html = render({ cantripLimit: 2, selected: cantrips.slice(0, 4) });
    expect(html).toContain('Cantrips 4/2');
    expect(html).toContain('over this class’s number');
  });

  it('and can still DESELECT, because already-chosen entries are never blocked', () => {
    // `>=` with an `active` exemption, matching the feat cap. Nothing is ever silently removed — Q5's
    // recorded assumption ("grandfather and mark, never delete a player's content").
    const src = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2BuildPicks.tsx'), 'utf8');
    expect(src).toContain('!active && r.meta === \'cantrip\' && cantripsChosen >= cantripLimit');
  });
});

describe('the count is resolved against the catalog, not the visible rows', () => {
  it('does not drift as the search query filters the list', () => {
    // Counting rendered rows would make the budget depend on what the player typed. The component
    // resolves `selected` against PF2_ALL_SPELLS instead.
    const src = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2BuildPicks.tsx'), 'utf8');
    expect(src).toMatch(/PF2_ALL_SPELLS\.filter\(\(s\) => s\.rank === 0 && chosen\.has/);
  });
});

describe('the wiring uses the count SOURCE, and only when modelled', () => {
  const builder = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2CharacterBuilder.tsx'), 'utf8');

  it('reads pf2SpellCountsFor rather than re-deriving a number', () => {
    expect(builder).toContain('pf2SpellCountsFor(className, level)');
  });

  it('passes no cap at all when the table is unmodelled', () => {
    expect(builder).toContain('.modelled ? { cantripLimit:');
  });

  it('and the source agrees: a full caster has 5, a reduced one has none', () => {
    expect(pf2SpellCountsFor('Wizard', 5).cantrips).toBe(5);
    expect(pf2SpellCountsFor('Magus', 5).modelled).toBe(false);
  });
});

describe('feats are untouched', () => {
  it('the feat cap still uses the flat limit, not the cantrip one', () => {
    const html = renderToStaticMarkup(
      <PF2BuildPicks kind="feat" className="Fighter" ancestry="Human" level={5} selected={[]} onToggle={noop} limit={3} />,
    );
    expect(html).not.toContain('Cantrips');
  });
});
