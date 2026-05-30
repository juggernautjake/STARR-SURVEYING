// __tests__/hub/mobile-size-override.test.ts
//
// hub-mobile-build-out Slice 2 — locks the bucket override that bumps
// widgets out of their tiny single-stat render on mobile (where every
// widget is 1 col wide, so `sizeBucket(1, h≤2) = 'tiny'` and full-width
// widgets fall into a "375 px wide × one number" layout that reads as
// broken). The override pushes the size widgets read to {w:2, h:max(h,2)}
// so the bucket math lands in `small` or `medium`.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mobileSizeOverride } from '@/lib/hub/grid-math';
import { sizeBucket } from '@/lib/hub/size-bucket';

describe('mobileSizeOverride', () => {
  it('returns the size unchanged at the desktop breakpoint', () => {
    expect(mobileSizeOverride({ w: 4, h: 3 }, 8)).toEqual({ w: 4, h: 3 });
    expect(mobileSizeOverride({ w: 1, h: 1 }, 8)).toEqual({ w: 1, h: 1 });
  });

  it('returns the size unchanged at the tablet (4-col) breakpoint', () => {
    expect(mobileSizeOverride({ w: 2, h: 2 }, 4)).toEqual({ w: 2, h: 2 });
  });

  it('on mobile bumps the rendered width to 2 + ensures h is at least 2', () => {
    expect(mobileSizeOverride({ w: 1, h: 1 }, 1)).toEqual({ w: 2, h: 2 });
    expect(mobileSizeOverride({ w: 1, h: 2 }, 1)).toEqual({ w: 2, h: 2 });
    expect(mobileSizeOverride({ w: 1, h: 3 }, 1)).toEqual({ w: 2, h: 3 });
    expect(mobileSizeOverride({ w: 1, h: 6 }, 1)).toEqual({ w: 2, h: 6 });
  });

  it('the override progression lands widgets in small/medium on mobile (not tiny)', () => {
    // The whole point of the override.
    for (const h of [1, 2, 3, 4, 6]) {
      const { w: ow, h: oh } = mobileSizeOverride({ w: 1, h }, 1);
      expect(sizeBucket(ow, oh)).not.toBe('tiny');
    }
  });
});

// Source-regex lock — the WidgetGrid actually applies the override.
const GRID = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetGrid.tsx'),
  'utf8',
);

describe('WidgetGrid — mobile size override wiring', () => {
  it('calls mobileSizeOverride before passing size to the widget body', () => {
    expect(GRID).toMatch(/mobileSizeOverride\(/);
    expect(GRID).toMatch(/size={renderSize}/);
  });
});
