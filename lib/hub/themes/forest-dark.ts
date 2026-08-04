// lib/hub/themes/forest-dark.ts
//
// The night half of `forest-light`. Same earthy identity, dark ground.
//
// ── WHY THIS FILE DID NOT EXIST UNTIL 2026-08-04 ────────────────────────────────────────────────
//
// `forest-dark` has been a valid `BuiltinThemeId` since the theme system shipped — and it had no
// palette in **either** of the two places a palette lives: no `[data-theme="forest-dark"]` block in
// `app/styles/themes.css`, and no file here. `register-builtins.ts` even said so out loud —
// *"All 10 built-in themes registered"* — beside a type that declares eleven.
//
// So the id was offered, selected, saved to the database, and rendered as the light fallback.
// Choosing a theme and seeing nothing change is indistinguishable from a broken picker, and it is
// why the owner asked whether the themes were "actually built out".
//
// **Two sources for one palette is why it could hide.** The CSS block is what paints; this registry
// is what the picker lists and what `useThemeColors()` reads. A theme missing from one of them is
// wrong in a way the other cannot reveal — the CSS gap made it render as default, and the registry
// gap made it absent from `allThemes()`. `theme-vars-are-adopted.test.ts` now checks the declared
// ids against the CSS, and the registry test checks them against this folder.
//
// ── THE COLOURS ─────────────────────────────────────────────────────────────────────────────────
//
// forest-light's hues at dark-theme luminance, following `slate-dark`'s structure so the two dark
// themes read as siblings. Greens are desaturated for a dark ground — a saturated green on
// near-black vibrates — and the status colours are taken from the other dark themes rather than
// re-picked, because a danger red that differs per theme is a hazard rather than a flourish.
//
// Verified against WCAG AA: fgPrimary/fgSecondary on both bgSurface and bgPage.

import { defineTheme, type ThemeDefinition } from './index';

export const FOREST_DARK: ThemeDefinition = {
  id: 'forest-dark',
  label: 'Forest Night',
  isDark: true,
  palette: {
    bgPage:       '#0C1410',
    bgSurface:    '#14211A',
    bgElevated:   '#1C2E24',
    fgPrimary:    '#ECFDF5',
    fgSecondary:  '#BBF7D0',
    fgMuted:      '#86AF97',
    accent:       '#4ADE80',
    accentFg:     '#0C1410',
    border:       '#1C2E24',
    borderStrong: '#3F6B51',
    success:      '#34D399',
    warning:      '#FBBF24',
    danger:       '#F87171',
    info:         '#60A5FA',
  },
};

defineTheme(FOREST_DARK);
