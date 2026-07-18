// lib/dnd/system-variants.ts — pure helpers for per-character multi-system variants (Slice 13).
//
// A character holds an ACTIVE system (the `system` column, driving the live `data` /
// `sheet_type` / `custom_layout` / `custom_css`) plus a map of OTHER systems' sheets in
// `system_variants`. Switching the active system is a snapshot-then-swap: the current
// active columns are stored back into their system's slot, and the target system's slot is
// loaded into the live columns. Transposing generates a target slot on demand. These
// helpers are pure so the switch/transpose logic is unit-tested; the route just persists.
import { normalizeSystem } from './systems';

/** Whether a stored sheet was built with only the system's VANILLA content, or includes CUSTOM (invented /
 *  homebrew) content — the label the owner wants so a character can hold both a vanilla and a custom build of
 *  the same system (Area MV). */
export type SheetVariantKind = 'vanilla' | 'custom';

/** A sheet's kind, defaulting to 'vanilla' for legacy/unlabelled variants (back-compat). */
export function variantKind(v: { kind?: unknown } | null | undefined): SheetVariantKind {
  return v && (v as { kind?: unknown }).kind === 'custom' ? 'custom' : 'vanilla';
}

/** The human label for a variant kind, shown on the sheet + switcher. */
export function variantKindLabel(kind: SheetVariantKind): string {
  return kind === 'custom' ? 'Custom-built' : 'Vanilla';
}

/** One system's stored sheet (mirrors the character's live sheet columns). */
export interface SystemVariant {
  data: unknown;
  sheet_type: string;
  custom_layout?: unknown;
  custom_css?: string | null;
  /** Vanilla vs custom build (Area MV) — defaults to 'vanilla' when absent. */
  kind?: SheetVariantKind;
  /** A user-facing name for this sheet (Area MV) — custom or the auto-default. */
  name?: string;
  /** Which system this sheet is FOR (Area MV1b). Lets a system hold multiple sheets: the map key becomes a
   *  slot id, and this records the system independently. Falls back to the map key (legacy = key is system). */
  system?: string;
}

export type SystemVariants = Record<string, SystemVariant>;

/** The live-column fields a variant snapshots. */
export interface ActiveSheet {
  system: string;
  data: unknown;
  sheet_type: string;
  custom_layout?: unknown;
  custom_css?: string | null;
  /** Vanilla vs custom build (Area MV). */
  kind?: SheetVariantKind;
  /** A user-facing name for this sheet (Area MV). */
  name?: string;
  /** Which slot this live sheet came from (Area MV2), so switching snapshots it back to the same slot id
   *  instead of colliding with another sheet of the same system. Absent on legacy data → generated on demand. */
  slotId?: string;
}

/** A quick default name for a sheet, so every sheet is identifiable without the user naming it (Area MV):
 *  e.g. "Pathfinder 2e · Vanilla" / "D&D 5e (2024) · Custom-built". Callers may pass a `systemLabel`. */
export function defaultVariantName(systemLabel: string, kind: SheetVariantKind): string {
  return `${systemLabel} · ${variantKindLabel(kind)}`;
}

/** Reserved key in `system_variants` holding the ACTIVE sheet's slot metadata (Area MV2b): its slotId, kind
 *  and name. The active sheet lives in the character's live columns (which have no slot/kind/name column), so
 *  this jsonb key persists that metadata — no schema change. Never a real sheet slot. */
export const ACTIVE_SLOT_META_KEY = '__activeSlot';

/** True for reserved (non-sheet) keys in the variants map. */
const isReservedKey = (k: string): boolean => k.startsWith('__');

/** The persisted metadata for the character's active sheet (Area MV2b). */
export interface ActiveSlotMeta { slotId?: string; kind?: SheetVariantKind; name?: string }

/** Read the active sheet's slot metadata out of the raw `system_variants` jsonb. */
export function readActiveSlotMeta(raw: unknown): ActiveSlotMeta {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[ACTIVE_SLOT_META_KEY] : null;
  if (!rec || typeof rec !== 'object') return {};
  const m = rec as Record<string, unknown>;
  return {
    ...(typeof m.slotId === 'string' ? { slotId: m.slotId } : {}),
    kind: variantKind(m),
    ...(typeof m.name === 'string' && m.name.trim() ? { name: m.name.trim() } : {}),
  };
}

/** Merge the active sheet's slot metadata into a variants map for persistence (Area MV2b). */
export function withActiveSlotMeta(variants: SystemVariants, active: ActiveSheet): Record<string, unknown> {
  const meta: ActiveSlotMeta = {
    ...(active.slotId ? { slotId: active.slotId } : {}),
    kind: variantKind(active),
    ...(active.name ? { name: active.name } : {}),
  };
  return { ...variants, [ACTIVE_SLOT_META_KEY]: meta };
}

export function readVariants(raw: unknown): SystemVariants {
  if (!raw || typeof raw !== 'object') return {};
  const out: SystemVariants = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isReservedKey(k)) continue; // skip the active-slot meta + any future reserved keys
    if (v && typeof v === 'object') {
      const rec = v as Record<string, unknown>;
      out[k] = {
        data: rec.data ?? null,
        sheet_type: typeof rec.sheet_type === 'string' ? rec.sheet_type : 'default',
        custom_layout: rec.custom_layout,
        custom_css: (rec.custom_css as string | null | undefined) ?? '',
        kind: variantKind(rec),
        // The variant's own system: explicit `system` field, else the map key (legacy — key IS the system).
        system: normalizeSystem((typeof rec.system === 'string' ? rec.system : undefined) ?? k),
        ...(typeof rec.name === 'string' && rec.name.trim() ? { name: rec.name.trim() } : {}),
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
    kind: variantKind(active),
    system: normalizeSystem(active.system),
    ...(active.name ? { name: active.name } : {}),
  };
}

/** A variant's system — its explicit `system` field, else fall back to `key` (legacy = key IS the system). */
export function variantSystemOf(v: SystemVariant, key: string): string {
  return normalizeSystem(v.system ?? key);
}

/** The list of systems this character has a sheet for (active + every stored variant). Uses each variant's
 *  own system, so it's correct once a system holds multiple slots (MV1b). */
export function builtSystems(active: ActiveSheet, variants: SystemVariants): string[] {
  const set = new Set<string>([normalizeSystem(active.system)]);
  for (const [k, v] of Object.entries(variants)) set.add(variantSystemOf(v, k));
  return Array.from(set);
}

/** True when the character already has a sheet built for `system`. */
export function hasVariant(active: ActiveSheet, variants: SystemVariants, system: string): boolean {
  const s = normalizeSystem(system);
  if (normalizeSystem(active.system) === s) return true;
  return Object.entries(variants).some(([k, v]) => variantSystemOf(v, k) === s);
}

/** A flat, UI-friendly list of ALL of a character's sheets (active + variants), each with its slot id,
 *  system, kind and display name (Area MV1b) — what the switcher/"+" UI renders. `systemLabelFn` supplies a
 *  human system name for the auto-default sheet name. */
export interface SheetSlot { slotId: string; system: string; kind: SheetVariantKind; name: string; active: boolean }
export function listSheets(active: ActiveSheet, variants: SystemVariants, systemLabelFn: (s: string) => string): SheetSlot[] {
  const nameFor = (v: { name?: string; kind?: SheetVariantKind }, system: string): string =>
    (v.name && v.name.trim()) || defaultVariantName(systemLabelFn(system), variantKind(v));
  const out: SheetSlot[] = [{
    // Its real slotId when known (from the active-slot meta), else an `active:` marker — matches the route.
    slotId: active.slotId ?? `active:${normalizeSystem(active.system)}`,
    system: normalizeSystem(active.system),
    kind: variantKind(active),
    name: nameFor(active, normalizeSystem(active.system)),
    active: true,
  }];
  for (const [k, v] of Object.entries(variants)) {
    const system = variantSystemOf(v, k);
    out.push({ slotId: k, system, kind: variantKind(v), name: nameFor(v, system), active: false });
  }
  return out;
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
      kind: variantKind(chosen),
      ...(chosen.name ? { name: chosen.name } : {}),
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
  opts: { kind?: SheetVariantKind; name?: string } = {},
): { active: ActiveSheet; variants: SystemVariants } {
  const cur = normalizeSystem(active.system);
  const tgt = normalizeSystem(target);
  const nextVariants: SystemVariants = { ...variants };
  if (tgt !== cur) nextVariants[cur] = snapshotActive(active);
  delete nextVariants[tgt];
  // Label the freshly-built sheet (Area MV): a custom-consented transpose is 'custom', else 'vanilla'.
  const kind: SheetVariantKind = opts.kind === 'custom' ? 'custom' : 'vanilla';
  return {
    active: { system: tgt, data: transposedData, sheet_type: 'default', custom_layout: { blocks: [] }, custom_css: '', kind, ...(opts.name ? { name: opts.name } : {}) },
    variants: nextVariants,
  };
}

// ── Slot-based operations (Area MV2) — switch to a SPECIFIC sheet, or add a new one for a system. ──────────

/** A fresh, unique slot id for a new sheet of `system`: the bare system if free, else `system#2`, `#3`, …
 *  (so the first sheet keeps the clean, back-compatible key). */
export function newSlotId(variants: SystemVariants, system: string): string {
  const s = normalizeSystem(system);
  if (!(s in variants)) return s;
  let n = 2;
  while (`${s}#${n}` in variants) n++;
  return `${s}#${n}`;
}

/** Add a new (stored) sheet slot for `system` without changing the active sheet. Returns the updated map +
 *  the new slot id. Used by the "+" add-sheet flow (MV2) and a custom transpose that should ADD a slot. */
export function addSheetSlot(
  variants: SystemVariants,
  spec: { system: string; kind: SheetVariantKind; name?: string; data?: unknown; sheet_type?: string },
): { variants: SystemVariants; slotId: string } {
  const s = normalizeSystem(spec.system);
  const slotId = newSlotId(variants, s);
  const next: SystemVariants = {
    ...variants,
    [slotId]: {
      data: spec.data ?? null,
      sheet_type: spec.sheet_type ?? 'default',
      custom_layout: { blocks: [] },
      custom_css: '',
      kind: spec.kind,
      system: s,
      ...(spec.name && spec.name.trim() ? { name: spec.name.trim() } : {}),
    },
  };
  return { variants: next, slotId };
}

/** Switch the active sheet to a SPECIFIC stored slot (Area MV2). Snapshots the current active back into its
 *  own slot first (its `slotId`, or a fresh one), so a system's multiple sheets never collide. Throws if the
 *  slot doesn't exist. */
export function switchToSlot(
  active: ActiveSheet,
  variants: SystemVariants,
  targetSlotId: string,
): { active: ActiveSheet; variants: SystemVariants } {
  if (!(targetSlotId in variants)) throw new Error(`No sheet slot "${targetSlotId}" to switch to.`);
  const next: SystemVariants = { ...variants };
  const activeSlot = active.slotId ?? newSlotId(next, active.system);
  next[activeSlot] = snapshotActive(active);
  const chosen = next[targetSlotId];
  delete next[targetSlotId];
  return {
    active: {
      slotId: targetSlotId,
      system: variantSystemOf(chosen, targetSlotId),
      data: chosen.data,
      sheet_type: chosen.sheet_type || 'default',
      custom_layout: chosen.custom_layout,
      custom_css: chosen.custom_css ?? '',
      kind: variantKind(chosen),
      ...(chosen.name ? { name: chosen.name } : {}),
    },
    variants: next,
  };
}

/** Remove a stored sheet slot (Area MV). No-op if the slot doesn't exist. The ACTIVE sheet lives in the live
 *  columns, not here, so it can never be deleted through this — the caller guards that. */
export function deleteVariant(variants: SystemVariants, slotId: string): SystemVariants {
  if (!(slotId in variants)) return variants;
  const next: SystemVariants = { ...variants };
  delete next[slotId];
  return next;
}

/** Rename a stored sheet slot (Area MV). Empty name clears back to the auto-default. No-op if not found. */
export function renameVariant(variants: SystemVariants, slotId: string, name: string): SystemVariants {
  if (!(slotId in variants)) return variants;
  const trimmed = name.trim();
  const { name: _drop, ...rest } = variants[slotId];
  void _drop;
  return { ...variants, [slotId]: { ...rest, ...(trimmed ? { name: trimmed } : {}) } };
}
