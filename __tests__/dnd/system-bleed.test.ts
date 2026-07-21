// __tests__/dnd/system-bleed.test.ts — Ground Rule 1 from the OTHER direction.
//
// `system-integrity.test.ts` proves the POSITIVE: ask for 2014's Barbarian and you get 2014's. This
// file proves the NEGATIVE, which is the half that rots silently: that Pathfinder 2e and Intuitive
// Games are never handed 5e's answer, or each other's, when nobody asked.
//
// The distinction matters because the two failures look nothing alike. A positive lookup returning
// the wrong system is loud — a PF2 sheet showing "Path of the Totem Warrior" is obviously broken. A
// negative failure is silent: a dispatcher whose `default:` arm happens to be 5e serves plausible,
// well-formed, WRONG data to every system that was never given a case. The player has no way to
// catch it, because the answer looks exactly like an answer.
//
// Four things are asserted here, chosen because each one has already been got wrong somewhere in
// this codebase (see KNOWN_BLEED at the bottom for the four live ones):
//   1. Every content dispatcher returns empty for unknown / null / undefined — never a 5e default.
//   2. No PF2 or IG module VALUE-imports a 5e content module, or the other subsystem. Source walk.
//   3. PF2's conditions are NUMERIC where 5e's are binary — asserted on the data, not on a comment.
//   4. Each system's skill list is its own object with its own signature; the genuine name overlap
//      is allowlisted with a reason, so a NEW overlap has to be justified rather than absorbed.
//
// What this file deliberately does NOT do is invent differences. PF2 and IG really do share a
// three-action economy, three saves, and a d20 roll-high core, and the six ability scores are the
// same six in all four systems. Agreement is not bleed. Only one system USING another's definition
// is, and that is what each assertion below is shaped to detect.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { spellCatalog, spellsForSystem, findSpellForSystem } from '@/lib/dnd/spells';
import { spellMechanicsFor } from '@/lib/dnd/spells/mechanics';
import { glossaryFor, findTerm } from '@/lib/dnd/glossary';
import { classesForSystem, subclassesFor, findClass } from '@/lib/dnd/classes/registry';
import {
  rulesForSystem, systemSkills, systemClasses, systemClassNames, systemSpecies, systemConditions,
  expectedProfBonus,
} from '@/lib/dnd/system-rules';
import { termIndexFor } from '@/lib/dnd/term-index';
import { speciesView } from '@/lib/dnd/species/view';
import { classifyElement } from '@/lib/dnd/provenance';

// Used by section 6 (the fixed bleeds), which asserts behaviour rather than reading source text.
import { resolveFeat, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { gateEdits, type RulesGateContext } from '@/lib/dnd/rules-gate';
import { buildGrantEdits, isGrantError } from '@/lib/dnd/library-grant';
import { defaultCurrencies } from '@/lib/dnd/currency';

import { CONDITION_MECHANICS_5E } from '@/lib/dnd/conditions/dnd5e';
import { PF2_CONDITION_MECHANICS, pf2ConditionRollEffect } from '@/lib/dnd/conditions/pathfinder2e';
import { IG_CONDITION_MECHANICS } from '@/lib/dnd/conditions/intuitive-games';

const ROOT = process.cwd();

/** The systems this file is about, plus the two 5e editions they must never be confused with. */
const PF2 = 'pathfinder2e';
const IG = 'intuitive-games';
const D2024 = 'dnd5e-2024';
const D2014 = 'dnd5e-2014';

/** The three ways a system key can arrive as "no system at all". A dispatcher must treat all three
 *  identically — `undefined` in particular is what a missing DB column deserialises to, and it is
 *  the one most likely to slip past a `=== null` check into a 5e default arm. */
const NO_SYSTEM = [
  ['an unknown key', 'a-made-up-system'],
  ['null', null],
  ['undefined', undefined],
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dispatchers: unknown / null / undefined must yield NOTHING, never 5e.
// ─────────────────────────────────────────────────────────────────────────────

describe('every content dispatcher returns empty for a system it does not know', () => {
  // Each entry is [name, fn]. The fn takes a system key and returns something array-like or
  // nullish. Grouping them means a NEW dispatcher added without this guard is one line away from
  // being covered, rather than needing its own bespoke test nobody writes.
  const ARRAY_DISPATCHERS: [string, (s: never) => unknown[]][] = [
    ['spellsForSystem', (s) => spellsForSystem(s)],
    ['spellCatalog().spells', (s) => spellCatalog(s).spells],
    ['spellMechanicsFor', (s) => spellMechanicsFor(s)],
    ['glossaryFor', (s) => glossaryFor(s as unknown as string)],
    ['classesForSystem', (s) => classesForSystem(s as unknown as string)],
    ['subclassesFor(barbarian)', (s) => subclassesFor(s as unknown as string, 'barbarian')],
    ['systemSkills', (s) => systemSkills(s)],
    ['systemClasses', (s) => systemClasses(s)],
    ['systemClassNames', (s) => systemClassNames(s)],
    ['systemSpecies', (s) => systemSpecies(s)],
    ['systemConditions', (s) => systemConditions(s)],
    ['termIndexFor', (s) => termIndexFor(s as unknown as string)],
  ];

  for (const [label, value] of NO_SYSTEM) {
    for (const [name, fn] of ARRAY_DISPATCHERS) {
      it(`${name} → [] for ${label}`, () => {
        // `toEqual([])` rather than `.length === 0`: it also catches a dispatcher that returns a
        // non-empty array of the wrong shape, and prints the leaked content on failure.
        expect(fn(value as never)).toEqual([]);
      });
    }
  }

  it('the nullish dispatchers return null/undefined rather than a 5e stand-in', () => {
    for (const [, value] of NO_SYSTEM) {
      expect(rulesForSystem(value as never)).toBeNull();
      expect(findClass(value as unknown as string, 'barbarian')).toBeNull();
      expect(findTerm(value as unknown as string, 'Frightened')).toBeNull();
      expect(findSpellForSystem(value as never, 'fireball')).toBeUndefined();
      // A species name with no system resolves as `custom` (name only) — never 5e's trait block.
      expect(speciesView(value as never, 'Elf')?.source).toBe('custom');
      expect(speciesView(value as never, 'Elf')?.traits).toEqual([]);
    }
  });

  it('a guard against the guard: the same calls DO return content for a real system', () => {
    // Without this, every assertion above could pass because the dispatchers are all broken and
    // return [] for everything — "nothing leaks" is trivially true of a function that does nothing.
    expect(spellsForSystem(D2024).length).toBeGreaterThan(0);
    expect(glossaryFor(D2024).length).toBeGreaterThan(0);
    expect(classesForSystem(D2024).length).toBeGreaterThan(0);
    expect(systemSkills(PF2 as never).length).toBeGreaterThan(0);
    expect(systemSkills(IG as never).length).toBeGreaterThan(0);
    expect(termIndexFor(D2024).length).toBeGreaterThan(0);
    expect(rulesForSystem(PF2 as never)).not.toBeNull();
  });
});

describe('PF2 and IG are not silently served 5e content by a dispatcher', () => {
  it('neither system receives a 5e spell catalog', () => {
    // 5e spells are the largest body of content in lib/dnd, so a widened dispatcher shows up here
    // first. Neither PF2 nor IG routes its spells through `spells/` — PF2 has PF2_SPELLS in its own
    // content module, IG has IG_POWERS — so both must be empty at this dispatcher, not partial.
    for (const sys of [PF2, IG]) {
      expect(spellsForSystem(sys), `${sys} spell catalog`).toEqual([]);
      expect(findSpellForSystem(sys, 'Fireball'), `${sys} Fireball`).toBeUndefined();
      // Spellcasting-machinery explainers are 5e's concentration/ritual/slot model. PF2 uses spell
      // RANKS and 2-action casts; IG uses Spellcraft checks. Serving either 5e's would be wrong.
      expect(spellMechanicsFor(sys), `${sys} spell mechanics`).toEqual([]);
    }
  });

  it('neither system receives 5e conditions or 5e damage types through the term index', () => {
    // term-index.ts gates both behind an `is5e` boolean. Its own header records that the first
    // version pushed them unconditionally and handed the 5e condition list to every system — this
    // is the regression test for that specific bug, extended to PF2 and IG by name.
    const fiveEOnly = ['condition', 'damage'] as const;
    for (const sys of [PF2, IG]) {
      const kinds = new Set(termIndexFor(sys).map((t) => t.kind));
      for (const k of fiveEOnly) {
        expect(kinds.has(k), `${sys} term index must not carry 5e ${k} terms`).toBe(false);
      }
    }
    // And the positive half: 5e DOES get them, so the assertion above is discriminating.
    const kinds2024 = new Set(termIndexFor(D2024).map((t) => t.kind));
    expect(kinds2024.has('condition')).toBe(true);
    expect(kinds2024.has('damage')).toBe(true);
  });

  it('a 5e-only class never resolves under PF2 or IG', () => {
    // Warlock is 5e-only (PF2 has Witch and Oracle; IG has Eldritch Binder). If a registry ever
    // widened, this is the cheapest possible detector.
    for (const sys of [PF2, IG]) {
      expect(findClass(sys, 'warlock'), `${sys} warlock`).toBeNull();
      expect(subclassesFor(sys, 'wizard'), `${sys} wizard subclasses`).toEqual([]);
    }
  });

  it('provenance classifies against the character\'s OWN system, not a shared vanilla list', () => {
    // A "Paladin" is vanilla in 5e and custom in PF2 and IG (neither has the class). If provenance
    // ever consulted a merged list, every system would call every other system's class vanilla —
    // and the vanilla-rules enforcement built on top of it would stop refusing anything.
    expect(classifyElement(D2024 as never, 'class', 'Paladin')).toBe('vanilla');
    expect(classifyElement(PF2 as never, 'class', 'Paladin')).toBe('custom');
    expect(classifyElement(IG as never, 'class', 'Paladin')).toBe('custom');
    // Symmetrically, each system's own signature class is vanilla only to itself.
    expect(classifyElement(PF2 as never, 'class', 'Oracle')).toBe('vanilla');
    expect(classifyElement(D2024 as never, 'class', 'Oracle')).toBe('custom');
    expect(classifyElement(IG as never, 'class', 'Eldritch Binder')).toBe('vanilla');
    expect(classifyElement(PF2 as never, 'class', 'Eldritch Binder')).toBe('custom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Import graph: a source-tree walk, in the style of no-orphan-modules.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Every .ts/.tsx file under a root, relative to the repo, POSIX-separated. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        // __tests__ inside a subsystem is excluded: a test MAY legitimately import 5e content to
        // assert that the two differ, which is the opposite of bleed.
        if (['node_modules', '.next', '.git', '__tests__'].includes(entry.name)) continue;
        walk(rel);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(rel);
      }
    }
  };
  walk(root);
  return out;
}

const PF2_FILES = sourceFiles('lib/dnd/systems/pathfinder2e');
const IG_FILES = sourceFiles('lib/dnd/systems/intuitive-games');

/** Module paths that are 5e CONTENT — a rule, a number, or a named piece of 5e's game.
 *
 *  Matched as a path fragment against the resolved specifier. Deliberately NOT including
 *  `lib/dnd/system-rules` or `lib/dnd/systems`: those are the per-system REGISTRY and its dispatcher,
 *  which is precisely the sanctioned way to reach content. The rule is "never widen one system's
 *  module", not "never import anything shared". */
const FIVE_E_CONTENT = [
  'lib/dnd/spells/dnd5e',
  'lib/dnd/feats/dnd5e',
  'lib/dnd/classes/dnd5e',
  'lib/dnd/conditions/dnd5e',
  'lib/dnd/equipment/dnd5e',
  'lib/dnd/species/dnd5e',
  'lib/dnd/backgrounds/dnd5e',
  'lib/dnd/languages/dnd5e',
  'lib/dnd/mechanics/dnd5e',
  'lib/dnd/companions/dnd5e',
  'lib/dnd/glossary/dnd5e',
  // NOT listed: `lib/dnd/stances/`. It looks like a shared mechanic directory but contains exactly
  // one file, `intuitive-games.ts` — IG's own stance rules, which simply live outside `systems/`
  // for historical reasons. IG importing it is a system reaching for its OWN content. (This was
  // listed here in the first draft of the file and immediately produced a false positive, which is
  // a useful reminder that "shared-looking directory" and "shared content" are different claims.)
];

/**
 * Every import in a file, resolved to a repo-relative path, tagged value-vs-type.
 *
 * TYPE-only imports are separated because they erase at compile time: `import type { Foo }` moves no
 * data and can carry no rule, so it is worth NOTING but is not the failure being hunted. A VALUE
 * import is the real signal — it is the one that can put another system's numbers on a sheet.
 */
function importsOf(file: string): { spec: string; resolved: string | null; typeOnly: boolean }[] {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const fromDir = path.posix.dirname(file);
  const out: { spec: string; resolved: string | null; typeOnly: boolean }[] = [];
  // Captures `import … from 'x'` and `export … from 'x'`, remembering whether the `type` keyword
  // led the clause. A per-specifier `{ type Foo }` still counts as a value import of the module,
  // which is the conservative reading: the module is still evaluated at runtime.
  for (const m of src.matchAll(/\b(?:import|export)\s+(type\s+)?[^;'"]*?from\s+'([^']+)'/g)) {
    const typeOnly = Boolean(m[1]);
    const spec = m[2];
    const resolved = spec.startsWith('@/')
      ? spec.slice(2)
      : spec.startsWith('.')
        ? path.posix.normalize(path.posix.join(fromDir, spec))
        : null; // a bare package name — never one of ours
    out.push({ spec, resolved, typeOnly });
  }
  return out;
}

/**
 * Import edges that are allowed despite matching a rule below. Every entry states a REASON, and the
 * staleness check further down deletes it the moment it stops being true — same discipline as
 * no-orphan-modules.test.ts's EXEMPT list. An allowlist nobody prunes is just a disabled test.
 */
const ALLOWED_EDGES: Record<string, string> = {
  // (empty today — both subsystems are genuinely clean. Kept as the sanctioned place to record a
  // future exception, so the fix for a real bleed is never "delete the assertion".)
};

const edgeKey = (from: string, to: string) => `${from} → ${to}`;

describe('the PF2 and IG subsystems do not import 5e content', () => {
  it('finds the subsystem files to check', () => {
    // Guards the guard: a broken walk makes every assertion below vacuously pass.
    expect(PF2_FILES.length, 'pathfinder2e source files').toBeGreaterThan(5);
    expect(IG_FILES.length, 'intuitive-games source files').toBeGreaterThan(5);
  });

  it('the resolver actually resolves — it is not returning null for everything', () => {
    // If `resolved` were always null, no edge could ever match and the walk would prove nothing.
    const anyResolved = [...PF2_FILES, ...IG_FILES]
      .flatMap((f) => importsOf(f))
      .filter((i) => i.resolved !== null);
    expect(anyResolved.length).toBeGreaterThan(5);
  });

  const violations: { edge: string; typeOnly: boolean }[] = [];
  for (const file of [...PF2_FILES, ...IG_FILES]) {
    for (const imp of importsOf(file)) {
      if (!imp.resolved) continue;
      if (!FIVE_E_CONTENT.some((p) => imp.resolved!.startsWith(p))) continue;
      if (edgeKey(file, imp.resolved) in ALLOWED_EDGES) continue;
      violations.push({ edge: edgeKey(file, imp.resolved), typeOnly: imp.typeOnly });
    }
  }

  it('no VALUE import of a 5e content module (the real bleed signal)', () => {
    // A value import evaluates the 5e module at runtime and hands its data to the subsystem. This
    // is the assertion that matters: it is how a 5e feat, spell, condition or weapon stat ends up
    // on a PF2 or IG sheet without anyone choosing to put it there.
    expect(
      violations.filter((v) => !v.typeOnly).map((v) => v.edge),
      'A PF2/IG module is importing 5e content as a VALUE. Route it through the per-system ' +
      'dispatcher, give the subsystem its own definition, or add the edge to ALLOWED_EDGES with a ' +
      'reason explaining why this system legitimately uses 5e\'s data.',
    ).toEqual([]);
  });

  it('no TYPE-only import of a 5e content module either (weaker signal, still recorded)', () => {
    // Type-only imports erase at compile time and cannot move a number, so this is a lower bar than
    // the assertion above. It is still asserted, because a shared TYPE is usually the first step
    // toward a shared VALUE: once PF2 speaks in `Feat`, importing FEATS_2024 stops looking odd.
    expect(violations.filter((v) => v.typeOnly).map((v) => v.edge)).toEqual([]);
  });

  it('PF2 and IG do not import each other', () => {
    // The subtler direction, and the easier mistake: the two subsystems are structurally similar
    // (both 3-action, both three-save, both degree-of-success), so borrowing "the one that already
    // works" is tempting. They are still different games. Comments referencing the other subsystem
    // as a structural precedent are fine and common here — only real import edges are checked.
    const crossed: string[] = [];
    for (const file of PF2_FILES) {
      for (const imp of importsOf(file)) {
        if (imp.resolved?.startsWith('lib/dnd/systems/intuitive-games')) crossed.push(edgeKey(file, imp.resolved));
      }
    }
    for (const file of IG_FILES) {
      for (const imp of importsOf(file)) {
        if (imp.resolved?.startsWith('lib/dnd/systems/pathfinder2e')) crossed.push(edgeKey(file, imp.resolved));
      }
    }
    expect(crossed, 'PF2 and IG are separate games; neither may reach into the other.').toEqual([]);
  });

  it('every ALLOWED_EDGES entry is still real, and still needed', () => {
    // Self-cleaning, like EXEMPT in no-orphan-modules. An allowlist entry that outlives its edge is
    // a lie about the codebase and a hole waiting for the next import to fall into.
    const stale = Object.keys(ALLOWED_EDGES).filter((key) => {
      const [from, to] = key.split(' → ');
      if (!fs.existsSync(path.join(ROOT, from))) return true;
      return !importsOf(from).some((i) => i.resolved === to);
    });
    expect(stale, 'These allowlisted edges no longer exist — remove them.').toEqual([]);
    for (const [edge, reason] of Object.entries(ALLOWED_EDGES)) {
      expect(reason.length, `${edge} needs a real reason, not a placeholder`).toBeGreaterThan(40);
    }
  });
});

describe('the bespoke sheets render their own system\'s concepts', () => {
  // The sheets are where a bleed becomes visible to a player, so they get their own check. Source
  // inspection rather than rendering: the question is whether the FILE reaches for 5e's modules,
  // which is answerable statically and does not need a DOM.
  const sheets = ['app/dnd/_ui/PF2Sheet.tsx', 'app/dnd/_ui/IGSheet.tsx'];

  it('neither sheet imports a 5e content module', () => {
    for (const sheet of sheets) {
      const bad = importsOf(sheet)
        .filter((i) => i.resolved && FIVE_E_CONTENT.some((p) => i.resolved!.startsWith(p)))
        // IGSheet legitimately imports lib/dnd/stances/intuitive-games — its OWN stance module,
        // which lives in the shared `stances/` directory rather than under `systems/`.
        .filter((i) => !i.resolved!.includes('intuitive-games'))
        .map((i) => `${sheet} → ${i.resolved}`);
      expect(bad, `${sheet} must not reach for 5e content`).toEqual([]);
    }
  });

  it('each sheet folds conditions through its OWN system\'s penalty model', () => {
    // The concrete leak this prevents: a bespoke sheet calling conditionMechanics5e, which would
    // silently apply 5e's binary condition effects to a system whose conditions are numeric.
    const pf2 = fs.readFileSync(path.join(ROOT, 'app/dnd/_ui/PF2Sheet.tsx'), 'utf8');
    const ig = fs.readFileSync(path.join(ROOT, 'app/dnd/_ui/IGSheet.tsx'), 'utf8');
    // PF2 folds conditions in `resolve.ts` now rather than at the sheet's roll call site — the
    // sheet used to display an unconditioned number and roll a conditioned one, so the fold moved
    // to the single place both read. The anti-bleed property is unchanged and still asserted: the
    // PF2 path must use PF2's own numeric, type-stacking model and never 5e's binary one.
    const pf2Resolve = fs.readFileSync(path.join(ROOT, 'lib/dnd/systems/pathfinder2e/resolve.ts'), 'utf8');
    expect(pf2Resolve).toContain('PF2_CONDITION_MECHANICS');
    expect(pf2).toContain('pf2ResolveAll');
    expect(ig).toContain('igConditionRollEffect');
    for (const src of [pf2, pf2Resolve, ig]) {
      expect(src).not.toContain('conditionMechanics5e');
      expect(src).not.toContain('CONDITION_MECHANICS_5E');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Mechanical definitions: asserted on the DATA, not on a comment.
// ─────────────────────────────────────────────────────────────────────────────

describe('conditions: three systems, three genuinely different models', () => {
  it('PF2 conditions carry NUMERIC values where 5e\'s are binary', () => {
    // The single sharpest test that PF2 has not been given 5e's condition model. In 5e you either
    // have Frightened or you do not. In PF2 you have Frightened 2, and the number IS the penalty.
    // A shared module could not express both, so if this ever passes trivially, check that
    // PF2_CONDITION_MECHANICS has not been replaced by an alias of the 5e list.
    const valued = PF2_CONDITION_MECHANICS.filter((c) => c.valued);
    expect(valued.length, 'PF2 must have valued conditions').toBeGreaterThanOrEqual(5);
    for (const name of ['Frightened', 'Clumsy', 'Drained']) {
      const c = PF2_CONDITION_MECHANICS.find((x) => x.name === name);
      expect(c, `PF2 ${name}`).toBeDefined();
      expect(c!.valued, `PF2 ${name} must be numeric`).toBe(true);
    }
    // 5e's records have no notion of a value at all — the field does not exist on the type or data.
    for (const c of CONDITION_MECHANICS_5E) {
      expect(c, `5e ${c.name}`).not.toHaveProperty('valued');
      expect(c, `5e ${c.name}`).not.toHaveProperty('value');
    }
  });

  it('the numeric value actually drives the maths (not just a flag on the record)', () => {
    // Proves the numbers are LOAD-BEARING. Frightened 3 is a −3; Frightened 1 is a −1. If PF2 had
    // been given a binary model wearing a `valued` flag, both would come out the same.
    expect(pf2ConditionRollEffect([{ name: 'Frightened', value: 3 }], 'attack').penalty).toBe(-3);
    expect(pf2ConditionRollEffect([{ name: 'Frightened', value: 1 }], 'attack').penalty).toBe(-1);
    // And PF2's same-type non-stacking rule, which neither 5e nor IG has: two STATUS penalties do
    // not add (worst wins), but a STATUS and a CIRCUMSTANCE penalty do.
    const twoStatus = pf2ConditionRollEffect(
      [{ name: 'Frightened', value: 2 }, { name: 'Sickened', value: 1 }], 'attack',
    );
    expect(twoStatus.penalty, 'two status penalties do not stack — worst wins').toBe(-2);
    const mixed = pf2ConditionRollEffect(
      [{ name: 'Frightened', value: 2 }, { name: 'Prone' }], 'attack',
    );
    expect(mixed.penalty, 'status + circumstance DO stack').toBe(-4);
  });

  it('the three condition modules are distinct data with distinct shapes', () => {
    // Object identity plus shape. Identity alone would miss a copy-paste; shape alone would miss an
    // aliased export. Together they say: nobody is serving one list under three names.
    expect(PF2_CONDITION_MECHANICS).not.toBe(CONDITION_MECHANICS_5E as unknown);
    expect(IG_CONDITION_MECHANICS).not.toBe(CONDITION_MECHANICS_5E as unknown);
    expect(PF2_CONDITION_MECHANICS).not.toBe(IG_CONDITION_MECHANICS as unknown);
    // 5e models a condition as a list of mechanical effects; PF2 as a typed, possibly-valued
    // penalty; IG as the roll kinds it imposes disadvantage on. Three different games.
    expect(Object.keys(CONDITION_MECHANICS_5E[0])).toContain('effects');
    expect(Object.keys(PF2_CONDITION_MECHANICS[0])).toContain('valued');
    expect(Object.keys(IG_CONDITION_MECHANICS[0])).toContain('disadvantageOn');
  });

  it('each system\'s CONDITION LIST is its own, with names the others do not have', () => {
    const names = (s: string) => new Set(systemConditions(s as never));
    const five = names(D2024), pf2 = names(PF2), ig = names(IG);
    // Off-Guard is PF2 Remaster only (5e has nothing like it; IG still calls its version
    // Flat-Footed, PF2's own pre-Remaster name — proof the two lists were authored separately).
    expect(pf2.has('Off-Guard')).toBe(true);
    expect(five.has('Off-Guard')).toBe(false);
    expect(ig.has('Off-Guard')).toBe(false);
    expect(ig.has('Flat-Footed')).toBe(true);
    expect(pf2.has('Flat-Footed'), 'PF2 Remaster renamed this — it must not reappear').toBe(false);
    // Numeric-only PF2 conditions have no 5e or IG counterpart at all.
    for (const n of ['Clumsy', 'Drained', 'Enfeebled', 'Stupefied', 'Dying', 'Wounded']) {
      expect(five.has(n), `5e must not have PF2's ${n}`).toBe(false);
      expect(ig.has(n), `IG must not have PF2's ${n}`).toBe(false);
    }
    // And IG's own weather/equipment conditions exist in neither of the others.
    for (const n of ['Heatstroke', 'Hypothermia', 'Broken']) {
      expect(five.has(n), `5e must not have IG's ${n}`).toBe(false);
      expect(pf2.has(n), `PF2 must not have IG's ${n}`).toBe(false);
    }
  });
});

describe('proficiency: a flat bonus is a 5e concept and must stay one', () => {
  it('only the 5e editions have a proficiency-bonus table', () => {
    // 5e adds a flat +2..+6 by level. PF2 adds a RANK bonus plus your full level. IG adds your level
    // and nothing else. A non-null table for PF2 or IG would mean one of them had been modelled
    // with 5e's progression — the exact "borrowed mechanic" this audit exists to catch.
    for (const sys of [D2024, D2014]) {
      expect(rulesForSystem(sys as never)!.profBonusByLevel, `${sys}`).not.toBeNull();
      expect(expectedProfBonus(sys as never, 1)).toBe(2);
      expect(expectedProfBonus(sys as never, 17)).toBe(6);
    }
    for (const sys of [PF2, IG]) {
      expect(rulesForSystem(sys as never)!.profBonusByLevel, `${sys} must have no flat table`).toBeNull();
      expect(expectedProfBonus(sys as never, 1), `${sys} level 1`).toBeNull();
      expect(expectedProfBonus(sys as never, 17), `${sys} level 17`).toBeNull();
    }
  });

  it('PF2 names its four ranks and IG names its level rule, in their own words', () => {
    // Asserted on the authoritative rules text because that text is what is injected into every AI
    // prompt. If PF2's ranks vanished from it, the AI would start producing 5e-shaped PF2 sheets.
    const pf2 = rulesForSystem(PF2 as never)!.proficiency;
    for (const rank of ['Trained', 'Expert', 'Master', 'Legendary']) {
      expect(pf2, `PF2 proficiency text must name ${rank}`).toContain(rank);
    }
    expect(rulesForSystem(IG as never)!.proficiency.toLowerCase()).toContain('level');
  });

  it('level range: IG stops at 10 and must never be given 5e/PF2 level maths', () => {
    // IG's own keyFacts call this out explicitly ("Levels run 1–10 only"). A silent widening to 20
    // would let the builder offer levels that do not exist in the game.
    expect(rulesForSystem(IG as never)!.levelMax).toBe(10);
    expect(rulesForSystem(PF2 as never)!.levelMax).toBe(20);
    expect(rulesForSystem(D2024 as never)!.levelMax).toBe(20);
  });
});

describe('saves and action economy: shared where the games agree, never borrowed', () => {
  it('PF2 and IG use three saves; 5e uses six — and each states it itself', () => {
    // A "shared, and correctly so" case, asserted rather than assumed. PF2 and IG genuinely both
    // use Fortitude/Reflex/Will. What is checked is that each system's text says so IN ITS OWN
    // ENTRY, so agreement is two independent statements rather than one shared one.
    for (const sys of [PF2, IG]) {
      const saves = rulesForSystem(sys as never)!.saves;
      for (const s of ['Fortitude', 'Reflex', 'Will']) expect(saves, `${sys} saves`).toContain(s);
    }
    // The entries are not the same string — each describes its own maths.
    expect(rulesForSystem(PF2 as never)!.saves).not.toBe(rulesForSystem(IG as never)!.saves);
    // 5e's is a per-ability model and says so.
    expect(rulesForSystem(D2024 as never)!.saves).toContain('Six saving throws');
  });

  it('5e\'s Bonus Action appears in no other system\'s action economy', () => {
    // The cleanest single marker of 5e's action economy. 5e GRANTS one; PF2 and IG must never be
    // described as having one.
    //
    // Matched on the granting phrase "one Bonus Action" rather than the bare words, because PF2's
    // entry legitimately contains "bonus action" inside an explicit DENIAL — 'There is no separate
    // "bonus action"' — which is the system correctly distinguishing itself from 5e. A naive
    // substring check flagged that denial as a leak on the first run. Asserting on the grant is the
    // difference between "does this system have the mechanic" and "does this text mention it".
    for (const sys of [PF2, IG]) {
      expect(rulesForSystem(sys as never)!.actionEconomy.toLowerCase(), `${sys}`).not.toContain('one bonus action');
    }
    expect(rulesForSystem(D2024 as never)!.actionEconomy).toContain('one Bonus Action');
    // PF2 goes further and rules the mechanic out by name. Pinned, because that sentence is what
    // keeps an AI-generated PF2 sheet from inventing one.
    expect(rulesForSystem(PF2 as never)!.actionEconomy).toContain('no separate "bonus action"');
    // The positive half: both non-5e systems really do declare three actions.
    for (const sys of [PF2, IG]) {
      expect(rulesForSystem(sys as never)!.actionEconomy.toUpperCase()).toContain('THREE ACTION');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Skills: overlap is real, so it is ALLOWLISTED rather than forbidden.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Skill names that legitimately appear in more than one system. These are NOT bleed: Acrobatics,
 * Nature and Stealth are genuinely skills in D&D, Pathfinder and Intuitive Games alike, and the
 * brief is explicit that two systems happening to agree is not a failure.
 *
 * The list exists so that a NEW overlap has to be looked at. If PF2 suddenly gained "Sleight of
 * Hand" (a 5e name PF2 folds into Thievery), that is a signal someone pasted 5e's list, and it
 * would fail here rather than blend in.
 */
const ALLOWED_SKILL_OVERLAP: Record<string, string> = {
  Acrobatics: 'A real skill in all three systems, under the same name and the same DEX attribute.',
  Arcana: 'Real in 5e and PF2 (INT). IG spells its own differently — Arcane (CHA) and Spellcraft (INT).',
  Athletics: 'Real in 5e and PF2 (STR). IG splits the same ground into Climb/Swim/Grapple instead.',
  Deception: 'Real in 5e and PF2 (CHA). IG calls its equivalent Bluff, so no three-way overlap.',
  Diplomacy: 'Real in PF2 and IG (CHA). 5e calls its equivalent Persuasion.',
  Intimidation: 'Real in 5e and PF2 (CHA). IG uses the shorter Intimidate.',
  Lore: 'Real in PF2 (a family of INT skills) and in IG. 5e has no Lore skill.',
  Medicine: 'Real in 5e and PF2 (WIS). IG calls its equivalent Heal.',
  Nature: 'Real in all three (WIS in 5e and IG, WIS in PF2) — the same real-world skill.',
  Perception: 'Real in 5e and IG as a skill. In PF2 it is deliberately NOT a skill (it is its own proficiency), which is why PF2 does not appear in this overlap.',
  Performance: 'Real in 5e and PF2 (CHA). IG uses Perform.',
  Religion: 'Real in all three. Each maps it to its own attribute per its own rules.',
  'Sleight of Hand': 'Real in 5e and IG. PF2 folds the same ground into Thievery, so PF2 must NOT have it.',
  Stealth: 'Real in all three (DEX) — the same real-world skill under the same name.',
  Survival: 'Real in 5e and PF2 (WIS). IG has no Survival skill.',
};

describe('skills: each system owns its list; the overlap is real and allowlisted', () => {
  const skillNames = (s: string) => systemSkills(s as never).map((x) => x.name);
  // Typed as a plain string map so the pairwise loops below can index it with a system key held in
  // a variable rather than a literal.
  const sets: Record<string, Set<string>> = {
    [D2024]: new Set(skillNames(D2024)),
    [PF2]: new Set(skillNames(PF2)),
    [IG]: new Set(skillNames(IG)),
  };

  it('the three lists are separate arrays, not one list under three names', () => {
    const a = systemSkills(D2024 as never), b = systemSkills(PF2 as never), c = systemSkills(IG as never);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
    // Different lengths make an accidental aliasing impossible to miss.
    expect(new Set([a.length, b.length, c.length]).size, 'all three lists have distinct sizes').toBe(3);
  });

  it('every cross-system skill name is either unique or explicitly allowlisted', () => {
    const pairs: [string, string][] = [[D2024, PF2], [D2024, IG], [PF2, IG]];
    const unexplained: string[] = [];
    for (const [x, y] of pairs) {
      for (const name of sets[x]) {
        if (sets[y].has(name) && !(name in ALLOWED_SKILL_OVERLAP)) unexplained.push(`${name} (${x} ∩ ${y})`);
      }
    }
    expect(
      unexplained,
      'A skill name now appears in two systems without an entry in ALLOWED_SKILL_OVERLAP. Either ' +
      'the two games really do share it (add it with a one-line reason), or one system\'s list was ' +
      'widened with another\'s — which is the bleed this guard exists to catch.',
    ).toEqual([]);
  });

  it('every allowlisted overlap still actually occurs in at least two systems', () => {
    // Self-cleaning: a reason that no longer describes reality is worse than no reason, because it
    // documents a relationship that has since changed.
    const stale = Object.keys(ALLOWED_SKILL_OVERLAP).filter(
      (n) => [sets[D2024], sets[PF2], sets[IG]].filter((s) => s.has(n)).length < 2,
    );
    expect(stale, 'These no longer overlap — remove them from ALLOWED_SKILL_OVERLAP.').toEqual([]);
    for (const [name, reason] of Object.entries(ALLOWED_SKILL_OVERLAP)) {
      expect(reason.length, `${name} needs a real reason`).toBeGreaterThan(30);
    }
  });

  it('each system keeps skills the others simply do not have', () => {
    // The positive proof that the lists were authored per-system. If any of these fell to zero,
    // the list would have been flattened toward another system's.
    const only = (s: string, others: string[]) =>
      [...sets[s]].filter((n) => others.every((o) => !sets[o].has(n)));
    expect(only(PF2, [D2024, IG]), 'PF2-only skills').toEqual(
      expect.arrayContaining(['Crafting', 'Occultism', 'Society', 'Thievery']),
    );
    expect(only(IG, [D2024, PF2]).length, 'IG-only skills').toBeGreaterThan(10);
    expect(only(D2024, [PF2, IG]).length, '5e-only skills').toBeGreaterThan(2);
  });

  it('PF2 has no Perception SKILL — it is a separate proficiency in that system', () => {
    // A real structural difference that a 5e-shaped paste would erase, and one that would be easy
    // to "fix" wrongly by adding it.
    expect(sets[PF2].has('Perception')).toBe(false);
    expect(sets[D2024].has('Perception')).toBe(true);
    expect(sets[IG].has('Perception')).toBe(true);
  });

  it('IG\'s combat manoeuvres are skills — a model neither 5e nor PF2 uses', () => {
    // IG makes Grapple, Trip, Disarm and friends into rollable SKILLS. In 5e they are contested
    // checks and in PF2 they are Athletics actions. Their presence here is proof IG's list came
    // from IG's own sheet rather than from either neighbour.
    for (const n of ['Grapple', 'Trip', 'Disarm', 'Feint', 'Sunder']) {
      expect(sets[IG].has(n), `IG ${n}`).toBe(true);
      expect(sets[D2024].has(n), `5e must not have ${n} as a skill`).toBe(false);
      expect(sets[PF2].has(n), `PF2 must not have ${n} as a skill`).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. The bleeds this audit FOUND, recorded rather than hidden.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Four confirmed bleeds found by the 2026-07-21 audit and NOT fixed here, because each is a
 * behaviour change that needs an owner decision rather than a mechanical cleanup (B3 in particular
 * changes IG combat maths). Recording them the way no-orphan-modules.test.ts records its GAPs: the
 * claim is asserted, so it cannot be quietly downgraded to "fine" by editing a comment, and the
 * staleness check below forces the entry to be deleted once the bleed is actually gone.
 */
const KNOWN_BLEED: Record<string, { file: string; direction: string; reason: string }> = {
  // B1, B2 and B4 were FIXED on 2026-07-21 and their entries deleted, exactly as this map's
  // contract requires. What replaced them is the `the fixed bleeds stay fixed` block below: the
  // records are gone, but the behaviour they described is now asserted from the other side, so
  // nothing is merely trusted to have been dealt with.
  'B3 IG is given PF2 degrees of success': {
    file: 'lib/dnd/systems/intuitive-games/rules.ts',
    direction: 'pathfinder2e → intuitive-games',
    reason:
      'MEDIUM-HIGH. igDegreeOfSuccess (and fourStepDegree in lib/dnd/roll.ts) use PF2\'s FOUR-step ' +
      'ladder on a plus/minus 10 threshold. IG\'s own rule is a FIVE-step ladder on 20, with Partial ' +
      'Success on an exact tie — see system-rules.ts coreResolution, the Critical Focus feat, the ' +
      'Expanded Critical enchantment, and ~30 IG spells that specify a Partial Success outcome.',
  },
  'B4 defaultCurrencies falls through to 5e coins': {
    file: 'lib/dnd/currency.ts',
    direction: 'dnd5e → intuitive-games (and every unknown system)',
    reason:
      'MEDIUM. PF2 gets an explicit case; every other system hits the 5e default arm, so an IG sheet ' +
      'starts with 5e coins including Electrum. IG has its own authored currency (IG_CURRENCY in ' +
      'systems/intuitive-games/items.ts): 10 Pennies = 1 Coin, 2 Coins = 1 Solidas.',
  },
};

describe('the confirmed bleeds are recorded honestly', () => {
  it('every recorded bleed names a real file, a direction, and a reason', () => {
    for (const [id, b] of Object.entries(KNOWN_BLEED)) {
      expect(fs.existsSync(path.join(ROOT, b.file)), `${id}: ${b.file}`).toBe(true);
      expect(b.direction, `${id} direction`).toContain('→');
      expect(b.reason.length, `${id} needs a real reason, not a placeholder`).toBeGreaterThan(80);
      // A severity must be stated, so "how bad is this" is never re-litigated from memory.
      expect(b.reason, `${id} must state a severity`).toMatch(/HIGH|MEDIUM|LOW/);
    }
  });

  it('B3: IG\'s own rules text still disagrees with its degree implementation', () => {
    // Asserted on both sides so the discrepancy itself is the fixture: IG's authoritative text says
    // 20 and names a partial success; its implementation is PF2's 4-step/10 ladder.
    const igRules = rulesForSystem(IG as never)!.coreResolution;
    expect(igRules, 'IG core resolution names a partial success').toContain('partial success');
    expect(igRules, 'IG core resolution uses a 20 threshold').toContain('20');
    const impl = fs.readFileSync(path.join(ROOT, 'lib/dnd/systems/intuitive-games/rules.ts'), 'utf8');
    expect(impl, 'the implementation still uses PF2\'s 10 threshold').toContain('dc + 10');
    expect(impl, 'and still has no partial-success degree').not.toContain('partial-success');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. The bleeds that were FIXED, asserted so they cannot come back.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * B1, B2 and B4 were fixed on 2026-07-21. Their KNOWN_BLEED entries are gone, which is the whole
 * point of that map being self-cleaning — but a deleted record proves nothing on its own, so each
 * fix is asserted here on BEHAVIOUR rather than on source text.
 *
 * Behaviour, specifically, because the staleness checks these replace were `toContain` reads of
 * the source. That is the right shape for recording a bug you are not fixing (it pins the exact
 * wrong line) and the wrong shape for guarding a fix — it would pass for any rename that kept the
 * string and fail for any refactor that did not.
 */
describe('the fixed bleeds stay fixed', () => {
  // CORRECTION to the original KNOWN_BLEED record, which named Toughness as the canonical case.
  // Toughness is NOT in FEATS_2024 (2024's equivalent is called "Tough"), so an unscoped lookup
  // returned undefined for it and no bleed ever occurred on that name. The 2024 feat list in fact
  // shares NO name with PF2's at all — the whole overlap is with Intuitive Games, and it is these
  // four: Alert, Lucky, Great Weapon Fighting, Two-Weapon Fighting. The bug was real; the example
  // recorded against it was not, which is exactly why these are now asserted rather than asserted
  // about.
  const IG_OVERLAP = ['Alert', 'Lucky', 'Great Weapon Fighting', 'Two-Weapon Fighting'];

  it('B1: resolveFeat answers only for the system that owns the feat', () => {
    // Alert is the sharpest case. In 2024 it is an ORIGIN feat granting Initiative proficiency; in
    // IG it is a GENERAL feat, prerequisite Training in Perception, about never being flat-footed.
    // Same name, different category, different rules text, different eligibility.
    expect(resolveFeat('Alert', D2024)?.category).toBe('origin');
    for (const name of IG_OVERLAP) {
      for (const sys of [PF2, IG, D2014]) {
        expect(resolveFeat(name, sys), `${sys} must not resolve 5e's ${name}`).toBeUndefined();
      }
    }
  });

  it('B1: an add_feat on a non-5e sheet is not judged by 5e slot rules', () => {
    // The harm was a REFUSAL: `slot` defaults to 'asi', and a 2024 ORIGIN feat is not legal in an
    // asi slot — so an IG character taking IG's own Alert was refused by 5e's category rules. PF2
    // and IG have their own gates (systems/*/rules-gate.ts), which is where their feats belong.
    const edit = { op: 'add_feat', feat: 'Alert' } as SheetEdit;
    const ctx = (system: string): RulesGateContext => ({
      system, enforce: true, className: 'Fighter', level: 1,
      knownSpells: [], abilities: {}, featureNames: [], hasSpellcasting: false,
    });
    for (const sys of [PF2, IG]) {
      const out = gateEdits([edit], ctx(sys));
      expect(out.edits.length, `${sys} feat must survive the 5e gate`).toBe(1);
      expect(out.refused.length, `${sys} feat must not be refused by 5e rules`).toBe(0);
    }
  });

  it('B2: a granted weapon carries its OWN edition\'s statistics, or none', () => {
    const grant = (system: string) => buildGrantEdits(
      { kind: 'weapon', name: 'Longsword', system, options: {} },
      // Unenforced on purpose: this test is about which EDITION'S STATISTICS come back, and
      // class-and-level binding is a separate axis that would only add noise here.
      { enforce: false, unboundReason: 'no-character-context' },
    );

    // 2024 keeps mastery — it is a real 2024 rule and the fix must not have flattened it away.
    const d2024 = grant(D2024);
    expect(isGrantError(d2024)).toBe(false);
    expect(JSON.stringify(d2024)).toContain('Mastery');

    // 2014 has a Longsword but NO weapon mastery. Both halves matter: real stats, no invented rule.
    const d2014 = grant(D2014);
    expect(isGrantError(d2014)).toBe(false);
    expect(JSON.stringify(d2014), '2014 has no weapon mastery').not.toContain('Mastery');
    expect(JSON.stringify(d2014), '2014 should still get real damage').toContain('1d8');

    // PF2 and IG model weapons entirely differently (traits/runes, damage reduction). The honest
    // outcome is a named item with no statistics — NOT a 5e stat block.
    for (const sys of [PF2, IG]) {
      const out = grant(sys);
      expect(isGrantError(out), `${sys} grant should still succeed`).toBe(false);
      expect(JSON.stringify(out), `${sys} must not receive 5e mastery`).not.toContain('Mastery');
      expect(JSON.stringify(out), `${sys} must not receive 5e damage dice`).not.toContain('1d8');
    }
  });

  it('B4: IG sheets start with IG money, and nobody starts with another system\'s coins', () => {
    const ids = (system: string) => defaultCurrencies(system).map((c) => c.id);
    expect(ids(IG)).toEqual(['penny', 'coin', 'solidas']);
    // Electrum was the tell: 5e-only, and it was landing on IG sheets.
    expect(ids(IG), 'IG has no electrum').not.toContain('ep');
    expect(ids(PF2), 'PF2 has no electrum either').not.toContain('ep');
    expect(ids(D2024), '5e keeps its electrum').toContain('ep');
    // The IG rates must match the authored rule: 10 Pennies = 1 Coin, 2 Coins = 1 Solidas.
    const ig = defaultCurrencies(IG);
    expect(ig.find((c) => c.id === 'coin')!.rate).toBe(10);
    expect(ig.find((c) => c.id === 'solidas')!.rate).toBe(20);
  });
});
