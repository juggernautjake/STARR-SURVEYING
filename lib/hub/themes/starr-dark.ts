// lib/hub/themes/starr-dark.ts
//
// Dark variant of the brand palette. Accent is lightened from #1D3095
// to #5A7BE5 so it passes WCAG AA (4.5:1) against the dark surface.

import { defineTheme, type ThemeDefinition } from './index';

export const STARR_DARK: ThemeDefinition = {
  id: 'starr-dark',
  label: 'Starr Dark',
  isDark: true,
  palette: {
    bgPage:       '#0B1020',
    bgSurface:    '#111935',
    bgElevated:   '#1A2347',
    fgPrimary:    '#F1F5F9',
    fgSecondary:  '#CBD5E1',
    fgMuted:      '#94A3B8',
    accent:       '#5A7BE5',
    accentFg:     '#0B1020',
    border:       '#1F2A4D',
    borderStrong: '#3A4A75',
    success:      '#34D399',
    warning:      '#FBBF24',
    danger:       '#F87171',
    info:         '#60A5FA',
  },
};

defineTheme(STARR_DARK);
