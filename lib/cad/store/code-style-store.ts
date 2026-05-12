// lib/cad/store/code-style-store.ts — Phase 3 §14/15 code-to-style overrides
//
// Stores surveyor overrides to the default code-to-style mapping. The
// defaults are derived from `MASTER_CODE_LIBRARY` via
// `buildDefaultCodeStyleMap` and are never mutated; this store only
// holds the deltas (per-code partial overrides), so resetting a code
// is a single delete + the cascade recomputes.
//
// Why an overrides-only store: the default map is large (134+ codes)
// and rebuilds cheaply from MASTER_CODE_LIBRARY; persisting the full
// snapshot would store mostly redundant data and risk drift when the
// library ships a new code. Only the user's intentional edits persist.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CodeStyleMapping } from '../styles/types';
import { buildDefaultCodeStyleMap } from '../styles/code-style-map';
import { MASTER_CODE_LIBRARY } from '../codes/code-library';

/** Per-code surveyor overrides — every field optional so the store
 *  only writes the slots the surveyor actually changed. */
export type CodeStyleOverride = Partial<
  Pick<
    CodeStyleMapping,
    | 'symbolId'
    | 'symbolColor'
    | 'lineTypeId'
    | 'lineWeight'
    | 'lineColor'
    | 'layerId'
    | 'labelFormat'
    | 'labelVisible'
  >
>;

interface CodeStyleStore {
  /** Keyed by `CodeStyleMapping.codeAlpha` so a single source-of-truth
   *  per code; numeric-only lookups go through `resolveOverride`. */
  overrides: Record<string, CodeStyleOverride>;
  /** Patch one field on a code's override. Pass `null` to clear that
   *  field (revert to the default for just that field). */
  setOverride: <K extends keyof CodeStyleOverride>(
    codeAlpha: string,
    field: K,
    value: CodeStyleOverride[K] | null,
  ) => void;
  /** Wipe every override for a single code. */
  resetCode: (codeAlpha: string) => void;
  /** Wipe every override across every code. */
  resetAll: () => void;
}

export const useCodeStyleStore = create<CodeStyleStore>()(
  persist(
    (set) => ({
      overrides: {},
      setOverride: (codeAlpha, field, value) =>
        set((s) => {
          const next = { ...s.overrides };
          const current: CodeStyleOverride = { ...(next[codeAlpha] ?? {}) };
          if (value == null) {
            delete current[field];
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (current[field] as any) = value;
          }
          if (Object.keys(current).length === 0) {
            delete next[codeAlpha];
          } else {
            next[codeAlpha] = current;
          }
          return { overrides: next };
        }),
      resetCode: (codeAlpha) =>
        set((s) => {
          if (!(codeAlpha in s.overrides)) return s;
          const next = { ...s.overrides };
          delete next[codeAlpha];
          return { overrides: next };
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: 'starr-cad-code-style',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Resolve the effective `CodeStyleMapping` for a code, applying any
 *  user overrides on top of the default from `buildDefaultCodeStyleMap`. */
export function resolveCodeStyleMapping(
  codeAlpha: string,
  overrides: Record<string, CodeStyleOverride>,
): CodeStyleMapping | null {
  const defaults = buildDefaultCodeStyleMap(MASTER_CODE_LIBRARY);
  const base = defaults.get(codeAlpha);
  if (!base) return null;
  const ov = overrides[codeAlpha];
  if (!ov) return base;
  return {
    ...base,
    ...ov,
    isUserModified: true,
  };
}

/** Return every code in the library with its effective mapping
 *  (default + override) so a UI can render the full table without
 *  rebuilding the default map per row. */
export function getEffectiveCodeStyleMap(
  overrides: Record<string, CodeStyleOverride>,
): CodeStyleMapping[] {
  const defaults = buildDefaultCodeStyleMap(MASTER_CODE_LIBRARY);
  const seen = new Set<string>();
  const out: CodeStyleMapping[] = [];
  for (const mapping of defaults.values()) {
    if (seen.has(mapping.codeAlpha)) continue;
    seen.add(mapping.codeAlpha);
    const ov = overrides[mapping.codeAlpha];
    if (ov) {
      out.push({ ...mapping, ...ov, isUserModified: true });
    } else {
      out.push(mapping);
    }
  }
  return out;
}
