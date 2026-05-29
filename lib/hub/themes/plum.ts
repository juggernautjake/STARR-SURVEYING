// lib/hub/themes/plum.ts
//
// Distinctive light theme with purple accents. For users who want a
// hub that doesn't look like every other admin dashboard.

import { defineTheme, type ThemeDefinition } from './index';

export const PLUM: ThemeDefinition = {
  id: 'plum',
  label: 'Plum',
  isDark: false,
  palette: {
    bgPage:       '#FAF5FF',
    bgSurface:    '#FFFFFF',
    bgElevated:   '#F3E8FF',
    fgPrimary:    '#581C87',
    fgSecondary:  '#6B21A8',
    fgMuted:      '#9333EA',
    accent:       '#7E22CE',
    accentFg:     '#FFFFFF',
    border:       '#E9D5FF',
    borderStrong: '#C084FC',
    success:      '#15803D',
    warning:      '#A16207',
    danger:       '#B91C1C',
    info:         '#1D4ED8',
  },
};

defineTheme(PLUM);
