// app/api/admin/jobs/files/upload/route.ts — a signed URL for a job attachment.
//
// The job page used to read a file with `FileReader.readAsDataURL` and post the base64 as JSON, so
// every attachment lived in a Postgres text column and the File Explorer — which reads storage
// objects — could not see a single one of them. `lib/jobs/file-storage.ts` has the full account.
//
// This is the same three-step the File Explorer already uses (`files/upload` → client PUT →
// `files`): ask for a signed URL, PUT the bytes straight to storage, then create the row. The
// middle step never passes through this API, which is what makes a 90 MB drawing possible at all —
// a JSON body that size is refused by the platform long before Postgres gets a chance to store it.

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { checkJobUpload, jobFileStoragePath, bucketFor, MAX_JOB_FILE_BYTES } from '@/lib/jobs/file-storage';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    job_id?: string;
    // 2026-08-19 — a document belonging to the engagement rather than to one job.
    project_id?: string;
    name?: string;
    size_bytes?: number;
    /** The browser's `File.type`. Decides the bucket and therefore the cap — video gets 500 MB
     *  rather than 100, which is the difference between a phone video uploading and not. */
    mime_type?: string;
  };

  if (!body.job_id && !body.project_id) {
    return NextResponse.json({ error: 'job_id or project_id is required.' }, { status: 400 });
  }

  const check = checkJobUpload({ name: body.name, sizeBytes: body.size_bytes, mime: body.mime_type });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // The owner has to exist, and has to not be in the bin. Without this, a mistyped id writes an
  // orphan object into the bucket that no page will ever list and no cleanup will ever find.
  if (body.job_id) {
    const { data: job } = await supabaseAdmin
      .from('jobs').select('id').eq('id', body.job_id).is('deleted_at', null).maybeSingle();
    if (!job) return NextResponse.json({ error: 'That job no longer exists.' }, { status: 404 });
  } else {
    const { data: project } = await supabaseAdmin
      .from('projects').select('id').eq('id', body.project_id as string).is('deleted_at', null).maybeSingle();
    if (!project) return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });
  }

  // Video goes to the 500 MB video bucket; everything else to the 100 MB documents bucket. One
  // function decides, so the upload, the row and the download cannot disagree — see seeds/605.
  const bucket = bucketFor(body.name, body.mime_type);
  // Explicit, because `ensureStorageBucket`'s fallback is 50 MB — the number this whole file exists
  // to stop the app believing. Both buckets are seeded at 500 MB, so this only matters if one is
  // ever recreated from scratch, which is exactly when a silent 50 MB would be hardest to find.
  await ensureStorageBucket(bucket, { public: false, fileSizeLimit: MAX_JOB_FILE_BYTES });

  // The row id is minted HERE and returned, so the storage key and the `job_files` row that will
  // point at it agree by construction rather than by a second lookup that could pick the wrong row.
  const fileId = randomUUID();
  const path = jobFileStoragePath(session.user.email, fileId, body.name as string);

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not start the upload.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    file_id: fileId,
    bucket,
    path: data.path,
    token: data.token,
    signed_url: data.signedUrl,
  });
}, { routeName: 'jobs/files/upload' });
