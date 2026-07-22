// theme-contrast — WCAG contrast maths over the D&D sheet's colour TOKENS (TR-1).
//
// Every sheet component reads the same `--*` tokens (`ink`, `muted`, `line`, the accents, `panel`, `void`),
// so legibility is decided by the TOKEN pairings, not by any one component. This module turns "some theme ×
// skin combinations are hard to read" into a computed, enumerable fact: for a given theme it resolves each
// text/border token against its background and reports the WCAG contrast ratio, so a test can FAIL a pairing
// below threshold and a new theme can't silently ship an illegible one. Pure — no DOM, no React.

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp8 = (n: number) => Math.max(0, Math.min(255, n));

/** Parse a CSS colour token — `#rgb`, `#rrggbb`, `rgb(...)`, `rgba(...)` — into RGBA (a defaults to 1).
 *  Returns null for anything else (e.g. a gradient), so callers can skip it rather than mis-score it. */
export function parseColor(css: string): RGBA | null {
  const s = css.trim().toLowerCase();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), a: 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a };
    }
    return null;
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim());
    if (parts.length < 3) return null;
    return {
      r: clamp8(parseFloat(parts[0])),
      g: clamp8(parseFloat(parts[1])),
      b: clamp8(parseFloat(parts[2])),
      a: parts.length >= 4 ? Math.max(0, Math.min(1, parseFloat(parts[3]))) : 1,
    };
  }
  return null;
}

/** Flatten a (possibly translucent) foreground over an OPAQUE background — the colour a viewer actually sees.
 *  Borders/lines use rgba over the panel, so scoring them requires compositing first. */
export function composite(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

const channelLin = (c: number) => {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance of an OPAQUE colour (composite first if it has alpha). */
export function relativeLuminance(c: RGBA): number {
  return 0.2126 * channelLin(c.r) + 0.7152 * channelLin(c.g) + 0.0722 * channelLin(c.b);
}

/** WCAG contrast ratio (1..21) between two colours. Both are composited over `bg` if translucent, so a
 *  border rgba is scored as-seen. `fg`/`bg` are CSS strings; returns null if either can't be parsed. */
export function contrastRatio(fgCss: string, bgCss: string): number | null {
  const fgRaw = parseColor(fgCss);
  const bg = parseColor(bgCss);
  if (!fgRaw || !bg) return null;
  const fg = fgRaw.a < 1 ? composite(fgRaw, bg) : fgRaw;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** The legibility thresholds this project holds tokens to (from the plan): body text ~4.5:1, secondary /
 *  large / accent-as-emphasis ~3:1, and a border need only be perceptible (~1.3:1) against its panel. */
export const CONTRAST = { body: 4.5, secondary: 3.0, border: 1.3 } as const;

export interface PairScore {
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  pass: boolean;
}

/** A theme's colour map (the `SheetTheme.colors` shape), as CSS strings by token name. Values may be absent
 *  (a theme can omit a token), so the audit guards each lookup. */
export type TokenMap = Record<string, string | undefined>;
/** Alias matching the sheet theme's `colors` shape, for callers importing from here. */
export type SheetThemeColors = TokenMap;

/** Score the pairings that decide legibility for one theme. `ink`/accents are held to body/secondary; the
 *  border token only needs to be perceptible. Missing tokens are skipped (a theme may omit some). */
export function auditTheme(colors: TokenMap): PairScore[] {
  const out: PairScore[] = [];
  const add = (fgKey: string, bgKey: string, min: number) => {
    const fg = colors[fgKey];
    const bg = colors[bgKey];
    if (!fg || !bg) return;
    const ratio = contrastRatio(fg, bg);
    if (ratio == null) return;
    out.push({ fg: fgKey, bg: bgKey, ratio, min, pass: ratio + 1e-6 >= min });
  };
  // Body text on both backgrounds it sits on.
  add('ink', 'panel', CONTRAST.body);
  add('ink', 'void', CONTRAST.body);
  // Secondary/label text.
  add('muted', 'panel', CONTRAST.secondary);
  add('muted', 'void', CONTRAST.secondary);
  // Accents used AS text/numerals (links, headline numbers, teal/gold emphasis) — large, so secondary bar.
  add('tealbright', 'panel', CONTRAST.secondary);
  add('gold', 'panel', CONTRAST.secondary);
  add('danger', 'panel', CONTRAST.secondary);
  // Borders only need to be perceptible against the panel they outline.
  add('line', 'panel', CONTRAST.border);
  return out;
}
