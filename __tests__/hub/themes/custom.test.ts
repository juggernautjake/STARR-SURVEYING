// __tests__/hub/themes/custom.test.ts
//
// Slice 106 — custom theme builder + auto-fix walker. Locks down:
//   - buildCustomTheme returns a complete payload from valid inputs
//   - auto-derived colors flip direction with bg luminance
//   - the contrast audit captures the 5 critical pairs
//   - isCustomThemeAccessible gates on body-text contrast (AA)
//   - autoFixCustomTheme walks until the body text passes AA
//
// React picker UX (live preview, fix button, save gating) is
// exercised in the Playwright suite.

import { describe, it, expect } from 'vitest';
import {
  autoFixCustomTheme,
  buildCustomTheme,
  isCustomThemeAccessible,
  isHexColor,
  quickContrast,
} from '@/lib/hub/themes/custom';

const LIGHT_INPUTS = {
  name: 'Test light',
  bgPage:    '#F8FAFC',
  bgSurface: '#FFFFFF',
  fgPrimary: '#0F172A',
  accent:    '#1D3095',
};

const DARK_INPUTS = {
  name: 'Test dark',
  bgPage:    '#0F172A',
  bgSurface: '#1E293B',
  fgPrimary: '#F1F5F9',
  accent:    '#60A5FA',
};

const FAILING_LIGHT = {
  name: 'Too pale',
  bgPage:    '#FFFFFF',
  bgSurface: '#FFFFFF',
  fgPrimary: '#CFCFCF',   // gray on white — fails AA body
  accent:    '#1D3095',
};

describe('isHexColor', () => {
  it('accepts canonical hex strings', () => {
    expect(isHexColor('#FF8040')).toBe(true);
    expect(isHexColor('#abc')).toBe(true);
  });
  it('rejects non-hex input', () => {
    expect(isHexColor('rgb(1,2,3)')).toBe(false);
    expect(isHexColor('#12')).toBe(false);
  });
});

describe('buildCustomTheme — happy path', () => {
  it('returns a complete payload for a light input', () => {
    const theme = buildCustomTheme(LIGHT_INPUTS)!;
    expect(theme).not.toBeNull();
    expect(theme.bgPage).toBe('#F8FAFC');
    expect(theme.bgSurface).toBe('#FFFFFF');
    expect(theme.fgPrimary).toBe('#0F172A');
    expect(theme.accent).toBe('#1D3095');
    expect(theme.derived.bgElevated).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.derived.fgSecondary).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.derived.fgMuted).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.derived.accentFg).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.derived.border).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.derived.borderStrong).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.derived.success).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.derived.warning).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.derived.danger).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.derived.info).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('auto-generates a name when blank', () => {
    const theme = buildCustomTheme({ ...LIGHT_INPUTS, name: '' })!;
    expect(theme.name).toMatch(/^Custom/);
  });

  it('respects an explicit name', () => {
    const theme = buildCustomTheme({ ...LIGHT_INPUTS, name: 'Brand Blue' })!;
    expect(theme.name).toBe('Brand Blue');
  });

  it('returns null when any anchor color fails to parse', () => {
    expect(buildCustomTheme({ ...LIGHT_INPUTS, accent: 'not a color' })).toBeNull();
  });

  it('records the 5 contrast audit pairs', () => {
    const theme = buildCustomTheme(LIGHT_INPUTS)!;
    const audit = theme.contrastAudit;
    expect(audit.primaryOnSurface.ratio).toBeGreaterThan(1);
    expect(audit.primaryOnPage.ratio).toBeGreaterThan(1);
    expect(audit.secondaryOnSurface.ratio).toBeGreaterThan(1);
    expect(audit.accentFgOnAccent.ratio).toBeGreaterThan(1);
    expect(audit.accentOnSurface.ratio).toBeGreaterThan(1);
  });
});

describe('buildCustomTheme — derived direction', () => {
  it('light theme darkens fg for muted/secondary', () => {
    const theme = buildCustomTheme(LIGHT_INPUTS)!;
    // secondary should be a lighter shade than primary (#0F172A)
    expect(parseInt(theme.derived.fgSecondary.slice(1, 3), 16)).toBeGreaterThan(0x0F);
    expect(parseInt(theme.derived.fgMuted.slice(1, 3), 16)).toBeGreaterThan(0x0F);
  });

  it('dark theme darkens primary fg for muted/secondary', () => {
    const theme = buildCustomTheme(DARK_INPUTS)!;
    // secondary should be a darker shade than primary (#F1F5F9)
    expect(parseInt(theme.derived.fgSecondary.slice(1, 3), 16)).toBeLessThan(0xF1);
    expect(parseInt(theme.derived.fgMuted.slice(1, 3), 16)).toBeLessThan(0xF1);
  });
});

describe('isCustomThemeAccessible', () => {
  it('returns true for a passing theme', () => {
    const theme = buildCustomTheme(LIGHT_INPUTS)!;
    expect(isCustomThemeAccessible(theme)).toBe(true);
  });

  it('returns false when body text fails AA on surface', () => {
    const theme = buildCustomTheme(FAILING_LIGHT)!;
    expect(isCustomThemeAccessible(theme)).toBe(false);
  });
});

describe('autoFixCustomTheme', () => {
  it('returns inputs unchanged when already AA-passing', () => {
    const out = autoFixCustomTheme(LIGHT_INPUTS);
    expect(out).toEqual(LIGHT_INPUTS);
  });

  it('walks a failing fg until AA passes', () => {
    const fixed = autoFixCustomTheme(FAILING_LIGHT)!;
    expect(fixed).not.toBeNull();
    expect(fixed.fgPrimary).not.toBe(FAILING_LIGHT.fgPrimary);
    const theme = buildCustomTheme(fixed)!;
    expect(isCustomThemeAccessible(theme)).toBe(true);
  });

  it('returns null when an input is unparseable', () => {
    expect(autoFixCustomTheme({ ...LIGHT_INPUTS, bgPage: 'oops' })).toBeNull();
  });
});

describe('quickContrast — live preview helper', () => {
  it('returns ratio + level for a valid pair', () => {
    const verdict = quickContrast('#FFFFFF', '#000000')!;
    expect(verdict.ratio).toBeGreaterThan(20);
    expect(verdict.level).toBe('AAA');
  });

  it('returns null for an unparseable input', () => {
    expect(quickContrast('not hex', '#000')).toBeNull();
  });
});
