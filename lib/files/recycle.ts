// lib/files/recycle.ts — the bin: what is in it, what comes back, and what is gone for good.
//
// Deleting in the File Explorer has always been SOFT (`file_nodes.deleted_at`), so nothing was ever
// actually lost — but nothing could be recovered either, because no screen or route ever looked at
// a deleted row. The bytes sat in the bucket and the row sat in the table, unreachable. This module
// is the missing half.
//
// ── THE FOUR RULES, AND WHY EACH ONE IS NOT OBVIOUS ─────────────────────────────────────────────
//
// 1. **The bin lists what a person DELETED, not every row that got a timestamp.** Deleting a folder
//    of 50 files writes `deleted_at` on 51 rows. A bin showing 51 entries is not a bin, it is a
//    disaster report. So an entry is a *deletion root*: a deleted node whose parent is NOT deleted
//    (or which has no parent). The 50 files come back with their folder, and are never offered
//    separately — which is also the only arrangement where "restore" cannot produce an orphan.
//
// 2. **Restore is scoped by the DELETION TIMESTAMP, not by the subtree.** Delete `survey.pdf` on
//    Monday, delete its folder on Friday, restore the folder — should Monday's file come back? No.
//    It was deleted deliberately and separately. The delete route stamps one subtree with one
//    `new Date().toISOString()`, so equality on `deleted_at` recovers exactly the act that was
//    undone and nothing else. Without this rule, restoring a folder silently resurrects everything
//    anyone ever threw away inside it.
//
// 3. **A restored name can collide.** Delete `Plat.pdf`, upload a new `Plat.pdf`, restore the old
//    one — two rows with one name in one folder. The restore renames rather than refusing, and the
//    audit entry records what it came back as, because a file that quietly reappears under a
//    different name reads as the wrong file being restored.
//
// 4. **Purging deletes bytes, and bytes do not come back.** It is admin-only, it removes the
//    storage objects before the rows (a row without its object is recoverable-looking and is not),
//    and it is recorded.
//
// The pure rules are exported and tested; the I/O is at the bottom.

import { supabaseAdmin } from '@/lib/supabase';
import { nextAvailableName } from './tree';

export interface DeletedNode {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  owner_email: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  deleted_at: string;
  created_by: string | null;
}

/**
 * The entries a bin should show: deleted nodes whose parent is still alive.
 *
 * `deletedIds` is the set of every node currently carrying a `deleted_at`. A node whose parent is in
 * that set went down WITH its parent and belongs to that parent's entry, not to one of its own.
 * Rule 1 above.
 */
export function deletionRoots(nodes: DeletedNode[]): DeletedNode[] {
  const deletedIds = new Set(nodes.map((n) => n.id));
  return nodes.filter((n) => n.parent_id === null || !deletedIds.has(n.parent_id));
}

/**
 * Everything that comes back when `root` is restored: the root, plus the descendants that were
 * deleted in the SAME act. Rule 2 above.
 *
 * Walks the deleted set rather than querying per level, so a deep folder costs one pass.
 */
export function restoreSet(root: DeletedNode, nodes: DeletedNode[]): DeletedNode[] {
  const byParent = new Map<string, DeletedNode[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    const list = byParent.get(n.parent_id);
    if (list) list.push(n);
    else byParent.set(n.parent_id, [n]);
  }

  const out: DeletedNode[] = [root];
  const queue: DeletedNode[] = [root];
  const seen = new Set<string>([root.id]);
  while (queue.length > 0) {
    const cur = queue.shift() as DeletedNode;
    for (const child of byParent.get(cur.id) ?? []) {
      // The timestamp is the act. A child deleted at a different moment stays deleted.
      if (child.deleted_at !== root.deleted_at) continue;
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}

/** How many things come back with this entry, not counting the entry itself. */
export function descendantCount(root: DeletedNode, nodes: DeletedNode[]): number {
  return restoreSet(root, nodes).length - 1;
}

/** The name a restored node should take, given what already sits in its destination. Rule 3. */
export function nameOnRestore(desired: string, liveSiblingNames: string[]): string {
  return nextAvailableName(desired, liveSiblingNames);
}

// ── I/O ─────────────────────────────────────────────────────────────────────────────────────────

const BIN_COLS =
  'id, parent_id, node_type, name, owner_email, mime_type, size_bytes, storage_bucket, storage_path, deleted_at, created_by';

/** Every deleted node, which is what both `deletionRoots` and `restoreSet` need to be correct. */
export async function loadDeletedNodes(limit = 5000): Promise<DeletedNode[]> {
  const { data, error } = await supabaseAdmin
    .from('file_nodes')
    .select(BIN_COLS)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as DeletedNode[];
}

/** One deleted node by id — `getNode` cannot be reused because it filters deleted rows out. */
export async function getDeletedNode(id: string): Promise<DeletedNode | null> {
  const { data, error } = await supabaseAdmin
    .from('file_nodes')
    .select(BIN_COLS)
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as DeletedNode;
}

/** Live sibling names in a folder, used to resolve a collision on the way back in. */
export async function liveSiblingNames(parentId: string | null, nodeType: 'folder' | 'file'): Promise<string[]> {
  let q = supabaseAdmin.from('file_nodes').select('name').is('deleted_at', null).eq('node_type', nodeType);
  q = parentId === null ? q.is('parent_id', null) : q.eq('parent_id', parentId);
  const { data } = await q;
  return ((data ?? []) as unknown as Array<{ name: string }>).map((r) => String(r.name));
}

/** Bring a set of ids back, optionally renaming the root to clear a collision. */
export async function undelete(ids: string[], rootId: string, rootName: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin.from('file_nodes').update({ deleted_at: null }).in('id', ids);
  if (error) return { ok: false, error: error.message };
  const { error: renameErr } = await supabaseAdmin.from('file_nodes').update({ name: rootName }).eq('id', rootId);
  if (renameErr) return { ok: false, error: renameErr.message };
  return { ok: true };
}

/**
 * Remove the objects, then the rows. Objects first on purpose: a row whose bytes are already gone
 * still looks restorable in the bin, and offering somebody a restore that returns an empty file is
 * a worse outcome than a storage object briefly outliving its row.
 */
export async function purge(nodes: DeletedNode[]): Promise<{ ok: boolean; error?: string; objects: number }> {
  const byBucket = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.storage_bucket || !n.storage_path) continue;
    const list = byBucket.get(n.storage_bucket);
    if (list) list.push(n.storage_path);
    else byBucket.set(n.storage_bucket, [n.storage_path]);
  }

  let objects = 0;
  for (const [bucket, paths] of byBucket) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
    // A missing object is not a reason to keep the row: the point of the call is that it be gone.
    if (!error) objects += paths.length;
  }

  const { error } = await supabaseAdmin.from('file_nodes').delete().in('id', nodes.map((n) => n.id));
  if (error) return { ok: false, error: error.message, objects };
  return { ok: true, objects };
}
