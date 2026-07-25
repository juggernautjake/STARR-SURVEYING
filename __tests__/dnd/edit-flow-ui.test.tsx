// __tests__/dnd/edit-flow-ui.test.tsx — server-render guards for the unified edit/build UI (EditFlow dialog,
// DraftSaveBanner, and the Edit/Branch affordances the VERSIONS picker grew). Same purpose as
// variant-browser.test.tsx: catch the "authored but not wired" / bad-prop class of bug that pure-logic tests
// miss, without a dev server or auth. (Live visual QA is still its own step.)
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
import EditFlow, { TransposeReport } from '@/app/dnd/_ui/EditFlow';
import DraftSaveBanner from '@/app/dnd/_ui/DraftSaveBanner';
import VariantBrowser from '@/app/dnd/_ui/VariantBrowser';
import { buildVariantCards } from '@/lib/dnd/variant-view';
import { isSharedEngineSystem } from '@/lib/dnd/systems';
import type { ActiveSheet, SystemVariants } from '@/lib/dnd/system-variants';

const meta5e = (over: Record<string, unknown> = {}) => ({ meta: { name: 'Gandalf', level: 5, className: 'Wizard', species: 'Human', ...over } });
const SYSTEMS = [{ id: 'pathfinder2e', label: 'Pathfinder 2e' }, { id: 'intuitive-games', label: 'Intuitive Games' }];

describe('EditFlow dialog — the root decision', () => {
  it('offers "edit directly" and "transpose to another system", both described', () => {
    const html = renderToStaticMarkup(
      <EditFlow characterId="c1" slotId="dnd5e-2024" name="Gandalf" system="dnd5e-2024" systems={SYSTEMS} aiConfigured onClose={() => {}} />,
    );
    expect(html).toContain('Edit Gandalf');
    expect(html).toContain('Edit Gandalf directly');
    expect(html).toContain('Transpose to another system');
    // The save-time choice is explained up front, and transpose's always-a-variant rule is stated.
    expect(html).toContain('branch a new variant');
    expect(html).toContain('this version stays as it is');
  });

  it('disables transpose (with a reason) when no other system is available', () => {
    const html = renderToStaticMarkup(
      <EditFlow characterId="c1" slotId="s" name="Val" system="dnd5e-2024" systems={[]} aiConfigured onClose={() => {}} />,
    );
    expect(html).toContain('No other systems available');
    expect(html).toContain('disabled');
  });
});

describe('EditFlow — level up to match another version', () => {
  const TARGETS = [{ slotId: 'dnd5e-2024#2', name: 'Gandalf the White', level: 13, systemLabel: 'D&D 5e (2024)' }];

  it('offers the option, naming this version’s level, when a higher-level version exists', () => {
    const html = renderToStaticMarkup(
      <EditFlow characterId="c1" slotId="s" name="Gandalf" system="dnd5e-2024" systems={SYSTEMS} aiConfigured
        level={5} levelUpTargets={TARGETS} onClose={() => {}} />,
    );
    expect(html).toContain('Level up to match another version');
    expect(html).toContain('This version is level 5');
  });

  it('hides the option entirely when there is nothing higher to match', () => {
    const html = renderToStaticMarkup(
      <EditFlow characterId="c1" slotId="s" name="Gandalf" system="dnd5e-2024" systems={SYSTEMS} aiConfigured
        level={5} levelUpTargets={[]} onClose={() => {}} />,
    );
    expect(html).not.toContain('Level up to match');
  });

  it('disables it with a reason when AI is unavailable — the level-up is an AI build', () => {
    const html = renderToStaticMarkup(
      <EditFlow characterId="c1" slotId="s" name="Gandalf" system="dnd5e-2024" systems={SYSTEMS}
        aiConfigured={false} level={5} levelUpTargets={TARGETS} onClose={() => {}} />,
    );
    expect(html).toContain('Level up to match another version');
    expect(html).toContain('AI is not configured');
  });
});

describe('a vanilla-only campaign is still enforced after SystemSwitcher retired', () => {
  it('says so up front on the transpose choice — not two clicks later', () => {
    // The consent gate used to live in SystemSwitcher; retiring that panel must not lose the rule. Stating
    // it at the root step is also what stops the flow from dead-ending on a disabled last choice.
    const html = renderToStaticMarkup(
      <EditFlow characterId="c1" slotId="s" name="Gandalf" system="dnd5e-2024" systems={SYSTEMS} aiConfigured
        allowCustom={false} onClose={() => {}} />,
    );
    expect(html).toContain('This campaign is vanilla-only');
  });

  it('offers it normally when custom content is permitted', () => {
    const html = renderToStaticMarkup(
      <EditFlow characterId="c1" slotId="s" name="Gandalf" system="dnd5e-2024" systems={SYSTEMS} aiConfigured
        allowCustom onClose={() => {}} />,
    );
    expect(html).not.toContain('vanilla-only');
  });
});

describe('the level-up gate is ONE predicate, shared by the UI and the route', () => {
  it('accepts the shared 5e engine and rejects the bespoke-sidecar systems', () => {
    // PF2/IG keep their real sheet in data.pf2e / data.ig; an edit_sheet level-up would touch only their
    // blank 5e projection, so the route refuses — and the UI must hide the option on exactly those.
    expect(isSharedEngineSystem('dnd5e-2024')).toBe(true);
    expect(isSharedEngineSystem('dnd5e-2014')).toBe(true);
    expect(isSharedEngineSystem('ambiguous')).toBe(true);
    expect(isSharedEngineSystem('pathfinder2e')).toBe(false);
    expect(isSharedEngineSystem('intuitive-games')).toBe(false);
    // An unknown/blank system normalizes to ambiguous, which the route does allow.
    expect(isSharedEngineSystem(undefined)).toBe(true);
  });
});

describe('TransposeReport — what the AI actually built', () => {
  const full = {
    system: 'pathfinder2e',
    summary: 'Rebuilt as a PF2 Wizard at level 5.',
    hp: 42,
    custom: [{ type: 'feat', name: 'Grey Wanderer', note: 'no vanilla equivalent' }],
    violations: [{ field: 'abilities.int', severity: 'warning', message: 'Intelligence 20 is at the cap.' }],
  };

  it('NAMES every invented element — homebrew is flagged, not hidden', () => {
    const html = renderToStaticMarkup(<TransposeReport result={full} onOpen={() => {}} />);
    expect(html).toContain('1 custom element created');
    expect(html).toContain('Grey Wanderer');
    expect(html).toContain('feat');
    expect(html).toContain('no vanilla equivalent');
    expect(html).toContain('flagged as customized');
  });

  it('surfaces the rules issues the safety net caught', () => {
    const html = renderToStaticMarkup(<TransposeReport result={full} onOpen={() => {}} />);
    expect(html).toContain('1 rules issue to review');
    expect(html).toContain('Intelligence 20 is at the cap.');
    expect(html).toContain('warning');
  });

  it('reports the summary and the HP it landed on', () => {
    const html = renderToStaticMarkup(<TransposeReport result={full} onOpen={() => {}} />);
    expect(html).toContain('Rebuilt as a PF2 Wizard at level 5.');
    expect(html).toContain('42 HP');
  });

  it('pluralises, and omits the panels entirely when there is nothing to report', () => {
    const many = renderToStaticMarkup(
      <TransposeReport onOpen={() => {}} result={{ ...full, custom: [full.custom[0], { type: 'spell', name: 'Kindled Word' }], violations: [full.violations[0], { field: 'x', severity: 'error', message: 'Second issue.' }] }} />,
    );
    expect(many).toContain('2 custom elements created');
    expect(many).toContain('2 rules issues to review');

    const clean = renderToStaticMarkup(<TransposeReport result={{ system: 'pathfinder2e', summary: 'A clean vanilla rebuild.' }} onOpen={() => {}} />);
    expect(clean).not.toContain('custom element');
    expect(clean).not.toContain('to review');
    expect(clean).not.toContain('HP'); // no hp given → no fabricated HP line
    expect(clean).toContain('Open the new version'); // the way forward is always offered
  });
});

describe('DraftSaveBanner — where the edits land', () => {
  it('names the source version on all three commit choices', () => {
    const html = renderToStaticMarkup(<DraftSaveBanner characterId="c1" sourceName="Gandalf the Grey" />);
    expect(html).toContain('EDITING A DRAFT');
    expect(html).toContain('Save to Gandalf the Grey'); // overwrite the relative "original"
    expect(html).toContain('Save as new variant');      // branch instead
    expect(html).toContain('Discard');
    // The consequence of each is spelled out, not just labelled.
    expect(html).toContain('overwrites that version');
    expect(html).toContain('keeps Gandalf the Grey unchanged');
  });
});

describe('VERSIONS picker — Edit/Branch on every version', () => {
  const active: ActiveSheet = { system: 'dnd5e-2024', data: meta5e(), sheet_type: 'default', slotId: 'dnd5e-2024', kind: 'vanilla', artUrl: null };
  const variants: SystemVariants = {
    'dnd5e-2024#2': { data: meta5e({ name: 'Gandalf the White', level: 12 }), sheet_type: 'default', system: 'dnd5e-2024', kind: 'custom', parentSlotId: 'dnd5e-2024' },
  };

  it('renders an Edit button and a + Variant button on every card, not just the active one', () => {
    const cards = buildVariantCards(active, variants, { characterName: 'Gandalf' });
    const html = renderToStaticMarkup(
      <VariantBrowser characterId="c1" cards={cards} aiConfigured canWrite transposeSystems={SYSTEMS} startOpen />,
    );
    expect(cards).toHaveLength(2);
    expect(html.match(/✎ Edit/g) ?? []).toHaveLength(2);
    expect(html.match(/\+ Variant/g) ?? []).toHaveLength(2);
    // Branching is offered from each version by name (the relative "original").
    expect(html).toContain('Branch a new variant from Gandalf the White');
  });

  it('offers rename on every card — the last of switch/rename/delete to land here', () => {
    const cards = buildVariantCards(active, variants, { characterName: 'Gandalf' });
    const html = renderToStaticMarkup(
      <VariantBrowser characterId="c1" cards={cards} aiConfigured canWrite transposeSystems={SYSTEMS} startOpen />,
    );
    expect(html.match(/✎ Name/g) ?? []).toHaveLength(2);
    expect(html).toContain('Rename this version');
  });

  it('names the system ONCE, as a tag — not also as a line under the character', () => {
    const cards = buildVariantCards(active, variants, { characterName: 'Gandalf' });
    const html = renderToStaticMarkup(
      <VariantBrowser characterId="c1" cards={cards} aiConfigured canWrite transposeSystems={SYSTEMS} startOpen />,
    );
    // Two cards, both D&D 5e (2024) → exactly two mentions, the tags. A third would be the duplicate line.
    expect(html.match(/D&amp;D 5e \(2024\)/g) ?? []).toHaveLength(2);
  });

  it('hides Edit and + Variant for viewers without write access', () => {
    const cards = buildVariantCards(active, variants, { characterName: 'Gandalf' });
    const html = renderToStaticMarkup(
      <VariantBrowser characterId="c1" cards={cards} aiConfigured canWrite={false} transposeSystems={SYSTEMS} startOpen />,
    );
    expect(html).not.toContain('✎ Edit');
    expect(html).not.toContain('+ Variant');
  });
});
