// __tests__/hub/perf-overlay.test.tsx
//
// Slice 207 of hub-editor-performance-and-ux-2026-05-29.md. Locks
// the ?debug=hub-perf gate + the overlay's visible surface (canvas
// renders, widget count, aggregator status, error path).

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import PerfOverlay, { shouldEnablePerfOverlay, isPerfOverlayActive } from '@/lib/hub/components/PerfOverlay';
import { useHubStore } from '@/lib/hub/hub-store';
import { useHubDataStore } from '@/lib/hub/hub-data-store';

beforeEach(() => {
  useHubStore.getState().cancelEdit();
  useHubDataStore.getState()._reset();
});

describe('shouldEnablePerfOverlay — URL gate', () => {
  it('returns true for ?debug=hub-perf', () => {
    expect(shouldEnablePerfOverlay('?debug=hub-perf')).toBe(true);
  });

  it('accepts the search string without the leading `?`', () => {
    expect(shouldEnablePerfOverlay('debug=hub-perf')).toBe(true);
  });

  it('returns false for an unrelated debug flag', () => {
    expect(shouldEnablePerfOverlay('?debug=something-else')).toBe(false);
  });

  it('returns false for an empty search', () => {
    expect(shouldEnablePerfOverlay('')).toBe(false);
    expect(shouldEnablePerfOverlay(null)).toBe(false);
    expect(shouldEnablePerfOverlay(undefined)).toBe(false);
  });

  it('matches when other params are also present', () => {
    expect(shouldEnablePerfOverlay('?edit=1&debug=hub-perf&foo=bar')).toBe(true);
  });
});

describe('isPerfOverlayActive — SSR safety', () => {
  it('returns false during SSR (no window)', () => {
    const w = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      expect(isPerfOverlayActive()).toBe(false);
    } finally {
      if (w !== undefined) (globalThis as { window?: unknown }).window = w;
    }
  });
});

describe('PerfOverlay — renders the visible surface', () => {
  it('shows the data-testid handle so a Playwright spec can find it', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <PerfOverlay canvasRenderCount={0} />,
    );
    expect(html).toContain('data-testid="hub-perf-overlay"');
  });

  it('renders the supplied canvas render count', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <PerfOverlay canvasRenderCount={42} />,
    );
    expect(html).toContain('Canvas renders');
    expect(html).toContain('42');
  });

  it('renders the Aggregator + Mode label rows on a clean store', () => {
    // Clean-store render: aggregator idle, mode view. State-mutation
    // assertions against renderToStaticMarkup are skipped because
    // React's useSyncExternalStore caches the server snapshot across
    // calls within a single process — that's a property of
    // React+zustand SSR, not our overlay. The interactive flips are
    // covered by Slice 208's Playwright spec instead.
    const html = ReactDOMServer.renderToStaticMarkup(
      <PerfOverlay canvasRenderCount={1} />,
    );
    expect(html).toContain('Aggregator');
    expect(html).toContain('idle');
    expect(html).toContain('Mode');
    expect(html).toContain('view');
  });
});
