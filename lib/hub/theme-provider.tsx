'use client';
// lib/hub/theme-provider.tsx
//
// Scoped theme wrapper. Renders a `<div data-theme="...">` so the CSS
// custom-property cascade swaps every widget at once.
//
// Custom themes can't be expressed via a static `[data-theme="custom"]`
// block because the palette varies per user — they're inlined as a
// `style={{ '--theme-bg-page': ..., ... }}` map instead.

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ThemeId } from './types';
import type { ThemePalette } from './themes';
import { FALLBACK_PALETTE } from './themes';

interface ThemeContextValue {
  themeId: ThemeId;
  palette: ThemePalette;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'starr-default',
  palette: FALLBACK_PALETTE,
});

export interface ThemeProviderProps {
  themeId: ThemeId;
  /** Required when `themeId === 'custom'`. Ignored otherwise. */
  customPalette?: ThemePalette;
  /** Used for `useThemeColors()` consumers. When omitted for a built-in
   *  theme, the provider falls back to a lazy lookup via `getTheme()`. */
  palette?: ThemePalette;
  children: ReactNode;
}

/** Wraps children in a `[data-theme]` element + provides the resolved
 *  palette to `useTheme()` / `useThemeColors()`. */
export function ThemeProvider({
  themeId,
  customPalette,
  palette,
  children,
}: ThemeProviderProps) {
  const resolvedPalette = useMemo<ThemePalette>(() => {
    if (themeId === 'custom') {
      return customPalette ?? FALLBACK_PALETTE;
    }
    return palette ?? FALLBACK_PALETTE;
  }, [themeId, customPalette, palette]);

  // For built-in themes, the `data-theme` attribute alone triggers the
  // CSS-variable cascade defined in app/styles/themes.css.
  // For custom themes, we inline the 14 vars as style props since there's
  // no static [data-theme="custom"] block (palette varies per user).
  const inlineVars: React.CSSProperties | undefined =
    themeId === 'custom' && customPalette
      ? paletteToInlineVars(customPalette)
      : undefined;

  return (
    <ThemeContext.Provider value={{ themeId, palette: resolvedPalette }}>
      <div data-theme={themeId} style={inlineVars}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

/** Returns the active theme id. */
export function useTheme(): ThemeId {
  return useContext(ThemeContext).themeId;
}

/** Returns the active palette as JS hex strings — for code that can't
 *  read CSS variables (chart libraries, canvas drawing, etc.). */
export function useThemeColors(): ThemePalette {
  return useContext(ThemeContext).palette;
}

// ─── Internal helpers ──────────────────────────────────────────────────

function paletteToInlineVars(p: ThemePalette): React.CSSProperties {
  // Cast through unknown because React's CSSProperties type doesn't
  // know about CSS custom properties — but the browser accepts them
  // and Next.js renders them correctly.
  return {
    ['--theme-bg-page' as string]:       p.bgPage,
    ['--theme-bg-surface' as string]:    p.bgSurface,
    ['--theme-bg-elevated' as string]:   p.bgElevated,
    ['--theme-fg-primary' as string]:    p.fgPrimary,
    ['--theme-fg-secondary' as string]:  p.fgSecondary,
    ['--theme-fg-muted' as string]:      p.fgMuted,
    ['--theme-accent' as string]:        p.accent,
    ['--theme-accent-fg' as string]:     p.accentFg,
    ['--theme-border' as string]:        p.border,
    ['--theme-border-strong' as string]: p.borderStrong,
    ['--theme-success' as string]:       p.success,
    ['--theme-warning' as string]:       p.warning,
    ['--theme-danger' as string]:        p.danger,
    ['--theme-info' as string]:          p.info,
  } as React.CSSProperties;
}
