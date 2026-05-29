// __tests__/hub/theme-provider.test.tsx
//
// Coverage for the theme registry + ThemeProvider rendering. Uses
// react-dom/server like the existing cad/styles/* tests rather than
// pulling in @testing-library/react.

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import {
  ThemeProvider,
  useTheme,
  useThemeColors,
} from '@/lib/hub/theme-provider';
import {
  FALLBACK_PALETTE,
  defineTheme,
  getTheme,
  allThemes,
  isThemeRegistered,
  type ThemeDefinition,
  type ThemePalette,
} from '@/lib/hub/themes';

const sampleStarr: ThemeDefinition = {
  id: 'starr-default',
  label: 'Starr Default',
  isDark: false,
  palette: FALLBACK_PALETTE,
};

const sampleDark: ThemeDefinition = {
  id: 'starr-dark',
  label: 'Starr Dark',
  isDark: true,
  palette: {
    ...FALLBACK_PALETTE,
    bgPage: '#0B1020',
    bgSurface: '#111935',
    fgPrimary: '#F1F5F9',
    accent: '#5A7BE5',
  },
};

describe('theme registry', () => {
  beforeEach(() => {
    // Re-register so test isolation works. Map.set overwrites.
    defineTheme(sampleStarr);
    defineTheme(sampleDark);
  });

  it('defineTheme + getTheme round-trip', () => {
    const out = getTheme('starr-default');
    expect(out).toBeDefined();
    expect(out?.id).toBe('starr-default');
    expect(out?.label).toBe('Starr Default');
  });

  it('isThemeRegistered returns true for registered, false for unknown', () => {
    expect(isThemeRegistered('starr-default')).toBe(true);
    expect(isThemeRegistered('totally-fake')).toBe(false);
  });

  it('allThemes includes every registered theme', () => {
    const ids = allThemes().map((t) => t.id);
    expect(ids).toContain('starr-default');
    expect(ids).toContain('starr-dark');
  });

  it('FALLBACK_PALETTE has all 14 fields populated', () => {
    const required: (keyof ThemePalette)[] = [
      'bgPage', 'bgSurface', 'bgElevated',
      'fgPrimary', 'fgSecondary', 'fgMuted',
      'accent', 'accentFg',
      'border', 'borderStrong',
      'success', 'warning', 'danger', 'info',
    ];
    for (const k of required) {
      expect(FALLBACK_PALETTE[k]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('ThemeProvider HTML output', () => {
  it('renders a wrapper with the correct data-theme attribute', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ThemeProvider themeId="starr-default" palette={FALLBACK_PALETTE}>
        <span>child</span>
      </ThemeProvider>,
    );
    expect(html).toContain('data-theme="starr-default"');
    expect(html).toContain('<span>child</span>');
  });

  it('inlines all 14 CSS variables when themeId="custom"', () => {
    const customPalette: ThemePalette = {
      ...FALLBACK_PALETTE,
      bgPage: '#1A2332',
      bgSurface: '#27334C',
      fgPrimary: '#F1F5F9',
      accent: '#7DD3FC',
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <ThemeProvider themeId="custom" customPalette={customPalette}>
        <span>child</span>
      </ThemeProvider>,
    );
    expect(html).toContain('data-theme="custom"');
    expect(html).toContain('--theme-bg-page:#1A2332');
    expect(html).toContain('--theme-accent:#7DD3FC');
    expect(html).toContain('--theme-fg-primary:#F1F5F9');
  });

  it('does NOT inline style vars for built-in themes', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ThemeProvider themeId="starr-dark" palette={sampleDark.palette}>
        <span>child</span>
      </ThemeProvider>,
    );
    // Built-in themes get their cascade from the static themes.css file,
    // not from inline style vars. Confirm no inline `--theme-*` prefix.
    expect(html).not.toContain('--theme-bg-page');
  });
});

describe('useTheme / useThemeColors hooks (consumed via a test component)', () => {
  function ProbeId() {
    const id = useTheme();
    return <span data-testid="id">{id}</span>;
  }

  function ProbeAccent() {
    const palette = useThemeColors();
    return <span data-testid="accent">{palette.accent}</span>;
  }

  it('useTheme returns the active theme id from inside a provider', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ThemeProvider themeId="starr-dark" palette={sampleDark.palette}>
        <ProbeId />
      </ThemeProvider>,
    );
    expect(html).toContain('>starr-dark<');
  });

  it('useThemeColors returns the active palette from inside a provider', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ThemeProvider themeId="starr-dark" palette={sampleDark.palette}>
        <ProbeAccent />
      </ThemeProvider>,
    );
    expect(html).toContain('>#5A7BE5<');
  });

  it('hooks default to fallback values outside a provider', () => {
    const htmlId = ReactDOMServer.renderToStaticMarkup(<ProbeId />);
    expect(htmlId).toContain('>starr-default<');

    const htmlAccent = ReactDOMServer.renderToStaticMarkup(<ProbeAccent />);
    expect(htmlAccent).toContain(`>${FALLBACK_PALETTE.accent}<`);
  });
});
