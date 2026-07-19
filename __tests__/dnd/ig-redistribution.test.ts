// __tests__/dnd/ig-redistribution.test.ts — the IG redistribution materials + Launch Material damage types
// (scraped verbatim from /redistribution, closing the IG buildout scrub target).
import { describe, it, expect } from 'vitest';
import { IG_REDISTRIBUTION_MATERIALS } from '@/lib/dnd/systems/intuitive-games/content';
import { libraryPageFor } from '@/lib/dnd/library';

describe('IG redistribution materials', () => {
  it('has the seven materials from the site, each with a launch damage type', () => {
    expect(IG_REDISTRIBUTION_MATERIALS.map((m) => m.name)).toEqual([
      'Fine Particles', 'Fluids', 'Gems', 'Metal', 'Stone', 'Oozes', 'Organic Matter',
    ]);
    for (const m of IG_REDISTRIBUTION_MATERIALS) {
      expect(m.description.length).toBeGreaterThan(10);
      expect(m.launchDamage.length).toBeGreaterThan(0);
    }
  });

  it('pins the distinctive per-material damage types the prose only sampled', () => {
    const by = (n: string) => IG_REDISTRIBUTION_MATERIALS.find((m) => m.name === n)!;
    expect(by('Gems').launchDamage).toBe('Piercing');
    expect(by('Oozes').launchDamage).toBe('Bludgeoning');
    expect(by('Fine Particles').launchDamage).toBe('Slashing');
    expect(by('Metal').launchDamage).toMatch(/chosen when activated/i);
  });

  it('surfaces the material table in the IG library Redistribution section', () => {
    const section = libraryPageFor('intuitive-games')!.sections.find((s) => s.id === 'redistribution')!;
    expect(section.table!.headers).toEqual(['Material', 'What it is', 'Launch damage']);
    expect(section.table!.rows.length).toBe(7);
  });
});
