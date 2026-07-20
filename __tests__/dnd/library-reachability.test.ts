// __tests__/dnd/library-reachability.test.ts — shipped content must be REACHABLE, not just correct.
//
// Born from the S10 QA walkthrough (2026-07-20). The 2024 weapon and armour tables existed as
// data, were projected into the AI's retrieval store, and were wired into the grant path — and
// rendered NOWHERE. A reader browsing the 2024 library saw no gear at all. Every unit test passed
// and the build was green, because correctness and visibility are different properties and the
// suite only ever checked the first.
//
// This closes that gap for the whole class of bug: if a content collection exists for a system,
// the library page for that system must have a section that surfaces it.
import { describe, it, expect } from 'vitest';
import { libraryPageFor } from '@/lib/dnd/library';
import { WEAPONS_2024, ARMOR_2024 } from '@/lib/dnd/equipment/dnd5e-2024';
import { FEATS_2024 } from '@/lib/dnd/feats/dnd5e-2024';
import { SPECIES_2024 } from '@/lib/dnd/species/dnd5e-2024';
import { BACKGROUNDS_2024 } from '@/lib/dnd/backgrounds/dnd5e-2024';
import { spellsForSystem } from '@/lib/dnd/spells';
import { CONDITION_MECHANICS_5E } from '@/lib/dnd/conditions/dnd5e';

const page2024 = libraryPageFor('dnd5e-2024')!;
const sectionIds = page2024.sections.map((s) => s.id);
const titles = page2024.sections.map((s) => s.title);

/** Every rendered row/entry/chip on the page, flattened — what a reader can actually see. */
const renderedText = page2024.sections
  .map((s) => [
    ...(s.entries ?? []).map((e) => `${e.name} ${e.brief ?? ''} ${e.detail}`),
    ...(s.table?.rows ?? []).flat(),
    ...(s.chips ?? []),
    ...(s.body ?? []),
    ...(s.facts ?? []).map((f) => `${f.label} ${f.value}`),
  ].join(' '))
  .join(' ');

describe('every 2024 content collection is reachable in the library', () => {
  const cases: { label: string; sample: string; sectionId: string }[] = [
    { label: 'weapons', sample: WEAPONS_2024[0].name, sectionId: 'weapons' },
    { label: 'armour', sample: ARMOR_2024[0].name, sectionId: 'armor' },
    { label: 'feats', sample: FEATS_2024[0].name, sectionId: 'feats' },
    { label: 'backgrounds', sample: BACKGROUNDS_2024[0].name, sectionId: 'backgrounds' },
  ];

  for (const c of cases) {
    it(`${c.label} have a section`, () => {
      expect(sectionIds, `no '${c.sectionId}' section — ${c.label} ship as data but render nowhere`).toContain(c.sectionId);
    });

    it(`${c.label} actually render an entry`, () => {
      // A section that exists but renders nothing is the same bug wearing a hat.
      expect(renderedText, `${c.label} section exists but "${c.sample}" is not in it`).toContain(c.sample);
    });
  }

  it('species are reachable', () => {
    expect(SPECIES_2024.length).toBeGreaterThan(0);
    expect(renderedText).toContain(SPECIES_2024[0].name);
  });

  it('conditions are reachable', () => {
    expect(renderedText).toContain(CONDITION_MECHANICS_5E[0].name);
  });

  it('spells are reachable — via the browser rather than a section', () => {
    // Spells deliberately have NO library section: SpellBrowser renders all 405 with facets,
    // which a static section could not do. Asserting the catalog is non-empty keeps the
    // reachability claim honest without demanding the wrong shape.
    expect(spellsForSystem('dnd5e-2024').length).toBeGreaterThan(300);
  });

  it('the gear sections use entries, so each item can be granted', () => {
    // A table row has no identity to hang a give-to-character button on — the exact reason the
    // weapons section was built as entries rather than a table.
    for (const id of ['weapons', 'armor']) {
      const s = page2024.sections.find((x) => x.id === id)!;
      expect(s.entries?.length, `${id} must be entries, not a table`).toBeGreaterThan(0);
    }
  });

  it('names the gear sections in the system’s own words', () => {
    expect(titles).toContain('Weapons');
    expect(titles).toContain('Armour & Shields');
  });
});
