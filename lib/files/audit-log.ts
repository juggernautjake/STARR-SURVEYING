// lib/files/audit-log.ts — the one write path for file history, and the one read path.
//
// Separated from `lib/files/audit.ts` so the vocabulary and the row shape stay pure and testable;
// this half is the part that touches Supabase. See that file for why the shape is pinned in a test.

import { supabaseAdmin } from '@/lib/supabase';
import { fireAndForget } from '@/lib/apiErrorHandler';
import { fileEventRow, FILE_ENTITY, type FileAction, type FileEventInput } from './audit';

/**
 * Record one thing that happened to a node.
 *
 * Advisory: it never throws and never blocks the caller's response, because a history that can fail
 * a user's upload is worse than a gap in the history. The cost of that choice is that a broken write
 * is invisible — which is exactly how the `action`/`action_type` bug survived — so the row shape is
 * pinned by `__tests__/files/audit.test.ts` instead of by runtime feedback.
 */
export async function recordFileEvent(input: FileEventInput): Promise<void> {
  await fireAndForget(supabaseAdmin.from('activity_log').insert(fileEventRow(input)));
}

/** Record the same action against many nodes at once — a folder delete is one act on a subtree. */
export async function recordFileEvents(
  action: FileAction,
  nodeIds: string[],
  actorEmail: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (nodeIds.length === 0) return;
  const rows = nodeIds.map((nodeId) => fileEventRow({ action, nodeId, actorEmail, metadata }));
  await fireAndForget(supabaseAdmin.from('activity_log').insert(rows));
}

export interface FileHistoryRow {
  id: string;
  action: string;
  actor: string;
  at: string;
  node_id: string;
  metadata: Record<string, unknown>;
}

/**
 * The history of one node — and, for a folder, of everything inside it.
 *
 * A folder's own history is nearly empty by nature: it was created, and perhaps renamed once. The
 * question somebody actually has in front of a folder is *"what has been happening in here"*, so
 * the caller passes the subtree ids it already had to collect for the permission check, and those
 * events are folded in. Keyed on node id throughout, so a rename or a move does not orphan a file's
 * past.
 */
export async function readFileHistory(nodeIds: string[], limit = 200): Promise<FileHistoryRow[]> {
  if (nodeIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('activity_log')
    .select('id, user_email, action_type, entity_id, metadata, created_at')
    .eq('entity_type', FILE_ENTITY)
    .in('entity_id', nodeIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  type Row = {
    id: string; user_email: string | null; action_type: string | null;
    entity_id: string | null; metadata: unknown; created_at: string | null;
  };
  return (data as unknown as Row[]).map((r) => ({
    id: String(r.id),
    action: String(r.action_type ?? ''),
    actor: String(r.user_email ?? ''),
    at: String(r.created_at ?? ''),
    node_id: String(r.entity_id ?? ''),
    metadata: (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>,
  }));
}
