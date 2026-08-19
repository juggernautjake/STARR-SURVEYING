// app/api/admin/jobs/files/[id]/download/route.ts — hand over a job attachment's bytes.
//
// Answers with a **302 to a short-lived signed URL** rather than JSON carrying one. That choice is
// what lets `<a href>` and `<img src>` point straight at this route: a photo gallery that has to
// fetch-then-parse before it can show a thumbnail is a gallery that flickers, and every caller
// would have to remember to do it.
//
// Legacy rows are served too, because they are real files somebody attached:
//   · a `data:` URI redirects to itself — the browser already knows how to open one
//   · a linked File Explorer document is NOT served here at all. It redirects to the explorer's own
//     download route, so its permissions are re-checked by the module that owns them. A job must
//     never become a side door around file permissions.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { shapeOf, displayName, JOB_FILES_BUCKET, type JobFileRow } from '@/lib/jobs/file-storage';

const SIGNED_URL_SECONDS = 60 * 15;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;

  const { data } = await supabaseAdmin
    .from('job_files')
    .select('id, job_id, file_name, name, file_url, storage_path, mime_type, content_type, file_node_id, is_deleted')
    .eq('id', id)
    .maybeSingle();

  const row = data as (JobFileRow & { is_deleted?: boolean | null }) | null;
  if (!row || row.is_deleted) {
    return NextResponse.json({ error: 'That file is not here.' }, { status: 404 });
  }

  const shape = shapeOf(row);

  if (shape === 'linked') {
    return NextResponse.redirect(new URL(`/api/admin/files/${row.file_node_id}/download`, req.url));
  }

  if (shape === 'legacy-inline' || shape === 'legacy-remote') {
    // A `data:` URI cannot be the target of NextResponse.redirect (it is not an http(s) URL), so it
    // is returned as the body with its own media type instead of being bounced to. Same outcome for
    // the caller: the bytes arrive.
    const url = (row.file_url ?? '').trim();
    if (shape === 'legacy-remote') return NextResponse.redirect(url);

    const comma = url.indexOf(',');
    const meta = url.slice(5, comma);          // between 'data:' and the comma
    const isB64 = /;base64$/i.test(meta);
    const mime = meta.replace(/;base64$/i, '') || 'application/octet-stream';
    const payload = url.slice(comma + 1);
    const bytes = isB64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `inline; filename="${displayName(row).replace(/"/g, '')}"`,
        // Not cacheable by a shared cache: the row is only reachable to a signed-in user and this
        // response carries the bytes themselves.
        'Cache-Control': 'private, max-age=60',
      },
    });
  }

  if (shape === 'missing') {
    return NextResponse.json(
      { error: 'This attachment has no file behind it.' },
      { status: 404 },
    );
  }

  const { data: signed, error } = await supabaseAdmin.storage
    .from(JOB_FILES_BUCKET)
    .createSignedUrl(row.storage_path as string, SIGNED_URL_SECONDS);

  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not open that file.' },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
