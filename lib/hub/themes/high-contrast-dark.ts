// lib/hub/themes/high-contrast-dark.ts
//
// WCAG AAA accessibility dark theme. Pure black surfaces, pure white
// text, pure yellow accent. Same thick-border / shadow-less treatment
// as the light variant.

import { defineTheme, type ThemeDefinition } from './index';

export const HIGH_CONTRAST_DARK: ThemeDefinition = {
  id: 'high-contrast-dark',
  label: 'High Contrast Dark',
  isDark: true,
  palette: {
    bgPage:       '#000000',
    bgSurface:    '#000000',
    bgElevated:   '#000000',
    fgPrimary:    '#FFFFFF',
    fgSecondary:  '#FFFFFF',
    fgMuted:      '#DDDDDD',
    accent:       '#FFFF00',
    accentFg:     '#000000',
    border:       '#FFFFFF',
    borderStrong: '#FFFFFF',
    success:      '#00FF00',
    warning:      '#FFA500',
    danger:       '#FF6464',
    info:         '#87CEEB',
  },
};

defineTheme(HIGH_CONTRAST_DARK);
