// __tests__/hub/widget-header-color.test.ts
//
// Slice 5 of employee-hub-overhaul-2026-05-30.md. Locks the
// schema-level addition of style.headerColor, the always-visible
// header in WidgetFrame, and the load-time normalizer that tolerates
// old saved layouts (drops showTitle=false, sanitizes unknown style
// values). Pure-unit + source-regex tests dodge the zustand/SSR
// snapshot-caching limitation.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  normalizeCustomization,
  normalizeWidgetInstance,
  normalizeWidgets,
} from '@/lib/hub/normalize-customization';

const TYPES_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'types.ts'),
  'utf8',
);

const FRAME_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetFrame.tsx'),
  'utf8',
);

const STORE_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'hub-store.ts'),
  'utf8',
);

describe('Slice 5 — WidgetCustomization.style.headerColor', () => {
  it('declares the optional headerColor field on style', () => {
    const styleBlock = TYPES_SRC.match(/style\?: \{[\s\S]*?\n  \};/);
    expect(styleBlock).not.toBeNull();
    expect(styleBlock![0]).toMatch(/headerColor\?:\s*string;/);
  });

  it('keeps the legacy style fields on the type for back-compat (old saved layouts still parse)', () => {
    const styleBlock = TYPES_SRC.match(/style\?: \{[\s\S]*?\n  \};/);
    expect(styleBlock![0]).toMatch(/colorMode\?:\s*WidgetColorMode/);
    expect(styleBlock![0]).toMatch(/customBg\?:\s*string/);
  });
});

describe('Slice 5 — WidgetFrame: header always renders + paints from headerColor', () => {
  it('drops the showTitle prop from WidgetFrameProps', () => {
    const propsMatch = FRAME_SRC.match(/export interface WidgetFrameProps \{[\s\S]*?\n\}/);
    expect(propsMatch).not.toBeNull();
    expect(propsMatch![0]).not.toMatch(/showTitle/);
  });

  it('declares the new headerColor prop on WidgetFrameProps', () => {
    expect(FRAME_SRC).toMatch(/headerColor\?:\s*string;/);
  });

  it('no longer gates the <header> on showTitle && (…)', () => {
    expect(FRAME_SRC).not.toMatch(/\{showTitle && \(/);
  });

  it('paints the header background from headerColor when set', () => {
    expect(FRAME_SRC).toMatch(/background:\s*headerColor \?\? 'transparent'/);
  });
});

describe('Slice 5 — normalizeCustomization', () => {
  it('returns undefined for non-objects (null / undefined / arrays / scalars)', () => {
    expect(normalizeCustomization(null)).toBeUndefined();
    expect(normalizeCustomization(undefined)).toBeUndefined();
    expect(normalizeCustomization(42)).toBeUndefined();
    expect(normalizeCustomization('nope')).toBeUndefined();
  });

  it('preserves new + legacy fields when valid', () => {
    const out = normalizeCustomization({
      style: { headerColor: '#abcdef', colorMode: 'accent', customBg: '#ffffff' },
      layout: { titleOverride: 'My header', density: 'compact' },
    });
    expect(out?.style?.headerColor).toBe('#abcdef');
    expect(out?.style?.colorMode).toBe('accent');
    expect(out?.style?.customBg).toBe('#ffffff');
    expect(out?.layout?.titleOverride).toBe('My header');
    expect(out?.layout?.density).toBe('compact');
  });

  it('drops showTitle from layout (header is always visible post-Slice-5)', () => {
    const out = normalizeCustomization({
      layout: { showTitle: false, titleOverride: 'still here' },
    });
    expect(out?.layout).not.toHaveProperty('showTitle');
    expect(out?.layout?.titleOverride).toBe('still here');
  });

  it('drops out-of-enum style values silently', () => {
    const out = normalizeCustomization({
      style: { colorMode: 'NOPE', borderRadius: 'circle', shadowDepth: 99 },
    });
    expect(out?.style?.colorMode).toBeUndefined();
    expect(out?.style?.borderRadius).toBeUndefined();
    expect(out?.style?.shadowDepth).toBeUndefined();
  });

  it('keeps the content bag verbatim', () => {
    const content = { location: 'Boise', units: 'imperial', tickers: ['BTC', 'ETH'] };
    const out = normalizeCustomization({ content });
    expect(out?.content).toEqual(content);
  });

  it('drops an interaction with no valid fields entirely', () => {
    const out = normalizeCustomization({ interaction: { clickAction: 'fake-action' } });
    expect(out?.interaction).toBeUndefined();
  });
});

describe('Slice 5 — normalizeWidgetInstance', () => {
  it('drops a row missing required fields (id/type/x/y/w/h)', () => {
    expect(normalizeWidgetInstance({})).toBeNull();
    expect(normalizeWidgetInstance({ id: 'a', type: 'b' })).toBeNull();
  });

  it('keeps a valid instance with no customization', () => {
    const out = normalizeWidgetInstance({ id: 'a', type: 'weather', x: 0, y: 0, w: 2, h: 2 });
    expect(out).toEqual({ id: 'a', type: 'weather', x: 0, y: 0, w: 2, h: 2 });
  });

  it('drops showTitle from a saved layout (always-visible-header guarantee)', () => {
    const out = normalizeWidgetInstance({
      id: 'a',
      type: 'weather',
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      customization: { layout: { showTitle: false } },
    });
    expect(out?.customization).toBeUndefined();
  });
});

describe('Slice 5 — normalizeWidgets', () => {
  it('returns [] for non-arrays', () => {
    expect(normalizeWidgets(null)).toEqual([]);
    expect(normalizeWidgets({})).toEqual([]);
    expect(normalizeWidgets('x')).toEqual([]);
  });

  it('drops invalid rows but keeps the rest', () => {
    const out = normalizeWidgets([
      { id: 'a', type: 'weather', x: 0, y: 0, w: 2, h: 2 },
      { id: 'broken' /* missing fields */ },
      { id: 'b', type: 'my-pay', x: 2, y: 0, w: 3, h: 2 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('a');
    expect(out[1].id).toBe('b');
  });
});

describe('Slice 5 — hub-store hydrate runs the normalizer on load', () => {
  it('hub-store imports normalizeWidgets and pipes hydrate(widgets) through it', () => {
    expect(STORE_SRC).toMatch(/import \{ normalizeWidgets \} from '\.\/normalize-customization';/);
    expect(STORE_SRC).toMatch(/widgets:\s*normalizeWidgets\(widgets\)/);
  });
});
