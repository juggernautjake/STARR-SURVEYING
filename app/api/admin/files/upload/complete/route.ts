// app/api/admin/files/upload/complete/route.ts
//
// F3 of FILE_EXPLORER_2026-06-25 — after the client uploads to the signed URL,
// create the file node pointing at the stored object.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { accessForNode, siblingNames, NODE_COLS } from '@/lib/files/server';
import { canEdit, type FileUser } from '@/lib/files/permissions';
import { sanitizeName, nextAvailableName } from '@/lib/files/tree';
import { FILE_EXPLORER_BUCKET } from '@/lib/files/upload';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);

  const body = (await req.json().catch(() => ({}))) as {
    parent_id?: string | null;
    name?: string;
    path?: string;
    mime_type?: string;
    size_bytes?: number;
  };
  const name = sanitizeName(body.name);
  if (!name) return NextResponse.json({ error: 'A file name is required.' }, { status: 400 });
  if (!body.path) return NextResponse.json({ error: 'Missing upload path.' }, { status: 400 });

  const parentId = body.parent_id && body.parent_id !== 'root' ? body.parent_id : null;
  if (parentId) {
    const { chain, access } = await accessForNode(parentId, user, admin);
    if (chain.length === 0) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 });
    if (!canEdit(access)) return NextResponse.json({ error: 'You cannot upload here.' }, { status: 403 });
  } else if (!admin) {
    return NextResponse.json({ error: 'Only admins can upload to the top level.' }, { status: 403 });
  }

  const finalName = nextAvailableName(name, await siblingNames(parentId, 'file'));
  const { data, error } = await supabaseAdmin
    .from('file_nodes')
    .insert({
      parent_id: parentId,
      node_type: 'file',
      name: finalName,
      owner_email: user.email,
      created_by: user.email,
      permission_mode: 'inherit',
      storage_bucket: FILE_EXPLORER_BUCKET,
      storage_path: body.path,
      mime_type: body.mime_type ?? null,
      size_bytes: typeof body.size_bytes === 'number' ? body.size_bytes : null,
    })
    .select(NODE_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ node: data });
}
