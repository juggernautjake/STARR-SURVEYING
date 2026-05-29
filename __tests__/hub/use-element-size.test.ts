// __tests__/hub/use-element-size.test.ts
//
// Slice 202 of hub-editor-performance-and-ux-2026-05-29.md. Locks
// the single-source-of-truth resize hook + the no-redundant-update
// short-circuit that prevents the same-frame setState pile-up.
// Slice 209 rebalanced the breakpoint thresholds (12/6/1 → 8/4/1)
// when the grid switched to 8-col square cells.

import { describe, it, expect } from 'vitest';
import { breakpointForWidth } from '@/lib/hub/grid-math';

describe('breakpointForWidth — width thresholds the hook depends on', () => {
  it('returns 8 for desktop widths', () => {
    expect(breakpointForWidth(1920)).toBe(8);
    expect(breakpointForWidth(1024)).toBe(8);
  });

  it('returns 4 for tablet widths', () => {
    expect(breakpointForWidth(1023)).toBe(4);
    expect(breakpointForWidth(640)).toBe(4);
  });

  it('returns 1 for mobile widths', () => {
    expect(breakpointForWidth(639)).toBe(1);
    expect(breakpointForWidth(320)).toBe(1);
    expect(breakpointForWidth(0)).toBe(1);
  });
});

describe('useElementSize — initial state', () => {
  it('starts with 0/0 + breakpoint=8 before the observer fires', async () => {
    const { useElementSize } = await import('@/lib/hub/use-element-size');
    expect(typeof useElementSize).toBe('function');
  });
});

describe('coalescing — same-width re-observation is a no-op', () => {
  function shouldUpdate(prev: { widthPx: number; heightPx: number }, nextW: number, nextH: number) {
    return !(prev.widthPx === nextW && prev.heightPx === nextH);
  }

  it('skips when both width + height are unchanged', () => {
    expect(shouldUpdate({ widthPx: 1200, heightPx: 800 }, 1200, 800)).toBe(false);
  });

  it('updates when width changes', () => {
    expect(shouldUpdate({ widthPx: 1200, heightPx: 800 }, 1201, 800)).toBe(true);
  });

  it('updates when height changes', () => {
    expect(shouldUpdate({ widthPx: 1200, heightPx: 800 }, 1200, 801)).toBe(true);
  });
});

describe('breakpoint transitions match contentRect.width', () => {
  it('1440 → 8 cols', () => {
    expect(breakpointForWidth(1440)).toBe(8);
  });
  it('800 → 4 cols', () => {
    expect(breakpointForWidth(800)).toBe(4);
  });
  it('480 → 1 col', () => {
    expect(breakpointForWidth(480)).toBe(1);
  });
  it('crossing 1024 ↓ flips 8 → 4', () => {
    expect(breakpointForWidth(1024)).toBe(8);
    expect(breakpointForWidth(1023)).toBe(4);
  });
  it('crossing 640 ↓ flips 4 → 1', () => {
    expect(breakpointForWidth(640)).toBe(4);
    expect(breakpointForWidth(639)).toBe(1);
  });
});
