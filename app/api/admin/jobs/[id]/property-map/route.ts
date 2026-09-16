// app/api/admin/jobs/[id]/property-map/route.ts — the job's interactive map, in one request.
//
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
//
//   GET    the whole map: the aerial, every point, every attachment, and a signed URL for each —
//          one round trip, because sixty signed-URL requests is how a page like this ends up taking
//          twenty seconds (lib/jobs/property-map-server.ts has the argument).
//          `?summary=1` answers only whether a map exists and how many points are on it, which is
//          all the button on the job page needs to know.
//   POST   create the map for this job, optionally naming the aerial that was just uploaded.
//   PATCH  rename it, or attach/replace the aerial image.
//   DELETE soft-delete the map. The points go with it; the files it pointed at stay in the job.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadPropertyMap, propertyMapSummary } from '@/lib/jobs/property-map-server';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email as string };
}

/** The job has to exist and not be in the bin — otherwise a mistyped id creates a map nothing owns. */
async function jobExists(jobId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('jobs').select('id').eq('id', jobId).is('deleted_at', null).maybeSingle();
  return Boolean(data);
}

export const GET = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const { searchParams } = new URL(req.url);
  if (searchParams.get('summary')) {
    return NextResponse.json(await propertyMapSummary(params.id));
  }
  const loaded = await loadPropertyMap(params.id, searchParams.get('map'));
  if (!loaded) return NextResponse.json({ map: null, points: [], imageUrl: null });
  return NextResponse.json(loaded);
}, { routeName: 'admin/jobs/property-map' });

export const POST = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  if (!(await jobExists(params.id))) return NextResponse.json({ error: 'That job no longer exists.' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string; file_id?: string | null; image_width?: number; image_height?: number;
  };
  const { data, error } = await supabaseAdmin.from('job_property_maps').insert({
    job_id: params.id,
    title: (body.title ?? '').trim() || 'Property map',
    file_id: body.file_id ?? null,
    image_width: Number(body.image_width) || null,
    image_height: Number(body.image_height) || null,
    created_by: g.email,
    updated_by: g.email,
  }).select('*').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(`[property-map] ${g.email} created a map for job ${params.id}`);
  return NextResponse.json(await loadPropertyMap(params.id, (data as { id: string } | null)?.id ?? null));
}, { routeName: 'admin/jobs/property-map' });

export const PATCH = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as {
    map_id?: string; title?: string; file_id?: string | null; image_width?: number; image_height?: number;
    georeference?: unknown;
  };
  if (!body.map_id) return NextResponse.json({ error: 'map_id is required.' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_by: g.email };
  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: 'A map needs a name.' }, { status: 400 });
    patch.title = title.slice(0, 120);
  }
  if (body.file_id !== undefined) patch.file_id = body.file_id;
  if (body.image_width !== undefined) patch.image_width = Number(body.image_width) || null;
  if (body.image_height !== undefined) patch.image_height = Number(body.image_height) || null;
  if (body.georeference !== undefined) patch.georeference = body.georeference;

  const { error } = await supabaseAdmin.from('job_property_maps')
    .update(patch).eq('id', body.map_id).eq('job_id', params.id).is('deleted_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await loadPropertyMap(params.id, body.map_id));
}, { routeName: 'admin/jobs/property-map' });

export const DELETE = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const mapId = new URL(req.url).searchParams.get('map_id');
  if (!mapId) return NextResponse.json({ error: 'map_id is required.' }, { status: 400 });
  // Soft delete, like every other job-owned thing: the aerial and the attached photos are ordinary
  // job files and stay exactly where they are, in the job's folders.
  const { error } = await supabaseAdmin.from('job_property_maps')
    .update({ deleted_at: new Date().toISOString(), updated_by: g.email })
    .eq('id', mapId).eq('job_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(`[property-map] ${g.email} deleted map ${mapId} on job ${params.id}`);
  return NextResponse.json({ ok: true });
}, { routeName: 'admin/jobs/property-map' });
