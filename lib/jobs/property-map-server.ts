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
import { initialThumbState, type ThumbState } from './file-thumbnails';
import {
  mediaKindFor, sortMedia, sortPoints, isKnownPointType, pointStatus, DEFAULT_POINT_TYPE, clampToImage,
  type MapPoint, type PointMedia, type PropertyMap, type Georeference, type RelativePoint, type MediaKind,
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

// ── THE FILE PANEL BESIDE THE MAP ───────────────────────────────────────────────────────────────
//
// Owner, 2026-09-16: "we need all of the job files, photos, videos, audio files, etc to be available
// to us to see in a panel next to the map while we are building the interactive map, so that we can
// assign them to points of interest if we want to … once a file has been assigned to a point, it
// cannot be assigned to another point. It will still be in the … panel, but it will be a bit
// transparent and marked as already assigned."
//
// The panel is a to-do list: what have I not placed yet? That only works if "assigned" is a property
// of the FILE, so this returns every file of the job with its assignment attached, already signed —
// one request for the lot, the same reason the map itself is one request. A hundred photographs is a
// hundred serial signing round trips otherwise, and the panel is the thing somebody sits in front of
// for an hour.
export interface LibraryFile {
  id: string;
  name: string;
  kind: MediaKind;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  /** Which standard folder it lives in — the panel groups by this. */
  section: string | null;
  url: string | null;
  thumbUrl: string | null;
  /** Whether a generated preview exists, is still to be made, or never will be (seeds/644). The
   *  panel uses this to decide what to queue — a browser makes the ones marked `pending`. */
  thumbState: ThumbState;
  /** Null when the file is free. Otherwise the point that has it, so the panel can say "on 4". */
  assignedTo: { pointId: string; mediaId: string; ordinal: number; title: string } | null;
}

/** Every file on the job, with thumbnails and assignment state, for the panel beside the map. */
export async function loadMapLibrary(jobId: string, mapId: string | null): Promise<LibraryFile[]> {
  const { data: fileRows, error } = await supabaseAdmin
    .from('job_files').select('*').eq('job_id', jobId).eq('is_deleted', false)
    .order('uploaded_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const files = (fileRows ?? []) as JobFileRow[];
  if (files.length === 0) return [];

  // Who has what. Scoped to this map's points when there is a map, so a second map on the same job
  // does not report a file as free when the first map is using it — the constraint is job-wide.
  const { data: pointRows } = mapId
    ? await supabaseAdmin.from('job_map_points').select('id, ordinal, title').eq('map_id', mapId).is('deleted_at', null)
    : { data: [] as Array<{ id: string; ordinal: number; title: string }> };
  const points = new Map(((pointRows ?? []) as Array<{ id: string; ordinal: number; title: string }>).map((p) => [p.id, p]));

  const { data: assignedRows } = await supabaseAdmin
    .from('job_map_point_media').select('id, point_id, job_file_id')
    .in('job_file_id', files.map((f) => String(f.id))).is('deleted_at', null);
  const assigned = new Map(((assignedRows ?? []) as Array<{ id: string; point_id: string; job_file_id: string }>)
    .map((a) => [a.job_file_id, a]));

  const toSign: Array<{ bucket: string; path: string }> = [];
  for (const f of files) {
    if (f.storage_path) toSign.push({ bucket: bucketOf(f), path: String(f.storage_path) });
    const t = f as { thumb_path?: string | null; thumb_bucket?: string | null };
    if (t.thumb_path && t.thumb_bucket) toSign.push({ bucket: t.thumb_bucket, path: t.thumb_path });
  }
  const signed = await signAll(toSign);

  return files.map((f) => {
    const kind = mediaKindFor(mimeOf(f), displayName(f));
    const url = f.storage_path ? signed.get(`${bucketOf(f)}:${String(f.storage_path)}`) ?? null : null;
    const a = assigned.get(String(f.id));
    const point = a ? points.get(a.point_id) : undefined;
    const t = f as { thumb_path?: string | null; thumb_bucket?: string | null; thumb_state?: string | null };
    const generated = t.thumb_path && t.thumb_bucket ? signed.get(`${t.thumb_bucket}:${t.thumb_path}`) ?? null : null;
    // A file whose kind can never have a preview is reported as such, so the panel's queue skips it
    // instead of asking every browser that ever opens this job to try again.
    const thumbState: ThumbState = generated
      ? 'ok'
      : (['pending', 'ok', 'failed', 'unsupported'].includes(t.thumb_state ?? '')
          ? (t.thumb_state as ThumbState)
          : initialThumbState(kind, mimeOf(f), displayName(f)));
    return {
      id: String(f.id),
      name: displayName(f),
      kind,
      mimeType: mimeOf(f),
      sizeBytes: sizeOf(f),
      uploadedAt: (f as { uploaded_at?: string | null }).uploaded_at ?? null,
      section: (f as { section?: string | null }).section ?? null,
      url,
      // The generated preview when there is one; an image falls back to itself, which is correct and
      // costs nothing since it is signed either way.
      thumbUrl: generated ?? (kind === 'image' ? url : null),
      thumbState: generated ? 'ok' : (kind === 'image' && url ? 'ok' : thumbState),
      assignedTo: a
        ? { pointId: a.point_id, mediaId: a.id, ordinal: point?.ordinal ?? 0, title: point?.title ?? 'another point' }
        : null,
    };
  });
}
