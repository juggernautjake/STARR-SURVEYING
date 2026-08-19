// app/api/admin/files/bin/[id]/route.ts — bring one thing back, or end it.
//
//   POST   /api/admin/files/bin/<id>  → restore the node and everything deleted with it
//   DELETE /api/admin/files/bin/<id>  → purge permanently (admin only)
//
// The rules being enforced here are stated in full in `lib/files/recycle.ts`; this file is the
// permission gate, the collision fix, and the audit entry.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { accessForNode } from '@/lib/files/server';
import { canEdit, type FileUser, type AccessLevel } from '@/lib/files/permissions';
import {
  loadDeletedNodes, getDeletedNode, restoreSet, liveSiblingNames, nameOnRestore, undelete, purge,
} from '@/lib/files/recycle';
import { recordFileEvent, recordFileEvents } from '@/lib/files/audit-log';

/** May this caller act on a deleted node? Decided by its parent, which is still alive. */
async function mayAct(
  parentId: string | null,
  user: FileUser,
  admin: boolean,
): Promise<boolean> {
  if (parentId === null) return admin;
  const { chain, access } = await accessForNode(parentId, user, admin);
  if (chain.length === 0) return false;
  return canEdit(access as AccessLevel);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);

  const node = await getDeletedNode(params.id);
  if (!node) return NextResponse.json({ error: 'That item is not in the bin.' }, { status: 404 });

  const all = await loadDeletedNodes();
  // Only a deletion ROOT may be restored. Restoring a node whose parent is still deleted would put
  // it back into a folder that does not exist — reachable from nothing, visible nowhere, and
  // indistinguishable from data loss to the person who asked for it back.
  if (node.parent_id !== null && all.some((n) => n.id === node.parent_id)) {
    return NextResponse.json(
      { error: 'This item was deleted along with its folder. Restore the folder to bring it back.' },
      { status: 400 },
    );
  }
  if (!(await mayAct(node.parent_id, user, admin))) {
    return NextResponse.json({ error: 'You cannot restore items to that folder.' }, { status: 403 });
  }

  const set = restoreSet(node, all);
  const finalName = nameOnRestore(node.name, await liveSiblingNames(node.parent_id, node.node_type));

  const res = await undelete(set.map((n) => n.id), node.id, finalName);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });

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

  return NextResponse.json({
    ok: true,
    restored: set.length,
    name: finalName,
    // The caller needs to know it came back under a different name so it can say so, rather than
    // the user hunting for a file that is on screen under a name they do not recognise.
    renamed: finalName !== node.name,
    parent_id: node.parent_id,
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);

  // Purging destroys bytes. Edit access on the parent is enough to throw something away — it is not
  // enough to make it unrecoverable, because those are different sized mistakes.
  if (!admin) return NextResponse.json({ error: 'Only an admin can permanently delete.' }, { status: 403 });

  const node = await getDeletedNode(params.id);
  if (!node) return NextResponse.json({ error: 'That item is not in the bin.' }, { status: 404 });

  const all = await loadDeletedNodes();
  const set = restoreSet(node, all);

  // Recorded BEFORE the rows go, because after the purge there is no node left to hang a history
  // on — and "who destroyed this, and when" is the one entry that must survive the thing itself.
  await recordFileEvent({
    action: 'file_purged',
    nodeId: node.id,
    actorEmail: user.email,
    metadata: { name: node.name, node_type: node.node_type, descendants: set.length - 1 },
  });

  const res = await purge(set);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });

  return NextResponse.json({ ok: true, purged: set.length, objects_removed: res.objects });
}
