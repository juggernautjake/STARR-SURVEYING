// __tests__/dnd/multiclass-manager.test.ts — MC-5e-4: the level manager UI + save route are wired.
// The interactive save round-trip is verified live; these anchor the structural wiring against drift.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('5e multiclass level manager (MC-5e-4)', () => {
  it('the manager renders the aggregated split from the tested engine and saves via /classes', () => {
    const c = read('app/dnd/_ui/MulticlassManager.tsx');
    expect(c).toContain('multiclassSnapshot'); // live aggregated preview
    expect(c).toContain('multiclassPrereqFor'); // prereq annotation on the add-a-class picker
    expect(c).toMatch(/\/api\/dnd\/characters\/\$\{characterId\}\/classes/);
    expect(c).toMatch(/Total level/); // the live summary
  });

  it('the /classes route is owner-gated, 5e-only, caps total at 20, and writes meta.classes', () => {
    const r = read('app/api/dnd/characters/[id]/classes/route.ts');
    expect(r).toContain('requireCharacterWrite');
    expect(r).toMatch(/Multiclassing is a D&D 5e feature/);
    expect(r).toMatch(/exceeds the 20-level cap/);
    expect(r).toContain('meta.classes = clean');
    expect(r).toContain('totalClassLevel');
  });

  it('the /levels page mounts the manager for 5e only, seeded from resolveClassLevels', () => {
    const page = read('app/dnd/characters/[id]/levels/page.tsx');
    expect(page).toContain('<MulticlassManager');
    expect(page).toContain('resolveClassLevels');
    expect(page).toMatch(/is5e &&/);
  });
});
