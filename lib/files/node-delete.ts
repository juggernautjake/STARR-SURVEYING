// lib/files/node-delete.ts — soft-delete and restore of a File Explorer node, as functions.
//
// Lifted out of `app/api/admin/files/[id]/route.ts` (DELETE) and `app/api/admin/files/bin/[id]`
// (POST) on 2026-09-27 so the bulk delete / undo API (`lib/files/delete-handlers.ts`) runs EXACTLY
// the same checks and writes the same history as the single-item routes. Two copies of a permission
// check drift; one copy cannot. The rules themselves are unchanged — see lib/files/recycle.ts.

import { supabaseAdmin } from '@/lib/supabase';
import { accessForNode, collectSubtreeIds } from './server';
import { canEdit, type AccessLevel, type FileUser } from './permissions';
import { recordFileEvent, recordFileEvents } from './audit-log';
import { loadDeletedNodes, getDeletedNode, restoreSet, liveSiblingNames, nameOnRestore, undelete } from './recycle';

export type NodeOpResult =
  | { ok: true; name: string; count: number; renamed?: boolean; restoredAs?: string; parentId?: string | null }
  | { ok: false; status: number; error: string };

/** Soft-delete a node and (for a folder) its subtree, stamped with ONE timestamp. */
export async function softDeleteNode(id: string, user: FileUser, admin: boolean): Promise<NodeOpResult> {
  if (id.startsWith('mnt:')) return { ok: false, status: 400, error: 'This item is read-only.' };

  const { chain, access } = await accessForNode(id, user, admin);
  if (chain.length === 0) return { ok: false, status: 404, error: 'Item not found.' };
  const node = chain[chain.length - 1]!;
  if (node.is_system || node.is_personal_root) {
    return { ok: false, status: 400, error: 'System folders cannot be deleted.' };
  }
  if (!canEdit(access)) return { ok: false, status: 403, error: 'You cannot delete this item.' };

  const ids = node.node_type === 'folder' ? await collectSubtreeIds(id) : [id];
  const { error } = await supabaseAdmin
    .from('file_nodes')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids);
  if (error) return { ok: false, status: 500, error: error.message };

  // Deleting a folder deletes a subtree, and every one of those nodes needs its own entry —
  // otherwise a file that vanished has nothing in its history explaining where it went, and the
  // only record is on a parent nobody thinks to look at. `subtree_of` marks the ones that went as
  // part of the folder rather than being deleted on their own.
  await recordFileEvent({
    action: 'file_deleted',
    nodeId: id,
    actorEmail: user.email,
    metadata: { name: node.name, node_type: node.node_type, descendants: ids.length - 1 },
  });
  await recordFileEvents(
    'file_deleted',
    ids.filter((x) => x !== id),
    user.email,
    { subtree_of: id, subtree_of_name: node.name },
  );

  return { ok: true, name: node.name, count: ids.length };
}

/** May this caller act on a deleted node? Decided by its parent, which is still alive. */
async function mayActOnDeleted(parentId: string | null, user: FileUser, admin: boolean): Promise<boolean> {
  if (parentId === null) return admin;
  const { chain, access } = await accessForNode(parentId, user, admin);
  if (chain.length === 0) return false;
  return canEdit(access as AccessLevel);
}

/** Restore a deletion root and everything deleted in the same act. */
export async function restoreNode(id: string, user: FileUser, admin: boolean): Promise<NodeOpResult> {
  const node = await getDeletedNode(id);
  if (!node) return { ok: false, status: 404, error: 'That item is not in the bin.' };

  const all = await loadDeletedNodes();
  // Only a deletion ROOT may be restored. Restoring a node whose parent is still deleted would put
  // it back into a folder that does not exist — reachable from nothing, visible nowhere, and
  // indistinguishable from data loss to the person who asked for it back.
  if (node.parent_id !== null && all.some((n) => n.id === node.parent_id)) {
    return { ok: false, status: 400, error: 'This item was deleted along with its folder. Restore the folder to bring it back.' };
  }
  if (!(await mayActOnDeleted(node.parent_id, user, admin))) {
    return { ok: false, status: 403, error: 'You cannot restore items to that folder.' };
  }

  const set = restoreSet(node, all);
  const finalName = nameOnRestore(node.name, await liveSiblingNames(node.parent_id, node.node_type));

  const res = await undelete(set.map((n) => n.id), node.id, finalName);
  if (!res.ok) return { ok: false, status: 500, error: res.error ?? 'Restore failed.' };

  await recordFileEvent({
    action: 'file_restored',
    nodeId: node.id,
    actorEmail: user.email,
    metadata: {
      name: node.name,
      restored_as: finalName,
      node_type: node.node_type,
      descendants: set.length - 1,
      parent_id: node.parent_id,
    },
  });
  await recordFileEvents(
    'file_restored',
    set.filter((n) => n.id !== node.id).map((n) => n.id),
    user.email,
    { subtree_of: node.id, subtree_of_name: node.name },
  );

  return { ok: true, name: node.name, count: set.length, restoredAs: finalName, renamed: finalName !== node.name, parentId: node.parent_id };
}
