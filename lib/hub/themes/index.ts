// lib/hub/themes/index.ts
//
// Theme registry. Each built-in theme has a stable id, a display label,
// and a fully-resolved palette object. Components use the `id` to swap
// CSS-variable cascades; the palette object is exposed via the
// `useThemeColors()` hook for code that can't read CSS vars (e.g.,
// chart libraries that take hex strings as JS values).
//
// New themes are added by:
//   1) Dropping a `[data-theme="<id>"]` block in app/styles/themes.css
//   2) Calling `defineTheme()` here w/ the same palette numbers
//   3) Adding the id to the `BuiltinThemeId` union in lib/hub/types.ts
//
// Slice 80: registry skeleton + the fallback palette.
// Slice 81 adds starr-default + starr-dark.
// Slices 83–85 fill in the rest.

import type { BuiltinThemeId } from '../types';

/** Hex strings. Always 7 chars (#RRGGBB). The CSS layer mirrors these. */
export interface ThemePalette {
  bgPage: string;
  bgSurface: string;
  bgElevated: string;
  fgPrimary: string;
  fgSecondary: string;
  fgMuted: string;
  accent: string;
  accentFg: string;
  border: string;
  borderStrong: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export interface ThemeDefinition {
  id: BuiltinThemeId;
  label: string;
  /** True for dark themes — used by the shadow-hiding logic so subtle
   *  shadows don't render as invisible on dark surfaces. */
  isDark: boolean;
  palette: ThemePalette;
}

const REGISTRY = new Map<BuiltinThemeId, ThemeDefinition>();

/** Default fallback used when no [data-theme] wrapper is present. Mirrors
 *  the `:root` block in themes.css. */
export const FALLBACK_PALETTE: ThemePalette = {
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
};

/** Register a theme. Idempotent — re-registering overwrites. */
export function defineTheme(def: ThemeDefinition): void {
  REGISTRY.set(def.id, def);
}

/** Look up a registered theme by id. Returns undefined when the id
 *  isn't registered (caller decides whether to fall back). */
export function getTheme(id: BuiltinThemeId): ThemeDefinition | undefined {
  return REGISTRY.get(id);
}

/** All registered themes, in insertion order. */
export function allThemes(): ThemeDefinition[] {
  return Array.from(REGISTRY.values());
}

/** True when the id is registered. Cheaper than getTheme() for guards. */
export function isThemeRegistered(id: string): boolean {
  return REGISTRY.has(id as BuiltinThemeId);
}
