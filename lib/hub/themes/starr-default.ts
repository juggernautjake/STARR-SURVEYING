// lib/hub/themes/starr-default.ts
//
// Default theme. Matches the existing brand palette + the :root CSS
// fallback in app/styles/themes.css.

import { defineTheme, type ThemeDefinition } from './index';

export const STARR_DEFAULT: ThemeDefinition = {
  id: 'starr-default',
  label: 'Starr Default',
  isDark: false,
  palette: {
    bgPage:       '#F8FAFC',
    bgSurface:    '#FFFFFF',
    bgElevated:   '#F1F5F9',
    fgPrimary:    '#0F172A',
    fgSecondary:  '#475569',
    fgMuted:      '#94A3B8',
    accent:       '#1D3095',
    accentFg:     '#FFFFFF',
    border:       '#E2E8F0',
    borderStrong: '#94A3B8',
    success:      '#10B981',
    warning:      '#F59E0B',
    danger:       '#EF4444',
    info:         '#3B82F6',
  },
};

defineTheme(STARR_DEFAULT);
