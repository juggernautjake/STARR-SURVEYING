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
  // ── Variant-tracker fields (VT). All optional + additive; legacy slots read as origin/vanilla/no-summary. ──
  /** The slot this sheet was forked FROM (git-like lineage, VT). Absent on the original (lineage root). */
  parentSlotId?: string;
  /** This variant's own image (VT) — captured on fork/snapshot so each version shows a distinct portrait. */
  artUrl?: string | null;
  /** The campaign this variant belongs to (VT) — variants can live in different campaigns than the original. */
  campaignId?: string | null;
  /** The AI-generated summary of this variant (VT), revealed by the card's summary tooltip. */
  summary?: string;
  /** ISO timestamp the summary was generated (VT). */
  summaryUpdatedAt?: string;
  /** Hash of the sheet digest the summary was built from (VT) — lets the UI flag a stale summary after edits. */
  summaryHash?: string;
  /** A working-copy being edited (Edit-flow draft). Excluded from the versions list; on Save it either
   *  overwrites its source (commit) or becomes a permanent variant (promote). Transient. */
  draft?: boolean;
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
  // ── Variant-tracker fields (VT), carried through snapshot/switch so the active sheet keeps its lineage. ──
  /** The slot this active sheet was forked from (VT). Absent on the original. */
  parentSlotId?: string;
  /** The active sheet's image (VT) — the character's `art_url` column is the source of truth; seeded from it. */
  artUrl?: string | null;
  /** The campaign this active sheet belongs to (VT). */
  campaignId?: string | null;
  /** The active sheet's AI summary + freshness metadata (VT). */
  summary?: string;
  summaryUpdatedAt?: string;
  summaryHash?: string;
  /** The active sheet is a working-copy draft being edited (Edit-flow). */
  draft?: boolean;
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

/** The persisted metadata for the character's active sheet (Area MV2b + VT lineage/summary/art fields). */
export interface ActiveSlotMeta {
  slotId?: string; kind?: SheetVariantKind; name?: string;
  parentSlotId?: string; artUrl?: string | null; campaignId?: string | null;
  summary?: string; summaryUpdatedAt?: string; summaryHash?: string;
}

/** Read the active sheet's slot metadata out of the raw `system_variants` jsonb. */
export function readActiveSlotMeta(raw: unknown): ActiveSlotMeta {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[ACTIVE_SLOT_META_KEY] : null;
  if (!rec || typeof rec !== 'object') return {};
  const m = rec as Record<string, unknown>;
  return {
    ...(typeof m.slotId === 'string' ? { slotId: m.slotId } : {}),
    kind: variantKind(m),
    ...(typeof m.name === 'string' && m.name.trim() ? { name: m.name.trim() } : {}),
    ...(typeof m.parentSlotId === 'string' ? { parentSlotId: m.parentSlotId } : {}),
    ...(typeof m.artUrl === 'string' ? { artUrl: m.artUrl } : {}),
    ...(typeof m.campaignId === 'string' ? { campaignId: m.campaignId } : {}),
    ...(typeof m.summary === 'string' ? { summary: m.summary } : {}),
    ...(typeof m.summaryUpdatedAt === 'string' ? { summaryUpdatedAt: m.summaryUpdatedAt } : {}),
    ...(typeof m.summaryHash === 'string' ? { summaryHash: m.summaryHash } : {}),
    ...(m.draft === true ? { draft: true } : {}),
  };
}

/** Merge the active sheet's slot metadata into a variants map for persistence (Area MV2b + VT lineage/art/
 *  summary fields, so the active sheet keeps them across a page reload). */
export function withActiveSlotMeta(variants: SystemVariants, active: ActiveSheet): Record<string, unknown> {
  const meta: ActiveSlotMeta = {
    ...(active.slotId ? { slotId: active.slotId } : {}),
    kind: variantKind(active),
    ...(active.name ? { name: active.name } : {}),
    ...(active.parentSlotId ? { parentSlotId: active.parentSlotId } : {}),
    ...(active.artUrl != null ? { artUrl: active.artUrl } : {}),
    ...(active.campaignId != null ? { campaignId: active.campaignId } : {}),
    ...(active.summary != null ? { summary: active.summary } : {}),
    ...(active.summaryUpdatedAt ? { summaryUpdatedAt: active.summaryUpdatedAt } : {}),
    ...(active.summaryHash ? { summaryHash: active.summaryHash } : {}),
    ...(active.draft ? { draft: true } : {}),
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
        // ── Variant-tracker fields (VT), preserved verbatim so lineage/art/summary survive every write. ──
        ...(typeof rec.parentSlotId === 'string' ? { parentSlotId: rec.parentSlotId } : {}),
        ...(typeof rec.artUrl === 'string' ? { artUrl: rec.artUrl } : {}),
        ...(typeof rec.campaignId === 'string' ? { campaignId: rec.campaignId } : {}),
        ...(typeof rec.summary === 'string' ? { summary: rec.summary } : {}),
        ...(typeof rec.summaryUpdatedAt === 'string' ? { summaryUpdatedAt: rec.summaryUpdatedAt } : {}),
        ...(typeof rec.summaryHash === 'string' ? { summaryHash: rec.summaryHash } : {}),
        ...(rec.draft === true ? { draft: true } : {}),
      };
    }
  }
  return out;
}

/** Snapshot the character's current active columns into a variant object. Carries the VT lineage/art/summary
 *  metadata so a sheet parked back into its slot keeps its parent, image and summary. */
export function snapshotActive(active: ActiveSheet): SystemVariant {
  return {
    data: active.data,
    sheet_type: active.sheet_type || 'default',
    custom_layout: active.custom_layout,
    custom_css: active.custom_css ?? '',
    kind: variantKind(active),
    system: normalizeSystem(active.system),
    ...(active.name ? { name: active.name } : {}),
    ...(active.parentSlotId ? { parentSlotId: active.parentSlotId } : {}),
    ...(active.artUrl != null ? { artUrl: active.artUrl } : {}),
    ...(active.campaignId != null ? { campaignId: active.campaignId } : {}),
    ...(active.summary != null ? { summary: active.summary } : {}),
    ...(active.summaryUpdatedAt ? { summaryUpdatedAt: active.summaryUpdatedAt } : {}),
    ...(active.summaryHash ? { summaryHash: active.summaryHash } : {}),
    ...(active.draft ? { draft: true } : {}),
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
export interface SheetSlot {
  slotId: string; system: string; kind: SheetVariantKind; name: string; active: boolean; level: number;
  // ── Variant-tracker fields (VT) — small display/lineage metadata, safe to serialize to the client.
  //    `origin` is optional so legacy SheetSlot literals still typecheck; listSheets always sets it. ──
  origin?: boolean;
  parentSlotId?: string;
  artUrl?: string | null;
  campaignId?: string | null;
  summary?: string;
  summaryUpdatedAt?: string;
  summaryHash?: string;
  draft?: boolean;
}
/** The character level a sheet's data records, read defensively (data is `unknown` here). Defaults
 *  to 1 so a blank/legacy sheet never reads as level 0. Used by the switcher to show each version's
 *  level and to offer "level up to match a higher version". */
function levelOf(data: unknown): number {
  const lvl = (data as { meta?: { level?: unknown } } | null)?.meta?.level;
  return typeof lvl === 'number' && lvl >= 1 ? Math.floor(lvl) : 1;
}
export function listSheets(active: ActiveSheet, variants: SystemVariants, systemLabelFn: (s: string) => string): SheetSlot[] {
  const nameFor = (v: { name?: string; kind?: SheetVariantKind }, system: string): string =>
    (v.name && v.name.trim()) || defaultVariantName(systemLabelFn(system), variantKind(v));
  const originId = resolveOriginSlotId(active, variants);
  const activeId = active.slotId ?? `active:${normalizeSystem(active.system)}`;
  const out: SheetSlot[] = [{
    // Its real slotId when known (from the active-slot meta), else an `active:` marker — matches the route.
    slotId: activeId,
    system: normalizeSystem(active.system),
    kind: variantKind(active),
    name: nameFor(active, normalizeSystem(active.system)),
    active: true,
    level: levelOf(active.data),
    origin: activeId === originId,
    ...(active.parentSlotId ? { parentSlotId: active.parentSlotId } : {}),
    ...(active.artUrl != null ? { artUrl: active.artUrl } : {}),
    ...(active.campaignId != null ? { campaignId: active.campaignId } : {}),
    ...(active.summary != null ? { summary: active.summary } : {}),
    ...(active.summaryUpdatedAt ? { summaryUpdatedAt: active.summaryUpdatedAt } : {}),
    ...(active.summaryHash ? { summaryHash: active.summaryHash } : {}),
    ...(active.draft ? { draft: true } : {}),
  }];
  for (const [k, v] of Object.entries(variants)) {
    const system = variantSystemOf(v, k);
    out.push({
      slotId: k, system, kind: variantKind(v), name: nameFor(v, system), active: false, level: levelOf(v.data),
      origin: k === originId,
      ...(v.parentSlotId ? { parentSlotId: v.parentSlotId } : {}),
      ...(v.artUrl != null ? { artUrl: v.artUrl } : {}),
      ...(v.campaignId != null ? { campaignId: v.campaignId } : {}),
      ...(v.summary != null ? { summary: v.summary } : {}),
      ...(v.summaryUpdatedAt ? { summaryUpdatedAt: v.summaryUpdatedAt } : {}),
      ...(v.summaryHash ? { summaryHash: v.summaryHash } : {}),
      ...(v.draft ? { draft: true } : {}),
    });
  }
  return out;
}

// ── Variant lineage, cap + fork (VT) — git-like branching. The ORIGINAL is the lineage root; every fork
//    carries a parentSlotId. Origin is DERIVED (no global pointer), so it survives every existing write path
//    (the /system route rebuilds the map, but per-slot fields are preserved by readVariants + withActiveSlotMeta). ──

/** The per-character version cap (VT, owner): at 20 total sheets, creating another is refused until one is
 *  deleted. */
export const MAX_VARIANTS = 20;

/** Total number of sheets (active + stored) the character holds. */
export function sheetCount(active: ActiveSheet, variants: SystemVariants): number {
  return 1 + Object.keys(variants).length;
}

/** True when the character is at the version cap and cannot create another variant (VT). */
export function isAtVariantCap(active: ActiveSheet, variants: SystemVariants): boolean {
  return sheetCount(active, variants) >= MAX_VARIANTS;
}

/** Every sheet as a {slotId, parentSlotId} ref (active first), for lineage math. */
function allSlotRefs(active: ActiveSheet, variants: SystemVariants): { slotId: string; parentSlotId?: string }[] {
  const activeId = active.slotId ?? `active:${normalizeSystem(active.system)}`;
  const refs: { slotId: string; parentSlotId?: string }[] = [{ slotId: activeId, ...(active.parentSlotId ? { parentSlotId: active.parentSlotId } : {}) }];
  for (const [k, v] of Object.entries(variants)) refs.push({ slotId: k, ...(v.parentSlotId ? { parentSlotId: v.parentSlotId } : {}) });
  return refs;
}

/** Rank a slot id for origin selection: a bare system key (the first sheet of a system gets the clean key) is
 *  the most likely original, then `#n` slots, then fork-prefixed ids, then the ephemeral `active:` marker
 *  (used only before a sheet has been assigned a real id). Lower rank = more likely the original. */
function originRank(slotId: string): number {
  if (slotId.startsWith('active:')) return 3;
  if (slotId.startsWith('variant-') || slotId.startsWith('fork-')) return 2;
  if (slotId.includes('#')) return 1;
  return 0;
}

/** The original sheet's slot id (VT): the parentless sheet that ranks first. Derived, deterministic, and
 *  independent of which sheet is active, so it stays stable after the user switches away from the original.
 *  Once a fork backfill has run there is exactly one parentless sheet (the origin); before it, the comparator
 *  still selects the same one, so read-only display and the eventual backfill agree. (For a legacy character
 *  with several pre-lineage sheets and no forks yet, this is a best-effort designation — see ensureLineage.) */
export function resolveOriginSlotId(active: ActiveSheet, variants: SystemVariants): string {
  const refs = allSlotRefs(active, variants);
  const parentless = refs.filter((r) => !r.parentSlotId);
  const pool = parentless.length ? parentless : refs;
  return pool.slice().sort((a, b) => originRank(a.slotId) - originRank(b.slotId) || a.slotId.localeCompare(b.slotId))[0].slotId;
}

/** True when `slotId` is the character's original sheet (VT). */
export function isOriginSlot(slotId: string, active: ActiveSheet, variants: SystemVariants): boolean {
  return slotId === resolveOriginSlotId(active, variants);
}

/** Ensure the active sheet has a stable slotId and that lineage has a SINGLE root (VT). Assigns the active
 *  sheet a real slotId if it lacks one, designates the origin, and backfills `parentSlotId` onto any OTHER
 *  parentless sheet (e.g. a pre-lineage transpose/add) so exactly one sheet stays parentless. Pure; the caller
 *  persists. Run by the fork route before creating a variant. */
export function ensureLineage(
  active: ActiveSheet,
  variants: SystemVariants,
): { active: ActiveSheet; variants: SystemVariants; originSlotId: string } {
  const nextActive: ActiveSheet = { ...active, slotId: active.slotId ?? newSlotId(variants, active.system) };
  const originSlotId = resolveOriginSlotId(nextActive, variants);
  const nextVariants: SystemVariants = { ...variants };
  for (const [k, v] of Object.entries(nextVariants)) {
    if (k !== originSlotId && !v.parentSlotId) nextVariants[k] = { ...v, parentSlotId: originSlotId };
  }
  if (nextActive.slotId !== originSlotId && !nextActive.parentSlotId) nextActive.parentSlotId = originSlotId;
  return { active: nextActive, variants: nextVariants, originSlotId };
}

/** Deep-clone a sheet's `data` (or any jsonb) defensively; used when forking so the variant owns its own copy. */
function cloneJson(d: unknown): unknown {
  return d == null ? null : JSON.parse(JSON.stringify(d));
}

/**
 * Create a NEW variant by forking an existing sheet (VT). `fromSlotId` selects the source — the active sheet's
 * slot id or a stored slot id. Deep-clones the source's data + presentation into a fresh slot whose
 * `parentSlotId` is the source, inheriting system/kind/art. Returns the lineage-ensured active sheet, the
 * updated variants map (with the new slot) and the new slot id; the caller switches to it to make the fork
 * active. Throws if the source doesn't exist. Does NOT enforce the cap — the route checks `isAtVariantCap`
 * first so it can return a friendly message.
 */
export function forkSheet(
  active: ActiveSheet,
  variants: SystemVariants,
  opts: { fromSlotId: string; name?: string },
): { active: ActiveSheet; variants: SystemVariants; newSlotId: string } {
  const lineage = ensureLineage(active, variants);
  const a = lineage.active;
  const vs = lineage.variants;
  const activeId = a.slotId as string;

  let src: { data: unknown; sheet_type: string; custom_layout?: unknown; custom_css?: string | null; system: string; kind: SheetVariantKind; artUrl?: string | null; name?: string };
  if (opts.fromSlotId === activeId) {
    src = {
      data: a.data, sheet_type: a.sheet_type, custom_layout: a.custom_layout, custom_css: a.custom_css,
      system: normalizeSystem(a.system), kind: variantKind(a), artUrl: a.artUrl ?? null, name: a.name,
    };
  } else if (opts.fromSlotId in vs) {
    const s = vs[opts.fromSlotId];
    src = {
      data: s.data, sheet_type: s.sheet_type, custom_layout: s.custom_layout, custom_css: s.custom_css,
      system: variantSystemOf(s, opts.fromSlotId), kind: variantKind(s), artUrl: s.artUrl ?? null, name: s.name,
    };
  } else {
    throw new Error(`No sheet "${opts.fromSlotId}" to fork.`);
  }

  // The active sheet is NOT in `vs` (it lives in the live columns), so its slot id must be treated as occupied
  // too — otherwise forking the active original (whose id is the bare system key) collides with it and the
  // fork would overwrite / self-parent the source. Reserve the active id when minting the new slot id.
  const occupied: SystemVariants = activeId in vs ? vs : { ...vs, [activeId]: {} as SystemVariant };
  const id = newSlotId(occupied, src.system);
  const nextVariants: SystemVariants = {
    ...vs,
    [id]: {
      data: cloneJson(src.data),
      sheet_type: src.sheet_type || 'default',
      custom_layout: cloneJson(src.custom_layout) ?? { blocks: [] },
      custom_css: src.custom_css ?? '',
      kind: src.kind,
      system: src.system,
      parentSlotId: opts.fromSlotId,
      ...(src.artUrl != null ? { artUrl: src.artUrl } : {}),
      ...((opts.name && opts.name.trim()) || src.name ? { name: (opts.name && opts.name.trim()) || src.name } : {}),
    },
  };
  return { active: a, variants: nextVariants, newSlotId: id };
}

// ── Edit-flow drafts (working copies) — begin/commit/promote/discard. A draft IS the active sheet while
//    editing (so every existing editor operates on it), flagged draft:true, forked from the source version
//    (its parentSlotId = the "original" this edit branches from). On Save it either overwrites the source
//    (commit — no new version), becomes a permanent variant (promote — source untouched), or is thrown away. ──

/** True when the active sheet is an in-progress edit draft. */
export function isDraftActive(active: ActiveSheet): boolean {
  return active.draft === true;
}

/** Load a STORED slot as the active sheet, DISCARDING whatever is currently active (used to finish a draft:
 *  the draft lives in the live columns and is simply not stored, so it vanishes). Throws if the slot is gone. */
function loadStoredAsActive(variants: SystemVariants, slotId: string): { active: ActiveSheet; variants: SystemVariants } {
  if (!(slotId in variants)) throw new Error(`No sheet "${slotId}" to load.`);
  const chosen = variants[slotId];
  const next: SystemVariants = { ...variants };
  delete next[slotId];
  return {
    active: {
      slotId, system: variantSystemOf(chosen, slotId), data: chosen.data,
      sheet_type: chosen.sheet_type || 'default', custom_layout: chosen.custom_layout, custom_css: chosen.custom_css ?? '',
      kind: variantKind(chosen), ...(chosen.name ? { name: chosen.name } : {}), ...activeVtFrom(chosen),
    },
    variants: next,
  };
}

/** Begin editing `fromSlotId` on a working-copy DRAFT (Edit-flow). Forks the source, flags the copy as a
 *  draft, and makes it active so the existing editors operate on it. Allowed even at the version cap (a draft
 *  is transient — the cap is re-checked when promoting it to a permanent variant). Returns the draft's slot id. */
export function beginDraft(
  active: ActiveSheet,
  variants: SystemVariants,
  opts: { fromSlotId: string; name?: string },
): { active: ActiveSheet; variants: SystemVariants; draftSlotId: string } {
  const forked = forkSheet(active, variants, { fromSlotId: opts.fromSlotId, name: opts.name });
  const withFlag: SystemVariants = { ...forked.variants, [forked.newSlotId]: { ...forked.variants[forked.newSlotId], draft: true } };
  const next = switchToSlot(forked.active, withFlag, forked.newSlotId);
  return { active: next.active, variants: next.variants, draftSlotId: forked.newSlotId };
}

/** SAVE → "this version": the active draft's content overwrites its SOURCE version (kept identity/lineage/
 *  name; replaced data + presentation + art), the draft is discarded, and the source becomes active. No new
 *  version is created. Throws if the active sheet isn't a draft with a resolvable source. */
export function commitDraftToOriginal(
  active: ActiveSheet,
  variants: SystemVariants,
): { active: ActiveSheet; variants: SystemVariants; targetSlotId: string } {
  if (!active.draft) throw new Error('Not editing a draft.');
  const target = active.parentSlotId;
  if (!target || !(target in variants)) throw new Error('The version this draft came from is no longer available — save it as a new variant instead.');
  const src = variants[target];
  // Overwrite the source's CONTENT with the draft's; keep the source's slot identity (name/kind label stays a
  // slot concern), lineage, campaign. The summary is left to go stale (hash mismatch) so it regenerates.
  const merged: SystemVariant = {
    ...src,
    data: active.data,
    sheet_type: active.sheet_type || 'default',
    custom_layout: active.custom_layout,
    custom_css: active.custom_css ?? '',
    kind: variantKind(active),
    ...(active.artUrl != null ? { artUrl: active.artUrl } : {}),
    draft: false,
  };
  const staged: SystemVariants = { ...variants, [target]: merged };
  const loaded = loadStoredAsActive(staged, target); // discards the draft (it was only in the live columns)
  return { active: loaded.active, variants: loaded.variants, targetSlotId: target };
}

/** SAVE → "new variant": the active draft becomes a PERMANENT variant (its `draft` flag cleared), branched from
 *  its source (which is left untouched). Enforces the version cap on the permanent count — throws when keeping
 *  the draft would exceed it (the caller should offer commit/discard instead). Optionally renames it. */
export function promoteDraftToVariant(
  active: ActiveSheet,
  variants: SystemVariants,
  opts: { name?: string } = {},
): { active: ActiveSheet; variants: SystemVariants } {
  if (!active.draft) throw new Error('Not editing a draft.');
  // Total sheets counts the draft (the active). Keeping it permanent must stay within the cap.
  if (sheetCount(active, variants) > MAX_VARIANTS) {
    throw new Error(`Keeping this as a new variant would exceed the ${MAX_VARIANTS}-version limit. Save it to the current version, or delete another version first.`);
  }
  const nextActive: ActiveSheet = { ...active, draft: false, ...(opts.name && opts.name.trim() ? { name: opts.name.trim() } : {}) };
  return { active: nextActive, variants };
}

/** DISCARD a draft: drop it and return to its source version, unchanged. Throws if not a draft with a source. */
export function discardDraft(
  active: ActiveSheet,
  variants: SystemVariants,
): { active: ActiveSheet; variants: SystemVariants } {
  if (!active.draft) throw new Error('Not editing a draft.');
  const target = active.parentSlotId;
  if (!target || !(target in variants)) throw new Error('The version this draft came from is no longer available.');
  return loadStoredAsActive(variants, target);
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
      ...activeVtFrom(chosen),
    },
    variants: nextVariants,
  };
}

/** The VT lineage/art/summary fields to carry from a stored slot onto the sheet becoming active. */
function activeVtFrom(v: SystemVariant): Partial<ActiveSheet> {
  return {
    ...(v.parentSlotId ? { parentSlotId: v.parentSlotId } : {}),
    ...(v.artUrl != null ? { artUrl: v.artUrl } : {}),
    ...(v.campaignId != null ? { campaignId: v.campaignId } : {}),
    ...(v.summary != null ? { summary: v.summary } : {}),
    ...(v.summaryUpdatedAt ? { summaryUpdatedAt: v.summaryUpdatedAt } : {}),
    ...(v.summaryHash ? { summaryHash: v.summaryHash } : {}),
    ...(v.draft ? { draft: true } : {}),
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

/**
 * Install a freshly-transposed sheet as a NEW slot and make it active, WITHOUT disturbing any sheet the
 * target system already has (Area MV). This is the "build another version of this character" path — e.g. a
 * custom-consented transpose alongside an existing vanilla sheet, or a second sheet for the same system.
 * Composes addSheetSlot (park the new sheet) + switchToSlot (activate it, snapshotting the current active).
 */
export function installTransposedNewSlot(
  active: ActiveSheet,
  variants: SystemVariants,
  target: string,
  transposedData: unknown,
  opts: { kind?: SheetVariantKind; name?: string } = {},
): { active: ActiveSheet; variants: SystemVariants } {
  const kind: SheetVariantKind = opts.kind === 'custom' ? 'custom' : 'vanilla';
  const { variants: withNew, slotId } = addSheetSlot(variants, { system: target, kind, name: opts.name, data: transposedData });
  return switchToSlot(active, withNew, slotId);
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
      ...activeVtFrom(chosen),
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
