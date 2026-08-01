// __tests__/dnd/map-triggers.test.ts — when → then, and the ways a puzzle can eat itself. M6-4 / M6-5.
//
// The plan's own standard: *"an untestable trigger is a trap for its author"* and *"a puzzle that
// infinite-loops must fail loudly, not hang the table."* Both are properties of this engine, and both are
// what these tests are for.
import { describe, it, expect } from 'vitest';
import {
  KNOWN_ACTIONS, MAX_ACTIONS, MAX_DEPTH, describePlan, matches, preview, readTrigger, resolve,
  type MapTrigger, type TriggerAction,
} from '@/lib/dnd/maps/triggers';

const trig = (over: Partial<MapTrigger> & { id: string }): MapTrigger => ({
  name: over.name ?? `Trigger ${over.id}`,
  firesWhen: over.firesWhen ?? { kind: 'token_enters', targetId: null },
  firesThen: over.firesThen ?? ([{ kind: 'show_description', text: 'Boo.' }] as TriggerAction[]),
  once: over.once ?? false,
  armed: over.armed ?? true,
  firedAt: over.firedAt ?? null,
  ...over,
});

const enters = (targetId?: string) => ({ kind: 'token_enters' as const, targetId });

describe('matching', () => {
  it('fires on its own event kind', () => {
    expect(matches(trig({ id: 'a' }), enters())).toBe(true);
    expect(matches(trig({ id: 'a' }), { kind: 'turn_ends' })).toBe(false);
  });

  it('an absent targetId means ANY — narrowing is opt-in', () => {
    // A DM writing `{ kind: 'token_enters' }` means any token entering. Requiring them to enumerate every
    // token would make the common case the hardest to write.
    expect(matches(trig({ id: 'a', firesWhen: { kind: 'token_enters' } }), enters('region-9'))).toBe(true);
  });

  it('a set targetId narrows to it', () => {
    const t = trig({ id: 'a', firesWhen: { kind: 'token_enters', targetId: 'region-1' } });
    expect(matches(t, enters('region-1'))).toBe(true);
    expect(matches(t, enters('region-2'))).toBe(false);
  });

  it('a disarmed trigger never fires', () => {
    expect(matches(trig({ id: 'a', armed: false }), enters())).toBe(false);
  });

  it('a `once` trigger that has fired never fires again', () => {
    expect(matches(trig({ id: 'a', once: true, firedAt: '2026-08-01T00:00:00Z' }), enters())).toBe(false);
    // …but a `once` trigger that has NOT fired is perfectly live.
    expect(matches(trig({ id: 'a', once: true, firedAt: null }), enters())).toBe(true);
  });
});

describe('the plan', () => {
  it('collects the actions of every matching trigger, in order', () => {
    const plan = resolve(enters(), [
      trig({ id: 'a', firesThen: [{ kind: 'reveal_object', objectId: 'o1' }] }),
      trig({ id: 'b', firesThen: [{ kind: 'play_sound', sound: 'creak' }] }),
    ]);
    expect(plan.actions.map((a) => a.kind)).toEqual(['reveal_object', 'play_sound']);
    expect(plan.fired).toEqual(['a', 'b']);
    expect(plan.problems).toEqual([]);
  });

  it('records which trigger each action came from', () => {
    // The DM's log needs to say WHICH trigger did the thing, not just that something did.
    const plan = resolve(enters(), [trig({ id: 'a', firesThen: [{ kind: 'apply_damage', amount: 6 }] })]);
    expect(plan.actions[0]).toMatchObject({ kind: 'apply_damage', amount: 6, fromTriggerId: 'a', depth: 0 });
  });

  it('ignores triggers that do not match', () => {
    const plan = resolve({ kind: 'turn_starts' }, [trig({ id: 'a' })]);
    expect(plan).toMatchObject({ actions: [], fired: [], problems: [] });
  });
});

describe('chaining — the composability the feature exists for', () => {
  it('a trigger can fire another', () => {
    const plan = resolve(enters(), [
      trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'b' }] }),
      trig({ id: 'b', firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'spawn_creature', creature: 'ogre' }] }),
    ]);
    expect(plan.fired).toEqual(['a', 'b']);
    expect(plan.actions.map((a) => a.kind)).toEqual(['spawn_creature']);
  });

  it('a chained trigger does NOT have to listen for the original event', () => {
    // "A fires B" is A's decision, not B's listener. Requiring B to match would make chaining useless.
    const plan = resolve(enters(), [
      trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'b' }] }),
      trig({ id: 'b', firesWhen: { kind: 'door_opened', targetId: 'somewhere-else' }, firesThen: [{ kind: 'post_feed', text: 'x' }] }),
    ]);
    expect(plan.fired).toContain('b');
  });

  it('records the depth so a log can show the shape of the chain', () => {
    const plan = resolve(enters(), [
      trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'b' }] }),
      trig({ id: 'b', firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'fire_trigger', triggerId: 'c' }] }),
      trig({ id: 'c', firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'play_sound', s: 1 }] }),
    ]);
    expect(plan.actions[0].depth).toBe(2);
  });

  it('a DIAMOND is allowed — two branches firing the same trigger is not a loop', () => {
    // Checked against the PATH, not a global visited set. Refusing this would break composability, which
    // is the thing triggers exist for.
    const plan = resolve(enters(), [
      trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'c' }] }),
      trig({ id: 'b', firesThen: [{ kind: 'fire_trigger', triggerId: 'c' }] }),
      trig({ id: 'c', firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'play_sound', s: 1 }] }),
    ]);
    expect(plan.problems).toEqual([]);
    expect(plan.actions).toHaveLength(2);
  });
});

// ── M6-5 ───────────────────────────────────────────────────────────────────────────────────────────
describe('a puzzle that eats itself fails LOUDLY', () => {
  it('detects a two-trigger cycle and names the path', () => {
    // "Cycle detected" says there is one; "A → B → A" says where it is. The DM needs the second.
    const plan = resolve(enters(), [
      trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'b' }] }),
      trig({ id: 'b', firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'fire_trigger', triggerId: 'a' }] }),
    ]);
    const cycle = plan.problems.find((p) => p.kind === 'cycle');
    expect(cycle).toBeTruthy();
    expect(cycle!.path).toEqual(['a', 'b', 'a']);
  });

  it('detects a trigger that fires ITSELF', () => {
    const plan = resolve(enters(), [trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'a' }] })]);
    expect(plan.problems.map((p) => p.kind)).toContain('cycle');
  });

  it('still returns what it safely resolved', () => {
    // Failing loudly is not the same as failing entirely. The DM should see the effects that DO work,
    // plus the link that does not.
    const plan = resolve(enters(), [
      trig({ id: 'a', firesThen: [{ kind: 'reveal_object', objectId: 'o1' }, { kind: 'fire_trigger', triggerId: 'b' }] }),
      trig({ id: 'b', firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'fire_trigger', triggerId: 'a' }] }),
    ]);
    expect(plan.actions.map((a) => a.kind)).toEqual(['reveal_object']);
    expect(plan.problems).toHaveLength(1);
  });

  it('caps depth on a long non-cyclic chain', () => {
    // A chain of 20 distinct triggers has no cycle and is still a runaway.
    const chain = Array.from({ length: 20 }, (_, i) => trig({
      id: `t${i}`,
      firesWhen: i === 0 ? { kind: 'token_enters' } : { kind: 'manual' },
      firesThen: [{ kind: 'fire_trigger', triggerId: `t${i + 1}` }],
    }));
    const plan = resolve(enters(), chain);
    expect(plan.problems.map((p) => p.kind)).toContain('depth');
    expect(plan.fired.length).toBeLessThanOrEqual(MAX_DEPTH + 1);
  });

  it('caps total actions — a fan-out bomb is as bad as a cycle, and depth does not catch it', () => {
    const many = Array.from({ length: MAX_ACTIONS + 50 }, () => ({ kind: 'play_sound' })) as TriggerAction[];
    const plan = resolve(enters(), [trig({ id: 'a', firesThen: many })]);
    expect(plan.actions.length).toBeLessThanOrEqual(MAX_ACTIONS);
    expect(plan.problems.map((p) => p.kind)).toContain('action-limit');
  });

  it('names a trigger that fires something which no longer exists', () => {
    // A DM who deleted a trigger another one calls has a broken puzzle, and this is the only way they
    // find out before the table does.
    const plan = resolve(enters(), [trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'gone' }] })]);
    const p = plan.problems.find((x) => x.kind === 'missing-trigger');
    expect(p?.detail).toMatch(/gone/);
  });

  it('keeps an unknown action in the plan AND reports it', () => {
    // Dropping it would make a typo'd action silently do nothing. Keeping it means the executor can
    // decide, and the DM is told either way.
    const plan = resolve(enters(), [trig({ id: 'a', firesThen: [{ kind: 'teleport_everyone' }] })]);
    expect(plan.actions.map((a) => a.kind)).toEqual(['teleport_everyone']);
    expect(plan.problems.map((p) => p.kind)).toContain('unknown-action');
  });

  it('skips an action with no kind rather than crashing', () => {
    const plan = resolve(enters(), [trig({ id: 'a', firesThen: [{} as TriggerAction, { kind: 'play_sound' }] })]);
    expect(plan.actions).toHaveLength(1);
    expect(plan.problems.map((p) => p.kind)).toContain('unknown-action');
  });

  it('covers every action the plan lists', () => {
    for (const k of ['reveal_object', 'hide_object', 'show_description', 'move_token', 'apply_condition',
      'apply_damage', 'roll_check', 'play_sound', 'spawn_creature', 'fire_trigger', 'post_feed']) {
      expect(KNOWN_ACTIONS.has(k) || k === 'fire_trigger', k).toBe(true);
    }
  });
});

describe('"fire this now" — the DM’s preview', () => {
  it('uses the SAME resolver as the real path', () => {
    // A preview built from a parallel code path is a preview of something else: the DM tests the puzzle,
    // it works, and the real firing does something different.
    const t = trig({ id: 'a', firesThen: [{ kind: 'reveal_object', objectId: 'o1' }] });
    expect(preview(t, [t]).actions.map((a) => a.kind)).toEqual(resolve(enters(), [t]).actions.map((a) => a.kind));
  });

  it('fires a DISARMED trigger, because testing one is the point', () => {
    const t = trig({ id: 'a', armed: false, firesThen: [{ kind: 'play_sound', s: 1 }] });
    expect(preview(t, [t]).actions).toHaveLength(1);
  });

  it('fires a `once` trigger that has already fired', () => {
    const t = trig({ id: 'a', once: true, firedAt: '2026-01-01T00:00:00Z', firesThen: [{ kind: 'play_sound', s: 1 }] });
    expect(preview(t, [t]).actions).toHaveLength(1);
  });

  it('does NOT force a disarmed trigger further down the chain', () => {
    // The bypass is on the chosen trigger only. A preview that made the whole map fire would tell the DM
    // nothing about what actually happens.
    const a = trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'b' }] });
    const b = trig({ id: 'b', armed: false, firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'play_sound', s: 1 }] });
    const plan = preview(a, [a, b]);
    // `b` is reached by an explicit `fire_trigger`, which is A's decision — so it runs. What it must not
    // do is match the manual EVENT on its own.
    expect(plan.fired).toEqual(['a', 'b']);
  });

  it('still detects a cycle in preview', () => {
    const a = trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'b' }] });
    const b = trig({ id: 'b', firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'fire_trigger', triggerId: 'a' }] });
    expect(preview(a, [a, b]).problems.map((p) => p.kind)).toContain('cycle');
  });
});

describe('reading a row without trusting it', () => {
  it('survives jsonb that is the wrong shape entirely', () => {
    for (const row of [
      { id: 'a', fires_when: null, fires_then: null },
      { id: 'a', fires_when: 'nonsense', fires_then: 'nonsense' },
      { id: 'a', fires_when: {}, fires_then: [null, 3, 'x'] },
    ]) {
      expect(() => readTrigger(row as never)).not.toThrow();
      expect(readTrigger(row as never).firesThen).toEqual([]);
    }
  });

  it('defaults to ARMED when the flag is missing', () => {
    // Matching the column default. A trigger whose flag is absent is one the DM expects to work;
    // defaulting to disarmed would make a puzzle fail with nothing to see.
    expect(readTrigger({ id: 'a' }).armed).toBe(true);
    expect(readTrigger({ id: 'a', armed: false }).armed).toBe(false);
  });

  it('reads the when/then it does understand', () => {
    const t = readTrigger({
      id: 'a', name: 'Pit', fires_when: { kind: 'token_enters', targetId: 'r1' },
      fires_then: [{ kind: 'apply_damage', amount: 10 }], once: true, armed: true, fired_at: null,
    });
    expect(t).toMatchObject({ name: 'Pit', once: true, armed: true });
    expect(t.firesWhen).toEqual({ kind: 'token_enters', targetId: 'r1' });
    expect(t.firesThen).toHaveLength(1);
  });
});

describe('the log line', () => {
  it('counts actions, triggers and problems', () => {
    const plan = resolve(enters(), [
      trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'b' }, { kind: 'play_sound' }] }),
      trig({ id: 'b', firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'fire_trigger', triggerId: 'a' }] }),
    ]);
    expect(describePlan(plan)).toMatch(/1 action · across 2 triggers · ⚠ 1 problem/);
  });

  it('is quiet when nothing went wrong', () => {
    expect(describePlan(resolve(enters(), [trig({ id: 'a' })]))).toBe('1 action');
  });

  it('counts DISTINCT triggers, not walks', () => {
    // `fired` records each walk, and a diamond legitimately walks the same trigger twice. Found in the
    // browser: a three-trigger map printed "across 4 triggers", which is a small lie in the one place a
    // DM goes to find out whether their puzzle is sane.
    const plan = resolve(enters(), [
      trig({ id: 'a', firesThen: [{ kind: 'fire_trigger', triggerId: 'c' }] }),
      trig({ id: 'b', firesThen: [{ kind: 'fire_trigger', triggerId: 'c' }] }),
      trig({ id: 'c', firesWhen: { kind: 'manual' }, firesThen: [{ kind: 'play_sound' }] }),
    ]);
    expect(plan.fired).toEqual(['a', 'c', 'b', 'c']);   // four walks…
    expect(describePlan(plan)).toMatch(/across 3 triggers/); // …three triggers.
  });
});
