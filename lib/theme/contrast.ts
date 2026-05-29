// lib/theme/contrast.ts
//
// WCAG 2.2 contrast calculator + sRGB color helpers. Used by:
//   - Slice 106's custom theme picker — gates "save" on AA pass and
//     powers the "Fix it" button (auto-darken/lighten until passing)
//   - Slice 107's per-widget Custom color mode — same guard applied
//     to the per-widget bg/fg pair
//   - Slice 78's `user_hub_layouts.custom_theme.contrast_audit` field
//     (saved at theme save time so the audit is durable)
//
// Reference: https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
//
// Slice 105 of customizable-hub-and-work-mode-2026-05-28.md.

/** sRGB triple in the 0..255 range. */
export interface SrgbColor {
  r: number;
  g: number;
  b: number;
}

/** Result of WCAG ratio + pass-level summary. */
export interface ContrastVerdict {
  ratio: number;
  /** Highest passed level for normal-weight body text (≥ 4.5 = AA,
   *  ≥ 7 = AAA). */
  level: 'AAA' | 'AA' | 'AA-large-only' | 'fail';
}

/** Pass thresholds from WCAG 2.2 §1.4.3 + §1.4.6. */
export const WCAG_AA_BODY = 4.5;
export const WCAG_AA_LARGE = 3.0;
export const WCAG_AAA_BODY = 7.0;
export const WCAG_AAA_LARGE = 4.5;

/** Parse a `#rrggbb` or `#rgb` hex string to an sRGB triple. Returns
 *  null when the input isn't a valid hex color so callers can decide
 *  the fallback. */
export function parseHexColor(input: string): SrgbColor | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s.startsWith('#')) return null;
  s = s.slice(1);
  if (s.length === 3) {
    s = s.split('').map((c) => c + c).join('');
  }
  if (s.length !== 6) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return { r, g, b };
}

/** Serialize an sRGB triple to `#rrggbb`. */
export function toHexColor(c: SrgbColor): string {
  return '#' + [c.r, c.g, c.b].map((n) => clamp255(n).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** sRGB → linear (per WCAG 2.2 §1.4.3 relative luminance formula). */
export function srgbChannelToLinear(channel: number): number {
  const c = clamp01(channel / 255);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
export function relativeLuminance(c: SrgbColor): number {
  const r = srgbChannelToLinear(c.r);
  const g = srgbChannelToLinear(c.g);
  const b = srgbChannelToLinear(c.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors. Symmetric — order doesn't
 *  matter. Result in [1.0, 21.0]. */
export function contrastRatio(a: SrgbColor, b: SrgbColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/** Highest WCAG level the ratio passes for normal-weight body text.
 *  Use `contrastVerdictFor(...)` for the full ratio + level result. */
export function contrastLevel(ratio: number): ContrastVerdict['level'] {
  if (ratio >= WCAG_AAA_BODY) return 'AAA';
  if (ratio >= WCAG_AA_BODY) return 'AA';
  if (ratio >= WCAG_AA_LARGE) return 'AA-large-only';
  return 'fail';
}

/** Convenience — combine ratio + level. */
export function contrastVerdictFor(a: SrgbColor, b: SrgbColor): ContrastVerdict {
  const ratio = contrastRatio(a, b);
  return { ratio, level: contrastLevel(ratio) };
}

/** True when the ratio meets AA body text (≥ 4.5). */
export function passesAA(ratio: number): boolean {
  return ratio >= WCAG_AA_BODY;
}

/** True when the ratio meets AAA body text (≥ 7.0). */
export function passesAAA(ratio: number): boolean {
  return ratio >= WCAG_AAA_BODY;
}

/** Pick the better-contrasting of white/black against the given
 *  background. Used to auto-derive an accent-fg when the user picks an
 *  accent color but doesn't supply a foreground. */
export function pickForegroundForBackground(bg: SrgbColor): SrgbColor {
  const white: SrgbColor = { r: 255, g: 255, b: 255 };
  const black: SrgbColor = { r: 0, g: 0, b: 0 };
  return contrastRatio(bg, white) >= contrastRatio(bg, black) ? white : black;
}

/** Lighten a color by mixing toward white by `amount` in [0, 1]. */
export function lighten(c: SrgbColor, amount: number): SrgbColor {
  const t = clamp01(amount);
  return {
    r: clamp255(c.r + (255 - c.r) * t),
    g: clamp255(c.g + (255 - c.g) * t),
    b: clamp255(c.b + (255 - c.b) * t),
  };
}

/** Darken a color by mixing toward black by `amount` in [0, 1]. */
export function darken(c: SrgbColor, amount: number): SrgbColor {
  const t = clamp01(amount);
  return {
    r: clamp255(c.r * (1 - t)),
    g: clamp255(c.g * (1 - t)),
    b: clamp255(c.b * (1 - t)),
  };
}

/** Auto-adjust the foreground color so it passes the target ratio
 *  against `bg`. Walks toward white or black depending on which side
 *  the current fg is closer to, in 5% increments. Returns the
 *  original color when it already passes. Returns `null` when no
 *  adjustment can reach the target (only happens when `target > 21`). */
export function adjustForegroundToTarget(
  bg: SrgbColor,
  fg: SrgbColor,
  target: number = WCAG_AA_BODY,
): SrgbColor | null {
  if (target > 21) return null;
  if (contrastRatio(bg, fg) >= target) return fg;
  // Decide direction based on background luminance: dark bg → walk fg
  // toward white; light bg → walk fg toward black.
  const towardWhite = relativeLuminance(bg) < 0.5;
  let current = fg;
  for (let step = 1; step <= 20; step++) {
    current = towardWhite ? lighten(fg, step * 0.05) : darken(fg, step * 0.05);
    if (contrastRatio(bg, current) >= target) return current;
  }
  // At 100% white / 0% black we either hit the target or it's impossible.
  return contrastRatio(bg, current) >= target ? current : null;
}

// ─── Internals ─────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clamp255(n: number): number {
  const rounded = Math.round(n);
  if (rounded < 0) return 0;
  if (rounded > 255) return 255;
  return rounded;
}
