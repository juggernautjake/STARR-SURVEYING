// lib/cad/ui/panel-size.ts
//
// Pure helpers for resizable-panel sizing: clamp + localStorage
// persistence. Kept framework-free so the clamp logic is unit-testable
// without a DOM.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md

export function clampPanelSize(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

const KEY_PREFIX = 'starr-cad-panel:';

export function readPanelSize(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + key);
    if (raw == null) return clampPanelSize(fallback, min, max);
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return clampPanelSize(fallback, min, max);
    return clampPanelSize(parsed, min, max);
  } catch {
    return clampPanelSize(fallback, min, max);
  }
}

export function writePanelSize(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_PREFIX + key, String(Math.round(value)));
  } catch {
    /* quota / disabled storage — non-fatal, sizing just won't persist */
  }
}
