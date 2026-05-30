// __tests__/hub/widget-grid-mobile-overflow.test.ts
//
// hub-mobile-build-out Slice 3 — locks the mobile in-card scroll. On
// desktop / tablet WidgetCell stays `overflow: hidden` (strict grid
// rectangles, never spill); on mobile it switches to `overflow: auto`
// so long widget content scrolls inside the card instead of clipping
// or pushing the card to extreme heights via max-content.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const GRID = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetGrid.tsx'),
  'utf8',
);

describe('WidgetGrid — WidgetCell overflow per breakpoint', () => {
  it("uses overflow: 'auto' on mobile + 'hidden' on desktop/tablet", () => {
    expect(GRID).toMatch(/overflow:\s*breakpoint === 1\s*\?\s*'auto'\s*:\s*'hidden'/);
  });
});
