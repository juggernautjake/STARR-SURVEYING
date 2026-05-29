// lib/hub/validate-layout.ts
//
// Pure validation for the PUT /api/admin/me/hub-layout payload. Lives
// outside the route file so it can be unit-tested without pulling in
// next-auth + supabase. The route imports + calls these helpers.

import type { HubLayoutPutPayload, WidgetInstance } from './types';

const ALLOWED_DENSITY = new Set(['compact', 'comfortable', 'spacious']);
const ALLOWED_THEMES = new Set([
  'starr-default', 'starr-dark',
  'slate-light', 'slate-dark',
  'forest-light', 'forest-dark',
  'sunset', 'ocean', 'plum',
  'high-contrast-light', 'high-contrast-dark',
  'custom',
]);

/** Returns null when payload is valid, otherwise a human-readable
 *  error message. */
export function validateHubLayoutPutPayload(
  payload: HubLayoutPutPayload,
): string | null {
  if (!payload || typeof payload !== 'object') {
    return 'Body must be an object.';
  }
  if (!Array.isArray(payload.widgets)) {
    return '`widgets` must be an array.';
  }
  for (let i = 0; i < payload.widgets.length; i++) {
    const w = payload.widgets[i] as Partial<WidgetInstance>;
    if (!w || typeof w !== 'object') {
      return `widgets[${i}] is not an object.`;
    }
    if (typeof w.id !== 'string' || w.id.length === 0) {
      return `widgets[${i}].id must be a non-empty string.`;
    }
    if (typeof w.type !== 'string' || w.type.length === 0) {
      return `widgets[${i}].type must be a non-empty string.`;
    }
    if (
      !Number.isInteger(w.x) || !Number.isInteger(w.y) ||
      !Number.isInteger(w.w) || !Number.isInteger(w.h)
    ) {
      return `widgets[${i}] x/y/w/h must be integers.`;
    }
    if ((w.x ?? -1) < 0 || (w.y ?? -1) < 0) {
      return `widgets[${i}] x/y must be ≥ 0.`;
    }
    if ((w.w ?? 0) < 1 || (w.h ?? 0) < 1) {
      return `widgets[${i}] w/h must be ≥ 1.`;
    }
  }
  if (payload.theme !== undefined && !ALLOWED_THEMES.has(payload.theme)) {
    return `theme '${payload.theme}' is not recognized.`;
  }
  if (payload.density !== undefined && !ALLOWED_DENSITY.has(payload.density)) {
    return `density '${payload.density}' is not one of compact/comfortable/spacious.`;
  }
  if (payload.fontScale !== undefined) {
    if (typeof payload.fontScale !== 'number' || !Number.isFinite(payload.fontScale)) {
      return 'fontScale must be a finite number.';
    }
  }
  if (payload.theme === 'custom' && !payload.customTheme) {
    return 'theme=custom requires customTheme payload.';
  }
  return null;
}

/** App-layer clamp on fontScale. Narrower than the DB CHECK envelope
 *  so a malformed UI control can't store a too-tiny / too-huge value. */
export function clampFontScale(raw: number): number {
  if (!Number.isFinite(raw)) return 1.0;
  if (raw < 0.875) return 0.875;
  if (raw > 1.5) return 1.5;
  return raw;
}
