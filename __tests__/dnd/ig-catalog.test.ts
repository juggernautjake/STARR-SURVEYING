// __tests__/dnd/ig-catalog.test.ts — the Intuitive Games vanilla catalog (IG builder Slice 7).
// The catalog groups the whole vanilla library for the builder picker + on-sheet reference, every entry
// flagged vanilla, with stance/power effect text carried through and classifier agreement.
import { describe, it, expect } from 'vitest';
import { igCatalog, igCatalogCount } from '@/lib/dnd/systems/intuitive-games/catalog';
import { classifyElement } from '@/lib/dnd/provenance';
import { igAllSpellNames } from '@/lib/dnd/systems/intuitive-games/content';
import { igAllFeats } from '@/lib/dnd/systems/intuitive-games/feats';

describe('igCatalog (Slice 7)', () => {
  const groups = igCatalog();

  it('groups every section and every entry is flagged vanilla', () => {
    const titles = groups.map((g) => g.title);
    expect(titles).toContain('Stances');
    expect(titles).toContain('Defensive powers');
    expect(titles).toContain('Weapon types');
    expect(titles.some((t) => t.startsWith('Powers · '))).toBe(true); // powers split by school
    expect(titles.some((t) => t.startsWith('Feats'))).toBe(true);
    expect(groups.every((g) => g.entries.every((e) => e.source === 'vanilla'))).toBe(true);
    expect(groups.every((g) => g.entries.length > 0)).toBe(true);
  });

  it('offers the FULL spell-list roster as powers — parity with the sheet picker + AI add_power', () => {
    // The builder + AI grounding read the catalog; if it only listed effect-carrying IG_POWERS, a player
    // couldn't build with roster powers whose effect text is still pending Brendan (Gate, Portal, …).
    const catalogPowers = new Set(
      groups.filter((g) => g.kind === 'power').flatMap((g) => g.entries.map((e) => e.name.toLowerCase())),
    );
    for (const name of igAllSpellNames()) {
      expect(catalogPowers.has(name.toLowerCase()), `roster power "${name}" missing from the catalog`).toBe(true);
    }
    // A roster power without effect text yet is present name-only (honest WIP, not fabricated).
    const gate = groups.flatMap((g) => g.entries).find((e) => e.name === 'Gate');
    expect(gate, 'Gate is a roster power and must be offered').toBeTruthy();
  });

  it('offers the FULL feat catalog (igAllFeats, 150+) — parity with the sheet picker + AI add_feat', () => {
    // The catalog used to list only the ~20-entry IG_FEATS the sheet references, so the builder + AI
    // grounding could offer a fraction of the real feats. Every igAllFeats() feat must now be present.
    const catalogFeats = new Set(
      groups.filter((g) => g.kind === 'feat').flatMap((g) => g.entries.map((e) => e.name.toLowerCase())),
    );
    expect(igAllFeats().length).toBeGreaterThan(100); // sanity: the full catalog is large
    for (const f of igAllFeats()) {
      expect(catalogFeats.has(f.name.toLowerCase()), `feat "${f.name}" missing from the catalog`).toBe(true);
    }
  });

  it('carries effect text for stances and counts the whole library', () => {
    const stances = groups.find((g) => g.title === 'Stances')!;
    expect(stances.entries).toHaveLength(10);
    expect(stances.entries.find((e) => e.name === 'Offensive')?.effect).toMatch(/advantage on all attack rolls/i);
    expect(igCatalogCount()).toBe(groups.reduce((n, g) => n + g.entries.length, 0));
    expect(igCatalogCount()).toBeGreaterThan(80);
  });

  it('every catalog entry classifies as vanilla for the intuitive-games system', () => {
    // The catalog IS the vanilla library, so the provenance classifier must agree on the tracked kinds.
    const tracked = new Set(['ancestry', 'class', 'subclass', 'skill', 'condition', 'stance', 'feat', 'power', 'defensive-power', 'weapon-type', 'movement-type', 'creature-type']);
    for (const g of groups) {
      for (const e of g.entries) {
        if (!tracked.has(e.kind)) continue;
        expect(classifyElement('intuitive-games', e.kind, e.name)).toBe('vanilla');
      }
    }
  });
});
