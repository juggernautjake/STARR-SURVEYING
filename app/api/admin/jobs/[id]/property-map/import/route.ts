// app/api/admin/jobs/[id]/property-map/import/route.ts — a point file becomes a layer.
//
// Owner, 2026-09-20: "we can upload point files/csv files into the interactive map and create a
// layer that shows all of the points according to their gps lat/long positions."
//
// ── TWO VERBS, AND THE FIRST ONE WRITES NOTHING ─────────────────────────────────────────────────
//
// PUT previews: parse, project, and report what WOULD happen. POST commits.
//
// That split is the whole safety of this route. A point file is northing/easting in State Plane
// feet, and the zone is not in the file — so the import has to ask, and an answer that is wrong
// produces 247 points that look completely ordinary and are in the wrong county. Nothing about
// that throws. The preview is what puts the projected position in front of somebody BEFORE the
// rows exist, which is the only moment the mistake is cheap.
//
// `lib/geo/state-plane.ts` has the full argument, including why EPSG:2277 was once described as
// two different zones in two different modules.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadPropertyMap } from '@/lib/jobs/property-map-server';
import { checkLayerName, nextOrdinal } from '@/lib/jobs/property-map';
import {
  parsePointFile, looksLikeDegrees, delimiterName, MAX_POINTS,
  type ColumnMap, type RawPoint,
} from '@/lib/jobs/point-file';
import {
  gridToLatLng, looksLikeTexas, plausibleZones, TEXAS_STATE_PLANE_ZONES,
  type TexasStatePlaneZone, type LatLng,
} from '@/lib/geo/state-plane';

interface Ctx { params: Promise<{ id: string }> }

/** A point file is text. 8MB is roughly 150,000 P,N,E,Z,D lines — far past the point cap. */
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

async function gate() {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { email: session.user.email, error: null as null };
}

async function mapOfJob(jobId: string, mapId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_property_maps').select('id')
    .eq('id', mapId).eq('job_id', jobId).is('deleted_at', null).maybeSingle();
  return Boolean(data);
}

interface ImportBody {
  map_id?: string;
  text?: string;
  /** Omitted for a lat/long file; required for a grid one. */
  zone?: string;
  columns?: ColumnMap;
  delimiter?: string;
  layer_name?: string;
  /** Add to an existing sheet instead of creating one. */
  layer_id?: string | null;
}

interface Placed {
  name: string;
  description: string;
  at: LatLng;
  elevation: number | null;
  line: number;
}

/**
 * Parse and project, without touching the database.
 *
 * Returns the placed points, everything that could not be placed and why, and — when the file is a
 * grid file with no zone chosen — which zones would put it inside Texas, so the dialog can hint
 * without deciding.
 */
function planImport(body: ImportBody) {
  const text = String(body.text ?? '');
  const parsed = parsePointFile(text, {
    columns: body.columns,
    delimiter: body.delimiter,
    maxPoints: MAX_POINTS,
  });

  const degrees = looksLikeDegrees(parsed.points);
  const zone = TEXAS_STATE_PLANE_ZONES.find((z) => z.key === body.zone) ?? null;

  const placed: Placed[] = [];
  const outside: Array<{ name: string; line: number; at: LatLng }> = [];
  const unplaceable: Array<{ name: string; line: number; why: string }> = [];

  const place = (p: RawPoint): LatLng | null => {
    if (degrees) {
      // A GIS export, already in degrees. `looksLikeDegrees` requires EVERY point to be in range,
      // so this is not a per-row guess — and northing/easting map to lat/lng in that order.
      const at = { lat: p.northing, lng: p.easting };
      return Number.isFinite(at.lat) && Number.isFinite(at.lng) ? at : null;
    }
    if (!zone) return null;
    return gridToLatLng({ northing: p.northing, easting: p.easting }, zone.key);
  };

  for (const p of parsed.points) {
    const at = place(p);
    if (!at) {
      unplaceable.push({ name: p.name, line: p.line, why: degrees ? 'not a usable coordinate' : 'no zone chosen' });
      continue;
    }
    // A point outside Texas is still IMPORTED — it is reported loudly instead. The alternative is
    // dropping somebody's genuine Oklahoma corner on the strength of a bounding box, and the box
    // exists to catch a wrong zone, not to police where this firm is allowed to work.
    if (!looksLikeTexas(at)) outside.push({ name: p.name, line: p.line, at });
    placed.push({ name: p.name, description: p.description, at, elevation: p.elevation, line: p.line });
  }

  // Only worth computing when it is the open question.
  const hints: Array<{ key: TexasStatePlaneZone['key']; name: string; epsg: number }> =
    !degrees && !zone && parsed.points.length > 0
      ? plausibleZones({ northing: parsed.points[0]!.northing, easting: parsed.points[0]!.easting })
        .map((g) => ({ key: g.zone.key, name: g.zone.name, epsg: g.zone.epsg }))
      : [];

  return {
    parsed,
    degrees,
    zone,
    placed,
    outside,
    unplaceable,
    hints,
    summary: {
      read: parsed.totalLines,
      placed: placed.length,
      skipped: parsed.skipped.length,
      unplaceable: unplaceable.length,
      outsideTexas: outside.length,
      delimiter: delimiterName(parsed.delimiter),
      columnsFrom: parsed.columnsFrom,
      columns: parsed.columns,
      hadHeader: parsed.hadHeader,
      coordinates: degrees ? ('degrees' as const) : ('grid' as const),
    },
  };
}

/** PUT — say what would happen. Writes nothing. */
export const PUT = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;

  const body = (await req.json().catch(() => ({}))) as ImportBody;
  if (!body.map_id || !(await mapOfJob((await params).id, body.map_id))) {
    return NextResponse.json({ error: 'That map is not on this job.' }, { status: 404 });
  }
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ error: 'There is nothing in that file.' }, { status: 400 });
  }
  if (Buffer.byteLength(body.text, 'utf8') > MAX_TEXT_BYTES) {
    return NextResponse.json({ error: 'That file is too large to import.' }, { status: 413 });
  }

  const plan = planImport(body);

  return NextResponse.json({
    summary: plan.summary,
    hints: plan.hints,
    // Enough to draw a preview and to eyeball whether the projection landed where it should.
    sample: plan.placed.slice(0, 12).map((p) => ({ name: p.name, lat: p.at.lat, lng: p.at.lng, description: p.description })),
    skipped: plan.parsed.skipped.slice(0, 20),
    unplaceable: plan.unplaceable.slice(0, 20),
    outside: plan.outside.slice(0, 20),
    // First and last, for a "does this cover the property?" glance.
    bounds: plan.placed.length
      ? {
        north: Math.max(...plan.placed.map((p) => p.at.lat)),
        south: Math.min(...plan.placed.map((p) => p.at.lat)),
        east: Math.max(...plan.placed.map((p) => p.at.lng)),
        west: Math.min(...plan.placed.map((p) => p.at.lng)),
      }
      : null,
  });
}, { routeName: 'admin/jobs/property-map/import' });

/** POST — do it. */
export const POST = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const g = await gate();
  if (g.error) return g.error;

  const jobId = (await params).id;
  const body = (await req.json().catch(() => ({}))) as ImportBody;
  if (!body.map_id || !(await mapOfJob(jobId, body.map_id))) {
    return NextResponse.json({ error: 'That map is not on this job.' }, { status: 404 });
  }
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ error: 'There is nothing in that file.' }, { status: 400 });
  }
  if (Buffer.byteLength(body.text, 'utf8') > MAX_TEXT_BYTES) {
    return NextResponse.json({ error: 'That file is too large to import.' }, { status: 413 });
  }

  const plan = planImport(body);

  // The zone is REQUIRED for a grid file and there is no default. `DEFAULT_TEXAS_ZONE_KEY` exists
  // for labelling a drawing that did not say; using it here would silently place a whole file.
  if (!plan.degrees && !plan.zone) {
    return NextResponse.json({
      error: 'This file is in northing/easting, so it needs a coordinate zone before it can go on the map.',
      hints: plan.hints,
    }, { status: 400 });
  }
  if (plan.placed.length === 0) {
    return NextResponse.json({
      error: 'Nothing in that file could be placed on the map.',
      summary: plan.summary,
      skipped: plan.parsed.skipped.slice(0, 20),
    }, { status: 400 });
  }

  // ── THE SHEET ────────────────────────────────────────────────────────────────────────────────
  let layerId: string | null = null;

  if (body.layer_id) {
    const { data } = await supabaseAdmin
      .from('job_map_layers').select('id')
      .eq('id', body.layer_id).eq('map_id', body.map_id).is('deleted_at', null).maybeSingle();
    if (!data) return NextResponse.json({ error: 'That layer is not on this map.' }, { status: 400 });
    layerId = body.layer_id;
  } else {
    const wanted = checkLayerName(body.layer_name ?? 'Imported points');
    if (!wanted.ok) return NextResponse.json({ error: wanted.error }, { status: 400 });

    const { data: existing } = await supabaseAdmin
      .from('job_map_layers').select('ordinal')
      .eq('map_id', body.map_id).is('deleted_at', null);
    const ordinal = Math.max(0, ...((existing ?? []) as Array<{ ordinal: number }>).map((l) => l.ordinal)) + 1;

    const { data: made, error: layerErr } = await supabaseAdmin
      .from('job_map_layers')
      .insert({
        map_id: body.map_id,
        name: wanted.value,
        ordinal,
        is_visible: true,
        is_default: false,
        created_by: g.email,
        updated_by: g.email,
      })
      .select('id')
      .single();
    // A duplicate name is the likely failure, and the unique index is case-insensitive per map.
    if (layerErr) {
      return NextResponse.json({
        error: /duplicate|unique/i.test(layerErr.message)
          ? `This map already has a layer called “${wanted.value}”. Pick another name, or import onto that layer.`
          : layerErr.message,
      }, { status: 400 });
    }
    layerId = made.id as string;
  }

  // ── THE POINTS ───────────────────────────────────────────────────────────────────────────────
  //
  // One insert, not 247. Ordinals are assigned here from the map's current high-water mark rather
  // than per row, because `nextOrdinal` reads the table and doing that in a loop would be 247
  // round trips and a unique-violation race with anybody else placing a pin.
  const { data: liveRows } = await supabaseAdmin
    .from('job_map_points').select('ordinal')
    .eq('map_id', body.map_id).is('deleted_at', null);
  let ordinal = nextOrdinal((liveRows ?? []) as Array<{ ordinal: number }>);

  const rows = plan.placed.map((p) => ({
    map_id: body.map_id!,
    layer_id: layerId,
    ordinal: ordinal++,
    // The point NUMBER is the title — "1", "CP1", "104". That is what a surveyor calls it and what
    // the description refers to.
    title: p.name.slice(0, 160) || 'Point',
    notes: [p.description, p.elevation !== null ? `Elevation ${p.elevation}` : null]
      .filter(Boolean).join(' · ') || null,
    lat: p.at.lat,
    lng: p.at.lng,
    x: null,
    y: null,
    geometry: 'point',
    point_type: 'csv_point',
    status: 'open',
    created_by: g.email,
    updated_by: g.email,
  }));

  const { error: insErr } = await supabaseAdmin.from('job_map_points').insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  console.log(
    `[property-map/import] job ${jobId}: ${rows.length} point(s) onto layer ${layerId}` +
    ` (${plan.summary.coordinates}${plan.zone ? `, ${plan.zone.name}` : ''})` +
    (plan.summary.outsideTexas ? `; ${plan.summary.outsideTexas} outside Texas` : ''),
  );

  return NextResponse.json({
    imported: rows.length,
    layerId,
    summary: plan.summary,
    skipped: plan.parsed.skipped.slice(0, 20),
    outside: plan.outside.slice(0, 20),
    map: await loadPropertyMap(jobId, body.map_id),
  });
}, { routeName: 'admin/jobs/property-map/import' });
