// app/api/admin/jobs/[id]/property-map/layers/route.ts — the sheets a map's points sit on.
//
// Owner, 2026-09-18: "I want it where we can create different layers for points … We can still put
// all of the points on one layer, but we can also create and name layers and have layer management
// and move points between layers if we so desire … We need to be able to name and rename layers too.
// We need to be able to hide and unhide the different layers too."
//
//   POST    make a sheet
//   PATCH   rename one, show or hide it, reorder it
//   DELETE  throw one away — its points move to the default sheet, they are NOT deleted
//
// Moving a POINT between sheets is a point edit and lives in ../points (PATCH `layer_id`), not here:
// a route that could move points would be two features wearing one name, and the points route is
// already where a point's ordinal and renumbering are looked after.
//
// Every response returns the WHOLE map again, freshly signed — the same contract as points and
// media, so the browser never merges a partial update into its own copy.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadPropertyMap } from '@/lib/jobs/property-map-server';
import { checkLayerName } from '@/lib/jobs/property-map';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email as string };
}

/** The map has to belong to this job — without it, a map_id in the body reaches every other job. */
async function mapOfJob(jobId: string, mapId: string): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin.from('job_property_maps')
    .select('id').eq('id', mapId).eq('job_id', jobId).is('deleted_at', null).maybeSingle();
  return (data as { id: string } | null) ?? null;
}

interface LayerRow { id: string; map_id: string; name: string; ordinal: number; is_visible: boolean; is_default: boolean }

async function layerOfMap(mapId: string, layerId: string): Promise<LayerRow | null> {
  const { data } = await supabaseAdmin.from('job_map_layers')
    .select('*').eq('id', layerId).eq('map_id', mapId).is('deleted_at', null).maybeSingle();
  return (data as LayerRow | null) ?? null;
}

/** Postgres' unique-violation code. `uq_job_map_layers_name` is case-insensitive on purpose, so this
 *  is the answer to "Utilities" when "utilities" already exists — a message, not a 500. */
const UNIQUE_VIOLATION = '23505';

export const POST = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as { map_id?: string; name?: string };
  if (!body.map_id || !(await mapOfJob(params.id, body.map_id))) {
    return NextResponse.json({ error: 'That map is not on this job.' }, { status: 404 });
  }

  const name = checkLayerName(body.name);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  // Onto the end of the panel. Read rather than counted so a sheet deleted earlier does not put the
  // new one back on top of a number something else already has.
  const { data: siblings } = await supabaseAdmin.from('job_map_layers')
    .select('ordinal').eq('map_id', body.map_id).is('deleted_at', null).order('ordinal', { ascending: false }).limit(1);
  const top = ((siblings ?? [])[0] as { ordinal: number } | undefined)?.ordinal ?? 0;

  const { error } = await supabaseAdmin.from('job_map_layers').insert({
    map_id: body.map_id,
    name: name.value,
    ordinal: top + 1,
    created_by: g.email,
    updated_by: g.email,
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: `This map already has a layer called “${name.value}”.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(await loadPropertyMap(params.id, body.map_id, g.email));
}, { routeName: 'admin/jobs/property-map/layers' });

export const PATCH = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as {
    map_id?: string; layer_id?: string; name?: string; is_visible?: boolean; ordinal?: number;
  };
  if (!body.map_id || !body.layer_id || !(await mapOfJob(params.id, body.map_id))) {
    return NextResponse.json({ error: 'That map is not on this job.' }, { status: 404 });
  }
  const layer = await layerOfMap(body.map_id, body.layer_id);
  if (!layer) return NextResponse.json({ error: 'That layer is not on this map.' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_by: g.email, updated_at: new Date().toISOString() };

  // The default sheet is renameable — that is why it is a real row rather than something synthetic.
  // Only deleting it is refused, below.
  if (body.name !== undefined) {
    const name = checkLayerName(body.name);
    if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
    patch.name = name.value;
  }
  if (typeof body.is_visible === 'boolean') patch.is_visible = body.is_visible;
  if (typeof body.ordinal === 'number' && Number.isFinite(body.ordinal)) {
    patch.ordinal = Math.max(1, Math.round(body.ordinal));
  }

  const { error } = await supabaseAdmin.from('job_map_layers')
    .update(patch).eq('id', body.layer_id).eq('map_id', body.map_id).is('deleted_at', null);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: 'This map already has a layer with that name.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(await loadPropertyMap(params.id, body.map_id, g.email));
}, { routeName: 'admin/jobs/property-map/layers' });

export const DELETE = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;
  const url = new URL(req.url);
  const mapId = url.searchParams.get('map_id');
  const layerId = url.searchParams.get('layer_id');
  if (!mapId || !layerId || !(await mapOfJob(params.id, mapId))) {
    return NextResponse.json({ error: 'That map is not on this job.' }, { status: 404 });
  }
  const layer = await layerOfMap(mapId, layerId);
  if (!layer) return NextResponse.json({ error: 'That layer is not on this map.' }, { status: 404 });

  // Every map needs somewhere for a point to land. Deleting the last sheet would leave new points
  // with nowhere to go and the panel with nothing to list.
  if (layer.is_default) {
    return NextResponse.json({ error: 'The default layer cannot be deleted — every point needs a layer to sit on. Rename it instead.' }, { status: 400 });
  }

  const { data: base } = await supabaseAdmin.from('job_map_layers')
    .select('id').eq('map_id', mapId).eq('is_default', true).is('deleted_at', null).maybeSingle();

  // ── THE POINTS SURVIVE, EXPLICITLY ──────────────────────────────────────────────────────────
  // The column is ON DELETE SET NULL and NULL already reads as the default sheet, so the points
  // would survive anyway. They are moved by hand first because a soft delete does not fire that
  // trigger at all — the row stays, the reference stays, and the points would sit on a sheet that is
  // no longer in any list. Whichever way the layer goes, the work on it stays on the map.
  await supabaseAdmin.from('job_map_points')
    .update({ layer_id: base?.id ?? null, updated_by: g.email })
    .eq('map_id', mapId).eq('layer_id', layerId).is('deleted_at', null);

  const { error } = await supabaseAdmin.from('job_map_layers')
    .update({ deleted_at: new Date().toISOString(), updated_by: g.email })
    .eq('id', layerId).eq('map_id', mapId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(await loadPropertyMap(params.id, mapId, g.email));
}, { routeName: 'admin/jobs/property-map/layers' });
