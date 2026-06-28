// app/api/admin/files/route.ts
//
// F2 of FILE_EXPLORER_2026-06-25 — list folder contents + create folders.
//
//   GET  /api/admin/files?parent=<id|root>  → permission-filtered children + breadcrumb
//   POST /api/admin/files  { parent_id, name }  → create a folder (needs edit on parent)

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { listChildren, accessForNode, siblingNames, NODE_COLS } from '@/lib/files/server';
import { canEdit, type FileUser } from '@/lib/files/permissions';
import { sanitizeName, nextAvailableName } from '@/lib/files/tree';
import { provisionForUser } from '@/lib/files/provision';
import { MOUNT_PREFIX, mountRootNodes, listMount } from '@/lib/files/mounts';

function sessionUser(session: { user?: { email?: string | null; roles?: string[] } } | null): FileUser | null {
  if (!session?.user?.email) return null;
  return { email: session.user.email, roles: session.user.roles ?? [] };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = isAdmin(session!.user!.roles);

  const raw = new URL(req.url).searchParams.get('parent');
  const parentId = raw && raw !== 'root' ? raw : null;

  // Read-only mounts (receipts, job files, …) live outside file_nodes.
  if (parentId && parentId.startsWith(MOUNT_PREFIX)) {
    const m = await listMount(parentId, user, admin);
    if (!m.ok) return NextResponse.json({ error: m.error }, { status: m.status ?? 500 });
    return NextResponse.json({
      parent_id: parentId,
      parent_access: 'view',
      breadcrumb: [{ id: parentId, name: m.name }],
      nodes: m.nodes,
    });
  }

  // Landing on the root is the natural moment to make sure the system roots and
  // this user's personal folder exist (covers users who joined after seed 385).
  if (parentId === null) await provisionForUser(user, session!.user!.name ?? null);

  const result = await listChildren(parentId, user, admin);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  // Append the read-only source mounts at the top level only.
  const nodes = parentId === null ? [...mountRootNodes(user, admin), ...(result.nodes ?? [])] : result.nodes;
  return NextResponse.json({
    parent_id: parentId,
    parent_access: result.parentAccess,
    breadcrumb: result.breadcrumb,
    nodes,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = isAdmin(session!.user!.roles);

  const body = (await req.json().catch(() => ({}))) as { parent_id?: string | null; name?: string };
  const name = sanitizeName(body.name);
  if (!name) return NextResponse.json({ error: 'A folder name is required.' }, { status: 400 });

  const parentId = body.parent_id && body.parent_id !== 'root' ? body.parent_id : null;
  if (parentId) {
    const { chain, access } = await accessForNode(parentId, user, admin);
    if (chain.length === 0) return NextResponse.json({ error: 'Parent folder not found.' }, { status: 404 });
    if (chain[chain.length - 1].node_type !== 'folder') {
      return NextResponse.json({ error: 'Parent is not a folder.' }, { status: 400 });
    }
    if (!canEdit(access)) return NextResponse.json({ error: 'You cannot create folders here.' }, { status: 403 });
  } else if (!admin) {
    return NextResponse.json({ error: 'Only admins can create top-level folders.' }, { status: 403 });
  }

  const finalName = nextAvailableName(name, await siblingNames(parentId, 'folder'));
  const { data, error } = await supabaseAdmin
    .from('file_nodes')
    .insert({
      parent_id: parentId,
      node_type: 'folder',
      name: finalName,
      owner_email: user.email,
      created_by: user.email,
      permission_mode: 'inherit',
    })
    .select(NODE_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ node: data });
}
