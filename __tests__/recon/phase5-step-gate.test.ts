// __tests__/recon/phase5-step-gate.test.ts
// Unit tests for the StepGate class used in step-through debugging mode.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StepGate } from '../../worker/src/lib/step-gate.js';

describe('StepGate', () => {
  let gate: StepGate;

  beforeEach(() => {
    gate = new StepGate();
  });

  // ── Step mode enable/disable ───────────────────────────────────────────────

  it('isStepMode returns false before enableStepMode is called', () => {
    expect(gate.isStepMode('proj-1')).toBe(false);
  });

  it('isStepMode returns true after enableStepMode is called', () => {
    gate.enableStepMode('proj-1');
    expect(gate.isStepMode('proj-1')).toBe(true);
  });

  it('isStepMode returns false after disableStepMode is called', () => {
    gate.enableStepMode('proj-1');
    gate.disableStepMode('proj-1');
    expect(gate.isStepMode('proj-1')).toBe(false);
  });

  it('step mode is per-project — enabling one project does not affect another', () => {
    gate.enableStepMode('proj-a');
    expect(gate.isStepMode('proj-a')).toBe(true);
    expect(gate.isStepMode('proj-b')).toBe(false);
  });

  it('disableStepMode on a project that was never enabled does not throw', () => {
    expect(() => gate.disableStepMode('unknown-project')).not.toThrow();
  });

  // ── advance with no checkpoint ─────────────────────────────────────────────

  it('advance returns false when no checkpoint is waiting', () => {
    expect(gate.advance('proj-1')).toBe(false);
  });

  it('advance returns false for an unknown project id', () => {
    expect(gate.advance('nonexistent')).toBe(false);
  });

  // ── getCurrentCheckpoint ───────────────────────────────────────────────────

  it('getCurrentCheckpoint returns null when no checkpoint is pending', () => {
    expect(gate.getCurrentCheckpoint('proj-1')).toBeNull();
  });

  it('getCurrentCheckpoint returns the label of the waiting checkpoint', async () => {
    gate.enableStepMode('proj-1');
    const checkpointPromise = gate.addCheckpoint('proj-1', 'myFunction: entry');
    expect(gate.getCurrentCheckpoint('proj-1')).toBe('myFunction: entry');
    gate.advance('proj-1');
    await checkpointPromise;
  });

  it('getCurrentCheckpoint returns null after advance resolves the checkpoint', async () => {
    gate.enableStepMode('proj-1');
    const checkpointPromise = gate.addCheckpoint('proj-1', 'someFunc: test');
    gate.advance('proj-1');
    await checkpointPromise;
    expect(gate.getCurrentCheckpoint('proj-1')).toBeNull();
  });

  // ── addCheckpoint blocks until advance ────────────────────────────────────

  it('addCheckpoint resolves after advance is called', async () => {
    gate.enableStepMode('proj-1');
    let resolved = false;

    const checkpointPromise = gate.addCheckpoint('proj-1', 'step-1').then(() => {
      resolved = true;
    });

    // Should not be resolved yet
    expect(resolved).toBe(false);

    gate.advance('proj-1');
    await checkpointPromise;

    expect(resolved).toBe(true);
  });

  it('advance returns true when there is a waiting checkpoint', async () => {
    gate.enableStepMode('proj-1');
    const checkpointPromise = gate.addCheckpoint('proj-1', 'fn: checkpoint');
    const result = gate.advance('proj-1');
    expect(result).toBe(true);
    await checkpointPromise;
  });

  it('advance resolves the checkpoint with the correct label', async () => {
    gate.enableStepMode('proj-1');
    let label = '';
    const checkpointPromise = gate.addCheckpoint('proj-1', 'myFn: label-test');
    label = gate.getCurrentCheckpoint('proj-1') ?? '';
    gate.advance('proj-1');
    await checkpointPromise;
    expect(label).toBe('myFn: label-test');
  });

  it('subsequent checkpoints block independently', async () => {
    gate.enableStepMode('proj-1');
    const order: number[] = [];

    const p1 = gate.addCheckpoint('proj-1', 'step-1').then(() => { order.push(1); });
    gate.advance('proj-1');
    await p1;
    expect(order).toEqual([1]);

    const p2 = gate.addCheckpoint('proj-1', 'step-2').then(() => { order.push(2); });
    gate.advance('proj-1');
    await p2;
    expect(order).toEqual([1, 2]);
  });

  it('disableStepMode resolves a pending checkpoint so pipeline can finish', async () => {
    gate.enableStepMode('proj-1');
    let resolved = false;

    const checkpointPromise = gate.addCheckpoint('proj-1', 'blocked').then(() => {
      resolved = true;
    });

    // Disable without advancing — should still resolve
    gate.disableStepMode('proj-1');
    await checkpointPromise;
    expect(resolved).toBe(true);
  });

  it('checkpoints are isolated between projects', async () => {
    gate.enableStepMode('proj-a');
    gate.enableStepMode('proj-b');

    let resolvedA = false;
    let resolvedB = false;

    const pA = gate.addCheckpoint('proj-a', 'fn-a').then(() => { resolvedA = true; });
    const pB = gate.addCheckpoint('proj-b', 'fn-b').then(() => { resolvedB = true; });

    gate.advance('proj-a');
    await pA;

    expect(resolvedA).toBe(true);
    expect(resolvedB).toBe(false);

    gate.advance('proj-b');
    await pB;

    expect(resolvedB).toBe(true);
  });

  it('advance on proj-a does not affect proj-b checkpoint', async () => {
    gate.enableStepMode('proj-a');
    gate.enableStepMode('proj-b');

    let resolvedB = false;
    gate.addCheckpoint('proj-b', 'fn-b').then(() => { resolvedB = true; });

    // Advance proj-a (no checkpoint there)
    const resultA = gate.advance('proj-a');
    expect(resultA).toBe(false);

    // proj-b should still be blocked
    await new Promise(r => setTimeout(r, 10));
    expect(resolvedB).toBe(false);

    // Clean up
    gate.disableStepMode('proj-b');
  });

  it('re-enabling step mode after disable works correctly', async () => {
    gate.enableStepMode('proj-1');
    gate.disableStepMode('proj-1');
    expect(gate.isStepMode('proj-1')).toBe(false);

    gate.enableStepMode('proj-1');
    expect(gate.isStepMode('proj-1')).toBe(true);

    let resolved = false;
    const p = gate.addCheckpoint('proj-1', 'after-reenable').then(() => { resolved = true; });
    gate.advance('proj-1');
    await p;
    expect(resolved).toBe(true);
  });

  it('a new addCheckpoint after one resolves works normally', async () => {
    gate.enableStepMode('proj-1');

    const p1 = gate.addCheckpoint('proj-1', 'first');
    gate.advance('proj-1');
    await p1;

    // After first resolves, a second checkpoint should work fine
    let resolved2 = false;
    const p2 = gate.addCheckpoint('proj-1', 'second').then(() => { resolved2 = true; });
    expect(resolved2).toBe(false);
    gate.advance('proj-1');
    await p2;
    expect(resolved2).toBe(true);
  });
});
