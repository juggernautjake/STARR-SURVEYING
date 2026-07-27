// __tests__/dnd/homebrew-feat-reachability.test.ts — a saved homebrew feat is only reachable on 2024.
//
// Slice 76. Slice 74 established that per-character homebrew is wired end to end and said so plainly:
// "create homebrew, save it, use it on that character: works." That was reached by READING the code.
// This repo's recorded lesson is that reading is not enough — "a green 15k-test suite missed 3
// rendering-condition bugs", "authored but not wired is this repo's most common defect" — so the claim
// got driven in a browser, and it is true for 2024 and NOT true for the other systems.
//
// THE PATH, as it exists today:
//   1. `/dnd/characters/[id]/build/feat` renders for ANY character. The page deliberately does not show
//      or edit `system`: *"the save route derives the real one from the character … this page cannot
//      know it and must not invent it."* Reasonable on its own.
//   2. The save route accepts it, scoping to `normalizeSystem(character.system)` — so a 2014 character
//      saves a 2014 feat, successfully, flagged custom for DM review.
//   3. `levels/route.ts` adapts every saved feat via `customFeatToFeat` and passes them to the walker.
//   4. `asiFeatChoices` (LevelBuilder) opens with `if (system !== 'dnd5e-2024') return []`.
//
// So on a non-2024 character a player can open the designer, write a feat, watch the engine validate it
// live, save it, be told it is flagged for DM review — and no picker will ever offer it. Nothing in that
// flow says so. The work simply disappears.
//
// NOT FIXED HERE, and the reason is a real one rather than a hedge: the fix is to decide what 2014 does
// with feats at an ASI slot, and 2014 feats are an OPTIONAL rule in that edition. Making them appear is a
// rules decision about someone's game, which is the same line this arc has held since slice 71. What is
// recorded here is the behaviour, so the decision is made with it visible instead of discovered by a
// player whose feat vanished.
import { describe, it, expect } from 'vitest';
import { customFeatToFeat, eligibleHomebrewFeats } from '@/lib/dnd/feats/homebrew-adapter';
import { FEATS_2014 } from '@/lib/dnd/feats/dnd5e-2014';
import { featEligibilityForSystem } from '@/lib/dnd/feats/eligibility';
import type { CustomFeat } from '@/lib/dnd/classes/custom';

const feat = (over: Partial<CustomFeat> = {}): CustomFeat => ({
  key: 'hb-test',
  name: 'Cellar Door',
  category: 'general',
  system: 'dnd5e-2014',
  custom: true,
  repeatable: false,
  prerequisite: '',
  abilityIncrease: [],
  body: 'You may open a cellar door as a bonus action.',
  ...over,
} as CustomFeat);

describe('the adapter is faithful about everything except the system', () => {
  it('carries name, category, body and repeatability across', () => {
    const f = customFeatToFeat(feat({ repeatable: true }));
    expect(f.name).toBe('Cellar Door');
    expect(f.category).toBe('general');
    expect(f.benefit).toContain('cellar door');
    expect(f.repeatable).toBe(true);
  });

  it('a free-text prerequisite becomes an advisory `text` gate, not a machine-checked one', () => {
    const f = customFeatToFeat(feat({ prerequisite: 'Level 4+, Strength 13+' }));
    expect(f.prerequisites).toEqual([{ text: 'Level 4+, Strength 13+' }]);
    // No minLevel — so it cannot silently filter the feat out of a picker. Homebrew is the table's call.
    expect(f.prerequisites?.[0]).not.toHaveProperty('minLevel');
  });

  it('and sets dnd5e-2024 because that is the only value the Feat type allows', () => {
    // Slice 76 recorded this as the object "claiming a system its owner is not", and slice 78 escalated
    // it to a defect. Slice 79 established it is neither: `Feat.system` is the literal `'dnd5e-2024'`,
    // so this is a shape conversion into the 2024 picker's type, not an assertion about the homebrew.
    // The persisted CustomFeat keeps `dnd5e-2014` and is what the character actually owns.
    expect(feat().system).toBe('dnd5e-2014');
    expect(customFeatToFeat(feat()).system).toBe('dnd5e-2024');
  });
});

describe('category eligibility mirrors the official rule', () => {
  it('general feats are offered at any level', () => {
    expect(eligibleHomebrewFeats([feat()], 1).map((f) => f.name)).toEqual(['Cellar Door']);
  });

  it('epic boons only from 19', () => {
    const boon = [feat({ key: 'hb-boon', category: 'epic-boon' })];
    expect(eligibleHomebrewFeats(boon, 18)).toEqual([]);
    expect(eligibleHomebrewFeats(boon, 19)).toHaveLength(1);
  });

  it('origin and fighting-style feats are not ASI picks, and are excluded', () => {
    expect(eligibleHomebrewFeats([feat({ category: 'origin' })], 20)).toEqual([]);
    expect(eligibleHomebrewFeats([feat({ category: 'fighting-style' })], 20)).toEqual([]);
  });
});

// ── The reachability matrix (slice 77) ────────────────────────────────────────────────────────────
//
// CORRECTION TO SLICE 76. That slice said a homebrew feat saved on a non-2024 character is unreachable
// and that "no picker will ever offer it". True for `general`, and **wrong for `fighting-style`**.
// `levels/route.ts` builds `featPool = [...featCatalogForSystem(system), ...homebrewFeats]` and then
// `byCategory('fighting-style')`, which becomes `choice.options` on the plan — and 2014's Fighter,
// Paladin and Ranger all emit a `fighting-style` choice. So that category DOES reach a 2014 picker.
//
// Third time in this arc a claim of mine generalised past its evidence (72 and 75 were the others), and
// the same cause each time: one measured case stated as a rule. The matrix below is derived from the
// real class registry rather than restated, so it cannot drift from the data it describes.
describe('reachability depends on CATEGORY as well as system', () => {
  const read = (p: string) =>
    require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');
  const classFiles = (edition: string): string[] => {
    const dir = require('node:path').join(process.cwd(), `lib/dnd/classes/${edition}`);
    return require('node:fs').readdirSync(dir).filter((f: string) => f.endsWith('.ts'));
  };
  const emitsChoice = (edition: string, kind: string) =>
    classFiles(edition).filter((f) => read(`lib/dnd/classes/${edition}/${f}`).includes(`choice: '${kind}'`));

  it('the class directories are found — this matrix is worthless if they are not', () => {
    // The floor slice 75 added everywhere else. An empty directory would make every claim below vacuous.
    expect(classFiles('dnd5e-2014').length).toBeGreaterThan(8);
    expect(classFiles('dnd5e-2024').length).toBeGreaterThan(8);
  });

  it('2014 DOES emit fighting-style choices — so homebrew of that category is reachable there', () => {
    const emitters = emitsChoice('dnd5e-2014', 'fighting-style');
    expect(emitters.sort()).toEqual(['fighter.ts', 'paladin.ts', 'ranger.ts']);
    // And the route feeds homebrew into that list rather than only the official one.
    const route = read('app/api/dnd/characters/[id]/levels/route.ts');
    expect(route).toContain('...featCatalogForSystem(def.system), ...homebrewFeats');
    expect(route).toContain("byCategory('fighting-style')");
  });

  it('2014 emits NO epic-boon choice, so that category is unreachable there', () => {
    expect(emitsChoice('dnd5e-2014', 'epic-boon')).toEqual([]);
    expect(emitsChoice('dnd5e-2024', 'epic-boon').length).toBeGreaterThan(0);
  });

  it('CLOSED 2026-07-27 for 2014 — a saved homebrew feat is now offered at its ASI slot', () => {
    // Was: the one cell both saveable and unreachable, and the one a player is most likely to write (the
    // designer's category dropdown defaults to `general` and the AI drafts them). A 2014 player could
    // author, validate and save a feat, be told it was flagged for DM review, and never be offered it.
    //
    // Decided by the owner ("make the best decision… I trust your judgement") on the ground that 2014's
    // OFFICIAL catalogue is one feat (Grappler) and can never be more — the rest is PHB-only content
    // outside the CC-BY licence. Homebrew is therefore that edition's only real feat route, which is the
    // "custom is the explicit escape hatch" principle this builder already runs on.
    const src = read('app/dnd/_ui/LevelBuilder.tsx');
    expect(src).toContain("const pool2014: FeatChoice[] = [...FEATS_2014, ...extra];");
    // No CATEGORY filter on that branch: origin / general / fighting-style / epic-boon are 2024 TRACKS
    // that do not exist in 2014, so filtering by them would impose one edition's structure on the other.
    expect(src).not.toMatch(/pool2014[^;]*extra\.filter/);
    expect(eligibleHomebrewFeats([feat({ category: 'general' })], 5)).toHaveLength(1);
  });

  it('the OFFICIAL 2014 feat is offered too, judged by 2014’s own dispatcher arm', () => {
    // `dnd5e-2014.ts` prescribed this exactly: "add a system-keyed dispatcher rather than widening the
    // 2024 type". Both halves now exist, so Grappler reaches the picker without either edition claiming
    // the other's structure — and it is judged by the 2014 arm, not the 2024 one.
    const src = read('app/dnd/_ui/LevelBuilder.tsx');
    expect(src).toContain("featEligibilityForSystem('dnd5e-2014', f.key, { slot: 'asi', level, abilities })");
    expect(FEATS_2014.map((f) => f.key)).toContain('grappler');
  });

  it('and FeatChoice is no longer the 2024 catalogue’s type, which is what unblocked it', () => {
    // The narrowing is the load-bearing part. While `FeatChoice = Feat & {…}`, offering a 2014 feat meant
    // widening `Feat` across editions or inventing a category at the boundary — the same bleed either way.
    const src = read('app/dnd/_ui/LevelBuilder.tsx');
    expect(src, 'FeatChoice went back to being 2024-typed').not.toMatch(/export type FeatChoice = Feat &/);
    expect(src).toMatch(/export interface FeatChoice \{/);
  });

  it('2014’s eligibility arm really does gate on the ability score', () => {
    // Behavioural, not a string match: Grappler needs STR 13, and the arm must say so rather than pass
    // everything through. If this ever returns ok for STR 8, the picker is showing a feat as legal that
    // the server will refuse.
    const low = featEligibilityForSystem('dnd5e-2014', 'grappler', { slot: 'asi', level: 4, abilities: { str: 8 } });
    expect(low.ok).toBe(false);
    expect(low.reason ?? '').toMatch(/str/i);
    const high = featEligibilityForSystem('dnd5e-2014', 'grappler', { slot: 'asi', level: 4, abilities: { str: 14 } });
    expect(high.ok).toBe(true);
  });

  it('and PF2 / IG are still excluded, which is correct rather than an oversight', () => {
    // In 2014 a feat is taken INSTEAD of an Ability Score Improvement — the very slot this picker spends.
    // PF2 and IG have their own feat tracks at their own levels and no ASI slot at all, so offering a
    // 5e-shaped feat there would be a category error, not a courtesy (Ground Rule 1).
    expect(read('app/dnd/_ui/LevelBuilder.tsx')).toContain("if (system !== 'dnd5e-2024') return [];");
  });
});

// ── The feat path against its two siblings (slice 78) ─────────────────────────────────────────────
//
// Slices 76 and 77 examined the FEAT designer, then spoke about "homebrew". There are three designers,
// and the same reachability question was unasked for the other two — the exact habit slice 77 named.
// Asking it produces a **negative result that reframes the finding**: classes and subclasses are
// coherently system-scoped end to end, and the feat path is the odd one out.
//
//   kind        saved as               read back through                          system-filtered?
//   ---------   --------------------   ----------------------------------------   ----------------
//   class       character's system     findClass(sys, key, extra.filter(...))     YES
//   subclass    character's system     subclassesFor(sys, key, extra.filter(...)) YES
//   feat        character's system     customFeatToFeat — STAMPS 'dnd5e-2024'     no
//
// So the gap is not "homebrew is half-wired". It is that the feat adapter **discards the character's
// real system** and leans on a different gate (`asiFeatChoices`'s 2024-only check) instead of the
// system filter its siblings use. That is why the general/non-2024 cell is unreachable, and it also
// points at the fix without deciding anything: make feats behave like classes and subclasses.
describe('the three homebrew kinds, compared', () => {
  const read = (p: string) =>
    require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');

  it('classes and subclasses filter homebrew BY SYSTEM when reading it back', () => {
    const registry = read('lib/dnd/classes/registry.ts');
    expect(registry).toContain('extra.filter((c) => c.system === system)');   // findClass
    expect(registry).toContain('extra.filter((s) => s.system === system)');   // subclassesFor
  });

  it('and their save routes store the character’s real system, so the filter matches', () => {
    const custom = read('lib/dnd/classes/custom.ts');
    expect(custom).toContain('system: draft.system');   // buildCustomClass
    expect(custom).toContain('system: input.system');   // buildCustomSubclass
    for (const kind of ['class', 'subclass']) {
      const route = read(`app/api/dnd/characters/[id]/homebrew-${kind}/save/route.ts`);
      expect(route, `${kind} save derives system from the character`).toContain('normalizeSystem');
    }
  });

  it('the subclass route even refuses a parent class that does not resolve in that system', () => {
    // The strongest of the three: it will not create an orphan. Worth pinning as the standard the
    // feat path is being measured against, rather than as an incidental detail.
    const route = read('app/api/dnd/characters/[id]/homebrew-subclass/save/route.ts');
    expect(route).toContain('findClass(system, input.classKey, readHomebrewClasses(data))');
  });

  // ⚑ RETRACTED 2026-07-27 (slice 79). This block previously held a test titled "the FEAT adapter alone
  // discards it — the one inconsistency, and the cause of the gap", asserting that `customFeatToFeat`
  // stamping `'dnd5e-2024'` was a defect, that it was "not load-bearing… just untrue", and that aligning
  // it with its siblings was a free consistency fix. **All of that was wrong**, and it was checked only
  // because the next step was to ship it.
  //
  // `Feat.system` is typed as the LITERAL `'dnd5e-2024'` (lib/dnd/feats/dnd5e-2024.ts:31). The `Feat`
  // type IS "a 2024 feat". `ClassDefinition.system` and `SubclassDefinition.system` are plain `string`,
  // spanning editions — which is *why* they can and must filter on it. So the three are not
  // inconsistent; they differ because their types differ, and the adapter's literal is the only value
  // that type permits. `system: cf.system` would not compile.
  //
  // The stamp is therefore load-bearing after all: it satisfies the contract "this object is
  // 2024-shaped", which is exactly what the 2024 picker consumes. It says nothing false about the
  // homebrew feat, whose persisted `CustomFeat` keeps its real system throughout.
  it('the adapter’s literal is REQUIRED by the target type, not a choice it made', () => {
    expect(read('lib/dnd/feats/dnd5e-2024.ts')).toContain("system: 'dnd5e-2024';");
    const types = read('lib/dnd/classes/types.ts');
    expect(types).toContain('system: string;');
    // The persisted shape keeps the truth, which is why nothing is actually lost.
    expect(read('lib/dnd/classes/custom.ts')).toContain('system: string;');
  });

  it('so the cause of the gap is the PICKER’s gate on the character, not the feat’s own field', () => {
    // `asiFeatChoices(system, …)` gates on the CHARACTER's system. No change to a feat's `system` value
    // could affect it. The gap and its cause are one line, and it is this one.
    expect(read('app/dnd/_ui/LevelBuilder.tsx')).toContain("if (system !== 'dnd5e-2024') return [];");
    expect(read('app/api/dnd/characters/[id]/levels/route.ts')).not.toContain('f.system === def.system');
  });
});

describe('THE REACHABILITY GAP — pinned, not fixed', () => {
  // `asiFeatChoices` lives inside LevelBuilder.tsx and is not exported, so the gate is asserted against
  // the source. That is deliberate: the point is that the FIRST line of the function discards every
  // non-2024 system before homebrew is ever considered, and it is the shape of the gate that matters.
  const SRC = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'app/dnd/_ui/LevelBuilder.tsx'), 'utf8');

  it('the ASI picker returns nothing at all for a non-2024 system', () => {
    expect(SRC).toContain("if (system !== 'dnd5e-2024') return [];");
  });

  it('and the homebrew line sits AFTER that gate, so it can never run for 2014', () => {
    const gate = SRC.indexOf("if (system !== 'dnd5e-2024') return [];");
    const homebrew = SRC.indexOf('const homebrew = extra.filter(');
    expect(gate).toBeGreaterThan(-1);
    expect(homebrew).toBeGreaterThan(gate);
  });

  it('while the designer and the save route are open to every system', () => {
    // Neither restricts by system — verified as the other half of the gap, so a fix that only touched
    // the picker would still leave a 2014 player able to save something unreachable.
    const page = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'app/dnd/characters/[id]/build/feat/page.tsx'), 'utf8');
    expect(page).not.toContain("dnd5e-2024'");
    const route = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(),
        'app/api/dnd/characters/[id]/homebrew-feat/save/route.ts'), 'utf8');
    expect(route).toContain('normalizeSystem');
    expect(route).not.toContain("!== 'dnd5e-2024'");
  });
});
