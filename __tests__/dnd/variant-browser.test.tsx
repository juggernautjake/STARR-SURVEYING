// __tests__/dnd/variant-browser.test.tsx — the VERSIONS picker component (VT) renders the server-computed
// card model end-to-end. A server-render (renderToStaticMarkup) guard: it catches the "authored but not
// wired" / bad-prop / missing-field class of bug that the pure-logic unit tests can't, without needing a dev
// server or auth. (Full visual/interaction QA is still a live-browser step.)
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The browser refreshes server props after an in-place delete, so it needs the app router.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
import VariantBrowser from '@/app/dnd/_ui/VariantBrowser';
import { buildVariantCards } from '@/lib/dnd/variant-view';
import { MAX_VARIANTS, type ActiveSheet, type SystemVariants } from '@/lib/dnd/system-variants';

const meta5e = (over: Record<string, unknown> = {}) => ({ meta: { name: 'Gandalf', level: 5, className: 'Wizard', species: 'Human', ...over } });

describe('VariantBrowser renders the version cards', () => {
  it('shows the dropdown, both versions, tags, level line, and the create-variant control', () => {
    const active: ActiveSheet = { system: 'dnd5e-2024', data: meta5e(), sheet_type: 'default', slotId: 'dnd5e-2024', kind: 'vanilla', artUrl: null };
    const variants: SystemVariants = {
      'dnd5e-2024#2': { data: meta5e({ name: 'Gandalf the Grey', level: 8 }), sheet_type: 'default', system: 'dnd5e-2024', kind: 'custom', parentSlotId: 'dnd5e-2024' },
    };
    const cards = buildVariantCards(active, variants, { characterName: 'Gandalf' });
    const html = renderToStaticMarkup(<VariantBrowser characterId="c1" cards={cards} aiConfigured={false} canWrite />);

    expect(html).toContain('VERSIONS //');
    // Both versions present, by their own names.
    expect(html).toContain('Gandalf');
    expect(html).toContain('Gandalf the Grey');
    // Lineage + provenance tags.
    expect(html).toContain('Original');
    expect(html).toContain('Variant');
    expect(html).toContain('Viewing');
    expect(html).toContain('Vanilla');
    expect(html).toContain('Custom');
    // The variant's level line + its "branched from" lineage note.
    expect(html).toContain('branched from Gandalf');
    expect(html).toMatch(/Lv\s*8|Wizard/);
    // The create-variant control exists (on the viewed/active card) and the summary tooltip trigger.
    expect(html).toContain('+ Variant');
    expect(html).toContain('Summary');
    // Under the cap → no "limit reached" copy.
    expect(html).not.toContain('limit reached');
  });

  it('blocks creation and shows the limit copy at MAX_VARIANTS versions', () => {
    const active: ActiveSheet = { system: 'dnd5e-2024', data: meta5e(), sheet_type: 'default', slotId: 'dnd5e-2024', kind: 'vanilla' };
    const variants: SystemVariants = {};
    for (let i = 2; i <= MAX_VARIANTS; i++) variants[`dnd5e-2024#${i}`] = { data: meta5e({ name: `V${i}` }), sheet_type: 'default', system: 'dnd5e-2024', parentSlotId: 'dnd5e-2024' };
    const cards = buildVariantCards(active, variants, { characterName: 'Gandalf' });
    expect(cards).toHaveLength(MAX_VARIANTS);
    const html = renderToStaticMarkup(<VariantBrowser characterId="c1" cards={cards} aiConfigured canWrite />);
    expect(html).toContain('limit reached');
    expect(html).toContain(`maximum ${MAX_VARIANTS} versions`);
  });

  it('renders read-only (no create/delete) when canWrite is false', () => {
    const active: ActiveSheet = { system: 'pathfinder2e', data: { pf2e: { identity: { name: 'Val', level: 3, className: 'Fighter' } } }, sheet_type: 'default', slotId: 'pathfinder2e', kind: 'vanilla' };
    const cards = buildVariantCards(active, {}, { characterName: 'Val' });
    const html = renderToStaticMarkup(<VariantBrowser characterId="c1" cards={cards} aiConfigured={false} canWrite={false} />);
    expect(html).toContain('VERSIONS //');
    expect(html).toContain('Val');
    expect(html).not.toContain('+ Variant'); // no create control without write access
  });
});
