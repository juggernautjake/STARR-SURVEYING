// lib/admin/role-colors.ts
//
// Slice 1 of hub-widget-excellence-01-greeting-roles-workmode. Maps
// each `UserRole` to a distinct, on-brand pill background + a
// contrast-chosen foreground (#000 or #fff) so the greeting can show
// ALL of a user's roles as readable colored pills.
//
// Built on the WCAG helpers in lib/theme/contrast.ts so the fg pick is
// the same relative-luminance math the theme + CAD work already use.

import type { UserRole } from '@/lib/auth';
import {
  contrastRatio,
  parseHexColor,
  pickForegroundForBackground,
  toHexColor,
} from '@/lib/theme/contrast';

export interface RolePillColors {
  /** `#rrggbb` background. */
  bg: string;
  /** `#000000` or `#FFFFFF`, whichever contrasts better with `bg`. */
  fg: string;
}

/** Per-role background hex. Distinct, reasonably on-brand hues so a
 *  user holding several roles gets visually separable pills. Chosen so
 *  each clears WCAG AA (≥ 4.5) against EITHER black or white text —
 *  the fg picker then takes whichever side wins. */
const ROLE_BACKGROUND: Record<UserRole, string> = {
  admin:             '#1E3A8A', // deep blue
  developer:         '#3730A3', // indigo
  teacher:           '#9333EA', // purple
  student:           '#0E7490', // teal
  researcher:        '#047857', // emerald
  drawer:            '#B45309', // amber-brown
  field_crew:        '#15803D', // green
  employee:          '#475569', // slate
  guest:             '#6B7280', // gray
  tech_support:      '#0369A1', // sky blue
  equipment_manager: '#B91C1C', // red
};

/** Fallback for any role string not in the map (defensive — a future
 *  role added to ALL_ROLES without a color still renders a pill). */
const FALLBACK_BACKGROUND = '#475569';

/** The background hex for a role (falls back to slate for unknowns). */
export function roleBackground(role: string): string {
  return (ROLE_BACKGROUND as Record<string, string>)[role] ?? FALLBACK_BACKGROUND;
}

/** The contrast-chosen foreground (#000000 / #FFFFFF) for a role's
 *  background, via the shared WCAG luminance picker. */
export function roleForeground(role: string): string {
  const bg = parseHexColor(roleBackground(role));
  if (!bg) return '#FFFFFF';
  return toHexColor(pickForegroundForBackground(bg));
}

/** Both pill colors for a role. */
export function rolePillColors(role: string): RolePillColors {
  return { bg: roleBackground(role), fg: roleForeground(role) };
}

/** The WCAG contrast ratio between a role's bg + its chosen fg.
 *  Exposed so the spec can assert every role clears AA. */
export function rolePillContrast(role: string): number {
  const bg = parseHexColor(roleBackground(role));
  const fg = parseHexColor(roleForeground(role));
  if (!bg || !fg) return 1;
  return contrastRatio(bg, fg);
}
