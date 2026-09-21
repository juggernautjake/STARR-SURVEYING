// lib/field-ingest/to-map.ts — collector points becoming pins on the map.
//
// Owner, 2026-09-20: "could we have it where the interactive map point layer gets automatically
// updated with the newly streamed points? … That way all of the points and photos and videos can
// get uploaded in real time."
//
// This is the last missing link in that chain. Everything upstream has existed since August:
// `lib/field-ingest/ingest.ts` parses LandXML, GSI, RW5, JobXML and CSV; `instrument_points` stores
// them with an idempotent content hash and two clocks; `LiveFieldFeed` shows them arriving. And
// nothing ever read them onto the map.
//
// ── THE THREE THINGS THAT MAKE THIS SAFE ────────────────────────────────────────────────────────
//
// 1. **The zone is declared, never guessed.** `instrument_points` records northing, easting and a
//    free-text `unit`, and no coordinate reference system at all. Projected in the wrong Texas
//    zone, job 26146's corners land in Ontario — 1,553 miles out, with every number still looking
//    ordinary. So `job_property_maps.stateplane_zone` must be set by a person first, and this
//    refuses rather than defaulting. See seeds/654.
//
// 2. **A re-sync updates, it does not stack.** Trimble Connect's Object Sync re-reports a file
//    whenever its version changes, and the poller deliberately overlaps by two minutes, so the same
//    point WILL arrive repeatedly. `from_instrument_point_id` is the stable identity that turns the
//    second arrival into an update. Without it an afternoon of syncing produces forty pins on one
//    spot, which does not look like a bug — it looks like one pin.
//
// 3. **A surveyor's edit is not overwritten.** If somebody has renamed a pin or moved it, a later
//    sync of the same collector point must not undo that. Only the POSITION is refreshed, and only
//    when the collector's own coordinates actually changed.
//
// ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────────────
//
// It does not convert units. `instrument_points.unit` is stored verbatim as the ingest found it and
// is frequently 'unknown'. A file in metres processed as US survey feet is out by a factor of 3.28,
// which is obvious; a file in international feet processed as US survey feet is out by 2ppm, which
// is not, and neither is guessable from the numbers. Anything not recognisably feet is refused and
// named, because a silent unit assumption is the one error that survives every review.

import { supabaseAdmin } from '@/lib/supabase';
import { gridToLatLng, looksLikeTexas, type TexasStatePlaneZone } from '@/lib/geo/state-plane';
import { nextOrdinal } from '@/lib/jobs/property-map';

/** What a collector point looks like once it is in the database. */
export interface InstrumentPointRow {
  id: string;
  job_id: string | null;
  point_name: string;
  code: string | null;
  description: string | null;
  northing: number;
  easting: number;
  elevation: number | null;
  unit: string | null;
  measured_at: string | null;
  received_at: string;
}

/** The sheet collector points land on. Named, not the default layer, so it can be hidden in one click. */
export const COLLECTOR_LAYER_NAME = 'Collector points';

/**
 * Units we are prepared to treat as US survey feet.
 *
 * 'unknown' is ACCEPTED, and that deserves defending. Every Texas survey this firm does is in US
 * survey feet, most collector exports do not state a unit at all, and refusing them would make the
 * feature useless for the common case. What is refused is a unit that says something DIFFERENT —
 * metres especially — because that is the file where the assumption is provably wrong.
 */
const FOOT_UNITS = new Set(['', 'unknown', 'ft', 'feet', 'foot', 'usft', 'usfeet', 'us-ft', 'ussurveyfoot', 'ifeet', 'ift']);

const NON_FOOT = new Set(['m', 'metre', 'meter', 'metres', 'meters', 'mm', 'cm', 'km']);

export type UnitVerdict = { ok: true } | { ok: false; why: string };

export function checkUnit(raw: string | null | undefined): UnitVerdict {
  const u = (raw ?? '').trim().toLowerCase().replace(new RegExp('[\\s_]', 'g'), '');
  if (FOOT_UNITS.has(u)) return { ok: true };
  if (NON_FOOT.has(u)) {
    return { ok: false, why: `the file says its units are "${raw}" — this map projects US survey feet, and nothing here converts between them` };
  }
  return { ok: false, why: `unrecognised units "${raw}"` };
}

export interface BridgeResult {
  /** Pins created. */
  added: number;
  /** Pins whose position was refreshed because the collector's coordinates changed. */
  moved: number;
  /** Already on the map and unchanged. */
  unchanged: number;
  /** Named, never silently dropped. */
  skipped: Array<{ pointName: string; why: string }>;
  layerId: string | null;
  /** Set when the whole job could not be processed — a missing zone, no map. */
  blocked: string | null;
}

const EMPTY = (blocked: string | null): BridgeResult =>
  ({ added: 0, moved: 0, unchanged: 0, skipped: [], layerId: null, blocked });

/** Two positions are the same place when they agree to about a millimetre. */
function samePlace(a: { lat: number; lng: number }, b: { lat: number | null; lng: number | null }): boolean {
  if (b.lat === null || b.lng === null) return false;
  return Math.abs(a.lat - b.lat) < 1e-8 && Math.abs(a.lng - b.lng) < 1e-8;
}

/** The pin's title and notes, from what the collector recorded. */
export function describePoint(p: InstrumentPointRow): { title: string; notes: string | null } {
  const title = (p.point_name ?? '').trim().slice(0, 160) || 'Point';
  const bits = [
    (p.description ?? '').trim() || null,
    (p.code ?? '').trim() ? `Code ${p.code!.trim()}` : null,
    p.elevation !== null && Number.isFinite(p.elevation) ? `Elevation ${p.elevation}` : null,
    // The device clock, when the file recorded one. seeds/522 is explicit that `measured_at` is
    // nullable because plenty of formats do not record it, and that stamping a point with its
    // upload time "looks like it was shot at 6pm from the office car park".
    p.measured_at ? `Shot ${new Date(p.measured_at).toISOString()}` : null,
  ].filter(Boolean);
  return { title, notes: bits.length ? bits.join(' · ') : null };
}

/**
 * Bring every collector point for a job onto its map.
 *
 * Idempotent: safe to call after every sync, and calling it twice in a row changes nothing the
 * second time.
 */
export async function bridgeJobToMap(jobId: string, actor = 'field-ingest'): Promise<BridgeResult> {
  // The map, and the zone it is in.
  const { data: mapRow } = await supabaseAdmin
    .from('job_property_maps')
    .select('id, stateplane_zone')
    .eq('job_id', jobId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!mapRow) return EMPTY('this job has no interactive map yet');

  const map = mapRow as { id: string; stateplane_zone: string | null };
  const zone = map.stateplane_zone as TexasStatePlaneZone['key'] | null;
  if (!zone) {
    return EMPTY(
      'this map has no coordinate zone set, so collector points cannot be placed. ' +
      'Set it on the map — a wrong zone puts every point hundreds of miles away with no error.',
    );
  }

  const { data: pointRows } = await supabaseAdmin
    .from('instrument_points')
    .select('id, job_id, point_name, code, description, northing, easting, elevation, unit, measured_at, received_at')
    .eq('job_id', jobId)
    .order('received_at', { ascending: true });

  const points = (pointRows ?? []) as InstrumentPointRow[];
  if (points.length === 0) return { ...EMPTY(null), layerId: null };

  // What is already across. Read before writing so a re-sync is an update rather than an insert
  // that trips the unique index.
  const { data: existingRows } = await supabaseAdmin
    .from('job_map_points')
    .select('id, from_instrument_point_id, lat, lng')
    .eq('map_id', map.id)
    .not('from_instrument_point_id', 'is', null)
    .is('deleted_at', null);

  const existing = new Map(
    ((existingRows ?? []) as Array<{ id: string; from_instrument_point_id: string; lat: number | null; lng: number | null }>)
      .map((r) => [r.from_instrument_point_id, r]),
  );

  const result: BridgeResult = { added: 0, moved: 0, unchanged: 0, skipped: [], layerId: null, blocked: null };

  // Project everything first, so a file that is entirely unusable does not leave an empty layer
  // behind as evidence of a sync that achieved nothing.
  const placed: Array<{ p: InstrumentPointRow; at: { lat: number; lng: number } }> = [];
  for (const p of points) {
    const unit = checkUnit(p.unit);
    if (!unit.ok) { result.skipped.push({ pointName: p.point_name, why: unit.why }); continue; }

    if (!Number.isFinite(p.northing) || !Number.isFinite(p.easting)) {
      result.skipped.push({ pointName: p.point_name, why: 'the northing or easting is not a number' });
      continue;
    }

    const at = gridToLatLng({ northing: p.northing, easting: p.easting }, zone);
    if (!at) { result.skipped.push({ pointName: p.point_name, why: 'could not be projected' }); continue; }

    // Reported, not refused. A point outside the box is far more likely a wrong ZONE than a
    // genuine out-of-state corner, and the person needs to see it on the map to recognise that.
    if (!looksLikeTexas(at)) {
      result.skipped.push({
        pointName: p.point_name,
        why: `projected to ${at.lat.toFixed(4)}, ${at.lng.toFixed(4)} — outside Texas, which usually means the map's zone is wrong`,
      });
      continue;
    }
    placed.push({ p, at });
  }

  if (placed.length === 0) return result;

  // ── THE SHEET ────────────────────────────────────────────────────────────────────────────────
  const { data: layerRow } = await supabaseAdmin
    .from('job_map_layers')
    .select('id')
    .eq('map_id', map.id)
    .ilike('name', COLLECTOR_LAYER_NAME)
    .is('deleted_at', null)
    .maybeSingle();

  let layerId = (layerRow as { id: string } | null)?.id ?? null;

  if (!layerId) {
    const { data: layers } = await supabaseAdmin
      .from('job_map_layers').select('ordinal').eq('map_id', map.id).is('deleted_at', null);
    const ordinal = Math.max(0, ...((layers ?? []) as Array<{ ordinal: number }>).map((l) => l.ordinal)) + 1;

    const { data: made, error } = await supabaseAdmin
      .from('job_map_layers')
      .insert({
        map_id: map.id,
        name: COLLECTOR_LAYER_NAME,
        ordinal,
        is_visible: true,
        is_default: false,
        created_by: actor,
        updated_by: actor,
      })
      .select('id')
      .single();

    // A concurrent sync may have created it between the read and the write. Losing that race is
    // fine; re-read and carry on rather than failing the whole bridge.
    if (error) {
      const { data: again } = await supabaseAdmin
        .from('job_map_layers').select('id')
        .eq('map_id', map.id).ilike('name', COLLECTOR_LAYER_NAME).is('deleted_at', null).maybeSingle();
      layerId = (again as { id: string } | null)?.id ?? null;
      if (!layerId) return { ...result, blocked: `could not create the “${COLLECTOR_LAYER_NAME}” layer: ${error.message}` };
    } else {
      layerId = made.id as string;
    }
  }
  result.layerId = layerId;

  // ── THE PINS ─────────────────────────────────────────────────────────────────────────────────
  const { data: liveRows } = await supabaseAdmin
    .from('job_map_points').select('ordinal').eq('map_id', map.id).is('deleted_at', null);
  let ordinal = nextOrdinal((liveRows ?? []) as Array<{ ordinal: number }>);

  const toInsert: Array<Record<string, unknown>> = [];

  for (const { p, at } of placed) {
    const already = existing.get(p.id);

    if (already) {
      if (samePlace(at, already)) { result.unchanged += 1; continue; }
      // Only the position. Title and notes are left alone because a surveyor may have corrected
      // them, and a later sync of the same shot must not undo that.
      const { error } = await supabaseAdmin
        .from('job_map_points')
        .update({ lat: at.lat, lng: at.lng, updated_by: actor, updated_at: new Date().toISOString() })
        .eq('id', already.id);
      if (error) result.skipped.push({ pointName: p.point_name, why: `could not be moved: ${error.message}` });
      else result.moved += 1;
      continue;
    }

    const { title, notes } = describePoint(p);
    toInsert.push({
      map_id: map.id,
      layer_id: layerId,
      ordinal: ordinal++,
      title,
      notes,
      lat: at.lat,
      lng: at.lng,
      x: null,
      y: null,
      geometry: 'point',
      point_type: 'csv_point',
      status: 'open',
      from_instrument_point_id: p.id,
      created_by: actor,
      updated_by: actor,
    });
  }

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from('job_map_points').insert(toInsert);
    if (error) return { ...result, blocked: `could not add ${toInsert.length} point(s): ${error.message}` };
    result.added = toInsert.length;
  }

  return result;
}

/** Every job with collector points that has a map — what the scheduled sweep walks. */
export async function jobsWithCollectorPoints(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('instrument_points')
    .select('job_id')
    .not('job_id', 'is', null)
    .limit(5000);
  return [...new Set(((data ?? []) as Array<{ job_id: string }>).map((r) => r.job_id))];
}
