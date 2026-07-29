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
    // Writes through a `patch` object since S6d: the row carries `data`, plus `system_variants` ONLY when
    // an exception moved the character's badge. A bare `.update({ data })` would have no way to record
    // that the character became altered-vanilla.
    expect(SRC).toContain('.update(patch)');
    expect(SRC).toContain('const patch: Record<string, unknown> = { data: nextData }');
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
    // The identity spread grew a `subclass` line (P5-10), so this asserts the two guarantees rather than
    // the one literal it used to match: the sidecar's own level follows the character's.
    expect(SRC).toContain('...sidecar.identity,');
    // `\r?\n`, not `\n` — this repo is CRLF, and a `\n` needle silently matches nothing.
    expect(SRC).toMatch(/level: newLevel,?\r?\n/);
  });

  it('and re-derives the proficiency ranks, which it used to leave at build-time values', () => {
    // Ranks were written once, at build time. Walking a Wizard 1→9 through this route left it with
    // level-1 saves and a level-1 spell DC — correct if you BUILT at 9, stale if you walked there.
    expect(SRC).toContain('pf2ReprojectRanks(levelled, newLevel)');
  });

  it('and projects the SUBCLASS it records, so a doctrine chosen here reaches the sheet', () => {
    // It accepted a `subclass` choice and wrote it to the ledger only; `identity.subclass` stayed empty,
    // so the choice was invisible on the sheet and could not drive a Cleric's doctrine-dependent ranks.
    expect(SRC).toMatch(/c\.kind === 'subclass'/);
    expect(SRC).toContain('subclass: chosenSubclass || sidecar.identity.subclass');
  });
});
