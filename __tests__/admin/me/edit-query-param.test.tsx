// __tests__/admin/me/edit-query-param.test.tsx
//
// Slice 197 — when /admin/me is visited with `?edit=1`, HubMeClient
// auto-triggers edit mode + drops the param so a refresh doesn't
// re-fire. Mirrors the SSR-shape pattern used by the Slice 187
// HubMeClient first-paint specs.

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import HubMeClient from '@/app/admin/me/HubMeClient';
import { useHubStore } from '@/lib/hub/hub-store';
import { LAYOUT_VERSION, type HubLayoutRow } from '@/lib/hub/types';

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

describe('HubMeClient — SSR shape stays clean with the edit-query effect', () => {
  beforeEach(reset);

  it('renders the canvas without crashing when no edit param is present', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubMeClient layout={seedLayout()} roles={['field_crew']} />,
    );
    expect(html).toContain('Your hub');
  });

  it('renders the canvas without crashing even when window is absent (SSR)', () => {
    // The Slice 197 effect early-returns when `window` is undefined,
    // so SSR shouldn't be affected.
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubMeClient layout={seedLayout()} roles={['admin']} />,
    );
    expect(html).toContain('class="hub-canvas"');
  });

  it('threads isSeeded through to the canvas (welcome tip wiring)', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubMeClient layout={seedLayout()} roles={['admin']} isSeeded={true} />,
    );
    // WelcomeTip renders nothing at SSR (dismissed defaults to true);
    // the test confirms HubMeClient just doesn't blow up with the
    // isSeeded prop present.
    expect(html).toContain('Your hub');
  });
});
