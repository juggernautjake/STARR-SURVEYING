// __tests__/dnd/ig-catalog.test.ts — the Intuitive Games vanilla catalog (IG builder Slice 7).
// The catalog groups the whole vanilla library for the builder picker + on-sheet reference, every entry
// flagged vanilla, with stance/power effect text carried through and classifier agreement.
import { describe, it, expect } from 'vitest';
import { igCatalog, igCatalogCount } from '@/lib/dnd/systems/intuitive-games/catalog';
import { classifyElement } from '@/lib/dnd/provenance';

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

  it('carries effect text for stances and counts the whole library', () => {
    const stances = groups.find((g) => g.title === 'Stances')!;
    expect(stances.entries).toHaveLength(10);
    expect(stances.entries.find((e) => e.name === 'Offensive')?.effect).toMatch(/advantage on attacks/i);
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
