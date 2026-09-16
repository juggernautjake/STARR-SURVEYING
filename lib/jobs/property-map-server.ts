// lib/jobs/property-map-server.ts — reading a whole property map in one round trip.
//
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
//
// ── THE ONE DECISION THIS FILE EXISTS FOR ───────────────────────────────────────────────────────
// Owner, 2026-09-16: "Please make sure that the rendering of images and videos and stuff related to
// each point is very easy to load quickly … make sure it is efficient and easy to use and that the
// loading doesn't take forever."
//
// The obvious build of this feature asks the server for a signed URL per photo, which on a map with
// sixty photos is sixty round trips the browser makes one at a time, each one a fresh auth check
// and a fresh storage call. That is how a page like this ends up taking twenty seconds, and it is
// not fixable later without changing the shape of everything above it.
//
// So: ONE request returns the map, its points, every attachment, and a signed URL for each of them,
// signed in bulk per bucket. The browser makes one call and has everything it needs to render the
// map, the list, and every thumbnail; only the full-size media of whatever is opened is fetched
// afterwards, and it is already signed when that happens.
//
// Two hours of URL life, not two minutes: a video that is scrubbed twenty minutes into a review
// still has to answer a range request, and a link that expires mid-playback looks like a broken
// file rather than an expired token.
import { supabaseAdmin } from '@/lib/supabase';
import { bucketOf, displayName, mimeOf, sizeOf, type JobFileRow } from './file-storage';
import {
  mediaKindFor, sortMedia, sortPoints, isKnownPointType, pointStatus, DEFAULT_POINT_TYPE, clampToImage,
  type MapPoint, type PointMedia, type PropertyMap, type Georeference, type RelativePoint,
} from './property-map';
import { isKnownGeometry, DEFAULT_GEOMETRY } from './property-map-shapes';

/** jsonb is whatever was written into it. A shape whose vertices are unreadable degrades to its
 *  anchor — a labelled dot where the path started — rather than throwing the whole map away. */
function readVertices(raw: unknown): RelativePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: RelativePoint[] = [];
  for (const v of raw) {
    const p = v as { x?: unknown; y?: unknown };
    if (typeof p?.x === 'number' && typeof p?.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      out.push(clampToImage({ x: p.x, y: p.y }));
    }
  }
  return out;
}

/** Long enough that a review session never trips over an expiry, short enough that a leaked URL is
 *  not a permanent one. */
export const MEDIA_URL_SECONDS = 60 * 60 * 2;

interface MapRow {
  id: string; job_id: string; title: string; file_id: string | null;
  image_width: number | null; image_height: number | null; georeference: Georeference | null;
  created_by: string | null; created_at: string; updated_at: string;
}
interface PointRow {
  id: string; map_id: string; ordinal: number; title: string; notes: string | null;
  x: number; y: number; point_type: string; status: string; lat: number | null; lng: number | null;
  created_by: string | null; created_at: string; updated_at: string;
  // seeds/642: how the point is drawn, and what each shape needs.
  geometry: string | null; vertices: unknown; bearing_deg: number | null;
  fov_deg: number | null; fov_radius: number | null;
}
interface MediaRow {
  id: string; point_id: string; job_file_id: string; kind: string;
  thumb_path: string | null; thumb_bucket: string | null; caption: string | null; ordinal: number;
}

export interface LoadedMap {
  map: PropertyMap;
  points: MapPoint[];
  /** The aerial itself, signed and ready for an <img>. */
  imageUrl: string | null;
}

function toMap(r: MapRow): PropertyMap {
  return {
    id: r.id, jobId: r.job_id, title: r.title, fileId: r.file_id,
    imageWidth: r.image_width, imageHeight: r.image_height, georeference: r.georeference,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** Sign many objects in as few calls as the storage API allows: one per bucket, not one per file. */
async function signAll(paths: Array<{ bucket: string; path: string }>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byBucket = new Map<string, string[]>();
  for (const { bucket, path } of paths) {
    if (!bucket || !path) continue;
    const list = byBucket.get(bucket) ?? [];
    if (!list.includes(path)) list.push(path);
    byBucket.set(bucket, list);
  }
  await Promise.all([...byBucket.entries()].map(async ([bucket, list]) => {
    try {
      const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrls(list, MEDIA_URL_SECONDS);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (row.signedUrl && row.path) out.set(`${bucket}:${row.path}`, row.signedUrl);
      }
    } catch (err) {
      // A bucket that will not sign is a bucket whose media renders as a placeholder — never a
      // reason for the map itself to fail to load.
      console.error(`[property-map] could not sign ${list.length} object(s) in ${bucket}:`, err);
    }
  }));
  return out;
}

/** Everything the viewer needs, in one call. Returns null when the job has no map yet. */
export async function loadPropertyMap(jobId: string, mapId?: string | null): Promise<LoadedMap | null> {
  let q = supabaseAdmin.from('job_property_maps').select('*').eq('job_id', jobId).is('deleted_at', null);
  q = mapId ? q.eq('id', mapId) : q.order('created_at', { ascending: true });
  const { data: maps, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  const mapRow = (maps ?? [])[0] as MapRow | undefined;
  if (!mapRow) return null;

  const [{ data: pointRows }, { data: fileRow }] = await Promise.all([
    supabaseAdmin.from('job_map_points').select('*').eq('map_id', mapRow.id).is('deleted_at', null).order('ordinal'),
    mapRow.file_id
      ? supabaseAdmin.from('job_files').select('*').eq('id', mapRow.file_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const points = (pointRows ?? []) as PointRow[];

  const { data: mediaRows } = points.length
    ? await supabaseAdmin.from('job_map_point_media').select('*').in('point_id', points.map((p) => p.id)).is('deleted_at', null).order('ordinal')
    : { data: [] as MediaRow[] };
  const media = (mediaRows ?? []) as MediaRow[];

  // One more query for the files behind the attachments, then one signing pass for the lot.
  const fileIds = [...new Set(media.map((m) => m.job_file_id))];
  const { data: files } = fileIds.length
    ? await supabaseAdmin.from('job_files').select('*').in('id', fileIds)
    : { data: [] as JobFileRow[] };
  const fileById = new Map((((files ?? []) as JobFileRow[]).map((f) => [String(f.id), f])));

  const toSign: Array<{ bucket: string; path: string }> = [];
  const aerial = fileRow as JobFileRow | null;
  if (aerial?.storage_path) toSign.push({ bucket: bucketOf(aerial), path: String(aerial.storage_path) });
  for (const m of media) {
    const f = fileById.get(m.job_file_id);
    if (f?.storage_path) toSign.push({ bucket: bucketOf(f), path: String(f.storage_path) });
    if (m.thumb_path && m.thumb_bucket) toSign.push({ bucket: m.thumb_bucket, path: m.thumb_path });
  }
  const signed = await signAll(toSign);
  const urlFor = (bucket: string | null | undefined, path: string | null | undefined) =>
    (bucket && path ? signed.get(`${bucket}:${path}`) ?? null : null);

  const mediaByPoint = new Map<string, PointMedia[]>();
  for (const m of media) {
    const f = fileById.get(m.job_file_id);
    const kind = (['image', 'video', 'audio', 'document'] as const).includes(m.kind as never)
      ? (m.kind as PointMedia['kind'])
      : mediaKindFor(f ? mimeOf(f) : null, f ? displayName(f) : null);
    const full = f?.storage_path ? urlFor(bucketOf(f), String(f.storage_path)) : null;
    const entry: PointMedia = {
      id: m.id,
      pointId: m.point_id,
      jobFileId: m.job_file_id,
      kind,
      name: f ? displayName(f) : 'Attachment',
      caption: m.caption,
      ordinal: m.ordinal,
      url: full,
      // An image with no generated thumbnail falls back to itself, so a missing preview is a slower
      // tile rather than an empty one.
      thumbUrl: urlFor(m.thumb_bucket, m.thumb_path) ?? (kind === 'image' ? full : null),
      sizeBytes: f ? sizeOf(f) : null,
      mimeType: f ? mimeOf(f) : null,
    };
    mediaByPoint.set(m.point_id, [...(mediaByPoint.get(m.point_id) ?? []), entry]);
  }

  return {
    map: toMap(mapRow),
    imageUrl: aerial?.storage_path ? urlFor(bucketOf(aerial), String(aerial.storage_path)) : null,
    points: sortPoints(points.map((p) => ({
      id: p.id,
      mapId: p.map_id,
      ordinal: p.ordinal,
      title: p.title,
      notes: p.notes,
      x: p.x,
      y: p.y,
      pointType: isKnownPointType(p.point_type) ? p.point_type : DEFAULT_POINT_TYPE,
      status: pointStatus(p.status),
      geometry: isKnownGeometry(p.geometry) ? p.geometry : DEFAULT_GEOMETRY,
      vertices: readVertices(p.vertices),
      bearingDeg: typeof p.bearing_deg === 'number' ? p.bearing_deg : null,
      fovDeg: typeof p.fov_deg === 'number' ? p.fov_deg : null,
      fovRadius: typeof p.fov_radius === 'number' ? p.fov_radius : null,
      lat: p.lat,
      lng: p.lng,
      media: sortMedia(mediaByPoint.get(p.id) ?? []),
      createdBy: p.created_by,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }))),
  };
}

/** Does this job have a map yet, and how much is on it? For the button on the job page, which must
 *  not pay for the whole map to decide whether to say "Create" or "View". */
export async function propertyMapSummary(jobId: string): Promise<{ exists: boolean; mapId: string | null; title: string | null; points: number }> {
  const { data } = await supabaseAdmin
    .from('job_property_maps').select('id, title').eq('job_id', jobId).is('deleted_at', null)
    .order('created_at', { ascending: true }).limit(1);
  const row = (data ?? [])[0] as { id: string; title: string } | undefined;
  if (!row) return { exists: false, mapId: null, title: null, points: 0 };
  const { count } = await supabaseAdmin
    .from('job_map_points').select('id', { count: 'exact', head: true }).eq('map_id', row.id).is('deleted_at', null);
  return { exists: true, mapId: row.id, title: row.title, points: count ?? 0 };
}
