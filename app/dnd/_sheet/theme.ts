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

// Hextech default (Phase V, Slice 6b) — the site's League-of-Legends / Hextech look,
// meant to REPLACE the Lazzuh purple-alien as the neutral default sheet for new PCs and
// NPCs. A DARK theme (like the base sheet), so token overrides alone read well: deep
// Piltover navy grounds, Hextech teal/cyan energy, and engraved gold accents. Paired
// with the `.skin-hextech` CSS in theme.css (hex frames, gold rules, teal glow) and an
// engraved-serif display face. `teal`/`tealbright` stay cyan here (Hextech energy), so
// the base sheet's link/mod/table-header treatment lands on-theme with no repurposing.
export const hextechTheme: SheetTheme = {
  colors: {
    void: '#010a13',       // Piltover deep navy page
    'void-2': '#04121f',
    panel: '#0a1626',      // hex-panel card
    'panel-2': '#0e1e30',
    'panel-3': '#12283f',
    ink: '#f0e6d2',        // Hextech parchment-gold text (LoL UI body)
    muted: '#a09b8c',      // warm stone (LoL secondary text)
    'muted-2': '#7a8794',
    pink: '#0ac8b9',       // repurposed to Hextech teal (used as accent fills)
    hotpink: '#0397ab',    // deep Hextech teal — primary accent/value text
    violet: '#005a82',     // Hextech blue depth
    'violet-2': '#0a7ea4',
    teal: '#0ac8b9',       // Hextech energy cyan (links/mods)
    tealbright: '#00e0d3',
    gold: '#c8aa6e',       // engraved Hextech gold (LoL signature)
    danger: '#c8413f',
    good: '#0acb8f',
    line: 'rgba(200, 170, 110, 0.28)',      // gold hairline
    'line-strong': 'rgba(10, 200, 185, 0.5)', // teal energy border
  },
  fonts: {
    // Cinzel = engraved Roman serif for the Hextech display headings (LoL title feel);
    // Spectral = a refined serif body; JetBrains Mono for stat/HUD figures. Cinzel +
    // Spectral are @imported in theme.css.
    display: "'Cinzel', 'Trajan Pro', Georgia, serif",
    body: "'Spectral', 'Georgia', 'Segoe UI', serif",
    mono: "'JetBrains Mono', 'Consolas', monospace",
  },
};

// Streamer skin (§6.9) — a bright, peppy magical-girl broadcaster palette (worn by
// xxRainbowKittenUwU37xx): white + hot pink with gold and purple accents. It's a
// LIGHT theme, so `void`/`panel` are pale and `ink` is a deep plum for readable text;
// the `skin-streamer` class in theme.css flips the base sheet's hardcoded white
// headings to `ink` and layers the pixel/CRT texture on top.
export const streamerTheme: SheetTheme = {
  colors: {
    // A BRIGHT "magical-girl broadcast" palette: white + hot pink with gold and
    // purple accents. It's a light theme, so `void`/`panel` are pale and `ink` is a
    // deep plum for readable text; the `skin-streamer` CSS flips the base sheet's
    // hardcoded white headings to `ink` to suit.
    void: '#fff0fa',
    'void-2': '#ffe8f6',
    panel: '#fffafe',
    'panel-2': '#fdeaf8',
    'panel-3': '#f5e2ff',
    ink: '#5a1050',
    muted: '#a24f92',
    'muted-2': '#b877ab',
    pink: '#ff4fb8',
    hotpink: '#ff1e9c',
    violet: '#a94dff',
    'violet-2': '#7d2ecf',
    // "teal"/"tealbright" are repurposed away from cyan: teal → purple accent,
    // tealbright → a deep gold that stays legible on the light panels (it backs
    // links, ability mods, table headers, etc. in the base sheet).
    teal: '#9b3fd0',
    tealbright: '#c98a0a',
    gold: '#e0a400',
    danger: '#e5344f',
    good: '#1c9e63',
    line: 'rgba(255, 30, 156, 0.30)',
    'line-strong': 'rgba(255, 30, 156, 0.58)',
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

// Donata Dime — the bespoke "Mojo Bazaar" MLM skin (worn only by Donata). A classic-Neopets
// candy-scrapbook vibe: warm parchment/cream grounds, berry + mint + grape candy accents, and
// a deep-plum ink so text stays crisply readable everywhere. Deliberately NOT Lazzuh's dark
// neon nor the streamer's pixel/CRT pink. All tokens are contrast-checked for AA+ on the cream
// panels; saturated tokens are used as BACKGROUNDS only where the skin-donata CSS sets an
// explicit readable text color. `teal`/`tealbright` are repurposed away from cyan (they back
// links/mods/table-headers in the base sheet) to a candy teal + a legible deep teal.
// Spec: docs/planning/completed/DND_DONATA_SHEET_REDESIGN_2026-07-09.md
export const donataTheme: SheetTheme = {
  colors: {
    void: '#fdf4e3',      // warm parchment page
    'void-2': '#f8e9c8',
    panel: '#fffef9',     // near-white cream card
    'panel-2': '#fdeef7', // soft berry alt panel
    'panel-3': '#e9f9f1', // soft mint alt panel
    ink: '#3a2140',       // deep plum — ~11:1 on cream (AAA)
    muted: '#6f5566',     // ~5.6:1 (AA)
    'muted-2': '#87707f', // ~4.5:1 (labels only)
    pink: '#ff5fa8',      // bright bubblegum (used as a background fill)
    hotpink: '#c2185b',   // deep raspberry — primary accent/value text, ~5.4:1
    violet: '#7b2cbf',    // grape accent, ~6.1:1
    'violet-2': '#5b1f94',
    // repurposed away from cyan → candy teal (bg) + a legible deep teal (link/mod/table text)
    teal: '#17b3a3',
    tealbright: '#0d8f7e', // ~4.7:1 on cream
    gold: '#b8730a',       // legible amber, ~4.8:1
    danger: '#d12b4e',
    good: '#1c8f57',
    line: 'rgba(123, 44, 191, 0.28)',
    'line-strong': 'rgba(194, 24, 91, 0.5)',
  },
  fonts: {
    // Baloo 2 = chunky, rounded, friendly poster display; Nunito = highly legible rounded body;
    // Space Mono = receipt/fine-print mono. All @imported at the top of theme.css.
    display: "'Baloo 2', 'Fredoka', 'Poppins', sans-serif",
    body: "'Nunito', 'Segoe UI', sans-serif",
    mono: "'Space Mono', 'JetBrains Mono', 'Consolas', monospace",
  },
};

// Jack the Rangor — the bespoke "homebrew rulebook" skin (worn only by Jack). A printed-page look
// like the shared Pugilist PDF, in STONE AND MOSS to match his art: warm grey parchment grounds,
// deep moss-green section headers/keywords/links, stone-grey structure, and a bronze secondary.
// Deliberately NOT dark neon (Lazzuh), pixel/CRT (streamer), or candy (Donata) — and no pink or
// orange anywhere. A LIGHT theme, so void/panel are stone-cream and ink is a warm near-black.
// The engine's token names (`pink`, `hotpink`, `teal`, `violet`) are historical: what matters is
// the value each carries here. Every accent below is checked ≥4.5:1 against the card it sits on.
// Spec: docs/planning/in-progress/DND_JACK_RANGOR_PUGILIST_2026-07-15.md
export const rangorTheme: SheetTheme = {
  colors: {
    void: '#e8e4d9',      // warm stone-grey page
    'void-2': '#dcd7c9',
    panel: '#f6f3ea',     // aged-paper card
    'panel-2': '#ece7d9',
    'panel-3': '#e3ddcc',
    ink: '#232019',       // warm near-black — ~14:1 on the card (AAA)
    muted: '#5f5849',     // ~6.5:1 (AA)
    'muted-2': '#7d7565',  // labels only — ~4.6:1
    // The `pink`/`hotpink` token NAMES are the engine's, not the look: for Jack they carry a
    // moss green. Every rgba() fill in the base sheet is derived from these (see the
    // `--<token>-rgb` triplets), so nothing on his sheet renders pink.
    pink: '#5f7d55',      // sage (translucent fills/tints)
    hotpink: '#3f6b45',   // primary accent — section nums, values, headers (~5.9:1 on the card)
    violet: '#6b665e',    // stone grey (structure/lines)
    'violet-2': '#4a4640',
    teal: '#6f7f6a',      // muted green (background fill)
    tealbright: '#3d5c4a', // link/mod/term green — ~7:1 on the card
    gold: '#8a6a2f',      // bronze — ~5.1:1
    danger: '#a63d2f',    // muted brick
    good: '#3d5c4a',
    line: 'rgba(90, 84, 70, 0.30)',
    'line-strong': 'rgba(63, 107, 69, 0.55)',
  },
  fonts: {
    // Zilla Slab = a sturdy slab-serif for the rulebook section headers; Inter = a clean, highly
    // legible body; JetBrains Mono for the fine print. Zilla Slab + Inter @imported in theme.css.
    display: "'Zilla Slab', 'Bitter', Georgia, serif",
    body: "'Inter', 'Source Sans 3', 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Consolas', monospace",
  },
};

// Blue variant of the streamer skin — the same bright, pixel/CRT look mirrored into
// electric blue + cyan (with gold + white). Paired with `.skin-streamer.variant-blue`
// in theme.css, which swaps the accent triplets + backing colors to match.
export const streamerThemeBlue: SheetTheme = {
  colors: {
    void: '#eef5ff',
    'void-2': '#e2edff',
    panel: '#f8fbff',
    'panel-2': '#e8f1ff',
    'panel-3': '#e2ecff',
    ink: '#0d2a5a',
    muted: '#4f6aa2',
    'muted-2': '#6f88bd',
    pink: '#4f8bff',
    hotpink: '#2b7fff',
    violet: '#22c0ff',
    'violet-2': '#1d6fc0',
    // "teal" → periwinkle accent; "tealbright" → gold (kept legible on light blue).
    teal: '#5a7fd0',
    tealbright: '#c98a0a',
    gold: '#e0a400',
    danger: '#e5344f',
    good: '#1c9e63',
    line: 'rgba(43, 127, 255, 0.30)',
    'line-strong': 'rgba(43, 127, 255, 0.58)',
  },
  fonts: {
    display: "'Pixelify Sans', 'Oswald', 'Arial Narrow', sans-serif",
    body: "'Chakra Petch', 'Barlow Condensed', 'Segoe UI', sans-serif",
    mono: "'VT323', 'JetBrains Mono', 'Consolas', monospace",
  },
};

// Map a SheetTheme to the CSS custom properties theme.css consumes. Returns a
// style object suitable for the `.dnd-sheet` root; an empty/undefined theme yields
// no overrides (the stylesheet's Lazzuh defaults apply).
/** '#b5501f' → '181, 80, 31'. Returns null for non-hex values (rgba()/var() tokens). */
function hexToRgbTriplet(hex: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function themeToCssVars(theme?: SheetTheme | null): CSSProperties {
  const vars: Record<string, string> = {};
  if (theme?.colors) {
    for (const [token, value] of Object.entries(theme.colors)) {
      if (!value) continue;
      vars[`--${token}`] = value;
      // Also expose an "r, g, b" triplet per token so the stylesheet can build translucent
      // fills/glows with rgba(var(--hotpink-rgb), .28) that FOLLOW the character's palette.
      // Without this, rgba() literals in the base sheet (written for the original neon skin)
      // bypass the theme entirely and bleed hot pink onto every other character.
      const rgb = hexToRgbTriplet(value);
      if (rgb) vars[`--${token}-rgb`] = rgb;
    }
  }
  if (theme?.fonts?.display) vars['--font-display'] = theme.fonts.display;
  if (theme?.fonts?.body) vars['--font-body'] = theme.fonts.body;
  if (theme?.fonts?.mono) vars['--font-mono'] = theme.fonts.mono;
  return vars as CSSProperties;
}
