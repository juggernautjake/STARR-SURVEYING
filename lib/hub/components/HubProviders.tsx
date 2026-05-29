'use client';
// lib/hub/components/HubProviders.tsx
//
// Wraps the hub canvas with three pieces of cascading state:
//
//   1) `ThemeProvider` (Slice 80) — sets `data-theme` on its child so
//      `app/styles/themes.css` swaps the CSS-variable cascade. Custom
//      themes inline their 14 vars via style props.
//   2) `data-density` + `--hub-font-scale` (Slices 86 + 87) — the
//      density.css cascade reads `data-density="…"` for spacing tokens
//      and multiplies its font-size tokens by `--hub-font-scale`.
//   3) Side-effect import of the built-in theme registry so
//      `getTheme(id)` resolves immediately on first paint.
//
// Source of truth: `useHubStore` (so the picker can re-render the hub
// without a refresh). Server-passed `initialX` props are the fallback
// for first paint before `useHubStore.hydrate()` fires — they should
// mirror the user's saved layout row so the SSR HTML matches the
// post-hydrate state and the browser never flashes the default theme.
//
// Slice 186 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useMemo, type ReactNode } from 'react';

import { ThemeProvider } from '@/lib/hub/theme-provider';
import { FALLBACK_PALETTE, getTheme, type ThemePalette } from '@/lib/hub/themes';
import '@/lib/hub/themes/register-builtins';
import { useHubStore } from '@/lib/hub/hub-store';
import type {
  BuiltinThemeId,
  CustomThemePayload,
  Density,
  FontScale,
  ThemeId,
} from '@/lib/hub/types';

export interface HubProvidersProps {
  initialTheme?: ThemeId | null;
  initialCustomTheme?: CustomThemePayload | null;
  initialDensity?: Density | null;
  initialFontScale?: FontScale | null;
  children: ReactNode;
}

const DEFAULT_THEME: ThemeId = 'starr-default';
const DEFAULT_DENSITY: Density = 'comfortable';
const DEFAULT_FONT_SCALE: FontScale = 1.0;

export default function HubProviders({
  initialTheme,
  initialCustomTheme,
  initialDensity,
  initialFontScale,
  children,
}: HubProvidersProps) {
  // Live store values take precedence; fall through to the
  // server-passed initials so first paint matches the saved layout
  // even before hydrate() fires.
  const storeTheme = useHubStore((s) => s.theme);
  const storeCustomTheme = useHubStore((s) => s.customTheme);
  const storeDensity = useHubStore((s) => s.density);
  const storeFontScale = useHubStore((s) => s.fontScale);

  const theme: ThemeId = storeTheme ?? initialTheme ?? DEFAULT_THEME;
  const customThemePayload = storeCustomTheme ?? initialCustomTheme ?? null;
  const density: Density = storeDensity ?? initialDensity ?? DEFAULT_DENSITY;
  const fontScale: FontScale = storeFontScale ?? initialFontScale ?? DEFAULT_FONT_SCALE;

  // Resolve palette for ThemeProvider. Built-ins look up via the
  // registry; custom themes flatten the saved payload (anchor colors
  // + derived helpers) into the 14-field palette ThemeProvider expects.
  const { builtinPalette, customPalette } = useMemo(() => {
    if (theme === 'custom' && customThemePayload) {
      return { builtinPalette: undefined, customPalette: customPayloadToPalette(customThemePayload) };
    }
    if (theme === 'custom') {
      return { builtinPalette: undefined, customPalette: undefined };
    }
    const registered = getTheme(theme as BuiltinThemeId);
    return { builtinPalette: registered?.palette ?? FALLBACK_PALETTE, customPalette: undefined };
  }, [theme, customThemePayload]);

  // Cast the inline custom property through CSSProperties — React's
  // type doesn't know about `--…` vars but the browser accepts them.
  const densityStyle = useMemo<React.CSSProperties>(
    () => ({ ['--hub-font-scale' as string]: String(fontScale) } as React.CSSProperties),
    [fontScale],
  );

  return (
    <ThemeProvider themeId={theme} palette={builtinPalette} customPalette={customPalette}>
      <div data-density={density} style={densityStyle} className="hub-providers">
        {children}
      </div>
    </ThemeProvider>
  );
}

// ─── Internal helpers ──────────────────────────────────────────────────

/** Flatten a `CustomThemePayload` (4 anchors + 10 derived) into the
 *  14-field `ThemePalette` shape ThemeProvider expects. */
function customPayloadToPalette(ct: CustomThemePayload): ThemePalette {
  return {
    bgPage:       ct.bgPage,
    bgSurface:    ct.bgSurface,
    bgElevated:   ct.derived.bgElevated,
    fgPrimary:    ct.fgPrimary,
    fgSecondary:  ct.derived.fgSecondary,
    fgMuted:      ct.derived.fgMuted,
    accent:       ct.accent,
    accentFg:     ct.derived.accentFg,
    border:       ct.derived.border,
    borderStrong: ct.derived.borderStrong,
    success:      ct.derived.success,
    warning:      ct.derived.warning,
    danger:       ct.derived.danger,
    info:         ct.derived.info,
  };
}
