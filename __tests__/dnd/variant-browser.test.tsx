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

  // ── The version's own NAME ────────────────────────────────────────────────────────────────────
  // Both of these were found by driving a real browser, and neither could have been caught by the
  // assertions above: the naming step tells the player "every version shows its name on the shelf", the
  // name was being stored correctly, and the card simply never printed it — `slotLabel` was computed in
  // the model and read by nothing at all.
  describe('a version the player named', () => {
    const namedSetup = () => {
      const active: ActiveSheet = { system: 'intuitive-games', data: { ig: { identity: { name: 'dddddd', level: 1 } } }, sheet_type: 'default', slotId: 'intuitive-games', kind: 'vanilla' };
      const variants: SystemVariants = {
        'intuitive-games#2': {
          data: { ig: { identity: { name: 'dddddd', level: 1 } } }, sheet_type: 'default',
          system: 'intuitive-games', kind: 'vanilla', parentSlotId: 'intuitive-games',
          name: 'Ambush build',
        },
      };
      return buildVariantCards(active, variants, { characterName: 'dddddd' });
    };

    it('carries the player’s name through the card model as customName', () => {
      const cards = namedSetup();
      const named = cards.find((c) => c.slotId === 'intuitive-games#2')!;
      const unnamed = cards.find((c) => c.slotId === 'intuitive-games')!;
      expect(named.customName).toBe('Ambush build');
      // An unnamed version has NO custom name — its slotLabel is the generated fallback, and the card
      // must be able to tell the two apart or it prints "Intuitive Games · Vanilla" where a name goes.
      expect(unnamed.customName).toBeNull();
      expect(unnamed.slotLabel).toMatch(/Intuitive Games/i);
    });

    it('prints that name on the card', () => {
      const html = renderToStaticMarkup(<VariantBrowser characterId="c1" cards={namedSetup()} aiConfigured={false} canWrite />);
      expect(html).toContain('Ambush build');
      // …and does NOT print the generated fallback as though it were a name (the tags already say it).
      expect(html).not.toContain('Intuitive Games · Vanilla');
    });

    it('names the VERSION in the delete control — the one action that cannot be undone', () => {
      // Sibling versions share a character name, so "Delete “dddddd”?" named the version being KEPT just
      // as accurately as the one being destroyed.
      const html = renderToStaticMarkup(<VariantBrowser characterId="c1" cards={namedSetup()} aiConfigured={false} canWrite />);
      expect(html).toContain('Delete the version “Ambush build”');
      expect(html).not.toContain('title="Delete dddddd"');
    });

    it('seeds the rename control from the VERSION name, never the character name', () => {
      // `rename` posts to the slot. Seeding the box with the character name meant opening the control and
      // pressing ✓ silently replaced the version's name with the character's.
      const html = renderToStaticMarkup(<VariantBrowser characterId="c1" cards={namedSetup()} aiConfigured={false} canWrite />);
      expect(html).toContain('Rename this version (currently “Ambush build”)');
      // The unnamed original invites a name rather than claiming to rename one.
      expect(html).toContain('Give this version a name');
    });
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
