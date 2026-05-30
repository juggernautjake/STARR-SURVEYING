// __tests__/hub/widget-grid-mobile-rows.test.ts
//
// hub-mobile-build-out Slice 1 — locks the mobile row-height fix.
// Pre-Slice-1: every saved h on mobile rendered as `cellW = viewport`,
// so a 1×1 widget was ~375 px tall on a phone and a 1×4 widget was
// ~1500 px tall. Post-Slice-1: the 1-col layout uses
// `minmax(MOBILE_BASE_ROW_PX, max-content)`, so an h-unit is one
// comfortable mobile row and content drives extra height.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MOBILE_BASE_ROW_PX } from '@/lib/hub/grid-math';

const GRID = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetGrid.tsx'),
  'utf8',
);

describe('MOBILE_BASE_ROW_PX', () => {
  it('is a sensible single-row height (≥64, ≤128)', () => {
    expect(MOBILE_BASE_ROW_PX).toBeGreaterThanOrEqual(64);
    expect(MOBILE_BASE_ROW_PX).toBeLessThanOrEqual(128);
  });
});

describe('WidgetGrid — mobile row track', () => {
  it('picks the minmax(BASE, max-content) track at breakpoint=1', () => {
    expect(GRID).toMatch(/breakpoint === 1\s*\n?[^\n]*minmax\(\$\{MOBILE_BASE_ROW_PX\}px, max-content\)/);
  });

  it('still uses the square cell height on desktop/tablet', () => {
    expect(GRID).toMatch(/\$\{effectiveRowHeight\}px/);
  });

  it('imports MOBILE_BASE_ROW_PX from grid-math', () => {
    expect(GRID).toMatch(/MOBILE_BASE_ROW_PX/);
    expect(GRID).toMatch(/from '@\/lib\/hub\/grid-math'/);
  });
});
