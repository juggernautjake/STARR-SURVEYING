// __tests__/dnd/grounding-spells.test.ts — the new library content is actually REACHABLE by the AI.
//
// Owner 2026-07-19: adding a spell catalog is only half the job. If it isn't wired into
// systemGroundingBlock, the librarian still answers "how does Fireball work" from recall — the
// exact failure the library exists to prevent. These assert the retrieval path end to end.
import { describe, it, expect } from 'vitest';
import { systemGroundingBlock } from '@/lib/dnd/grounding';

describe('spells reach the AI prompt', () => {
  it('puts a named spell’s mechanical detail in the block', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'how does fireball work');
    expect(g.block).toContain('Fireball');
    expect(g.block).toContain('150 feet');   // range
    expect(g.block).toContain('8d6');        // damage
    expect(g.matched).toBeGreaterThan(0);
  });

  it('includes components, duration, and concentration', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'what is hunter\'s mark');
    expect(g.block).toMatch(/Hunter.s Mark/);
    expect(g.block).toContain('Concentration');
    expect(g.block).toContain('Casting time');
  });

  it('surfaces the 2024-vs-2014 difference when one exists', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'explain true strike');
    expect(g.block).toContain('True Strike');
    expect(g.block).toContain('2024 vs 2014');
  });

  it('does NOT hand 2024 spell data to a 2014 sheet', async () => {
    // Several of these changed materially between editions; leaking 2024 numbers into a 2014
    // answer is quiet wrongness, which is worse than no answer.
    const g = await systemGroundingBlock('dnd5e-2014', 'how does true strike work');
    expect(g.block).not.toContain('RELEVANT D&D 5e (2014) SPELLS');
  });

  it('stays quiet when the query names no spell', async () => {
    // Regression: plain substring matching retrieved Shoc-KING Grasp for "king", handing the AI
    // a spell nobody asked about. (The glossary retriever is separately lenient by design, so
    // this asserts only on the SPELLS block.)
    const g = await systemGroundingBlock('dnd5e-2024', 'who is the king of the realm');
    expect(g.block).not.toContain('SPELLS (authoritative mechanical detail');
    expect(g.block).not.toContain('Shocking Grasp');
  });
});

describe('spellcasting mechanics reach the AI prompt', () => {
  it('answers "how does concentration work" with the rule AND its example', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'how does concentration work');
    expect(g.block).toContain('Concentration');
    expect(g.block).toContain('EXAMPLE:');
  });

  it('retrieves the components explainer', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'what are somatic components');
    expect(g.block.toLowerCase()).toContain('components');
    expect(g.block).toContain('EXAMPLE:');
  });
});

describe('companions and conditions reach the AI prompt', () => {
  it('answers "what can my familiar do"', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'what can my familiar do');
    expect(g.block).toContain('Familiar');
    expect(g.block).toContain('Find Familiar');
  });

  it('gives a condition’s worked example, not just the rule', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'can I attack while frightened');
    expect(g.block).toContain('Frightened');
    expect(g.block).toContain('EXAMPLE:');
  });

  it('shares conditions across both 5e editions', async () => {
    // The condition list and the modelled parts are identical in 2014 and 2024.
    const g = await systemGroundingBlock('dnd5e-2014', 'what does grappled do');
    expect(g.block).toContain('Grappled');
  });

  it('does not leak 5e content into another system', async () => {
    const g = await systemGroundingBlock('pathfinder2e', 'how does fireball work');
    expect(g.block).not.toContain('RELEVANT Pathfinder 2e SPELLS');
    const ig = await systemGroundingBlock('intuitive-games', 'what can my familiar do');
    expect(ig.block).not.toContain('Find Familiar');
  });
});

// S9 — the derived tags reach the AI, so it can filter as well as match.
describe('tags reach the AI prompt', () => {
  it('a retrieved spell carries its tag keys', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'how does fireball work');
    expect(g.block).toContain('Tags:');
    expect(g.block).toContain('school:evocation');
    expect(g.block).toContain('effect:damage');
    expect(g.block).toContain('damage:fire');
  });

  it('the tags are the SAME vocabulary the filters use', async () => {
    // One source for chips, facets and the AI payload — three consumers of a hand-kept list
    // would drift three different ways.
    const { tagsForSpell } = await import('@/lib/dnd/library-tags');
    const { findSpell2024 } = await import('@/lib/dnd/spells/dnd5e-2024');
    const keys = tagsForSpell(findSpell2024('fireball')!).map((t) => t.key);
    const g = await systemGroundingBlock('dnd5e-2024', 'fireball');
    for (const k of keys) expect(g.block, k).toContain(k);
  });
});
