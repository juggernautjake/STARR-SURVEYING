// lib/hub/themes/forest-light.ts
//
// Earthy light theme. Fits the surveyor outdoor identity. Greens
// chosen so accent text passes AA against white surface.

import { defineTheme, type ThemeDefinition } from './index';

export const FOREST_LIGHT: ThemeDefinition = {
  id: 'forest-light',
  label: 'Forest',
  isDark: false,
  palette: {
    bgPage:       '#F0FDF4',
    bgSurface:    '#FFFFFF',
    bgElevated:   '#DCFCE7',
    fgPrimary:    '#14532D',
    fgSecondary:  '#166534',
    fgMuted:      '#65A30D',
    accent:       '#15803D',
    accentFg:     '#FFFFFF',
    border:       '#BBF7D0',
    borderStrong: '#4ADE80',
    success:      '#15803D',
    warning:      '#CA8A04',
    danger:       '#B91C1C',
    info:         '#1D4ED8',
  },
};

defineTheme(FOREST_LIGHT);
