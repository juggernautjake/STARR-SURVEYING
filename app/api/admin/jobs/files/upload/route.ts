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
import { checkJobUpload, jobFileStoragePath, JOB_FILES_BUCKET } from '@/lib/jobs/file-storage';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    job_id?: string;
    name?: string;
    size_bytes?: number;
  };

  if (!body.job_id) return NextResponse.json({ error: 'job_id is required.' }, { status: 400 });

  const check = checkJobUpload({ name: body.name, sizeBytes: body.size_bytes });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // The job has to exist, and has to not be in the bin. Without this, a mistyped id writes an
  // orphan object into the bucket that no job page will ever list and no cleanup will ever find.
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('id')
    .eq('id', body.job_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'That job no longer exists.' }, { status: 404 });

  await ensureStorageBucket(JOB_FILES_BUCKET, { public: false });

  // The row id is minted HERE and returned, so the storage key and the `job_files` row that will
  // point at it agree by construction rather than by a second lookup that could pick the wrong row.
  const fileId = randomUUID();
  const path = jobFileStoragePath(session.user.email, fileId, body.name as string);

  const { data, error } = await supabaseAdmin.storage
    .from(JOB_FILES_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not start the upload.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    file_id: fileId,
    bucket: JOB_FILES_BUCKET,
    path: data.path,
    token: data.token,
    signed_url: data.signedUrl,
  });
}, { routeName: 'jobs/files/upload' });
