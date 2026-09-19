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
import { imageIsItsOwnThumb, initialThumbState, type ThumbState } from './file-thumbnails';
import {
  mediaKindFor, sortMedia, sortPoints, isKnownPointType, pointStatus, DEFAULT_POINT_TYPE, clampToImage,
  sortLayers, DEFAULT_LAYER_NAME,
  type MapPoint, type PointMedia, type PropertyMap, type Georeference, type RelativePoint, type MediaKind,
  type MapLayer,
} from './property-map';
import { isKnownGeometry, DEFAULT_GEOMETRY } from './property-map-shapes';
import { isLatLng, roundLatLng } from './map-world';

/** jsonb is whatever was written into it. A shape whose vertices are unreadable degrades to its
 *  anchor — a labelled dot where the path started — rather than throwing the whole map away. */
function readVertices(raw: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ lat: number; lng: number }> = [];
  for (const v of raw) {
    const p = v as { lat?: unknown; lng?: unknown };
    // Only real coordinates. A row written before seeds/647 holds {x, y} image fractions, which are
    // not places — they are dropped rather than drawn somewhere off the coast of Africa, and the
    // point still renders as its labelled anchor.
    if (isLatLng(p)) out.push(roundLatLng({ lat: p.lat as number, lng: p.lng as number }));
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
interface LayerRow {
  id: string; map_id: string; name: string; ordinal: number;
  is_visible: boolean; is_default: boolean; colour: string | null;
}
interface PointRow {
  id: string; map_id: string; ordinal: number; title: string; notes: string | null;
  x: number; y: number; point_type: string; status: string; lat: number | null; lng: number | null;
  layer_id: string | null;
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
  /** The map's sheets, default first. Always at least one — see `ensureDefaultLayer`. */
  layers: MapLayer[];
  /** The aerial itself, signed and ready for an <img>. */
  imageUrl: string | null;
}

function toLayer(r: LayerRow): MapLayer {
  return {
    id: r.id, mapId: r.map_id, name: r.name, ordinal: r.ordinal,
    isVisible: r.is_visible, isDefault: r.is_default, colour: r.colour ?? null,
  };
}

/**
 * Every map has a default sheet, created the first time it is actually read.
 *
 * seeds/645 left `job_map_points.layer_id` nullable and NULL meaning "the default layer", precisely
 * so that migration did not have to invent a layer for every map that already existed and then
 * backfill every point. This is where that promise is kept: the row appears the first time somebody
 * opens the map, and the points already on it are adopted in the same breath.
 *
 * Two people opening the same map at the same moment are two calls to this at the same moment. The
 * partial unique index `uq_job_map_layers_one_default` is what decides between them — the loser gets
 * a unique violation, which is not an error here, it is the answer: re-read and use the row the
 * winner made. That is why the insert failing falls through to a SELECT rather than throwing.
 */
async function ensureDefaultLayer(mapId: string, email?: string | null): Promise<LayerRow[]> {
  const { data: existing } = await supabaseAdmin
    .from('job_map_layers').select('*').eq('map_id', mapId).is('deleted_at', null).order('ordinal');
  const rows = (existing ?? []) as LayerRow[];
  if (rows.some((l) => l.is_default)) return rows;

  const { data: made } = await supabaseAdmin.from('job_map_layers').insert({
    map_id: mapId,
    name: DEFAULT_LAYER_NAME,
    ordinal: 1,
    is_default: true,
    created_by: email ?? null,
  }).select().maybeSingle();

  if (!made) {
    // Lost the race (or could not write). Whatever is there now is the truth.
    const { data: after } = await supabaseAdmin
      .from('job_map_layers').select('*').eq('map_id', mapId).is('deleted_at', null).order('ordinal');
    return (after ?? []) as LayerRow[];
  }

  const base = made as LayerRow;
  // Adopt the points that predate layers. Only the ones still on no sheet — a point somebody has
  // already moved is left where they put it.
  await supabaseAdmin.from('job_map_points')
    .update({ layer_id: base.id })
    .eq('map_id', mapId).is('layer_id', null).is('deleted_at', null);

  return [...rows, base];
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
export async function loadPropertyMap(jobId: string, mapId?: string | null, email?: string | null): Promise<LoadedMap | null> {
  let q = supabaseAdmin.from('job_property_maps').select('*').eq('job_id', jobId).is('deleted_at', null);
  q = mapId ? q.eq('id', mapId) : q.order('created_at', { ascending: true });
  const { data: maps, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  const mapRow = (maps ?? [])[0] as MapRow | undefined;
  if (!mapRow) return null;

  // Before the points are read, so a point loaded here already carries the layer it was adopted into
  // rather than a null that the browser would have to resolve a second time.
  const layerRows = await ensureDefaultLayer(mapRow.id, email);

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
      // As in the library above: a small image is its own tile, a big one waits for a real preview
      // rather than making the point panel download a 12 MB photograph to fill a 104 px square.
      thumbUrl: urlFor(m.thumb_bucket, m.thumb_path)
        ?? (imageIsItsOwnThumb(kind, f ? sizeOf(f) : null) ? full : null),
      sizeBytes: f ? sizeOf(f) : null,
      mimeType: f ? mimeOf(f) : null,
    };
    mediaByPoint.set(m.point_id, [...(mediaByPoint.get(m.point_id) ?? []), entry]);
  }

  const defaultLayerId = layerRows.find((l) => l.is_default)?.id ?? null;

  return {
    map: toMap(mapRow),
    layers: sortLayers(layerRows.map(toLayer)),
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
      // Resolved here rather than left null for the browser: a point adopted into the default sheet
      // a moment ago in `ensureDefaultLayer` was read before that update landed, so it still says
      // null in this row while the database says otherwise.
      layerId: p.layer_id ?? defaultLayerId,
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
  /**
   * Every point holding this file — empty when it is still free.
   *
   * An ARRAY since 2026-09-18, when the owner asked to "be able to assign files and pictures and
   * videos to multiple different points". It was a single value under seeds/643, which forbade the
   * second assignment outright; seeds/646 reverses that and this is the shape that follows. The
   * panel's question is unchanged — a file with any assignments at all is "placed" and fades — it
   * just now names all of them instead of the one.
   */
  assignedTo: Array<{ pointId: string; mediaId: string; ordinal: number; title: string }>;
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
  // Many per file now, not one. Rows belonging to another map's points are dropped rather than
  // listed with ordinal 0: "on point 0" is not a thing this panel can usefully say.
  const assigned = new Map<string, Array<{ id: string; point_id: string; job_file_id: string }>>();
  for (const a of (assignedRows ?? []) as Array<{ id: string; point_id: string; job_file_id: string }>) {
    if (mapId && !points.has(a.point_id)) continue;
    assigned.set(a.job_file_id, [...(assigned.get(a.job_file_id) ?? []), a]);
  }

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
    const held = assigned.get(String(f.id)) ?? [];
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
      // The generated preview when there is one. A SMALL image falls back to itself; a big one does
      // not, and is left `pending` so the panel's queue makes it a real 400 px WebP — see
      // `imageIsItsOwnThumb`, which is where the reasoning and the owner's report live.
      thumbUrl: generated ?? (imageIsItsOwnThumb(kind, sizeOf(f)) ? url : null),
      thumbState: generated ? 'ok' : (imageIsItsOwnThumb(kind, sizeOf(f)) && url ? 'ok' : thumbState),
      // In point order, so the chips read "on 2, 7" rather than in whatever order the rows came back.
      assignedTo: held
        .map((a) => {
          const point = points.get(a.point_id);
          return { pointId: a.point_id, mediaId: a.id, ordinal: point?.ordinal ?? 0, title: point?.title ?? 'another point' };
        })
        .sort((x, y) => x.ordinal - y.ordinal),
    };
  });
}
