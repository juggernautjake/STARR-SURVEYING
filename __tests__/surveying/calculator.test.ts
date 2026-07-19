// __tests__/surveying/calculator.test.ts — the Work Mode surveying-calculator operation catalog.
import { describe, it, expect } from 'vitest';
import { SURVEYING_OPERATIONS, operationsByCategory, findOperation } from '@/lib/surveying/calculator';

describe('operation catalog', () => {
  it('every operation has an id, label, inputs, and a compute', () => {
    const ids = new Set<string>();
    for (const op of SURVEYING_OPERATIONS) {
      expect(op.id).toBeTruthy();
      expect(op.label).toBeTruthy();
      expect(op.inputs.length).toBeGreaterThan(0);
      expect(typeof op.compute).toBe('function');
      expect(ids.has(op.id)).toBe(false); // unique ids
      ids.add(op.id);
    }
  });

  it('groups by category in a stable UI order, covering everything', () => {
    const groups = operationsByCategory();
    expect(groups.map(([c]) => c)).toEqual(['convert', 'angle', 'triangle', 'traverse']);
    expect(groups.reduce((n, [, ops]) => n + ops.length, 0)).toBe(SURVEYING_OPERATIONS.length);
  });

  it('never throws and returns an error (not NaN) for an impossible input', () => {
    for (const op of SURVEYING_OPERATIONS) {
      const res = op.compute({}); // all-missing args
      // Either a formatted value or a friendly error — never a thrown exception or "NaN".
      if ('value' in res) expect(res.value).not.toMatch(/NaN/);
      else expect(res.error.length).toBeGreaterThan(0);
    }
  });
});

describe('representative computes are correct', () => {
  const run = (id: string, args: Record<string, number | string>) => findOperation(id)!.compute(args);

  it('bearing → azimuth (N 30 E → 30°)', () => {
    expect(run('bearing-to-azimuth', { quadrant: 'NE', angle: 30 })).toEqual({ value: "30°00'00\"" });
  });
  it('add angles wraps past 360', () => {
    expect(run('angle-add', { a: 350, b: 20 })).toEqual({ value: '10°' });
  });
  it('complement rejects an obtuse angle with a friendly error', () => {
    expect(run('complement', { a: 120 })).toEqual({ error: 'Complement needs 0–90°.' });
  });
  it('pythagorean hypotenuse of 3,4 is 5', () => {
    expect(run('pyth-hyp', { a: 3, b: 4 })).toEqual({ value: '5' });
  });
  it('law of cosines angle of a 3-4-5 opposite side c=5 is 90°', () => {
    expect(run('loc-angle', { a: 3, b: 4, c: 5 })).toEqual({ value: '90°' });
  });
  it('deflection reports magnitude + turn direction', () => {
    expect(run('deflection', { from: 0, to: 30 })).toEqual({ value: '30° R' });
  });
  it('latitude & departure of a due-east 100 course', () => {
    expect(run('lat-dep', { az: 90, dist: 100 })).toEqual({ value: 'Lat 0 · Dep 100' });
  });
});
