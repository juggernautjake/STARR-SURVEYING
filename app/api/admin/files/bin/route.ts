// app/api/admin/files/bin/route.ts — what is in the recycle bin, for this caller.
//
//   GET /api/admin/files/bin → { entries: [{ id, name, node_type, deleted_at, in_folder, items }] }
//
// ── WHO SEES WHAT ───────────────────────────────────────────────────────────────────────────────
//
// A bin is a list of things somebody threw away, and a naive one is an information leak: it would
// show every deleted node in the company, including the names of files in folders the caller could
// never open, and names alone give away plenty.
//
// The gate reuses the live permission system rather than inventing a second one. A deletion root's
// PARENT is by definition still alive (that is what makes it a root), so `accessForNode` — the same
// function that decides whether you may edit that folder — answers the question directly. A root at
// the top level has no parent to ask about, so it is admin-only, matching the rule that only admins
// create or move things at the top level.
//
// Access is resolved once per distinct parent, not once per entry: a folder emptied of 200 files
// would otherwise cost 200 identical permission walks.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { accessForNode, getNode } from '@/lib/files/server';
import { canEdit, type FileUser, type AccessLevel } from '@/lib/files/permissions';
import { loadDeletedNodes, deletionRoots, descendantCount } from '@/lib/files/recycle';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);

  const all = await loadDeletedNodes();
  const roots = deletionRoots(all);

  // One permission resolution per distinct parent folder.
  const parentIds = [...new Set(roots.map((r) => r.parent_id).filter((x): x is string => x !== null))];
  const allowed = new Map<string, boolean>();
  const parentNames = new Map<string, string>();
  for (const pid of parentIds) {
    const { access } = await accessForNode(pid, user, admin);
    allowed.set(pid, canEdit(access as AccessLevel));
    const n = await getNode(pid);
    if (n) parentNames.set(pid, n.name);
  }

  const entries = roots
    .filter((r) => (r.parent_id === null ? admin : allowed.get(r.parent_id) === true))
    .map((r) => ({
      id: r.id,
      name: r.name,
      node_type: r.node_type,
      mime_type: r.mime_type,
      size_bytes: r.size_bytes,
      deleted_at: r.deleted_at,
      owner_email: r.owner_email,
      // Where it will go back to, named — "restore" is a promise about a destination, and a bin
      // that does not say where something came from makes that promise unreadable.
      in_folder: r.parent_id === null ? 'Top level' : parentNames.get(r.parent_id) ?? 'a folder you can edit',
      parent_id: r.parent_id,
      items: r.node_type === 'folder' ? descendantCount(r, all) : 0,
    }));

  return NextResponse.json({ entries });
}
