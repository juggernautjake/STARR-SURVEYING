// __tests__/dnd/homebrew-subclass-editable.test.tsx — the subclass draft is editable, and authorable without
// the AI (Slice 5's remaining nice-to-have, second of three; the feat shipped first).
//
// This one needed a server addition the feat did not: a hand-written subclass must name a PARENT CLASS, and
// only the server knows which classes a character's system has — including a homebrew class saved on the
// character, which `classesForSystem` alone cannot see. So the draft route gained a GET returning that list,
// and the form offers a picker instead of asking anyone to guess a class KEY.
//
// The AI POST 503s without a key, so before this a player with no AI key could not begin a subclass at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomebrewSubclassBuilderPage from '@/app/dnd/characters/[id]/build/subclass/page';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const src = read('app/dnd/characters/[id]/build/subclass/page.tsx');
const route = read('app/api/dnd/characters/[id]/homebrew-subclass/route.ts');
const save = read('app/api/dnd/characters/[id]/homebrew-subclass/save/route.ts');

describe('both authoring paths are offered', () => {
  const html = renderToStaticMarkup(React.createElement(HomebrewSubclassBuilderPage));

  it('renders the AI prompt AND a write-it-myself route', () => {
    expect(html).toContain('Draft with AI');
    expect(html).toContain('Write it myself');
  });

  it('shows no form until there is a draft', () => {
    expect(html).not.toContain('Parent class');
  });
});

describe('the parent class is picked, not typed', () => {
  it('the route exposes the system\'s classes read-only', () => {
    expect(route).toContain('export async function GET');
    expect(route).toContain('classesForSystem(system)');
    // The homebrew class saved on the character is a legitimate parent and is invisible to the registry.
    expect(route).toContain('readHomebrewClasses(character.data)');
    expect(route).toContain('custom: true');
    // Read-only: it must not become a second way to mutate the character.
    const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
    expect(get).not.toContain('.update(');
    expect(get).toContain('requireCharacterWrite');
  });

  it('the page fetches them and renders a select', () => {
    expect(src).toContain("fetch(`/api/dnd/characters/${characterId}/homebrew-subclass`)");
    expect(src).toContain('id="hs-parent"');
    expect(src).toContain('Choose a class…');
    expect(src).toContain("{c.custom ? ' (homebrew)' : ''}");
  });

  it('a new feature defaults to the level the parent actually grants one at', () => {
    // Rather than a hard-coded 3, which would be wrong for the classes that differ.
    expect(route).toContain('subclassLevel');
    expect(src).toContain("subclassLevels[draft?.classKey ?? '']");
  });
});

describe('features are editable, not just displayed', () => {
  it('level, name and body each have a control, and rows can be added and removed', () => {
    expect(src).toContain('patchFeature(i, { level:');
    expect(src).toContain('patchFeature(i, { name: e.target.value })');
    expect(src).toContain('patchFeature(i, { body: e.target.value })');
    expect(src).toContain('+ Add a feature');
    expect(src).toContain('features: draft.features.filter((_, j) => j !== i)');
  });

  it('the level is clamped to a real character level', () => {
    expect(src).toContain('Math.max(1, Math.min(20, Number(e.target.value) || 1))');
  });

  it('every feature row is labelled for screen readers', () => {
    // Three bare inputs in a row are unusable without labels, and this form generates N of them.
    for (const l of ['level`}', 'name`}', 'rules text`}']) expect(src).toContain(l);
  });
});

describe('the local checks match what the save route enforces', () => {
  it('the save route requires a parent that RESOLVES and at least one feature', () => {
    expect(save).toContain('if (!input.classKey)');
    expect(save).toContain('findClass(system, input.classKey, readHomebrewClasses(data))');
    expect(save).toContain('if (!subclass.features.length)');
  });

  it('the page refuses the same two, so the button state matches the outcome', () => {
    expect(src).toContain('must belong to a parent class');
    expect(src).toContain('needs at least one feature');
    expect(src).toContain('disabled={saving || !savable}');
  });

  it('an unknown parent key is treated as unresolvable rather than assumed fine', () => {
    // The optimistic version of this check ("no list yet, so allow it") would show Ready to save on a
    // subclass the server then refuses.
    expect(src).toContain('classes.length && !parent');
  });

  it('the page does not claim the parent name unless it resolved one', () => {
    expect(src).toContain("parent ? ` as a ${parent.name} subclass` : ''");
  });
});
