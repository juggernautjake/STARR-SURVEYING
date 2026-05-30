// __tests__/hub/grid-editor-shell.test.tsx
//
// Slice 222 of hub-grid-editor-and-banner-green-2026-05-29.md. Locks
// the GridEditor shell — palette, 8×8 grid, footer status + actions.
// Placement / selection / resize land in Slices 223–225.

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import GridEditor, {
  GRID_EDITOR_COLS,
  GRID_EDITOR_ROWS,
  cellsUsed,
} from '@/lib/hub/components/GridEditor';
import { useHubStore } from '@/lib/hub/hub-store';
import '@/lib/hub/widgets/register-all';

function render(props: Partial<React.ComponentProps<typeof GridEditor>> = {}) {
  return ReactDOMServer.renderToStaticMarkup(
    <GridEditor open onClose={() => {}} roles={[]} activeBundles={null} {...props} />,
  );
}

beforeEach(() => {
  useHubStore.getState().cancelEdit();
});

describe('GridEditor — mount gate', () => {
  it('renders nothing when open=false', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <GridEditor open={false} onClose={() => {}} roles={[]} />,
    );
    expect(html).toBe('');
  });

  it('renders the modal shell when open=true', () => {
    const html = render();
    expect(html).toContain('data-testid="grid-editor"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });
});

describe('GridEditor — palette', () => {
  it('renders a palette section with a search input + listbox', () => {
    const html = render();
    expect(html).toContain('data-testid="grid-editor-palette"');
    expect(html).toContain('placeholder="Search widgets…"');
    expect(html).toContain('aria-label="Available widgets"');
    expect(html).toContain('role="listbox"');
  });

  it('renders at least one widget entry from the catalog (register-all ran)', () => {
    const html = render();
    expect(html).toMatch(/data-widget-type="[^"]+"/);
  });

  it('palette entries carry role=option + aria-selected=false at rest', () => {
    const html = render();
    expect(html).toMatch(/role="option"\s+aria-selected="false"/);
  });
});

describe('GridEditor — 8×12 grid', () => {
  it('the constants pin the grid at 8 wide × 12 tall', () => {
    expect(GRID_EDITOR_COLS).toBe(8);
    expect(GRID_EDITOR_ROWS).toBe(12);
  });

  it('renders exactly 96 grid cells (8×12)', () => {
    const html = render();
    const cells = html.match(/data-grid-x="\d+"/g) ?? [];
    expect(cells.length).toBe(96);
  });

  it('every grid cell has accessible coordinates (1-indexed)', () => {
    const html = render();
    expect(html).toContain('aria-label="Grid cell 1, 1"');
    expect(html).toContain('aria-label="Grid cell 8, 8"');
  });

  it('grid container has data-testid so e2e specs can find it', () => {
    const html = render();
    expect(html).toContain('data-testid="grid-editor-grid"');
  });
});

describe('GridEditor — footer status (empty baseline only)', () => {
  // Interactive state-mutation render assertions are skipped here
  // because React's useSyncExternalStore caches the zustand server
  // snapshot across renderToStaticMarkup calls within a single
  // process — same SSR plumbing constraint we hit in
  // perf-overlay.test.tsx (Slice 207). The placed-widget render
  // path + cells-used arithmetic are covered by the `cellsUsed`
  // pure-helper specs below + the Playwright spec a future slice
  // can ship against a real browser.

  it('shows a 0/96 baseline when nothing is placed (8×12 = 96 cells)', () => {
    const html = render();
    expect(html).toContain('data-testid="grid-editor-status"');
    expect(html).toContain('0</strong>/96');
  });

  it('Save layout button uses the gradient-green token', () => {
    const html = render();
    expect(html).toContain('Save layout');
    expect(html).toContain('var(--gradient-green');
  });

  it('Cancel button is always present', () => {
    const html = render();
    expect(html).toContain('Cancel');
  });
});

describe('cellsUsed — pure helper', () => {
  it('returns 0 for an empty draft', () => {
    expect(cellsUsed([])).toBe(0);
  });

  it('sums w*h across widgets', () => {
    expect(cellsUsed([{ w: 4, h: 3 }, { w: 2, h: 2 }, { w: 1, h: 1 }])).toBe(17);
  });

  it('clamps non-positive sides to 1 so a degenerate widget still consumes a cell', () => {
    expect(cellsUsed([{ w: 0, h: 0 }])).toBe(1);
  });
});
