// __tests__/dnd/statgen-guidance.test.ts — per-system AI build guidance (AM-1/2).
//
// Pins that each system's ability-generation method is stated correctly for the AI, that it's the SAME rule
// the manual builder enforces, and that it's actually injected into the grounding instruction.
import { describe, it, expect } from 'vitest';
import { abilityGenerationGuidance, buildCompletenessGuidance, statGenGuidanceFor } from '@/lib/dnd/statgen/guidance';

describe('abilityGenerationGuidance', () => {
  it('2014: array/point-buy/4d6 + racial increases', () => {
    const g = abilityGenerationGuidance('dnd5e-2014');
    expect(g).toMatch(/standard array/i);
    expect(g).toMatch(/27 points/);
    expect(g).toMatch(/4d6/);
    expect(g).toMatch(/race\/subrace ability score increases/);
  });
  it('2024: increases come from the BACKGROUND, not the species', () => {
    const g = abilityGenerationGuidance('dnd5e-2024');
    expect(g).toMatch(/BACKGROUND/);
    expect(g).toMatch(/NOT the species/);
  });
  it('PF2: staged boosts, flaw, +4 partial, modifiers not scores', () => {
    const g = abilityGenerationGuidance('pathfinder2e');
    expect(g).toMatch(/starts at \+0/);
    expect(g).toMatch(/ancestry flaw/);
    expect(g).toMatch(/partial/);
    expect(g).toMatch(/MODIFIERS, not scores/);
  });
  it('IG: eight +2 boosts, cap 14, not point-buy/PF2', () => {
    const g = abilityGenerationGuidance('intuitive-games');
    expect(g).toMatch(/EIGHT \+2 boosts/);
    expect(g).toMatch(/cap 14/);
    expect(g).toMatch(/Do NOT use point-buy/);
  });
  it('an unknown system yields no ability guidance', () => {
    expect(abilityGenerationGuidance('other')).toBe('');
  });
});

describe('completeness + composition', () => {
  it('the completeness bar demands a level-appropriate build', () => {
    expect(buildCompletenessGuidance()).toMatch(/level-appropriate/);
    expect(buildCompletenessGuidance()).toMatch(/not a level-1 stub/);
  });
  it('statGenGuidanceFor joins completeness + the system method', () => {
    const g = statGenGuidanceFor('pathfinder2e');
    expect(g).toMatch(/level-appropriate/);
    expect(g).toMatch(/Pathfinder 2e/);
  });
});

describe('the grounding instruction injects the guidance', () => {
  it('grounding.ts appends statGenGuidanceFor to the instruction', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('node:fs').readFileSync(require('node:path').join(process.cwd(), 'lib/dnd/grounding.ts'), 'utf8');
    expect(src).toContain('statGenGuidanceFor(sys)');
  });
});
