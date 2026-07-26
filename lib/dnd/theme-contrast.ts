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

// ── Additions from the final-QA skin sweep (walkthrough slices 18–20) ──────────────────────────────
//
// `composite` above flattens ONE translucent layer over an opaque one, which is all a token audit needs.
// Measuring a live sheet needs more: its panels are translucent over translucent over a skin base, so a
// DOM walk collects a STACK. Reading only the first non-transparent background you meet is how an earlier
// version of that sweep scored purple text on a light pink page at 1.62:1 and flagged 42 healthy samples.

/**
 * Flatten a stack of backgrounds into the colour a reader actually sees.
 *
 * `layers` is ordered NEAREST-FIRST — the element's own background, then its parent's, outward — exactly
 * as a DOM walk collects them. The first fully opaque layer ends the stack; nothing behind it is visible.
 * Fully transparent layers contribute nothing.
 */
export function flattenStack(layers: RGBA[], base: RGBA): RGBA {
  const stack: RGBA[] = [];
  for (const l of layers) {
    if (l.a <= 0) continue;
    stack.push(l);
    if (l.a >= 1) break;
  }
  let out: RGBA = stack.length && stack[stack.length - 1].a >= 1 ? stack.pop()! : { ...base, a: 1 };
  for (let i = stack.length - 1; i >= 0; i--) out = composite(stack[i], out);
  return out;
}

/**
 * The AA threshold for text at a given rendered SIZE.
 *
 * `CONTRAST.body` / `CONTRAST.secondary` above are the per-ROLE thresholds a token audit uses. This is the
 * per-SIZE rule WCAG actually states, which a live measurement needs: large text (≥24px, or ≥18.66px when
 * bold) clears at 3:1, everything else at 4.5:1. Both directions of getting this wrong showed up in the
 * sweep — a 23px headline reported as a defect (it isn't large), and 11px labels waved through as if they
 * were.
 */
export function aaThresholdForSize(fontSizePx: number, bold = false): number {
  const large = fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
  return large ? CONTRAST.secondary : CONTRAST.body;
}

/** Does text of this size clear AA at this ratio? */
export function passesAAForSize(ratio: number, fontSizePx: number, bold = false): boolean {
  return ratio >= aaThresholdForSize(fontSizePx, bold);
}

// ── LIVE MEASUREMENT: what is actually painted behind an element ─────────────────────────────────────
//
// `flattenStack` above takes a list of background colours. Producing that list from real computed styles is
// where every mistake in the 2026-07-26 contrast arc actually happened, twice, in code that only ever existed
// as a snippet pasted into a browser console:
//
//   1. reading `backgroundColor` and ignoring `background-image` — so a gradient-painted surface (the roller
//      dock) was skipped entirely and its labels were measured against the page behind it;
//   2. reading the first colour of the first background LAYER — so `.dnd-sheet`'s 5%-pink pinstripe *over an
//      opaque light base* looked translucent, the walk climbed to the dark site chrome, and ten legible
//      headings were reported at 1.2–1.4:1.
//
// Both invented failures, and the second nearly produced a round of "fixes" to working code. That is why this
// lives in the library with tests rather than in a snippet: the two bugs are now pinned.

/** The minimum a caller must supply per element — the two properties that paint a background. */
export interface BackgroundStyle {
  backgroundColor?: string;
  backgroundImage?: string;
}

/** Split a `background-image` value on TOP-LEVEL commas only; a gradient's own commas sit inside parens. */
function splitLayers(value: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(value.slice(start, i)); start = i + 1; }
  }
  out.push(value.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * One element's background layers, NEAREST-FIRST (topmost first) — the order `flattenStack` wants.
 *
 * Painting order in CSS: `background-color` is the bottom, and image layers paint with the FIRST declared on
 * TOP. So the returned order is [image1, image2, …, imageN, color].
 *
 * A gradient is approximated by its first colour stop. That is a real limitation — a ramp is not one colour —
 * so a measurement that matters near the threshold should be taken against the specific pixel region instead
 * (which is how the roller's active tab was checked).
 */
export function backgroundLayers(style: BackgroundStyle): RGBA[] {
  const layers: RGBA[] = [];
  const img = (style.backgroundImage ?? 'none').trim();
  if (img && img !== 'none') {
    for (const layer of splitLayers(img)) {
      const stops = [...layer.matchAll(/rgba?\([^)]*\)/g)].map((m) => parseColor(m[0])).filter(Boolean) as RGBA[];
      if (stops.length) layers.push(stops[0]);
    }
  }
  const bc = parseColor(style.backgroundColor ?? '');
  if (bc && bc.a > 0) layers.push(bc);
  return layers;
}

/**
 * The colour actually behind text, given the element's style chain from the element OUTWARD.
 *
 * `chain[0]` is the element itself, then each ancestor. Walking stops naturally at the first opaque layer,
 * so passing the whole chain to the document root is safe and correct.
 */
export function backdropOf(chain: BackgroundStyle[], base: RGBA = { r: 255, g: 255, b: 255, a: 1 }): RGBA {
  return flattenStack(chain.flatMap(backgroundLayers), base);
}

/** One measured text node: its ratio against what is really behind it, and whether that clears AA. */
export function measureText(
  text: { color: string; fontSizePx: number; bold?: boolean },
  chain: BackgroundStyle[],
  base?: RGBA,
): { ratio: number | null; need: number; pass: boolean; backdrop: RGBA } {
  const backdrop = backdropOf(chain, base);
  const rgb = `rgb(${Math.round(backdrop.r)}, ${Math.round(backdrop.g)}, ${Math.round(backdrop.b)})`;
  const ratio = contrastRatio(text.color, rgb);
  const need = aaThresholdForSize(text.fontSizePx, text.bold ?? false);
  return { ratio, need, pass: ratio != null && ratio >= need, backdrop };
}
