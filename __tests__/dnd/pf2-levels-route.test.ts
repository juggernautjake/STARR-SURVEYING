// __tests__/dnd/pf2-levels-route.test.ts — the PF2 level-by-level route (B9) wires the tested planner behind
// the write chokepoint and enforces the "level only moves through a fully-resolved plan" invariant.
// Source-assertion (the Supabase/auth calls can't run in a unit test), mirroring level-up-route.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/pf2-levels/route.ts'), 'utf8');

describe('PF2 levels route (B9)', () => {
  it('GET reads access, POST is gated by the write chokepoint', () => {
    expect(SRC).toContain('getCharacterAccess(params.id)');
    expect(SRC).toContain('requireCharacterWrite(params.id)');
  });

  it('is PF2-only (5e keeps its own /levels route)', () => {
    expect(SRC).toMatch(/system !== 'pathfinder2e'/);
    expect(SRC).toContain('5e uses /levels');
  });

  it('GET returns the plan from the tested planner', () => {
    expect(SRC).toContain('pf2PlanLevelUp({ className, to, recorded: choices');
  });

  it('POST records via pf2RecordChoice and persists choices on data.pf2Build', () => {
    expect(SRC).toContain('pf2RecordChoice(choices, choice)');
    expect(SRC).toContain('pf2Build: { ...(data.pf2Build ?? {}), choices }');
    expect(SRC).toContain(".from('dnd_characters')");
    expect(SRC).toContain('.update({ data: nextData })');
  });

  it('refuses to commit a level while the plan still owes choices (409)', () => {
    expect(SRC).toMatch(/if \(!plan\.ready\)/);
    expect(SRC).toContain('status: 409');
  });

  it('malformed choices are rejected before any write', () => {
    expect(SRC).toContain('That choice is malformed.');
  });

  it('projects earned feat choices into the pf2e sidecar and keeps the sidecar level in step', () => {
    expect(SRC).toContain('pf2ProjectLevelUpFeats(sidecar.feats ?? [], choices, newLevel, resolveFeat)');
    expect(SRC).toContain('identity: { ...sidecar.identity, level: newLevel }');
  });
});
