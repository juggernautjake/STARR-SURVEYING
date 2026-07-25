// __tests__/dnd/edit-flow-ui.test.tsx — server-render guards for the unified edit/build UI (EditFlow dialog,
// DraftSaveBanner, and the Edit/Branch affordances the VERSIONS picker grew). Same purpose as
// variant-browser.test.tsx: catch the "authored but not wired" / bad-prop class of bug that pure-logic tests
// miss, without a dev server or auth. (Live visual QA is still its own step.)
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
import EditFlow from '@/app/dnd/_ui/EditFlow';
import DraftSaveBanner from '@/app/dnd/_ui/DraftSaveBanner';
import VariantBrowser from '@/app/dnd/_ui/VariantBrowser';
import { buildVariantCards } from '@/lib/dnd/variant-view';
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

  it('hides Edit and + Variant for viewers without write access', () => {
    const cards = buildVariantCards(active, variants, { characterName: 'Gandalf' });
    const html = renderToStaticMarkup(
      <VariantBrowser characterId="c1" cards={cards} aiConfigured canWrite={false} transposeSystems={SYSTEMS} startOpen />,
    );
    expect(html).not.toContain('✎ Edit');
    expect(html).not.toContain('+ Variant');
  });
});
