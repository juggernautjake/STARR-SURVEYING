// __tests__/hub/hub-providers.test.tsx
//
// Slice 186 — HubProviders + theme/density wiring. SSR-only specs;
// state-dependent rerender behaviour lives in the Slice 192
// Playwright spec for the same zustand server-snapshot reasons
// documented on Slices 94 + 185.

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import HubProviders from '@/lib/hub/components/HubProviders';
import { useHubStore } from '@/lib/hub/hub-store';
import type { CustomThemePayload } from '@/lib/hub/types';

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

const SAMPLE_CUSTOM: CustomThemePayload = {
  name: 'Test custom',
  bgPage: '#101820',
  bgSurface: '#1B2530',
  fgPrimary: '#F2F4F7',
  accent: '#FFB000',
  derived: {
    bgElevated:   '#22303C',
    fgSecondary:  '#C2C8D0',
    fgMuted:      '#7A828C',
    accentFg:     '#101820',
    border:       '#2C3845',
    borderStrong: '#475569',
    success:      '#10B981',
    warning:      '#F59E0B',
    danger:       '#EF4444',
    info:         '#3B82F6',
  },
  contrastAudit: {
    primaryOnSurface:   { ratio: 14.2, passes: 'AAA' },
    primaryOnPage:      { ratio: 15.1, passes: 'AAA' },
    secondaryOnSurface: { ratio: 7.5,  passes: 'AAA' },
    accentFgOnAccent:   { ratio: 11.4, passes: 'AAA' },
    accentOnSurface:    { ratio: 5.2,  passes: 'AA'  },
  },
};

describe('HubProviders — defaults', () => {
  beforeEach(reset);

  it('falls back to starr-default theme + comfortable density + 1.0 font-scale', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubProviders>
        <span>child</span>
      </HubProviders>,
    );
    expect(html).toContain('data-theme="starr-default"');
    expect(html).toContain('data-density="comfortable"');
    expect(html).toContain('--hub-font-scale:1');
    expect(html).toContain('child');
  });

  it('emits a hub-providers wrapper class on the density div', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubProviders><span>x</span></HubProviders>,
    );
    expect(html).toContain('class="hub-providers"');
  });
});

describe('HubProviders — initial props (first-paint, pre-hydrate)', () => {
  beforeEach(reset);

  it('respects initialTheme for the data-theme attribute', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubProviders initialTheme="starr-dark"><span>x</span></HubProviders>,
    );
    expect(html).toContain('data-theme="starr-dark"');
  });

  it('respects initialDensity + initialFontScale for the density layer', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubProviders initialDensity="compact" initialFontScale={1.25}>
        <span>x</span>
      </HubProviders>,
    );
    expect(html).toContain('data-density="compact"');
    expect(html).toContain('--hub-font-scale:1.25');
  });

  it('inlines the 14 custom-theme vars when theme=custom + customTheme present', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubProviders initialTheme="custom" initialCustomTheme={SAMPLE_CUSTOM}>
        <span>x</span>
      </HubProviders>,
    );
    expect(html).toContain('data-theme="custom"');
    // The 4 anchor + 10 derived values should all appear in the
    // inline style.
    expect(html).toContain(SAMPLE_CUSTOM.bgPage);
    expect(html).toContain(SAMPLE_CUSTOM.bgSurface);
    expect(html).toContain(SAMPLE_CUSTOM.fgPrimary);
    expect(html).toContain(SAMPLE_CUSTOM.accent);
    expect(html).toContain(SAMPLE_CUSTOM.derived.bgElevated);
    expect(html).toContain(SAMPLE_CUSTOM.derived.accentFg);
    expect(html).toContain(SAMPLE_CUSTOM.derived.success);
    expect(html).toContain(SAMPLE_CUSTOM.derived.danger);
  });

  it('renders custom theme even when no palette is provided (falls back gracefully)', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubProviders initialTheme="custom"><span>x</span></HubProviders>,
    );
    expect(html).toContain('data-theme="custom"');
    // No inline overrides — child should still render.
    expect(html).toContain('<span>x</span>');
  });
});

describe('HubProviders — registry side effect', () => {
  beforeEach(reset);

  it('built-in theme palette resolves on first paint (registry already populated)', () => {
    // Just renders without crashing. The registry has 10 entries via
    // register-builtins; the FALLBACK_PALETTE picks up anything else.
    const html = ReactDOMServer.renderToStaticMarkup(
      <HubProviders initialTheme="ocean"><span>x</span></HubProviders>,
    );
    expect(html).toContain('data-theme="ocean"');
  });
});
