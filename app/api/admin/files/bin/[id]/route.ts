// app/api/admin/files/bin/[id]/route.ts — bring one thing back, or end it.
//
//   POST   /api/admin/files/bin/<id>  → restore the node and everything deleted with it
//   DELETE /api/admin/files/bin/<id>  → purge permanently (admin only)
//
// The rules being enforced here are stated in full in `lib/files/recycle.ts`; this file is the
// permission gate, the collision fix, and the audit entry.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { type FileUser } from '@/lib/files/permissions';
import { loadDeletedNodes, getDeletedNode, restoreSet, purge } from '@/lib/files/recycle';
import { recordFileEvent } from '@/lib/files/audit-log';
import { restoreNode } from '@/lib/files/node-delete';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);

  // The rules (deletion roots only, parent permission, collision rename, history) live in
  // lib/files/node-delete.ts, shared with the Undo on the bulk delete API.
  const res = await restoreNode(params.id, user, admin);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  return NextResponse.json({
    ok: true,
    restored: res.count,
    name: res.restoredAs,
    // The caller needs to know it came back under a different name so it can say so, rather than
    // the user hunting for a file that is on screen under a name they do not recognise.
    renamed: Boolean(res.renamed),
    parent_id: res.parentId ?? null,
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
