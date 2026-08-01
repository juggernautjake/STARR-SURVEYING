// lib/dnd/maps/object-edits.ts — what a map object may become, and how to put it back (M4-2 · G7).
//
// Two jobs, and they belong together because they are two halves of one rule: the fields a DM can change
// are exactly the fields undo has to restore. Splitting them is how a resize becomes possible and
// un-undoable at the same time — the route grows a field, the journal never hears about it, and the first
// symptom is an undo that silently leaves half the change in place.
//
// PURE. No database, no clock, no randomness. The route reads rows and calls these.

/** A `dnd_map_objects` row, as far as this module is concerned. */
export interface MapObjectRow {
  id: string;
  map_node_id: string;
  kind: string;
  x: number;
  y: number;
  /** Null means "no size of its own" — see `SIZEABLE_KINDS`. `rotation` and `z` are NOT NULL in the
   *  schema with defaults of 0, so they are never absent and never need a fallback at read time. */
  w: number | null;
  h: number | null;
  rotation: number;
  z: number;
  asset_url: string | null;
  label: string | null;
  description: string | null;
  dm_notes: string | null;
  visibility: string;
  data: unknown;
}

/**
 * Everything a PATCH may set, and therefore everything undo must restore.
 *
 * A whitelist rather than `...body`, for the reason `world/route.ts` records: mass assignment here would
 * let a caller move an object to another campaign's node (`map_node_id`), or set `id`. Those are not
 * fields with bad values, they are fields that are not the caller's to name at all.
 */
export const PATCHABLE = [
  'x', 'y', 'w', 'h', 'rotation', 'z', 'asset_url', 'label', 'description', 'dm_notes', 'visibility', 'data',
] as const;
export type PatchableField = (typeof PATCHABLE)[number];

/** Every column the journal stores, so a restore is a whole row rather than a guess at which bits moved. */
export const OBJECT_COLUMNS = [
  'id', 'map_node_id', 'kind', 'x', 'y', 'w', 'h', 'rotation', 'z',
  'asset_url', 'label', 'description', 'dm_notes', 'visibility', 'data',
] as const;

/**
 * Size, in world units. A `null` means "this kind has no size of its own" — a TOKEN's footprint comes
 * from the creature's size category through the node's grid (M5-1b), and writing a width onto one would
 * be the map holding a second opinion about how big an Ogre is.
 *
 * So resize is refused for tokens rather than quietly overridden, and the UI does not offer it.
 */
export const SIZEABLE_KINDS = new Set(['image', 'prop', 'light', 'area', 'note']);

/** A map is 100 world units across; nothing on it may be bigger than the map or smaller than a hairline. */
export const MIN_SIZE = 0.5;
export const MAX_SIZE = 100;

export const clampSize = (n: number): number => Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));

/**
 * Rotation, normalised to [0, 360).
 *
 * Wrapped rather than clamped: a DM nudging a prop past 360° means one more turn, not "stop". Negative
 * input wraps the same way, because `-90` is how a "rotate left" control naturally counts.
 */
export function normalizeRotation(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = n % 360;
  return r < 0 ? r + 360 : r;
}

/** Layer order. Integers, because "between 3 and 4" is a z-order nobody can reason about at a table. */
export const clampZ = (n: number): number => Math.min(9999, Math.max(-9999, Math.round(n)));

/**
 * Where a duplicate lands.
 *
 * OFFSET, NOT ON TOP. A copy placed at exactly the original's position is invisible — the DM presses
 * duplicate, nothing appears to happen, they press it again, and now there are three trees in one spot.
 * One grid cell (or a world unit where there is no grid) is far enough to see and near enough to drag.
 */
export function duplicateOffset(gridSize: number | null): { dx: number; dy: number } {
  const step = gridSize && gridSize > 0 ? gridSize : 1;
  return { dx: step, dy: step };
}

export type EditAction = 'create' | 'update' | 'delete';

/**
 * What the undo control says it will take back.
 *
 * Names the OBJECT, not the operation — "Undo" on its own asks a DM to remember what they last did,
 * which mid-session they will not. `label` is whatever the object carries; a nameless one is described by
 * its kind, because "Removed prop" still tells you which of the two things you just did is going away.
 */
export function summarizeEdit(action: EditAction, row: Pick<MapObjectRow, 'kind' | 'label'>): string {
  const what = row.label?.trim() || `a ${row.kind}`;
  return { create: `Placed ${what}`, update: `Changed ${what}`, delete: `Removed ${what}` }[action];
}

/** One journalled change, in the shape the table stores. */
export interface EditEntry {
  entity: 'object' | 'discovery';
  entity_id: string;
  action: EditAction;
  before: unknown | null;
  after: unknown | null;
  summary: string | null;
}

/**
 * How to undo one journal entry: the row to write back, or the row to delete.
 *
 * `create` inverts to a delete, `delete` to an insert of the ORIGINAL ROW INCLUDING ITS ID, and `update`
 * to writing `before` back. Restoring the id matters more than it looks — a discovery, a trigger's
 * `targetId` and a DM's `?token=` link all point at it, so a re-insert under a fresh id would restore the
 * object and orphan everything that referred to it.
 */
export function invert(entry: EditEntry): { op: 'delete'; id: string } | { op: 'upsert'; row: unknown } {
  if (entry.action === 'create') return { op: 'delete', id: entry.entity_id };
  return { op: 'upsert', row: entry.before };
}

/**
 * The order to walk a batch when undoing it: NEWEST FIRST, ties broken by position within the batch.
 *
 * A batch that created a thing and then moved it must be inverted backwards, or the move's `before` is
 * written to a row the delete has not removed yet — and worse, on a batch that created then deleted, a
 * forwards walk re-inserts the row and then deletes it, ending with the object gone when the DM asked
 * for it back.
 *
 * ── THE TIE-BREAK IS NOT TIDINESS, IT IS THE WHOLE THING WORKING ───────────────────────────────────
 *
 * Every entry in one batch is written by a single INSERT, so they share a timestamp to the microsecond
 * and `created_at` alone is a tie for all of them. That is harmless until a batch holds rows that
 * depend on each other — deleting a hidden object journals the object AND the discoveries that cascaded
 * with it, and restoring a discovery before its object is refused by the foreign key.
 *
 * Measured live before this existed: the object came back, the discovery did not, and the response
 * still said `restored: 2`. So `seq` decides, descending, and the writer puts dependencies first.
 */
export function undoOrder<T extends { created_at: string; seq?: number }>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || (b.seq ?? 0) - (a.seq ?? 0),
  );
}

/**
 * What the undo control should call a batch: the first entry that has something to say.
 *
 * A batch's entries are not equally interesting. Deleting a found secret writes discovery rows with no
 * summary and then the object row with one, so taking the head entry's summary gives "Undone." with no
 * subject — which is exactly the moment a DM needs to know what just came back.
 */
export function batchSummary(entries: readonly { summary?: string | null }[]): string | null {
  return entries.find((e) => e.summary?.trim())?.summary?.trim() ?? null;
}
