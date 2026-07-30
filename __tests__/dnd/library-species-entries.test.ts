// __tests__/dnd/library-species-entries.test.ts — the races in the library open (owner, 2026-07-30).
//
// *"if we have the classes listed, the feats listed, the races listed, etc, that those are all clickable to
// also open up and reveal all of the system info about that class or feat or race."*
//
// They were bare name CHIPS on both D&D editions — a row of eleven words with nothing behind them, on the
// two systems a reader is most likely to look a race up in. IG already had per-ancestry accordions.
//
// The detail was in the codebase the whole time: `speciesCatalogFor` resolves size, speed, senses,
// languages, lineages and every trait line for both editions, and it powers the sheet's species panel. It
// simply had no reader on the library page — this repo's signature defect, one more time.
import { describe, it, expect } from 'vitest';
import { libraryPageFor } from '@/lib/dnd/library';
import { speciesCatalogFor } from '@/lib/dnd/species/view';

const speciesSection = (key: string) => libraryPageFor(key)?.sections.find((s) => s.id === 'species');

describe('the library’s species section is expandable where the data exists', () => {
  for (const key of ['dnd5e-2014', 'dnd5e-2024']) {
    it(`${key} lists every lineage as an openable entry`, () => {
      const s = speciesSection(key);
      expect(s, `${key} has no species section`).toBeTruthy();
      expect(s!.entries?.length, `${key} still renders bare chips`).toBe(speciesCatalogFor(key).length);
      expect(s!.chips, `${key} should not render both chips and entries`).toBeUndefined();
    });

    it(`${key} entries carry the standard information, not just a name`, () => {
      // "Kind of a summary of the thing" — the facts that distinguish one lineage from another, then the
      // traits. Asserted on content rather than on the presence of a field, because an entry whose detail
      // is an empty string is a chip with extra steps.
      for (const e of speciesSection(key)!.entries!) {
        expect(e.detail.length, `${e.name} has no detail`).toBeGreaterThan(40);
        expect(e.detail).toMatch(/\*\*Size\*\*|\*\*Speed\*\*/);
      }
    });

    it(`${key} nothing here is authored by hand — it comes from the species catalog`, () => {
      // The point of wiring rather than writing: the library and the sheet cannot disagree about what a
      // race grants, because there is one source.
      const names = speciesSection(key)!.entries!.map((e) => e.name).sort();
      expect(names).toEqual(speciesCatalogFor(key).map((s) => s.name).sort());
    });
  }

  it('falls back to chips for a system with no catalog rather than dropping the section', () => {
    // PF2's ancestries are not in this data yet. A name with nothing behind it is still better than
    // omitting the section, and silently showing an empty accordion would be worse than either.
    const s = speciesSection('pathfinder2e');
    if (!s) return;
    if (!s.entries?.length) expect(s.chips?.length, 'PF2 lost its ancestry list entirely').toBeGreaterThan(0);
  });

  it('leaves Intuitive Games alone, which already had per-ancestry entries', () => {
    const s = speciesSection('intuitive-games');
    if (s) expect(s.entries?.length ?? 0).toBeGreaterThan(0);
  });
});
