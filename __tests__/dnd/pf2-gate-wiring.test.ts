// __tests__/dnd/pf2-gate-wiring.test.ts — the PF2 gate is actually CALLED (PF2 S13).
//
// The gate shipped as a pure function and enforced nothing, because no route invoked it. A gate
// nobody calls is indistinguishable from no gate at all — and it looks done, which is worse than
// obviously missing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PF2_EDIT_TOOL } from '@/lib/dnd/systems/pathfinder2e/ai';
import { PF2_EDIT_OPS } from '@/lib/dnd/systems/pathfinder2e/edit';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ROUTES = [
  'app/api/dnd/characters/[id]/pf2-edit/route.ts',
  'app/api/dnd/characters/[id]/ai-edit/route.ts',
];

describe('both PF2 write paths gate before applying', () => {
  for (const p of ROUTES) {
    it(`${p.split('/').slice(-2)[0]} calls the gate`, () => {
      const src = read(p);
      expect(src).toContain('gatePf2Edit(');
      // The gate needs the catalog, or every lookup misses and it silently allows everything.
      expect(src).toContain('PF2_ALL_FEATS');
      expect(src).toContain('PF2_ALL_SPELLS');
    });

    it(`${p.split('/').slice(-2)[0]} applies the GATED edit, not the raw one`, () => {
      // The subtle way to wire a gate wrong: call it, ignore its result, apply parsed.edit anyway.
      const src = read(p);
      expect(src).toMatch(/applyPf2Edit\([^,]+,\s*(pf2Gate|gate)\.edit/);
      expect(src).not.toMatch(/applyPf2Edit\([^,]+,\s*parsed\.edit/);
    });

    it(`${p.split('/').slice(-2)[0]} derives enforcement from the server, not the body`, () => {
      const src = read(p);
      expect(src).toContain('readActiveSlotMeta(');
      expect(src).toContain(".kind ?? 'vanilla'");
      expect(src).not.toMatch(/enforce:\s*body\./);
    });
  }
});

describe('the AI can reach the new ops', () => {
  const schema = JSON.stringify(PF2_EDIT_TOOL.input_schema);

  it('offers every op, including the content-adding ones', () => {
    for (const op of PF2_EDIT_OPS) expect(schema).toContain(op);
  });

  it('exposes the fields those ops need', () => {
    // Offering add_spell without `rank` would make it unusable — the model would emit a name and
    // nothing else, and the parser would reject every call.
    for (const field of ['rank', 'level', 'track', 'prepared', 'focus']) {
      expect(schema, `${field} must be in the schema`).toContain(field);
    }
  });

  it('tells the model that PF2 uses RANKS, not spell levels', () => {
    // The single most likely confusion for a model trained on more 5e than PF2.
    expect(schema.toLowerCase()).toContain('rank');
    expect(PF2_EDIT_TOOL.description).toContain('rank');
  });

  it('does NOT let the model set offRules', () => {
    // Server-set only, or "this isn't off-rules" becomes a claim rather than a fact.
    expect(schema).not.toContain('offRules');
  });
});
