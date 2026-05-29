// __tests__/hub/size-grid-picker.test.tsx
//
// Slice 102 — SizeGridPicker render coverage. Focuses on the static
// (server-rendered) shape: cell count, aria labels for every cell,
// out-of-range disabling, filled / unfilled visuals at the seed
// value. Pointer + keyboard navigation lives in Playwright.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import SizeGridPicker from '@/lib/hub/components/settings/SizeGridPicker';

function render(props: React.ComponentProps<typeof SizeGridPicker>) {
  return ReactDOMServer.renderToStaticMarkup(<SizeGridPicker {...props} />);
}

describe('SizeGridPicker — render', () => {
  it('renders a 12×4 button grid (48 cells) by default', () => {
    const html = render({
      value: { w: 6, h: 2 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 12, h: 4 },
      onChange: () => {},
    });
    const matches = html.match(/role="gridcell"/g);
    expect(matches?.length).toBe(48);
  });

  it('renders the dimensions label for the current value', () => {
    const html = render({
      value: { w: 6, h: 2 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 12, h: 4 },
      onChange: () => {},
    });
    expect(html).toContain('6 × 2');
  });

  it('marks the current value cell as aria-selected', () => {
    const html = render({
      value: { w: 4, h: 2 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 12, h: 4 },
      onChange: () => {},
    });
    // exactly one aria-selected="true"
    const selected = html.match(/aria-selected="true"/g);
    expect(selected?.length).toBe(1);
    // Its aria-label matches "4 by 2"
    expect(html).toContain('aria-label="4 by 2"');
  });

  it('disables cells outside min/max envelope', () => {
    const html = render({
      value: { w: 3, h: 1 },
      minSize: { w: 3, h: 1 },
      maxSize: { w: 6, h: 2 },
      onChange: () => {},
    });
    // 12×4 = 48 cells; in-range = 6×2 = 12 cells; out-of-range = 36
    const disabled = html.match(/disabled/g);
    expect(disabled?.length).toBeGreaterThanOrEqual(36);
  });

  it('labels every cell with its w by h coordinates', () => {
    const html = render({
      value: { w: 1, h: 1 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 12, h: 4 },
      onChange: () => {},
    });
    expect(html).toContain('aria-label="1 by 1"');
    expect(html).toContain('aria-label="12 by 4"');
    expect(html).toContain('aria-label="6 by 2"');
  });

  it('the grid wrapper is keyboard focusable + announces current size', () => {
    const html = render({
      value: { w: 6, h: 2 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 12, h: 4 },
      onChange: () => {},
    });
    expect(html).toContain('role="grid"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Resize widget. Current size 6 by 2.');
  });
});
