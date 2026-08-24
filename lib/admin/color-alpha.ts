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

/**
 * The readable ink for a soft-tint chip.
 *
 * The idiom `background: withAlpha(hue, 12.55), color: hue` appears in a dozen places — stage
 * pills, role chips, payroll badges, RTK markers — and it is unreadable wherever the hue is
 * light. Measured: `#F59E0B` on its own 12.5% tint is **2.15:1**, `#65A30D` is **3.09:1**. It
 * fails on the LIGHT theme too, so it was never a theming defect; the theme audit is simply
 * where it finally got measured.
 *
 * Mixing the hue toward the theme's own foreground is what makes one formula work on eleven
 * palettes: on a light theme `--theme-fg-primary` is near-black so the ink darkens, on a dark
 * theme it is near-white so the same expression lightens it. 55% is the measured floor — across
 * every chip hue in the app, both tint strengths in use, and the surfaces of every theme in the
 * roster, the worst pair comes out at 4.93:1.
 *
 * The chip keeps its hue: amber stays a bronze amber, violet stays violet. The colour is doing
 * identification work, and a fix that flattened all of them to grey would have removed the
 * information the chip exists to carry.
 */
export function chipInk(color: string | undefined | null): string {
  // Callers routinely hold a colour that may not be there — an unknown status, a role with no entry
  // in the map. Answering that here rather than making each site write `?? '#6B7280'` inside its
  // `style={{}}` keeps the fallback reachable by a theme, which is the entire point of the helper.
  if (!color) return 'var(--theme-fg-secondary, #4B5563)';
  return `color-mix(in srgb, ${color} 55%, var(--theme-fg-primary, #0F172A))`;
}
