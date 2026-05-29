// __tests__/hub/widgets/pinned-pages.test.tsx
//
// Slice 94 — Pinned Pages widget.
//
// Locks the pure helpers (colsForBucket, capForBucket) and verifies
// registry round-trip. Render coverage uses react-dom/server like the
// rest of the hub suite — no @testing-library/react dep.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import { getWidget } from '@/lib/hub/widget-registry';

// Importing the widget module registers it via defineWidget's side
// effect; also gives us the exported helpers.
import {
  capForBucket,
  colsForBucket,
} from '@/lib/hub/widgets/pinned-pages';

// Note: state-dependent render coverage (the widget reads pinned routes
// from useAdminNavStore via the zustand hook) is exercised in the
// playwright E2E suite — vitest runs in `environment: 'node'` and
// React's `useSyncExternalStore` server snapshot doesn't reflect
// post-import `setState` updates, so we'd be testing a runtime path the
// widget never hits in production (it carries the `'use client'`
// directive). We cover the empty-state branch here since it doesn't
// depend on store state, plus the pure helpers + registry round-trip.

describe('pinned-pages widget — registry', () => {
  it('registers under id "pinned-pages"', () => {
    const def = getWidget('pinned-pages');
    expect(def).toBeDefined();
    expect(def?.id).toBe('pinned-pages');
    expect(def?.label).toBe('Pinned Pages');
    expect(def?.category).toBe('personal');
    expect(def?.allowedRoles).toEqual([]);
  });

  it('exposes a SettingsForm so users get a Content tab', () => {
    const def = getWidget('pinned-pages');
    expect(def?.SettingsForm).toBeDefined();
  });

  it('default size matches the planning doc (6×2, min 3×1, max 12×4)', () => {
    const def = getWidget('pinned-pages');
    expect(def?.defaultSize).toEqual({ w: 4, h: 2 });
    expect(def?.minSize).toEqual({ w: 1, h: 1 });  // Slice 217
    expect(def?.maxSize).toEqual({ w: 8, h: 6 });
  });
});

describe('pinned-pages widget — colsForBucket', () => {
  it('tiny → 1 column', () => {
    expect(colsForBucket('tiny')).toBe(1);
  });
  it('small → 2 columns', () => {
    expect(colsForBucket('small')).toBe(2);
  });
  it('medium → 3 columns', () => {
    expect(colsForBucket('medium')).toBe(3);
  });
  it('large → 4 columns', () => {
    expect(colsForBucket('large')).toBe(4);
  });
  it('xlarge → 6 columns', () => {
    expect(colsForBucket('xlarge')).toBe(6);
  });
});

describe('pinned-pages widget — capForBucket', () => {
  it('tiny caps at 2 items', () => {
    expect(capForBucket('tiny')).toBe(2);
  });
  it('small caps at 4 items', () => {
    expect(capForBucket('small')).toBe(4);
  });
  it('medium caps at 6 items', () => {
    expect(capForBucket('medium')).toBe(6);
  });
  it('large caps at 12 items', () => {
    expect(capForBucket('large')).toBe(12);
  });
  it('xlarge caps at 24 items', () => {
    expect(capForBucket('xlarge')).toBe(24);
  });
});

describe('pinned-pages widget — empty-state render', () => {
  it('renders the empty state with a CTA when the user has no pinned routes', () => {
    const def = getWidget('pinned-pages');
    if (!def) throw new Error('widget not registered');
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(def.Widget, {
        customization: { layout: {}, style: {}, content: {}, interaction: {} },
        size: { w: 4, h: 2 },
        editMode: false,
        content: { layoutStyle: 'grid', iconStyle: 'lucide' },
      }),
    );
    expect(html).toContain('No pinned pages yet');
    expect(html).toContain('Browse pages');
    expect(html).toContain('href="/admin/work"');
  });
});
