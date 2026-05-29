// __tests__/hub/widgets/bookmarks.test.ts
//
// Slice 115 — Bookmarks widget helpers + registry round-trip.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, colsForBucket, isExternal, makeId } from '@/lib/hub/widgets/bookmarks';

describe('bookmarks widget — registry', () => {
  it('registers in personal category as a universal widget', () => {
    const def = getWidget('bookmarks');
    expect(def).toBeDefined();
    expect(def?.category).toBe('personal');
    expect(def?.allowedRoles).toEqual([]);
  });

  it('default size 6×2', () => {
    expect(getWidget('bookmarks')?.defaultSize).toEqual({ w: 6, h: 2 });
  });

  it('default content has zero bookmarks', () => {
    const c = getWidget('bookmarks')?.defaultContent as { bookmarks: unknown[] };
    expect(c.bookmarks).toEqual([]);
  });
});

describe('bookmarks — capForBucket', () => {
  it('tiny → 2', () => { expect(capForBucket('tiny')).toBe(2); });
  it('small → 4', () => { expect(capForBucket('small')).toBe(4); });
  it('medium → 6', () => { expect(capForBucket('medium')).toBe(6); });
  it('large → 12', () => { expect(capForBucket('large')).toBe(12); });
  it('xlarge → 24', () => { expect(capForBucket('xlarge')).toBe(24); });
});

describe('bookmarks — colsForBucket', () => {
  it('tiny → 1', () => { expect(colsForBucket('tiny')).toBe(1); });
  it('small → 2', () => { expect(colsForBucket('small')).toBe(2); });
  it('medium → 3', () => { expect(colsForBucket('medium')).toBe(3); });
  it('large → 4', () => { expect(colsForBucket('large')).toBe(4); });
  it('xlarge → 6', () => { expect(colsForBucket('xlarge')).toBe(6); });
});

describe('bookmarks — isExternal', () => {
  it('returns true for http(s) URLs', () => {
    expect(isExternal('https://example.com')).toBe(true);
    expect(isExternal('http://example.com')).toBe(true);
  });

  it('returns false for in-app paths', () => {
    expect(isExternal('/admin/jobs')).toBe(false);
    expect(isExternal('/help')).toBe(false);
  });

  it('returns false for empty / weird input', () => {
    expect(isExternal('')).toBe(false);
    expect(isExternal('mailto:test@example.com')).toBe(false);
  });
});

describe('bookmarks — makeId', () => {
  it('returns a non-empty string', () => {
    const id = makeId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique ids across calls', () => {
    const a = makeId();
    const b = makeId();
    expect(a).not.toBe(b);
  });
});
