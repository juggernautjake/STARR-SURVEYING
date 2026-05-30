// __tests__/hub/widgets/quick-actions.test.ts
//
// hub-widget-excellence-15 — quick-actions overhaul. Locks the
// capacity-fill math (render as many tiles as fit the body), the
// "+N more" overflow split, the bucket-cap fallback before measurement,
// the registry shape, and the catalog integrity (R1/R2: every link
// action resolves to a real href — checked structurally here, against
// the route table by hand in the doc).

import { describe, it, expect } from 'vitest';
import '@/lib/hub/widgets/quick-actions';
import { getWidget } from '@/lib/hub/widget-registry';
import { computeCapacity, capForBucket } from '@/lib/hub/widgets/quick-actions';
import { gridCapacity, listCapacity, splitForCapacity } from '@/lib/hub/widgets/quick-actions/capacity';
import { QUICK_ACTIONS_CATALOG } from '@/lib/hub/quick-actions-catalog';

describe('gridCapacity', () => {
  it('packs cols × rows by the tile + gap footprint', () => {
    // 360px wide, 200px tall, 84+12 per tile horizontally, 66+12 vertically.
    // cols = floor((360+12)/96) = 3 ; rows = floor((200+12)/78) = 2.
    expect(gridCapacity(360, 200, { minTileW: 84, minTileH: 66 })).toEqual({ cols: 3, rows: 2, cap: 6 });
  });

  it('never drops below a single tile, even for a 0/negative box', () => {
    expect(gridCapacity(0, 0, { minTileW: 84, minTileH: 66 })).toEqual({ cols: 1, rows: 1, cap: 1 });
    expect(gridCapacity(40, 40, { minTileW: 84, minTileH: 66 })).toEqual({ cols: 1, rows: 1, cap: 1 });
  });
});

describe('listCapacity', () => {
  it('counts the rows that fit the height', () => {
    // floor((220+8)/(44+8)) = floor(228/52) = 4.
    expect(listCapacity(220, { rowH: 44 })).toEqual({ cols: 1, rows: 4, cap: 4 });
    expect(listCapacity(0, { rowH: 44 })).toEqual({ cols: 1, rows: 1, cap: 1 });
  });
});

describe('splitForCapacity', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  it('shows everything when it fits', () => {
    expect(splitForCapacity(items, 5)).toEqual({ visible: items, overflow: 0 });
    expect(splitForCapacity(items, 9)).toEqual({ visible: items, overflow: 0 });
  });
  it('reserves one cell for "+N more" on overflow', () => {
    // cap 3 → 2 tiles + a +3 indicator (5 - 2).
    expect(splitForCapacity(items, 3)).toEqual({ visible: ['a', 'b'], overflow: 3 });
  });
  it('hides the whole set behind the indicator at cap 1', () => {
    expect(splitForCapacity(items, 1)).toEqual({ visible: [], overflow: 5 });
  });
});

describe('computeCapacity — measured fill with bucket fallback', () => {
  it('falls back to the bucket cap before the body is measured (px 0)', () => {
    expect(computeCapacity({ bucket: 'medium', widthPx: 0, heightPx: 0, isRowLayout: false, displayStyle: 'icon-label' }))
      .toEqual({ cap: capForBucket('medium'), cols: 3 });
  });
  it('uses the measured grid box once available', () => {
    const out = computeCapacity({ bucket: 'large', widthPx: 360, heightPx: 200, isRowLayout: false, displayStyle: 'icon-label' });
    expect(out.cols).toBe(3);
    expect(out.cap).toBe(6);
  });
  it('packs tighter for icon-only tiles', () => {
    const label = computeCapacity({ bucket: 'large', widthPx: 360, heightPx: 200, isRowLayout: false, displayStyle: 'icon-label' });
    const iconOnly = computeCapacity({ bucket: 'large', widthPx: 360, heightPx: 200, isRowLayout: false, displayStyle: 'icon-only' });
    expect(iconOnly.cap).toBeGreaterThan(label.cap);
  });
  it('measures rows for the list layout', () => {
    expect(computeCapacity({ bucket: 'small', widthPx: 200, heightPx: 220, isRowLayout: true, displayStyle: 'icon-label' }).cap)
      .toBe(listCapacity(220, { rowH: 44 }).cap);
  });
});

describe('quick-actions catalog integrity (R1/R2)', () => {
  it('every link action has an href and every action-kind has an actionId', () => {
    for (const a of QUICK_ACTIONS_CATALOG) {
      if (a.kind === 'link') {
        expect(a.href, `${a.id} link needs href`).toBeTruthy();
        expect(a.href!.startsWith('/'), `${a.id} href is internal`).toBe(true);
      } else {
        expect(a.actionId, `${a.id} action needs actionId`).toBeTruthy();
      }
    }
  });
});

describe('quick-actions widget — registry', () => {
  it('registers in personal category as a universal widget', () => {
    const def = getWidget('quick-actions');
    expect(def?.category).toBe('personal');
    expect(def?.allowedRoles).toEqual([]);
  });
});
