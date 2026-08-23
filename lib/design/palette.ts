// lib/design/palette.ts — building a set of colours, and turning one into a theme.
//
// Phase P of docs/planning/completed/DESIGN_THEMES_2026-08-23.md.
//
// Owner: *"create color palettes and stuff that we can set as the default for a theme and that will
// automatically be applied to the elements."*
//
// ── A PALETTE AND A THEME ARE DIFFERENT THINGS ──────────────────────────────────────────────────
//
// A palette is what you HAVE: a named set of colours. A theme is what you DO with it: an assignment
// of colours to roles — this one is the page, that one is the text, this one is the accent.
//
// Keeping them apart is what makes "the same palette with a darker background" possible without
// duplicating the palette, and what lets one palette drive several themes.
//
// ── WHY THE COLOUR MATHS IS HERE AND TESTED ─────────────────────────────────────────────────────
//
// A hue rotation that is off by a few degrees produces a palette that looks *plausible* — nobody
// reviewing a screenshot spots it. The same is true of a lightness scale that is not monotonic, and
// of an auto-assignment that puts 2.8:1 text on a background. These are exactly the bugs that
// survive review, so they are unit-tested instead.

import { contrastRatio, parseColour } from './checks';
import { readableOn, type Theme, type TokenName } from './theme';

export interface Swatch {
  name: string;
  value: string;
}

export interface Palette {
  id: string;
  name: string;
  swatches: Swatch[];
  builtIn?: boolean;
}

// ── COLOUR SPACE ────────────────────────────────────────────────────────────────────────────────
//
// HSL, because the operations a person means by "palette" — lighten, darken, rotate the hue, mute —
// are all one-axis moves in HSL and none of them are in RGB.

export interface Hsl { h: number; s: number; l: number }

export function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): Hsl {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const lum = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lum - c / 2;
  const [r1, g1, b1] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
      : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`.toUpperCase();
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseColour(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

/** Move a colour's lightness to an absolute value, keeping hue and saturation. */
export function withLightness(hex: string, l: number): string {
  const hsl = hexToHsl(hex);
  return hsl ? hslToHex({ ...hsl, l }) : hex;
}

export function rotateHue(hex: string, degrees: number): string {
  const hsl = hexToHsl(hex);
  return hsl ? hslToHex({ ...hsl, h: hsl.h + degrees }) : hex;
}

export function withSaturation(hex: string, s: number): string {
  const hsl = hexToHsl(hex);
  return hsl ? hslToHex({ ...hsl, s }) : hex;
}

// ── BUILDING A PALETTE ──────────────────────────────────────────────────────────────────────────

/**
 * A tint-and-shade ramp from one colour: nine steps, light to dark.
 *
 * The steps are absolute lightness values, not multiplications of the input's. Multiplying means a
 * pale input produces nine pale colours and a dark input produces nine dark ones — the ramp would
 * depend on where the seed happens to sit, which is the opposite of what a ramp is for.
 */
export const RAMP_STEPS = [0.96, 0.90, 0.80, 0.68, 0.56, 0.46, 0.36, 0.26, 0.16];

export function ramp(seed: string, name = 'Shade'): Swatch[] {
  const hsl = hexToHsl(seed);
  if (!hsl) return [];
  return RAMP_STEPS.map((l, i) => ({
    name: `${name} ${(i + 1) * 100}`,
    // Saturation eases off at the extremes: a fully saturated near-white reads as a stain, and a
    // fully saturated near-black reads as a different hue entirely.
    value: hslToHex({ h: hsl.h, s: hsl.s * (l > 0.85 || l < 0.25 ? 0.6 : 1), l }),
  }));
}

export type Harmony = 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'tetradic' | 'monochrome';

export const HARMONIES: Array<{ id: Harmony; label: string; description: string }> = [
  { id: 'monochrome', label: 'Monochrome', description: 'One hue, nine lightnesses. Calm, and impossible to get wrong.' },
  { id: 'analogous', label: 'Analogous', description: 'Neighbouring hues. Quiet and cohesive.' },
  { id: 'complementary', label: 'Complementary', description: 'The opposite hue. One accent that shouts.' },
  { id: 'split-complementary', label: 'Split complementary', description: 'Either side of the opposite. Contrast without the clash.' },
  { id: 'triadic', label: 'Triadic', description: 'Three hues, evenly spaced. Vivid; needs a dominant one.' },
  { id: 'tetradic', label: 'Tetradic', description: 'Two complementary pairs. The most colours you can hold together.' },
];

const HARMONY_ANGLES: Record<Harmony, number[]> = {
  monochrome: [0],
  analogous: [-30, 0, 30],
  complementary: [0, 180],
  'split-complementary': [0, 150, 210],
  triadic: [0, 120, 240],
  tetradic: [0, 90, 180, 270],
};

/** A palette built from one colour and a harmony: the hues, each with a light and a dark. */
export function buildPalette(seed: string, harmony: Harmony, name = 'Palette'): Palette {
  const hsl = hexToHsl(seed);
  if (!hsl) return { id: 'invalid', name, swatches: [] };

  if (harmony === 'monochrome') {
    return { id: `p-${Date.now().toString(36)}`, name, swatches: ramp(seed, 'Tone') };
  }

  const angles = HARMONY_ANGLES[harmony];
  const swatches: Swatch[] = [];
  angles.forEach((angle, i) => {
    const base = hslToHex({ ...hsl, h: hsl.h + angle });
    const label = i === 0 ? 'Primary' : `Accent ${i}`;
    swatches.push({ name: `${label} light`, value: withLightness(base, 0.86) });
    swatches.push({ name: label, value: base });
    swatches.push({ name: `${label} dark`, value: withLightness(base, 0.28) });
  });
  // Every palette needs neutrals, or a theme built from it has no page background and no borders.
  swatches.push({ name: 'Neutral light', value: hslToHex({ h: hsl.h, s: 0.08, l: 0.97 }) });
  swatches.push({ name: 'Neutral', value: hslToHex({ h: hsl.h, s: 0.06, l: 0.72 }) });
  swatches.push({ name: 'Neutral dark', value: hslToHex({ h: hsl.h, s: 0.12, l: 0.18 }) });

  return { id: `p-${Date.now().toString(36)}`, name, swatches };
}

// ── TURNING A PALETTE INTO A THEME ──────────────────────────────────────────────────────────────

/**
 * Pick roles out of a palette and produce a theme.
 *
 * The assignment is by measured property, not by position: the lightest colour becomes the page,
 * the darkest becomes the text, the most saturated mid-lightness colour becomes the accent. A
 * palette whose colours are in a different order therefore produces the same sensible theme, which
 * is the difference between automation and a lottery.
 *
 * `dark` inverts the surface/text choice for a dark theme.
 */
export function themeFromPalette(palette: Palette, options: { name?: string; dark?: boolean } = {}): Theme {
  const dark = options.dark ?? false;
  const measured = palette.swatches
    .map((s) => ({ ...s, hsl: hexToHsl(s.value) }))
    .filter((s): s is Swatch & { hsl: Hsl } => s.hsl !== null);

  if (measured.length === 0) {
    return { id: `t-${Date.now().toString(36)}`, name: options.name ?? palette.name, tokens: {}, paletteId: palette.id };
  }

  // Total order here too, for the same reason as the accent below: ties must not be broken by
  // whatever order the swatches happen to be stored in.
  const byLight = [...measured].sort((a, b) => (b.hsl.l - a.hsl.l) || a.value.localeCompare(b.value));
  const lightest = byLight[0].value;
  const darkest = byLight[byLight.length - 1].value;

  // The accent is the most saturated colour that is not almost-white or almost-black — those read
  // as surfaces, not accents, however saturated they are.
  //
  // ── THE SORT IS A TOTAL ORDER, AND THAT IS NOT A DETAIL ─────────────────────────────────────
  //
  // Sorting by saturation alone leaves ties, and a harmony palette is FULL of ties: split
  // complementary produces three hues at identical saturation by construction. `Array.sort` then
  // decides by input order, so reversing the swatches picked a different accent — the same palette
  // producing a different theme depending on the order it happened to be stored in. That is the
  // lottery this function exists not to be, and its own test caught it.
  const byAccentFitness = (a: typeof measured[number], b: typeof measured[number]) =>
    (b.hsl.s - a.hsl.s)          // most saturated first
    || (a.hsl.h - b.hsl.h)       // then lowest hue, so ties resolve the same way every time
    || a.value.localeCompare(b.value);
  const accent = [...measured]
    .filter((s) => s.hsl.l > 0.22 && s.hsl.l < 0.78)
    .sort(byAccentFitness)[0]?.value
    ?? [...measured].sort(byAccentFitness)[0].value;

  const page = dark ? withLightness(darkest, 0.10) : lightest;
  const surface = dark ? withLightness(darkest, 0.16) : '#FFFFFF';
  const elevated = dark ? withLightness(darkest, 0.24) : withLightness(lightest, 0.93);
  const primaryText = dark ? withLightness(lightest, 0.95) : darkest;
  const secondaryText = dark ? withLightness(lightest, 0.82) : withLightness(darkest, 0.32);
  const mutedText = dark ? withLightness(lightest, 0.66) : withLightness(darkest, 0.48);
  const border = dark ? withLightness(darkest, 0.28) : withLightness(accent, 0.86);
  const borderStrong = dark ? withLightness(darkest, 0.40) : withLightness(accent, 0.70);

  const tokens: Partial<Record<TokenName, string>> = {
    '--theme-bg-page': page,
    '--theme-bg-surface': surface,
    '--theme-bg-elevated': elevated,
    '--theme-fg-primary': primaryText,
    '--theme-fg-secondary': secondaryText,
    '--theme-fg-muted': mutedText,
    '--theme-accent': accent,
    '--theme-accent-fg': readableOn(accent),
    '--theme-border': border,
    '--theme-border-strong': borderStrong,
    // States keep their meaning. A green that means "success" has to stay recognisably green, so it
    // takes the palette's hue only as a nudge — a red success pill is a palette winning an argument
    // it should not be in.
    '--theme-success': dark ? '#4ADE80' : '#15803D',
    '--theme-warning': dark ? '#FBBF24' : '#A16207',
    '--theme-danger': dark ? '#F87171' : '#B91C1C',
    '--theme-info': accent,
    // The `--color-*` family the catalogue reads.
    '--color-bg-app': page,
    '--color-bg-card': surface,
    '--color-bg-subtle': elevated,
    '--color-text-primary': primaryText,
    '--color-text-secondary': secondaryText,
    '--color-text-tertiary': mutedText,
    '--color-text-muted': dark ? withLightness(lightest, 0.55) : withLightness(darkest, 0.60),
    '--color-brand-navy': accent,
    '--color-brand-navy-d': withLightness(accent, dark ? 0.60 : 0.26),
    '--color-border': border,
    '--color-border-strong': borderStrong,
    '--color-success': dark ? '#4ADE80' : '#15803D',
    '--color-error': dark ? '#F87171' : '#B91C1C',
  };

  return {
    id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name: options.name ?? `${palette.name}${dark ? ' (dark)' : ''}`,
    tokens,
    paletteId: palette.id,
  };
}

export interface Adjustment { token: string; from: string; to: string; why: string }

/**
 * Force every text/background pair in a theme to be readable, and say what was changed.
 *
 * ── WHY A GENERATOR MUST NOT BE TRUSTED ───────────────────────────────────────────────────────
 *
 * An automatic assignment WILL eventually produce 2.8:1 text on a background — a pale palette makes
 * muted text vanish, a dark one makes borders invisible. That is worse than no automation, because
 * the result looks deliberate: nobody reviews a generated theme as sceptically as one they mixed.
 *
 * So the lightness of the FOREGROUND is walked toward black or white until the pair passes. Hue and
 * saturation are untouched, so the colour is still recognisably the one the palette chose — it is
 * the same colour, made readable, rather than a different colour.
 */
export function enforceContrast(theme: Theme, minimum = 4.5): { theme: Theme; adjustments: Adjustment[] } {
  const tokens = { ...theme.tokens };
  const adjustments: Adjustment[] = [];

  const pairs: Array<[TokenName, TokenName, string]> = [
    ['--theme-fg-primary', '--theme-bg-surface', 'Primary text on a card'],
    ['--theme-fg-secondary', '--theme-bg-surface', 'Secondary text on a card'],
    ['--theme-fg-muted', '--theme-bg-surface', 'Muted text on a card'],
    ['--theme-accent-fg', '--theme-accent', 'Text on an accent button'],
    ['--color-text-primary', '--color-bg-card', 'Body text on a card'],
    ['--color-text-secondary', '--color-bg-card', 'Quieter body text on a card'],
    ['--color-text-tertiary', '--color-bg-card', 'Captions on a card'],
  ];

  for (const [fgToken, bgToken, label] of pairs) {
    const fg = tokens[fgToken];
    const bg = tokens[bgToken];
    if (!fg || !bg) continue;
    const current = contrastRatio(fg, bg);
    if (current === null || current >= minimum) continue;

    const hsl = hexToHsl(fg);
    if (!hsl) continue;
    // Walk toward whichever end of the lightness axis the background is furthest from.
    const bgHsl = hexToHsl(bg);
    const goDarker = (bgHsl?.l ?? 1) > 0.5;

    let best = fg;
    for (let step = 1; step <= 20; step += 1) {
      const l = goDarker ? Math.max(0, hsl.l - step * 0.05) : Math.min(1, hsl.l + step * 0.05);
      const candidate = hslToHex({ ...hsl, l });
      const ratio = contrastRatio(candidate, bg);
      best = candidate;
      if (ratio !== null && ratio >= minimum) break;
    }

    if (best !== fg) {
      tokens[fgToken] = best;
      adjustments.push({
        token: fgToken,
        from: fg,
        to: best,
        why: `${label} was ${current.toFixed(1)}:1, below ${minimum}:1`,
      });
    }
  }

  return { theme: { ...theme, tokens }, adjustments };
}

/** A palette from an existing theme's tokens — the way back, so a hand-tuned theme can seed one. */
export function paletteFromTheme(theme: Theme, name: string): Palette {
  const wanted: Array<[TokenName, string]> = [
    ['--theme-bg-page', 'Page'],
    ['--theme-bg-surface', 'Surface'],
    ['--theme-accent', 'Accent'],
    ['--theme-fg-primary', 'Text'],
    ['--theme-fg-muted', 'Muted'],
    ['--theme-border', 'Border'],
    ['--theme-success', 'Success'],
    ['--theme-warning', 'Warning'],
    ['--theme-danger', 'Danger'],
  ];
  return {
    id: `p-${Date.now().toString(36)}`,
    name,
    swatches: wanted
      .filter(([token]) => !!theme.tokens[token])
      .map(([token, label]) => ({ name: label, value: theme.tokens[token]! })),
  };
}

