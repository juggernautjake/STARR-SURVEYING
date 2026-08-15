// lib/cad/styles/code-style-resolve.ts — C22, the code tier of the style cascade
//
// ── WHAT C22 FOUND ──────────────────────────────────────────────────────────────────────────────
//
// The slice was written as "make the mapping editable in the UI and previewable". Both were already
// true: `CodeStylePanel` is a complete table — search, per-row symbol picker, line-type picker with
// preview, colour swatch, layer select, per-row and global reset — reachable from the menu bar and
// persisted to localStorage.
//
// What was not true is that any of it did anything. `resolveCodeStyleMapping`, the one function
// that answers "what style does this code get", had **zero callers outside the barrel re-export**.
// So did `resolveStyle`, the file that calls itself the "4-tier style resolution engine" and whose
// tier 2 is the point-code default. The canvas resolved feature → layer → constant, with no code
// tier at all.
//
// A surveyor could open the panel, set FN01 to Barbed Wire in red, close it, and watch the drawing
// not change — forever, with nothing logged.
//
// ── WHY THIS FILE EXISTS RATHER THAN A DIRECT CALL ──────────────────────────────────────────────
//
// `resolveCodeStyleMapping` calls `buildDefaultCodeStyleMap(MASTER_CODE_LIBRARY)` on every
// invocation, rebuilding a 134-code Map each time. That is fine for a panel that renders once and
// fatal for a render loop that asks per feature per frame — the exact allocation-per-frame shape C3
// measured out of `cullIdSets`. This module memoises the default map (it is derived from a frozen
// module constant, so it can never go stale) and resolves against it.

import type { Feature } from '../types';
import type { CodeStyleMapping } from './types';
import { buildDefaultCodeStyleMap } from './code-style-map';
import { MASTER_CODE_LIBRARY } from '../codes/code-library';

export type CodeStyleOverrides = Record<string, Partial<CodeStyleMapping>>;

/** Built once. `MASTER_CODE_LIBRARY` is a module constant, so this cannot go stale — unlike the
 *  reference-keyed caches in the drawing store, which guard against a document that changes. */
let defaultMap: Map<string, CodeStyleMapping> | null = null;

function defaults(): Map<string, CodeStyleMapping> {
  if (!defaultMap) defaultMap = buildDefaultCodeStyleMap(MASTER_CODE_LIBRARY);
  return defaultMap;
}

/** Test seam: forget the memoised map. Never needed in the app. */
export function __resetCodeStyleDefaults(): void {
  defaultMap = null;
}

/**
 * The code stamped on a feature, if any.
 *
 * `properties.code` is the canonical slot (`trv-to-drawing` writes it, the label generator and the
 * AI tool registry both read it). `pointCode` is accepted because imported drawings carry it, and
 * matching only the canonical name would silently give every imported feature no code — a
 * whole-import-sized hole that would look like the mapping simply not working.
 */
export function featureCode(feature: Feature): string | null {
  const p = feature.properties;
  const raw = p.code ?? p.pointCode;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/**
 * Effective mapping for a code — the library default with the surveyor's overrides on top.
 *
 * Codes are matched case-insensitively and by EITHER the alpha or the numeric form, because a field
 * crew types `fn01` and a data collector emits `740` for the same thing. Returns null for a code
 * the library does not know, so the caller falls through to the layer tier rather than inventing a
 * style for a code nobody defined.
 */
export function resolveCodeStyle(
  code: string | null | undefined,
  overrides: CodeStyleOverrides = {},
): CodeStyleMapping | null {
  if (!code) return null;
  const map = defaults();
  const base = map.get(code) ?? map.get(code.toUpperCase()) ?? map.get(code.toLowerCase());
  if (!base) return null;
  // Overrides are keyed by `codeAlpha`, so a numeric-coded feature still picks up an override the
  // surveyor set on the alpha row — without this, editing FN01 would style hand-typed features and
  // silently skip every one that came in as 740.
  const ov = overrides[base.codeAlpha];
  if (!ov) return base;
  return { ...base, ...ov, isUserModified: true };
}

/** Convenience for the render path: the mapping for whatever code a feature carries. */
export function resolveFeatureCodeStyle(
  feature: Feature,
  overrides: CodeStyleOverrides = {},
): CodeStyleMapping | null {
  return resolveCodeStyle(featureCode(feature), overrides);
}
