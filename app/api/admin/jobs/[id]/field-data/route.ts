// app/api/admin/jobs/[id]/field-data/route.ts — Consolidated per-job
// field-data for the office reviewer.
//
// GET /api/admin/jobs/{job_id}/field-data
//
// Returns everything captured for one job in a single round trip so
// the dispatcher / bookkeeper can review the entire job without
// drilling into a dozen sub-routes:
//
//   - job          : { id, name, job_number, address, ... }
//   - points       : [{ id, name, code_category, captured_at,
//                       device_lat/lon, media_count, note_count }]
//   - job_media    : photos / voice / video attached at job level
//                    (no data_point_id) with signed URLs per tier
//   - job_notes    : free-text + structured notes attached at job
//                    level
//   - job_files    : PDF / CSV / etc. attached at job level
//   - stats        : { points, photos, videos, voice, notes,
//                      files, total_media }
//
// Every signed URL has a 1-hour TTL; the page can re-fetch on focus
// to refresh expired links. Failures sign to null so a single
// missing object doesn't blow up the whole response.
//
// Logging: console.warn for sign failures (cap'd at 3 per request
// so a misconfigured bucket doesn't flood logs); console.error for
// hard failures via withErrorHandler. Auth: admin / developer /
// tech_support.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// ── Bucket config (must mirror seeds/220-226 declarations) ──────────────────

const PHOTO_BUCKET = 'starr-field-photos';
const VOICE_BUCKET = 'starr-field-voice';
const VIDEO_BUCKET = 'starr-field-videos';
const FILES_BUCKET = 'starr-field-files';
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

// ── Types ────────────────────────────────────────────────────────────────────

interface PointSummary {
  id: string;
  name: string;
  code_category: string | null;
  description: string | null;
  device_lat: number | null;
  device_lon: number | null;
  is_offset: boolean | null;
  is_correction: boolean | null;
  created_at: string;
  created_by_email: string | null;
  created_by_name: string | null;
  media_count: number;
  note_count: number;
  /** First photo's signed thumbnail URL for the list-tile preview;
   *  null when the point has no photos OR the sign failed. */
  thumb_signed_url: string | null;
}

interface JobMediaRow {
  id: string;
  media_type: string;
  storage_signed_url: string | null;
  thumbnail_signed_url: string | null;
  original_signed_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  device_lat: number | null;
  device_lon: number | null;
  captured_at: string | null;
  uploaded_at: string | null;
  upload_state: string | null;
  transcription: string | null;
  transcription_status: string | null;
  /** Best-effort filename for the download (storage_path basename). */
  download_name: string;
  /** Author attribution — surfaced as "Uploaded by X" in the UI.
   *  Per the user's directive: every uploaded item must show the
   *  uploader's name + timestamp. */
  uploaded_by_email: string | null;
  uploaded_by_name: string | null;
}

interface JobNoteRow {
  id: string;
  body: string;
  note_template: string | null;
  structured_payload: Record<string, unknown> | null;
  is_current: boolean;
  user_email: string;
  created_at: string;
}

interface JobFileRow {
  id: string;
  name: string;
  description: string | null;
  signed_url: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  upload_state: string | null;
  created_at: string;
  uploaded_by_email: string | null;
  uploaded_by_name: string | null;
}

// ── Handler ──────────────────────────────────────────────────────────────────

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

  // Next 15: parse the dynamic id from the URL pathname (the
  // withErrorHandler signature accepts (req) only).
  // path: /api/admin/jobs/{id}/field-data — id is third-from-last
  // before the empty trailing segment. filter(Boolean) drops empties.
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // segments: ['api','admin','jobs',id,'field-data'] → id at index 3
  const jobId = segments[segments.length - 2];
  if (!jobId) {
    return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
  }

  // 1. Job header.
  const { data: jobRaw, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select(
      'id, name, job_number, description, address, city, state, zip, county, survey_type, client_name, stage, centroid_lat, centroid_lon, geofence_radius_m, created_at'
    )
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!jobRaw) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // 2. Bulk fetches in parallel — points / media / notes / files
  //    for the job. Bounded by job_id + (data_point_id IS NULL for
  //    job-level rows) to keep the response size sane.
  const [pointsRes, mediaRes, notesRes, filesRes] = await Promise.all([
    supabaseAdmin
      .from('field_data_points')
      .select(
        'id, name, code_category, description, device_lat, device_lon, is_offset, is_correction, created_at, created_by'
      )
      .eq('job_id', jobId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('field_media')
      .select(
        'id, media_type, data_point_id, storage_url, thumbnail_url, original_url, annotated_url, annotations, transcription, transcription_status, duration_seconds, file_size_bytes, device_lat, device_lon, captured_at, uploaded_at, upload_state, created_by'
      )
      .eq('job_id', jobId)
      .order('captured_at', { ascending: false }),
    supabaseAdmin
      .from('fieldbook_notes')
      .select(
        'id, body, note_template, structured_data, is_current, user_email, data_point_id, created_at'
      )
      .eq('job_id', jobId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('job_files')
      .select(
        'id, name, description, storage_path, content_type, file_size_bytes, upload_state, created_at, data_point_id, created_by'
      )
      .eq('job_id', jobId)
      .order('created_at', { ascending: false }),
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
  if (notesRes.error) {
    return NextResponse.json(
      { error: notesRes.error.message },
      { status: 500 }
    );
  }
  if (filesRes.error) {
    return NextResponse.json(
      { error: filesRes.error.message },
      { status: 500 }
    );
  }

  type RawPoint = {
    id: string;
    name: string;
    code_category: string | null;
    description: string | null;
    device_lat: number | null;
    device_lon: number | null;
    is_offset: boolean | null;
    is_correction: boolean | null;
    created_at: string;
    created_by: string | null;
  };
  type RawMedia = {
    id: string;
    media_type: string;
    data_point_id: string | null;
    storage_url: string | null;
    thumbnail_url: string | null;
    original_url: string | null;
    annotated_url: string | null;
    annotations: string | null;
    transcription: string | null;
    transcription_status: string | null;
    duration_seconds: number | null;
    file_size_bytes: number | null;
    device_lat: number | null;
    device_lon: number | null;
    captured_at: string | null;
    uploaded_at: string | null;
    upload_state: string | null;
    created_by: string | null;
  };
  type RawNote = {
    id: string;
    body: string | null;
    note_template: string | null;
    structured_data: string | null;
    is_current: boolean | null;
    user_email: string | null;
    data_point_id: string | null;
    created_at: string;
  };
  type RawFile = {
    id: string;
    name: string;
    description: string | null;
    storage_path: string;
    content_type: string | null;
    file_size_bytes: number | null;
    upload_state: string | null;
    created_at: string;
    data_point_id: string | null;
    created_by: string | null;
  };
  const rawPoints = (pointsRes.data ?? []) as RawPoint[];
  const rawMedia = (mediaRes.data ?? []) as RawMedia[];
  const rawNotes = (notesRes.data ?? []) as RawNote[];
  const rawFiles = (filesRes.data ?? []) as RawFile[];

  // 3. Resolve creator emails for points + media + files in a
  //    single bulk look-up. Per the user's directive: "any point
  //    or information or media that is uploaded to a job should
  //    have the name of who uploaded it."
  const userIds = [
    ...new Set(
      [
        ...rawPoints.map((p) => p.created_by),
        ...rawMedia.map((m) => m.created_by),
        ...rawFiles.map((f) => f.created_by),
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
      return NextResponse.json(
        { error: usersErr.message },
        { status: 500 }
      );
    }
    for (const u of (usersRaw ?? []) as Array<{
      id: string;
      email: string;
      name: string;
    }>) {
      usersById.set(u.id, { email: u.email, name: u.name });
    }
  }

  // 4. Sign-URL helper — same pattern as /api/admin/field-data/[id]
  //    (limit 3 sign-failure log lines per request to avoid flood).
  let signFailures = 0;
  const signOne = async (
    bucket: string,
    path: string | null
  ): Promise<string | null> => {
    if (!path) return null;
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SEC);
    if (error) {
      if (signFailures < 3) {
        console.warn('[admin/jobs/:id/field-data] sign failed', {
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

  // 5. Build per-point summaries with media + note counts. Index
  //    media + notes by data_point_id once so we don't scan the
  //    arrays per point.
  const mediaByPoint = new Map<string, RawMedia[]>();
  const jobLevelMedia: RawMedia[] = [];
  for (const m of rawMedia) {
    if (m.data_point_id) {
      const arr = mediaByPoint.get(m.data_point_id) ?? [];
      arr.push(m);
      mediaByPoint.set(m.data_point_id, arr);
    } else {
      jobLevelMedia.push(m);
    }
  }
  const notesByPoint = new Map<string, RawNote[]>();
  const jobLevelNotes: RawNote[] = [];
  for (const n of rawNotes) {
    if (n.data_point_id) {
      const arr = notesByPoint.get(n.data_point_id) ?? [];
      arr.push(n);
      notesByPoint.set(n.data_point_id, arr);
    } else {
      jobLevelNotes.push(n);
    }
  }
  const filesByPoint = new Map<string, RawFile[]>();
  const jobLevelFiles: RawFile[] = [];
  for (const f of rawFiles) {
    if (f.data_point_id) {
      const arr = filesByPoint.get(f.data_point_id) ?? [];
      arr.push(f);
      filesByPoint.set(f.data_point_id, arr);
    } else {
      jobLevelFiles.push(f);
    }
  }

  const points: PointSummary[] = await Promise.all(
    rawPoints.map(async (p) => {
      const pmedia = mediaByPoint.get(p.id) ?? [];
      const pnotes = notesByPoint.get(p.id) ?? [];
      const firstPhoto = pmedia.find((m) => m.media_type === 'photo');
      const thumbPath =
        firstPhoto?.thumbnail_url ?? firstPhoto?.storage_url ?? null;
      const thumb = thumbPath
        ? await signOne(PHOTO_BUCKET, thumbPath)
        : null;
      const u = p.created_by ? usersById.get(p.created_by) : null;
      return {
        id: p.id,
        name: p.name,
        code_category: p.code_category,
        description: p.description,
        device_lat: p.device_lat,
        device_lon: p.device_lon,
        is_offset: p.is_offset,
        is_correction: p.is_correction,
        created_at: p.created_at,
        created_by_email: u?.email ?? null,
        created_by_name: u?.name ?? null,
        media_count: pmedia.length,
        note_count: pnotes.length,
        thumb_signed_url: thumb,
      };
    })
  );

  // 6. Sign job-level media (photo / voice / video each go to a
  //    different bucket). Compute a download_name from the
  //    storage_path basename so the Download link offers a
  //    sensible filename.
  const jobMedia: JobMediaRow[] = await Promise.all(
    jobLevelMedia.map(async (m) => {
      const bucket =
        m.media_type === 'voice'
          ? VOICE_BUCKET
          : m.media_type === 'video'
            ? VIDEO_BUCKET
            : PHOTO_BUCKET;
      const [storage, thumbnail, original] = await Promise.all([
        signOne(bucket, m.storage_url),
        signOne(bucket, m.thumbnail_url),
        signOne(bucket, m.original_url),
      ]);
      const path = m.original_url ?? m.storage_url ?? '';
      const download_name = path.split('/').pop() ?? `${m.id}.bin`;
      const u = m.created_by ? usersById.get(m.created_by) : null;
      return {
        id: m.id,
        media_type: m.media_type,
        storage_signed_url: storage,
        thumbnail_signed_url: thumbnail,
        original_signed_url: original,
        duration_seconds: m.duration_seconds,
        file_size_bytes: m.file_size_bytes,
        device_lat: m.device_lat,
        device_lon: m.device_lon,
        captured_at: m.captured_at,
        uploaded_at: m.uploaded_at,
        upload_state: m.upload_state,
        transcription: m.transcription,
        transcription_status: m.transcription_status,
        download_name,
        uploaded_by_email: u?.email ?? null,
        uploaded_by_name: u?.name ?? null,
      };
    })
  );

  // 7. Job-level notes + files — same shape as the per-point versions
  //    on /api/admin/field-data/[id] for UI parity.
  const jobNotes: JobNoteRow[] = jobLevelNotes.map((n) => {
    let payload: Record<string, unknown> | null = null;
    if (n.structured_data) {
      try {
        const parsed = JSON.parse(n.structured_data);
        if (parsed && typeof parsed === 'object') {
          payload = parsed as Record<string, unknown>;
        }
      } catch {
        /* malformed JSON — body still renders */
      }
    }
    return {
      id: n.id,
      body: n.body ?? '',
      note_template: n.note_template,
      structured_payload: payload,
      is_current: !!n.is_current,
      user_email: n.user_email ?? '',
      created_at: n.created_at,
    };
  });

  const jobFiles: JobFileRow[] = await Promise.all(
    jobLevelFiles.map(async (f) => {
      const signed = await signOne(FILES_BUCKET, f.storage_path);
      const u = f.created_by ? usersById.get(f.created_by) : null;
      return {
        id: f.id,
        name: f.name,
        description: f.description,
        signed_url: signed,
        content_type: f.content_type,
        file_size_bytes: f.file_size_bytes,
        upload_state: f.upload_state,
        created_at: f.created_at,
        uploaded_by_email: u?.email ?? null,
        uploaded_by_name: u?.name ?? null,
      };
    })
  );

  // 8. Stats — count across BOTH job-level + per-point so the
  //    header shows "12 photos in this job" not "0 job-level + 12
  //    in points (you do the math)".
  const stats = {
    points: rawPoints.length,
    photos: rawMedia.filter((m) => m.media_type === 'photo').length,
    videos: rawMedia.filter((m) => m.media_type === 'video').length,
    voice: rawMedia.filter((m) => m.media_type === 'voice').length,
    notes: rawNotes.length,
    files: rawFiles.length,
    total_media: rawMedia.length,
  };

  return NextResponse.json({
    job: jobRaw,
    points,
    job_media: jobMedia,
    job_notes: jobNotes,
    job_files: jobFiles,
    stats,
  });
}, { routeName: 'admin/jobs/:id/field-data' });
