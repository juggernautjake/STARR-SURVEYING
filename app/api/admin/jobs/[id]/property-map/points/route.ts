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
import { clampToImage, isKnownPointType, nextOrdinal, renumber, DEFAULT_POINT_TYPE, POINT_STATUSES, type RelativePoint } from '@/lib/jobs/property-map';
import { isLatLng, roundLatLng } from '@/lib/jobs/map-world';
import { clampFovFeet, FOV_DEFAULT_FEET } from '@/lib/jobs/map-shapes-world';
import {
  isKnownGeometry, DEFAULT_GEOMETRY, clampBearing, clampFovDeg, clampFovRadius,
  FOV_DEFAULT_DEG, FOV_DEFAULT_RADIUS, type GeometryId,
} from '@/lib/jobs/property-map-shapes';

/** The bends of a path or an area, as the browser drew them. Anything that is not a pair of finite
 *  numbers is dropped rather than stored: a vertex the renderer cannot draw is a gap in a line
 *  somebody will later mistake for a property feature. Capped, because a drag that fires on every
 *  mouse move can otherwise write ten thousand of them. */
function cleanVertices(raw: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ lat: number; lng: number }> = [];
  for (const v of raw.slice(0, 500)) {
    // Real coordinates since seeds/647. Anything that is not a place is dropped rather than stored:
    // a vertex the renderer cannot draw is a gap in a line somebody will later mistake for a
    // property feature. Capped, because a drag that fires on every mouse move can otherwise write
    // ten thousand of them.
    if (isLatLng(v)) out.push(roundLatLng(v as { lat: number; lng: number }));
  }
  return out;
}

/** The three numbers that make a camera cone, defaulted the way a phone camera actually behaves so
 *  a cone placed without touching a slider already looks like the photograph it describes. */
function fovColumns(geometry: GeometryId, body: { bearing_deg?: unknown; fov_deg?: unknown; fov_radius?: unknown }) {
  if (geometry !== 'fov') return { bearing_deg: null, fov_deg: null, fov_radius: null };
  return {
    bearing_deg: clampBearing(typeof body.bearing_deg === 'number' ? body.bearing_deg : 0),
    fov_deg: clampFovDeg(typeof body.fov_deg === 'number' ? body.fov_deg : FOV_DEFAULT_DEG),
    // FEET since seeds/647, not a fraction of a photograph — see lib/jobs/map-shapes-world.ts.
    fov_radius: clampFovFeet(typeof body.fov_radius === 'number' ? body.fov_radius : FOV_DEFAULT_FEET),
  };
}

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

/**
 * A layer the caller may put a point on: one of THIS map's, or null for "the default sheet".
 *
 * Checked rather than trusted for the same reason `mapOfJob` exists — a layer_id in the body is
 * otherwise an open door to filing this job's points under another job's sheet, where the person
 * who owns that map would find points they cannot explain.
 */
async function layerOfMap(mapId: string, layerId: unknown): Promise<{ ok: true; value: string | null } | { ok: false }> {
  if (layerId === null || layerId === undefined) return { ok: true, value: null };
  if (typeof layerId !== 'string' || !layerId) return { ok: false };
  const { data } = await supabaseAdmin.from('job_map_layers')
    .select('id').eq('id', layerId).eq('map_id', mapId).is('deleted_at', null).maybeSingle();
  return data ? { ok: true, value: layerId } : { ok: false };
}

export const POST = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as {
    map_id?: string; x?: number; y?: number; title?: string; notes?: string; point_type?: string; status?: string;
    geometry?: string; vertices?: unknown; bearing_deg?: number; fov_deg?: number; fov_radius?: number;
    layer_id?: string | null;
    /** Where on the earth. The position of record since seeds/647. */
    lat?: number; lng?: number;
  };
  if (!body.map_id || !(await mapOfJob(params.id, body.map_id))) {
    return NextResponse.json({ error: 'That map is not on this job.' }, { status: 404 });
  }
  // ── A POINT IS A PLACE ON THE EARTH (seeds/647) ─────────────────────────────────────────────
  // It used to be a fraction of an uploaded image. Both are accepted while anything might still
  // send the old shape, but lat/lng is what the map draws from and what makes a point findable by
  // address, comparable across jobs, and measurable in feet.
  const at = typeof body.x === 'number' && typeof body.y === 'number'
    ? clampToImage({ x: body.x, y: body.y })
    : null;
  const here = { lat: Number(body.lat), lng: Number(body.lng) };
  if (!isLatLng(here) && !at) {
    return NextResponse.json({ error: 'A point needs a latitude and a longitude.' }, { status: 400 });
  }
  const placed = isLatLng(here) ? roundLatLng(here) : null;
  const geometry: GeometryId = isKnownGeometry(body.geometry) ? body.geometry : DEFAULT_GEOMETRY;
  const vertices = geometry === 'path' || geometry === 'area' ? cleanVertices(body.vertices) : [];
  // Which sheet it lands on. Null is fine and means the default one — `loadPropertyMap` resolves it.
  const layer = await layerOfMap(body.map_id, body.layer_id);
  if (!layer.ok) return NextResponse.json({ error: 'That layer is not on this map.' }, { status: 400 });
  const { error } = await supabaseAdmin.from('job_map_points').insert({
    map_id: body.map_id,
    layer_id: layer.value,
    ordinal: nextOrdinal(await livePoints(body.map_id)),
    title: (body.title ?? '').trim().slice(0, 160) || 'Point of interest',
    notes: (body.notes ?? '').trim() || null,
    x: at?.x ?? null,
    y: at?.y ?? null,
    lat: placed?.lat ?? null,
    lng: placed?.lng ?? null,
    geometry,
    vertices: vertices.length ? vertices : null,
    ...fovColumns(geometry, body),
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
    geometry?: string; vertices?: unknown; bearing_deg?: number; fov_deg?: number; fov_radius?: number;
    /** Moving the point to another sheet. Null means the default one. */
    layer_id?: string | null;
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
  // Dragging a pin on the world map. Validated rather than passed through: the database now refuses
  // 0,0 (seeds/647) and a 500 from a CHECK constraint is a worse answer than a sentence.
  if (body.lat !== undefined || body.lng !== undefined) {
    const here = { lat: Number(body.lat), lng: Number(body.lng) };
    if (body.lat === null && body.lng === null) {
      patch.lat = null;
      patch.lng = null;
    } else if (isLatLng(here)) {
      const r = roundLatLng(here);
      patch.lat = r.lat;
      patch.lng = r.lng;
    } else {
      return NextResponse.json({ error: 'That is not a place on the earth.' }, { status: 400 });
    }
  }

  // Moving a point between sheets. `'layer_id' in body` rather than a truthiness check, because null
  // is meaningful — it is "put this back on the default layer".
  if ('layer_id' in body) {
    const layer = await layerOfMap(body.map_id, body.layer_id);
    if (!layer.ok) return NextResponse.json({ error: 'That layer is not on this map.' }, { status: 400 });
    patch.layer_id = layer.value;
  }

  // ── CHANGING WHAT SHAPE A POINT IS ──────────────────────────────────────────────────────────
  // Switching a cone back to a plain dot has to clear the cone, or the row keeps a bearing nothing
  // draws and the next renderer that learns about bearings shows a ghost. Same for the vertices of
  // a path somebody turned into a point.
  if (body.geometry !== undefined) {
    if (!isKnownGeometry(body.geometry)) return NextResponse.json({ error: 'Unknown shape.' }, { status: 400 });
    patch.geometry = body.geometry;
    Object.assign(patch, fovColumns(body.geometry, body));
    if (body.geometry !== 'path' && body.geometry !== 'area') patch.vertices = null;
  }
  if (body.vertices !== undefined) {
    const cleaned = cleanVertices(body.vertices);
    patch.vertices = cleaned.length ? cleaned : null;
  }
  // Aiming or widening a cone that is already a cone, without restating its geometry.
  if (body.geometry === undefined) {
    if (body.bearing_deg !== undefined) patch.bearing_deg = clampBearing(body.bearing_deg);
    if (body.fov_deg !== undefined) patch.fov_deg = clampFovDeg(body.fov_deg);
    if (body.fov_radius !== undefined) patch.fov_radius = clampFovFeet(body.fov_radius);
  }

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
