// __tests__/learn/guided-run.test.ts — the rules a guided run has to keep.
//
// The routine DATA is checked against the engine in ti30xa-guided.test.ts. This checks the walk:
// what happens when the student presses the right key, and — the part that matters — what happens
// when they press the wrong one.

import { describe, it, expect } from 'vitest';
import {
  startRun, pressKey, pressKeys, nextKey, currentStep, progress,
} from '@/lib/calculators/models/ti-30xa/guided-run';
import { TI_30XA_GUIDED, guidedRoutine, routineKeys } from '@/lib/calculators/models/ti-30xa/guided';
import { initialState } from '@/lib/calculators/models/ti-30xa/engine';

describe('starting', () => {
  it('opens on the first key of the first step', () => {
    const run = startRun('inverse-distance')!;
    expect(run.stepIndex).toBe(0);
    expect(nextKey(run)).toBe('n3');
    expect(currentStep(run)?.label).toBe('3 0 0');
    expect(run.calc.display).toBe(initialState.display);
  });

  it('returns null for an id that does not exist', () => {
    // An author mistyping `routine=` in a lesson directive. The component turns this into a
    // visible line rather than an empty box.
    expect(startRun('not-a-routine')).toBeNull();
  });

  it('offers exactly one key, never the rest of the sequence', () => {
    // Showing the whole sequence would let somebody copy the pattern with the explanation unread.
    const run = startRun('inverse-bearing')!;
    const key = nextKey(run);
    expect(typeof key).toBe('string');
    expect(run.routine.steps[0].keys.indexOf(key!)).toBe(0);
  });
});

describe('the wrong-key rule', () => {
  it('does not advance the calculator', () => {
    const run = startRun('inverse-distance')!;
    const after = pressKey(run, 'n9', 1000);
    expect(after.calc).toBe(run.calc);          // identical state object — nothing was applied
    expect(after.stepIndex).toBe(run.stepIndex);
    expect(after.keyIndex).toBe(run.keyIndex);
    expect(nextKey(after)).toBe(nextKey(run));  // still pointing at the same key
  });

  it('records which key it was, so the student can be told what it does', () => {
    const run = pressKey(startRun('inverse-distance')!, 'sqrt', 1000);
    expect(run.wrong).toEqual({ id: 'sqrt', at: 1000 });
  });

  it('records a repeat as a distinct event', () => {
    // The UI keys its failure animation on `at`. Without a new value the second wrong press plays
    // nothing, which reads as the app having stopped responding.
    const a = pressKey(startRun('inverse-distance')!, 'n9', 1000);
    const b = pressKey(a, 'n9', 2000);
    expect(b.wrong?.at).toBe(2000);
    expect(b.wrong?.at).not.toBe(a.wrong?.at);
  });

  it('clears once the right key is pressed', () => {
    const run = pressKey(pressKey(startRun('inverse-distance')!, 'n9', 1000), 'n3', 2000);
    expect(run.wrong).toBeNull();
    expect(run.calc.display).toBe('3');
  });

  it('cannot derail a run — wrong keys sprinkled through change nothing about the outcome', () => {
    // The whole point. A run peppered with mistakes ends in the same place as a clean one.
    const routine = guidedRoutine('inverse-distance')!;
    let clean = startRun('inverse-distance')!;
    let messy = startRun('inverse-distance')!;
    for (const k of routineKeys(routine)) {
      messy = pressKey(messy, 'n7', 1);   // a wrong key before every right one
      messy = pressKey(messy, k, 2);
      clean = pressKey(clean, k, 2);
    }
    expect(messy.done).toBe(true);
    expect(messy.calc.display).toBe(clean.calc.display);
  });
});

describe('finishing', () => {
  it('runs to done and stops offering keys', () => {
    const routine = guidedRoutine('inverse-distance')!;
    const run = pressKeys(startRun('inverse-distance')!, routineKeys(routine));
    expect(run.done).toBe(true);
    expect(nextKey(run)).toBeNull();
    expect(currentStep(run)).toBeNull();
    expect(progress(run)).toBe(1);
  });

  it('ignores presses after it is done', () => {
    const routine = guidedRoutine('inverse-distance')!;
    const done = pressKeys(startRun('inverse-distance')!, routineKeys(routine));
    expect(pressKey(done, 'n5')).toBe(done);
  });

  it('every routine can be walked from first key to last', () => {
    // Catches a routine whose keys the walk cannot deliver — a mishandled STO gesture, say, which
    // would strand the run halfway with no way on.
    for (const routine of TI_30XA_GUIDED) {
      const run = pressKeys(startRun(routine.id)!, routineKeys(routine));
      expect(run.done, `${routine.id} never finished`).toBe(true);
      expect(routine.answer, `${routine.id} ends on ${run.calc.display}`).toContain(run.calc.display);
    }
  });

  it('progress moves monotonically and never exceeds 1', () => {
    for (const routine of TI_30XA_GUIDED) {
      let run = startRun(routine.id)!;
      let last = progress(run);
      for (const k of routineKeys(routine)) {
        run = pressKey(run, k);
        const p = progress(run);
        expect(p).toBeGreaterThanOrEqual(last);
        expect(p).toBeLessThanOrEqual(1);
        last = p;
      }
    }
  });
});

describe('the memory gesture', () => {
  it('STO takes the digit as a slot, not as a number to type', () => {
    // If this fell through to the engine the display would read 1432.3951 instead of the stored
    // number — a bug a student would blame themselves for.
    const routine = guidedRoutine('memory-sto-rcl')!;
    const upToSto = routine.steps.slice(0, 2).flatMap((s) => s.keys);
    const run = pressKeys(startRun('memory-sto-rcl')!, upToSto);
    expect(run.calc.display).toBe('1432.395');
  });

  it('RCL brings the stored number back', () => {
    const routine = guidedRoutine('memory-sto-rcl')!;
    const upToRcl = routine.steps.slice(0, 4).flatMap((s) => s.keys);
    const run = pressKeys(startRun('memory-sto-rcl')!, upToRcl);
    expect(run.calc.display).toBe('1432.395');
  });
});
