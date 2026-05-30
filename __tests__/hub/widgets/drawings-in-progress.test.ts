// __tests__/hub/widgets/drawings-in-progress.test.ts
//
// hub-widget-excellence-12 — drawings-in-progress R1: cad_drawings has
// no progress/status/assignee columns, so the phantom percent_complete
// bar is gone and the widget reuses the tested cadOpenHref to open each
// drawing's job in CAD.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/drawings-in-progress'; // self-registers

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib', 'hub', 'widgets', 'drawings-in-progress', 'index.tsx'),
  'utf8',
);

describe('drawings-in-progress', () => {
  it('registers in the cad category', () => {
    expect(getWidget('drawings-in-progress')?.category).toBe('cad');
  });

  it('opens rows in CAD via the shared cadOpenHref helper', () => {
    expect(SRC).toMatch(/import \{ cadOpenHref, formatAge \} from '@\/lib\/hub\/widgets\/recent-drawings'/);
    expect(SRC).toMatch(/<Link href=\{cadOpenHref\(d\)\}/);
  });

  it('drops the phantom percent_complete progress bar (no backing column)', () => {
    // No code reads d.percent_complete anymore (comments may mention it).
    expect(SRC).not.toMatch(/d\.percent_complete/);
  });

  it('no longer sends the ignored ?status=in-progress param', () => {
    expect(SRC).not.toMatch(/URLSearchParams\(\{\s*status:/);
    expect(SRC).not.toMatch(/\.set\('status'/);
  });
});
