// app/api/admin/files/thumbnail/route.ts — keep the preview a browser just made, for the Explorer.
//
// Owner, 2026-09-19: "Please make sure that in our filing system for the jobs we have a way to
// choose different tiles sizes for each file preview so that we can see a thumbnail of each
// document/pdf/photo/video easily."
//
// The sibling of app/api/admin/jobs/[id]/property-map/thumbnail/route.ts, and the argument for
// both is in seeds/644: the deployment has no PDF renderer and no video decoder, every browser
// that opens a file list has both, so the first browser to look at a document makes its preview and
// posts it here to be kept for everybody afterwards.
//
// WHAT THIS ONE ADDS is that the Explorer shows a MOUNT — a view over several source tables — so
// the id it posts is not always a row in the same place. Two shapes are accepted:
//
//   `mnt:job-files:<id>`  → a job's file. seeds/644 columns on `job_files`.
//   `<uuid>`              → the Explorer's own document. seeds/649 columns on `file_nodes`.
//
// Every other mount source (research documents, receipts, CAD drawings, field media) has nowhere to
// keep a preview, and is told so plainly rather than silently accepting a picture and dropping it.
//
// ── WHO MAY WRITE ONE ───────────────────────────────────────────────────────────────────────────
//
// Not "an admin". The gate is the SAME per-node check the download route applies, because making a
// preview requires having read the file: `accessForNode` for an Explorer document, `resolveMountFile`
// for a mounted one. Gating on `isAdmin` instead would have been a way for any admin to overwrite
// the preview of a document they cannot open, and — worse — would have stopped the field crew, who
// are the people actually looking at these folders, from ever generating one.
//
// ── THE UNTRUSTED EDGE ──────────────────────────────────────────────────────────────────────────
//
// The browser is asked for a picture and could post anything at all. None of that checking is done
// here: `decodeThumbDataUrl` owns it and is tested without a browser — a content type taken from a
// list rather than from the claim, a size cap applied to the base64 BEFORE it is decoded into
// bytes, and SVG refused outright because it is a scriptable document wearing an image's name.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { accessForNode } from '@/lib/files/server';
import { canView, type FileUser } from '@/lib/files/permissions';
import { MOUNT_PREFIX, resolveMountFile } from '@/lib/files/mounts';
import { JOB_FILES_BUCKET } from '@/lib/jobs/file-storage';
import { decodeThumbDataUrl, thumbStoragePath, THUMB_MIME } from '@/lib/jobs/file-thumbnails';

export const dynamic = 'force-dynamic';

/** Which table a posted node id keeps its preview in, and under which row. */
function target(nodeId: string): { table: 'job_files' | 'file_nodes'; rowId: string } | null {
  if (!nodeId.startsWith(MOUNT_PREFIX)) return { table: 'file_nodes', rowId: nodeId };
  const rest = nodeId.slice(MOUNT_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return null;
  const key = rest.slice(0, sep);
  const rowId = rest.slice(sep + 1);
  if (key === 'job-files' && rowId) return { table: 'job_files', rowId };
  return null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);

  const body = (await req.json().catch(() => ({}))) as {
    node_id?: string;
    /** A canvas `toDataURL` result. Absent when the browser is reporting a failure. */
    data_url?: string;
    /** 'failed' when generation was attempted and did not work; 'unsupported' when it never can. */
    state?: 'failed' | 'unsupported';
  };
  const nodeId = (body.node_id ?? '').trim();
  if (!nodeId) return NextResponse.json({ error: 'node_id is required.' }, { status: 400 });

  const where = target(nodeId);
  if (!where) {
    // A receipt, a research document, a CAD drawing. Not an error the browser did anything wrong —
    // it asked a reasonable question and the answer is no — so it is told the state to remember
    // rather than given a 500 to retry.
    return NextResponse.json({ ok: true, thumb_state: 'unsupported' });
  }

  // The same gate as downloading it: a preview is a picture OF the file, so making one requires
  // being allowed to read it.
  if (where.table === 'file_nodes') {
    // An empty chain means the node is gone; `accessForNode` reports that as 'none' rather than
    // throwing, so the one check below covers both "not there" and "not yours".
    const { access } = await accessForNode(nodeId, user, admin);
    if (!canView(access)) {
      return NextResponse.json({ error: 'You do not have access to this file.' }, { status: 403 });
    }
  } else {
    const ref = await resolveMountFile(nodeId, user, admin);
    if (!ref.ok) return NextResponse.json({ error: ref.error ?? 'File not found.' }, { status: ref.status ?? 404 });
  }

  const stamp = new Date().toISOString();

  // A browser reporting that it could not make one. Recorded so nobody — here or on anybody else's
  // screen — queues the same unopenable scan again forever.
  if (!body.data_url) {
    const state = body.state === 'unsupported' ? 'unsupported' : 'failed';
    await supabaseAdmin.from(where.table)
      .update({ thumb_state: state, thumb_updated_at: stamp })
      .eq('id', where.rowId);
    return NextResponse.json({ ok: true, thumb_state: state });
  }

  const decoded = decodeThumbDataUrl(body.data_url);
  if ('error' in decoded) return NextResponse.json({ error: decoded.error }, { status: 400 });

  // Always the files bucket, never the bucket the file itself lives in — `starr-field-videos` has a
  // video-only MIME allowlist and refuses every WebP poster written to it. That was measured
  // against live storage on 2026-09-17, not inferred; see the sibling route.
  const bucket = JOB_FILES_BUCKET;
  // Prefixed by table, so a job file and an Explorer document that happen to share an id cannot
  // overwrite one another's picture. `thumbStoragePath` owns the rest of the shape.
  const path = thumbStoragePath(where.rowId).replace(/^thumbs\//, `thumbs/${where.table}/`);
  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, decoded.bytes, {
    contentType: decoded.contentType || THUMB_MIME,
    upsert: true,
  });
  if (uploadError) {
    console.error('[files] thumbnail upload failed:', uploadError);
    return NextResponse.json({ error: 'The preview could not be stored.' }, { status: 500 });
  }

  const { error } = await supabaseAdmin.from(where.table).update({
    thumb_path: path,
    thumb_bucket: bucket,
    thumb_state: 'ok',
    thumb_updated_at: stamp,
  }).eq('id', where.rowId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, thumb_state: 'ok' });
}, { routeName: 'admin/files/thumbnail' });
