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

describe('every AI path feeds the grounding BLOCK (so the glossary reaches them), source-anchored', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('ai-edit (item/feat/spell builder), ingest, transpose, and the librarian all include grounding.block', () => {
    // Each route must put the retrieved rules block into the model's user content, not just the
    // instruction — otherwise the glossary articles never reach the AI.
    for (const p of [
      'app/api/dnd/characters/[id]/ai-edit/route.ts',
      'app/api/dnd/characters/[id]/ingest/route.ts',
      'app/api/dnd/characters/[id]/system/route.ts',
      'app/api/dnd/library/chat/route.ts',
    ]) {
      const src = read(p);
      expect(src, p).toContain('systemGroundingBlock');
      expect(src.replace(/\s+/g, ' '), p).toMatch(/grounding[.?]*\.?block/);
    }
  });
});
