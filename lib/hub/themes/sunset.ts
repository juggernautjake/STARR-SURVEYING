// lib/hub/themes/sunset.ts
//
// Warm light theme. AM-leaning energy — orange accents, off-white
// surfaces.

import { defineTheme, type ThemeDefinition } from './index';

export const SUNSET: ThemeDefinition = {
  id: 'sunset',
  label: 'Sunset',
  isDark: false,
  palette: {
    bgPage:       '#FFF7ED',
    bgSurface:    '#FFFFFF',
    bgElevated:   '#FFEDD5',
    fgPrimary:    '#7C2D12',
    fgSecondary:  '#9A3412',
    fgMuted:      '#A16207',
    accent:       '#C2410C',
    accentFg:     '#FFFFFF',
    border:       '#FED7AA',
    borderStrong: '#FB923C',
    success:      '#15803D',
    warning:      '#A16207',
    danger:       '#B91C1C',
    info:         '#1D4ED8',
  },
};

defineTheme(SUNSET);
