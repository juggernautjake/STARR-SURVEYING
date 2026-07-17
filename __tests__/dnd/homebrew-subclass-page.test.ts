import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Slice 5 UI — the /build/subclass page + endpoint (subclass logic tested in custom-class-ai.test.ts).
const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/characters/[id]/build/subclass/page.tsx'), 'utf8');
const ROUTE = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/homebrew-subclass/route.ts'), 'utf8');

describe('homebrew subclass designer', () => {
  it('page posts the prompt + renders the parent class, features, and warnings', () => {
    expect(PAGE).toContain('/homebrew-subclass');
    expect(PAGE).toContain('parentName');
    expect(PAGE).toContain('sub.features');
    expect(PAGE).toContain('result.warnings');
  });
  it('endpoint builds via the engine + checks the parent class exists, propose-only', () => {
    expect(ROUTE).toContain('requireCharacterWrite');
    expect(ROUTE).toContain('buildCustomSubclass');
    expect(ROUTE).toContain('findClass');       // verifies the parent class resolves (incl. homebrew)
    expect(ROUTE).toContain('readHomebrewClasses');
    expect(ROUTE).not.toContain("from('dnd_characters').update");
  });
});
