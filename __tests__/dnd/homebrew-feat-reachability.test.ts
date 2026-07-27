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

  it('but it STAMPS dnd5e-2024 onto a feat the character saved as 2014', () => {
    // The literal is hardcoded, documented as "asiFeatChoices is 2024-only, so the system literal is
    // fixed here". Contained — the PERSISTED CustomFeat keeps its real system, this is the in-memory
    // adaptation only — but it means the object handed to the picker claims a system its owner is not.
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

  it('so the gap is specifically GENERAL feats on a non-2024 character', () => {
    // The one cell that is both saveable and unreachable, and the one a player is most likely to write:
    // the designer's category dropdown defaults to it and the AI drafts them.
    expect(eligibleHomebrewFeats([feat({ category: 'general' })], 5)).toHaveLength(1); // eligible…
    expect(read('app/dnd/_ui/LevelBuilder.tsx'))
      .toContain("if (system !== 'dnd5e-2024') return [];");                            // …but unreachable
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

  it('the FEAT adapter alone discards it — the one inconsistency, and the cause of the gap', () => {
    const adapter = read('lib/dnd/feats/homebrew-adapter.ts');
    expect(adapter).toContain("system: 'dnd5e-2024'");
    // And nothing downstream re-filters by system, which is why a stamped feat still reaches the
    // fighting-style list on 2014. The stamp is not load-bearing; it is just untrue.
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
