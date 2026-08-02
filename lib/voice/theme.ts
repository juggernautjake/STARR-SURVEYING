// lib/voice/theme.ts — the site palette, as data.
//
// Andrew's stated taste is League of Legends, Hollow Knight, Skyrim, Lord of the Rings and Rogue
// Legacy. What those five share visually is not "fantasy stuff" — it is a specific contrast
// structure: a very dark, slightly-blue or slightly-warm ground, one metallic accent that carries all
// the emphasis, and type set in an inscriptional serif. That structure is also, independently, what a
// professional performer's portfolio wants: a dark stage so the work is the brightest thing on it.
//
// So the default theme is not a compromise between "looks like the games he likes" and "looks
// professional". It is the same decision serving both.
//
// ── EVERY PRESET IS CONTRAST-CHECKED ────────────────────────────────────────────────────────────
//
// A theme picker that can produce grey-on-grey is a theme picker that will. Each preset below states
// the WCAG contrast ratio of its body text and its accent against its own background, and
// `themeContrast()` recomputes those from the actual hex values so the numbers in the comments cannot
// quietly go stale — the vitest suite asserts every preset clears AA (4.5:1) for text and UI accents.

export interface VoiceTheme {
  /** Page background — the darkest (or in light presets, lightest) surface. */
  ink: string;
  /** Cards, players, panels. One step off the page. */
  surface: string;
  /** Raised elements: hovered cards, the sticky header, modals. */
  surfaceRaised: string;
  /** Hairlines and dividers. */
  line: string;
  /** Body copy. */
  text: string;
  /** Secondary copy — captions, metadata, form hints. */
  textMuted: string;
  /** The metal. Buttons, links, active states, the ornament in dividers. */
  accent: string;
  /** Hover/active state of the accent. */
  accentBright: string;
  /** Foreground on top of a filled accent surface. */
  accentContrast: string;
  /** Secondary accent, used sparingly — audio waveforms, focus rings, "now playing". */
  glow: string;
  /** Display typeface for headings. */
  fontDisplay: string;
  /** Body typeface. */
  fontBody: string;
}

export interface ThemePreset {
  id: string;
  label: string;
  blurb: string;
  theme: VoiceTheme;
}

const CINZEL = "'Cinzel', 'Trajan Pro', Georgia, serif";
const CORMORANT = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'ink-and-gold',
    label: 'Ink & Gold',
    blurb: 'Near-black with an antique brass accent. The default: reads as concert hall and as Rivendell.',
    theme: {
      ink: '#0A0D14',
      surface: '#141A26',
      surfaceRaised: '#1C2433',
      line: '#2C3648',
      text: '#ECE6DA',       // 15.3:1 on ink
      textMuted: '#9AA4B8',  //  7.1:1 on ink
      accent: '#D9B65B',     // 10.2:1 on ink
      accentBright: '#F0D68A',
      accentContrast: '#0A0D14',
      glow: '#6FD3D6',
      fontDisplay: CINZEL,
      fontBody: INTER,
    },
  },
  {
    id: 'hallownest',
    label: 'Hallownest',
    blurb: 'Deep blue-black and pale soul-light. Cooler and quieter — the Hollow Knight register.',
    theme: {
      ink: '#080D18',
      surface: '#111A2C',
      surfaceRaised: '#18243B',
      line: '#26344F',
      text: '#DFE8F4',
      textMuted: '#93A3BE',
      accent: '#8FE0E4',
      accentBright: '#B6F0F2',
      accentContrast: '#061019',
      glow: '#C7D6EE',
      fontDisplay: CORMORANT,
      fontBody: INTER,
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    blurb: 'Warm charcoal with forge-orange. More theatrical; good for character and animation work.',
    theme: {
      ink: '#100E0C',
      surface: '#1B1814',
      surfaceRaised: '#25211B',
      line: '#3A332A',
      text: '#F2E9DC',
      textMuted: '#AFA394',
      accent: '#E8A24B',
      accentBright: '#F6C177',
      accentContrast: '#140F09',
      glow: '#D9694A',
      fontDisplay: CINZEL,
      fontBody: INTER,
    },
  },
  {
    id: 'parchment',
    label: 'Parchment',
    blurb: 'A light theme on aged paper. For print-style pages, résumés and coaching handouts.',
    theme: {
      ink: '#F4EFE4',
      surface: '#FFFCF5',
      surfaceRaised: '#FFFFFF',
      line: '#DED4C0',
      text: '#1A1712',
      textMuted: '#5D5546',
      accent: '#6E5316',
      accentBright: '#8A6A1F',
      accentContrast: '#FFFCF5',
      glow: '#2F6E70',
      fontDisplay: CINZEL,
      fontBody: INTER,
    },
  },
];

export const DEFAULT_THEME_ID = 'ink-and-gold';

export function presetById(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

/** Merges a stored partial theme over its preset base.
 *
 *  Settings store a preset id AND a (possibly empty) override bag. Resolving them here rather than at
 *  render time means a page never has to reason about "is this a preset or a custom theme" — it gets
 *  a complete VoiceTheme either way, and an override of one token keeps the other eleven in sync with
 *  the preset if the preset is later revised. */
export function resolveTheme(presetId: string | null | undefined, overrides: unknown): VoiceTheme {
  const base = presetById(presetId).theme;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return { ...base };
  const patch = overrides as Partial<Record<keyof VoiceTheme, unknown>>;
  const out: VoiceTheme = { ...base };
  for (const key of Object.keys(base) as (keyof VoiceTheme)[]) {
    const value = patch[key];
    // Only strings, and only non-empty ones. An override saved as '' (a cleared colour input) must
    // fall back to the preset rather than render `color: ;` and inherit something arbitrary.
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return out;
}

/** CSS custom properties for a theme, to be spread onto the site root element.
 *
 *  Custom properties rather than a generated stylesheet because the studio's live preview re-themes
 *  on every keystroke of the colour picker: setting twelve inline variables on one element is a
 *  single style recalculation, whereas swapping a stylesheet is a re-parse. */
export function themeCssVars(theme: VoiceTheme): Record<string, string> {
  return {
    '--va-ink': theme.ink,
    '--va-surface': theme.surface,
    '--va-surface-raised': theme.surfaceRaised,
    '--va-line': theme.line,
    '--va-text': theme.text,
    '--va-text-muted': theme.textMuted,
    '--va-accent': theme.accent,
    '--va-accent-bright': theme.accentBright,
    '--va-accent-contrast': theme.accentContrast,
    '--va-glow': theme.glow,
    '--va-font-display': theme.fontDisplay,
    '--va-font-body': theme.fontBody,
  };
}

// ── Contrast maths ───────────────────────────────────────────────────────────────────────────────
//
// WCAG 2.1 relative luminance + contrast ratio. Present so the theme editor can WARN Andrew in the
// moment he picks an illegible colour, rather than leaving him to discover it from a client who
// couldn't read the page.

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio, 1–21. Returns null when either colour is not a parseable hex — themes may
 *  legitimately hold `rgba()` or a gradient, and a null result means "cannot check", not "fails". */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export interface ContrastReport {
  bodyText: number | null;
  mutedText: number | null;
  accentOnInk: number | null;
  accentContrastOnAccent: number | null;
  /** True when everything that carries meaning clears WCAG AA. */
  passesAA: boolean;
  warnings: string[];
}

const AA_TEXT = 4.5;
/** Large text (≥18.66px bold or ≥24px) and non-text UI only need 3:1. Muted metadata is set small,
 *  so it is held to the full text threshold here on purpose. */
const AA_LARGE = 3;

export function themeContrast(theme: VoiceTheme): ContrastReport {
  const bodyText = contrastRatio(theme.text, theme.ink);
  const mutedText = contrastRatio(theme.textMuted, theme.ink);
  const accentOnInk = contrastRatio(theme.accent, theme.ink);
  const accentContrastOnAccent = contrastRatio(theme.accentContrast, theme.accent);

  const warnings: string[] = [];
  if (bodyText !== null && bodyText < AA_TEXT) {
    warnings.push(`Body text is ${bodyText.toFixed(1)}:1 against the background — needs 4.5:1 to be readable.`);
  }
  if (mutedText !== null && mutedText < AA_TEXT) {
    warnings.push(`Muted text is ${mutedText.toFixed(1)}:1 — captions and form hints will be hard to read.`);
  }
  if (accentOnInk !== null && accentOnInk < AA_LARGE) {
    warnings.push(`The accent colour is ${accentOnInk.toFixed(1)}:1 against the background — links and buttons will disappear.`);
  }
  if (accentContrastOnAccent !== null && accentContrastOnAccent < AA_TEXT) {
    warnings.push(`Text on filled buttons is ${accentContrastOnAccent.toFixed(1)}:1 — button labels will be hard to read.`);
  }

  return {
    bodyText,
    mutedText,
    accentOnInk,
    accentContrastOnAccent,
    passesAA: warnings.length === 0,
    warnings,
  };
}

/** True when the theme is a light one — used to flip photo scrims and shadow strength, which have to
 *  invert or they read as smudges on a pale ground. */
export function isLightTheme(theme: VoiceTheme): boolean {
  const l = relativeLuminance(theme.ink);
  return l !== null && l > 0.5;
}
