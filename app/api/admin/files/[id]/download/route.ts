// app/api/admin/files/[id]/download/route.ts
//
// F3 of FILE_EXPLORER_2026-06-25 — return a short-lived signed URL for a file.
// ?inline=1 → inline disposition (for the in-app viewer, F6); default forces a
// download with the node's name.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { accessForNode } from '@/lib/files/server';
import { canDownload, type FileUser } from '@/lib/files/permissions';
import { MOUNT_PREFIX, resolveMountFile } from '@/lib/files/mounts';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);
  const inlineReq = new URL(req.url).searchParams.get('inline') === '1';

  // Read-only mounted file (receipts, job files, …) — resolve to its source bucket.
  if (params.id.startsWith(MOUNT_PREFIX)) {
    const ref = await resolveMountFile(params.id, user, admin);
    if (!ref.ok || !ref.bucket || !ref.path) {
      return NextResponse.json({ error: ref.error ?? 'File not found.' }, { status: ref.status ?? 404 });
    }
    const { data, error } = await supabaseAdmin.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, 60, inlineReq ? {} : { download: ref.name });
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not generate a link.' }, { status: 500 });
    return NextResponse.json({ url: data.signedUrl, name: ref.name, mime_type: ref.mime });
  }

  const { chain, access } = await accessForNode(params.id, user, admin);
  if (chain.length === 0) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  const node = chain[chain.length - 1];
  if (node.node_type !== 'file' || !node.storage_bucket || !node.storage_path) {
    return NextResponse.json({ error: 'Not a downloadable file.' }, { status: 400 });
  }
  if (!canDownload(access)) return NextResponse.json({ error: 'You cannot download this file.' }, { status: 403 });

  const { data, error } = await supabaseAdmin.storage
    .from(node.storage_bucket)
    .createSignedUrl(node.storage_path, 60, inlineReq ? {} : { download: node.name });
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not generate a link.' }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl, name: node.name, mime_type: node.mime_type });
}
