// lib/hub/themes/high-contrast-light.ts
//
// WCAG AAA accessibility theme. Pure white surfaces, pure black text,
// pure blue accent (one of the historical "system link" colours that
// every screen-reader user is trained to recognise). Designed for
// low-vision + colour-deficient users; renders shadows as none and
// borders as thick.

import { defineTheme, type ThemeDefinition } from './index';

export const HIGH_CONTRAST_LIGHT: ThemeDefinition = {
  id: 'high-contrast-light',
  label: 'High Contrast',
  isDark: false,
  palette: {
    bgPage:       '#FFFFFF',
    bgSurface:    '#FFFFFF',
    bgElevated:   '#FFFFFF',
    fgPrimary:    '#000000',
    fgSecondary:  '#000000',
    fgMuted:      '#222222',
    accent:       '#0000EE',
    accentFg:     '#FFFFFF',
    border:       '#000000',
    borderStrong: '#000000',
    success:      '#006400',
    warning:      '#664D00',
    danger:       '#8B0000',
    info:         '#000080',
  },
};

defineTheme(HIGH_CONTRAST_LIGHT);
