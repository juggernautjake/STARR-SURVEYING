// lib/design/theme.ts — a theme is a set of CSS variables, and that is the whole trick.
//
// Phase T of docs/planning/completed/DESIGN_THEMES_2026-08-23.md.
//
// Owner: *"I want to be able to make different themes and stuff to really get any look I want…
// create color palettes… that we can set as the default for a theme and that will automatically be
// applied to the elements."*
//
// ── WHY THIS IS TWENTY-EIGHT STRINGS AND NOT A RENDERING ENGINE ─────────────────────────────────
//
// The artboard renders the app's REAL elements with the app's REAL classes. Those classes are
// already written against CSS custom properties — `var(--theme-bg-surface)`, `var(--color-brand-navy)`
// — because that is how the app's own ten skins work.
//
// So applying a theme is setting those properties on the artboard element. Every element inside
// re-paints because it was already reading them. No entry is touched, no renderer is special-cased,
// and an entry curated next year is theme-aware the moment it is written, for free.
//
// The alternative — a stylesheet per theme — would let the canvas and the export drift apart, and
// would not cover a class added later. This is the app's own mechanism used the way the app uses it.

import { contrastRatio, parseColour } from './checks';

/**
 * The tokens a theme may set.
 *
 * Two families, and the split is the app's, not ours:
 *
 *   `--theme-*`  the fourteen ROLE tokens every skin in app/styles/themes.css overrides. These are
 *                the app's own theming contract, so a designer theme that sets them is doing
 *                exactly what a real skin does.
 *   `--color-*`  the brand and text tokens the CATALOGUE actually references. Not all 47 — only the
 *                ones entries cite, because offering a token nothing reads is a control that does
 *                nothing, and a control that does nothing is worse than a missing one.
 */
export const THEME_TOKENS = [
  // Surfaces
  { name: '--theme-bg-page', label: 'Page background', group: 'surface' },
  { name: '--theme-bg-surface', label: 'Card surface', group: 'surface' },
  { name: '--theme-bg-elevated', label: 'Raised surface', group: 'surface' },
  { name: '--color-bg-app', label: 'App background', group: 'surface' },
  { name: '--color-bg-card', label: 'Card background', group: 'surface' },
  { name: '--color-bg-subtle', label: 'Subtle background', group: 'surface' },
  // Text
  { name: '--theme-fg-primary', label: 'Primary text', group: 'text' },
  { name: '--theme-fg-secondary', label: 'Secondary text', group: 'text' },
  { name: '--theme-fg-muted', label: 'Muted text', group: 'text' },
  { name: '--color-text-primary', label: 'Body text', group: 'text' },
  { name: '--color-text-secondary', label: 'Body text, quieter', group: 'text' },
  { name: '--color-text-tertiary', label: 'Captions', group: 'text' },
  { name: '--color-text-muted', label: 'Placeholder text', group: 'text' },
  // Brand and accent
  { name: '--theme-accent', label: 'Accent', group: 'brand' },
  { name: '--theme-accent-fg', label: 'Text on accent', group: 'brand' },
  { name: '--color-brand-navy', label: 'Brand primary', group: 'brand' },
  { name: '--color-brand-navy-d', label: 'Brand primary, dark', group: 'brand' },
  { name: '--color-brand-red', label: 'Brand secondary', group: 'brand' },
  // Lines
  { name: '--theme-border', label: 'Border', group: 'line' },
  { name: '--theme-border-strong', label: 'Strong border', group: 'line' },
  { name: '--color-border', label: 'Hairline', group: 'line' },
  { name: '--color-border-strong', label: 'Divider', group: 'line' },
  // State
  { name: '--theme-success', label: 'Success', group: 'state' },
  { name: '--theme-warning', label: 'Warning', group: 'state' },
  { name: '--theme-danger', label: 'Danger', group: 'state' },
  { name: '--theme-info', label: 'Info', group: 'state' },
  { name: '--color-success', label: 'Success fill', group: 'state' },
  { name: '--color-error', label: 'Error fill', group: 'state' },
] as const;

export type TokenName = typeof THEME_TOKENS[number]['name'];
export type TokenGroup = 'surface' | 'text' | 'brand' | 'line' | 'state';

export const TOKEN_GROUPS: Array<{ id: TokenGroup; label: string }> = [
  { id: 'surface', label: 'Surfaces' },
  { id: 'text', label: 'Text' },
  { id: 'brand', label: 'Brand & accent' },
  { id: 'line', label: 'Lines' },
  { id: 'state', label: 'States' },
];

export interface Theme {
  id: string;
  name: string;
  /** Only the tokens this theme overrides. An absent token falls through to the app's own value,
   *  which is what makes a theme that changes two colours a two-line object rather than a copy. */
  tokens: Partial<Record<TokenName, string>>;
  /** The palette it was generated from, when it was. */
  paletteId?: string | null;
  builtIn?: boolean;
}

/**
 * The app's own skins, offered as starting points.
 *
 * Copied deliberately rather than parsed out of `themes.css` at runtime: the studio would then
 * depend on that file's formatting, and a designer changing a theme here must not be editing the
 * app's live skin. These are a starting point you then diverge from.
 */
export const BUILT_IN_THEMES: Theme[] = [
  {
    id: 'starr-default',
    name: 'Starr (default)',
    builtIn: true,
    tokens: {},   // the app's own values, untouched
  },
  {
    id: 'ocean',
    name: 'Ocean',
    builtIn: true,
    tokens: {
      '--theme-bg-page': '#F0F9FF', '--theme-bg-surface': '#FFFFFF', '--theme-bg-elevated': '#E0F2FE',
      '--theme-fg-primary': '#0C4A6E', '--theme-fg-secondary': '#075985', '--theme-fg-muted': '#0E7490',
      '--theme-accent': '#0369A1', '--theme-accent-fg': '#FFFFFF',
      '--theme-border': '#BAE6FD', '--theme-border-strong': '#38BDF8',
      '--theme-success': '#15803D', '--theme-warning': '#A16207', '--theme-danger': '#B91C1C', '--theme-info': '#0369A1',
      '--color-brand-navy': '#0369A1', '--color-brand-navy-d': '#075985',
      '--color-text-primary': '#0C4A6E', '--color-bg-app': '#F0F9FF', '--color-border': '#BAE6FD',
    },
  },
  {
    id: 'slate-dark',
    name: 'Slate dark',
    builtIn: true,
    tokens: {
      '--theme-bg-page': '#0F172A', '--theme-bg-surface': '#1E293B', '--theme-bg-elevated': '#334155',
      '--theme-fg-primary': '#F1F5F9', '--theme-fg-secondary': '#CBD5E1', '--theme-fg-muted': '#94A3B8',
      '--theme-accent': '#38BDF8', '--theme-accent-fg': '#0F172A',
      '--theme-border': '#334155', '--theme-border-strong': '#475569',
      '--theme-success': '#4ADE80', '--theme-warning': '#FBBF24', '--theme-danger': '#F87171', '--theme-info': '#38BDF8',
      '--color-brand-navy': '#38BDF8', '--color-brand-navy-d': '#0EA5E9',
      '--color-text-primary': '#F1F5F9', '--color-text-secondary': '#CBD5E1', '--color-text-tertiary': '#94A3B8',
      '--color-bg-app': '#0F172A', '--color-bg-card': '#1E293B', '--color-bg-subtle': '#334155',
      '--color-border': '#334155', '--color-border-strong': '#475569',
    },
  },
  {
    id: 'forest-light',
    name: 'Forest',
    builtIn: true,
    tokens: {
      '--theme-bg-page': '#F0FDF4', '--theme-bg-surface': '#FFFFFF', '--theme-bg-elevated': '#DCFCE7',
      '--theme-fg-primary': '#14532D', '--theme-fg-secondary': '#166534', '--theme-fg-muted': '#4D7C0F',
      '--theme-accent': '#15803D', '--theme-accent-fg': '#FFFFFF',
      '--theme-border': '#BBF7D0', '--theme-border-strong': '#4ADE80',
      '--theme-success': '#15803D', '--theme-warning': '#A16207', '--theme-danger': '#B91C1C', '--theme-info': '#0369A1',
      '--color-brand-navy': '#15803D', '--color-brand-navy-d': '#14532D',
      '--color-text-primary': '#14532D', '--color-bg-app': '#F0FDF4', '--color-border': '#BBF7D0',
    },
  },
  {
    id: 'plum',
    name: 'Plum',
    builtIn: true,
    tokens: {
      '--theme-bg-page': '#FAF5FF', '--theme-bg-surface': '#FFFFFF', '--theme-bg-elevated': '#F3E8FF',
      '--theme-fg-primary': '#3B0764', '--theme-fg-secondary': '#6B21A8', '--theme-fg-muted': '#9333EA',
      '--theme-accent': '#7E22CE', '--theme-accent-fg': '#FFFFFF',
      '--theme-border': '#E9D5FF', '--theme-border-strong': '#C084FC',
      '--theme-success': '#15803D', '--theme-warning': '#A16207', '--theme-danger': '#B91C1C', '--theme-info': '#7E22CE',
      '--color-brand-navy': '#7E22CE', '--color-brand-navy-d': '#6B21A8',
      '--color-text-primary': '#3B0764', '--color-bg-app': '#FAF5FF', '--color-border': '#E9D5FF',
    },
  },
  {
    id: 'high-contrast-light',
    name: 'High contrast',
    builtIn: true,
    tokens: {
      '--theme-bg-page': '#FFFFFF', '--theme-bg-surface': '#FFFFFF', '--theme-bg-elevated': '#F2F2F2',
      '--theme-fg-primary': '#000000', '--theme-fg-secondary': '#1A1A1A', '--theme-fg-muted': '#404040',
      '--theme-accent': '#0000CC', '--theme-accent-fg': '#FFFFFF',
      '--theme-border': '#000000', '--theme-border-strong': '#000000',
      '--theme-success': '#006600', '--theme-warning': '#7A4F00', '--theme-danger': '#CC0000', '--theme-info': '#0000CC',
      '--color-brand-navy': '#0000CC', '--color-text-primary': '#000000', '--color-text-secondary': '#1A1A1A',
      '--color-text-tertiary': '#404040', '--color-border': '#000000', '--color-bg-app': '#FFFFFF',
    },
  },
];

/** The theme as a style object React can spread onto the artboard. */
export function themeStyle(theme: Theme | null): Record<string, string> {
  if (!theme) return {};
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme.tokens)) {
    if (value) style[name] = value;
  }
  return style;
}

/** The same map as a CSS block, for the exported file's `:root`. */
export function themeCss(theme: Theme | null, selector = ':root'): string {
  if (!theme || Object.keys(theme.tokens).length === 0) return '';
  const lines = Object.entries(theme.tokens)
    .filter(([, v]) => !!v)
    .map(([name, value]) => `  ${name}: ${value};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
}

// ── CONTRAST ────────────────────────────────────────────────────────────────────────────────────

/** The pairs that have to be readable for a theme to be usable at all. */
export const CONTRAST_PAIRS: Array<{ fg: TokenName; bg: TokenName; label: string; large?: boolean }> = [
  { fg: '--theme-fg-primary', bg: '--theme-bg-page', label: 'Primary text on the page' },
  { fg: '--theme-fg-primary', bg: '--theme-bg-surface', label: 'Primary text on a card' },
  { fg: '--theme-fg-secondary', bg: '--theme-bg-surface', label: 'Secondary text on a card' },
  { fg: '--theme-fg-muted', bg: '--theme-bg-surface', label: 'Muted text on a card' },
  { fg: '--theme-accent-fg', bg: '--theme-accent', label: 'Text on an accent button' },
  { fg: '--theme-danger', bg: '--theme-bg-surface', label: 'Danger text on a card' },
];

export interface ContrastFinding {
  label: string;
  ratio: number;
  needed: number;
  fg: string;
  bg: string;
}

/**
 * Every readability problem in a theme.
 *
 * A theme that looks lovely and cannot be read is the failure mode of every colour picker ever
 * built, and it is invisible in a swatch grid — two colours look fine side by side and are unusable
 * as text on background.
 */
export function themeContrastProblems(theme: Theme, resolve: (token: TokenName) => string): ContrastFinding[] {
  const out: ContrastFinding[] = [];
  for (const pair of CONTRAST_PAIRS) {
    const fg = theme.tokens[pair.fg] ?? resolve(pair.fg);
    const bg = theme.tokens[pair.bg] ?? resolve(pair.bg);
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    if (ratio === null) continue;
    const needed = pair.large ? 3 : 4.5;
    if (ratio < needed) out.push({ label: pair.label, ratio: Math.round(ratio * 10) / 10, needed, fg, bg });
  }
  return out;
}

/** Is this colour dark enough that white text belongs on it? */
export function prefersLightText(colour: string): boolean {
  const white = contrastRatio('#FFFFFF', colour) ?? 1;
  const black = contrastRatio('#000000', colour) ?? 1;
  return white >= black;
}

/** A readable foreground for any background — used wherever a theme must not produce unreadable text. */
export function readableOn(background: string): string {
  return prefersLightText(background) ? '#FFFFFF' : '#0F1419';
}

export function isThemeToken(name: string): name is TokenName {
  return THEME_TOKENS.some((t) => t.name === name);
}

/** A theme with every token filled in, for previewing swatches without touching the DOM. */
export function resolvedTokens(theme: Theme, fallback: (token: TokenName) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of THEME_TOKENS) out[token.name] = theme.tokens[token.name] ?? fallback(token.name);
  return out;
}

export { parseColour };
