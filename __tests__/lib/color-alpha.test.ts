// __tests__/lib/color-alpha.test.ts

import { describe, it, expect } from 'vitest';
import { withAlpha } from '@/lib/admin/color-alpha';

describe('withAlpha — hex input', () => {
  it('matches the historical "+ \'20\'" pattern for ~12% alpha', () => {
    // 12 / 100 * 255 = 30.6 → 31 → 0x1F. (The legacy pattern used 0x20=32.)
    // 12.55% would round to exactly 0x20 — use 12 here for parity with
    // common values; the visual difference between 1F and 20 alpha is
    // invisible at 1-byte precision.
    expect(withAlpha('#EF4444', 12)).toBe('#EF44441f');
  });

  it('produces exactly the legacy 0x20 alpha when pct ≈ 12.55', () => {
    // 12.55 / 100 * 255 = 32.0025 → 32 → 0x20.
    expect(withAlpha('#EF4444', 12.55)).toBe('#EF444420');
  });

  it('handles 50% as 0x80', () => {
    expect(withAlpha('#000000', 50)).toBe('#00000080');
  });

  it('handles 0% as 0x00 (fully transparent)', () => {
    expect(withAlpha('#FFFFFF', 0)).toBe('#FFFFFF00');
  });

  it('handles 100% as 0xff (fully opaque)', () => {
    expect(withAlpha('#FFFFFF', 100)).toBe('#FFFFFFff');
  });

  it('clamps over-100 input to 100 (defensive)', () => {
    expect(withAlpha('#000000', 250)).toBe('#000000ff');
  });

  it('clamps negative input to 0', () => {
    expect(withAlpha('#000000', -50)).toBe('#00000000');
  });
});

describe('withAlpha — CSS var input', () => {
  it('falls through to color-mix() for CSS variables', () => {
    expect(withAlpha('var(--color-error)', 12)).toBe(
      'color-mix(in srgb, var(--color-error) 12%, transparent)'
    );
  });

  it('also falls through for named colors', () => {
    expect(withAlpha('rebeccapurple', 50)).toBe(
      'color-mix(in srgb, rebeccapurple 50%, transparent)'
    );
  });

  it('also falls through for a 4-char hex (#rgb)', () => {
    // The fast-path only accepts 7-char #RRGGBB. Short-form hex falls
    // through to color-mix(), which browsers also accept.
    expect(withAlpha('#fff', 50)).toBe('color-mix(in srgb, #fff 50%, transparent)');
  });

  it('also falls through for an existing color-mix expression', () => {
    expect(withAlpha('color-mix(in srgb, red 50%, blue)', 25)).toBe(
      'color-mix(in srgb, color-mix(in srgb, red 50%, blue) 25%, transparent)'
    );
  });
});
