// __tests__/admin/me/hub-me-client.test.tsx
//
// Slice 187 — HubMeClient cutover. SSR-only specs verifying the
// initial-prop pipeline (theme/density/font-scale) flows through to
// HubProviders + HubCanvas as the user's saved layout would appear on
// first paint, before the store hydrate effect fires.
//
// Integration behaviour (store hydrate, picker re-renders, edit-mode
// switches) is exercised by the Slice 192 Playwright spec.

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import HubMeClient from '@/app/admin/me/HubMeClient';
import { useHubStore } from '@/lib/hub/hub-store';
import type { HubLayoutRow } from '@/lib/hub/types';
import { LAYOUT_VERSION } from '@/lib/hub/types';

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

function seedLayout(overrides: Partial<HubLayoutRow> = {}): HubLayoutRow {
  return {
    userEmail: 'test@example.com',
    layoutVersion: LAYOUT_VERSION,
    widgets: [],
    activePersona: null,
    theme: 'starr-default',
    customTheme: null,
    density: 'comfortable',
    fontScale: 1.0,
    hubSettings: {},
    updatedAt: '2026-05-29T00:00:00Z',
    ...overrides,
  };
}

describe('HubMeClient — first-paint pipeline', () => {
  beforeEach(reset);

  it('threads the layout theme into HubProviders data-theme', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubMeClient layout={seedLayout({ theme: 'starr-dark' })} roles={['field_crew']} />,
    );
    expect(html).toContain('data-theme="starr-dark"');
  });

  it('threads density + fontScale into the HubProviders root', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubMeClient
        layout={seedLayout({ density: 'compact', fontScale: 1.25 })}
        roles={['field_crew']}
      />,
    );
    expect(html).toContain('data-density="compact"');
    expect(html).toContain('--hub-font-scale:1.25');
  });

  it('renders the HubCanvas inside the providers', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubMeClient layout={seedLayout()} roles={['field_crew']} />,
    );
    expect(html).toContain('Your hub');
    expect(html).toContain('class="hub-canvas"');
  });

  it('forwards activeBundles to the canvas (smoke)', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubMeClient
        layout={seedLayout()}
        roles={['admin']}
        activeBundles={['field', 'office']}
      />,
    );
    expect(html).toContain('Your hub');
  });

  it('inlines the 14 custom palette vars when theme=custom', () => {
    const customLayout = seedLayout({
      theme: 'custom',
      customTheme: {
        name: 'Test custom',
        bgPage: '#101820',
        bgSurface: '#1B2530',
        fgPrimary: '#F2F4F7',
        accent: '#FFB000',
        derived: {
          bgElevated: '#22303C', fgSecondary: '#C2C8D0', fgMuted: '#7A828C',
          accentFg: '#101820', border: '#2C3845', borderStrong: '#475569',
          success: '#10B981', warning: '#F59E0B', danger: '#EF4444', info: '#3B82F6',
        },
        contrastAudit: {
          primaryOnSurface:   { ratio: 14.2, passes: 'AAA' },
          primaryOnPage:      { ratio: 15.1, passes: 'AAA' },
          secondaryOnSurface: { ratio: 7.5,  passes: 'AAA' },
          accentFgOnAccent:   { ratio: 11.4, passes: 'AAA' },
          accentOnSurface:    { ratio: 5.2,  passes: 'AA'  },
        },
      },
    });
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubMeClient layout={customLayout} roles={['field_crew']} />,
    );
    expect(html).toContain('data-theme="custom"');
    expect(html).toContain('#FFB000'); // accent
    expect(html).toContain('#101820'); // bg + accent-fg
  });
});
