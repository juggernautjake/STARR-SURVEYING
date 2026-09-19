// lib/jobs/map-world-server.ts — reading the points inside a viewport, across every job.
//
// Owner, 2026-09-18: "I was thinking it would be cool to be able to keep track of all of our points
// for each job on one big file … if we have stored points at that property with files and stuff
// assigned to them, then we will be able to see them show up."
//
// The per-job loader (property-map-server.ts) answers "everything about THIS map" and signs every
// attachment in the process. That is the right shape for a panel you are working in and the wrong
// shape entirely for a map of the whole county: signing six hundred photographs to draw six hundred
// dots is most of a second of storage calls for pictures nobody has asked to see.
//
// So this loader returns POSITIONS AND LABELS ONLY. A pin needs to know where it is, what colour it
// is, what it is called and which job it belongs to. The moment somebody clicks one, the existing
// per-job loader runs and returns that point's attachments, signed — one point, not six hundred.
import { supabaseAdmin } from '@/lib/supabase';
import {
  isKnownPointType, pointStatus, DEFAULT_POINT_TYPE,
  type PointTypeId, type PointStatus,
} from './property-map';
import { isLatLng, MAX_POINTS_PER_REQUEST, type Bounds } from './map-world';

/** One pin on the global map. Deliberately small — this is multiplied by six hundred. */
export interface WorldPoint {
  id: string;
  mapId: string;
  jobId: string;
  /** "26148" — what a person calls the job out loud. */
  jobNumber: string | null;
  jobName: string | null;
  ordinal: number;
  title: string;
  lat: number;
  lng: number;
  pointType: PointTypeId;
  status: PointStatus;
  layerId: string | null;
  /** Whether the layer it sits on is showing. Hidden layers are filtered server-side so the browser
   *  never receives, clusters and then discards points it was never going to draw. */
  geometry: string;
  /** How many files hang on it — enough for the pin to show a paperclip without fetching any. */
  mediaCount: number;
}

export interface WorldPointsResult {
  points: WorldPoint[];
  /** True when the viewport held more than a request may return, so the UI can say so. */
  capped: boolean;
}

interface Row {
  id: string; map_id: string; ordinal: number; title: string;
  lat: number; lng: number; point_type: string; status: string;
  layer_id: string | null; geometry: string | null;
}

/**
 * Every live, placed, visible point inside a viewport.
 *
 * Four queries rather than one join: PostgREST cannot express "and the layer it is on is visible"
 * across two tables without an inner-join filter that would also silently drop points whose layer is
 * null, which is most of them. Doing it in two steps is one extra round trip and cannot get that
 * wrong.
 */
export async function loadPointsInBounds(bounds: Bounds, limit = MAX_POINTS_PER_REQUEST): Promise<WorldPointsResult> {
  // One past the limit, so "there were more" is a fact rather than a guess.
  let q = supabaseAdmin
    .from('job_map_points')
    .select('id, map_id, ordinal, title, lat, lng, point_type, status, layer_id, geometry')
    .is('deleted_at', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .gte('lat', bounds.south)
    .lte('lat', bounds.north)
    .limit(limit + 1);

  // A viewport across the antimeridian is two ranges, not one. It will never happen here, but an
  // `.gte().lte()` on a wrapped box silently matches nothing, and "no points" is the one failure
  // mode that looks exactly like success.
  q = bounds.west <= bounds.east
    ? q.gte('lng', bounds.west).lte('lng', bounds.east)
    : q.or(`lng.gte.${bounds.west},lng.lte.${bounds.east}`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Row[]).filter((r) => isLatLng({ lat: r.lat, lng: r.lng }));
  const capped = rows.length > limit;
  const kept = capped ? rows.slice(0, limit) : rows;
  if (!kept.length) return { points: [], capped };

  const mapIds = [...new Set(kept.map((r) => r.map_id))];
  const layerIds = [...new Set(kept.map((r) => r.layer_id).filter(Boolean))] as string[];
  const pointIds = kept.map((r) => r.id);

  const [{ data: maps }, { data: layers }, { data: media }] = await Promise.all([
    supabaseAdmin.from('job_property_maps')
      .select('id, job_id, jobs!inner(job_number, name)').in('id', mapIds).is('deleted_at', null),
    layerIds.length
      ? supabaseAdmin.from('job_map_layers').select('id, is_visible').in('id', layerIds).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    supabaseAdmin.from('job_map_point_media').select('point_id').in('point_id', pointIds).is('deleted_at', null),
  ]);

  const mapById = new Map(((maps ?? []) as Array<{
    id: string; job_id: string; jobs?: { job_number?: string | null; name?: string | null };
  }>).map((m) => [m.id, m]));

  // Absent from the list means the layer was deleted, which reads as the default sheet — visible.
  const hidden = new Set(((layers ?? []) as Array<{ id: string; is_visible: boolean }>)
    .filter((l) => !l.is_visible).map((l) => l.id));

  const counts = new Map<string, number>();
  for (const m of (media ?? []) as Array<{ point_id: string }>) {
    counts.set(m.point_id, (counts.get(m.point_id) ?? 0) + 1);
  }

  const points: WorldPoint[] = [];
  for (const r of kept) {
    if (r.layer_id && hidden.has(r.layer_id)) continue;
    const map = mapById.get(r.map_id);
    // A point whose map is gone is a point with no job — not drawable, and not worth a placeholder.
    if (!map) continue;
    points.push({
      id: r.id,
      mapId: r.map_id,
      jobId: map.job_id,
      jobNumber: map.jobs?.job_number ?? null,
      jobName: map.jobs?.name ?? null,
      ordinal: r.ordinal,
      title: r.title,
      lat: r.lat,
      lng: r.lng,
      pointType: isKnownPointType(r.point_type) ? r.point_type : DEFAULT_POINT_TYPE,
      status: pointStatus(r.status),
      layerId: r.layer_id,
      geometry: r.geometry ?? 'point',
      mediaCount: counts.get(r.id) ?? 0,
    });
  }

  return { points, capped };
}

export interface JobPlace {
  jobId: string;
  jobNumber: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  lat: number | null;
  lng: number | null;
  mapId: string | null;
  points: number;
}

/**
 * Where a job is, and whether it has a map yet.
 *
 * This is what the job page's button and the map's own job picker both read. `jobs.latitude` is the
 * geocoded address (seeds/000 + the 2026-09-18 backfill); the map's own `center_lat` wins when it is
 * set, because that is where somebody actually left the view.
 */
export async function loadJobPlace(jobId: string): Promise<JobPlace | null> {
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('id, job_number, name, address, city, county, latitude, longitude')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return null;

  const j = job as {
    id: string; job_number: string | null; name: string | null;
    address: string | null; city: string | null; county: string | null;
    latitude: number | null; longitude: number | null;
  };

  const { data: map } = await supabaseAdmin
    .from('job_property_maps')
    .select('id, center_lat, center_lng')
    .eq('job_id', jobId).is('deleted_at', null)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  const m = map as { id: string; center_lat: number | null; center_lng: number | null } | null;

  let points = 0;
  if (m?.id) {
    const { count } = await supabaseAdmin
      .from('job_map_points')
      .select('id', { count: 'exact', head: true })
      .eq('map_id', m.id).is('deleted_at', null).not('lat', 'is', null);
    points = count ?? 0;
  }

  // The map's own centre first — it is where the work is, and a job's geocoded address can be the
  // mailing address rather than the parcel.
  const lat = m?.center_lat ?? (typeof j.latitude === 'number' ? j.latitude : Number(j.latitude) || null);
  const lng = m?.center_lng ?? (typeof j.longitude === 'number' ? j.longitude : Number(j.longitude) || null);

  return {
    jobId: j.id,
    jobNumber: j.job_number,
    name: j.name,
    address: j.address,
    city: j.city,
    county: j.county,
    lat: isLatLng({ lat: lat as number, lng: lng as number }) ? (lat as number) : null,
    lng: isLatLng({ lat: lat as number, lng: lng as number }) ? (lng as number) : null,
    mapId: m?.id ?? null,
    points,
  };
}

/** Every job that has somewhere to be — the map's job picker, and its "jobs near here" index. */
export async function loadPlacedJobs(limit = 500): Promise<JobPlace[]> {
  const { data } = await supabaseAdmin
    .from('jobs')
    .select('id, job_number, name, address, city, county, latitude, longitude')
    .not('latitude', 'is', null).not('longitude', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  const jobs = (data ?? []) as Array<{
    id: string; job_number: string | null; name: string | null;
    address: string | null; city: string | null; county: string | null;
    latitude: number | null; longitude: number | null;
  }>;
  if (!jobs.length) return [];

  const { data: maps } = await supabaseAdmin
    .from('job_property_maps').select('id, job_id').in('job_id', jobs.map((j) => j.id)).is('deleted_at', null);
  const mapByJob = new Map(((maps ?? []) as Array<{ id: string; job_id: string }>).map((m) => [m.job_id, m.id]));

  return jobs
    .map((j) => {
      const lat = Number(j.latitude);
      const lng = Number(j.longitude);
      return {
        jobId: j.id,
        jobNumber: j.job_number,
        name: j.name,
        address: j.address,
        city: j.city,
        county: j.county,
        lat: isLatLng({ lat, lng }) ? lat : null,
        lng: isLatLng({ lat, lng }) ? lng : null,
        mapId: mapByJob.get(j.id) ?? null,
        points: 0,
      };
    })
    .filter((j) => j.lat !== null);
}
