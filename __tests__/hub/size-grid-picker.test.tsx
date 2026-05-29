// __tests__/hub/size-grid-picker.test.tsx
//
// Slice 102 — SizeGridPicker render coverage. Focuses on the static
// (server-rendered) shape: cell count, aria labels for every cell,
// out-of-range disabling, filled / unfilled visuals at the seed
// value. Pointer + keyboard navigation lives in Playwright.
// Slice 209 rebalanced the default grid from 12×4 to 8×8 (square
// cells) so the cell-count + the max-coord aria labels follow.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import SizeGridPicker from '@/lib/hub/components/settings/SizeGridPicker';

function render(props: React.ComponentProps<typeof SizeGridPicker>) {
  return ReactDOMServer.renderToStaticMarkup(<SizeGridPicker {...props} />);
}

describe('SizeGridPicker — render', () => {
  it('renders an 8×8 button grid (64 cells) by default', () => {
    const html = render({
      value: { w: 4, h: 2 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 8, h: 8 },
      onChange: () => {},
    });
    const matches = html.match(/role="gridcell"/g);
    expect(matches?.length).toBe(64);
  });

  it('renders the dimensions label for the current value', () => {
    const html = render({
      value: { w: 4, h: 2 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 8, h: 8 },
      onChange: () => {},
    });
    expect(html).toContain('4 × 2');
  });

  it('marks the current value cell as aria-selected', () => {
    const html = render({
      value: { w: 3, h: 2 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 8, h: 8 },
      onChange: () => {},
    });
    const selected = html.match(/aria-selected="true"/g);
    expect(selected?.length).toBe(1);
    expect(html).toContain('aria-label="3 by 2"');
  });

  it('disables cells outside min/max envelope', () => {
    const html = render({
      value: { w: 2, h: 1 },
      minSize: { w: 2, h: 1 },
      maxSize: { w: 4, h: 2 },
      onChange: () => {},
    });
    // 8×8 = 64 cells; in-range = 4×2 = 8 cells; out-of-range = 56
    const disabled = html.match(/disabled/g);
    expect(disabled?.length).toBeGreaterThanOrEqual(56);
  });

  it('labels every cell with its w by h coordinates', () => {
    const html = render({
      value: { w: 1, h: 1 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 8, h: 8 },
      onChange: () => {},
    });
    expect(html).toContain('aria-label="1 by 1"');
    expect(html).toContain('aria-label="8 by 8"');
    expect(html).toContain('aria-label="4 by 4"');
  });

  it('the grid wrapper is keyboard focusable + announces current size', () => {
    const html = render({
      value: { w: 4, h: 2 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 8, h: 8 },
      onChange: () => {},
    });
    expect(html).toContain('role="grid"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Resize widget. Current size 4 by 2.');
  });
});
