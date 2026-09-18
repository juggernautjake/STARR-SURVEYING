// app/api/admin/jobs/[id]/property-map/thumbnail/route.ts — keep the preview a browser just made.
//
// Owner, 2026-09-16: "we need to make it so that we can see the first page thumbnail and poster
// frames for videos."
//
// The deployment has no PDF renderer and no video decoder; every browser that opens the file panel
// has both. So the first browser to need a preview renders it — pdf.js for page one, a <video>
// seeked a little way in and painted onto a <canvas> for a poster — and posts the result here,
// where it is kept so the work happens once for everybody. seeds/644 has the full argument.
//
// This is an untrusted edge: the browser is asked for a picture and could post anything. The
// checking lives in lib/jobs/file-thumbnails.ts, where it is tested — a type from a list rather
// than whatever was claimed, a cap applied to the base64 before it is ever decoded into bytes, and
// SVG refused outright because it is a scriptable document wearing an image's name.
//
// A browser that TRIED and could not — a scanned PDF pdf.js will not open, a codec it will not
// decode — posts `failed` instead, which is what stops every future panel queueing the same file
// forever for everyone.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { JOB_FILES_BUCKET, type JobFileRow } from '@/lib/jobs/file-storage';
import { decodeThumbDataUrl, thumbStoragePath, THUMB_MIME } from '@/lib/jobs/file-thumbnails';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const POST = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    job_file_id?: string;
    /** A canvas `toDataURL` result. Absent when the browser is reporting a failure. */
    data_url?: string;
    /** 'failed' when generation was attempted and did not work; 'unsupported' when it never can. */
    state?: 'failed' | 'unsupported';
  };
  if (!body.job_file_id) return NextResponse.json({ error: 'job_file_id is required.' }, { status: 400 });

  // The file has to be this job's — otherwise the endpoint writes previews for anybody's files.
  const { data: fileRow } = await supabaseAdmin.from('job_files').select('*').eq('id', body.job_file_id).maybeSingle();
  const file = fileRow as (JobFileRow & { job_id?: string }) | null;
  if (!file || String(file.job_id ?? '') !== params.id) {
    return NextResponse.json({ error: 'That file does not belong to this job.' }, { status: 404 });
  }

  // A browser reporting that it could not make one. Recorded so nobody tries again.
  if (!body.data_url) {
    const state = body.state === 'unsupported' ? 'unsupported' : 'failed';
    await supabaseAdmin.from('job_files')
      .update({ thumb_state: state, thumb_updated_at: new Date().toISOString() })
      .eq('id', body.job_file_id);
    return NextResponse.json({ ok: true, thumb_state: state });
  }

  const decoded = decodeThumbDataUrl(body.data_url);
  if ('error' in decoded) return NextResponse.json({ error: decoded.error }, { status: 400 });

  // A preview always goes in the files bucket, never in the bucket the file itself lives in.
  //
  // 2026-09-17: a video's poster frame used to be written to the row's own bucket, which for a
  // video is `starr-field-videos` — whose MIME allowlist is video types only. Storage refused
  // every poster with "mime type image/webp is not supported", so video tiles could never get one,
  // while PDFs and images (which land in `starr-field-files`, no allowlist) worked fine. Measured
  // against live storage, not inferred. `starr-field-files` takes any type and is the same 500 MB.
  const bucket = JOB_FILES_BUCKET;
  const path = thumbStoragePath(String(file.id));
  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, decoded.bytes, {
    contentType: decoded.contentType || THUMB_MIME,
    upsert: true,
  });
  if (uploadError) {
    console.error('[property-map] thumbnail upload failed:', uploadError);
    return NextResponse.json({ error: 'The preview could not be stored.' }, { status: 500 });
  }

  const { error } = await supabaseAdmin.from('job_files').update({
    thumb_path: path,
    thumb_bucket: bucket,
    thumb_state: 'ok',
    thumb_updated_at: new Date().toISOString(),
  }).eq('id', body.job_file_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, thumb_state: 'ok' });
}, { routeName: 'admin/jobs/property-map/thumbnail' });
