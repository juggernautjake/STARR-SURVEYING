// __tests__/hub/grid-editor-lazy.test.tsx
//
// The lazy-mount contract, moved here from `add-widget-lazy.test.tsx` when `AddWidgetModal` was
// deleted. Slice 201 of hub-editor-performance-and-ux-2026-05-29.md originally locked it on the
// modal; the modal was retired by the hub overhaul and GridEditor is the live palette, so the
// contract belongs on the component that is actually in the canvas tree.
//
// ── WHY THIS SURVIVED THE DELETION ──────────────────────────────────────────────────────────────
//
// The component was dead; the guarantee was not. `GridEditor` sits in `HubCanvas` on every hub
// render, and walking the catalog — `allWidgets()` → `buildCategorySections()` → role and bundle
// gating over 54 widgets — while the editor is CLOSED is pure waste on a page people load all day.
// It lazy-mounts through a `GridEditorBody` that only exists when `open` is true, exactly as the
// modal did, and nothing enforced that until now: `grid-editor-shell.test.tsx` asserted the closed
// render is empty, which an eager component would also satisfy.
//
// Deleting the old test without porting this would have quietly dropped a performance guarantee on
// the busiest surface in the app.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

// Spy on `allWidgets` BEFORE importing GridEditor so the import graph picks up the spied module.
vi.mock('@/lib/hub/widget-registry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hub/widget-registry')>(
    '@/lib/hub/widget-registry',
  );
  return {
    ...actual,
    allWidgets: vi.fn(() => actual.allWidgets()),
  };
});

import GridEditor from '@/lib/hub/components/GridEditor';
import * as widgetRegistry from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/register-all';

const allWidgetsSpy = widgetRegistry.allWidgets as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  allWidgetsSpy.mockClear();
});

function render(open: boolean) {
  return ReactDOMServer.renderToStaticMarkup(
    <GridEditor open={open} onClose={() => {}} roles={[]} activeBundles={null} />,
  );
}

describe('GridEditor — lazy mount (open=false)', () => {
  it('renders nothing when closed', () => {
    expect(render(false)).toBe('');
  });

  it('does NOT walk the catalog when closed', () => {
    render(false);
    expect(allWidgetsSpy).not.toHaveBeenCalled();
  });

  it('three back-to-back closed renders still walk it zero times', () => {
    // The canvas re-renders constantly. If the cost were paid per render rather than per open, this
    // is where it would show up.
    for (let i = 0; i < 3; i++) render(false);
    expect(allWidgetsSpy).toHaveBeenCalledTimes(0);
  });
});

describe('GridEditor — mounted body (open=true)', () => {
  it('renders the dialog when open', () => {
    const html = render(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-testid="grid-editor-palette"');
  });

  it('walks the catalog exactly once per render when open', () => {
    render(true);
    expect(allWidgetsSpy).toHaveBeenCalledTimes(1);
  });
});
