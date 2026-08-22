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
import { recordFileEvent } from '@/lib/files/audit-log';

/**
 * ── TWO LIFETIMES, BECAUSE A DOWNLOAD AND A PLAYBACK ARE NOT THE SAME REQUEST ────────────────────
 *
 * A download is ONE request. It only has to START before the link expires — the transfer then
 * streams to completion however long it takes, so sixty seconds is plenty for half a gigabyte.
 *
 * Playing a video is not one request. `<video>` issues a fresh RANGE request every time it buffers
 * ahead or somebody scrubs, and each of those is validated against the token's expiry on arrival.
 * At sixty seconds that means a walkthrough plays for a minute and then dies the moment the viewer
 * seeks — with no error the person can act on, because the element simply stalls.
 *
 * So the inline link, the one the in-app viewer puts in `src`, lasts a viewing session. The job
 * side never had this problem: its `download_href` is a route that 302s to a freshly signed URL on
 * every request, so each range request gets its own. This route answers with JSON, so the URL it
 * hands out has to outlive the watching.
 */
const DOWNLOAD_URL_SECONDS = 60;
const INLINE_URL_SECONDS = 60 * 60 * 2;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);
  const inlineReq = new URL(req.url).searchParams.get('inline') === '1';

  // Read-only mounted file (receipts, job files, …) — resolve to its source bucket.
  if (params.id.startsWith(MOUNT_PREFIX)) {
    const ref = await resolveMountFile(params.id, user, admin);
    if (!ref.ok) {
      return NextResponse.json({ error: ref.error ?? 'File not found.' }, { status: ref.status ?? 404 });
    }

    // A source that already HAS a URL — a legacy job attachment stored as a `data:` URI, or an
    // ordinary link. Nothing to sign and nothing to serve: hand back what it already is.
    if (ref.directUrl) {
      return NextResponse.json({ url: ref.directUrl, name: ref.name, mime_type: ref.mime });
    }

    // F1 — a source whose "file" lives in the database rather than a bucket.
    //
    // `cad_drawings.document` is JSONB, so there is nothing to sign. The obvious move — returning
    // the bytes here — would have broken every existing caller: the explorer does
    // `await res.json()` and reads `{ url }`, so a raw body would parse as the drawing and leave
    // `url` undefined. **The contract of this endpoint is "you get a URL", and it stays that.**
    //
    // So the URL points back at this same route with `?raw=1`, which is the branch below. The role
    // gate is re-validated on that request too, because it is a normal request that anybody could
    // make directly.
    if (ref.inlineBody !== undefined) {
      const raw = new URL(req.url).searchParams.get('raw') === '1';
      if (raw) {
        return new NextResponse(ref.inlineBody, {
          status: 200,
          headers: {
            'Content-Type': ref.mime ?? 'application/octet-stream',
            'Content-Disposition': `${inlineReq ? 'inline' : 'attachment'}; filename="${(ref.name ?? 'file').replace(/"/g, '')}"`,
            // Never cached: a drawing changes, and a stale copy of somebody's boundary is worse
            // than a slow download.
            'Cache-Control': 'no-store',
          },
        });
      }
      const self = new URL(req.url);
      self.searchParams.set('raw', '1');
      return NextResponse.json({
        url: `${self.pathname}${self.search}`,
        name: ref.name,
        mime_type: ref.mime,
      });
    }

    if (!ref.bucket || !ref.path) {
      return NextResponse.json({ error: ref.error ?? 'File not found.' }, { status: ref.status ?? 404 });
    }
    const { data, error } = await supabaseAdmin.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, inlineReq ? INLINE_URL_SECONDS : DOWNLOAD_URL_SECONDS, inlineReq ? {} : { download: ref.name });
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
    .createSignedUrl(node.storage_path, inlineReq ? INLINE_URL_SECONDS : DOWNLOAD_URL_SECONDS, inlineReq ? {} : { download: node.name });
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not generate a link.' }, { status: 500 });
  }
  // Recorded for real `file_nodes` only. The mount branches above hand out receipts, job files and
  // drawings, whose ids belong to their own source tables — writing those under `entity_type
  // = 'file_node'` would put rows in the history of nodes that do not exist. `inline` is kept as a
  // field because previewing a document in the viewer and pulling a copy down are different acts.
  await recordFileEvent({
    action: 'file_downloaded',
    nodeId: node.id,
    actorEmail: user.email,
    metadata: { name: node.name, inline: inlineReq, size_bytes: node.size_bytes ?? null },
  });

  return NextResponse.json({ url: data.signedUrl, name: node.name, mime_type: node.mime_type });
}
