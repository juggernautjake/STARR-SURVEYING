// __tests__/dnd/homebrew-class-editable.test.tsx — the class draft is editable, and authorable without the AI.
//
// The third and largest of Slice 5's three designers (feat and subclass shipped in the two slices before),
// which closes the "manual field-by-field edit form on the draft" remainder the slice recorded three times.
//
// The property this file mainly protects is that the page's verdict equals the save route's. The route does
// `parseCustomClassDraft → buildCustomClass → reviewCustomClass`; the page runs the SAME three in the SAME
// order. Skipping the parse would have been the easy mistake: parse is what fills a partial draft's defaults
// (the ASI ladder, the skill list, the subclass choice at its level), so a review that skipped it would judge
// a different object than the server does — and a player would clear every message on screen and still get a
// 400. The last describe here proves the two agree on a real draft rather than trusting the reading.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCustomClass, reviewCustomClass } from '@/lib/dnd/classes/custom';
import { parseCustomClassDraft, splitReview } from '@/lib/dnd/classes/custom-ai';
import HomebrewClassBuilderPage from '@/app/dnd/characters/[id]/build/class/page';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const src = read('app/dnd/characters/[id]/build/class/page.tsx');
const save = read('app/api/dnd/characters/[id]/homebrew-class/save/route.ts');

describe('both authoring paths are offered', () => {
  const html = renderToStaticMarkup(React.createElement(HomebrewClassBuilderPage));

  it('renders the AI prompt AND a write-it-myself route', () => {
    expect(html).toContain('Draft with AI');
    expect(html).toContain('Write it myself');
  });

  it('promises that a saved class levels up like an official one', () => {
    expect(html).toContain('levels up like an official one');
  });

  it('shows no form until there is a draft', () => {
    expect(html).not.toContain('Hit die');
  });
});

describe('the fields that decide how the class PLAYS are editable', () => {
  for (const [what, marker] of [
    ['name', 'hc-name'],
    ['hit die', 'hc-hitdie'],
    ['description', 'hc-desc'],
    ['subclass level', 'hc-sublevel'],
    ['subclass label', 'hc-sublabel'],
    ['ASI levels', 'hc-asi'],
    ['skill count', 'hc-skillcount'],
    ['skill list', 'hc-skillfrom'],
    ['armour', 'hc-armor'],
    ['weapons', 'hc-weapons'],
    ['spellcasting', 'hc-caster'],
  ] as const) {
    it(`${what} has a control`, () => expect(src).toContain(marker));
  }

  it('primary ability and saves are per-ability toggles', () => {
    expect(src).toContain("toggleAbility('primaryAbility', a)");
    expect(src).toContain("toggleAbility('savingThrows', a)");
  });

  it('the casting stat appears only once a casting kind is chosen', () => {
    expect(src).toContain('{draft.caster && (');
    expect(src).toContain('hc-casterab');
  });

  it('choosing None clears the caster block rather than leaving a half-set one', () => {
    expect(src).toContain('{ caster: undefined }');
  });

  it('the ASI ladder is editable, because it drives the level walker\'s prompts', () => {
    // S2 made `snapshotAtLevel` prompt from `asiLevels`, so a homebrew class with an unusual ladder is asked
    // at its own levels. That only helps if the ladder can be set.
    expect(src).toContain('asiLevels: nums(e.target.value)');
    expect(src).toContain('snapshotAtLevel');  // the comment naming why this field matters
  });

  it('features are a repeater with a per-feature CHOICE kind', () => {
    expect(src).toContain('+ Add a feature');
    expect(src).toContain('features: draft.features.filter((_, j) => j !== i)');
    expect(src).toContain("CHOICE_KINDS = ['subclass', 'asi', 'fighting-style', 'expertise', 'cantrip', 'epic-boon', 'other']");
    expect(src).toContain('>granted<');
  });

  it('every generated input is labelled for screen readers', () => {
    for (const l of ['level`}', 'name`}', 'choice kind`}', 'rules text`}']) expect(src).toContain(l);
  });

  it('levels are clamped to a real character level', () => {
    expect(src).toContain('Math.max(1, Math.min(20, Number(e.target.value) || 1))');
  });
});

describe('the page cannot crash mid-edit', () => {
  it('a draft too incomplete to build reports that instead of throwing', () => {
    // `buildCustomClass` can throw on a draft the player is halfway through typing; a white page would be
    // the worst possible response to a keystroke.
    expect(src).toContain('} catch {');
    expect(src).toContain('not complete enough to check yet');
  });
});

describe('the live verdict is the save route\'s verdict', () => {
  it('the page runs the same three functions in the same order', () => {
    expect(src).toContain('parseCustomClassDraft(');
    expect(src).toContain('buildCustomClass(parsed)');
    expect(src).toContain('reviewCustomClass(definition)');
  });

  it('the save route runs them too, and refuses errors', () => {
    expect(save).toContain('parseCustomClassDraft');
    expect(save).toContain('buildCustomClass');
    expect(save).toContain('reviewCustomClass');
    expect(save).toMatch(/if \(!review\.ok\)[\s\S]{0,140}status: 400/);
  });

  it('saving is blocked while the engine reports an error', () => {
    // `savable` folds the engine's verdict together with the page's completeness guard below, so one flag
    // gates the button and the two cannot disagree about whether it should be enabled.
    expect(src).toContain('disabled={saving || !savable}');
    expect(src).toContain('!!built?.review.ok');
  });

  it('the engine PASSES an untouched blank draft — which is why the page adds its own guard', () => {
    // Found by writing this test, and worth pinning as the reason the page is stricter than the engine:
    // `parseCustomClassDraft` defaults a blank name to "Homebrew Class" and `buildCustomClass` injects the
    // subclass feature at its declared level, so nothing is technically "missing". That is right for a draft
    // arriving from a model with fields unset, and wrong as a thing to let someone save.
    const parsed = parseCustomClassDraft({ name: '', hitDie: 8, features: [], system: 'dnd5e-2024' }, 'dnd5e-2024');
    const built = buildCustomClass(parsed);
    expect(splitReview(reviewCustomClass(built)).ok).toBe(true);
    expect(built.name).toBe('Homebrew Class');       // the default that hides the empty field
    expect(built.features.length).toBeGreaterThan(0); // the injected subclass choice
  });

  it('so the page refuses to save an unnamed or featureless class', () => {
    expect(src).toContain('would save as “Homebrew Class”');
    expect(src).toContain('Add at least one feature of your own');
    expect(src).toContain('const savable = !!built?.review.ok && unfinished.length === 0');
    // Stricter than the server is the safe direction; the dangerous one is permitting what it refuses.
    expect(src).toContain('Deliberately NOT fixed in `validateClassDefinition`');
  });

  it('and accepts a genuinely filled-in one', () => {
    const verdict = (d: Record<string, unknown>) => {
      const parsed = parseCustomClassDraft({ ...d, system: 'dnd5e-2024' }, 'dnd5e-2024');
      return splitReview(reviewCustomClass(buildCustomClass(parsed)));
    };
    expect(verdict({
      name: 'Tempest Vow', description: 'A storm-sworn warrior.', hitDie: 10,
      primaryAbility: ['str'], savingThrows: ['str', 'con'],
      skillChoices: { count: 2, from: ['Athletics', 'Insight'] },
      armorProficiencies: ['Light armor'], weaponProficiencies: ['Simple weapons'],
      subclassLevel: 3, subclassLabel: 'Vow',
      features: [{ level: 1, name: 'Storm Touched', body: 'You crackle.' }],
    }).ok).toBe(true);
  });

  it('the page does not invent the character\'s system', () => {
    expect(src).toContain("draft.system || 'set-on-save'");
    expect(src).not.toMatch(/system:\s*'dnd5e-20(14|24)'/);
    expect(save).toContain('normalizeSystem');
  });
});

describe('what is deliberately left to the AI', () => {
  it('per-level resources are not a field, and the page says why', () => {
    // An array of per-level arrays needs a grid editor; that is a slice, not a field. An AI draft keeps its
    // resources, a hand-written class has none, and the engine accepts both.
    expect(src).toContain('`resources` (per-level pools) is the one part of the model left to the AI');
    expect(src).not.toContain('hc-resources');
  });
});
