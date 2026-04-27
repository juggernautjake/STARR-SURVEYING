// app/api/admin/jobs/[id]/field-data/manifest/route.ts
//
// GET /api/admin/jobs/{job_id}/field-data/manifest
//   ?ttl_hours=4   (optional, default 4, max 24)
//
// Returns a CSV manifest of every downloadable file for the job —
// photos, voice memos, videos, and generic file attachments —
// each with a long-lived signed URL the bookkeeper can wget /
// curl / drop into a download manager. This is the v1 "download
// any media in any job" surface; ZIP-streaming is F5+ polish.
//
// Why a manifest CSV instead of a server-side ZIP for v1?
//   - Some jobs have hundreds of MB of photos + video; streaming
//     a ZIP through Next.js holds a single connection open and
//     ties up worker memory.
//   - The CSV decouples download from the page request — the
//     bookkeeper opens it in Excel or feeds the URL column into
//     `xargs wget` and walks away.
//   - Signed URLs include the full bucket path so the file
//     names are descriptive (user-folder/{point or job}-{id}.ext).
//
// Auth: admin / developer / tech_support.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const PHOTO_BUCKET = 'starr-field-photos';
const VOICE_BUCKET = 'starr-field-voice';
const VIDEO_BUCKET = 'starr-field-videos';
const FILES_BUCKET = 'starr-field-files';

const DEFAULT_TTL_HOURS = 4;
const MAX_TTL_HOURS = 24;

function csvEscape(s: string | number | null | undefined): string {
  const v = String(s ?? '');
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

interface ManifestRow {
  point_name: string | null;
  kind: 'photo' | 'video' | 'voice' | 'file';
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  captured_at: string | null;
  /** Author of the upload — surfaced as a CSV column so the
   *  bookkeeper can grep for "everything Lance shot today" without
   *  cross-referencing. Mirrors uploaded_by_* on the JSON APIs. */
  uploaded_by_email: string | null;
  uploaded_by_name: string | null;
  signed_url: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (!isAdmin(session.user.roles) && !userRoles.includes('tech_support')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // path: /api/admin/jobs/{id}/field-data/manifest
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const jobId = segments[segments.length - 3];
  if (!jobId) {
    return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const ttlHoursRaw = searchParams.get('ttl_hours');
  const ttlHours = ttlHoursRaw
    ? Math.max(1, Math.min(MAX_TTL_HOURS, parseInt(ttlHoursRaw, 10)))
    : DEFAULT_TTL_HOURS;
  const ttlSec = ttlHours * 3600;

  // 1. Job header (for the filename + audit log).
  const { data: jobRaw, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select('id, name, job_number')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!jobRaw) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // 2. Bulk-fetch every downloadable for the job.
  const [mediaRes, filesRes, pointsRes] = await Promise.all([
    supabaseAdmin
      .from('field_media')
      .select(
        'id, media_type, data_point_id, storage_url, original_url, content_type:media_type, duration_seconds, file_size_bytes, captured_at, created_by'
      )
      .eq('job_id', jobId)
      .order('captured_at', { ascending: false }),
    supabaseAdmin
      .from('job_files')
      .select(
        'id, data_point_id, storage_path, name, content_type, file_size_bytes, created_at, created_by'
      )
      .eq('job_id', jobId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('field_data_points')
      .select('id, name')
      .eq('job_id', jobId),
  ]);
  if (mediaRes.error) {
    return NextResponse.json(
      { error: mediaRes.error.message },
      { status: 500 }
    );
  }
  if (filesRes.error) {
    return NextResponse.json(
      { error: filesRes.error.message },
      { status: 500 }
    );
  }
  if (pointsRes.error) {
    return NextResponse.json(
      { error: pointsRes.error.message },
      { status: 500 }
    );
  }

  type PointSlim = { id: string; name: string };
  const pointNames = new Map<string, string>();
  for (const p of (pointsRes.data ?? []) as PointSlim[]) {
    pointNames.set(p.id, p.name);
  }

  // 3. Sign-URL helper — failures sign to null + log a warn (cap'd
  //    at 5 per request to avoid log flood for a misconfigured
  //    bucket).
  let signFailures = 0;
  const signOne = async (
    bucket: string,
    path: string | null
  ): Promise<string | null> => {
    if (!path) return null;
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, ttlSec);
    if (error) {
      if (signFailures < 5) {
        console.warn('[admin/jobs/:id/manifest] sign failed', {
          bucket,
          path,
          error: error.message,
        });
        signFailures += 1;
      }
      return null;
    }
    return data?.signedUrl ?? null;
  };

  // 4. Build per-row signed URLs in parallel — media first, then
  //    files. Original tier preferred for photos so the bookkeeper
  //    gets full-resolution downloads.
  type RawMedia = {
    id: string;
    media_type: string;
    data_point_id: string | null;
    storage_url: string | null;
    original_url: string | null;
    duration_seconds: number | null;
    file_size_bytes: number | null;
    captured_at: string | null;
    created_by: string | null;
  };
  type RawFile = {
    id: string;
    data_point_id: string | null;
    storage_path: string;
    name: string;
    content_type: string | null;
    file_size_bytes: number | null;
    created_at: string;
    created_by: string | null;
  };

  const rawMediaRows = (mediaRes.data ?? []) as RawMedia[];
  const rawFileRows = (filesRes.data ?? []) as RawFile[];

  // Bulk-resolve every uploader UUID across media + files in one
  // IN-query so the CSV row builder is a Map lookup.
  const userIds = [
    ...new Set(
      [
        ...rawMediaRows.map((m) => m.created_by),
        ...rawFileRows.map((f) => f.created_by),
      ].filter((id): id is string => !!id)
    ),
  ];
  const usersById = new Map<string, { email: string; name: string }>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await supabaseAdmin
      .from('registered_users')
      .select('id, email, name')
      .in('id', userIds);
    if (usersErr) {
      console.warn('[admin/jobs/:id/manifest] user lookup failed', {
        error: usersErr.message,
      });
    } else {
      for (const u of (usersRaw ?? []) as Array<{
        id: string;
        email: string;
        name: string;
      }>) {
        usersById.set(u.id, { email: u.email, name: u.name });
      }
    }
  }

  const rows: ManifestRow[] = [];

  for (const m of rawMediaRows) {
    const bucket =
      m.media_type === 'voice'
        ? VOICE_BUCKET
        : m.media_type === 'video'
          ? VIDEO_BUCKET
          : PHOTO_BUCKET;
    const path = m.original_url ?? m.storage_url;
    const signed = await signOne(bucket, path);
    const filename = (path ?? `${m.id}.bin`).split('/').pop() ?? `${m.id}.bin`;
    const kind = (m.media_type === 'photo' ||
      m.media_type === 'video' ||
      m.media_type === 'voice'
      ? m.media_type
      : 'file') as ManifestRow['kind'];
    const u = m.created_by ? usersById.get(m.created_by) : null;
    rows.push({
      point_name: m.data_point_id
        ? (pointNames.get(m.data_point_id) ?? null)
        : null,
      kind,
      filename,
      content_type: null, // mime not stored separately on field_media
      size_bytes: m.file_size_bytes,
      duration_seconds: m.duration_seconds,
      captured_at: m.captured_at,
      uploaded_by_email: u?.email ?? null,
      uploaded_by_name: u?.name ?? null,
      signed_url: signed,
    });
  }

  for (const f of rawFileRows) {
    const signed = await signOne(FILES_BUCKET, f.storage_path);
    const u = f.created_by ? usersById.get(f.created_by) : null;
    rows.push({
      point_name: f.data_point_id
        ? (pointNames.get(f.data_point_id) ?? null)
        : null,
      kind: 'file',
      filename: f.name || (f.storage_path.split('/').pop() ?? 'file'),
      content_type: f.content_type,
      size_bytes: f.file_size_bytes,
      duration_seconds: null,
      captured_at: f.created_at,
      uploaded_by_email: u?.email ?? null,
      uploaded_by_name: u?.name ?? null,
      signed_url: signed,
    });
  }

  // 5. Build CSV. Header chosen to match common spreadsheet usage.
  const header = [
    'point_name',
    'kind',
    'filename',
    'content_type',
    'size_bytes',
    'duration_seconds',
    'captured_at',
    'uploaded_by_name',
    'uploaded_by_email',
    'signed_url',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.point_name),
        csvEscape(r.kind),
        csvEscape(r.filename),
        csvEscape(r.content_type),
        csvEscape(r.size_bytes),
        csvEscape(r.duration_seconds),
        csvEscape(r.captured_at),
        csvEscape(r.uploaded_by_name),
        csvEscape(r.uploaded_by_email),
        csvEscape(r.signed_url),
      ].join(',')
    );
  }
  const csv = lines.join('\n') + '\n';

  // Audit-log line so ops can correlate manifest pulls with user
  // activity ("who downloaded everything for this job?").
  console.log('[admin/jobs/:id/manifest] generated', {
    job_id: jobId,
    job_number: (jobRaw as { job_number?: string }).job_number ?? null,
    rows: rows.length,
    sign_failures: signFailures,
    ttl_hours: ttlHours,
    user_email: session.user.email,
  });

  const filename = `media_manifest_${
    (jobRaw as { job_number?: string }).job_number ?? jobId
  }.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}, { routeName: 'admin/jobs/:id/field-data/manifest' });
