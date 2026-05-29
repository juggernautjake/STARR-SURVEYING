// __tests__/hub/add-widget-lazy.test.tsx
//
// Slice 201 of hub-editor-performance-and-ux-2026-05-29.md. Locks
// the lazy-mount contract for AddWidgetModal: when `open=false` the
// component renders nothing AND skips the catalog walk
// (`allWidgets() → filterCatalog() → groupByCategory()`). The cost
// of keeping the modal in the canvas tree must be ~0 when closed.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

// Spy on `allWidgets` BEFORE importing AddWidgetModal so the import
// graph picks up the spied module. The spy is restored between tests.
vi.mock('@/lib/hub/widget-registry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hub/widget-registry')>(
    '@/lib/hub/widget-registry',
  );
  return {
    ...actual,
    allWidgets: vi.fn(() => actual.allWidgets()),
  };
});

import AddWidgetModal from '@/lib/hub/components/AddWidgetModal';
import * as widgetRegistry from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/register-all';

const allWidgetsSpy = widgetRegistry.allWidgets as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  allWidgetsSpy.mockClear();
});

function render(props: React.ComponentProps<typeof AddWidgetModal>) {
  return ReactDOMServer.renderToStaticMarkup(<AddWidgetModal {...props} />);
}

describe('AddWidgetModal — lazy mount (open=false)', () => {
  it('renders nothing when closed', () => {
    const html = render({
      open: false,
      onClose: () => {},
      roles: [],
      activeBundles: null,
    });
    expect(html).toBe('');
  });

  it('does NOT call allWidgets when closed', () => {
    render({
      open: false,
      onClose: () => {},
      roles: [],
      activeBundles: null,
    });
    expect(allWidgetsSpy).not.toHaveBeenCalled();
  });

  it('three back-to-back closed renders still call allWidgets zero times', () => {
    for (let i = 0; i < 3; i++) {
      render({
        open: false,
        onClose: () => {},
        roles: [],
        activeBundles: null,
      });
    }
    expect(allWidgetsSpy).toHaveBeenCalledTimes(0);
  });
});

describe('AddWidgetModal — mounted body (open=true)', () => {
  it('renders the dialog wrapper when open', () => {
    const html = render({
      open: true,
      onClose: () => {},
      roles: [],
      activeBundles: null,
    });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Add widget"');
  });

  it('calls allWidgets exactly once per render when open', () => {
    render({
      open: true,
      onClose: () => {},
      roles: [],
      activeBundles: null,
    });
    expect(allWidgetsSpy).toHaveBeenCalledTimes(1);
  });
});
