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
    muted: '#8a3f7c',
    'muted-2': '#8f5484',
    pink: '#c9146f',      // deep hot pink — also renders the PRIMARY ability's modifier, so it must clear AA
    hotpink: '#b30060',   // deeper hot pink — primary accent/value text on the pale panels
    violet: '#8425e0',
    'violet-2': '#7d2ecf',
    // "teal"/"tealbright" are repurposed away from cyan: teal → purple accent,
    // tealbright → a deep gold that stays legible on the light panels (it backs
    // links, ability mods, table headers, etc. in the base sheet).
    teal: '#9b3fd0',
    tealbright: '#8a5e04', // deep gold — 5.9:1 on the pale panel (it backs links, ability mods, table headers)
    gold: '#966c00',      // 5.2:1 on the pale panel
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
    'muted-2': '#6f5a68', // labels — ~6.4:1
    pink: '#c2186b',      // deep bubblegum — a fill, but .apill.primary .am renders it as TEXT, so it must clear AA
    hotpink: '#c2185b',   // deep raspberry — primary accent/value text, ~5.4:1
    violet: '#7b2cbf',    // grape accent, ~6.1:1
    'violet-2': '#5b1f94',
    // repurposed away from cyan → candy teal (bg) + a legible deep teal (link/mod/table text)
    teal: '#17b3a3',
    tealbright: '#0a6b5d', // link/mod/term teal — 6.2:1 on cream, clears AA on the mint panel too
    gold: '#8f5a06',       // amber — 6.1:1, clears AA on its own tint
    danger: '#ad1f3d',    // ~5.9:1
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
    muted: '#524c3f',     // ~7.8:1 (AA)
    'muted-2': '#6b6455',  // labels — ~6.0:1
    // The `pink`/`hotpink` token NAMES are the engine's, not the look: for Jack they carry a
    // moss green. Every rgba() fill in the base sheet is derived from these (see the
    // `--<token>-rgb` triplets), so nothing on his sheet renders pink.
    pink: '#496040',      // sage — also renders the PRIMARY ability's modifier, so it must clear AA as text
    hotpink: '#35593a',   // primary accent — section nums, values, headers (7.2:1 on the card, 4.9:1 on its own 12% tint)
    violet: '#6b665e',    // stone grey (structure/lines)
    'violet-2': '#4a4640',
    teal: '#6f7f6a',      // muted green (background fill)
    tealbright: '#33513f', // link/mod/term green — ~8:1 on the card, clears AA on its own tint
    gold: '#6b5220',      // bronze — 7.4:1 on the card, 6.0:1 on its own 10% tint
    danger: '#8d3225',    // muted brick — 5.6:1, clears AA on its own tint
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

// ── Colour themes per template (Area TH) ────────────────────────────────────────────────────────────
// Alternate palettes for the DEFAULT (Hextech) skin — same readable deep-navy grounds + parchment ink as
// `hextechTheme` (so contrast is preserved by construction), only the ACCENT hues change. Each is a LoL-region
// flavour. A character picks one; `themeVariantsFor` lists the options for a skin. Grounds/ink kept identical
// to hextech guarantees the TH4 contrast guard passes without re-tuning text legibility per palette.
const HEXTECH_GROUNDS = {
  void: '#010a13', 'void-2': '#04121f', panel: '#0a1626', 'panel-2': '#0e1e30', 'panel-3': '#12283f',
  ink: '#f0e6d2', muted: '#a09b8c', 'muted-2': '#7a8794', danger: '#c8413f',
} as const;

// Shadow Isles — ghostly emerald energy, spectral green-gold.
export const hextechShadowIsles: SheetTheme = {
  colors: {
    ...HEXTECH_GROUNDS,
    pink: '#37d9a6', hotpink: '#1fb98a', violet: '#0d5a4e', 'violet-2': '#2a8f6f',
    teal: '#37d9a6', tealbright: '#5cffcf', gold: '#9fe8b0', good: '#5cffcf',
    line: 'rgba(55, 217, 166, 0.26)', 'line-strong': 'rgba(55, 217, 166, 0.5)',
  },
  fonts: hextechTheme.fonts,
};
// Noxus — imperial crimson + ash-steel.
export const hextechNoxus: SheetTheme = {
  colors: {
    ...HEXTECH_GROUNDS,
    pink: '#e0576a', hotpink: '#c8323f', violet: '#7a1f28', 'violet-2': '#a83a44',
    teal: '#d98a45', tealbright: '#ffb066', gold: '#d9a441', good: '#0acb8f',
    line: 'rgba(200, 50, 63, 0.28)', 'line-strong': 'rgba(200, 50, 63, 0.55)',
  },
  fonts: hextechTheme.fonts,
};
// Freljord — frozen ice-cyan + frost-silver.
export const hextechFreljord: SheetTheme = {
  colors: {
    ...HEXTECH_GROUNDS,
    pink: '#7fd3ff', hotpink: '#38a9e6', violet: '#1d4e78', 'violet-2': '#3a86c0',
    teal: '#5ac8e0', tealbright: '#a6ecff', gold: '#cfe6f2', good: '#5cffcf',
    line: 'rgba(56, 169, 230, 0.28)', 'line-strong': 'rgba(56, 169, 230, 0.55)',
  },
  fonts: hextechTheme.fonts,
};

/** One selectable colour theme: a stable key, a human label, and the SheetTheme it applies. */
export interface ThemeVariant { key: string; label: string; theme: SheetTheme }

const HEXTECH_VARIANTS: ThemeVariant[] = [
  { key: 'hextech', label: 'Hextech Gold', theme: hextechTheme },
  { key: 'shadow-isles', label: 'Shadow Isles', theme: hextechShadowIsles },
  { key: 'noxus', label: 'Noxus Crimson', theme: hextechNoxus },
  { key: 'freljord', label: 'Freljord Ice', theme: hextechFreljord },
];
const STREAMER_VARIANTS: ThemeVariant[] = [
  { key: 'pink', label: 'Bubblegum', theme: streamerTheme },
  { key: 'blue', label: 'Aqua', theme: streamerThemeBlue },
];

/** The colour themes available for a given skin (Area TH2). Every template gets at least its own theme; the
 *  default (Hextech) skin offers a 4-palette set, the streamer its pink/blue pair. Unknown skins fall back to
 *  the Hextech set so a character always has choices. */
export function themeVariantsFor(skin?: string): ThemeVariant[] {
  switch (skin) {
    case 'hextech': return HEXTECH_VARIANTS;
    case 'streamer': return STREAMER_VARIANTS;
    case 'donata': return [{ key: 'donata', label: 'Mojo Bazaar', theme: donataTheme }];
    case 'rulebook': return [{ key: 'rangor', label: 'Rulebook', theme: rangorTheme }];
    // The base sheet (skin undefined) keeps its single neon theme — no mismatched picker of another skin's
    // palettes. Only skins with a real multi-palette set (hextech, streamer) surface a theme picker.
    default: return [{ key: 'lazzuh', label: 'Neon', theme: lazzuhTheme }];
  }
}

/** Resolve a theme by (skin, key) — the persistence seam for the picker (TH3). Falls back to the skin's first
 *  variant when the key is missing/unknown, so a bad stored value never breaks the sheet. */
export function resolveThemeVariant(skin: string | undefined, key: string | undefined): ThemeVariant {
  const variants = themeVariantsFor(skin);
  return variants.find((v) => v.key === key) ?? variants[0];
}

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
