// app/api/admin/files/[id]/copy/route.ts
//
// F2b of FILE_EXPLORER_2026-06-25 — copy / duplicate a node.
//
//   POST /api/admin/files/<id>/copy  { parent_id?, name? }
//     • parent_id omitted        → duplicate in place (same folder, " (copy)" suffix)
//     • parent_id: <folderId>     → paste into that folder
//     • parent_id: null | 'root'  → paste at the top level (admin only)
//
// Files copy their storage object to a fresh key; folders deep-copy their
// subtree. Every source node is gated by the caller's effective access, so a
// copy can never re-expose content the caller could not already retrieve. Copies
// inherit the destination's permissions (no grants carried over).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { copySubtree, getNode } from '@/lib/files/server';
import type { FileUser } from '@/lib/files/permissions';
import { recordFileEvent } from '@/lib/files/audit-log';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);
  const { id } = params;
  if (id.startsWith('mnt:')) return NextResponse.json({ error: 'Read-only items can’t be copied here yet.' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { parent_id?: string | null; name?: string };

  // No parent_id key → duplicate in the source's own folder.
  let destParentId: string | null;
  if (body.parent_id === undefined) {
    const src = await getNode(id);
    if (!src) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    destParentId = src.parent_id;
  } else {
    destParentId = body.parent_id && body.parent_id !== 'root' ? body.parent_id : null;
  }

  const src = await getNode(id);
  const result = await copySubtree(id, destParentId, user, admin, body.name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  // Recorded against the NEW node, not the original: the question a copy raises later is "where did
  // this come from", and that belongs in the copy's own history. The source is named in the
  // metadata so the trail still points back.
  if (result.node?.id) {
    await recordFileEvent({
      action: 'file_copied',
      nodeId: String(result.node.id),
      actorEmail: user.email,
      metadata: {
        name: result.node.name,
        source_id: id,
        source_name: src?.name ?? null,
        parent_id: destParentId,
        copied: result.copied,
      },
    });
  }

  return NextResponse.json({ node: result.node, copied: result.copied, skipped: result.skipped });
}
