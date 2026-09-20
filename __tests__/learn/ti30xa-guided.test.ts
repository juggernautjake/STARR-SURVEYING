// __tests__/learn/ti30xa-guided.test.ts — the guide has to agree with the calculator.
//
// This is the point of writing the routines as key ids rather than as prose. Every step claims a
// display, and this test presses the keys and checks it. A routine that has drifted from the engine
// fails here instead of teaching somebody a sequence that does not work on the device they will sit
// the exam with.
//
// The 30Xa emulator was itself wrong until 2026-09-20 — it was wired to the TI-36X Pro's
// expression-entry engine, so it trained `SIN 45` on a machine that wants `45 SIN`. Nothing caught
// it because nothing asserted what the keys produced. That is the hole this closes.

import { describe, it, expect } from 'vitest';
import { pressAll, initialState, press, type Ti30xaState } from '@/lib/calculators/models/ti-30xa/engine';
import { TI_30XA_GUIDED, guidedRoutine, routineKeys } from '@/lib/calculators/models/ti-30xa/guided';
import { TI_30XA_KEYPAD } from '@/lib/calculators/models/ti-30xa/keypad-data';
import { storeTo, recallFrom } from '@/lib/calculators/models/ti-30xa/engine';

/**
 * Press a routine the way the component does.
 *
 * STO and RCL are a two-key gesture — the digit after them chooses a memory rather than typing a
 * number — and the component handles that outside the engine so the engine can stay a pure function
 * of one key. This test has to do the same, or the memory routine would type "1" into the display
 * and quietly diverge from what a student actually sees.
 */
function run(keys: string[]): Ti30xaState {
  let s = initialState;
  let awaiting: null | 'sto' | 'rcl' = null;
  for (const k of keys) {
    if (awaiting && /^n[0-2]$/.test(k)) {
      const slot = Number(k.slice(1)) as 0 | 1 | 2;
      s = awaiting === 'sto' ? storeTo(s, slot) : recallFrom(s, slot);
      awaiting = null;
      continue;
    }
    if (k === 'sto') { awaiting = 'sto'; s = { ...s, shift: false }; continue; }
    if (k === 'rcl') { awaiting = 'rcl'; s = { ...s, shift: false }; continue; }
    s = press(s, k);
  }
  return s;
}

describe('every guided routine does what it says', () => {
  for (const routine of TI_30XA_GUIDED) {
    it(`${routine.id}: each step's display is the one the engine produces`, () => {
      let s = initialState;
      let awaiting: null | 'sto' | 'rcl' = null;
      routine.steps.forEach((step, i) => {
        for (const k of step.keys) {
          if (awaiting && /^n[0-2]$/.test(k)) {
            const slot = Number(k.slice(1)) as 0 | 1 | 2;
            s = awaiting === 'sto' ? storeTo(s, slot) : recallFrom(s, slot);
            awaiting = null;
            continue;
          }
          if (k === 'sto') { awaiting = 'sto'; s = { ...s, shift: false }; continue; }
          if (k === 'rcl') { awaiting = 'rcl'; s = { ...s, shift: false }; continue; }
          s = press(s, k);
        }
        expect(s.display, `${routine.id} step ${i + 1} (${step.label}) — "${step.does}"`).toBe(step.expect);
      });
    });
  }
});

describe('the routines are usable as written', () => {
  const keyIds = new Set(TI_30XA_KEYPAD.map((k) => k.id));

  it('every key a routine presses exists on the keypad', () => {
    // Otherwise the UI cannot highlight the next key, and the student is told to press something
    // that is not there.
    for (const routine of TI_30XA_GUIDED) {
      for (const step of routine.steps) {
        for (const k of step.keys) {
          expect(keyIds.has(k), `${routine.id}/${step.label}: no key '${k}' on the keypad`).toBe(true);
        }
      }
    }
  });

  it('every step explains itself and expects something', () => {
    for (const routine of TI_30XA_GUIDED) {
      expect(routine.steps.length, `${routine.id} has no steps`).toBeGreaterThan(0);
      for (const step of routine.steps) {
        expect(step.keys.length, `${routine.id}/${step.label} presses nothing`).toBeGreaterThan(0);
        expect(step.does.length, `${routine.id}/${step.label} has no explanation`).toBeGreaterThan(20);
        expect(step.expect.length, `${routine.id}/${step.label} expects nothing`).toBeGreaterThan(0);
      }
    }
  });

  it('the stated answer matches the final display', () => {
    // The summary line is written by hand and is the easiest thing in the file to leave behind
    // after editing the keystrokes above it.
    for (const routine of TI_30XA_GUIDED) {
      const final = run(routineKeys(routine));
      expect(routine.answer, `${routine.id}: answer does not mention the final display ${final.display}`)
        .toContain(final.display);
    }
  });

  it('ids are unique and findable', () => {
    const ids = TI_30XA_GUIDED.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(guidedRoutine(id)?.id).toBe(id);
  });

  it('is unknown-id safe', () => {
    expect(guidedRoutine('not-a-routine')).toBeUndefined();
  });
});

describe('the routines teach the machine that is actually in front of you', () => {
  it('demonstrates immediate execution, not expression entry', () => {
    // 300 x² is 90000 the instant x² is pressed. On a 36X Pro nothing would have happened yet.
    // If this ever flips, the guide's whole "does" column becomes wrong at once.
    expect(run(['n3', 'n0', 'n0', 'xsq']).display).toBe('90000');
  });

  it('demonstrates AOS precedence, which one routine tells the student to go and check', () => {
    // dms-to-decimal says: "press 2 + 3 × 4 = and you get 14, not 20".
    expect(run(['n2', 'add', 'n3', 'mul', 'n4', 'eq']).display).toBe('14');
  });

  it('STO does not type a digit into the display', () => {
    // The gesture the component intercepts. Getting this wrong shows 1432.3951 rather than a
    // stored number, which is a bug a student would blame themselves for.
    expect(run(['n5', 'n0', 'n0', 'sto', 'n1']).display).toBe('500');
    expect(run(['n5', 'n0', 'n0', 'sto', 'n1', 'n9', 'rcl', 'n1']).display).toBe('500');
  });
});
