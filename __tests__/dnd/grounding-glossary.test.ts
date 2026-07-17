// __tests__/dnd/grounding-glossary.test.ts — the AI grounding now feeds the fully-written glossary
// articles, system-scoped, so the librarian/builder answer from the library (not from recall).
import { describe, it, expect } from 'vitest';
import { systemGroundingBlock } from '@/lib/dnd/grounding';

describe('AI grounding includes the glossary, scoped to the system', () => {
  it('surfaces the matching PF2e article (three-action economy) in the grounding block', async () => {
    const g = await systemGroundingBlock('pathfinder2e', 'how does the three action economy work');
    expect(g.block).toMatch(/RELEVANT .*GLOSSARY ARTICLES/i);
    expect(g.block).toMatch(/Three-Action Economy/);
    expect(g.matched).toBeGreaterThan(0);
  });

  it('surfaces the matching 5e 2024 action article for an action question', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'what does the disengage action do');
    expect(g.block).toMatch(/Disengage/);
  });

  it('never surfaces another system\'s article (a PF2e query grounds only PF2e)', async () => {
    // "Off-Guard" is a PF2e term; asking dnd5e-2024 must not pull the PF2e article in.
    const g = await systemGroundingBlock('dnd5e-2024', 'off-guard flat-footed');
    expect(g.block).not.toMatch(/Off-Guard \(condition\)/);
  });

  it('an ambiguous/empty query still returns the deterministic rules block (no glossary needed)', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', '');
    expect(g.block.length).toBeGreaterThan(0);
    expect(g.block).not.toMatch(/GLOSSARY ARTICLES/); // empty query → no glossary section
  });
});
