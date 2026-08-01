// lib/dnd/maps/journal.ts — writing map edits down, and putting them back (M4-2 · G7).
//
// The I/O half of `object-edits.ts`, split for the same reason every other pair in this directory is:
// the rules are pure and asserted, this is the part that talks to the database.
//
// ── ONE BATCH PER USER ACTION, DECIDED BY THE ROUTE ────────────────────────────────────────────────
//
// The batch id is minted by the caller and passed in, not generated per write. That is what makes
// "remove these four tokens" one undo instead of four — and it is also why `record` takes an array: a
// bulk action that journalled one row per request would be four batches that happened to arrive
// together, and a DM pressing undo would get one token back.

import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import {
  OBJECT_COLUMNS, batchSummary, summarizeEdit, undoOrder,
  type EditAction, type MapObjectRow,
} from './object-edits';

export const OBJECT_COLS = OBJECT_COLUMNS.join(', ');

export const newBatchId = () => crypto.randomUUID();

export interface JournalEntry {
  entity?: 'object' | 'discovery';
  entityId: string;
  action: EditAction;
  before?: unknown;
  after?: unknown;
  summary?: string | null;
}

/**
 * Write a batch of changes to the journal.
 *
 * FAILURES THROW. The obvious shape here is fire-and-forget — the edit already succeeded, so why let the
 * audit row take the request down? Because a change that happened and was not journalled is a change
 * that cannot be undone, and the DM has no way to discover that until they try. `seeds/463` records this
 * exact failure on the character sheet: a silent insert rejected by a CHECK meant every library grant
 * went unaudited and `revert-batch` answered "that change was not found".
 */
export async function record(
  nodeId: string,
  batchId: string,
  editorUserId: string | null,
  entries: readonly JournalEntry[],
): Promise<void> {
  if (!entries.length) return;
  const { error } = await supabaseAdmin.from('dnd_map_edits').insert(
    entries.map((e, i) => ({
      map_node_id: nodeId,
      batch_id: batchId,
      editor_user_id: editorUserId,
      entity: e.entity ?? 'object',
      entity_id: e.entityId,
      action: e.action,
      before: e.before ?? null,
      after: e.after ?? null,
      // Position in the batch. The undo walks DESCENDING, so a caller puts anything that must be
      // restored LAST — a discovery, which cannot exist before its object — FIRST. Every row in this
      // insert shares a `created_at` to the microsecond, so without this the order is whatever Postgres
      // felt like, and a foreign key silently refuses half the undo.
      seq: i,
      summary: e.summary ?? null,
    })),
  );
  if (error) throw new Error(`map edit journal write failed: ${error.message}`);
}

/** Read whole rows, for the `before` half of an update or delete. */
export async function readObjects(ids: readonly string[]): Promise<MapObjectRow[]> {
  if (!ids.length) return [];
  const { data } = await supabaseAdmin.from('dnd_map_objects').select(OBJECT_COLS).in('id', ids as string[]);
  return (data ?? []) as unknown as MapObjectRow[];
}

/**
 * The discoveries that a delete is about to destroy.
 *
 * `dnd_map_discoveries.map_object_id` cascades, so removing a hidden object the rogue had already found
 * takes the party's knowledge of it with it. Journalling those rows in the same batch is the difference
 * between an undo that restores the secret and one that restores the secret while quietly forgetting
 * that anyone had found it — a disagreement between the map and the table that nobody could see happen.
 */
export async function readDiscoveries(objectIds: readonly string[]) {
  if (!objectIds.length) return [];
  const { data } = await supabaseAdmin
    .from('dnd_map_discoveries')
    .select('id, map_object_id, character_id, found_at, found_by_roll')
    .in('map_object_id', objectIds as string[]);
  return (data ?? []) as Array<{ id: string; map_object_id: string; character_id: string; found_at: string; found_by_roll: number | null }>;
}

export interface UndoResult {
  ok: boolean;
  /** What was taken back, for the DM's confirmation. Null when there was nothing to undo. */
  summary: string | null;
  restored: number;
  /**
   * Entries the database refused, named rather than swallowed.
   *
   * The first version counted every attempt as a success and answered `restored: 2` for an undo that
   * had restored one row and been refused the other. A half-undo reported as a whole one is the worst
   * outcome available here, because the DM has no reason to go and look.
   */
  failed?: string[];
}

/**
 * Undo the most recent batch on a node that has not already been undone.
 *
 * PER NODE, because that is the scope a DM is looking at when they want it back. Undoing across the
 * whole campaign would let a DM standing in a tavern take back a change they made to a continent an hour
 * ago and never see it happen.
 */
export async function undoLatestBatch(nodeId: string): Promise<UndoResult> {
  const { data: head } = await supabaseAdmin
    .from('dnd_map_edits')
    .select('batch_id, summary, created_at')
    .eq('map_node_id', nodeId)
    .is('undone_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!head) return { ok: false, summary: null, restored: 0 };

  const batchId = (head as { batch_id: string }).batch_id;
  const { data: rows } = await supabaseAdmin
    .from('dnd_map_edits')
    .select('id, entity, entity_id, action, before, after, created_at, seq, summary')
    .eq('batch_id', batchId);

  type Row = { id: string; entity: 'object' | 'discovery'; entity_id: string; action: EditAction; before: unknown; after: unknown; created_at: string; seq: number; summary: string | null };
  const entries = undoOrder((rows ?? []) as Row[]);

  let restored = 0;
  const failed: string[] = [];
  for (const e of entries) {
    const table = e.entity === 'discovery' ? 'dnd_map_discoveries' : 'dnd_map_objects';
    let error: { message: string } | null = null;
    if (e.action === 'create') {
      // Inverts to a delete. A create whose row someone has since deleted by hand is a no-op, not an
      // error — the DM's intent ("that thing should not be there") is already satisfied.
      ({ error } = await supabaseAdmin.from(table).delete().eq('id', e.entity_id));
    } else if (e.before) {
      // UPSERT, not update: a delete's row no longer exists, and an update's might have been deleted
      // since. Both end in "the row is exactly what it was", which is what undo means.
      //
      // The ORIGINAL ID is restored with it. A fresh id would put the object back and orphan every
      // discovery, trigger reference and shared `?token=` link that pointed at it.
      ({ error } = await supabaseAdmin.from(table).upsert(e.before as Record<string, unknown>, { onConflict: 'id' }));
    } else {
      continue;
    }
    // READ, never discarded. Silently counting a refusal as a success is what turned a half-undo into a
    // confident `restored: 2` the first time this ran.
    if (error) failed.push(`${e.entity} ${e.entity_id}: ${error.message}`);
    else restored++;
  }

  // Marked AFTER the work, and only when ALL of it landed. A batch recorded as undone while half of it
  // is still applied is a batch the DM can never finish undoing.
  if (!failed.length) {
    await supabaseAdmin
      .from('dnd_map_edits')
      .update({ undone_at: new Date().toISOString() })
      .eq('batch_id', batchId);
  }

  // The batch's summary, not the head entry's. Deleting a found secret journals the discoveries (no
  // summary) before the object (the one that says what happened), so reading the head gives "Undone."
  // with no subject — at exactly the moment a DM needs to know what came back.
  return { ok: true, summary: batchSummary(entries), restored, ...(failed.length ? { failed } : {}) };
}

/** What the undo control should say it will take back, or null when there is nothing. */
export async function pendingUndo(nodeId: string): Promise<string | null> {
  const { data: head } = await supabaseAdmin
    .from('dnd_map_edits')
    .select('batch_id')
    .eq('map_node_id', nodeId)
    .is('undone_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!head) return null;
  // The BATCH's summary, for the same reason `undoLatestBatch` reads it that way — the newest entry in a
  // batch is often a discovery row with nothing to say, and a button reading "⟲ Undo" with no subject
  // asks a DM mid-session to remember what they last did.
  const { data: rows } = await supabaseAdmin
    .from('dnd_map_edits')
    .select('summary, created_at, seq')
    .eq('batch_id', (head as { batch_id: string }).batch_id);
  return batchSummary(undoOrder((rows ?? []) as Array<{ summary: string | null; created_at: string; seq: number }>));
}

export { summarizeEdit };
