// __tests__/hub/widget-content-resolvers.test.ts
//
// Slice 15 of employee-hub-overhaul-2026-05-30.md. Locks the shared
// helpers used by the "list cap + boolean toggle" schema widgets
// (pending-hours, pending-receipts, pending-time-off, quiz-history)
// — and the higher-arity resolveEnum that downstream slices will use.

import { describe, it, expect } from 'vitest';
import {
  resolveBool,
  resolveBoundedInt,
  resolveEnum,
} from '@/lib/hub/widgets/_shared/content-resolvers';

describe('Slice 15 — resolveBoundedInt', () => {
  it.each<[unknown, number]>([
    [5, 5],
    [1, 1],
    [20, 20],
    [100, null as unknown as number],
    [0, null as unknown as number],
    [-3, null as unknown as number],
    [NaN, null as unknown as number],
    [undefined, null as unknown as number],
    [null, null as unknown as number],
    ['5', null as unknown as number],
    [3.9, 3],
  ])('raw=%j → %s', (raw, expected) => {
    expect(resolveBoundedInt(raw, 1, 20, null)).toBe(expected);
  });

  it('honors a non-null fallback', () => {
    expect(resolveBoundedInt(undefined, 1, 20, 5)).toBe(5);
    expect(resolveBoundedInt(100, 1, 20, 5)).toBe(5);
  });
});

describe('Slice 15 — resolveBool', () => {
  it.each<[unknown, boolean, boolean]>([
    [true, false, true],
    [false, true, false],
    [undefined, true, true],
    [null, true, true],
    [0, true, true],
    ['true', true, true],
  ])('raw=%j fallback=%s → %s', (raw, fallback, expected) => {
    expect(resolveBool(raw, fallback)).toBe(expected);
  });
});

describe('Slice 15 — resolveEnum', () => {
  type Color = 'red' | 'green' | 'blue';
  const ALLOWED: ReadonlyArray<Color> = ['red', 'green', 'blue'];

  it('passes through known values', () => {
    expect(resolveEnum('red', ALLOWED, 'green')).toBe('red');
    expect(resolveEnum('blue', ALLOWED, 'green')).toBe('blue');
  });

  it('falls back when value is not in the allowed set', () => {
    expect(resolveEnum('purple', ALLOWED, 'green')).toBe('green');
    expect(resolveEnum(undefined, ALLOWED, 'green')).toBe('green');
    expect(resolveEnum(42, ALLOWED, 'green')).toBe('green');
  });
});
