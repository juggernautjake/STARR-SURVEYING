// __tests__/dnd/grounding.test.ts — the AI builder's system-scoped grounding must never allow
// cross-system or invented rules, and must forbid assuming a ruleset for ambiguous characters.
import { describe, it, expect } from 'vitest';
import { systemGroundingBlock } from '@/lib/dnd/grounding';

describe('systemGroundingBlock', () => {
  it('ambiguous → forbids assuming any system, no rules block', async () => {
    const g = await systemGroundingBlock('ambiguous', 'anything');
    expect(g.instruction).toMatch(/SYSTEM-AMBIGUOUS/);
    expect(g.instruction).toMatch(/never import rules/i);
    expect(g.block).toBe('');
    expect(g.matched).toBe(0);
  });

  it('a specific system → constrains to that system only and flags unknowns', async () => {
    // Empty query → no retrieval (env-independent), so we exercise the "no stored rules" path.
    const g = await systemGroundingBlock('dnd5e-2014', '   ');
    expect(g.instruction).toMatch(/D&D 5e \(2014\)/);
    expect(g.instruction).toMatch(/NEVER borrow mechanics from another game system/);
    expect(g.instruction).toMatch(/unmapped/);
  });

  it('null system is treated as ambiguous', async () => {
    const g = await systemGroundingBlock(null, 'x');
    expect(g.instruction).toMatch(/SYSTEM-AMBIGUOUS/);
  });
});
