// __tests__/dnd/grounding.test.ts — the AI builder's system-scoped grounding must never allow
// cross-system or invented rules, and must forbid assuming a ruleset for ambiguous characters.
import { describe, it, expect } from 'vitest';
import { systemGroundingBlock } from '@/lib/dnd/grounding';

describe('systemGroundingBlock', () => {
  it('ambiguous → forbids assuming any system + carries the edition-neutral rules block', async () => {
    const g = await systemGroundingBlock('ambiguous', 'anything');
    expect(g.instruction).toMatch(/SYSTEM-AMBIGUOUS/);
    expect(g.instruction).toMatch(/never import rules/i);
    // The deterministic block now spells out the "no system-specific numbers" guarantee.
    expect(g.block).toMatch(/SYSTEM-AMBIGUOUS BUILD/);
    expect(g.block).toMatch(/NEVER import/i);
    expect(g.matched).toBe(0);
  });

  it('a specific system → always carries that system’s authoritative rules block (no embeddings needed)', async () => {
    // Empty query → no RAG retrieval (env-independent); the deterministic rules block is still present.
    const g = await systemGroundingBlock('dnd5e-2014', '   ');
    expect(g.instruction).toMatch(/D&D 5e \(2014\)/);
    expect(g.instruction).toMatch(/NEVER borrow mechanics from another game system/);
    expect(g.instruction).toMatch(/unmapped/);
    expect(g.block).toMatch(/AUTHORITATIVE RULES FOR D&D 5e \(2014\)/);
    expect(g.block).toMatch(/Proficiency Bonus/);
  });

  it('null system is treated as ambiguous', async () => {
    const g = await systemGroundingBlock(null, 'x');
    expect(g.instruction).toMatch(/SYSTEM-AMBIGUOUS/);
  });
});
