// app/api/admin/files/[id]/history/route.ts — everything that has happened to one node.
//
//   GET /api/admin/files/<id>/history  → { node, events: [{ action, label, detail, actor, at }] }
//
// ── THE TWO DECISIONS IN HERE ───────────────────────────────────────────────────────────────────
//
// 1. **Gated by the same access as seeing the node at all.** A history says who touched a file, when,
//    and — for a permissions change — exactly who was granted what. That is not less sensitive than
//    the file; in a firm it is often more. So `accessForNode` runs first and its answer is the
//    answer. Anything else would make this endpoint a way to enumerate a folder you cannot open.
//
// 2. **A folder's history includes its contents.** A folder's own record is nearly empty by nature —
//    created once, maybe renamed once. The question somebody has while looking at a folder is
//    "what has been happening in here", so the subtree's events are folded in and each one says
//    which node it belongs to. Capped, because a deep folder is a lot of rows.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { accessForNode, collectSubtreeIds, getNode } from '@/lib/files/server';
import { type FileUser } from '@/lib/files/permissions';
import { describeFileEvent } from '@/lib/files/audit';
import { readFileHistory } from '@/lib/files/audit-log';

/** A folder deeper than this contributes its first N descendants and says so. */
const SUBTREE_CAP = 500;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);

  // Mounts are synthesized views of receipts, job files and drawings. They are not `file_nodes`, so
  // they have no history of their own — and saying that plainly beats a 404 that reads like a bug.
  if (params.id.startsWith('mnt:')) {
    return NextResponse.json({
      node: null,
      events: [],
      note: 'This item is a read-only view of another system, so its history lives with the record it came from.',
    });
  }

  const { chain, access } = await accessForNode(params.id, user, admin);
  if (chain.length === 0) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  if (access === 'none') return NextResponse.json({ error: 'You cannot view this item.' }, { status: 403 });
  const node = chain[chain.length - 1];

  const ids = [params.id];
  if (node.node_type === 'folder') {
    const subtree = await collectSubtreeIds(params.id);
    for (const child of subtree) {
      if (child !== params.id && ids.length < SUBTREE_CAP) ids.push(child);
    }
  }

  const rows = await readFileHistory(ids);

  // Name the nodes the events belong to, so a folder's history reads "Renamed · survey.pdf" rather
  // than a column of identical folder names. One round-trip, and only for the ids that appear.
  const referenced = [...new Set(rows.map((r) => r.node_id))].filter((x) => x !== params.id);
  const names = new Map<string, string>([[node.id, node.name]]);
  for (const id of referenced.slice(0, 200)) {
    const n = await getNode(id);
    if (n) names.set(id, n.name);
  }

  return NextResponse.json({
    node: { id: node.id, name: node.name, node_type: node.node_type, created_by: node.created_by, created_at: node.created_at },
    events: rows.map((r) => {
      const described = describeFileEvent(r.action, r.metadata);
      return {
        id: r.id,
        action: r.action,
        label: described.label,
        detail: described.detail,
        actor: r.actor,
        at: r.at,
        node_id: r.node_id,
        // Absent when the event belongs to the node being viewed; present when it happened to
        // something inside it, which is what makes a folder's history legible.
        node_name: r.node_id === params.id ? undefined : names.get(r.node_id),
        metadata: r.metadata,
      };
    }),
  });
}
