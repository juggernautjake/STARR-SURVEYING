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

  // A feat query must ground on the feat's FULL effect text, not just its name. The always-on rules
  // block lists feats by name only (dumping every feat's text would bloat every prompt), so this
  // query-scoped retrieval is the only path that puts the effect in front of the AI.
  it('grounds an Intuitive Games feat query on its full effect text (IG has its own feat corpus)', async () => {
    const g = await systemGroundingBlock('intuitive-games', 'Endurance feat');
    expect(g.block).toMatch(/RELEVANT Intuitive Games FEATS \(authoritative benefit text/);
    expect(g.block).toMatch(/Endurance \(General feat\)/);
    expect(g.block).toMatch(/nonlethal damage each day equal to your Constitution modifier/i);
  });

  it('the IG feat text is QUERY-SCOPED — an unrelated query does not dump all 151 feat effects', async () => {
    const g = await systemGroundingBlock('intuitive-games', '   '); // empty → no feat match
    expect(g.block).not.toMatch(/RELEVANT Intuitive Games FEATS/);
    // ...yet the deterministic rules block still lists feat NAMES (so the AI knows the roster).
    expect(g.block).toMatch(/General Feats \(use ONLY these/);
    expect(g.block).toMatch(/Endurance/); // the name is present; only the effect text is query-gated
  });

  it('the 2024 feat grounding still works (no regression from widening the feat type)', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'Alert feat');
    expect(g.block).toMatch(/RELEVANT .* FEATS \(authoritative benefit text/);
    expect(g.block).toMatch(/Alert \(origin feat\)/);
  });

  // The power counterpart of the feat grounding: the always-on IG block lists power NAMES only, so a
  // power query must retrieve the real IG_POWERS effect text — otherwise "how does Dispel Magic work?"
  // grounds on nothing and the AI answers from recall (which for a bespoke system means guessing).
  it('grounds an Intuitive Games POWER query on its full IG effect text (IG has its own power corpus)', async () => {
    const g = await systemGroundingBlock('intuitive-games', 'Dispel Magic');
    expect(g.block).toMatch(/RELEVANT Intuitive Games POWERS \(authoritative effect text/);
    expect(g.block).toMatch(/Dispel Magic \(Abjuration\)/);
    expect(g.block).toMatch(/make an Arcane check to counter it/); // the real IG effect, not recall
    expect(g.matched).toBeGreaterThan(0);
  });

  it('the IG power text is QUERY-SCOPED — an empty query does not dump every power effect', async () => {
    const g = await systemGroundingBlock('intuitive-games', '   ');
    expect(g.block).not.toMatch(/RELEVANT Intuitive Games POWERS/);
  });

  it('IG power grounding does not leak into another system (a 2024 query gets no IG POWERS block)', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'Dispel Magic');
    expect(g.block).not.toMatch(/RELEVANT Intuitive Games POWERS/);
  });
});
