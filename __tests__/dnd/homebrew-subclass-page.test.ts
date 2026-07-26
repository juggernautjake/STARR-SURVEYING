import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Slice 5 UI — the /build/subclass page + endpoint (subclass logic tested in custom-class-ai.test.ts).
const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/characters/[id]/build/subclass/page.tsx'), 'utf8');
const ROUTE = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/homebrew-subclass/route.ts'), 'utf8');
const SAVE = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/homebrew-subclass/save/route.ts'), 'utf8');

describe('homebrew subclass designer', () => {
  it('page posts the prompt + renders the parent class, features, and warnings', () => {
    expect(PAGE).toContain('/homebrew-subclass');
    // All three still render; what they read changed when the draft became EDITABLE (2026-07-26).
    // · the parent is now resolved from the fetched class list (`parent.name`) rather than from the AI
    //   response's `parentName`, which would go stale the moment the player changed the parent;
    // · features come from the editable `draft`;
    // · the AI's one-shot `warnings` are replaced by `problems`, recomputed from the current draft.
    // See homebrew-subclass-editable.test.tsx.
    expect(PAGE).toContain('parent.name');
    expect(PAGE).toContain('draft.features');
    expect(PAGE).toContain('problems.map');
  });
  it('endpoint builds via the engine + checks the parent class exists, propose-only', () => {
    expect(ROUTE).toContain('requireCharacterWrite');
    expect(ROUTE).toContain('buildCustomSubclass');
    expect(ROUTE).toContain('findClass');       // verifies the parent class resolves (incl. homebrew)
    expect(ROUTE).toContain('readHomebrewClasses');
    expect(ROUTE).not.toContain("from('dnd_characters').update");
  });
  it('save endpoint requires a resolvable parent class + features, then persists', () => {
    expect(SAVE).toContain('requireCharacterWrite');
    expect(SAVE).toContain('findClass');           // parent class must resolve
    expect(SAVE).toContain('features.length');      // needs at least one feature
    expect(SAVE).toContain('upsertHomebrewSubclass');
    expect(SAVE).toContain("from('dnd_characters').update");
  });
  it('page has a Save button gated on a resolvable parent + features', () => {
    expect(PAGE).toContain('/homebrew-subclass/save');
    expect(PAGE).toContain('savable');
  });
});
