// app/api/admin/jobs/[id]/field-data/zip/route.ts
//
// GET  /api/admin/jobs/{job_id}/field-data/zip
// HEAD /api/admin/jobs/{job_id}/field-data/zip   → 200 if anything to zip, 404 otherwise
//
// Streams a ZIP archive containing every downloadable for the job —
// photos (original tier), videos, voice memos, and generic file
// attachments — laid out by type. The bookkeeper hits one button and
// gets the entire job offline.
//
// Why a streamed ZIP (not a buffered ZIP)?
//   Some jobs accumulate hundreds of MB of media. Buffering the
//   whole archive in memory would OOM the function. JSZip's
//   `generateInternalStream` emits chunks as they're zipped, which
//   we pipe into a Web ReadableStream and hand off to Next via the
//   Response constructor. Memory stays bounded by the largest
//   single file (~50 MB photo or ~200 MB video).
//
// Storage download flow per object:
//   - createSignedUrl(1 h)  →  fetch(url)  →  arrayBuffer()  →  zip.file(...)
//   The signed URL TTL is short because the entire stream completes
//   in seconds-to-minutes; the URL never leaves the server.
//
// File layout inside the ZIP:
//   {job_number}/
//     manifest.csv           ← parity with the CSV-only endpoint
//     photos/{point-name or 'job-level'}/{filename}
//     voice/{point-name or 'job-level'}/{filename}
//     videos/{point-name or 'job-level'}/{filename}
//     files/{point-name or 'job-level'}/{filename}
//
// Per the user's directive ("They should also be able to download
// any media in any job ... videos, documents, images, point files,
// or voice recordings"), this is the one-click bundle download.
//
// Auth: admin / developer / tech_support.
import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const PHOTO_BUCKET = 'starr-field-photos';
const VOICE_BUCKET = 'starr-field-voice';
const VIDEO_BUCKET = 'starr-field-videos';
const FILES_BUCKET = 'starr-field-files';
const SIGNED_URL_TTL_SEC = 60 * 60;

// Cap so a runaway job (e.g. tens of GB of video) doesn't lock the
// function for an hour. Bookkeeper falls back to the CSV manifest.
const MAX_OBJECTS = 5000;

function csvEscape(s: string | number | null | undefined): string {
  const v = String(s ?? '');
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Sanitize a path component so it survives ZIP extraction on
 *  Windows / macOS / Linux. Strip path separators and the ASCII
 *  control set; collapse whitespace. */
function safePart(s: string | null | undefined, fallback: string): string {
  const raw = (s ?? '').trim();
  if (!raw) return fallback;
  // eslint-disable-next-line no-control-regex
  return raw
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

export const HEAD = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return new NextResponse(null, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (!isAdmin(session.user.roles) && !userRoles.includes('tech_support')) {
    return new NextResponse(null, { status: 403 });
  }
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const jobId = segments[segments.length - 2];
  if (!jobId) return new NextResponse(null, { status: 400 });

  // Cheap counts only — HEAD must not fetch the bytes.
  const [{ count: mCount }, { count: fCount }] = await Promise.all([
    supabaseAdmin
      .from('field_media')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId),
    supabaseAdmin
      .from('job_files')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId),
  ]);
  const total = (mCount ?? 0) + (fCount ?? 0);
  return new NextResponse(null, { status: total > 0 ? 200 : 404 });
}, { routeName: 'admin/jobs/:id/field-data/zip:HEAD' });

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

  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const jobId = segments[segments.length - 2];
  if (!jobId) {
    return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
  }

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
  const jobRec = jobRaw as { id: string; name: string; job_number: string };
  const jobLabel = jobRec.job_number ?? jobRec.id;

  const [pointsRes, mediaRes, filesRes] = await Promise.all([
    supabaseAdmin
      .from('field_data_points')
      .select('id, name')
      .eq('job_id', jobId),
    supabaseAdmin
      .from('field_media')
      .select(
        'id, media_type, data_point_id, storage_url, original_url, file_size_bytes, captured_at, created_by'
      )
      .eq('job_id', jobId)
      .order('captured_at', { ascending: true }),
    supabaseAdmin
      .from('job_files')
      .select(
        'id, data_point_id, storage_path, name, content_type, file_size_bytes, created_at, created_by'
      )
      .eq('job_id', jobId)
      .order('created_at', { ascending: true }),
  ]);
  if (pointsRes.error) {
    return NextResponse.json(
      { error: pointsRes.error.message },
      { status: 500 }
    );
  }
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

  type PointSlim = { id: string; name: string };
  const pointNames = new Map<string, string>();
  for (const p of (pointsRes.data ?? []) as PointSlim[]) {
    pointNames.set(p.id, p.name);
  }

  type RawMedia = {
    id: string;
    media_type: string;
    data_point_id: string | null;
    storage_url: string | null;
    original_url: string | null;
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

  const rawMedia = (mediaRes.data ?? []) as RawMedia[];
  const rawFiles = (filesRes.data ?? []) as RawFile[];
  const totalObjects = rawMedia.length + rawFiles.length;
  if (totalObjects === 0) {
    return NextResponse.json(
      { error: 'No media or files attached to this job.' },
      { status: 404 }
    );
  }
  if (totalObjects > MAX_OBJECTS) {
    return NextResponse.json(
      {
        error: `Too many objects (${totalObjects}) — use the CSV manifest endpoint instead.`,
      },
      { status: 413 }
    );
  }

  // Resolve uploader names (single bulk IN-query) so the CSV row
  // bundled inside the ZIP matches what the standalone CSV endpoint
  // produces.
  const userIds = [
    ...new Set(
      [
        ...rawMedia.map((m) => m.created_by),
        ...rawFiles.map((f) => f.created_by),
      ].filter((id): id is string => !!id)
    ),
  ];
  const usersById = new Map<string, { email: string; name: string }>();
  if (userIds.length > 0) {
    const { data: usersRaw } = await supabaseAdmin
      .from('registered_users')
      .select('id, email, name')
      .in('id', userIds);
    for (const u of (usersRaw ?? []) as Array<{
      id: string;
      email: string;
      name: string;
    }>) {
      usersById.set(u.id, { email: u.email, name: u.name });
    }
  }

  const zip = new JSZip();
  const root = zip.folder(safePart(jobLabel, 'job'))!;

  // Audit + manifest CSV inside the ZIP — gives the bookkeeper a
  // table of contents listing every file's original metadata
  // (uploader, size, captured_at, …) without re-querying the DB.
  type ManifestRow = {
    point_name: string;
    kind: string;
    archive_path: string;
    filename: string;
    size_bytes: number | null;
    captured_at: string | null;
    uploaded_by_email: string | null;
    uploaded_by_name: string | null;
  };
  const manifestRows: ManifestRow[] = [];

  let signFailures = 0;
  let fetchFailures = 0;
  const sign = async (
    bucket: string,
    path: string | null
  ): Promise<string | null> => {
    if (!path) return null;
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SEC);
    if (error) {
      if (signFailures < 3) {
        console.warn('[admin/jobs/:id/zip] sign failed', {
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

  // Fetch + add media to the ZIP. Sequential per-object so memory
  // stays bounded by the largest single file. Each addFile() call
  // hands the buffer to JSZip and we drop our reference; JSZip's
  // streaming consumer will GC chunks as they're zipped out.
  for (const m of rawMedia) {
    const bucket =
      m.media_type === 'voice'
        ? VOICE_BUCKET
        : m.media_type === 'video'
          ? VIDEO_BUCKET
          : PHOTO_BUCKET;
    const subfolder =
      m.media_type === 'voice'
        ? 'voice'
        : m.media_type === 'video'
          ? 'videos'
          : 'photos';
    const path = m.original_url ?? m.storage_url;
    if (!path) continue;
    const filename = path.split('/').pop() ?? `${m.id}.bin`;
    const pointName = m.data_point_id
      ? safePart(pointNames.get(m.data_point_id) ?? null, 'unknown-point')
      : 'job-level';
    const archivePath = `${subfolder}/${pointName}/${filename}`;
    const url = await sign(bucket, path);
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (fetchFailures < 3) {
          console.warn('[admin/jobs/:id/zip] fetch failed', {
            path,
            status: res.status,
          });
          fetchFailures += 1;
        }
        continue;
      }
      const buf = await res.arrayBuffer();
      root.file(archivePath, buf);
      const u = m.created_by ? usersById.get(m.created_by) : null;
      manifestRows.push({
        point_name: m.data_point_id
          ? (pointNames.get(m.data_point_id) ?? '')
          : '',
        kind: m.media_type,
        archive_path: archivePath,
        filename,
        size_bytes: m.file_size_bytes,
        captured_at: m.captured_at,
        uploaded_by_email: u?.email ?? null,
        uploaded_by_name: u?.name ?? null,
      });
    } catch (err) {
      if (fetchFailures < 3) {
        console.warn('[admin/jobs/:id/zip] fetch threw', {
          path,
          error: err instanceof Error ? err.message : String(err),
        });
        fetchFailures += 1;
      }
    }
  }

  // Now generic files.
  for (const f of rawFiles) {
    if (!f.storage_path) continue;
    const filename =
      f.name || (f.storage_path.split('/').pop() ?? `${f.id}.bin`);
    const pointName = f.data_point_id
      ? safePart(pointNames.get(f.data_point_id) ?? null, 'unknown-point')
      : 'job-level';
    const archivePath = `files/${pointName}/${safePart(filename, f.id)}`;
    const url = await sign(FILES_BUCKET, f.storage_path);
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (fetchFailures < 3) {
          console.warn('[admin/jobs/:id/zip] fetch failed', {
            path: f.storage_path,
            status: res.status,
          });
          fetchFailures += 1;
        }
        continue;
      }
      const buf = await res.arrayBuffer();
      root.file(archivePath, buf);
      const u = f.created_by ? usersById.get(f.created_by) : null;
      manifestRows.push({
        point_name: f.data_point_id
          ? (pointNames.get(f.data_point_id) ?? '')
          : '',
        kind: 'file',
        archive_path: archivePath,
        filename,
        size_bytes: f.file_size_bytes,
        captured_at: f.created_at,
        uploaded_by_email: u?.email ?? null,
        uploaded_by_name: u?.name ?? null,
      });
    } catch (err) {
      if (fetchFailures < 3) {
        console.warn('[admin/jobs/:id/zip] fetch threw', {
          path: f.storage_path,
          error: err instanceof Error ? err.message : String(err),
        });
        fetchFailures += 1;
      }
    }
  }

  // Embed the per-zip manifest CSV.
  const header = [
    'point_name',
    'kind',
    'archive_path',
    'filename',
    'size_bytes',
    'captured_at',
    'uploaded_by_name',
    'uploaded_by_email',
  ];
  const lines = [header.join(',')];
  for (const r of manifestRows) {
    lines.push(
      [
        csvEscape(r.point_name),
        csvEscape(r.kind),
        csvEscape(r.archive_path),
        csvEscape(r.filename),
        csvEscape(r.size_bytes),
        csvEscape(r.captured_at),
        csvEscape(r.uploaded_by_name),
        csvEscape(r.uploaded_by_email),
      ].join(',')
    );
  }
  root.file('manifest.csv', lines.join('\n') + '\n');

  // Bridge JSZip's Node Buffer stream into a Web ReadableStream so
  // Next 14's Response can consume it. Each chunk is forwarded as
  // a Uint8Array; backpressure is handled by JSZip's own
  // generateInternalStream.
  const nodeStream = zip.generateInternalStream({
    type: 'nodebuffer',
    streamFiles: true,
    compression: 'STORE', // photos / videos are already compressed
  });
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream
        .on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        })
        .on('end', () => {
          controller.close();
        })
        .on('error', (err: Error) => {
          console.error('[admin/jobs/:id/zip] stream error', {
            error: err.message,
          });
          controller.error(err);
        });
      nodeStream.resume();
    },
    cancel() {
      // Browser bailed; stop reading the source.
      try {
        nodeStream.pause();
      } catch {
        /* ignore */
      }
    },
  });

  console.log('[admin/jobs/:id/zip] streaming', {
    job_id: jobId,
    job_number: jobRec.job_number,
    objects: manifestRows.length,
    sign_failures: signFailures,
    fetch_failures: fetchFailures,
    user_email: session.user.email,
  });

  const filename = `media_${jobLabel}.zip`;
  return new NextResponse(webStream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}, { routeName: 'admin/jobs/:id/field-data/zip' });
