// __tests__/dnd/map-execute.test.ts — the trigger executor's contract (M6-4).
//
// The contract is NOT "it performs everything" — three of the eleven actions genuinely cannot be done by
// a server. It is that **no action silently does nothing**, which is the condition M6-5 attached when it
// deferred this slice:
//
//   *"a half-implemented executor that silently no-ops three of its eleven actions is worse than an
//    engine that plainly has no executor, because the DM's preview would promise things that never
//    happen."*
//
// So the tests that matter here are structural: every action the engine can put in a plan has a branch,
// and every branch produces an outcome.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeExecution, type ExecutionReport, type Outcome } from '@/lib/dnd/maps/execute';
import { KNOWN_ACTIONS } from '@/lib/dnd/maps/triggers';

const SRC = readFileSync(join(process.cwd(), 'lib/dnd/maps/execute.ts'), 'utf8');

const report = (outcomes: Outcome[]): ExecutionReport => ({
  outcomes,
  done: outcomes.filter((o) => o.status === 'done').length,
  asked: outcomes.filter((o) => o.status === 'asked').length,
  failed: outcomes.filter((o) => o.status === 'failed').length,
});

describe('every action the engine knows has somewhere to land', () => {
  it('handles all eleven, with no silent gap', () => {
    // The invariant this file exists for. Add a twelfth action to `KNOWN_ACTIONS` and forget the
    // executor, and a DM's preview would promise something that never happens — which is precisely the
    // failure M6-5 refused to ship.
    const missing = [...KNOWN_ACTIONS].filter((k) => !SRC.includes(`case '${k}'`));
    expect(missing, 'these actions have no branch in the executor').toEqual([]);
  });

  it('has a default branch, so an unknown action fails LOUDLY rather than falling through', () => {
    expect(SRC).toMatch(/default:/);
    expect(SRC).toMatch(/is not an action this map knows how to perform/);
  });

  it('never returns undefined from a branch — every path calls `out`', () => {
    // A `case` that broke without returning would fall to the next one, quietly performing the wrong
    // action. TypeScript catches the missing return; this catches the fall-through.
    const body = SRC.slice(SRC.indexOf('async function performOne'));
    const cases = body.match(/case '[a-z_]+':/g) ?? [];
    expect(cases.length).toBeGreaterThanOrEqual(KNOWN_ACTIONS.size - 1); // fire_trigger + the pairs
    expect(body).not.toMatch(/\n\s+break;\n/); // no `break` — every branch returns
  });
});

describe('what the executor refuses to invent', () => {
  it('does not roll dice', () => {
    // A die is rolled by a person. The server could generate a number, and that would be the map quietly
    // taking a roll away from the table — the same reason `maps/search` accepts the player's own total
    // rather than re-deriving it.
    const body = SRC.slice(SRC.indexOf('async function performOne'));
    expect(body).not.toMatch(/Math\.random/);
  });

  it('floors damage at zero rather than writing a negative HP nobody\'s ruleset produced', () => {
    expect(SRC).toMatch(/Math\.max\(0, before - amount\)/);
  });

  it('refuses damage on a sheet with no HP instead of guessing one', () => {
    expect(SRC).toMatch(/has no current HP on their sheet/);
  });

  it('scopes every map write to the node it was given', () => {
    // Without it, a trigger could name an object id belonging to another campaign's map. The node is the
    // only campaign-bounded thing the executor is handed.
    const body = SRC.slice(SRC.indexOf('async function performOne'));
    const updates = body.match(/\.from\('dnd_map_objects'\)[\s\S]{0,400}?;/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) {
      expect(u, 'a map_objects write that is not scoped to the node').toMatch(/map_node_id/);
    }
  });

  it('scopes every sheet write to the campaign', () => {
    const body = SRC.slice(SRC.indexOf('async function performOne'));
    const reads = body.match(/\.from\('dnd_characters'\)[\s\S]{0,300}?maybeSingle\(\)/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r).toMatch(/campaign_id/);
  });
});

describe('the summary a DM reads', () => {
  it('separates what was done from what the table has to do', () => {
    // "2 done" alone would let two of five look like success. And `asked` must not read as a failure: a
    // puzzle that asks for a roll is working correctly.
    const s = describeExecution(report([
      { kind: 'reveal_object', status: 'done', detail: '' },
      { kind: 'roll_check', status: 'asked', detail: '' },
      { kind: 'x', status: 'failed', detail: '' },
    ]));
    expect(s).toBe('1 done · 1 for the table · 1 failed');
  });

  it('says nothing about categories that are empty', () => {
    expect(describeExecution(report([{ kind: 'a', status: 'done', detail: '' }]))).toBe('1 done');
  });

  it('is explicit about an empty plan rather than reporting "0 done"', () => {
    expect(describeExecution(report([]))).toBe('Nothing to do — this trigger has no actions.');
  });
});
