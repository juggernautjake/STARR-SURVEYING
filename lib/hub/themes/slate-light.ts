// lib/hub/themes/slate-light.ts
//
// Neutral light theme. Strips the brand navy and replaces it with
// pure zinc/slate tones — designed for users who want maximum
// neutrality (e.g., long-form reading, screenshots for clients).

import { defineTheme, type ThemeDefinition } from './index';

export const SLATE_LIGHT: ThemeDefinition = {
  id: 'slate-light',
  label: 'Slate',
  isDark: false,
  palette: {
    bgPage:       '#F5F5F7',
    bgSurface:    '#FFFFFF',
    bgElevated:   '#F1F1F4',
    fgPrimary:    '#18181B',
    fgSecondary:  '#3F3F46',
    fgMuted:      '#71717A',
    accent:       '#3F3F46',
    accentFg:     '#FFFFFF',
    border:       '#E4E4E7',
    borderStrong: '#A1A1AA',
    success:      '#10B981',
    warning:      '#F59E0B',
    danger:       '#EF4444',
    info:         '#3B82F6',
  },
};

defineTheme(SLATE_LIGHT);
