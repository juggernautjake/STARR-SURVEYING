// lib/dnd/sheet-styles.ts — the browsable sheet-style catalog (Phase V, Slice 7).
//
// A small, server+client-safe list of the picker-selectable `sheet_type` styles (the
// registry skins) with a preview palette for the gallery — decoupled from the heavy
// `_sheet` React engine so both the API (to validate a chosen `sheet_type`) and the
// browser UI can import it. NPCs can pick any of them too. `custom` (AI-built) is
// intentionally NOT here — it's generated, not picked.
//
// ── "EVERY STYLE WORKS WITH EVERY GAME SYSTEM" — TRUE, WITH ONE MEASURED EXCEPTION ──────────────
//
// That sentence used to stand unqualified here. It is right about what a style mostly IS: the
// tokens travel to every system, so a Pathfinder or Intuitive Games sheet picking `streamer`
// genuinely recolours — `skinHxVars` feeds the bespoke panels' `--hx-*`, `shellThemeVars` feeds the
// shared shells, and `skinAccents.css` adds the CRT scanline.
//
// What does NOT travel is the streamer's bespoke treatment. `theme.css` carries **91**
// `.dnd-sheet.skin-streamer` rules, and every one needs both classes on the same element — while the
// PF2 and IG roots carry `sheet-shell` without `dnd-sheet`, deliberately (T-SHELL-SCOPE: those broad
// element rules must not bleed onto bespoke panels). Measured 2026-08-04.
//
// So on a bespoke sheet `streamer` is a palette, and on a 5e sheet it is a palette plus 91 rules of
// broadcast styling. That gap is P14-11, and it is not closed by adding `dnd-sheet` to those roots —
// see `__tests__/dnd/shell-scope-is-deliberate.test.ts` for why that is the wrong fix.
export interface SheetStyle {
  id: string;
  label: string;
  blurb: string;
  /** Preview swatches for the gallery card (bg, panel, accent, gold/secondary). */
  swatch: { bg: string; panel: string; accent: string; gold: string };
  /** true = a light-grounded skin (affects the preview card's text color). */
  light?: boolean;
}

export const SHEET_STYLES: SheetStyle[] = [
  {
    id: 'default',
    label: 'Hextech',
    blurb: 'The site default — a League-of-Legends Hextech look: deep Piltover navy, teal energy, engraved gold.',
    swatch: { bg: '#010a13', panel: '#0e1e30', accent: '#0ac8b9', gold: '#c8aa6e' },
  },
  {
    id: 'lazzuh',
    label: 'Neon Odyssey',
    blurb: 'Void-black space-tech with hot-pink & cyan neon. Bold, high-contrast, sci-fi.',
    swatch: { bg: '#080512', panel: '#1b0f30', accent: '#ff2d8b', gold: '#22e0e0' },
  },
  {
    id: 'streamer',
    label: 'Magical Streamer',
    blurb: 'Bright pixel/CRT magical-girl broadcaster — white & hot pink with gold. A light theme.',
    swatch: { bg: '#fff0fa', panel: '#fdeaf8', accent: '#ff1e9c', gold: '#e0a400' },
    light: true,
  },
  {
    id: 'donata',
    label: 'Candy Bazaar',
    blurb: 'Warm parchment scrapbook with berry, mint & grape candy accents. A light theme.',
    swatch: { bg: '#fdf4e3', panel: '#fffef9', accent: '#c2185b', gold: '#b8730a' },
    light: true,
  },
  {
    id: 'jack',
    label: 'Homebrew Rulebook',
    blurb: 'A printed-page look: aged parchment, burnt-orange headers, green keywords, bordered tables.',
    swatch: { bg: '#efe7d6', panel: '#fbf6ea', accent: '#b5501f', gold: '#a9781a' },
    light: true,
  },
];

const SELECTABLE = new Set(SHEET_STYLES.map((s) => s.id));

/** True when `id` is a style the user is allowed to pick via the browser (Slice 7). The
 *  AI-only `custom` and the internal `generic` alias are deliberately excluded. */
export function isSelectableSheetStyle(id: unknown): boolean {
  return typeof id === 'string' && SELECTABLE.has(id);
}
