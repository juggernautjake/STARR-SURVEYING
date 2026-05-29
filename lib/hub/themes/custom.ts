// lib/hub/themes/custom.ts
//
// Helpers for building / validating a custom user-defined theme.
// The user picks 4 anchor colors (bg page, bg surface, fg primary,
// accent); this module derives the other 8 + runs the contrast audit
// gates the picker uses to decide whether "save" is enabled.
//
// Slice 106 of customizable-hub-and-work-mode-2026-05-28.md.

import {
  WCAG_AA_BODY,
  WCAG_AA_LARGE,
  adjustForegroundToTarget,
  contrastVerdictFor,
  darken,
  lighten,
  parseHexColor,
  pickForegroundForBackground,
  relativeLuminance,
  toHexColor,
  type ContrastVerdict,
  type SrgbColor,
} from '@/lib/theme/contrast';
import type {
  CustomThemeContrastAudit,
  CustomThemePayload,
} from '@/lib/hub/types';

export interface CustomThemeInputs {
  /** Optional display name. The picker auto-generates one when blank. */
  name?: string;
  /** Four user-picked hex strings (#rrggbb or #rgb). */
  bgPage: string;
  bgSurface: string;
  fgPrimary: string;
  accent: string;
}

/** Build a complete custom theme payload from the 4 inputs.
 *  The 8 derived colors come from the contrast helpers + the
 *  WCAG audit so the resulting payload is ready for the API PUT. */
export function buildCustomTheme(inputs: CustomThemeInputs): CustomThemePayload | null {
  const bgPage = parseHexColor(inputs.bgPage);
  const bgSurface = parseHexColor(inputs.bgSurface);
  const fgPrimary = parseHexColor(inputs.fgPrimary);
  const accent = parseHexColor(inputs.accent);
  if (!bgPage || !bgSurface || !fgPrimary || !accent) return null;

  // Derive elevated bg: slightly more lifted from the surface. If the
  // theme is dark, lift toward white; if light, darken slightly so the
  // depth reads.
  const surfaceLum = relativeLuminance(bgSurface);
  const bgElevated = surfaceLum < 0.5 ? lighten(bgSurface, 0.06) : darken(bgSurface, 0.04);
  const fgSecondary = surfaceLum < 0.5 ? darken(fgPrimary, 0.18) : lighten(fgPrimary, 0.28);
  const fgMuted = surfaceLum < 0.5 ? darken(fgPrimary, 0.38) : lighten(fgPrimary, 0.55);

  // Auto-derive accent-fg: pick white or black, whichever passes AA
  // against the accent.
  const accentFg = pickForegroundForBackground(accent);

  // Borders mirror the surface luminance — light surfaces want dark
  // borders, dark surfaces want pale borders.
  const border = surfaceLum < 0.5 ? lighten(bgSurface, 0.18) : darken(bgSurface, 0.10);
  const borderStrong = surfaceLum < 0.5 ? lighten(bgSurface, 0.36) : darken(bgSurface, 0.30);

  // Status colors are fixed-ish — Tailwind-ish defaults that read
  // well on most themes. The contrast audit only checks the pairs
  // the planning doc flagged as critical (primary on surface +
  // primary on page + secondary on surface + accent text on accent +
  // accent label on surface).
  const success = parseHexColor('#10B981')!;
  const warning = parseHexColor('#F59E0B')!;
  const danger  = parseHexColor('#EF4444')!;
  const info    = parseHexColor('#3B82F6')!;

  const contrastAudit: CustomThemeContrastAudit = {
    primaryOnSurface:   toContrastResult(contrastVerdictFor(bgSurface, fgPrimary)),
    primaryOnPage:      toContrastResult(contrastVerdictFor(bgPage, fgPrimary)),
    secondaryOnSurface: toContrastResult(contrastVerdictFor(bgSurface, fgSecondary)),
    accentFgOnAccent:   toContrastResult(contrastVerdictFor(accent, accentFg)),
    accentOnSurface:    toContrastResult(contrastVerdictFor(bgSurface, accent)),
  };

  return {
    name: inputs.name?.trim() || autoGenerateName(accent, surfaceLum < 0.5),
    bgPage: inputs.bgPage,
    bgSurface: inputs.bgSurface,
    fgPrimary: inputs.fgPrimary,
    accent: inputs.accent,
    derived: {
      bgElevated:   toHexColor(bgElevated),
      fgSecondary:  toHexColor(fgSecondary),
      fgMuted:      toHexColor(fgMuted),
      accentFg:     toHexColor(accentFg),
      border:       toHexColor(border),
      borderStrong: toHexColor(borderStrong),
      success:      toHexColor(success),
      warning:      toHexColor(warning),
      danger:       toHexColor(danger),
      info:         toHexColor(info),
    },
    contrastAudit,
  };
}

/** True when the theme's body-text pairs (primary on surface,
 *  primary on page) both clear WCAG AA. The picker's save button
 *  uses this to gate persistence. */
export function isCustomThemeAccessible(theme: CustomThemePayload): boolean {
  return theme.contrastAudit.primaryOnSurface.ratio >= WCAG_AA_BODY &&
         theme.contrastAudit.primaryOnPage.ratio >= WCAG_AA_BODY;
}

/** "Fix it" walker. Returns the same inputs with `fgPrimary` adjusted
 *  until both primary-on-surface and primary-on-page pass AA. Returns
 *  null if the target is unreachable. */
export function autoFixCustomTheme(inputs: CustomThemeInputs): CustomThemeInputs | null {
  const bgPage = parseHexColor(inputs.bgPage);
  const bgSurface = parseHexColor(inputs.bgSurface);
  const fgPrimary = parseHexColor(inputs.fgPrimary);
  if (!bgPage || !bgSurface || !fgPrimary) return null;

  // The harder bg (lower-contrast one against current fg) drives the
  // direction of the adjustment.
  let adjustedFg: SrgbColor | null = fgPrimary;
  for (let i = 0; i < 2; i++) {
    adjustedFg = adjustForegroundToTarget(bgSurface, adjustedFg!, WCAG_AA_BODY);
    if (!adjustedFg) return null;
    adjustedFg = adjustForegroundToTarget(bgPage, adjustedFg!, WCAG_AA_BODY);
    if (!adjustedFg) return null;
  }

  return { ...inputs, fgPrimary: toHexColor(adjustedFg) };
}

/** Whether a hex string parses cleanly. */
export function isHexColor(input: string): boolean {
  return parseHexColor(input) !== null;
}

/** Inline contrast for the live preview. Returns null when either
 *  input is not parseable. */
export function quickContrast(bg: string, fg: string): ContrastVerdict | null {
  const a = parseHexColor(bg);
  const b = parseHexColor(fg);
  if (!a || !b) return null;
  return contrastVerdictFor(a, b);
}

// ─── Internals ─────────────────────────────────────────────────────────

function toContrastResult(v: ContrastVerdict) {
  return {
    ratio: Number(v.ratio.toFixed(2)),
    passes: levelToPasses(v.level),
  };
}

function levelToPasses(level: ContrastVerdict['level']): 'AAA' | 'AA' | 'AA-large-only' | 'fail' {
  return level;
}

function autoGenerateName(accent: SrgbColor, isDark: boolean): string {
  const hex = toHexColor(accent).slice(1, 4);
  return `${isDark ? 'Custom dark' : 'Custom'} (${hex})`;
}

// Re-export the thresholds so the picker can render them in the
// "save gated by AA" copy.
export { WCAG_AA_BODY, WCAG_AA_LARGE };
