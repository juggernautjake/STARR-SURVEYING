// app/api/admin/files/[id]/route.ts
//
// F2 of FILE_EXPLORER_2026-06-25 — rename / move / soft-delete a node.
//
//   PATCH  /api/admin/files/<id>  { name?, parent_id? }  → rename and/or move
//   DELETE /api/admin/files/<id>                          → soft-delete the subtree

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { accessForNode, siblingNames, collectSubtreeIds, NODE_COLS } from '@/lib/files/server';
import { canEdit, type FileUser } from '@/lib/files/permissions';
import { sanitizeName, nextAvailableName, wouldCreateCycle } from '@/lib/files/tree';
import { recordFileEvent, recordFileEvents } from '@/lib/files/audit-log';

function sessionUser(session: { user?: { email?: string | null; roles?: string[] } } | null): FileUser | null {
  if (!session?.user?.email) return null;
  return { email: session.user.email, roles: session.user.roles ?? [] };
}

// Mounted sources (ids prefixed `mnt:`) are read-only — reject writes cleanly.
const READONLY = NextResponse.json({ error: 'This item is read-only.' }, { status: 400 });
const isMount = (id: string) => id.startsWith('mnt:');

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = isAdmin(session!.user!.roles);
  const { id } = params;
  if (isMount(id)) return READONLY;

  const { chain, access } = await accessForNode(id, user, admin);
  if (chain.length === 0) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  const node = chain[chain.length - 1];
  if (!canEdit(access)) return NextResponse.json({ error: 'You cannot edit this item.' }, { status: 403 });
  if (node.is_system || node.is_personal_root) {
    return NextResponse.json({ error: 'System folders cannot be renamed or moved.' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string; parent_id?: string | null };
  const updates: Record<string, unknown> = {};
  let targetParentId = node.parent_id;
  // Names, not just ids, so the history reads like a sentence instead of a pair of UUIDs. The
  // chain ends with the node itself, so its parent is the entry before it; `null` means the top
  // level, which `describeFileEvent` renders in words.
  const fromParentName = chain.length >= 2 ? chain[chain.length - 2].name : null;
  let destName: string | null = null;

  // Move first (so the rename collision check runs against the destination).
  if (body.parent_id !== undefined) {
    const destId = body.parent_id && body.parent_id !== 'root' ? body.parent_id : null;
    if (destId) {
      const dest = await accessForNode(destId, user, admin);
      if (dest.chain.length === 0) return NextResponse.json({ error: 'Destination not found.' }, { status: 404 });
      if (dest.chain[dest.chain.length - 1].node_type !== 'folder') {
        return NextResponse.json({ error: 'Destination is not a folder.' }, { status: 400 });
      }
      if (!canEdit(dest.access)) return NextResponse.json({ error: 'You cannot move items into that folder.' }, { status: 403 });
      destName = dest.chain[dest.chain.length - 1].name;
      if (wouldCreateCycle(id, dest.chain.map((c) => c.id))) {
        return NextResponse.json({ error: 'A folder cannot be moved into itself.' }, { status: 400 });
      }
    } else if (!admin) {
      return NextResponse.json({ error: 'Only admins can move items to the top level.' }, { status: 403 });
    }
    updates.parent_id = destId;
    targetParentId = destId;
  }

  // Rename (and/or resolve a collision at the destination after a move).
  const movingParents = body.parent_id !== undefined && targetParentId !== node.parent_id;
  if (typeof body.name === 'string' || movingParents) {
    const desired = typeof body.name === 'string' ? sanitizeName(body.name) : node.name;
    if (!desired) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
    const sibs = (await siblingNames(targetParentId, node.node_type)).filter(
      (s) => !(targetParentId === node.parent_id && s.toLowerCase() === node.name.toLowerCase()),
    );
    updates.name = nextAvailableName(desired, sibs);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('file_nodes').update(updates).eq('id', id).select(NODE_COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── TWO EVENTS, BECAUSE PATCH IS TWO ACTS ───────────────────────────────────────────────────
  //
  // One request can rename AND move. Recording that as a single "updated" entry loses the half a
  // person is usually looking for — "who moved it, and out of where" is a different question from
  // "what was it called before". Both carry their FROM value: a rename entry that shows only the
  // new name is a timestamp, not a history.
  if (typeof updates.name === 'string' && updates.name !== node.name) {
    await recordFileEvent({
      action: 'file_renamed',
      nodeId: id,
      actorEmail: user.email,
      metadata: { from_name: node.name, to_name: updates.name },
    });
  }
  if (updates.parent_id !== undefined && targetParentId !== node.parent_id) {
    await recordFileEvent({
      action: 'file_moved',
      nodeId: id,
      actorEmail: user.email,
      metadata: {
        name: node.name,
        from_parent_id: node.parent_id,
        from_parent_name: fromParentName,
        to_parent_id: targetParentId,
        to_parent_name: destName,
      },
    });
  }

  return NextResponse.json({ node: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = isAdmin(session!.user!.roles);
  const { id } = params;
  if (isMount(id)) return READONLY;

  const { chain, access } = await accessForNode(id, user, admin);
  if (chain.length === 0) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  const node = chain[chain.length - 1];
  if (node.is_system || node.is_personal_root) {
    return NextResponse.json({ error: 'System folders cannot be deleted.' }, { status: 400 });
  }
  if (!canEdit(access)) return NextResponse.json({ error: 'You cannot delete this item.' }, { status: 403 });

  const ids = node.node_type === 'folder' ? await collectSubtreeIds(id) : [id];
  const { error } = await supabaseAdmin
    .from('file_nodes')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  return NextResponse.json({ ok: true, deleted: ids.length });
}
