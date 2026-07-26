// __tests__/dnd/dnd5e-build-gate.test.ts — the 5e build route refuses an illegal vanilla build.
//
// Found in the final-QA walkthrough (slice 22) by asking why `homebrew/policy.ts`'s exemption note calls an
// uninvoked gate "indistinguishable from no gate", then checking which gates in this repo are actually
// called. PF2 (`gatePf2Picks`) and IG (`gateIgPicks`) both refuse an illegal build **server-side**. The 5e
// route validated nothing at all.
//
// Slice 3 gated the Foundations feat picker, but a picker is a courtesy, not a gate — the same reasoning
// `under-construction-gating.test.ts` already applies to system selection: every UI can be bypassed with a
// direct POST. Without this, `POST /dnd5e-build { level: 4, feats: ['Boon of Truesight'] }` was accepted and
// the sheet rendered a level-19 capstone on a 4th-level character as though it were legal.
//
// THE BATCH TRAP, and why most of this file tests behaviour rather than the route's source. The first cut of
// this gate lived inline in the route and passed the whole pick list as `takenFeatureNames`. That field means
// "already on the sheet" — so every pick saw ITSELF as taken and came back "You already have Grappler, which
// can't be taken again." A source-grep suite passed anyway, because the wiring it asserted was all present.
// The rule is now in `gateDnd5eBuildFeats`, where it can be called for real.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateDnd5eBuildFeats } from '@/lib/dnd/rules-gate';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ROUTE = 'app/api/dnd/characters/[id]/dnd5e-build/route.ts';

const ABILITIES = { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };
const ctx = (over: Partial<Parameters<typeof gateDnd5eBuildFeats>[1]> = {}) => ({
  system: 'dnd5e-2024', enforce: true, level: 4, className: 'Fighter', abilities: ABILITIES, ...over,
});

describe('the vanilla build gate refuses what the level does not grant', () => {
  it('rejects the exact payload that used to get through', () => {
    const { refused } = gateDnd5eBuildFeats(['Boon of Truesight'], ctx());
    expect(refused).toHaveLength(1);
    expect(refused[0].name).toBe('Boon of Truesight');
    expect(refused[0].reason).toMatch(/19/); // Epic Boons need level 19
  });

  it('accepts a legal pick, so the gate is not just a wall', () => {
    expect(gateDnd5eBuildFeats(['Grappler'], ctx()).refused).toEqual([]);
  });

  it('refuses only the illegal member of a mixed batch', () => {
    const { refused } = gateDnd5eBuildFeats(['Grappler', 'Boon of Truesight'], ctx());
    expect(refused.map((r) => r.name)).toEqual(['Boon of Truesight']);
  });
});

describe('the batch trap: a pick must not be judged against itself', () => {
  // This is the regression that a source-grep test could not see. Each of these was a 400 on the
  // happy path before `gateDnd5eBuildFeats` existed.
  it('a single legal pick is not "already taken"', () => {
    expect(gateDnd5eBuildFeats(['Grappler'], ctx()).refused).toEqual([]);
  });

  it('several legal picks in one payload all pass', () => {
    // General feats, which are what an ASI slot may spend on — Alert and Savage Attacker are ORIGIN
    // feats and are correctly refused here (slice 3's rule), which is what this batch must not mask.
    const { refused } = gateDnd5eBuildFeats(['Grappler', 'Skill Expert', 'Lightly Armored'], ctx({ level: 8 }));
    expect(refused).toEqual([]);
  });

  it('but the SAME feat listed twice is still refused — the other copy is genuinely taken', () => {
    const { refused } = gateDnd5eBuildFeats(['Grappler', 'Grappler'], ctx());
    expect(refused).toHaveLength(1);               // reported once, not once per copy
    expect(refused[0].reason).toMatch(/already have/i);
  });

  it('a rebuild does not refuse the feats the build itself put there', () => {
    // The route passes only the features it PRESERVES, so a prior `source: 'Feat'` pick is absent
    // here. Passing it would make re-running the builder on an unchanged character fail.
    expect(gateDnd5eBuildFeats(['Grappler'], ctx({ featureNames: ['Second Wind', 'Darkvision'] })).refused).toEqual([]);
  });

  it('a feat already on the sheet by another route IS taken', () => {
    const { refused } = gateDnd5eBuildFeats(['Grappler'], ctx({ featureNames: ['Grappler'] }));
    expect(refused).toHaveLength(1);
    expect(refused[0].reason).toMatch(/already have/i);
  });
});

describe('the same three-way rule as PF2 and IG', () => {
  it('a DM may grant anything', () => {
    expect(gateDnd5eBuildFeats(['Boon of Truesight'], ctx({ enforce: false })).refused).toEqual([]);
  });

  it('so may a custom character — the escape hatch', () => {
    expect(gateDnd5eBuildFeats(['Boon of Truesight'], ctx({ enforce: false })).refused).toEqual([]);
  });

  it('an empty payload has nothing to refuse', () => {
    expect(gateDnd5eBuildFeats([], ctx()).refused).toEqual([]);
  });

  it('fails through, not open, for a system another gate owns', () => {
    // PF2/IG have their own build gates; this one judging them was CX-17 bleed B1.
    expect(gateDnd5eBuildFeats(['Boon of Truesight'], ctx({ system: 'pathfinder2e' })).refused).toEqual([]);
    expect(gateDnd5eBuildFeats(['Alert'], ctx({ system: 'intuitive-games' })).refused).toEqual([]);
  });

  it('judges a 2014 character under 2014 rules', () => {
    // 2014 has no Epic Boon track at all, and its own catalog is deliberately one feat (Grappler).
    expect(gateDnd5eBuildFeats(['Grappler'], ctx({ system: 'dnd5e-2014' })).refused).toEqual([]);
    expect(gateDnd5eBuildFeats(['Grappler', 'Grappler'], ctx({ system: 'dnd5e-2014' })).refused).toHaveLength(1);
  });
});

describe('the route is wired to the gate', () => {
  const SRC = read(ROUTE);

  it('calls it, and refuses with 400 naming what was rejected', () => {
    // A silent drop would be worse than accepting: the player would think they had the feat.
    expect(SRC).toContain('gateDnd5eBuildFeats');
    expect(SRC).toMatch(/refused\.map\(\(r\) => `\$\{r\.name\} \(\$\{r\.reason\}\)`\)/);
    expect(SRC).toMatch(/\}, \{ status: 400 \}\)/);
    expect(SRC).toContain('refused,');
  });

  it('enforces on a vanilla character and not on a DM', () => {
    expect(SRC).toMatch(/enforce: !access\.access\.isDM && buildVariant === 'vanilla'/);
    expect(SRC).toContain('readActiveSlotMeta');
  });

  it('passes only the features the build preserves, via the SAME predicate the merge uses', () => {
    // If these two ever disagree, a rebuild refuses its own feats. One predicate, used twice.
    expect(SRC).toContain('featureNames: base.features.filter((f) => !replacedByBuild(f)).map((f) => f.name)');
    expect(SRC).toContain('...base.features.filter((f) => !replacedByBuild(f)),');
  });
});

describe('all three build routes gate, so none is the soft way in', () => {
  // The asymmetry was the bug: two systems enforced, one did not, and nothing said so.
  it.each([
    ['app/api/dnd/characters/[id]/pf2-build/route.ts', 'gatePf2Picks'],
    ['app/api/dnd/characters/[id]/ig-build/route.ts', 'gateIgPicks'],
    [ROUTE, 'gateDnd5eBuildFeats'],
  ])('%s calls %s', (file, gate) => {
    expect(read(file)).toContain(gate);
  });
});
