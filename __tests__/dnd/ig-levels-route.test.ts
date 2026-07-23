// __tests__/dnd/ig-levels-route.test.ts — IG-3: the IG level-by-level route wires the tested planner behind
// the write chokepoint and enforces the "level only moves through a fully-resolved plan" invariant.
// Source-assertion (Supabase/auth can't run in a unit test), mirroring pf2-levels-route.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/ig-levels/route.ts'), 'utf8');

describe('IG levels route (IG-3)', () => {
  it('GET reads access, POST is gated by the write chokepoint', () => {
    expect(SRC).toContain('getCharacterAccess(params.id)');
    expect(SRC).toContain('requireCharacterWrite(params.id)');
  });

  it('is IG-only', () => {
    expect(SRC).toMatch(/system !== 'intuitive-games'/);
  });

  it('GET returns the plan from the tested IG planner', () => {
    expect(SRC).toContain('igPlanLevelUp({ subclass, to, recorded: choices');
  });

  it('POST records via igRecordChoice and persists choices on data.igBuild', () => {
    expect(SRC).toContain('igRecordChoice(choices, choice)');
    expect(SRC).toContain('igBuild: { ...(data.igBuild ?? {}), choices }');
    expect(SRC).toContain(".from('dnd_characters')");
    expect(SRC).toContain('.update({ data: nextData })');
  });

  it('refuses to commit a level while the plan still owes choices (409)', () => {
    expect(SRC).toMatch(/if \(!plan\.ready\)/);
    expect(SRC).toContain('status: 409');
  });

  it('keeps the IG sidecar level in step and rejects malformed choices', () => {
    expect(SRC).toContain('identity: { ...(data.ig.identity ?? {}), level: newLevel }');
    expect(SRC).toContain('That choice is malformed.');
  });
});
