// app/dnd/_sheet/theme.ts — the sheet theme layer (Phase C7).
//
// The scoped stylesheet (styles/theme.css) drives EVERY color/font off CSS custom
// properties declared on the `.dnd-sheet` root. A SheetTheme is just an override
// map for those tokens; the engine applies it as inline CSS variables on the root,
// which win over the stylesheet defaults (inline > selector). So a new character is
// "a new theme + data", not a fork of the 2,000-line stylesheet — and omitting a
// token falls back to the Lazzuh defaults baked into theme.css.
import type { CSSProperties } from 'react';

export type ThemeColorToken =
  | 'void' | 'void-2' | 'panel' | 'panel-2' | 'panel-3'
  | 'ink' | 'muted' | 'muted-2'
  | 'pink' | 'hotpink' | 'violet' | 'violet-2' | 'teal' | 'tealbright'
  | 'gold' | 'danger' | 'good'
  | 'line' | 'line-strong';

export interface SheetTheme {
  colors?: Partial<Record<ThemeColorToken, string>>;
  fonts?: Partial<Record<'display' | 'body' | 'mono', string>>;
}

// Lazzuh Gun's reference palette + fonts — the exact values baked into theme.css,
// lifted out so they can be swapped per character (and serve as a template).
export const lazzuhTheme: SheetTheme = {
  colors: {
    void: '#080512',
    'void-2': '#0c0818',
    panel: '#130a20',
    'panel-2': '#1b0f30',
    'panel-3': '#241541',
    ink: '#f2ecff',
    muted: '#a99bc9',
    'muted-2': '#8b7fb0',
    pink: '#ff5fb0',
    hotpink: '#ff2d8b',
    violet: '#8b5cf6',
    'violet-2': '#a78bfa',
    teal: '#12b6b6',
    tealbright: '#22e0e0',
    gold: '#ffcc3f',
    danger: '#ff5252',
    good: '#4ade80',
    line: 'rgba(139, 92, 246, 0.28)',
    'line-strong': 'rgba(139, 92, 246, 0.55)',
  },
  fonts: {
    display: "'Oswald', 'Arial Narrow', sans-serif",
    body: "'Barlow Condensed', 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Consolas', monospace",
  },
};

// Nova Vex — the peppy, hot-pink digital-being streamer (§6.9). She reads as a
// creature made of bright-pink pixels (a happy, neon Cortana), so her palette leans
// into hot magenta + holographic cyan on a deep indigo "screen" void. The pixel/CRT
// texture, scanlines, glitch and 8-bit fonts come from the `skin-nova` class in
// theme.css; these tokens carry the color/typography half of the look.
export const novaTheme: SheetTheme = {
  colors: {
    void: '#0a0616',
    'void-2': '#0f0820',
    panel: '#170a26',
    'panel-2': '#210f38',
    'panel-3': '#301652',
    ink: '#ffe9f8',
    muted: '#d59ad9',
    'muted-2': '#b07fc4',
    pink: '#ff5fc8',
    hotpink: '#ff2d9e',
    violet: '#c74bff',
    'violet-2': '#e59bff',
    // "teal" is repurposed as Nova's holographic cyan — the second neon.
    teal: '#22c9ff',
    tealbright: '#7af0ff',
    gold: '#ffd94b',
    danger: '#ff4d74',
    good: '#4dffcf',
    line: 'rgba(255, 45, 158, 0.30)',
    'line-strong': 'rgba(255, 45, 158, 0.62)',
  },
  fonts: {
    // Pixelify Sans reads as clean pixel-art at display sizes; VT323 is a CRT
    // terminal face for the HUD/mono bits; Chakra Petch keeps body copy techy but
    // legible. All three are imported at the top of theme.css.
    display: "'Pixelify Sans', 'Oswald', 'Arial Narrow', sans-serif",
    body: "'Chakra Petch', 'Barlow Condensed', 'Segoe UI', sans-serif",
    mono: "'VT323', 'JetBrains Mono', 'Consolas', monospace",
  },
};

// Map a SheetTheme to the CSS custom properties theme.css consumes. Returns a
// style object suitable for the `.dnd-sheet` root; an empty/undefined theme yields
// no overrides (the stylesheet's Lazzuh defaults apply).
export function themeToCssVars(theme?: SheetTheme | null): CSSProperties {
  const vars: Record<string, string> = {};
  if (theme?.colors) {
    for (const [token, value] of Object.entries(theme.colors)) {
      if (value) vars[`--${token}`] = value;
    }
  }
  if (theme?.fonts?.display) vars['--font-display'] = theme.fonts.display;
  if (theme?.fonts?.body) vars['--font-body'] = theme.fonts.body;
  if (theme?.fonts?.mono) vars['--font-mono'] = theme.fonts.mono;
  return vars as CSSProperties;
}
