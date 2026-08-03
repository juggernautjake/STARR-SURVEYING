// P8-1 said "No monster catalogue exists in any system". It does. This pins that.
//
// The same shape as `ig-glossary-coverage.test.ts`, which closed P8-3 by measurement rather than by
// doing the scrape the item asked for: an audit finding that has since been fixed elsewhere stays
// true-looking until something asserts otherwise, and the cost of believing it is rebuilding
// finished work.
//
// P8-1's dependency chain made that expensive. P3-6 (encounter builder) lists P8-1 as a blocker, so
// a stale "no bestiary exists" propagated into a second item being held closed for a reason that had
// stopped applying. P3-6 IS still blocked — 5e encounter budgets are Dungeon Master's Guide content
// and not in SRD 5.1, so we would be inventing authoritative-looking numbers — but it is blocked for
// one reason now, not two, and the difference matters when someone decides what to build next.
//
// The bestiary was built from `BESTIARY_BUILDOUT_2026-07-29.md` (now in `completed/`), by a
// concurrent agent, which is exactly how an item goes stale without anyone noticing: the work landed
// against a different plan document.
//
// NOTE that this file deliberately does NOT assert a creature count. The catalogue grows, and a
// number here would fail on a successful import — the assertion is that the SUBSYSTEM exists, which
// is the claim P8-1 got wrong.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const exists = (p: string) => fs.existsSync(path.join(process.cwd(), p));

describe('a monster catalogue exists — P8-1 is stale', () => {
  it('has a bestiary domain layer', () => {
    expect(exists('lib/dnd/bestiary')).toBe(true);
  });

  it('has importers for the CC-licensed sources P8-1 asked for', () => {
    // P8-1's design named "5e SRD; PF2 Monster Core". Both importers are here.
    expect(exists('lib/dnd/bestiary/import-open5e.ts')).toBe(true);
    expect(exists('lib/dnd/bestiary/import-pf2.ts')).toBe(true);
  });

  it('has a queryable model rather than a pile of data', () => {
    for (const f of ['query.ts', 'taxonomy.ts', 'variants.ts', 'derive.ts']) {
      expect(exists(`lib/dnd/bestiary/${f}`), f).toBe(true);
    }
  });

  it('is REACHABLE, which is the part this project gets wrong most often', () => {
    // A catalogue nobody can open is the defect this repo produces more than any other. The route
    // and its UI both exist.
    expect(exists('app/dnd/bestiary')).toBe(true);
    expect(exists('app/dnd/_ui/bestiary')).toBe(true);
  });

  it('is persisted, not just typed', () => {
    const seeds = fs.readdirSync(path.join(process.cwd(), 'seeds'));
    const bestiarySeeds = seeds.filter((s) => /bestiary|creature/i.test(s));
    expect(bestiarySeeds.length, `bestiary seeds: ${bestiarySeeds.join(', ')}`)
      .toBeGreaterThanOrEqual(3);
  });
});

describe('P8-2 (magic items) is absent from THIS BRANCH — which is not the same as unbuilt', () => {
  // Checked in the same pass, and the distinction matters more than the assertion.
  //
  // My first reading was "P8-2 is genuinely unbuilt, unlike P8-1". That was wrong in a way worth
  // recording: P8-2 IS built, on `origin/claude/dnd-srd-magic-items-2026-08-02`, whose head commit
  // is literally "the SRD magic items, catalogued and reachable — P8-2". It is simply not merged, so
  // it is absent from here and from `main` and therefore from production.
  //
  // That is a THIRD state this project keeps hitting, beside "stale item" and "built but
  // unreachable": **built, tested, pushed, and never merged.** Nine such D&D branches exist, 69
  // commits between them — see the handoff. A file-existence check cannot tell "nobody wrote it"
  // from "nobody merged it", and reading absence as the former is how finished work gets rebuilt.
  //
  // If this test fails, that is good news: the branch landed, and P8-2 should be ticked.
  it('has no 5e magic-item catalogue on this branch', () => {
    const seeds = fs.readdirSync(path.join(process.cwd(), 'seeds'));
    expect(seeds.filter((s) => /magic.?item/i.test(s))).toEqual([]);
  });
});
