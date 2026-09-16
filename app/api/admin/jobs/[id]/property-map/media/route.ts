// app/api/admin/jobs/[id]/property-map/media/route.ts — what is attached to a point.
//
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
//
//   POST    attach a job file to a point (one that was just uploaded, or one already in the job)
//   PATCH   edit a caption
//   DELETE  detach — the file stays in the job, only the pin stops pointing at it
//
// ── ATTACHING IS LINKING, NEVER COPYING ─────────────────────────────────────────────────────────
// A photo pinned to a point is the SAME row as the photo in the job's Photos folder. Copy the bytes
// and you pay twice for storage and, worse, the two drift the moment one is renamed or deleted —
// so "the photo on the map" and "the photo in the folder" stop being the same photo. The file has
// to belong to this job, which is the check that stops a map on job A quietly displaying job B's
// pictures.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadPropertyMap } from '@/lib/jobs/property-map-server';
import { mediaKindFor } from '@/lib/jobs/property-map';
import { displayName, mimeOf, type JobFileRow } from '@/lib/jobs/file-storage';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email as string };
}

/** The point must be on a live map that belongs to this job. */
async function pointOfJob(jobId: string, pointId: string): Promise<{ id: string; map_id: string } | null> {
  const { data } = await supabaseAdmin.from('job_map_points')
    .select('id, map_id, job_property_maps!inner(job_id, deleted_at)')
    .eq('id', pointId).is('deleted_at', null).maybeSingle();
  const row = data as { id: string; map_id: string; job_property_maps?: { job_id: string; deleted_at: string | null } } | null;
  if (!row?.job_property_maps || row.job_property_maps.job_id !== jobId || row.job_property_maps.deleted_at) return null;
  return { id: row.id, map_id: row.map_id };
}

export const POST = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as {
    point_id?: string; job_file_id?: string; caption?: string; thumb_path?: string; thumb_bucket?: string;
  };
  if (!body.point_id || !body.job_file_id) {
    return NextResponse.json({ error: 'point_id and job_file_id are required.' }, { status: 400 });
  }
  const point = await pointOfJob(params.id, body.point_id);
  if (!point) return NextResponse.json({ error: 'That point is not on this job.' }, { status: 404 });

  // The file has to be this job's. A map must never be able to display another job's photographs.
  const { data: fileRow } = await supabaseAdmin.from('job_files')
    .select('*').eq('id', body.job_file_id).maybeSingle();
  const file = fileRow as JobFileRow | null;
  if (!file || String((file as { job_id?: string }).job_id ?? '') !== params.id) {
    return NextResponse.json({ error: 'That file does not belong to this job.' }, { status: 404 });
  }

  const { data: existing } = await supabaseAdmin.from('job_map_point_media')
    .select('ordinal').eq('point_id', point.id).is('deleted_at', null).order('ordinal', { ascending: false }).limit(1);
  const nextOrdinal = ((existing ?? [])[0] as { ordinal: number } | undefined)?.ordinal ?? 0;

  const { error } = await supabaseAdmin.from('job_map_point_media').insert({
    point_id: point.id,
    job_file_id: body.job_file_id,
    kind: mediaKindFor(mimeOf(file), displayName(file)),
    thumb_path: body.thumb_path ?? null,
    thumb_bucket: body.thumb_bucket ?? null,
    caption: (body.caption ?? '').trim() || null,
    ordinal: nextOrdinal + 1,
    created_by: g.email,
  });
  // The unique index says the same file cannot hang on the same point twice; a double-click should
  // be a no-op, not an error the person has to read.
  if (error && !/duplicate key|unique/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(await loadPropertyMap(params.id, point.map_id));
}, { routeName: 'admin/jobs/property-map/media' });

export const PATCH = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as { point_id?: string; media_id?: string; caption?: string | null };
  if (!body.point_id || !body.media_id) return NextResponse.json({ error: 'point_id and media_id are required.' }, { status: 400 });
  const point = await pointOfJob(params.id, body.point_id);
  if (!point) return NextResponse.json({ error: 'That point is not on this job.' }, { status: 404 });

  const { error } = await supabaseAdmin.from('job_map_point_media')
    .update({ caption: (body.caption ?? '').trim() || null })
    .eq('id', body.media_id).eq('point_id', point.id).is('deleted_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await loadPropertyMap(params.id, point.map_id));
}, { routeName: 'admin/jobs/property-map/media' });

export const DELETE = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const { searchParams } = new URL(req.url);
  const pointId = searchParams.get('point_id') ?? '';
  const mediaId = searchParams.get('media_id') ?? '';
  if (!pointId || !mediaId) return NextResponse.json({ error: 'point_id and media_id are required.' }, { status: 400 });
  const point = await pointOfJob(params.id, pointId);
  if (!point) return NextResponse.json({ error: 'That point is not on this job.' }, { status: 404 });

  // Detach only. The file is the job's, it stays in the job's folders, and it stays in search.
  const { error } = await supabaseAdmin.from('job_map_point_media')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', mediaId).eq('point_id', point.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await loadPropertyMap(params.id, point.map_id));
}, { routeName: 'admin/jobs/property-map/media' });
