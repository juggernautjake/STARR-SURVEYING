// __tests__/hub/hub-canvas.test.tsx
//
// Slice 185 — HubCanvas orchestrator. Covers the static (SSR) shape of
// the canvas. Interactive + state-dependent branches (edit-mode UI,
// data-widget-id round-trip, settings open/close, AddWidgetModal
// open/close) live in the Slice 192 Playwright spec —
// `useSyncExternalStore`'s server snapshot doesn't reflect post-import
// zustand `setState` updates inside vitest's `environment: 'node'`,
// matching the limitation documented on the Slice 94 widget tests.

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import HubCanvas from '@/lib/hub/components/HubCanvas';
import { useHubStore } from '@/lib/hub/hub-store';

// Pull a real widget in so the registry has something resolvable.
import '@/lib/hub/widgets/pinned-pages';

function reset() {
  useHubStore.setState({
    widgets: [],
    draftWidgets: null,
    isEditMode: false,
    isDirty: false,
    saveStatus: 'idle',
    saveError: null,
    theme: null,
    customTheme: null,
    density: null,
    fontScale: null,
    hubSettings: {},
    activePersona: null,
  });
}

function render(props: React.ComponentProps<typeof HubCanvas>) {
  return ReactDOMServer.renderToStaticMarkup(<HubCanvas {...props} />);
}

describe('HubCanvas — SSR shape (view mode, empty store)', () => {
  beforeEach(reset);

  it('renders the canvas wrapper + "Your hub" title', () => {
    const html = render({ roles: ['field_crew'] });
    expect(html).toContain('Your hub');
    expect(html).toContain('class="hub-canvas"');
  });

  it('shows the Customize Hub toggle when not editing', () => {
    const html = render({ roles: ['field_crew'] });
    expect(html).toContain('Customize Hub');
  });

  it('does NOT render the "+ Add widget" button outside edit mode', () => {
    const html = render({ roles: ['field_crew'] });
    expect(html).not.toContain('+ Add widget');
  });

  it('does NOT mount the AddWidgetModal or SettingsPanel by default', () => {
    const html = render({ roles: ['field_crew'] });
    expect(html).not.toContain('Add a widget');
    expect(html).not.toContain('— settings');
  });

  it('does NOT mount the EditModeBar when not editing', () => {
    const html = render({ roles: ['field_crew'] });
    expect(html).not.toContain('Save layout');
  });

  it('accepts an activeBundles list (signature smoke)', () => {
    // Bundle-gated filtering is exercised in widget-catalog-filter.test.ts;
    // this just verifies the prop compiles + renders without throwing.
    const html = render({ roles: ['admin'], activeBundles: ['field'] });
    expect(html).toContain('Your hub');
  });
});
