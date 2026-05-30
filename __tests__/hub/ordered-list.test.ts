// __tests__/hub/ordered-list.test.ts
//
// Slice 4 of hub-widget-excellence-02-shared-infra. Locks the pure
// reorder helpers behind the ordered multi-select editor primitive.

import { describe, it, expect } from 'vitest';
import {
  moveUp,
  moveDown,
  addOrdered,
  removeOrdered,
  normalizeOrdered,
  unselectedOptions,
} from '@/lib/hub/widgets/_shared/ordered-list';

describe('moveUp / moveDown', () => {
  it('moveUp swaps with the previous item', () => {
    expect(moveUp(['a', 'b', 'c'], 1)).toEqual(['b', 'a', 'c']);
    expect(moveUp(['a', 'b', 'c'], 2)).toEqual(['a', 'c', 'b']);
  });

  it('moveDown swaps with the next item', () => {
    expect(moveDown(['a', 'b', 'c'], 0)).toEqual(['b', 'a', 'c']);
    expect(moveDown(['a', 'b', 'c'], 1)).toEqual(['a', 'c', 'b']);
  });

  it('are no-ops at the boundaries / out of range', () => {
    expect(moveUp(['a', 'b'], 0)).toEqual(['a', 'b']);
    expect(moveDown(['a', 'b'], 1)).toEqual(['a', 'b']);
    expect(moveUp(['a', 'b'], 9)).toEqual(['a', 'b']);
    expect(moveDown(['a', 'b'], -1)).toEqual(['a', 'b']);
  });

  it('return a new array (immutability)', () => {
    const src = ['a', 'b'];
    const out = moveDown(src, 0);
    expect(out).not.toBe(src);
    expect(src).toEqual(['a', 'b']);
  });
});

describe('addOrdered / removeOrdered', () => {
  it('appends a new value to the end', () => {
    expect(addOrdered(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('does not duplicate an already-present value', () => {
    expect(addOrdered(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('removes a value', () => {
    expect(removeOrdered(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

describe('normalizeOrdered', () => {
  const valid = ['a', 'b', 'c'];

  it('keeps only valid values, preserving order', () => {
    expect(normalizeOrdered(['c', 'a'], valid, [])).toEqual(['c', 'a']);
  });

  it('drops removed/unknown options', () => {
    expect(normalizeOrdered(['a', 'zzz', 'b'], valid, [])).toEqual(['a', 'b']);
  });

  it('de-dupes preserving first-seen order', () => {
    expect(normalizeOrdered(['b', 'b', 'a'], valid, [])).toEqual(['b', 'a']);
  });

  it('falls back when the raw value is not a string array', () => {
    expect(normalizeOrdered(undefined, valid, ['a'])).toEqual(['a']);
    expect(normalizeOrdered(42, valid, ['b'])).toEqual(['b']);
    expect(normalizeOrdered([1, 2], valid, ['c'])).toEqual(['c']);
  });
});

describe('unselectedOptions', () => {
  it('returns option values not yet selected, in option order', () => {
    expect(unselectedOptions(['b'], ['a', 'b', 'c'])).toEqual(['a', 'c']);
  });

  it('returns empty when everything is selected', () => {
    expect(unselectedOptions(['a', 'b'], ['a', 'b'])).toEqual([]);
  });
});
