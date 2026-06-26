// app/api/admin/files/upload/route.ts
//
// F3 of FILE_EXPLORER_2026-06-25 — issue a signed upload URL for the private
// file-explorer bucket. The client PUTs the bytes directly (no API body-size
// limit), then calls /upload/complete to create the file node.

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { accessForNode } from '@/lib/files/server';
import { canEdit, type FileUser } from '@/lib/files/permissions';
import { validateUpload, buildStoragePath, FILE_EXPLORER_BUCKET } from '@/lib/files/upload';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);

  const body = (await req.json().catch(() => ({}))) as {
    parent_id?: string | null;
    name?: string;
    size_bytes?: number;
  };
  const v = validateUpload({ name: body.name, sizeBytes: body.size_bytes });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const parentId = body.parent_id && body.parent_id !== 'root' ? body.parent_id : null;
  if (parentId) {
    const { chain, access } = await accessForNode(parentId, user, admin);
    if (chain.length === 0) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 });
    if (chain[chain.length - 1].node_type !== 'folder') {
      return NextResponse.json({ error: 'Uploads must target a folder.' }, { status: 400 });
    }
    if (!canEdit(access)) return NextResponse.json({ error: 'You cannot upload here.' }, { status: 403 });
  } else if (!admin) {
    return NextResponse.json({ error: 'Only admins can upload to the top level.' }, { status: 403 });
  }

  await ensureStorageBucket(FILE_EXPLORER_BUCKET, { public: false });
  const path = buildStoragePath(randomUUID(), body.name as string);
  const { data, error } = await supabaseAdmin.storage.from(FILE_EXPLORER_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not start the upload.' }, { status: 500 });
  }
  return NextResponse.json({ bucket: FILE_EXPLORER_BUCKET, path: data.path, token: data.token, signed_url: data.signedUrl });
}
