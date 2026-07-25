// lib/dnd/variant-breakdown.ts — read a character's LEVEL and per-class breakdown out of any system's stored
// `data` blob (VT). The variant browser shows each version's level, and — for a multiclass character — each
// class with the number of levels in it (e.g. "Fighter 3 / Wizard 2"). Pure + defensive: `data` is untyped
// jsonb here, and PF2/IG keep their real sheet in the `data.pf2e` / `data.ig` sidecars while 5e/ambiguous use
// the shared `data.meta`, so the read branches by system.
import { normalizeSystem } from './systems';
import { findClass } from './classes/registry';
import type { ClassLevel } from './classes/types';

/** One class a character has levels in, resolved to display names for the UI. */
export interface ClassBreakdownEntry { name: string; levels: number; subclass?: string }

/** A character's level + per-class breakdown, read from a stored sheet. `classes` is always non-empty for a
 *  built sheet; a blank/unbuilt sheet yields an empty `classes` and level 1. */
export interface SheetBreakdown {
  level: number;
  classes: ClassBreakdownEntry[];
  /** True when the character has levels in more than one class (drives the "Multiclass" tag). */
  multiclass: boolean;
}

const asInt = (v: unknown, dflt = 1): number => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : dflt);
const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Resolve a 5e class KEY (or legacy display name) to its display name; falls back to the raw key. */
function className5e(system: string, keyOrName: string): string {
  if (!keyOrName) return '';
  return findClass(system, keyOrName)?.name ?? keyOrName;
}

/** Read the level + per-class breakdown from a sheet's `data` for its `system`. */
export function sheetClassBreakdown(data: unknown, system: string): SheetBreakdown {
  const sys = normalizeSystem(system);
  const d = (data ?? {}) as Record<string, unknown>;

  // ── Pathfinder 2e — the real sheet is in the `data.pf2e` sidecar (identity holds level/class). ──
  const pf2 = (d.pf2e as { identity?: Record<string, unknown> } | undefined)?.identity;
  if (sys === 'pathfinder2e' && pf2) {
    const level = asInt(pf2.level);
    const name = asStr(pf2.className);
    const subclass = asStr(pf2.subclass) || undefined;
    const classes = name ? [{ name, levels: level, ...(subclass ? { subclass } : {}) }] : [];
    return { level, classes, multiclass: false }; // PF2 multiclass is via archetype feats, not class levels
  }

  // ── Intuitive Games — the real sheet is in the `data.ig` sidecar. ──
  const ig = (d.ig as { identity?: Record<string, unknown> } | undefined)?.identity;
  if (sys === 'intuitive-games' && ig) {
    const level = asInt(ig.level);
    const name = asStr(ig.className);
    const subclass = asStr(ig.subclass) || asStr(ig.specialization) || undefined;
    const classes = name ? [{ name, levels: level, ...(subclass ? { subclass } : {}) }] : [];
    return { level, classes, multiclass: false };
  }

  // ── 5e / system-ambiguous — the shared `data.meta` (with optional multiclass `classes[]`). ──
  const meta = (d.meta ?? {}) as Record<string, unknown>;
  const level = asInt(meta.level);
  const multi = Array.isArray(meta.classes) ? (meta.classes as ClassLevel[]).filter((c) => c && (c.classKey || (c as { className?: string }).className)) : [];
  if (multi.length) {
    const classes = multi.map((c) => ({
      name: className5e(sys, c.classKey ?? (c as { className?: string }).className ?? ''),
      levels: asInt(c.level),
      ...(c.subclassKey ? { subclass: className5e(sys, c.subclassKey) } : {}),
    })).filter((c) => c.name);
    return { level, classes, multiclass: classes.length > 1 };
  }
  const name = asStr(meta.className);
  const subclass = asStr(meta.subclass) || undefined;
  const classes = name ? [{ name, levels: level, ...(subclass ? { subclass } : {}) }] : [];
  return { level, classes, multiclass: false };
}

/** A one-line class/level label for a breakdown, e.g. "Fighter 3 / Wizard 2" or "Level 5 Champion". Empty for
 *  an unbuilt sheet (the caller can then just show "Level N"). */
export function breakdownLabel(b: SheetBreakdown): string {
  if (!b.classes.length) return '';
  if (b.classes.length === 1) {
    const c = b.classes[0];
    return c.subclass ? `${c.name} (${c.subclass}) · Lv ${c.levels}` : `${c.name} · Lv ${c.levels}`;
  }
  return b.classes.map((c) => `${c.name} ${c.levels}`).join(' / ');
}
