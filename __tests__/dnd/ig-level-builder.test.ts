// __tests__/dnd/ig-level-builder.test.ts — IG-4: the IG level-by-level UI walks the tested /ig-levels plan
// and the levels page dispatches IG characters to it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = readFileSync(join(process.cwd(), 'app/dnd/_ui/IGLevelBuilder.tsx'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/levels/page.tsx'), 'utf8');

describe('IGLevelBuilder (IG-4)', () => {
  it('fetches the plan and records/commits through /ig-levels', () => {
    expect(UI).toContain('/ig-levels');
    expect(UI).toContain('JSON.stringify({ choice })');
    expect(UI).toContain('JSON.stringify({ commitTo: target })');
  });

  it('walks the outstanding choices in order (only the first is shown)', () => {
    expect(UI).toContain('plan?.outstanding?.[0]');
  });

  it('pulls options from the plan, else the right IG catalog (feats by category, skills, trait benefits)', () => {
    expect(UI).toContain('choice.options?.length'); // plan options first (subclass power / spec / capstone)
    expect(UI).toMatch(/feat-general.*IG_FEATS.*General/s);
    expect(UI).toContain("systemSkills('intuitive-games')");
    expect(UI).toContain('TRAIT_BENEFITS');
  });

  it('will not commit past the current level until the plan is ready', () => {
    expect(UI).toMatch(/canCommit = plan\?\.ready && target > currentLevel/);
  });
});

describe('levels page dispatches IG → IGLevelBuilder', () => {
  it('IG uses IGLevelBuilder; PF2 and 5e keep their own builders', () => {
    expect(PAGE).toContain('import IGLevelBuilder');
    expect(PAGE).toMatch(/system === 'intuitive-games' \?\s*[\s\S]*IGLevelBuilder/);
    expect(PAGE).toContain('<PF2LevelBuilder');
    expect(PAGE).toContain('<LevelBuilder');
  });
});
