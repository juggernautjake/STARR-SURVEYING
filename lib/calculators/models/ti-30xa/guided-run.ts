// lib/calculators/models/ti-30xa/guided-run.ts — the state machine behind a guided routine.
//
// ── WHY THIS IS NOT INSIDE THE COMPONENT ────────────────────────────────────────────────────────
//
// It started there. The rule that matters most — a wrong keypress must NOT advance the calculator —
// is exactly the kind of rule that gets quietly broken by a later edit, and the repo has no
// component-interaction testing (no @testing-library; the existing component tests render to a
// string with react-dom/server and cannot click anything).
//
// So the logic that must not break is a pure function of (state, key), and the component is a thin
// shell that renders it. Everything below is tested directly, by pressing keys.
//
// ── THE WRONG-KEY RULE ──────────────────────────────────────────────────────────────────────────
//
// A wrong press records what was pressed and changes nothing else. Not "records it and applies it
// anyway", which is what a naive implementation does by falling through.
//
// The reason is not strictness for its own sake. A guided run that half-follows the routine and
// half-follows a stray keypress arrives at a display the step explanations no longer describe, and
// the student is left reading instructions for a state they have no way back from. Refusing the
// press keeps the guide and the machine saying the same thing.

import { press, initialState, storeTo, recallFrom, type Ti30xaState } from './engine';
import { guidedRoutine, type GuidedRoutine, type GuidedStep } from './guided';

export interface GuidedRun {
  routine: GuidedRoutine;
  calc: Ti30xaState;
  /** Which step is being worked. Equals `routine.steps.length` once finished. */
  stepIndex: number;
  /** How far into the current step's keys the student has got. */
  keyIndex: number;
  /** The last key pressed in error, and when — the timestamp lets the UI replay its animation. */
  wrong: { id: string; at: number } | null;
  /** STO and RCL take a digit afterwards. The same two-key gesture the emulator handles. */
  awaiting: null | 'sto' | 'rcl';
  done: boolean;
}

/** Start, or restart, a routine. Returns null for an id that does not exist. */
export function startRun(routineId: string): GuidedRun | null {
  const routine = guidedRoutine(routineId);
  if (!routine) return null;
  return { routine, calc: initialState, stepIndex: 0, keyIndex: 0, wrong: null, awaiting: null, done: false };
}

/** The step being worked, or null once the routine is finished. */
export function currentStep(run: GuidedRun): GuidedStep | null {
  return run.done ? null : (run.routine.steps[run.stepIndex] ?? null);
}

/** The single key the student should press next, or null when there is nothing to press. */
export function nextKey(run: GuidedRun): string | null {
  const step = currentStep(run);
  return step?.keys[run.keyIndex] ?? null;
}

/** 0 to 1, for a progress rail. */
export function progress(run: GuidedRun): number {
  const total = run.routine.steps.length;
  if (total === 0) return 1;
  return (run.done ? total : run.stepIndex) / total;
}

/**
 * Press a key.
 *
 * `now` is passed in rather than read from the clock so the result is a pure function of its
 * inputs — which is what makes "press the same wrong key twice and get two distinct records" a
 * thing a test can assert rather than a thing that depends on how fast the test ran.
 */
export function pressKey(run: GuidedRun, keyId: string, now = Date.now()): GuidedRun {
  if (run.done) return run;
  const step = currentStep(run);
  if (!step) return run;

  if (keyId !== nextKey(run)) {
    // Recorded, and nothing else. See the note at the top of the file.
    return { ...run, wrong: { id: keyId, at: now } };
  }

  // The memory gesture, matching the emulator exactly: STO/RCL arm, and the digit that follows
  // chooses a slot instead of being typed into the display.
  let calc = run.calc;
  let awaiting = run.awaiting;
  if (awaiting && /^n[0-2]$/.test(keyId)) {
    const slot = Number(keyId.slice(1)) as 0 | 1 | 2;
    calc = awaiting === 'sto' ? storeTo(calc, slot) : recallFrom(calc, slot);
    awaiting = null;
  } else if (keyId === 'sto' || keyId === 'rcl') {
    awaiting = keyId;
    calc = { ...calc, shift: false };
  } else {
    calc = press(calc, keyId);
  }

  const keyIndex = run.keyIndex + 1;
  if (keyIndex < step.keys.length) {
    return { ...run, calc, awaiting, keyIndex, wrong: null };
  }

  const stepIndex = run.stepIndex + 1;
  const done = stepIndex >= run.routine.steps.length;
  return { ...run, calc, awaiting, keyIndex: 0, stepIndex, done, wrong: null };
}

/** Press a whole list, for tests and for replaying a saved run. */
export function pressKeys(run: GuidedRun, keys: string[], now = Date.now()): GuidedRun {
  return keys.reduce((r, k) => pressKey(r, k, now), run);
}
