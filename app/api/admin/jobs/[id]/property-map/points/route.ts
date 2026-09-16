// app/api/admin/jobs/[id]/property-map/points/route.ts — the pins on a property map.
//
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
//
//   POST    place a point at (x, y) — the fractions the browser computed from the click
//   PATCH   edit one: title, notes, type, status, or a new position after a drag
//   DELETE  remove one, and close the gap in the numbering
//
// Every response returns the WHOLE map again, freshly signed. It costs one extra read and it means
// the client never has to merge a partial update into its own copy — the commonest way a list and a
// map drift apart until a refresh "fixes" a bug that was never in the database.
//
// Ordinals are assigned and repaired here, not in the browser: two people placing a point at the
// same moment must not produce two point 7s, and the unique index would refuse the second anyway.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadPropertyMap } from '@/lib/jobs/property-map-server';
import { clampToImage, isKnownPointType, nextOrdinal, renumber, DEFAULT_POINT_TYPE, POINT_STATUSES } from '@/lib/jobs/property-map';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email as string };
}

/** The map has to belong to this job. Without this check the map_id in the body is an open door to
 *  every other job's points. */
async function mapOfJob(jobId: string, mapId: string): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin.from('job_property_maps')
    .select('id').eq('id', mapId).eq('job_id', jobId).is('deleted_at', null).maybeSingle();
  return (data as { id: string } | null) ?? null;
}

async function livePoints(mapId: string): Promise<Array<{ id: string; ordinal: number }>> {
  const { data } = await supabaseAdmin.from('job_map_points')
    .select('id, ordinal').eq('map_id', mapId).is('deleted_at', null).order('ordinal');
  return (data ?? []) as Array<{ id: string; ordinal: number }>;
}

export const POST = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as {
    map_id?: string; x?: number; y?: number; title?: string; notes?: string; point_type?: string; status?: string;
  };
  if (!body.map_id || !(await mapOfJob(params.id, body.map_id))) {
    return NextResponse.json({ error: 'That map is not on this job.' }, { status: 404 });
  }
  if (typeof body.x !== 'number' || typeof body.y !== 'number') {
    return NextResponse.json({ error: 'A point needs an x and a y.' }, { status: 400 });
  }

  const at = clampToImage({ x: body.x, y: body.y });
  const { error } = await supabaseAdmin.from('job_map_points').insert({
    map_id: body.map_id,
    ordinal: nextOrdinal(await livePoints(body.map_id)),
    title: (body.title ?? '').trim().slice(0, 160) || 'Point of interest',
    notes: (body.notes ?? '').trim() || null,
    x: at.x,
    y: at.y,
    point_type: isKnownPointType(body.point_type) ? body.point_type : DEFAULT_POINT_TYPE,
    status: POINT_STATUSES.some((s) => s.id === body.status) ? body.status : 'open',
    created_by: g.email,
    updated_by: g.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await loadPropertyMap(params.id, body.map_id));
}, { routeName: 'admin/jobs/property-map/points' });

export const PATCH = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as {
    map_id?: string; point_id?: string; title?: string; notes?: string | null;
    x?: number; y?: number; point_type?: string; status?: string; lat?: number | null; lng?: number | null;
  };
  if (!body.map_id || !body.point_id || !(await mapOfJob(params.id, body.map_id))) {
    return NextResponse.json({ error: 'That map is not on this job.' }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updated_by: g.email };
  if (body.title !== undefined) {
    const title = body.title.trim().slice(0, 160);
    if (!title) return NextResponse.json({ error: 'A point needs a title.' }, { status: 400 });
    patch.title = title;
  }
  // Notes clear to null rather than empty string — "remove data from already existing points of
  // interest" (owner, 2026-09-16) has to actually leave nothing behind.
  if (body.notes !== undefined) patch.notes = (body.notes ?? '').trim() || null;
  if (typeof body.x === 'number' && typeof body.y === 'number') {
    const at = clampToImage({ x: body.x, y: body.y });
    patch.x = at.x;
    patch.y = at.y;
  }
  if (body.point_type !== undefined) {
    if (!isKnownPointType(body.point_type)) return NextResponse.json({ error: 'Unknown point type.' }, { status: 400 });
    patch.point_type = body.point_type;
  }
  if (body.status !== undefined) {
    if (!POINT_STATUSES.some((s) => s.id === body.status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
    patch.status = body.status;
  }
  if (body.lat !== undefined) patch.lat = body.lat;
  if (body.lng !== undefined) patch.lng = body.lng;

  const { error } = await supabaseAdmin.from('job_map_points')
    .update(patch).eq('id', body.point_id).eq('map_id', body.map_id).is('deleted_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await loadPropertyMap(params.id, body.map_id));
}, { routeName: 'admin/jobs/property-map/points' });

export const DELETE = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const { searchParams } = new URL(req.url);
  const mapId = searchParams.get('map_id') ?? '';
  const pointId = searchParams.get('point_id') ?? '';
  if (!mapId || !pointId || !(await mapOfJob(params.id, mapId))) {
    return NextResponse.json({ error: 'That map is not on this job.' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('job_map_points')
    .update({ deleted_at: new Date().toISOString(), updated_by: g.email })
    .eq('id', pointId).eq('map_id', mapId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Close the gap so the numbers stay 1..n. `renumber` returns only the rows that actually move,
  // so deleting the last point writes nothing at all.
  //
  // Two steps, because the unique index on (map_id, ordinal) refuses an intermediate collision:
  // everything moves to a negative parking number first, then down to its final one.
  const moves = renumber(await livePoints(mapId));
  for (const m of moves) {
    await supabaseAdmin.from('job_map_points').update({ ordinal: -m.ordinal }).eq('id', m.id);
  }
  for (const m of moves) {
    await supabaseAdmin.from('job_map_points').update({ ordinal: m.ordinal }).eq('id', m.id);
  }
  return NextResponse.json(await loadPropertyMap(params.id, mapId));
}, { routeName: 'admin/jobs/property-map/points' });
