// __tests__/dnd/ig-vanilla-library-wip.test.ts — Ground Rule 2 in the vanilla library.
//
// The catalog now offers the full spell-list roster, some of whose powers have no effect text yet
// (pending Brendan's verbatim rules). The owner's hard rule: never render a WIP thing as if it were
// complete — say it's a work in progress. This pins that the library marks effect-less effect-bearing
// entries as WIP, and that such entries actually exist in the catalog (so the marker isn't dead code).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { igCatalog } from '@/lib/dnd/systems/intuitive-games/catalog';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/IGVanillaLibrary.tsx'), 'utf8');
const EFFECT_BEARING = new Set(['stance', 'power', 'feat', 'defensive-power', 'condition']);

describe('the vanilla library is honest about WIP (Ground Rule 2)', () => {
  it('renders a "work in progress" marker for an effect-bearing entry with no effect text', () => {
    expect(SRC).toContain("EFFECT_BEARING");
    expect(SRC).toMatch(/EFFECT_BEARING\.has\(e\.kind\)/);
    expect(SRC).toMatch(/work in progress/i);
  });

  it('does NOT mark name-only kinds (ancestry/class/weapon-type) as WIP — they lack nothing', () => {
    // The set deliberately excludes the kinds that never carry effect text.
    for (const k of ['ancestry', 'class', 'subclass', 'weapon-type', 'movement-type', 'skill', 'action']) {
      expect(EFFECT_BEARING.has(k)).toBe(false);
    }
  });

  it('every catalog power now carries effect text — the spell WIP gap is CLOSED (scraped 2026-07-17)', () => {
    // All 56 site spells were scraped verbatim from intuitivegames.net/spell-list and wired into IG_POWERS,
    // so no power is effect-less anymore. The WIP marker (tested above) remains, guarding any FUTURE
    // effect-bearing entry that lacks text (e.g. content Brendan hasn't published yet on other pages).
    const effectlessPowers = igCatalog()
      .filter((g) => g.kind === 'power')
      .flatMap((g) => g.entries)
      .filter((e) => !e.effect);
    expect(effectlessPowers.length).toBe(0);
  });
});
