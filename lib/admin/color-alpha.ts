// lib/admin/color-alpha.ts
//
// `color + '20'` was the historical pattern for the status-badge soft-tint
// effect — concatenate the 6-char hex with the alpha-channel hex `20`
// (32/255 ≈ 12.5%) to produce an 8-char `#RRGGBBAA` value. This works
// when the color is a hex literal, but it silently produces invalid
// CSS when the value is a CSS custom property (`var(--color-error)20`
// is not a color).
//
// `withAlpha()` is the same effect rewritten to work for both inputs
// uniformly: a hex literal gets the alpha appended (preserving the
// fast path), a CSS variable or `color-mix(...)` value goes through
// `color-mix(in srgb, COLOR PCT%, transparent)` which every modern
// browser (Chrome 111+, Firefox 113+, Safari 16.2+) supports and
// resolves correctly for both `var()` and named colors.

/**
 * Apply an alpha tint to a CSS color value.
 *
 * - `color` may be a 6-char `#RRGGBB` hex OR a CSS variable
 *   (`var(--color-error)`), a `color-mix(...)`, or a named color.
 * - `alphaPct` is the **opacity percentage** the color shows through
 *   (0 = fully transparent, 100 = fully opaque). 12 ≈ the historical
 *   `+ '20'` value.
 */
export function withAlpha(color: string, alphaPct: number): string {
  if (color.startsWith('#') && color.length === 7) {
    // 12 → 31; 50 → 128; round-to-byte.
    const clamped = Math.max(0, Math.min(100, alphaPct));
    const a = Math.round((clamped / 100) * 255)
      .toString(16)
      .padStart(2, '0');
    return color + a;
  }
  // CSS var, color-mix, named color → use color-mix() which resolves
  // the inner value at compute time.
  return `color-mix(in srgb, ${color} ${alphaPct}%, transparent)`;
}
