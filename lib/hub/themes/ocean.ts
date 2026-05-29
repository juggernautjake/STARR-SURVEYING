// lib/hub/themes/ocean.ts
//
// Cool light theme. Reading-friendly, calm sky-blue accents.

import { defineTheme, type ThemeDefinition } from './index';

export const OCEAN: ThemeDefinition = {
  id: 'ocean',
  label: 'Ocean',
  isDark: false,
  palette: {
    bgPage:       '#F0F9FF',
    bgSurface:    '#FFFFFF',
    bgElevated:   '#E0F2FE',
    fgPrimary:    '#0C4A6E',
    fgSecondary:  '#075985',
    fgMuted:      '#0891B2',
    accent:       '#0369A1',
    accentFg:     '#FFFFFF',
    border:       '#BAE6FD',
    borderStrong: '#38BDF8',
    success:      '#15803D',
    warning:      '#A16207',
    danger:       '#B91C1C',
    info:         '#0369A1',
  },
};

defineTheme(OCEAN);
