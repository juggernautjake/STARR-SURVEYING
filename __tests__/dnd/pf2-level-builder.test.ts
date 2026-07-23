// __tests__/dnd/pf2-level-builder.test.ts — B10: the PF2 level-by-level UI walks the tested /pf2-levels
// plan and the levels page dispatches PF2 characters to it (not the 5e class-table builder).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2LevelBuilder.tsx'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/levels/page.tsx'), 'utf8');

describe('PF2LevelBuilder (B10)', () => {
  it('fetches the plan and records/commits through the /pf2-levels route', () => {
    expect(UI).toContain('/pf2-levels');
    expect(UI).toContain("JSON.stringify({ choice })");
    expect(UI).toContain("JSON.stringify({ commitTo: target })");
  });

  it('walks the outstanding choices in order (only the first is shown)', () => {
    expect(UI).toContain('plan?.outstanding?.[0]');
  });

  it('offers subclass options from the class, feats filtered by track+level, and 4 boosts', () => {
    expect(UI).toContain('pf2Class(className)?.subclassOptions');
    expect(UI).toMatch(/f\.track === choice\.track && f\.level <= choice\.level/);
    expect(UI).toContain('picks.length !== 4'); // boosts require exactly 4
  });

  it('will not commit past the current level until the plan is ready', () => {
    expect(UI).toMatch(/canCommit = plan\?\.ready && target > currentLevel/);
  });

  it('does not import the 5e feat list or class registry (PF2 reads its own data)', () => {
    expect(UI).not.toContain('feats/dnd5e-2024');
    expect(UI).toContain("systems/pathfinder2e/data");
  });
});

describe('levels page dispatches by system', () => {
  it('PF2 → PF2LevelBuilder, everything else → the 5e LevelBuilder', () => {
    expect(PAGE).toContain('import PF2LevelBuilder');
    expect(PAGE).toMatch(/system === 'pathfinder2e' \?\s*[\s\S]*PF2LevelBuilder/);
    expect(PAGE).toContain('<LevelBuilder');
  });
});
