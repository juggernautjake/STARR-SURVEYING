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
  return NextResponse.json({ ok: true, deleted: ids.length });
}
