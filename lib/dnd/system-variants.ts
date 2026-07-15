// lib/dnd/system-variants.ts — pure helpers for per-character multi-system variants (Slice 13).
//
// A character holds an ACTIVE system (the `system` column, driving the live `data` /
// `sheet_type` / `custom_layout` / `custom_css`) plus a map of OTHER systems' sheets in
// `system_variants`. Switching the active system is a snapshot-then-swap: the current
// active columns are stored back into their system's slot, and the target system's slot is
// loaded into the live columns. Transposing generates a target slot on demand. These
// helpers are pure so the switch/transpose logic is unit-tested; the route just persists.
import { normalizeSystem } from './systems';

/** One system's stored sheet (mirrors the character's live sheet columns). */
export interface SystemVariant {
  data: unknown;
  sheet_type: string;
  custom_layout?: unknown;
  custom_css?: string | null;
}

export type SystemVariants = Record<string, SystemVariant>;

/** The live-column fields a variant snapshots. */
export interface ActiveSheet {
  system: string;
  data: unknown;
  sheet_type: string;
  custom_layout?: unknown;
  custom_css?: string | null;
}

export function readVariants(raw: unknown): SystemVariants {
  if (!raw || typeof raw !== 'object') return {};
  const out: SystemVariants = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const rec = v as Record<string, unknown>;
      out[normalizeSystem(k)] = {
        data: rec.data ?? null,
        sheet_type: typeof rec.sheet_type === 'string' ? rec.sheet_type : 'default',
        custom_layout: rec.custom_layout,
        custom_css: (rec.custom_css as string | null | undefined) ?? '',
      };
    }
  }
  return out;
}

/** Snapshot the character's current active columns into a variant object. */
export function snapshotActive(active: ActiveSheet): SystemVariant {
  return {
    data: active.data,
    sheet_type: active.sheet_type || 'default',
    custom_layout: active.custom_layout,
    custom_css: active.custom_css ?? '',
  };
}

/** The list of systems this character has a sheet for (active + every stored variant). */
export function builtSystems(active: ActiveSheet, variants: SystemVariants): string[] {
  const set = new Set<string>([normalizeSystem(active.system)]);
  for (const k of Object.keys(variants)) set.add(normalizeSystem(k));
  return Array.from(set);
}

/** True when the character already has a sheet built for `system`. */
export function hasVariant(active: ActiveSheet, variants: SystemVariants, system: string): boolean {
  const s = normalizeSystem(system);
  return normalizeSystem(active.system) === s || s in variants;
}

/**
 * Switch the active system to `target` (which must already have a variant). Returns the new
 * live columns + the updated variants map. The current active sheet is snapshotted back into
 * its own slot first, so no per-system edits are lost. Throws if `target` has no variant and
 * is not the current active system (the caller should transpose to create it first).
 */
export function switchActive(
  active: ActiveSheet,
  variants: SystemVariants,
  target: string,
): { active: ActiveSheet; variants: SystemVariants } {
  const cur = normalizeSystem(active.system);
  const tgt = normalizeSystem(target);
  if (tgt === cur) return { active, variants };
  if (!(tgt in variants)) throw new Error(`No ${tgt} variant to switch to — transpose first.`);
  const nextVariants: SystemVariants = { ...variants };
  // Store the current active back into its slot.
  nextVariants[cur] = snapshotActive(active);
  const chosen = nextVariants[tgt];
  // Loading a slot leaves that system with no stored variant (it's now the active one).
  delete nextVariants[tgt];
  return {
    active: {
      system: tgt,
      data: chosen.data,
      sheet_type: chosen.sheet_type || 'default',
      custom_layout: chosen.custom_layout,
      custom_css: chosen.custom_css ?? '',
    },
    variants: nextVariants,
  };
}

/**
 * Install a freshly-transposed sheet for `target` as the new active system, snapshotting the
 * current active back into its slot. Used after the AI builds the target-system data.
 */
export function installTransposed(
  active: ActiveSheet,
  variants: SystemVariants,
  target: string,
  transposedData: unknown,
): { active: ActiveSheet; variants: SystemVariants } {
  const cur = normalizeSystem(active.system);
  const tgt = normalizeSystem(target);
  const nextVariants: SystemVariants = { ...variants };
  if (tgt !== cur) nextVariants[cur] = snapshotActive(active);
  delete nextVariants[tgt];
  return {
    active: { system: tgt, data: transposedData, sheet_type: 'default', custom_layout: { blocks: [] }, custom_css: '' },
    variants: nextVariants,
  };
}
