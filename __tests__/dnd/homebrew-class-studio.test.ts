// The class studio (P6-12) — level-by-level authoring, base-class derivation, partial builds.
//
// The owner's ask: *"homebrewed classes can have another class they are based off of that the user
// modifies, or they can be totally new. The user can choose at what levels what buffs and feats and stuff
// become available at every level … the user can build a class to any level they choose and the class will
// just be marked as partially built."*
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftLevelReach, isPartialBuild, fieldsForKind } from '@/lib/dnd/homebrew/kinds';
import { findClass } from '@/lib/dnd/classes/registry';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const route = read('app/api/dnd/homebrew/base-class/route.ts');
const builder = read('app/dnd/_ui/ContentBuilder.tsx');

describe('partial builds are a first-class state', () => {
  it('reach is the highest level written, whatever order they were added in', () => {
    const levels = [{ level: 5 }, { level: 1 }, { level: 3 }];
    expect(draftLevelReach('class', { levels })).toBe(5);
  });

  it('anything short of 20 is partial; 20 is complete', () => {
    expect(isPartialBuild('class', { levels: [{ level: 5 }] })).toBe(true);
    expect(isPartialBuild('class', { levels: [{ level: 20 }] })).toBe(false);
  });

  it('an empty class is partial, not invalid — "save whenever" means from the very start', () => {
    expect(draftLevelReach('class', {})).toBe(0);
    expect(isPartialBuild('class', {})).toBe(true);
  });

  it('kinds with no level dimension report null rather than 0', () => {
    // 0 would read as "a partial build with nothing in it"; null means the question does not apply.
    expect(draftLevelReach('item', {})).toBeNull();
    expect(isPartialBuild('item', {})).toBe(false);
  });

  it('and the editor tells the author BEFORE they save, not after', () => {
    expect(builder).toMatch(/PARTIAL build/);
    expect(builder).toMatch(/level 20/);
  });
});

describe('base-class derivation', () => {
  it('is served from a route rather than shipping every class to the browser', () => {
    // `classesForSystem('dnd5e-2024')` is thirteen classes with full rules text at twenty levels.
    expect(builder).toContain('/api/dnd/homebrew/base-class');
  });

  it('offers classes only for systems that have ClassDefinition data', () => {
    expect(route).toContain('isSharedEngineSystem');
  });

  it('returns DRAFT-shaped keys, so the builder needs no translation layer', () => {
    // A translation layer between the route and the form is a second place for the schema to drift.
    const classFields = fieldsForKind('class').map((f) => f.key);
    for (const k of ['hitDie', 'savingThrows', 'subclassLevel', 'asiLevels', 'levels', 'resources']) {
      expect(classFields, `${k} should be a real class field`).toContain(k);
      expect(route, `the route should emit ${k}`).toContain(`${k}:`);
    }
  });

  it('EXCLUDES subclass features — they belong to a subclass, not the class', () => {
    // Copying them in produces a class that grants one subclass's features to every character who takes it.
    expect(route).toMatch(/filter\(\(f\) => !f\.subclass\)/);
  });

  it('does not inherit the source class’s description', () => {
    // Every derived class reading "The Fighter is a master of martial combat…" is worse than a blank one.
    expect(route).not.toMatch(/description: def\.description/);
  });

  it('and the builder preserves the author’s own name and prose across a derivation', () => {
    expect(builder).toMatch(/name: s\.name, description: s\.description/);
  });

  it('drops the unused index-0 slot from a resource table', () => {
    // `ClassResource.perLevel` is 1-indexed with element 0 unused; emitting it would show the author a
    // leading "0," to delete on every derived class.
    expect(route).toContain('r.perLevel.slice(1)');
  });
});

describe('the derivation matches what the registry actually holds', () => {
  it('a real class has the fields the route reads', () => {
    // Guards against the route drifting from `ClassDefinition` — it reads a dozen properties by name.
    const fighter = findClass('dnd5e-2024', 'fighter');
    expect(fighter, 'the 2024 Fighter should exist').toBeTruthy();
    expect(typeof fighter!.hitDie).toBe('number');
    expect(Array.isArray(fighter!.asiLevels)).toBe(true);
    expect(Array.isArray(fighter!.features)).toBe(true);
    expect(fighter!.skillChoices).toHaveProperty('count');
    expect(fighter!.skillChoices).toHaveProperty('from');
  });

  it('and a derived Fighter would carry real per-level features', () => {
    const fighter = findClass('dnd5e-2024', 'fighter')!;
    const base = fighter.features.filter((f) => !f.subclass);
    expect(base.length).toBeGreaterThan(5);
    expect(Math.max(...base.map((f) => f.level))).toBeGreaterThan(10);
  });
});

describe('the levels editor is built and no longer owed', () => {
  it('has a real editor', () => {
    expect(builder).toMatch(/IMPLEMENTED[\s\S]{0,260}'levels'/);
  });

  it('and NO placeholder is left — this assertion has now flipped twice', () => {
    // Written at P6-12 as "effects is the ONLY placeholder left", which was true for one slice. P6-9 built
    // the effects editor and emptied the list entirely, turning it red. That is what these are for.
    // The stronger, drift-proof version of this claim lives in `homebrew-effects-editor.test.ts`: every
    // field type any kind DECLARES must have an editor. This one just keeps the list honest.
    const owed = builder.slice(builder.indexOf('const OWED_BY'), builder.indexOf('const OWED_BY') + 160);
    for (const gone of ['effects:', 'levels:', 'statblock:', 'list:', 'image:']) {
      expect(owed, `${gone} should have been removed when its editor shipped`).not.toContain(gone);
    }
  });

  it('offers the same choice kinds the level walker prompts on', () => {
    // An author marking a level "asi" is telling the builder to ask the player there, so these must match
    // `ClassFeature['choice']` or the annotation means nothing.
    for (const c of ['asi', 'subclass', 'fighting-style', 'expertise', 'cantrip', 'epic-boon', 'other']) {
      expect(builder, `choice kind ${c} missing`).toContain(`'${c}'`);
    }
  });
});
