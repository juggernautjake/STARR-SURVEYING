// lib/hub/themes/slate-dark.ts
//
// High-contrast neutral dark theme. Surface stays pure black-adjacent
// so OLED users get the deepest blacks; accent is a light zinc rather
// than a saturated colour so the palette stays "neutral all the way
// down".

import { defineTheme, type ThemeDefinition } from './index';

export const SLATE_DARK: ThemeDefinition = {
  id: 'slate-dark',
  label: 'Slate Dark',
  isDark: true,
  palette: {
    bgPage:       '#0A0A0A',
    bgSurface:    '#171717',
    bgElevated:   '#262626',
    fgPrimary:    '#FAFAFA',
    fgSecondary:  '#D4D4D8',
    fgMuted:      '#A1A1AA',
    accent:       '#D4D4D8',
    accentFg:     '#0A0A0A',
    border:       '#262626',
    borderStrong: '#52525B',
    success:      '#34D399',
    warning:      '#FBBF24',
    danger:       '#F87171',
    info:         '#60A5FA',
  },
};

defineTheme(SLATE_DARK);
