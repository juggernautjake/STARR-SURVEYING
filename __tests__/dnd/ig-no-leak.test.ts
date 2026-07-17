// __tests__/dnd/ig-no-leak.test.ts — Ground Rule 1 invariant for the whole Intuitive Games buildout: NONE
// of IG's many bespoke library sections or search kinds may appear under any OTHER game system. Individual
// slices each assert their own no-leak; this is the comprehensive net that catches a future IG addition that
// forgets to scope itself (a section pushed unconditionally, a search kind not gated on the system id).
import { describe, it, expect } from 'vitest';
import { allLibraryPages, libraryPageFor, searchLibrary } from '@/lib/dnd/library';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';

// Sections that are Intuitive Games only (built from its site scrub). If one shows up on another system's
// page, IG content has leaked.
const IG_ONLY_SECTIONS = [
  'stances', 'combat-skills', 'redistribution', 'companions', 'weapon-properties', 'tools',
  'magical-items', 'damage', 'character-building',
];
// Search hit kinds that only exist for IG.
const IG_ONLY_KINDS = ['stance', 'companion', 'damage-type', 'cover', 'combat-skill', 'defensive-power', 'trait', 'magic-item'];

describe('Intuitive Games content is system-scoped (Ground Rule 1, comprehensive)', () => {
  it('IG-only library sections appear ONLY on the intuitive-games page', () => {
    for (const page of allLibraryPages()) {
      if (page.key === 'intuitive-games') continue;
      const ids = new Set(page.sections.map((s) => s.id));
      for (const leaked of IG_ONLY_SECTIONS) {
        expect(ids.has(leaked), `"${leaked}" leaked into ${page.key}`).toBe(false);
      }
    }
  });

  it('the IG page DOES carry those sections (the guard would be vacuous otherwise)', () => {
    const ids = new Set(libraryPageFor('intuitive-games')!.sections.map((s) => s.id));
    for (const s of IG_ONLY_SECTIONS) expect(ids.has(s), `IG page missing "${s}"`).toBe(true);
  });

  it('IG-only search kinds never surface under another system', () => {
    // Probe each other system with terms that resolve to IG content, and assert no IG-only kind comes back.
    const probes = ['defensive stance', 'grappled', 'redistribution', 'wave crash', 'barkskin', 'dirty trick', 'bleed'];
    for (const sys of GAME_SYSTEMS) {
      if (sys.key === 'intuitive-games') continue;
      for (const q of probes) {
        for (const hit of searchLibrary(q, sys.key)) {
          expect(IG_ONLY_KINDS.includes(hit.kind), `IG kind "${hit.kind}" (${hit.name}) leaked into ${sys.key} for "${q}"`).toBe(false);
          expect(hit.system).toBe(sys.key); // every hit is scoped to the queried system
        }
      }
    }
  });
});
