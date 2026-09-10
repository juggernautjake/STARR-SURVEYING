// app/api/admin/files/tree/route.ts — every folder under a node, flattened, each with its files.
//
//   GET /api/admin/files/tree?node=<id>   → MountTree (lib/files/mount-node.ts)
//
// The "view all files in this folder and its subfolders" view (owner, 2026-09-10). A `mnt:` node
// walks through lib/files/mounts.ts (a job costs one listing, not one per folder); a `file_nodes`
// folder walks `listChildren`, which applies the same per-node permissions the explorer applies.
// Both are bounded — the response says `truncated` when the walk stopped at its cap.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import type { FileUser } from '@/lib/files/permissions';
import { listChildren } from '@/lib/files/server';
import { MOUNT_PREFIX, listMountTree } from '@/lib/files/mounts';
import type { MountNode, MountTree, MountTreeFolder } from '@/lib/files/mount-node';

function sessionUser(session: { user?: { email?: string | null; roles?: string[] } } | null): FileUser | null {
  if (!session?.user?.email) return null;
  return { email: session.user.email, roles: session.user.roles ?? [] };
}

const MAX_FOLDERS = 200;
const MAX_DEPTH = 6;

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = isAdmin(session!.user!.roles);
  const who: FileUser = user;

  const raw = new URL(req.url).searchParams.get('node');
  const rootId = raw && raw !== 'root' ? raw : null;
  if (!rootId) return NextResponse.json({ error: 'node is required — the whole file system is not a tree anyone should be shown.' }, { status: 400 });

  if (rootId.startsWith(MOUNT_PREFIX)) {
    const result = await listMountTree(rootId, user, admin, { maxFolders: MAX_FOLDERS, maxDepth: MAX_DEPTH });
    if (!result.ok || !result.tree) return NextResponse.json({ error: result.error ?? 'Could not list that folder.' }, { status: result.status ?? 500 });
    return NextResponse.json(result.tree);
  }

  // A file_nodes folder: the same walk over the explorer's own listing.
  const rootList = await listChildren(rootId, user, admin);
  if (!rootList.ok) return NextResponse.json({ error: rootList.error }, { status: rootList.status ?? 500 });
  const crumbs = rootList.breadcrumb ?? [];
  const rootName = crumbs.length > 0 ? crumbs[crumbs.length - 1].name : 'Files';

  const folders: MountTreeFolder[] = [];
  let total = 0;
  let truncated = false;

  const shape = (n: { id: string; parent_id: string | null; node_type: 'folder' | 'file'; name: string; mime_type: string | null; size_bytes: number | null; updated_at: string; access: MountNode['access']; notes?: string | null; tags?: string[] | null }): MountNode => ({
    id: n.id, parent_id: n.parent_id, node_type: n.node_type, name: n.name, mime_type: n.mime_type,
    size_bytes: n.size_bytes, updated_at: n.updated_at, access: n.access,
    notes: n.notes ?? null, tags: n.tags ?? [],
  });

  async function walk(id: string, name: string, path: string[], depth: number, parentId: string | null, nodes?: ReturnType<typeof shape>[]): Promise<void> {
    if (folders.length >= MAX_FOLDERS) { truncated = true; return; }
    let listed = nodes;
    if (!listed) {
      const res = await listChildren(id, who, admin);
      if (!res.ok) { folders.push({ id, name, path, depth, parent_id: parentId, files: [], error: res.error }); return; }
      listed = (res.nodes ?? []).map(shape);
    }
    const files = listed.filter((n) => n.node_type === 'file');
    folders.push({ id, name, path, depth, parent_id: parentId, files });
    total += files.length;
    if (depth >= MAX_DEPTH) return;
    for (const f of listed.filter((n) => n.node_type === 'folder')) {
      await walk(f.id, f.name, [...path, f.name], depth + 1, id);
    }
  }

  await walk(rootId, rootName, [], 0, null, (rootList.nodes ?? []).map(shape));

  const tree: MountTree = {
    root: { id: rootId, name: rootName },
    breadcrumb: crumbs,
    folders,
    total_files: total,
    truncated,
  };
  return NextResponse.json(tree);
}
