// lib/dnd/edit-history.ts — pure helpers over the dnd_sheet_edits audit rows, for the history/undo
// feature (Area C). Deciding which batch "undo that" means, and summarizing recent changes so the AI
// can answer "what did you change?" — both are pure functions of the audit rows, so they're unit-tested
// here and the route just loads rows and calls them.

/** The audit-row fields these helpers read (a subset of dnd_sheet_edits). */
export interface EditHistoryRow {
  batch_id: string | null;
  source: string | null; // 'ai' | 'manual' | 'revert'
  field_path: string | null;
  summary: string | null;
  created_at: string;
}

const REVERT_BATCH_PREFIX = 'revert-batch:';

/** Batch ids that have already been undone (a `revert-batch:<id>` audit row exists for them). */
export function revertedBatchIds(rows: EditHistoryRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.source === 'revert' && r.field_path?.startsWith(REVERT_BATCH_PREFIX)) {
      out.add(r.field_path.slice(REVERT_BATCH_PREFIX.length));
    }
  }
  return out;
}

/**
 * The most recent AI batch that hasn't been reverted — what "undo that / put it back" refers to.
 * `rows` are the character's audit rows in ANY order (we sort by created_at desc ourselves). Returns
 * null when there's nothing undoable (no AI batch, or every AI batch already undone).
 */
export function latestUndoableBatch(rows: EditHistoryRow[]): { batchId: string; summary: string | null; createdAt: string } | null {
  const reverted = revertedBatchIds(rows);
  const aiBatches = rows
    .filter((r) => r.source === 'ai' && r.batch_id && !reverted.has(r.batch_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!aiBatches.length) return null;
  const top = aiBatches[0];
  return { batchId: top.batch_id!, summary: top.summary ?? null, createdAt: top.created_at };
}

/** Distinct recent AI batches (newest-first), each once with its summary — for a history timeline
 *  and for AI grounding. Excludes already-reverted batches by default. */
export function recentBatches(rows: EditHistoryRow[], limit = 8, includeReverted = false): { batchId: string; summary: string | null; createdAt: string; reverted: boolean }[] {
  const reverted = revertedBatchIds(rows);
  const seen = new Set<string>();
  const out: { batchId: string; summary: string | null; createdAt: string; reverted: boolean }[] = [];
  for (const r of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (r.source !== 'ai' || !r.batch_id || seen.has(r.batch_id)) continue;
    const isReverted = reverted.has(r.batch_id);
    if (isReverted && !includeReverted) continue;
    seen.add(r.batch_id);
    out.push({ batchId: r.batch_id, summary: r.summary ?? null, createdAt: r.created_at, reverted: isReverted });
    if (out.length >= limit) break;
  }
  return out;
}

/** Distinct AI batches ordered oldest-first by their earliest edit — the character's change timeline. */
export function orderedBatches(rows: EditHistoryRow[]): { batchId: string; minCreated: string }[] {
  const min = new Map<string, string>();
  for (const r of rows) {
    if (r.source !== 'ai' || !r.batch_id) continue;
    const cur = min.get(r.batch_id);
    if (cur === undefined || r.created_at < cur) min.set(r.batch_id, r.created_at);
  }
  return [...min.entries()]
    .map(([batchId, minCreated]) => ({ batchId, minCreated }))
    .sort((a, b) => a.minCreated.localeCompare(b.minCreated));
}

/**
 * The un-reverted AI batches to revert in order to RESTORE the character to the state right after
 * `targetBatchId` was applied — i.e. every un-reverted AI batch that came AFTER the target. Returns the
 * batch ids oldest-first (the route reverts them; revertBatch on the concatenated edits unwinds newest
 * first). Empty when the target is the latest change or is unknown/reverted.
 */
export function restorePlan(rows: EditHistoryRow[], targetBatchId: string): { batchIds: string[] } {
  const reverted = revertedBatchIds(rows);
  const batches = orderedBatches(rows);
  const idx = batches.findIndex((b) => b.batchId === targetBatchId);
  if (idx < 0) return { batchIds: [] };
  return { batchIds: batches.slice(idx + 1).filter((b) => !reverted.has(b.batchId)).map((b) => b.batchId) };
}

/** A compact plain-text digest of recent changes for AI grounding ("here's what you've changed"). */
export function recentBatchDigest(rows: EditHistoryRow[], limit = 6): string {
  const batches = recentBatches(rows, limit);
  if (!batches.length) return '';
  const lines = batches.map((b, i) => `${i + 1}. ${b.summary || '(a change)'} [batch ${b.batchId.slice(0, 8)}]`);
  return `RECENT CHANGES you made to this character (newest first):\n${lines.join('\n')}`;
}
