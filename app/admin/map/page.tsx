'use client';

// app/admin/map/page.tsx — one map, every job, on the actual earth.
//
// Owner, 2026-09-18: "I was thinking it would be cool to be able to keep track of all of our points
// for each job on one big file that is attached to google earth … we can zoom around and scroll in …
// say we put in an address and the map zooms us to that location. if we have stored points at that
// property with files and stuff assigned to them, then we will be able to see them show up … the
// point loading and rendering would only show up at a certain level of zoom."
//
// And: "For the one interactive map that we had already built out that doesn't use geocoder or the
// map, you can get rid of it and build the new system."
//
// ── TWO MODES, ONE PAGE ─────────────────────────────────────────────────────────────────────────
//
// BROWSE (no ?job=): every job's points inside the viewport, clustered, loaded only past zoom 12.
// This is the "one big file" — where are all our points, across every job we have ever done.
//
// WORK (?job=<id>): one job's points, with its files, its layers, and everything editable. This is
// what the old per-job map was, and it is reached by the same button on the job page.
//
// They are one page because they are one map: the difference is a filter and a panel, not a
// different picture. Arriving from a job flies to the property and turns editing on; clearing the
// job hands the whole county back.
//
// ── WHAT CAME ACROSS FROM THE IMAGE MAP ─────────────────────────────────────────────────────────
//
// The file panel, the layers panel, the point detail panel and the tiles are the same ones, lifted
// rather than rewritten — none of them were ever about the picture underneath. What did NOT come
// across is the stage: the image, the zoom transform, the CSS pins, and every coordinate that was a
// fraction of a photograph. Google draws the map and owns the markers now.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { GoogleMap, LoadScript } from '@react-google-maps/api';
import {
  ChevronDown, ChevronLeft, ChevronUp, Eye, EyeOff, Folder, Layers, Loader2, MapPin, Pencil,
  Plus, Search, Target, Trash2, X, ZoomIn,
} from 'lucide-react';
import { usePageError } from '@/app/admin/hooks/usePageError';
import { useToast } from '@/app/admin/components/Toast';
import { usePageTitle } from '@/lib/admin/page-title';
import SharedFileViewer from '@/app/admin/components/files/FileViewer';
import InlineRename from '@/app/admin/components/files/InlineRename';
import {
  POINT_STATUSES, POINT_TYPES, mediaSummary, pointLabel, pointType, sortMedia,
  layerOf, hiddenLayerIds, pointsPerLayer, nextLayerName, pointColour, LAYER_COLOURS,
  type MapLayer, type MapPoint, type MediaKind, type PointMedia, type PointStatus, type PointTypeId,
  type PropertyMap,
} from '@/lib/jobs/property-map';
import {
  clusterPoints, shouldLoadPoints, zoomHint, padBounds, boundsOf, padPoint, isLatLng, parseLatLng,
  DEFAULT_CENTER, DEFAULT_ZOOM, JOB_ZOOM,
  type Bounds, type LatLng,
} from '@/lib/jobs/map-world';
import { POINT_GEOMETRIES, type GeometryId } from '@/lib/jobs/property-map-shapes';
import {
  shapePath, isDrawable, needsMore, measureShape, aimFrom, compass, FOV_DEFAULT_FEET,
} from '@/lib/jobs/map-shapes-world';
import type { LibraryFile } from '@/lib/jobs/property-map-server';
import type { ViewerCapabilities, ViewerCollection, ViewerFile } from '@/lib/files/viewer-model';
import { FileTile, MediaTile } from './components/Tiles';
import { KIND_ONE, sortLibrary } from './components/kinds';
import './PropertyMap.css';

// `hybrid` is satellite with the road and label overlay — the same mode the public service-area map
// uses. Plain satellite looks better and is much harder to navigate: with no road names, finding the
// right field is guesswork.
const LIBRARIES: ('marker' | 'places')[] = ['marker', 'places'];

const MAP_OPTIONS: google.maps.MapOptions = {
  mapTypeId: 'hybrid',
  mapTypeControl: true,
  streetViewControl: true,
  fullscreenControl: true,
  zoomControl: true,
  // Tilt and rotation off: this is a plan view of a parcel, and a map somebody has accidentally
  // rotated 40° is a map where north is a guess.
  tilt: 0,
  rotateControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
  maxZoom: 22,
  mapId: 'DEMO_MAP_ID',
};

const CONTAINER = { width: '100%', height: '100%' };

/** A point reduced to what a marker needs: where it is, what colour, and what it says. Both modes
 *  produce this shape, so the marker code never has to know which one it is drawing. */
interface DrawablePoint {
  id: string;
  lat: number;
  lng: number;
  ordinal: number;
  title: string;
  pointType: PointTypeId;
  mediaCount: number;
  jobNumber: string | null;
  colour: string;
  layerId: string | null;
}

/** One live marker, kept so the next render can adjust it instead of replacing it. */
interface MarkerEntry {
  marker: google.maps.marker.AdvancedMarkerElement;
  el: HTMLDivElement;
  /** The pin inside the wrapper — null for a cluster, which has no per-point appearance. */
  pin: HTMLDivElement | null;
  /** Reassigned in place on every reconcile, so the click handler always reads the current one. */
  cluster: { id: string; lat: number; lng: number; items: DrawablePoint[] };
}
const FILE_DRAG_TYPE = 'application/x-starr-job-file';

interface MapPayload {
  map: PropertyMap | null;
  points: MapPoint[];
  layers: MapLayer[];
  imageUrl: string | null;
}

interface WorldPoint {
  id: string; mapId: string; jobId: string;
  jobNumber: string | null; jobName: string | null;
  ordinal: number; title: string; lat: number; lng: number;
  pointType: PointTypeId; status: string; layerId: string | null;
  geometry: string; mediaCount: number;
}

interface JobPlace {
  jobId: string; jobNumber: string | null; name: string | null;
  address: string | null; city: string | null; county: string | null;
  lat: number | null; lng: number | null; mapId: string | null; points: number;
}

function swatch(type: PointTypeId): string {
  if (typeof window === 'undefined') return '#1D3095';
  const v = getComputedStyle(document.documentElement).getPropertyValue(pointType(type).token).trim();
  return v || '#1D3095';
}

export default function GlobalPropertyMapPage() {
  usePageTitle('Property map');
  const params = useSearchParams();
  const { addToast } = useToast();
  const { safeFetch, reportPageError } = usePageError('GlobalPropertyMapPage');

  const jobParam = params.get('job');

  // ── map + viewport ────────────────────────────────────────────────────────────────────────────
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [loading, setLoading] = useState(false);

  // ── browse mode ───────────────────────────────────────────────────────────────────────────────
  const [world, setWorld] = useState<WorldPoint[]>([]);
  const [capped, setCapped] = useState(false);
  const [browsePick, setBrowsePick] = useState<WorldPoint | null>(null);

  // ── work mode ─────────────────────────────────────────────────────────────────────────────────
  const [job, setJob] = useState<JobPlace | null>(null);
  const [payload, setPayload] = useState<MapPayload | null>(null);
  const [library, setLibrary] = useState<LibraryFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [armedFileId, setArmedFileId] = useState<string | null>(null);
  const [confirmUnassign, setConfirmUnassign] = useState<string | null>(null);
  const [confirmMedia, setConfirmMedia] = useState<string | null>(null);
  const [confirmPoint, setConfirmPoint] = useState<string | null>(null);
  const [confirmLayer, setConfirmLayer] = useState<string | null>(null);
  /** The layer being pointed at, from either end: a row in the panel, or a pin on the map. */
  const [hoverLayer, setHoverLayer] = useState<string | null>(null);
  const [colourFor, setColourFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; notes: string } | null>(null);
  /** Which shape the next click starts, and the shape being drawn right now. */
  const [drawKind, setDrawKind] = useState<GeometryId | null>(null);
  const [draw, setDraw] = useState<{
    geometry: GeometryId; anchor: LatLng; vertices: LatLng[];
    bearing: number; spreadDeg: number; feet: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // ── panels ────────────────────────────────────────────────────────────────────────────────────
  const [filesOpen, setFilesOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [jobs, setJobs] = useState<JobPlace[]>([]);
  const [fileSearch, setFileSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<MediaKind | 'all'>('all');
  const [unplacedOnly, setUnplacedOnly] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<PointTypeId[]>([]);
  const [viewerOn, setViewerOn] = useState<{ source: 'library' | 'point'; fileId: string } | null>(null);

  const jobPickRef = useRef<HTMLDivElement | null>(null);
  /** The backstop timer behind `tilesloaded`, so a map that never paints still loads points. */
  const tilesWaitRef = useRef<number | null>(null);
  /** The job already loaded, so arriving does not fetch it once per render. */
  const loadedJobRef = useRef<string | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const searchRef = useRef<HTMLInputElement | null>(null);
  const placingRef = useRef(false);
  const armedRef = useRef<string | null>(null);
  useEffect(() => { placingRef.current = placing; }, [placing]);
  useEffect(() => { armedRef.current = armedFileId; }, [armedFileId]);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const workMode = Boolean(job);
  const points = useMemo(() => payload?.points ?? [], [payload]);
  const layers = useMemo(() => payload?.layers ?? [], [payload]);
  const selected = useMemo(() => points.find((p) => p.id === selectedId) ?? null, [points, selectedId]);

  // ── loading ───────────────────────────────────────────────────────────────────────────────────
  const loadJobMap = useCallback(async (jobId: string) => {
    const data = await safeFetch<MapPayload>(`/api/admin/jobs/${jobId}/property-map`);
    if (data) setPayload(data);
    return data;
  }, [safeFetch]);

  const loadLibrary = useCallback(async (jobId: string, mapId: string | null) => {
    const qs = mapId ? `?map_id=${encodeURIComponent(mapId)}` : '';
    const data = await safeFetch<{ files: LibraryFile[] }>(`/api/admin/jobs/${jobId}/property-map/library${qs}`);
    if (data) setLibrary(Array.isArray(data.files) ? data.files : []);
  }, [safeFetch]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const data = await safeFetch<{ jobs: JobPlace[] }>('/api/admin/map/points?jobs=1');
      if (alive && data?.jobs) setJobs(data.jobs);
    })();
    return () => { alive = false; };
  }, [safeFetch]);

  /**
   * Arriving from a job: fly there, load its map, and open for work.
   *
   * Guarded to run ONCE per job. The effect has to depend on `map` — it cannot fly anywhere before
   * the map exists — and `map` arrives after the first render, so without the guard this ran three
   * times on every arrival: three lookups of the same job, three map loads, three libraries. All of
   * it competing with the tiles for the thread, which is the thing this whole change is about.
   */
  useEffect(() => {
    if (!jobParam) {
      setJob(null); setPayload(null); setLibrary([]);
      loadedJobRef.current = null;
      return;
    }
    if (!map) return;
    if (loadedJobRef.current === jobParam) return;
    loadedJobRef.current = jobParam;
    let alive = true;
    void (async () => {
      const data = await safeFetch<{ job: JobPlace }>(`/api/admin/map/job/${jobParam}`);
      if (!alive || !data?.job) return;
      setJob(data.job);
      setFilesOpen(true);
      const m = await loadJobMap(jobParam);
      if (!alive) return;

      // ── THE MAP FIRST, THE FILES A MOMENT LATER ─────────────────────────────────────────────
      // The library is every file on the job, each with a signed URL and a thumbnail the browser
      // then decodes. Awaiting it here held the camera move behind a response that has nothing to
      // do with where the map should be pointing, and its thumbnails then competed with the tiles
      // for the same main thread. It is no longer awaited: the map goes where it is going, and the
      // files arrive into a panel that is already on screen.
      const whenFree = window.requestIdleCallback
        ? (fn: () => void) => window.requestIdleCallback(fn, { timeout: 1500 })
        : (fn: () => void) => window.setTimeout(fn, 250);
      whenFree(() => { if (alive) void loadLibrary(jobParam, m?.map?.id ?? data.job.mapId ?? null); });

      if (map && data.job.lat !== null && data.job.lng !== null) {
        // Frame the points if there are any — the property, not the mailing address. Otherwise the
        // job's own coordinates.
        const placed = (m?.points ?? []).filter((p) => isLatLng({ lat: p.lat as number, lng: p.lng as number }));
        const b = placed.length
          ? boundsOf(placed.map((p) => ({ lat: p.lat as number, lng: p.lng as number })))
          : null;
        if (b) {
          map.fitBounds(new google.maps.LatLngBounds({ lat: b.south, lng: b.west }, { lat: b.north, lng: b.east }), 80);
        } else {
          map.setCenter({ lat: data.job.lat, lng: data.job.lng });
          map.setZoom(JOB_ZOOM);
        }
      } else if (data.job.lat === null) {
        addToast(`${data.job.jobNumber ?? 'That job'} has no location yet. Search its address, then place points.`, 'info', 4200);
      }
    })();
    return () => { alive = false; };
  }, [jobParam, map, safeFetch, loadJobMap, loadLibrary, addToast]);

  const fetchWorld = useCallback(async (b: Bounds, z: number) => {
    if (!shouldLoadPoints(z)) { setWorld([]); setCapped(false); return; }
    const p = padBounds(b);
    const qs = new URLSearchParams({
      north: String(p.north), south: String(p.south), east: String(p.east), west: String(p.west), zoom: String(z),
    });
    setLoading(true);
    const data = await safeFetch<{ points: WorldPoint[]; capped: boolean }>(`/api/admin/map/points?${qs}`);
    setLoading(false);
    if (!data) return;
    setWorld(data.points ?? []);
    setCapped(Boolean(data.capped));
  }, [safeFetch]);

  /**
   * The map settled. Read the viewport — then get out of the way.
   *
   * Owner, 2026-09-19: "can we make it so that the satellite view rendering gets priority over
   * other things loading like files and stuff."
   *
   * `idle` fires when the camera stops, which is BEFORE the tiles for where it stopped have
   * arrived and painted. Fetching points right then puts a network round trip, a state update, a
   * re-render and a marker reconcile in front of the thing the person is actually waiting to see.
   *
   * So the fetch is deferred until the tiles say they are done — and `tilesloaded` is the event
   * that says so. The timeout is the honest part: a tile that never loads (no signal, a refused
   * key) must not mean points never load either, so after a second the work happens anyway.
   */
  const onIdle = useCallback(() => {
    if (!map) return;
    const b = map.getBounds();
    const z = map.getZoom() ?? DEFAULT_ZOOM;
    setZoom(z);
    if (!b) return;
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    const next: Bounds = { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };
    setBounds(next);
    // Only browse mode reads the viewport. In work mode the job's own points are already loaded in
    // full, and re-fetching them on every pan would fight with local edits.
    if (workMode) return;

    if (tilesWaitRef.current !== null) window.clearTimeout(tilesWaitRef.current);
    let ran = false;
    const go = () => {
      if (ran) return;
      ran = true;
      if (tilesWaitRef.current !== null) { window.clearTimeout(tilesWaitRef.current); tilesWaitRef.current = null; }
      void fetchWorld(next, z);
    };
    google.maps.event.addListenerOnce(map, 'tilesloaded', go);
    tilesWaitRef.current = window.setTimeout(go, 1000);
  }, [map, fetchWorld, workMode]);

  const refresh = useCallback(async () => {
    if (job) {
      const m = await loadJobMap(job.jobId);
      await loadLibrary(job.jobId, m?.map?.id ?? job.mapId ?? null);
    } else if (bounds) {
      void fetchWorld(bounds, zoom);
    }
  }, [job, bounds, zoom, loadJobMap, loadLibrary, fetchWorld]);

  // ── mutations ─────────────────────────────────────────────────────────────────────────────────
  const mutate = useCallback(async (what: string, url: string, init: RequestInit, done?: string) => {
    setBusy(true);
    const res = await safeFetch<MapPayload>(url, init);
    setBusy(false);
    if (!res) { addToast(`Could not ${what}.`, 'error'); return null; }
    setPayload(res);
    if (done) addToast(done, 'success', 1700);
    return res;
  }, [safeFetch, addToast]);

  const mapId = payload?.map?.id ?? job?.mapId ?? null;

  /** A job that has never had a map gets one now, rather than sending somebody to another screen to
   *  create an empty container before they can drop a pin. */
  const ensureMap = useCallback(async (): Promise<string | null> => {
    if (mapId) return mapId;
    if (!job) return null;
    const made = await safeFetch<MapPayload>(`/api/admin/jobs/${job.jobId}/property-map`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Property map' }),
    });
    if (made) setPayload(made);
    return made?.map?.id ?? null;
  }, [mapId, job, safeFetch]);

  const patchPoint = useCallback(async (pointId: string, body: Record<string, unknown>, done: string) => {
    if (!job || !mapId) return null;
    return mutate('save the point', `/api/admin/jobs/${job.jobId}/property-map/points`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: mapId, point_id: pointId, ...body }),
    }, done);
  }, [job, mapId, mutate]);

  const placePoint = useCallback(async (at: LatLng) => {
    if (!job) { setJobPickerOpen(true); addToast('Pick a job first — a point belongs to one.', 'info', 2600); return; }
    const id = await ensureMap();
    if (!id) { addToast('Could not start a map for this job.', 'error'); return; }
    // ── A NEW POINT LANDS SOMEWHERE YOU CAN SEE IT ────────────────────────────────────────────
    // The default sheet, unless it is hidden — then the first sheet that is showing. Without this,
    // placing a point while the default layer is switched off drops a pin that vanishes the instant
    // it is drawn, which reads as the click not having worked rather than as the filter doing its
    // job.
    const landing = layers.find((l) => l.isDefault && l.isVisible)
      ?? layers.find((l) => l.isVisible)
      ?? layers.find((l) => l.isDefault)
      ?? null;
    const res = await mutate('place the point', `/api/admin/jobs/${job.jobId}/property-map/points`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: id, lat: at.lat, lng: at.lng, title: 'Point of interest', ...(landing ? { layer_id: landing.id } : {}) }),
    }, 'Point placed.');
    setPlacing(false);
    if (res) {
      const newest = [...res.points].sort((a, b) => b.ordinal - a.ordinal)[0];
      if (newest) setSelectedId(newest.id);
    }
  }, [job, layers, ensureMap, mutate, addToast]);

  const assignFile = useCallback(async (pointId: string, fileId: string) => {
    if (!job) return;
    setArmedFileId(null);
    const res = await fetch(`/api/admin/jobs/${job.jobId}/property-map/media`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ point_id: pointId, job_file_id: fileId }),
    }).catch(() => null);
    if (!res) { addToast('Could not reach the server — nothing was changed.', 'error'); return; }
    if (res.ok) {
      setPayload((await res.json()) as MapPayload);
      addToast('Added to the point.', 'success', 1600);
      if (job) void loadLibrary(job.jobId, mapId);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    addToast(body.error ?? 'That file could not be added.', 'error');
  }, [job, mapId, loadLibrary, addToast]);

  const detachMedia = useCallback(async (pointId: string, mediaId: string) => {
    if (!job) return;
    setConfirmMedia(null);
    await mutate('detach that file', `/api/admin/jobs/${job.jobId}/property-map/media?point_id=${encodeURIComponent(pointId)}&media_id=${encodeURIComponent(mediaId)}`, { method: 'DELETE' }, 'Detached.');
    void loadLibrary(job.jobId, mapId);
  }, [job, mapId, mutate, loadLibrary]);

  const unassignFile = useCallback(async (file: LibraryFile, at: LibraryFile['assignedTo'][number]) => {
    if (!job) return;
    setConfirmUnassign(null);
    await mutate('unassign that file', `/api/admin/jobs/${job.jobId}/property-map/media?point_id=${encodeURIComponent(at.pointId)}&media_id=${encodeURIComponent(at.mediaId)}`, { method: 'DELETE' }, at.ordinal > 0 ? `Taken off point ${at.ordinal}.` : 'Unassigned.');
    void loadLibrary(job.jobId, mapId);
  }, [job, mapId, mutate, loadLibrary]);

  const deletePoint = useCallback(async (pointId: string) => {
    if (!job || !mapId) return;
    setConfirmPoint(null);
    const res = await mutate('delete the point', `/api/admin/jobs/${job.jobId}/property-map/points?map_id=${encodeURIComponent(mapId)}&point_id=${encodeURIComponent(pointId)}`, { method: 'DELETE' }, 'Point deleted.');
    if (res) { setSelectedId(null); void loadLibrary(job.jobId, mapId); }
  }, [job, mapId, mutate, loadLibrary]);

  /** Writes `job_files.label` — the same field the job's Files tab writes, so a rename here follows
   *  the file everywhere. */
  const renameFile = useCallback(async (fileId: string, next: string) => {
    const res = await fetch(`/api/admin/jobs/files/${fileId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      addToast(body.error ?? 'That file could not be renamed.', 'error');
      throw new Error('rename failed');
    }
    setLibrary((cur) => cur.map((f) => (f.id === fileId ? { ...f, name: next } : f)));
    setPayload((cur) => (cur ? {
      ...cur,
      points: cur.points.map((p) => ({ ...p, media: p.media.map((m) => (m.jobFileId === fileId ? { ...m, name: next } : m)) })),
    } : cur));
    addToast('Renamed.', 'success', 1500);
  }, [addToast]);

  // ── layers ────────────────────────────────────────────────────────────────────────────────────
  const layerFetch = useCallback(async (what: string, init: RequestInit, done?: string, qs = '') => {
    if (!job) return null;
    return mutate(what, `/api/admin/jobs/${job.jobId}/property-map/layers${qs}`, init, done);
  }, [job, mutate]);

  const addLayer = useCallback(async () => {
    const id = await ensureMap();
    if (!id) return;
    const name = nextLayerName(layers);
    await layerFetch('add a layer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: id, name }),
    }, `“${name}” added.`);
  }, [ensureMap, layers, layerFetch]);

  const renameLayer = useCallback(async (layerId: string, name: string) => {
    if (!mapId) return;
    const res = await layerFetch('rename the layer', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: mapId, layer_id: layerId, name }),
    }, 'Layer renamed.');
    if (!res) throw new Error('rename failed');
  }, [mapId, layerFetch]);

  const recolourLayer = useCallback(async (layerId: string, colour: string | null) => {
    if (!mapId) return;
    await layerFetch('recolour the layer', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: mapId, layer_id: layerId, colour }),
    });
  }, [mapId, layerFetch]);

  const toggleLayer = useCallback(async (layerId: string, visible: boolean) => {
    if (!mapId) return;
    await layerFetch('change the layer', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: mapId, layer_id: layerId, is_visible: visible }),
    });
  }, [mapId, layerFetch]);

  const deleteLayer = useCallback(async (layerId: string) => {
    if (!mapId) return;
    setConfirmLayer(null);
    await layerFetch('delete the layer', { method: 'DELETE' }, 'Layer deleted. Its points moved to the default layer.',
      `?map_id=${encodeURIComponent(mapId)}&layer_id=${encodeURIComponent(layerId)}`);
  }, [mapId, layerFetch]);

  // ── what is drawn ─────────────────────────────────────────────────────────────────────────────
  const hiddenLayers = useMemo(() => hiddenLayerIds(layers), [layers]);
  const layerCounts = useMemo(() => pointsPerLayer(points, layers), [points, layers]);
  const defaultLayer = useMemo(() => layers.find((l) => l.isDefault) ?? null, [layers]);

  /** Everything the map should show right now, in one shape whichever mode we are in. */
  const drawable = useMemo(() => {
    if (workMode) {
      return points
        .filter((p) => isLatLng({ lat: p.lat as number, lng: p.lng as number }))
        .filter((p) => !hiddenTypes.includes(p.pointType))
        .filter((p) => !(p.layerId && hiddenLayers.includes(p.layerId)))
        .filter((p) => {
          // A null layerId reads as the default sheet, so hiding the base layer has to hide these.
          const l = layerOf(p, layers);
          return !(l && hiddenLayers.includes(l.id));
        })
        .map((p) => ({
          id: p.id, lat: p.lat as number, lng: p.lng as number, ordinal: p.ordinal, title: p.title,
          pointType: p.pointType, mediaCount: p.media.length, jobNumber: job?.jobNumber ?? null,
          colour: pointColour(p, layers, swatch),
          layerId: layerOf(p, layers)?.id ?? null,
        }));
    }
    return world
      .filter((p) => !hiddenTypes.includes(p.pointType))
      .map((p) => ({
        id: p.id, lat: p.lat, lng: p.lng, ordinal: p.ordinal, title: p.title,
        pointType: p.pointType, mediaCount: p.mediaCount, jobNumber: p.jobNumber,
        colour: swatch(p.pointType), layerId: p.layerId,
      }));
  }, [workMode, points, world, hiddenTypes, hiddenLayers, layers, job]);

  const clusters = useMemo(() => clusterPoints(drawable, zoom), [drawable, zoom]);

  const legend = useMemo(() => {
    const present = new Set((workMode ? points : world).map((p) => p.pointType));
    return POINT_TYPES.filter((t) => present.has(t.id));
  }, [workMode, points, world]);

  // ── MARKERS ARE RECONCILED, NOT REBUILT ───────────────────────────────────────────────────────
  //
  // Owner, 2026-09-19: "it takes me to the location but it does not refresh the map so that the
  // satellite view becomes clear quickly. can we make it so that the satellite view rendering gets
  // priority over other things loading."
  //
  // That diagnosis was right, and this was most of it. Every marker used to be destroyed and
  // recreated whenever ANY of clusters, selectedId, hoverLayer, world or assignFile changed — and
  // hoverLayer changes on every mouse move across a layer row, while assignFile is a useCallback
  // that changes whenever the library reloads. So the whole set was torn down and rebuilt over and
  // over, on the main thread, which is the same thread the tiles need in order to decode and paint.
  // The satellite stayed soft because it was never given a moment to sharpen.
  //
  // Now markers are keyed by cluster id and only the ones that actually changed are touched, and
  // appearance — selected, lit, dimmed — is written onto the elements that already exist. Panning
  // within one cluster set costs nothing.
  //
  // The click and drop handlers read REFS rather than closing over state, which is what lets this
  // effect depend on almost nothing.
  const workModeRef = useRef(workMode);
  const assignFileRef = useRef(assignFile);
  const worldRef = useRef(world);
  useEffect(() => { workModeRef.current = workMode; }, [workMode]);
  useEffect(() => { assignFileRef.current = assignFile; }, [assignFile]);
  useEffect(() => { worldRef.current = world; }, [world]);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.marker) return;
    const have = markersRef.current;
    const want = new Map(clusters.map((c) => [c.id, c]));

    for (const [id, entry] of have) {
      if (!want.has(id)) { entry.marker.map = null; have.delete(id); }
    }

    for (const [id, c] of want) {
      const existing = have.get(id);
      if (existing) { existing.cluster = c; continue; }

      // ── THE WRAPPER IS WHAT MAKES A PIN POINT AT ITS COORDINATE ───────────────────────────────
      // Google anchors the content element by its bottom-centre. The pin is a rotated square whose
      // tip hangs below its own box, so without a wrapper of the right height every pin marks a
      // spot ~5px above the thing it points at — and in screen pixels, so it never scales away.
      // See PIN_BOX_HEIGHT_PX in lib/jobs/map-world.ts for the arithmetic.
      const el = document.createElement('div');
      let pin: HTMLDivElement | null = null;

      if (c.items.length === 1) {
        const p = c.items[0];
        el.className = 'gmap__marker';
        pin = document.createElement('div');
        pin.className = 'gmap__pin';
        pin.style.setProperty('--pin', p.colour);
        const num = document.createElement('span');
        num.className = 'gmap__pin-num';
        num.textContent = String(p.ordinal);
        pin.appendChild(num);
        el.appendChild(pin);
        el.title = p.ordinal + '. ' + p.title + (p.jobNumber ? ' \u00b7 ' + p.jobNumber : '');

        // A marker is a DOM node, which is what lets a file be dropped straight onto a pin — the
        // same HTML5 drag the panel already uses, with a real element as the target.
        const inner = pin;
        el.addEventListener('dragover', (e) => {
          if (!workModeRef.current) return;
          e.preventDefault();
          inner.classList.add('gmap__pin--over');
        });
        el.addEventListener('dragleave', () => inner.classList.remove('gmap__pin--over'));
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          inner.classList.remove('gmap__pin--over');
          const fileId = (e as DragEvent).dataTransfer?.getData(FILE_DRAG_TYPE);
          if (fileId && workModeRef.current) void assignFileRef.current(p.id, fileId);
        });

        // Hovering a pin lights its layer's row in the panel — the other half of the relation.
        if (p.layerId) {
          const layerId = p.layerId;
          el.addEventListener('mouseenter', () => setHoverLayer(layerId));
          el.addEventListener('mouseleave', () => setHoverLayer((cur) => (cur === layerId ? null : cur)));
        }
      } else {
        el.className = 'gmap__marker gmap__marker--cluster';
        const dot = document.createElement('div');
        dot.className = 'gmap__cluster';
        dot.textContent = String(c.items.length);
        el.appendChild(dot);
        el.title = c.items.length + ' points here \u2014 zoom in to separate them';
      }

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map, position: { lat: c.lat, lng: c.lng }, content: el,
      });

      const entry: MarkerEntry = { marker, el, pin, cluster: c };
      marker.addListener('gmp-click', () => {
        const cur = entry.cluster;
        if (cur.items.length > 1) {
          const b = boundsOf(cur.items) ?? padPoint({ lat: cur.lat, lng: cur.lng });
          map.fitBounds(new google.maps.LatLngBounds({ lat: b.south, lng: b.west }, { lat: b.north, lng: b.east }), 64);
          return;
        }
        const p = cur.items[0];
        // Armed for assignment: the click spends itself putting the file on this pin instead of
        // selecting it, which is the touch and keyboard half of the drag.
        if (workModeRef.current && armedRef.current) { void assignFileRef.current(p.id, armedRef.current); return; }
        if (workModeRef.current) setSelectedId(p.id);
        else setBrowsePick(worldRef.current.find((w) => w.id === p.id) ?? null);
      });

      have.set(id, entry);
    }
  }, [map, clusters]);

  /** Appearance only — written onto the elements that already exist, so hovering a layer row does
   *  not rebuild six hundred markers while the tiles are trying to paint. */
  useEffect(() => {
    for (const entry of markersRef.current.values()) {
      const p = entry.cluster.items.length === 1 ? entry.cluster.items[0] : null;
      if (!p || !entry.pin) continue;
      const related = hoverLayer !== null && p.layerId === hoverLayer;
      entry.pin.classList.toggle('gmap__pin--on', p.id === selectedId);
      entry.pin.classList.toggle('gmap__pin--has-files', p.mediaCount > 0);
      entry.pin.classList.toggle('gmap__pin--lit', related);
      entry.pin.classList.toggle('gmap__pin--dim', hoverLayer !== null && !related);
    }
  }, [selectedId, hoverLayer, clusters]);

  /** Every marker goes when the page does. */
  useEffect(() => {
    const held = markersRef.current;
    return () => {
      for (const entry of held.values()) entry.marker.map = null;
      held.clear();
    };
  }, []);

  // ── DRAWING THE OTHER THREE SHAPES ────────────────────────────────────────────────────────────
  //
  // Owner, 2026-09-19: "Need to be able to create a single point location, and also a point and its
  // corresponding area around it, and a point with a drawn path to another point, and a point with
  // field of view lines."
  //
  // A single point is one click. The other three are a first click for the anchor and then clicks
  // for what follows, so they share one piece of state: where it started and what has been added.
  // The shape is kept only when it has enough to be drawable — a path to nowhere and an area with
  // two corners are both a half-finished thought rather than a thing to store.
  const finishDraw = useCallback(async () => {
    if (!draw || !job) return;
    if (!isDrawable(draw.geometry, draw.vertices.length)) return;
    const id = await ensureMap();
    if (!id) { addToast('Could not start a map for this job.', 'error'); return; }
    const landing = layers.find((l) => l.isDefault && l.isVisible)
      ?? layers.find((l) => l.isVisible)
      ?? layers.find((l) => l.isDefault)
      ?? null;
    const body: Record<string, unknown> = {
      map_id: id,
      lat: draw.anchor.lat,
      lng: draw.anchor.lng,
      geometry: draw.geometry,
      title: 'Point of interest',
      ...(landing ? { layer_id: landing.id } : {}),
    };
    if (draw.geometry === 'path' || draw.geometry === 'area') body.vertices = draw.vertices;
    if (draw.geometry === 'fov') {
      body.bearing_deg = draw.bearing;
      body.fov_deg = draw.spreadDeg;
      body.fov_radius = draw.feet;
    }
    const res = await mutate('draw that shape', `/api/admin/jobs/${job.jobId}/property-map/points`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, 'Shape placed.');
    setDraw(null);
    if (res) {
      const newest = [...res.points].sort((a, b) => b.ordinal - a.ordinal)[0];
      if (newest) setSelectedId(newest.id);
    }
  }, [draw, job, layers, ensureMap, mutate, addToast]);

  // ── THE SHAPES THEMSELVES ─────────────────────────────────────────────────────────────────────
  // Google owns these objects like it owns the markers, so they are created and destroyed here
  // rather than rendered. Everything is drawn in its point's colour, which is the layer's when the
  // layer has one — so switching a sheet to orange turns its cones and paths orange too, not just
  // its pins.
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.Polygon) return;
    const drawn: Array<google.maps.Polygon | google.maps.Polyline> = [];

    const add = (p: MapPoint, colour: string) => {
      const anchor = { lat: p.lat as number, lng: p.lng as number };
      if (!isLatLng(anchor) || p.geometry === 'point') return;
      const path = shapePath(p.geometry, anchor, p.vertices, p.geometry === 'fov'
        ? { bearing: p.bearingDeg ?? 0, spreadDeg: p.fovDeg ?? 68, feet: p.fovRadius ?? FOV_DEFAULT_FEET }
        : undefined);
      if (path.length < 2) return;

      const lit = hoverLayer === null || layerOf(p, layers)?.id === hoverLayer;
      const common = {
        map,
        strokeColor: colour,
        strokeOpacity: lit ? 0.95 : 0.25,
        strokeWeight: p.id === selectedId ? 4 : 2.5,
        clickable: true,
      };
      const shape = p.geometry === 'path'
        ? new google.maps.Polyline({ ...common, path })
        : new google.maps.Polygon({ ...common, paths: path, fillColor: colour, fillOpacity: lit ? 0.18 : 0.05 });
      shape.addListener('click', () => setSelectedId(p.id));
      drawn.push(shape);
    };

    if (workMode) {
      for (const p of points) {
        if (hiddenTypes.includes(p.pointType)) continue;
        const l = layerOf(p, layers);
        if (l && hiddenLayers.includes(l.id)) continue;
        add(p, pointColour(p, layers, swatch));
      }
    }

    // The shape under construction, drawn as you click so it is not a guess until you finish.
    if (draw) {
      const path = shapePath(draw.geometry, draw.anchor, draw.vertices,
        draw.geometry === 'fov' ? { bearing: draw.bearing, spreadDeg: draw.spreadDeg, feet: draw.feet } : undefined);
      if (path.length >= 2) {
        const common = { map, strokeColor: '#FACC15', strokeOpacity: 1, strokeWeight: 3, clickable: false, zIndex: 9 };
        drawn.push(draw.geometry === 'path'
          ? new google.maps.Polyline({ ...common, path })
          : new google.maps.Polygon({ ...common, paths: path, fillColor: '#FACC15', fillOpacity: 0.2 }));
      }
    }

    return () => { for (const s of drawn) s.setMap(null); };
  }, [map, workMode, points, layers, hiddenTypes, hiddenLayers, hoverLayer, selectedId, draw]);

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const at = { lat: e.latLng.lat(), lng: e.latLng.lng() };

    if (drawKind) {
      // First click anchors it. A cone is aimed by the SECOND click rather than dragged, because a
      // drag on a Google map is a pan and fighting that would break the one gesture everybody
      // already knows.
      setDraw((cur) => {
        if (!cur) return { geometry: drawKind, anchor: at, vertices: [], bearing: 0, spreadDeg: 68, feet: FOV_DEFAULT_FEET };
        if (cur.geometry === 'fov') {
          const aim = aimFrom(cur.anchor, at);
          return { ...cur, bearing: aim.bearing, feet: aim.feet };
        }
        return { ...cur, vertices: [...cur.vertices, at] };
      });
      return;
    }

    if (placingRef.current) void placePoint(at);
  }, [drawKind, placePoint]);

  // ── GOING SOMEWHERE ───────────────────────────────────────────────────────────────────────────
  //
  // Owner, 2026-09-19: "I want it so that we can click on the address and be homed to its location
  // on the map and be zoomed in on it. This should work whether it is an address or lat/long."
  //
  // One function, so the search box, a job row and a point's coordinates all mean the same thing by
  // "go there" — and so there is one place that decides how far in "zoomed in on it" is.
  const flyTo = useCallback((at: LatLng, z = JOB_ZOOM) => {
    if (!map) return;
    // ONE camera change, not two. `setCenter` then `setZoom` is two moves: Google fetches tiles for
    // the new centre at the OLD zoom, throws them away, and fetches again — and that first set is
    // what you sit watching resolve. `moveCamera` applies both at once, so the only tiles ever
    // requested are the ones you actually asked for.
    if (typeof map.moveCamera === 'function') map.moveCamera({ center: at, zoom: z });
    else { map.setCenter(at); map.setZoom(z); }
  }, [map]);

  /**
   * Take whatever was typed and go there.
   *
   * A coordinate is recognised BEFORE Google is asked, because Places is an address lookup and will
   * not answer "30.9589, -97.5252" — it either fails or, worse, finds somewhere with those digits
   * in its name. Everything else is geocoded.
   */
  const goToQuery = useCallback(async (raw: string) => {
    const typed = raw.trim();
    if (!typed) return;

    const coords = parseLatLng(typed);
    if (coords) { flyTo(coords); addToast(`Moved to ${coords.lat}, ${coords.lng}.`, 'success', 1800); return; }

    if (typeof google === 'undefined' || !google.maps?.Geocoder) return;
    setLoading(true);
    try {
      const geocoder = new google.maps.Geocoder();
      const res = await geocoder.geocode({ address: typed, componentRestrictions: { country: 'us' } });
      const at = res.results?.[0]?.geometry?.location;
      if (!at) { addToast('Nothing found for that address.', 'info', 2600); return; }
      flyTo({ lat: at.lat(), lng: at.lng() });
    } catch {
      addToast('That address could not be found.', 'info', 2600);
    } finally {
      setLoading(false);
    }
  }, [flyTo, addToast]);

  // ── address search ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !searchRef.current || typeof google === 'undefined' || !google.maps?.places) return;
    const ac = new google.maps.places.Autocomplete(searchRef.current, {
      fields: ['geometry', 'formatted_address', 'name'],
      componentRestrictions: { country: 'us' },
    });
    ac.bindTo('bounds', map);
    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      const at = place.geometry?.location;
      // No geometry means nothing was chosen from the list — the person typed and pressed Enter, or
      // pasted a coordinate, which Places has no answer for. Fall through to our own handler.
      if (!at) { void goToQuery(searchRef.current?.value ?? ''); return; }
      flyTo({ lat: at.lat(), lng: at.lng() });
    });
    return () => { listener.remove(); };
  }, [map, goToQuery, flyTo]);

  // ── A POP-UP CLOSES WHEN YOU CLICK AWAY FROM IT ──────────────────────────────────────────────
  // Owner, 2026-09-19: "whenever I click on the address button, it opens a list of other
  // addresses/locations. That drop down menu does not go away if I click somewhere else."
  //
  // `mousedown` rather than `click`, and capture rather than bubble: a click on the MAP is consumed
  // by Google before it ever reaches the document, so a bubble-phase listener never hears about the
  // one place people most often click to dismiss this. Listening on the way down catches it first.
  //
  // The colour palette rides along for the same reason — it is the other thing on this page that
  // opens over the map and has to be dismissable by looking away from it.
  useEffect(() => {
    if (!jobPickerOpen && !colourFor) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (jobPickerOpen && jobPickRef.current && t && jobPickRef.current.contains(t)) return;
      // A palette lives inside its own layer row; anything inside a row is a click on the control.
      if (colourFor && t instanceof Element && t.closest('.pmap__layer')) return;
      setJobPickerOpen(false);
      setColourFor(null);
    };
    document.addEventListener('mousedown', away, true);
    return () => document.removeEventListener('mousedown', away, true);
  }, [jobPickerOpen, colourFor]);

  // Escape unwinds one layer at a time, the way the old map did.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (viewerOn) return;
      if (colourFor) { setColourFor(null); return; }
      if (jobPickerOpen) { setJobPickerOpen(false); return; }
      if (drawKind) { setDraw(null); setDrawKind(null); return; }
      if (armedFileId) { setArmedFileId(null); return; }
      if (placing) { setPlacing(false); return; }
      if (selectedId) { setSelectedId(null); return; }
      if (browsePick) { setBrowsePick(null); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOn, colourFor, jobPickerOpen, drawKind, armedFileId, placing, selectedId, browsePick]);

  // The draft follows the SELECTION, so attaching a photo half way through typing a note does not
  // wipe what has been typed.
  useEffect(() => {
    const p = points.find((x) => x.id === selectedId);
    setDraft(p ? { title: p.title, notes: p.notes ?? '' } : null);
    setConfirmPoint(null);
    setConfirmMedia(null);
  }, [selectedId, points]);

  // ── the files panel ───────────────────────────────────────────────────────────────────────────
  const visibleFiles = useMemo(() => {
    const needle = fileSearch.trim().toLowerCase();
    return sortLibrary(library.filter((f) => {
      if (kindFilter !== 'all' && f.kind !== kindFilter) return false;
      if (unplacedOnly && f.assignedTo.length > 0) return false;
      if (needle && !f.name.toLowerCase().includes(needle)) return false;
      return true;
    }));
  }, [library, kindFilter, unplacedOnly, fileSearch]);

  const unplacedCount = useMemo(() => library.filter((f) => f.assignedTo.length === 0).length, [library]);

  // ── the viewer ────────────────────────────────────────────────────────────────────────────────
  const libraryCollection = useMemo<ViewerCollection>(() => ({
    id: mapId ?? 'library',
    title: job ? `${job.jobNumber ?? 'Job'} — files` : 'Job files',
    files: visibleFiles.filter((f) => f.url).map((f): ViewerFile => ({
      id: f.id, name: f.name, mime: f.mimeType, size: f.sizeBytes, url: f.url, createdAt: f.uploadedAt,
      meta: [
        { label: 'Kind', value: KIND_ONE[f.kind] },
        ...(f.assignedTo.length
          ? [{ label: f.assignedTo.length === 1 ? 'Placed on' : `Placed on ${f.assignedTo.length} points`, value: f.assignedTo.map((a) => (a.ordinal > 0 ? `Point ${a.ordinal} · ${a.title}` : a.title)).join('  ·  ') }]
          : []),
      ],
    })),
  }), [visibleFiles, mapId, job]);

  const pointCollection = useMemo<ViewerCollection | null>(() => {
    if (!selected) return null;
    const where = pointLabel(selected);
    return {
      id: selected.id, title: where,
      files: sortMedia(selected.media).filter((m) => m.url).map((m): ViewerFile => ({
        id: m.id, name: m.caption || m.name, mime: m.mimeType, size: m.sizeBytes, url: m.url,
        meta: [{ label: 'Kind', value: KIND_ONE[m.kind] }, { label: 'Placed on', value: where }],
      })),
    };
  }, [selected]);

  const viewerCollection = viewerOn?.source === 'point' ? pointCollection : libraryCollection;
  const viewerFileId = viewerOn && viewerCollection?.files.some((f) => f.id === viewerOn.fileId) ? viewerOn.fileId : null;

  const viewerCapabilities = useMemo<ViewerCapabilities>(() => ({
    rename: async (file, newName) => {
      const fromLibrary = library.find((f) => f.id === file.id);
      const media = selected?.media.find((m) => m.id === file.id);
      const jobFileId = fromLibrary?.id ?? media?.jobFileId;
      if (!jobFileId) throw new Error('That file is renamed where it lives.');
      await renameFile(jobFileId, newName);
      return { ...file, name: newName };
    },
  }), [library, selected, renameFile]);

  const hint = zoomHint(zoom, workMode ? drawable.length : world.length);

  if (!apiKey) {
    return (
      <div className="gmap gmap--nokey">
        <h1 className="gmap__title">Property map</h1>
        <p className="gmap__nokey-msg">
          This map needs <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to be set. Everything else on the
          job still works; only the map itself is unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="gmap" data-testid="gmap" data-mode={workMode ? 'work' : 'browse'}>
      {/* ── the bar ──────────────────────────────────────────────────────────────────────────── */}
      <div className="gmap__bar">
        <Link className="gmap__back" href={job ? `/admin/jobs/${job.jobId}` : '/admin/jobs'}>
          <ChevronLeft size={14} aria-hidden /> {job ? 'Back to the job' : 'Jobs'}
        </Link>

        <span className="gmap__search">
          <Search size={14} aria-hidden />
          <input
            ref={searchRef}
            className="gmap__search-input"
            type="text"
            placeholder="Search an address or place…"
            aria-label="Search for an address and fly there"
            data-testid="gmap-search"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              // Places fires `place_changed` when a suggestion is highlighted; when nothing is, this
              // is the only thing that happens, so a typed address or a pasted coordinate still goes.
              window.setTimeout(() => { void goToQuery((e.target as HTMLInputElement).value); }, 60);
            }}
          />
        </span>

        <div className="gmap__jobpick" ref={jobPickRef}>
          <button className={`gmap__btn${job ? ' gmap__btn--on' : ''}`} type="button" aria-expanded={jobPickerOpen} data-testid="gmap-job-toggle" onClick={() => setJobPickerOpen((c) => !c)}>
            <Target size={13} aria-hidden />
            {job ? `${job.jobNumber ?? 'Job'} · ${job.name ?? ''}`.slice(0, 30) : 'Pick a job'}
          </button>
          {jobPickerOpen && (
            <div className="gmap__joblist" role="listbox" data-testid="gmap-job-list">
              {job && (
                <a className="gmap__jobrow" href="/admin/map" data-testid="gmap-job-clear">
                  <strong>All jobs</strong><span>Browse every point</span>
                </a>
              )}
              {jobs.length === 0 && <p className="gmap__joblist-empty">No jobs have a location yet.</p>}
              {jobs.map((j) => (
                <div key={j.jobId} className={`gmap__jobrow${job?.jobId === j.jobId ? ' gmap__jobrow--on' : ''}`} data-testid={`gmap-job-${j.jobId}`}>
                  <a className="gmap__jobrow-open" href={`/admin/map?job=${j.jobId}`}>
                    <strong>{j.jobNumber ?? '—'}</strong>
                    <span>{j.name ?? ''}</span>
                  </a>
                  {/* The address itself goes there WITHOUT switching jobs — "show me where that is"
                      and "work on that job" are different intentions and now have different targets. */}
                  {(j.address || j.city) && (
                    <button
                      className="gmap__jobrow-addr"
                      type="button"
                      title="Show me this on the map"
                      data-testid={`gmap-job-addr-${j.jobId}`}
                      onClick={() => {
                        setJobPickerOpen(false);
                        if (j.lat !== null && j.lng !== null) flyTo({ lat: j.lat, lng: j.lng });
                        else void goToQuery([j.address, j.city, j.county, 'TX'].filter(Boolean).join(', '));
                      }}
                    >
                      {[j.address, j.city].filter(Boolean).join(', ')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {workMode && (
          <>
            <button className={`gmap__btn${filesOpen ? ' gmap__btn--on' : ''}`} type="button" aria-pressed={filesOpen} data-testid="gmap-files-toggle" onClick={() => setFilesOpen((c) => !c)}>
              <Folder size={13} aria-hidden /> Files
              <span className="gmap__count">{library.length} · {unplacedCount} unplaced</span>
              {filesOpen ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
            </button>

            <button className={`gmap__btn${layersOpen ? ' gmap__btn--on' : ''}`} type="button" aria-pressed={layersOpen} data-testid="gmap-layers-toggle" onClick={() => setLayersOpen((c) => !c)}>
              <Layers size={13} aria-hidden /> Layers
              <span className="gmap__count">{hiddenLayers.length ? `${layers.length} · ${hiddenLayers.length} hidden` : String(layers.length)}</span>
            </button>

            <button className={`gmap__btn${editing ? ' gmap__btn--on' : ''}`} type="button" aria-pressed={editing} data-testid="gmap-edit" onClick={() => { setEditing((c) => !c); setPlacing(false); setArmedFileId(null); }}>
              <Pencil size={13} aria-hidden /> {editing ? 'Done' : 'Edit map'}
            </button>

            {editing && (
              <>
                <button
                  className={`gmap__btn${placing ? ' gmap__btn--on' : ''}`}
                  type="button"
                  aria-pressed={placing}
                  data-testid="gmap-place"
                  onClick={() => { setPlacing((c) => !c); setDrawKind(null); setDraw(null); }}
                >
                  <Plus size={13} aria-hidden /> {placing ? 'Click the map…' : 'Add point'}
                </button>

                {/* The other three shapes. One button each rather than a mode dropdown: which shape
                    you want is decided before you start, and a dropdown hides two of the three
                    behind a click for no benefit. */}
                {POINT_GEOMETRIES.filter((g) => g.id !== 'point').map((g) => (
                  <button
                    key={g.id}
                    className={`gmap__btn${drawKind === g.id ? ' gmap__btn--on' : ''}`}
                    type="button"
                    aria-pressed={drawKind === g.id}
                    title={g.hint}
                    data-testid={`gmap-draw-${g.id}`}
                    onClick={() => {
                      setPlacing(false);
                      setDraw(null);
                      setDrawKind((cur) => (cur === g.id ? null : (g.id as GeometryId)));
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </>
            )}
          </>
        )}

        {(loading || busy) && <Loader2 className="gmap__spin" size={15} aria-label="Working" />}
      </div>

      {/* ── the legend ───────────────────────────────────────────────────────────────────────── */}
      {legend.length > 0 && (
        <div className="gmap__legend" data-testid="gmap-legend">
          {legend.map((t) => {
            const off = hiddenTypes.includes(t.id);
            return (
              <button key={t.id} className={`gmap__chip${off ? ' gmap__chip--off' : ''}`} type="button" aria-pressed={!off} title={t.hint} data-testid={`gmap-legend-${t.id}`} style={{ '--swatch': `var(${t.token})` } as React.CSSProperties} onClick={() => setHiddenTypes((cur) => (off ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}>
                <span className="gmap__chip-swatch" aria-hidden />{t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── layers ───────────────────────────────────────────────────────────────────────────── */}
      {workMode && layersOpen && (
        <div className="pmap__layers" data-testid="pmap-layers">
          <div className="pmap__layers-head">
            <span className="pmap__layers-title"><Layers size={13} aria-hidden /> Layers</span>
            {editing && <button className="pmap__btn pmap__btn--small" type="button" data-testid="pmap-layer-add" onClick={() => void addLayer()}><Plus size={12} aria-hidden /> New layer</button>}
          </div>
          <ul className="pmap__layer-list">
            {layers.map((l) => {
              const count = layerCounts.get(l.id) ?? 0;
              return (
                <li
                  key={l.id}
                  className={`pmap__layer${l.isVisible ? '' : ' pmap__layer--off'}${hoverLayer === l.id ? ' pmap__layer--lit' : ''}`}
                  data-testid={`pmap-layer-${l.id}`}
                  onMouseEnter={() => setHoverLayer(l.id)}
                  onMouseLeave={() => setHoverLayer((cur) => (cur === l.id ? null : cur))}
                >
                  <button className="pmap__layer-eye" type="button" aria-pressed={l.isVisible} title={l.isVisible ? `Hide ${l.name}` : `Show ${l.name}`} aria-label={l.isVisible ? `Hide the layer ${l.name}` : `Show the layer ${l.name}`} data-testid={`pmap-layer-eye-${l.id}`} onClick={() => void toggleLayer(l.id, !l.isVisible)}>
                    {l.isVisible ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
                  </button>

                  {/* The swatch IS the colour control: a separate "edit colour" button would be a
                      fourth thing on a row that already has four. Its own colour when it has one,
                      a split marker when it is still colouring by point type. */}
                  <button
                    className={`gmap__swatch${l.colour ? '' : ' gmap__swatch--bytype'}`}
                    type="button"
                    disabled={!editing}
                    style={l.colour ? ({ '--c': l.colour } as React.CSSProperties) : undefined}
                    aria-label={`Colour for the layer ${l.name}`}
                    title={l.colour ? `${l.name} is ${l.colour}` : `${l.name} is coloured by point type`}
                    data-testid={`gmap-layer-colour-${l.id}`}
                    onClick={() => setColourFor((cur) => (cur === l.id ? null : l.id))}
                  />
                  {colourFor === l.id && editing && (
                    <div className="gmap__palette" role="listbox" aria-label={`Colour ${l.name}`} data-testid={`gmap-palette-${l.id}`}>
                      {LAYER_COLOURS.map((c) => (
                        <button
                          key={c.id}
                          className={`gmap__palette-dot${!c.hex ? ' gmap__palette-dot--bytype' : ''}${(l.colour ?? '') === c.hex ? ' gmap__palette-dot--on' : ''}`}
                          type="button"
                          role="option"
                          aria-selected={(l.colour ?? '') === c.hex}
                          title={c.label}
                          aria-label={c.label}
                          style={c.hex ? ({ '--c': c.hex } as React.CSSProperties) : undefined}
                          data-testid={`gmap-palette-${l.id}-${c.id}`}
                          onClick={() => { void recolourLayer(l.id, c.hex || null); setColourFor(null); }}
                        />
                      ))}
                    </div>
                  )}
                  <InlineRename name={l.name} onRename={(next) => renameLayer(l.id, next)} canRename={editing} preserveExtension={false} className="pmap__layer-namerow" inputClassName="pmap__layer-rename" buttonClassName="pmap__file-pencil" testId={`pmap-layer-name-${l.id}`}>
                    <span className="pmap__layer-name">{l.name}{l.isDefault && <span className="pmap__layer-badge" title="Every point lands here unless you move it">default</span>}</span>
                  </InlineRename>
                  <span className="pmap__layer-count" data-testid={`pmap-layer-count-${l.id}`}>{count} {count === 1 ? 'point' : 'points'}</span>
                  {editing && !l.isDefault && (
                    confirmLayer === l.id ? (
                      <span className="pmap__layer-confirm" role="group" data-testid={`pmap-layer-confirm-${l.id}`}>
                        <span className="pmap__layer-confirm-ask">{count > 0 ? `Delete it? Its ${count} ${count === 1 ? 'point moves' : 'points move'} to ${defaultLayer?.name ?? 'the default layer'}.` : 'Delete this layer?'}</span>
                        <button className="pmap__btn pmap__btn--danger pmap__btn--small" type="button" data-testid={`pmap-layer-delete-yes-${l.id}`} onClick={() => void deleteLayer(l.id)}>Delete</button>
                        <button className="pmap__btn pmap__btn--small" type="button" data-testid={`pmap-layer-delete-no-${l.id}`} onClick={() => setConfirmLayer(null)}>Keep</button>
                      </span>
                    ) : (
                      <button className="pmap__layer-del" type="button" title={`Delete ${l.name}`} aria-label={`Delete the layer ${l.name}`} data-testid={`pmap-layer-delete-${l.id}`} onClick={() => setConfirmLayer(l.id)}><Trash2 size={12} aria-hidden /></button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
          {!editing && <p className="pmap__layers-hint">Turn on <strong>Edit map</strong> to add, rename or delete layers.</p>}
        </div>
      )}

      <div className="gmap__body">
        {/* ── files ──────────────────────────────────────────────────────────────────────────── */}
        {workMode && filesOpen && (
          <aside className="gmap__files" aria-label="Job files" data-testid="gmap-files">
            <div className="gmap__files-head">
              <strong>{library.length} {library.length === 1 ? 'file' : 'files'}</strong>
              <span>{unplacedCount} unplaced</span>
              <button className="gmap__icon-btn" type="button" aria-label="Close the files panel" onClick={() => setFilesOpen(false)}><X size={15} aria-hidden /></button>
            </div>
            <input className="gmap__files-search" type="search" placeholder="Search files by name…" aria-label="Search the job's files" value={fileSearch} onChange={(e) => setFileSearch(e.target.value)} data-testid="gmap-file-search" />
            <div className="gmap__files-filters">
              {(['all', 'image', 'video', 'audio', 'document'] as const).map((k) => (
                <button key={k} className={`gmap__chip${kindFilter === k ? '' : ' gmap__chip--off'}`} type="button" aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)} data-testid={`gmap-kind-${k}`}>
                  {k === 'all' ? 'All' : KIND_ONE[k]}
                </button>
              ))}
              <label className="gmap__files-unplaced">
                <input type="checkbox" checked={unplacedOnly} onChange={(e) => setUnplacedOnly(e.target.checked)} data-testid="gmap-unplaced-only" />
                Unplaced only
              </label>
            </div>
            {editing && (
              <p className="gmap__files-hint">
                {armedFileId ? 'Now click the point it belongs to.' : 'Drag a file onto a point, or press Assign then click a point.'}
              </p>
            )}
            <div className="gmap__files-grid">
              {visibleFiles.length === 0 && <p className="gmap__files-empty">No files match.</p>}
              {visibleFiles.map((f) => (
                <FileTile
                  key={f.id}
                  file={f}
                  editing={editing}
                  armed={armedFileId === f.id}
                  dragging={false}
                  placing={false}
                  flashing={false}
                  confirming={confirmUnassign === f.id}
                  onArm={() => setArmedFileId((cur) => (cur === f.id ? null : f.id))}
                  onDragStart={(e) => {
                    if (!editing) { e.preventDefault(); return; }
                    e.dataTransfer.setData(FILE_DRAG_TYPE, f.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onDragEnd={() => {}}
                  onOpen={() => { if (f.url) setViewerOn({ source: 'library', fileId: f.id }); }}
                  onShowPoint={() => {
                    const first = [...f.assignedTo].sort((a, b) => a.ordinal - b.ordinal)[0];
                    if (first) setSelectedId(first.pointId);
                  }}
                  onAskUnassign={() => setConfirmUnassign(f.id)}
                  onCancelUnassign={() => setConfirmUnassign(null)}
                  onUnassign={(at) => void unassignFile(f, at)}
                  onThumbError={() => { if (job) void loadLibrary(job.jobId, mapId); }}
                  onRename={(next) => renameFile(f.id, next)}
                />
              ))}
            </div>
          </aside>
        )}

        {/* ── the map ────────────────────────────────────────────────────────────────────────── */}
        <div className={`gmap__canvas${placing ? ' gmap__canvas--placing' : ''}${drawKind ? ' gmap__canvas--drawing' : ''}${armedFileId ? ' gmap__canvas--assigning' : ''}`}>
          <LoadScript googleMapsApiKey={apiKey} libraries={LIBRARIES} loadingElement={<div className="gmap__loading">Loading the map…</div>}>
            <GoogleMap
              mapContainerStyle={CONTAINER}
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              options={MAP_OPTIONS}
              onLoad={(m) => setMap(m)}
              onUnmount={() => setMap(null)}
              onIdle={onIdle}
              onClick={onMapClick}
            />
          </LoadScript>

          {hint && !workMode && <div className="gmap__hint" role="status" data-testid="gmap-zoom-hint"><ZoomIn size={14} aria-hidden /> {hint}</div>}
          {capped && !hint && !workMode && <div className="gmap__hint gmap__hint--warn" role="status" data-testid="gmap-capped">Showing the first points in view — zoom in to see them all.</div>}
          {placing && <div className="gmap__hint gmap__hint--go" role="status" data-testid="gmap-placing">Click where the point goes. Escape to stop.</div>}

          {/* Drawing: what to do next, what it measures so far, and the way to keep it. Interactive
              rather than a plain hint, so the Finish button is where the eye already is. */}
          {drawKind && (
            <div className="gmap__draw" role="status" data-testid="gmap-drawing">
              {!draw ? (
                <span>Click where the {drawKind === 'fov' ? 'camera stood' : drawKind === 'path' ? 'path starts' : 'area starts'}.</span>
              ) : (
                <>
                  <span>
                    {draw.geometry === 'fov'
                      ? (draw.feet === FOV_DEFAULT_FEET && draw.bearing === 0 ? 'Now click where it was pointing.' : compass(draw.bearing))
                      : (needsMore(draw.geometry, draw.vertices.length) ?? measureShape(draw.geometry, draw.anchor, draw.vertices)?.label ?? '')}
                  </span>
                  {draw.geometry === 'fov' && (
                    <label className="gmap__draw-spread">
                      Spread
                      <input
                        type="range" min={10} max={180} step={5}
                        value={draw.spreadDeg}
                        aria-label="How wide the camera cone is, in degrees"
                        data-testid="gmap-draw-spread"
                        onChange={(e) => setDraw((cur) => (cur ? { ...cur, spreadDeg: Number(e.target.value) } : cur))}
                      />
                      {draw.spreadDeg}°
                    </label>
                  )}
                  <button className="gmap__btn gmap__btn--primary" type="button" disabled={!isDrawable(draw.geometry, draw.vertices.length)} data-testid="gmap-draw-finish" onClick={() => void finishDraw()}>
                    Keep it
                  </button>
                </>
              )}
              <button className="gmap__btn" type="button" data-testid="gmap-draw-cancel" onClick={() => { setDraw(null); setDrawKind(null); }}>
                Cancel
              </button>
            </div>
          )}
          {armedFileId && <div className="gmap__hint gmap__hint--go" role="status" data-testid="gmap-armed">Click the point this file belongs on. Escape to stop.</div>}
        </div>

        {/* ── one point ──────────────────────────────────────────────────────────────────────── */}
        {workMode && selected && (
          <aside className="gmap__panel gmap__panel--docked" aria-label="Point details" data-testid="gmap-point">
            <div className="gmap__panel-head">
              <div>
                <InlineRename
                  name={selected.title}
                  onRename={async (next) => { const r = await patchPoint(selected.id, { title: next }, 'Point renamed.'); if (!r) throw new Error('rename failed'); }}
                  canRename={editing}
                  preserveExtension={false}
                  className="pmap__titlerow"
                  inputClassName="pmap__detail-rename"
                  buttonClassName="pmap__file-pencil"
                  testId="gmap-point-name"
                >
                  <h2 className="gmap__panel-title">{pointLabel(selected)}</h2>
                </InlineRename>
                <p className="gmap__panel-sub">{pointType(selected.pointType).label} · {mediaSummary(selected.media)}</p>
              </div>
              <button className="gmap__icon-btn" type="button" aria-label="Close point details" data-testid="gmap-point-close" onClick={() => setSelectedId(null)}><X size={16} aria-hidden /></button>
            </div>

            {editing && (
              <>
                <label className="gmap__label" htmlFor="gmap-notes">Notes</label>
                <textarea id="gmap-notes" className="gmap__textarea" rows={3} value={draft?.notes ?? ''} data-testid="gmap-notes" onChange={(e) => setDraft((d) => ({ title: d?.title ?? selected.title, notes: e.target.value }))} />

                <div className="gmap__fields">
                  <label className="gmap__label" htmlFor="gmap-type">Type</label>
                  <select id="gmap-type" className="gmap__select" value={selected.pointType} data-testid="gmap-type" onChange={(e) => void patchPoint(selected.id, { point_type: e.target.value as PointTypeId }, 'Type changed.')}>
                    {POINT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>

                  <label className="gmap__label" htmlFor="gmap-status">Status</label>
                  <select id="gmap-status" className="gmap__select" value={selected.status} data-testid="gmap-status" onChange={(e) => void patchPoint(selected.id, { status: e.target.value as PointStatus }, 'Status changed.')}>
                    {POINT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>

                  <label className="gmap__label" htmlFor="gmap-layer">Layer</label>
                  <select id="gmap-layer" className="gmap__select" value={layerOf(selected, layers)?.id ?? ''} data-testid="gmap-layer-select" onChange={(e) => void patchPoint(selected.id, { layer_id: e.target.value || null }, 'Point moved.')}>
                    {layers.map((l) => <option key={l.id} value={l.id}>{l.name}{l.isVisible ? '' : ' (hidden)'}</option>)}
                  </select>
                </div>

                <div className="gmap__panel-acts">
                  <button className="gmap__btn gmap__btn--primary" type="button" disabled={!draft?.title.trim()} data-testid="gmap-save" onClick={() => void patchPoint(selected.id, { title: draft?.title, notes: draft?.notes }, 'Point saved.')}>Save</button>
                  {confirmPoint === selected.id ? (
                    <>
                      <button className="gmap__btn gmap__btn--danger" type="button" data-testid="gmap-delete-yes" onClick={() => void deletePoint(selected.id)}>Really delete</button>
                      <button className="gmap__btn" type="button" onClick={() => setConfirmPoint(null)}>Keep</button>
                    </>
                  ) : (
                    <button className="gmap__btn gmap__btn--danger" type="button" data-testid="gmap-delete" onClick={() => setConfirmPoint(selected.id)}><Trash2 size={13} aria-hidden /> Delete</button>
                  )}
                </div>
              </>
            )}

            {!editing && selected.notes && <p className="gmap__notes">{selected.notes}</p>}

            <p className="gmap__where">
              <button
                className="gmap__where-go"
                type="button"
                title="Centre the map on this point"
                data-testid="gmap-centre-point"
                onClick={() => flyTo({ lat: selected.lat as number, lng: selected.lng as number }, Math.max(zoom, JOB_ZOOM))}
              >
                <MapPin size={11} aria-hidden /> {Number(selected.lat).toFixed(6)}, {Number(selected.lng).toFixed(6)}
              </button>
              <a href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`} target="_blank" rel="noopener noreferrer" title="Open in Google Maps">
                Open ↗
              </a>
            </p>

            {selected.media.length > 0 && (
              <div className="gmap__media">
                {sortMedia(selected.media).map((m: PointMedia) => (
                  <MediaTile
                    key={m.id}
                    media={m}
                    editing={editing}
                    confirming={confirmMedia === m.id}
                    onOpen={() => { if (m.url) setViewerOn({ source: 'point', fileId: m.id }); }}
                    onAskDetach={() => setConfirmMedia(m.id)}
                    onCancelDetach={() => setConfirmMedia(null)}
                    onDetach={() => void detachMedia(selected.id, m.id)}
                    onRename={(next) => renameFile(m.jobFileId, next)}
                  />
                ))}
              </div>
            )}
          </aside>
        )}

        {/* ── one point, browsing ────────────────────────────────────────────────────────────── */}
        {!workMode && browsePick && (
          <aside className="gmap__panel" aria-label="Point details" data-testid="gmap-browse-point">
            <div className="gmap__panel-head">
              <div>
                <h2 className="gmap__panel-title">{browsePick.ordinal}. {browsePick.title}</h2>
                <p className="gmap__panel-sub">{pointType(browsePick.pointType).label}{browsePick.mediaCount > 0 && ` · ${browsePick.mediaCount} file${browsePick.mediaCount === 1 ? '' : 's'}`}</p>
              </div>
              <button className="gmap__icon-btn" type="button" aria-label="Close point details" data-testid="gmap-browse-close" onClick={() => setBrowsePick(null)}><X size={16} aria-hidden /></button>
            </div>
            <dl className="gmap__facts">
              <dt>Job</dt>
              <dd><Link href={`/admin/jobs/${browsePick.jobId}`}>{browsePick.jobNumber ?? 'Job'}{browsePick.jobName ? ` · ${browsePick.jobName}` : ''}</Link></dd>
              <dt>Where</dt>
              <dd>
                <button className="gmap__where-go" type="button" title="Centre the map on this point" data-testid="gmap-centre-browse" onClick={() => flyTo({ lat: browsePick.lat, lng: browsePick.lng }, Math.max(zoom, JOB_ZOOM))}>
                  {browsePick.lat.toFixed(6)}, {browsePick.lng.toFixed(6)}
                </button>
              </dd>
            </dl>
            <a className="gmap__btn gmap__btn--primary" href={`/admin/map?job=${browsePick.jobId}`} data-testid="gmap-open-job">
              <Folder size={13} aria-hidden /> Open this job&apos;s map
            </a>
          </aside>
        )}
      </div>

      {viewerCollection && viewerFileId && (
        <SharedFileViewer
          collection={viewerCollection}
          fileId={viewerFileId}
          onClose={() => setViewerOn(null)}
          onCurrentChange={(fileId) => setViewerOn((cur) => (cur && cur.fileId !== fileId ? { ...cur, fileId } : cur))}
          capabilities={editing ? viewerCapabilities : undefined}
        />
      )}
    </div>
  );
}
