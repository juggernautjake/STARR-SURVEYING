// __tests__/hub/validate-layout.test.ts
//
// Coverage for the pure validator that guards PUT
// /api/admin/me/hub-layout. The route is otherwise next-auth + supabase
// bound, so we test the validator standalone. Catches "user sent
// garbage" inputs before they hit Postgres.

import { describe, it, expect } from 'vitest';
import {
  validateHubLayoutPutPayload,
  clampFontScale,
} from '@/lib/hub/validate-layout';
import type { HubLayoutPutPayload } from '@/lib/hub/types';

const valid = (overrides?: Partial<HubLayoutPutPayload>): HubLayoutPutPayload => ({
  widgets: [
    { id: 'w_1', type: 'my-jobs', x: 0, y: 0, w: 6, h: 2 },
  ],
  ...overrides,
});

describe('validateHubLayoutPutPayload — happy paths', () => {
  it('accepts a minimal valid payload', () => {
    expect(validateHubLayoutPutPayload(valid())).toBeNull();
  });

  it('accepts an empty widgets array (user wiped their layout)', () => {
    expect(validateHubLayoutPutPayload({ widgets: [] })).toBeNull();
  });

  it('accepts an allowed theme', () => {
    expect(validateHubLayoutPutPayload(valid({ theme: 'forest-light' }))).toBeNull();
  });

  it('accepts each density value', () => {
    for (const d of ['compact', 'comfortable', 'spacious'] as const) {
      expect(validateHubLayoutPutPayload(valid({ density: d }))).toBeNull();
    }
  });

  it('accepts a fontScale of 1.25', () => {
    expect(validateHubLayoutPutPayload(valid({ fontScale: 1.25 }))).toBeNull();
  });

  it('accepts customTheme when theme=custom', () => {
    const out = validateHubLayoutPutPayload(valid({
      theme: 'custom',
      customTheme: {
        bgPage: '#FFF', bgSurface: '#FFF', fgPrimary: '#000', accent: '#1D3095',
        derived: {
          bgElevated: '#F5F5F5', fgSecondary: '#333', fgMuted: '#666',
          accentFg: '#FFF', border: '#E5E5E5', borderStrong: '#999',
          success: '#10B981', warning: '#F59E0B', danger: '#EF4444', info: '#3B82F6',
        },
        contrastAudit: {
          primaryOnSurface: { ratio: 21, passes: 'AAA' },
          primaryOnPage: { ratio: 21, passes: 'AAA' },
          secondaryOnSurface: { ratio: 9, passes: 'AAA' },
          accentFgOnAccent: { ratio: 8, passes: 'AAA' },
          accentOnSurface: { ratio: 6, passes: 'AA' },
        },
      },
    }));
    expect(out).toBeNull();
  });
});

describe('validateHubLayoutPutPayload — rejections', () => {
  it('rejects a non-object payload', () => {
    // @ts-expect-error invalid by design
    expect(validateHubLayoutPutPayload(null)).toMatch(/Body/);
    // @ts-expect-error invalid by design
    expect(validateHubLayoutPutPayload('string')).toMatch(/Body/);
  });

  it('rejects when widgets is not an array', () => {
    // @ts-expect-error invalid by design
    expect(validateHubLayoutPutPayload({ widgets: 'oops' })).toMatch(/widgets/);
  });

  it('rejects a widget without an id', () => {
    const out = validateHubLayoutPutPayload({
      widgets: [{ id: '', type: 'my-jobs', x: 0, y: 0, w: 6, h: 2 }],
    });
    expect(out).toMatch(/\.id/);
  });

  it('rejects a widget without a type', () => {
    const out = validateHubLayoutPutPayload({
      widgets: [{ id: 'w', type: '', x: 0, y: 0, w: 6, h: 2 }],
    });
    expect(out).toMatch(/\.type/);
  });

  it('rejects non-integer x/y/w/h', () => {
    const out = validateHubLayoutPutPayload({
      widgets: [{ id: 'w', type: 't', x: 0.5, y: 0, w: 6, h: 2 }],
    });
    expect(out).toMatch(/integers/);
  });

  it('rejects negative x/y', () => {
    const out = validateHubLayoutPutPayload({
      widgets: [{ id: 'w', type: 't', x: -1, y: 0, w: 6, h: 2 }],
    });
    expect(out).toMatch(/≥ 0/);
  });

  it('rejects zero or negative w/h', () => {
    const outW = validateHubLayoutPutPayload({
      widgets: [{ id: 'w', type: 't', x: 0, y: 0, w: 0, h: 2 }],
    });
    expect(outW).toMatch(/≥ 1/);
    const outH = validateHubLayoutPutPayload({
      widgets: [{ id: 'w', type: 't', x: 0, y: 0, w: 6, h: 0 }],
    });
    expect(outH).toMatch(/≥ 1/);
  });

  it('rejects an unknown theme', () => {
    // @ts-expect-error invalid by design
    const out = validateHubLayoutPutPayload(valid({ theme: 'made-up-theme' }));
    expect(out).toMatch(/theme/);
  });

  it('rejects an unknown density value', () => {
    // @ts-expect-error invalid by design
    const out = validateHubLayoutPutPayload(valid({ density: 'huge' }));
    expect(out).toMatch(/density/);
  });

  it('rejects a non-finite fontScale (NaN, Infinity)', () => {
    expect(validateHubLayoutPutPayload(valid({ fontScale: NaN }))).toMatch(/fontScale/);
    expect(validateHubLayoutPutPayload(valid({ fontScale: Infinity }))).toMatch(/fontScale/);
  });

  it('rejects theme=custom with no customTheme payload', () => {
    const out = validateHubLayoutPutPayload(valid({ theme: 'custom' }));
    expect(out).toMatch(/customTheme/);
  });
});

describe('clampFontScale', () => {
  it('returns the value when inside [0.875, 1.5]', () => {
    expect(clampFontScale(1.0)).toBe(1.0);
    expect(clampFontScale(0.875)).toBe(0.875);
    expect(clampFontScale(1.5)).toBe(1.5);
    expect(clampFontScale(1.25)).toBe(1.25);
  });

  it('clamps below the lower bound', () => {
    expect(clampFontScale(0.5)).toBe(0.875);
    expect(clampFontScale(0)).toBe(0.875);
    expect(clampFontScale(-1)).toBe(0.875);
  });

  it('clamps above the upper bound', () => {
    expect(clampFontScale(2.0)).toBe(1.5);
    expect(clampFontScale(99)).toBe(1.5);
  });

  it('returns 1.0 on non-finite input (defensive)', () => {
    expect(clampFontScale(NaN)).toBe(1.0);
    expect(clampFontScale(Infinity)).toBe(1.0);
    expect(clampFontScale(-Infinity)).toBe(1.0);
  });
});
