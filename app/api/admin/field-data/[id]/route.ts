// app/api/admin/field-data/[id]/route.ts — Per-point detail
//
// GET /api/admin/field-data/{point_id}
//   Returns a single field_data_points row + every field_media row
//   attached to it, with signed URLs (1 h TTL) for storage_url +
//   thumbnail_url + original_url + annotated_url so the admin
//   detail page can render the full gallery without per-tile
//   round-trips.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const PHOTO_BUCKET = 'starr-field-photos';
const FILES_BUCKET = 'starr-field-files';
const SIGNED_URL_TTL_SEC = 60 * 60;

interface DataPointRow {
  id: string;
  job_id: string;
  name: string;
  code_category: string | null;
  description: string | null;
  device_lat: number | null;
  device_lon: number | null;
  device_altitude_m: number | null;
  device_accuracy_m: number | null;
  device_compass_heading: number | null;
  is_offset: boolean | null;
  is_correction: boolean | null;
  corrects_point_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AdminJobFileRow {
  id: string;
  name: string;
  description: string | null;
  storage_path: string;
  /** Signed URL (1 h TTL); null when sign failed. */
  signed_url: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  upload_state: string | null;
  created_by: string | null;
  created_at: string;
  uploaded_at: string | null;
}

export interface AdminFieldNoteRow {
  id: string;
  body: string;
  note_template: string | null;
  /** Parsed structured_data JSON when present; null when the column
   *  is empty or the JSON is malformed (defensive parse). */
  structured_payload: Record<string, unknown> | null;
  is_current: boolean;
  user_email: string;
  created_at: string;
  updated_at: string | null;
  voice_transcript_media_id: string | null;
}

export interface AdminFieldMediaRow {
  id: string;
  media_type: string;
  burst_group_id: string | null;
  position: number | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  device_lat: number | null;
  device_lon: number | null;
  device_compass_heading: number | null;
  captured_at: string | null;
  uploaded_at: string | null;
  upload_state: string | null;
  transcription: string | null;
  /** Signed URLs (null when the underlying path is null OR the sign
   *  failed). */
  storage_signed_url: string | null;
  thumbnail_signed_url: string | null;
  original_signed_url: string | null;
  annotated_signed_url: string | null;
  /** TEXT-encoded JSON document of pen-stroke annotations the
   *  surveyor drew on the photo via the mobile annotator. The web
   *  admin renders these as an SVG overlay on top of the photo —
   *  the original_signed_url image bytes are NEVER modified per
   *  plan §5.4. Null when no annotations exist. */
  annotations: string | null;
}

export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('tech_support')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Next 15: params is a Promise<>; the URL parse is the robust
    // path that withErrorHandler's `(req) => …` signature supports.
    // (Same pattern as /api/admin/receipts/[id].)
    const id = new URL(req.url).pathname.split('/').filter(Boolean).pop();
    if (!id) {
      return NextResponse.json(
        { error: 'Missing point id' },
        { status: 400 }
      );
    }

    const { data: pointRaw, error: pointErr } = await supabaseAdmin
      .from('field_data_points')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (pointErr) {
      return NextResponse.json(
        { error: pointErr.message },
        { status: 500 }
      );
    }
    if (!pointRaw) {
      return NextResponse.json(
        { error: 'Point not found' },
        { status: 404 }
      );
    }
    const point = pointRaw as DataPointRow;

    // Annotate point with job + user + media + notes + files.
    const [
      { data: jobRaw },
      { data: userRaw },
      { data: mediaRaw },
      { data: notesRaw },
      { data: filesRaw },
    ] = await Promise.all([
      supabaseAdmin
        .from('jobs')
        .select('id, name, job_number')
        .eq('id', point.job_id)
        .maybeSingle(),
      point.created_by
        ? supabaseAdmin
            .from('registered_users')
            .select('id, email, name')
            .eq('id', point.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from('field_media')
        .select(
          'id, media_type, burst_group_id, position, duration_seconds, file_size_bytes, device_lat, device_lon, device_compass_heading, captured_at, uploaded_at, upload_state, transcription, storage_url, thumbnail_url, original_url, annotated_url, annotations'
        )
        .eq('data_point_id', id)
        .order('position', { ascending: true })
        .order('captured_at', { ascending: true }),
      supabaseAdmin
        .from('fieldbook_notes')
        .select(
          'id, body, note_template, structured_data, is_current, user_email, created_at, updated_at, voice_transcript_media_id'
        )
        .eq('data_point_id', id)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('job_files')
        .select(
          'id, name, description, storage_path, content_type, file_size_bytes, upload_state, created_by, created_at, uploaded_at'
        )
        .eq('data_point_id', id)
        .order('created_at', { ascending: false }),
    ]);

    type RawMedia = {
      id: string;
      media_type: string;
      burst_group_id: string | null;
      position: number | null;
      duration_seconds: number | null;
      file_size_bytes: number | null;
      device_lat: number | null;
      device_lon: number | null;
      device_compass_heading: number | null;
      captured_at: string | null;
      uploaded_at: string | null;
      upload_state: string | null;
      transcription: string | null;
      storage_url: string | null;
      thumbnail_url: string | null;
      original_url: string | null;
      annotated_url: string | null;
      annotations: string | null;
    };

    // Sign every URL in parallel. Each path that fails signs to null.
    const signOne = async (path: string | null): Promise<string | null> => {
      if (!path) return null;
      const { data, error } = await supabaseAdmin.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SEC);
      if (error) {
        console.warn('[admin/field-data/:id] sign failed', {
          path,
          error: error.message,
        });
        return null;
      }
      return data?.signedUrl ?? null;
    };

    const media: AdminFieldMediaRow[] = await Promise.all(
      ((mediaRaw ?? []) as RawMedia[]).map(async (m) => {
        const [storage, thumbnail, original, annotated] = await Promise.all([
          signOne(m.storage_url),
          signOne(m.thumbnail_url),
          signOne(m.original_url),
          signOne(m.annotated_url),
        ]);
        return {
          id: m.id,
          media_type: m.media_type,
          burst_group_id: m.burst_group_id,
          position: m.position,
          duration_seconds: m.duration_seconds,
          file_size_bytes: m.file_size_bytes,
          device_lat: m.device_lat,
          device_lon: m.device_lon,
          device_compass_heading: m.device_compass_heading,
          captured_at: m.captured_at,
          uploaded_at: m.uploaded_at,
          upload_state: m.upload_state,
          transcription: m.transcription,
          storage_signed_url: storage,
          thumbnail_signed_url: thumbnail,
          original_signed_url: original,
          annotated_signed_url: annotated,
          annotations: m.annotations,
        };
      })
    );

    type RawNote = {
      id: string;
      body: string | null;
      note_template: string | null;
      structured_data: string | null;
      is_current: boolean | null;
      user_email: string | null;
      created_at: string;
      updated_at: string | null;
      voice_transcript_media_id: string | null;
    };
    const notes: AdminFieldNoteRow[] = ((notesRaw ?? []) as RawNote[]).map(
      (n) => {
        let structuredPayload: Record<string, unknown> | null = null;
        if (n.structured_data) {
          try {
            const parsed = JSON.parse(n.structured_data);
            if (parsed && typeof parsed === 'object') {
              structuredPayload = parsed as Record<string, unknown>;
            }
          } catch {
            /* malformed JSON — render the body fallback */
          }
        }
        return {
          id: n.id,
          body: n.body ?? '',
          note_template: n.note_template,
          structured_payload: structuredPayload,
          is_current: !!n.is_current,
          user_email: n.user_email ?? '',
          created_at: n.created_at,
          updated_at: n.updated_at,
          voice_transcript_media_id: n.voice_transcript_media_id,
        };
      }
    );

    type RawFile = {
      id: string;
      name: string;
      description: string | null;
      storage_path: string;
      content_type: string | null;
      file_size_bytes: number | null;
      upload_state: string | null;
      created_by: string | null;
      created_at: string;
      uploaded_at: string | null;
    };
    const files: AdminJobFileRow[] = await Promise.all(
      ((filesRaw ?? []) as RawFile[]).map(async (f) => {
        let signedUrl: string | null = null;
        if (f.storage_path) {
          const { data, error } = await supabaseAdmin.storage
            .from(FILES_BUCKET)
            .createSignedUrl(f.storage_path, SIGNED_URL_TTL_SEC);
          if (error) {
            console.warn('[admin/field-data/:id] file sign failed', {
              path: f.storage_path,
              error: error.message,
            });
          } else {
            signedUrl = data?.signedUrl ?? null;
          }
        }
        return {
          id: f.id,
          name: f.name,
          description: f.description,
          storage_path: f.storage_path,
          signed_url: signedUrl,
          content_type: f.content_type,
          file_size_bytes: f.file_size_bytes,
          upload_state: f.upload_state,
          created_by: f.created_by,
          created_at: f.created_at,
          uploaded_at: f.uploaded_at,
        };
      })
    );

    return NextResponse.json({
      point: {
        ...point,
        job_name: (jobRaw as { name?: string } | null)?.name ?? null,
        job_number:
          (jobRaw as { job_number?: string } | null)?.job_number ?? null,
        created_by_email:
          (userRaw as { email?: string } | null)?.email ?? null,
        created_by_name:
          (userRaw as { name?: string } | null)?.name ?? null,
      },
      media,
      notes,
      files,
    });
  },
  { routeName: 'admin/field-data/:id' }
);
