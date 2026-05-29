// __tests__/hub/widget-resize-handle.test.tsx
//
// Slice 220 of hub-greeting-edit-affordances-2026-05-29.md. Locks the
// bigger resize grip + always-visible size badge surface.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import WidgetResizeHandle from '@/lib/hub/components/WidgetResizeHandle';
import type { CellDimensions, GridSize } from '@/lib/hub/grid-resize';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetResizeHandle.tsx'),
  'utf8',
);

const CELL: CellDimensions = { cellW: 120, cellH: 120, gap: 16 };

function render(props: Partial<React.ComponentProps<typeof WidgetResizeHandle>> = {}) {
  return ReactDOMServer.renderToStaticMarkup(
    <WidgetResizeHandle
      currentSize={{ w: 4, h: 3 } as GridSize}
      minSize={{ w: 1, h: 1 }}
      maxSize={{ w: 8, h: 8 }}
      cell={CELL}
      onCommit={() => {}}
      {...props}
    />,
  );
}

describe('Slice 220 — grip is bigger + accent-colored', () => {
  it('handle source carries width: 28 + height: 28', () => {
    expect(SRC).toMatch(/width:\s*28,[\s\S]*?height:\s*28,/);
  });

  it('handle source uses the accent background', () => {
    expect(SRC).toMatch(/background:\s*['"]var\(--theme-accent[^"]*\)/);
    expect(SRC).toMatch(/color:\s*['"]var\(--theme-accent-fg/);
  });

  it('handle keeps the nwse-resize cursor', () => {
    expect(SRC).toMatch(/cursor:\s*['"]nwse-resize['"]/);
  });

  it('handle carries the ⤡ glyph', () => {
    expect(SRC).toMatch(/⤡/);
  });

  it('handle stacks above the cell body via zIndex: 2', () => {
    const handleBlock = SRC.match(/const handleStyle:[\s\S]*?\n\};/);
    expect(handleBlock).not.toBeNull();
    expect(handleBlock![0]).toMatch(/zIndex:\s*2/);
  });
});

describe('Slice 220 — always-on size badge', () => {
  it('rendered output shows the current size badge even when not dragging', () => {
    const html = render({ currentSize: { w: 6, h: 4 } });
    expect(html).toContain('data-testid="widget-resize-badge"');
    expect(html).toContain('6 × 4');
  });

  it('badge sits in the top-left corner (top: 6, left: 6)', () => {
    const badgeBlock = SRC.match(/const badgeStyle:[\s\S]*?\n\};/);
    expect(badgeBlock).not.toBeNull();
    expect(badgeBlock![0]).toMatch(/top:\s*6/);
    expect(badgeBlock![0]).toMatch(/left:\s*6/);
  });

  it('badge uses a pill border-radius (999)', () => {
    const badgeBlock = SRC.match(/const badgeStyle:[\s\S]*?\n\};/);
    expect(badgeBlock![0]).toMatch(/borderRadius:\s*999/);
  });

  it('badge uses a monospace font so digits do not jitter mid-drag', () => {
    const badgeBlock = SRC.match(/const badgeStyle:[\s\S]*?\n\};/);
    expect(badgeBlock![0]).toMatch(/ui-monospace/);
  });

  it('badge has pointer-events: none so it never intercepts the resize drag', () => {
    const badgeBlock = SRC.match(/const badgeStyle:[\s\S]*?\n\};/);
    expect(badgeBlock![0]).toMatch(/pointerEvents:\s*['"]none['"]/);
  });

  it('badge swaps to accent during an active drag for "you are at" signaling', () => {
    expect(SRC).toMatch(/badgeActiveStyle/);
    const activeBlock = SRC.match(/const badgeActiveStyle:[\s\S]*?\n\};/);
    expect(activeBlock).not.toBeNull();
    expect(activeBlock![0]).toMatch(/background:\s*['"]var\(--theme-accent/);
  });

  it('aria-live flips between "off" (idle) and "polite" (resizing) so SR users do not hear every size on mount', () => {
    // Source-level invariant — verifies the JSX ternary stays wired.
    expect(SRC).toMatch(/aria-live=\{active \? 'polite' : 'off'\}/);
  });
});

describe('Slice 220 — handle keeps its accessible name', () => {
  it('renders aria-label with the current widget size', () => {
    const html = render({ currentSize: { w: 5, h: 2 } });
    expect(html).toMatch(/aria-label="Resize widget\. Current size 5 by 2\."/);
  });

  it('title attribute surfaces the current size for hover discoverability', () => {
    const html = render({ currentSize: { w: 3, h: 3 } });
    expect(html).toMatch(/title="Drag to resize · 3×3"/);
  });
});
