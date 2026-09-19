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
  Plus, Search, Tag, Target, Trash2, Upload, X, ZoomIn,
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
  pinHighlight, layerRowLit, roundLatLng,
  DEFAULT_CENTER, DEFAULT_ZOOM, JOB_ZOOM, clusterByJob, matchesJobSearch,
  type Bounds, type LatLng,
} from '@/lib/jobs/map-world';
import { POINT_GEOMETRIES, type GeometryId } from '@/lib/jobs/property-map-shapes';
import {
  shapePath, isDrawable, needsMore, measureShape, aimFrom, compass, translateShape, FOV_DEFAULT_FEET,
} from '@/lib/jobs/map-shapes-world';
import { uploadJobFileBytes } from '@/lib/jobs/upload-client';
import type { LibraryFile } from '@/lib/jobs/property-map-server';
import type { ViewerCapabilities, ViewerCollection, ViewerFile } from '@/lib/files/viewer-model';
import MapFrame from './components/MapFrame';
import { FileTile, MediaTile } from './components/Tiles';
import { KIND_ONE, sortLibrary } from './components/kinds';
import {
  THUMB_WORKERS, THUMB_TIMEOUT_MS, isPdfFile, pdfThumb, videoThumb, imageThumb, withDeadline,
  needsThumb, type ThumbJob, type ThumbState,
} from './components/thumbnails';
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
  /** The name shown beside the pin. Null for a cluster, which has several. */
  label: HTMLSpanElement | null;
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

/** The job's property as one line a geocoder will accept.
 *
 *  `'TX'` is appended because every one of these is a Texas parcel and a bare street and town is
 *  ambiguous nationally — "Main St, Florence" is a real place in four states. The country is pinned
 *  separately, at the call. Empty when the job has no address at all, which is the caller's signal
 *  that there is nothing to look up rather than a query that will match something arbitrary. */
function addressLine(j: Pick<JobPlace, 'address' | 'city' | 'county'>): string {
  if (!j.address && !j.city) return '';
  return [j.address, j.city, j.county, 'TX'].filter(Boolean).join(', ');
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
  /** Google refused. The panels carry on; only the camera is gone. */
  const [mapDead, setMapDead] = useState(false);
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
  /** The file currently being dragged, so the pins can widen their targets for it. */
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  /** Something is hovering the panel's drop box. */
  const [dropOver, setDropOver] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState<string | null>(null);
  const [confirmMedia, setConfirmMedia] = useState<string | null>(null);
  const [confirmPoint, setConfirmPoint] = useState<string | null>(null);
  const [confirmLayer, setConfirmLayer] = useState<string | null>(null);
  // ── TWO HOVERS, NOT ONE ───────────────────────────────────────────────────────────────────────
  //
  // Owner, 2026-09-19: "whenever I hover over one point, all of the points on that layer light up.
  // I just want the one point that I am hovering over to light up. If I hover over the layer in the
  // layer list, then all of the points and elements in that layer should light up."
  //
  // These were one piece of state, and that was the bug: a pin's mouseenter set the LAYER hover, so
  // pointing at one pin lit every pin on its sheet. They are two different questions —
  //
  //   hovering a LAYER ROW asks "what is on this sheet?"   → light all of it, dim the rest
  //   hovering a PIN asks "what is this one?"              → light that pin, and nothing else
  //
  // The pin still lights its layer's ROW, because "which sheet is this on" is worth answering and
  // costs nothing. What it must not do is act as though the row itself were hovered.
  const [hoverLayer, setHoverLayer] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<string | null>(null);
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
  /** What is typed in the map's search box, used to filter the jobs on it (owner, 2026-09-19).
   *
   *  The same box still geocodes an address on Enter. One box doing both is the owner's choice and
   *  it works because the two never collide: filtering happens as you type and costs nothing, and
   *  the lookup only happens when you ask for it. Text that matches no job simply empties the map
   *  until you press Enter, which is the honest answer to "no job is called that". */
  const [jobSearch, setJobSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<MediaKind | 'all'>('all');
  const [unplacedOnly, setUnplacedOnly] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<PointTypeId[]>([]);
  /** Names beside the pins — and since 2026-09-19 the ONLY thing that identifies a point on the map.
   *  Owner: "I want to get rid of point numbers altogether and just have names for the points." Still
   *  a toggle, because a dense corner of a parcel is sometimes easier to read as bare dots. */
  const [showLabels, setShowLabels] = useState(true);
  const [viewerOn, setViewerOn] = useState<{ source: 'library' | 'point'; fileId: string } | null>(null);

  const jobPickRef = useRef<HTMLDivElement | null>(null);
  /** The backstop timer behind `tilesloaded`, so a map that never paints still loads points. */
  const tilesWaitRef = useRef<number | null>(null);
  /** The job already loaded, so arriving does not fetch it once per render. */
  const loadedJobRef = useRef<string | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  /** The current points, for handlers attached once and never rebuilt. */
  const pointsRef = useRef<MapPoint[]>([]);
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
   * Arriving from a job: load it, and open for work.
   *
   * Deliberately NOT gated on the map object. It used to be — the effect needed `map` in order to
   * fly there, so it waited for it — and that made the entire work mode, the files panel and the
   * layers included, depend on Google having initialised. When Google refuses (a referrer it does
   * not like, a blocked script, an offline moment) the page fell all the way back to "Pick a job"
   * and nothing on it worked, for reasons that had nothing to do with where the camera was
   * pointing.
   *
   * Loading a job and pointing a camera at it are two things. This is the first.
   *
   * Guarded to run once per job: the effect's other dependencies are callbacks that change when the
   * library reloads, and without the guard arriving re-fetched everything several times.
   */
  useEffect(() => {
    if (!jobParam) {
      setJob(null); setPayload(null); setLibrary([]);
      loadedJobRef.current = null;
      return;
    }
    if (loadedJobRef.current === jobParam) return;
    loadedJobRef.current = jobParam;
    void (async () => {
      const data = await safeFetch<{ job: JobPlace }>(`/api/admin/map/job/${jobParam}`);
      // `alive` is checked, but the job is set REGARDLESS of it. The fetch is idempotent and the
      // answer is still correct; throwing it away because the effect was torn down is what left
      // this page stuck on "Pick a job" with a 200 in the network panel — the effect re-ran (its
      // dependencies are callbacks that change identity), the first run's cleanup fired, and the
      // response that had already arrived was discarded on arrival.
      if (!data?.job) { loadedJobRef.current = null; return; }
      setJob(data.job);
      setFilesOpen(true);
      const m = await loadJobMap(jobParam);

      // ── THE MAP FIRST, THE FILES A MOMENT LATER ─────────────────────────────────────────────
      // The library is every file on the job, each with a signed URL and a thumbnail the browser
      // then decodes. Awaiting it here held everything else behind a response that has nothing to
      // do with where the map should be pointing, and its thumbnails then competed with the tiles
      // for the same main thread.
      const whenFree = window.requestIdleCallback
        ? (fn: () => void) => window.requestIdleCallback(fn, { timeout: 1500 })
        : (fn: () => void) => window.setTimeout(fn, 250);
      whenFree(() => { void loadLibrary(jobParam, m?.map?.id ?? data.job.mapId ?? null); });

      // Only when there is genuinely nothing to go on. A job with an address and no coordinates is
      // no longer stuck — the camera geocodes the address — so telling somebody it "has no location
      // yet" while the map flies to its location would be a lie they watch being contradicted.
      if (data.job.lat === null && !addressLine(data.job)) {
        addToast(`${data.job.jobNumber ?? 'That job'} has no location yet. Add one on the job page, or search its address here.`, 'info', 4600);
      }
    })();
    // Only the job id. The helpers are callbacks whose identity changes whenever the library
    // reloads, and depending on them made this effect re-run — and cancel itself — mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobParam]);

  /**
   * And this is the second: point the camera, once both the map and the job are ready.
   *
   * Separate from the load so that a map which never initialises cannot stop a job from opening —
   * and so that arriving before Google is ready still flies, the moment it is.
   */
  const flownToRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !job || !jobParam) return;
    if (flownToRef.current === jobParam) return;
    flownToRef.current = jobParam;

    // The camera moves are inline rather than through `flyTo`, which is declared further down with
    // the other actions. Hoisting this effect above it would put arriving-at-a-job in the middle of
    // the mutation helpers, which is not where anybody would look for it.
    const go = (at: LatLng) => {
      if (typeof map.moveCamera === 'function') map.moveCamera({ center: at, zoom: JOB_ZOOM });
      else { map.setCenter(at); map.setZoom(JOB_ZOOM); }
    };

    // Frame the points if there are any — the property, not the mailing address.
    const placed = points.filter((p) => isLatLng({ lat: p.lat as number, lng: p.lng as number }));
    const b = placed.length
      ? boundsOf(placed.map((p) => ({ lat: p.lat as number, lng: p.lng as number })))
      : null;
    if (b) {
      map.fitBounds(new google.maps.LatLngBounds({ lat: b.south, lng: b.west }, { lat: b.north, lng: b.east }), 80);
      return;
    }
    if (job.lat !== null && job.lng !== null) { go({ lat: job.lat, lng: job.lng }); return; }

    // ── AN ADDRESS IS A LOCATION TOO (owner, 2026-09-19) ────────────────────────────────────────
    //
    // "If I refresh the interactive map page it should still have the property address loaded in
    // and be zoomed in on it."
    //
    // It did not, and the reason was narrower than it looked: the camera only ever moved for a job
    // that had STORED coordinates. `jobs.latitude`/`longitude` are filled in by the Property panel's
    // address lookup — but only when somebody picks a suggestion from Google and saves. A job whose
    // address was typed by hand, or entered before that panel existed, has a perfectly good address
    // and no coordinates, so the map opened over the office and stayed there on every refresh.
    //
    // So the address itself is the last resort: geocode it and go. One round trip, once per arrival,
    // and only for the jobs that have no coordinates to use instead.
    //
    // Deliberately NOT written back to the job. A geocode is Google's best guess at a mailing
    // address, `jobs.latitude` is a surveyed fact somebody entered on purpose, and quietly promoting
    // the first to the second during a page load is how a guess becomes a record nobody remembers
    // making. The Property panel's lookup does the same geocode with a person looking at the result.
    const line = addressLine(job);
    if (!line || typeof google === 'undefined' || !google.maps?.Geocoder) return;
    let live = true;
    void (async () => {
      try {
        const res = await new google.maps.Geocoder().geocode({ address: line, componentRestrictions: { country: 'us' } });
        const at = res.results?.[0]?.geometry?.location;
        // `live` matters here in a way it does not for the job fetch: this one MOVES THE CAMERA.
        // Arriving late, after somebody has already panned somewhere else or opened another job,
        // it would yank the view out from under them.
        if (!live || !at) return;
        go({ lat: at.lat(), lng: at.lng() });
      } catch {
        // Google could not place it. The job opens where it is; the address is in the search box for
        // anybody who wants to try it by hand, and a toast about it would be the third one on load.
      }
    })();
    return () => { live = false; };
  }, [map, job, jobParam, points]);

  /**
   * The address, in the search box, on arrival.
   *
   * The other half of the same report: "it should still have the property address loaded in". The
   * box is where this page says WHERE IT IS, and after a refresh it said nothing at all.
   *
   * Written through the ref rather than held in state because the Places autocomplete widget owns
   * this input — it writes the chosen suggestion into it directly — and a controlled value fights
   * that. Only ever filled when it is empty, so a refresh cannot wipe something half-typed.
   */
  useEffect(() => {
    const box = searchRef.current;
    if (!box || !job) return;
    if (box.value.trim()) return;
    const line = [job.address, job.city].filter(Boolean).join(', ');
    if (line) box.value = line;
  }, [job]);

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

  /**
   * Put a point somewhere else.
   *
   * Owner, 2026-09-19: "I need to be able to grab existing points and move them around."
   *
   * The whole shape goes with it. A path's or an area's vertices are absolute positions, not
   * offsets, so moving only the anchor would leave the path where it was with its first corner torn
   * off — grabbing a thing and moving it has to move the thing. A cone needs nothing extra: its
   * bearing and reach are relative to the anchor already.
   *
   * Google has already drawn the marker in its new place by the time `dragend` fires, so there is
   * nothing to paint optimistically. What matters is the other direction: if the save fails the pin
   * is sitting somewhere the database has never heard of, so the map is reloaded to put it back.
   */
  const movePoint = useCallback(async (pointId: string, to: LatLng) => {
    if (!job || !mapId) return;
    const point = pointsRef.current.find((p) => p.id === pointId);
    if (!point) return;

    const from = { lat: point.lat as number, lng: point.lng as number };
    const at = roundLatLng(to);
    const body: Record<string, unknown> = { map_id: mapId, point_id: pointId, lat: at.lat, lng: at.lng };
    if (point.vertices.length && isLatLng(from)) {
      body.vertices = translateShape(from, at, point.vertices);
    }

    const res = await mutate('move the point', `/api/admin/jobs/${job.jobId}/property-map/points`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res) {
      // The pin is where the hand left it and the database disagrees. Re-reading is the only honest
      // way to put it back where it actually is.
      addToast('That point could not be moved — putting it back.', 'error');
      void loadJobMap(job.jobId);
    }
  }, [job, mapId, mutate, addToast, loadJobMap]);

  /**
   * Reshape: the corners of a path or an area, after somebody dragged one.
   *
   * Owner, 2026-09-19: "I also need to be able to edit the nodes of the walked path by grabbing them
   * and moving them."
   *
   * Google's own `editable` does the grabbing — it draws a handle on every corner and a ghost handle
   * at every midpoint, and dragging a ghost inserts a corner there. That is worth using rather than
   * reimplementing: it is the gesture people already know from Google Maps, it handles the hit areas
   * and the cursors, and it is one property instead of a second set of markers to keep in step with
   * the first.
   *
   * What it does NOT do is tell anybody. So this is the other half: read the whole path back and
   * save it. `shapePath` lays a path out as `[anchor, ...vertices]`, so corner zero is the point's
   * own position and the rest are its vertices — which is exactly the shape the PATCH already takes,
   * the same one a drag of the pin itself sends.
   *
   * A path needs two corners and an area needs three. Google will happily let you drag the second
   * corner of a triangle on top of the first; refusing to SAVE that is better than silently keeping
   * a shape with no length, and re-reading puts the corner back where it was.
   */
  const reshapePoint = useCallback(async (pointId: string, corners: LatLng[]) => {
    if (!job || !mapId) return;
    const point = pointsRef.current.find((p) => p.id === pointId);
    if (!point) return;

    const clean = corners.filter(isLatLng).map(roundLatLng);
    const least = point.geometry === 'area' ? 3 : 2;
    if (clean.length < least) {
      addToast(`A ${point.geometry === 'area' ? 'boundary' : 'path'} needs at least ${least} corners.`, 'info', 2600);
      void loadJobMap(job.jobId);
      return;
    }

    const [anchor, ...rest] = clean as [LatLng, ...LatLng[]];
    const res = await mutate('reshape that', `/api/admin/jobs/${job.jobId}/property-map/points`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: mapId, point_id: pointId, lat: anchor.lat, lng: anchor.lng, vertices: rest }),
    });
    if (!res) {
      // Same reasoning as a failed move: the shape on screen is one Google drew and the database has
      // never heard of. Re-reading is the only honest way to put it back.
      addToast('That shape could not be saved — putting it back.', 'error');
      void loadJobMap(job.jobId);
    }
  }, [job, mapId, mutate, addToast, loadJobMap]);

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

  /**
   * Put files on the open point — from the panel beside the map, or straight off the desktop.
   *
   * Owner, 2026-09-19: "Please make it so that dropping and image or file onto a point is more
   * direct and easier. Please make sure we have a drop box still in the point info panel so that we
   * can drop files and things directly into it."
   *
   * A 26px pin is a poor target, and it is the wrong one anyway once the point is already open: at
   * that moment the thing on screen that MEANS this point is the panel, not the dot. So the panel
   * takes drops too, and the pin stays as the way to put a file on a point you have not opened.
   *
   * Two kinds of drop, one landing place. A file dragged from the library is already on the job and
   * only needs attaching. A file dragged from a folder on the desktop has to be uploaded first —
   * which is the case that used to mean opening another screen, uploading, coming back, and
   * hunting for it in the panel.
   */
  const dropOnPoint = useCallback(async (pointId: string, e: React.DragEvent) => {
    if (!job) return;
    setDropOver(false);

    const existing = e.dataTransfer.getData(FILE_DRAG_TYPE);
    if (existing) { await assignFile(pointId, existing); return; }

    const files = Array.from(e.dataTransfer.files ?? []);
    if (!files.length) return;
    const id = await ensureMap();
    if (!id) { addToast('Could not start a map for this job.', 'error'); return; }

    setBusy(true);
    let added = 0;
    for (const file of files) {
      try {
        const up = await uploadJobFileBytes(job.jobId, file);
        const fileId = (up as { id?: string; file?: { id?: string } }).id
          ?? (up as { file?: { id?: string } }).file?.id;
        if (!fileId) throw new Error('the upload did not come back with a file');
        const res = await fetch(`/api/admin/jobs/${job.jobId}/property-map/media`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ point_id: pointId, job_file_id: fileId }),
        });
        if (res.ok) { setPayload((await res.json()) as MapPayload); added++; }
      } catch (err) {
        reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'drop a file onto a map point' });
        addToast(`${file.name} could not be added.`, 'error');
      }
    }
    setBusy(false);
    if (added) {
      addToast(added === 1 ? 'Added to the point.' : `${added} files added to the point.`, 'success', 1800);
      void loadLibrary(job.jobId, id);
    }
  }, [job, assignFile, ensureMap, addToast, reportPageError, loadLibrary]);

  const detachMedia = useCallback(async (pointId: string, mediaId: string) => {
    if (!job) return;
    setConfirmMedia(null);
    await mutate('detach that file', `/api/admin/jobs/${job.jobId}/property-map/media?point_id=${encodeURIComponent(pointId)}&media_id=${encodeURIComponent(mediaId)}`, { method: 'DELETE' }, 'Detached.');
    void loadLibrary(job.jobId, mapId);
  }, [job, mapId, mutate, loadLibrary]);

  const unassignFile = useCallback(async (file: LibraryFile, at: LibraryFile['assignedTo'][number]) => {
    if (!job) return;
    setConfirmUnassign(null);
    await mutate('unassign that file', `/api/admin/jobs/${job.jobId}/property-map/media?point_id=${encodeURIComponent(at.pointId)}&media_id=${encodeURIComponent(at.mediaId)}`, { method: 'DELETE' }, at.title ? `Taken off ${at.title}.` : 'Unassigned.');
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
          jobId: job?.jobId ?? '', jobName: job?.name ?? null,
        }));
    }
    return world
      .filter((p) => !hiddenTypes.includes(p.pointType))
      // ── THE SEARCH IS A FILTER (owner, 2026-09-19) ────────────────────────────────────────────
      // "If a job does not match our string, then its representitive point would disappear."
      //
      // Applied HERE, before clustering, so it holds at every zoom: a hidden job is hidden whether
      // you are looking at the county or standing on the parcel. Filtering the clusters instead
      // would have made the map quietly repopulate as you zoomed in, which is the behaviour of a
      // highlight, not of a filter.
      .filter((p) => matchesJobSearch(p, jobSearch))
      .map((p) => ({
        id: p.id, lat: p.lat, lng: p.lng, ordinal: p.ordinal, title: p.title,
        pointType: p.pointType, mediaCount: p.mediaCount, jobNumber: p.jobNumber,
        colour: swatch(p.pointType), layerId: p.layerId,
        jobId: p.jobId, jobName: p.jobName,
      }));
  }, [workMode, points, world, hiddenTypes, hiddenLayers, layers, job, jobSearch]);

  useEffect(() => { pointsRef.current = points; }, [points]);

  // Inside a job, geography is the only useful grouping — every point already belongs to the job
  // you are looking at. Across jobs it is the wrong one: see `clusterByJob`.
  const clusters = useMemo(
    () => (workMode ? clusterPoints(drawable, zoom) : clusterByJob(drawable, zoom)),
    [drawable, zoom, workMode],
  );

  /** The sheet the pin under the cursor sits on, so its row lights without the sheet lighting. */
  const hoveredPointLayer = useMemo(() => {
    if (!hoverPoint) return null;
    const p = points.find((x) => x.id === hoverPoint);
    return p ? layerOf(p, layers)?.id ?? null : null;
  }, [hoverPoint, points, layers]);

  /** A drawable carries its layer already; a MapPoint has to be resolved through `layerOf`. */
  const layerIdOf = useCallback((p: { layerId: string | null }) => layerOf(p, layers)?.id ?? null, [layers]);

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
  const movePointRef = useRef(movePoint);
  const editingRef = useRef(editing);
  const reshapeRef = useRef(reshapePoint);
  useEffect(() => { workModeRef.current = workMode; }, [workMode]);
  useEffect(() => { assignFileRef.current = assignFile; }, [assignFile]);
  useEffect(() => { worldRef.current = world; }, [world]);
  useEffect(() => { movePointRef.current = movePoint; }, [movePoint]);
  useEffect(() => { editingRef.current = editing; }, [editing]);
  useEffect(() => { reshapeRef.current = reshapePoint; }, [reshapePoint]);

  useEffect(() => {
    if (!map || mapDead || typeof google === 'undefined' || !google.maps?.marker) return;
    // ── A HALF-STARTED GOOGLE MUST NOT TAKE THE PAGE WITH IT ────────────────────────────────
    // When Maps refuses a key it still defines `google.maps.marker`, so the guard above passes —
    // and then `new AdvancedMarkerElement` throws from inside Google's own code with "Cannot read
    // properties of undefined (reading 'keys')". This effect runs in the page component, so that
    // exception reached the admin error boundary and replaced the ENTIRE page — files, layers,
    // point panel and all — with "Something went wrong".
    //
    // Observed on 2026-09-19. Everything else on this page is ordinary DOM over ordinary JSON and
    // has no business failing because Google is unhappy about a referrer.
    // Captured, because the narrowing above does not reach inside the function below.
    const gmap = map;
    try {
      reconcileMarkers();
    } catch (err) {
      console.error('[property map] markers could not be drawn:', err);
      setMapDead(true);
    }

    function reconcileMarkers() {
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
      let label: HTMLSpanElement | null = null;

      if (c.items.length === 1) {
        const p = c.items[0];
        el.className = 'gmap__marker';
        pin = document.createElement('div');
        pin.className = 'gmap__pin';
        pin.style.setProperty('--pin', p.colour);
        // No numeral inside the head any more (owner, 2026-09-19). A point is known by its name, and
        // the name sits beside the pin — a number as well was a second identity for the same thing,
        // and the one nobody had chosen.
        el.appendChild(pin);

        // ── THE NAME, ON THE MAP ────────────────────────────────────────────────────────────────
        // Owner, 2026-09-19: "we need a clear way to show the point names on the map as well."
        //
        // Rendered always and hidden with CSS rather than added and removed, so the toggle costs a
        // class on one ancestor instead of rebuilding six hundred markers. `pointer-events: none`
        // because a label is for reading: a wide piece of text over a map is a wide piece of map
        // you can no longer click.
        label = document.createElement('span');
        label.className = 'gmap__pin-label';
        label.textContent = p.title;
        el.appendChild(label);

        el.title = p.title + (p.jobNumber ? ' \u00b7 ' + p.jobNumber : '');

        // A marker is a DOM node, which is what lets a file be dropped straight onto a pin — the
        // same HTML5 drag the panel already uses, with a real element as the target.
        el.addEventListener('dragover', (e) => {
          if (!workModeRef.current) return;
          e.preventDefault();
          if ((e as DragEvent).dataTransfer) (e as DragEvent).dataTransfer!.dropEffect = 'copy';
          el.classList.add('gmap__marker--over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('gmap__marker--over'));
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          el.classList.remove('gmap__marker--over');
          const fileId = (e as DragEvent).dataTransfer?.getData(FILE_DRAG_TYPE);
          if (fileId && workModeRef.current) void assignFileRef.current(p.id, fileId);
        });

        // Hovering a pin lights THAT PIN, and the row of the layer it is on. It deliberately does
        // not set `hoverLayer`: that is the layer panel's own state, and setting it from here is
        // what used to light every pin on the sheet.
        // `--hot` is the glow, added on the element directly rather than through React: a class on
        // the node under the cursor costs nothing, where a state change would re-render the page on
        // every pin the pointer crosses. `hoverPoint` stays because it also lights the layer row.
        el.addEventListener('mouseenter', () => { el.classList.add('gmap__marker--hot'); setHoverPoint(p.id); });
        el.addEventListener('mouseleave', () => { el.classList.remove('gmap__marker--hot'); setHoverPoint((cur) => (cur === p.id ? null : cur)); });
      } else {
        // \u2500\u2500 A CLUSTER SAYS WHOSE IT IS (owner, 2026-09-19) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        //
        // "I wish it were that when we are zoomed out and it shows the single point with the number
        // of points at that location, it showed the job name and the number of points at that
        // location."
        //
        // It used to be a bare numeral. "14" says how many things are somewhere without saying what
        // the somewhere IS, which on a county-wide view is the only question being asked. Inside a
        // job the number alone is still right \u2014 every point there belongs to the job already open \u2014
        // so a name is added only when the cluster has one, which is exactly when it came from
        // `clusterByJob`.
        el.className = 'gmap__marker gmap__marker--cluster';
        const dot = document.createElement('div');
        dot.className = 'gmap__cluster';
        dot.textContent = String(c.items.length);
        el.appendChild(dot);

        const named = 'jobLabel' in c ? String((c as { jobLabel?: string }).jobLabel ?? '') : '';
        if (named) {
          const tag = document.createElement('span');
          tag.className = 'gmap__cluster-name';
          tag.textContent = named;
          el.appendChild(tag);
          el.title = `${named} \u2014 ${c.items.length} point${c.items.length === 1 ? '' : 's'}. Click to open it.`;
        } else {
          el.title = c.items.length + ' points here \u2014 zoom in to separate them';
        }

        // The same glow a single pin gets. Owner: "whenever we hover the cursor over a point, it
        // gets a slight glow to show exactly what point we are targeting \u2026 when we get more points
        // they might start to overlap each other." Two jobs at neighbouring addresses draw two
        // overlapping markers on purpose, so which one is under the cursor has to be legible before
        // the click rather than after it.
        el.addEventListener('mouseenter', () => el.classList.add('gmap__marker--hot'));
        el.addEventListener('mouseleave', () => el.classList.remove('gmap__marker--hot'));
      }

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: gmap, position: { lat: c.lat, lng: c.lng }, content: el,
        // Only a single point can be dragged: a cluster is several points in one marker, and
        // dragging it would have to mean moving all of them to the same spot.
        gmpDraggable: c.items.length === 1 && editingRef.current,
      });

      const entryPointId = c.items.length === 1 ? c.items[0].id : '';
      if (c.items.length === 1) {
        marker.addListener('dragend', (e: { latLng?: google.maps.LatLng | null }) => {
          const to = e?.latLng ?? (marker.position as google.maps.LatLng | null);
          if (!to) return;
          const lat = typeof to.lat === 'function' ? to.lat() : Number((to as unknown as { lat: number }).lat);
          const lng = typeof to.lng === 'function' ? to.lng() : Number((to as unknown as { lng: number }).lng);
          if (!isLatLng({ lat, lng })) return;
          void movePointRef.current(entryPointId, { lat, lng });
        });
      }

      const entry: MarkerEntry = { marker, el, pin, label, cluster: c };
      marker.addListener('gmp-click', () => {
        const cur = entry.cluster;
        if (cur.items.length > 1) {
          const b = boundsOf(cur.items) ?? padPoint({ lat: cur.lat, lng: cur.lng });
          gmap.fitBounds(new google.maps.LatLngBounds({ lat: b.south, lng: b.west }, { lat: b.north, lng: b.east }), 64);
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
    }
  }, [map, mapDead, clusters]);

  /** Draggability follows Edit map. The markers are reconciled rather than rebuilt, so leaving edit
   *  mode would otherwise leave every pin still draggable until something else changed. */
  useEffect(() => {
    for (const entry of markersRef.current.values()) {
      entry.marker.gmpDraggable = entry.cluster.items.length === 1 && editing;
    }
  }, [editing, clusters]);

  /** Appearance only — written onto the elements that already exist, so hovering a layer row does
   *  not rebuild six hundred markers while the tiles are trying to paint. */
  useEffect(() => {
    for (const entry of markersRef.current.values()) {
      const p = entry.cluster.items.length === 1 ? entry.cluster.items[0] : null;
      if (!p || !entry.pin) continue;
      // The rule itself lives in lib/jobs/map-world.ts, where a test can reach it — the bug this
      // replaces was a rule written inline, where nothing could check it.
      const h = pinHighlight({ id: p.id, layerId: layerIdOf(p) }, { hoverLayer, hoverPoint, selectedId });
      entry.pin.classList.toggle('gmap__pin--on', h.on);
      entry.pin.classList.toggle('gmap__pin--has-files', p.mediaCount > 0);
      entry.pin.classList.toggle('gmap__pin--lit', h.lit);
      entry.pin.classList.toggle('gmap__pin--dim', h.dim);
      // Renaming a point does not change its cluster's id, so the marker is never rebuilt and the
      // label would otherwise keep the old name until something else forced a rebuild.
      if (entry.label && entry.label.textContent !== p.title) entry.label.textContent = p.title;
    }
  }, [selectedId, hoverLayer, hoverPoint, clusters]);

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
    // ── KEEPING IT PUTS THE TOOL DOWN (owner, 2026-09-19) ──────────────────────────────────────
    //
    // "if I click keep it or done when I am done drawing a line for a walked path ... it should no
    // longer be selecting the walked path tool. Right now ... my next click on the map starts a new
    // drawn line, but it shouldn't work that way."
    //
    // This cleared `draw` — the shape being built — but left `drawKind`, the armed tool. So the
    // panel closed, the shape was saved, and the map still silently believed the next click was the
    // first corner of another path. Cancel and Escape both put the tool down already; keeping it was
    // the one exit that did not, which made it the one exit that surprised people.
    //
    // Drawing one shape is the whole intention. Wanting a second is a second press of the button,
    // which is cheap — and far cheaper than discovering you started a path you did not mean to.
    setDraw(null);
    setDrawKind(null);
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
  //
  // BUILDING AND STYLING ARE TWO EFFECTS, NOT ONE (owner, 2026-09-19: "the map doesn't refresh and
  // get clarity quickly"). They used to be one, with `hoverPoint`, `selectedId` and `draw` in the
  // dependency array — so moving the pointer across a pin destroyed every Polygon and Polyline on
  // the map and constructed a fresh set. Google reacts to that by re-compositing the overlay pane,
  // which interrupts the progressive sharpening of the satellite tiles underneath; the imagery was
  // being knocked back to its blurry first pass every time the mouse crossed a marker.
  //
  // The markers were given exactly this treatment earlier and for exactly this reason. The shapes
  // were missed. Now the geometry is built when the geometry changes, and hovering only calls
  // `setOptions` on objects that already exist — no allocation, no overlay churn, no reset.
  const shapesRef = useRef<Map<string, google.maps.Polygon | google.maps.Polyline>>(new Map());
  /** Cancels for the coalescing timers below, so a shape torn down mid-gesture cannot fire a save
   *  for a point that is no longer on the map. */
  const shapeTimersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!map || mapDead || typeof google === 'undefined' || !google.maps?.Polygon) return;
    const drawn = new Map<string, google.maps.Polygon | google.maps.Polyline>();
    shapeTimersRef.current = [];

    const add = (p: MapPoint, colour: string) => {
      const anchor = { lat: p.lat as number, lng: p.lng as number };
      if (!isLatLng(anchor) || p.geometry === 'point') return;
      const path = shapePath(p.geometry, anchor, p.vertices, p.geometry === 'fov'
        ? { bearing: p.bearingDeg ?? 0, spreadDeg: p.fovDeg ?? 68, feet: p.fovRadius ?? FOV_DEFAULT_FEET }
        : undefined);
      if (path.length < 2) return;

      // Built lit and unemphasised. The styling effect below runs straight after this one and puts
      // the real hover and selection state on, so there is no frame where the wrong thing is bright.
      const common = {
        map,
        strokeColor: colour,
        strokeOpacity: 0.95,
        strokeWeight: 2.5,
        clickable: true,
      };
      const shape = p.geometry === 'path'
        ? new google.maps.Polyline({ ...common, path })
        : new google.maps.Polygon({ ...common, paths: path, fillColor: colour, fillOpacity: 0.18 });
      shape.addListener('click', () => setSelectedId(p.id));

      // ── GRABBING A CORNER (owner, 2026-09-19) ──────────────────────────────────────────────────
      //
      // "I also need to be able to edit the nodes of the walked path by grabbing them and moving
      // them."
      //
      // `editable` is switched on and off by the styling effect — only the SELECTED shape, and only
      // in Edit map. These listeners are attached once, here, because they belong to the shape
      // rather than to whether it happens to be editable this second.
      //
      // Three events, one outcome. Dragging a corner is `set_at`; dragging a midpoint ghost to make
      // a new corner is `insert_at`; Google's own right-click delete is `remove_at`. Each one is a
      // finished edit and each one saves the whole path, so there is no partial state to reconcile.
      //
      // A FOV cone is left out on purpose: its shape is computed from a bearing and a reach, so
      // dragging one arc corner would describe something the model cannot store. It is aimed with
      // its own controls instead.
      if (p.geometry === 'path' || p.geometry === 'area') {
        const line = shape.getPath();
        // Coalesced, because one gesture is not one event: dragging a midpoint ghost inserts the
        // corner and then reports it moving, so a naive listener sends a PATCH per frame of the
        // drag. A short wait after the last event turns the whole gesture into one save — and one
        // undo-able change, rather than forty rows of history for moving a corner six feet.
        let pending: number | null = null;
        const save = () => {
          if (pending !== null) window.clearTimeout(pending);
          pending = window.setTimeout(() => {
            pending = null;
            // Read from `line` rather than from the event: the array IS the shape after the edit,
            // and the three events carry different arguments between them.
            const corners = line.getArray().map((c) => ({ lat: c.lat(), lng: c.lng() }));
            void reshapeRef.current(p.id, corners);
          }, 260);
        };
        for (const ev of ['set_at', 'insert_at', 'remove_at'] as const) line.addListener(ev, save);
        shapeTimersRef.current.push(() => { if (pending !== null) window.clearTimeout(pending); });
      }

      drawn.set(p.id, shape);
    };

    try {
      if (workMode) {
        for (const p of points) {
          if (hiddenTypes.includes(p.pointType)) continue;
          const l = layerOf(p, layers);
          if (l && hiddenLayers.includes(l.id)) continue;
          add(p, pointColour(p, layers, swatch));
        }
      }
    } catch (err) {
      console.error('[property map] shapes could not be drawn:', err);
      setMapDead(true);
    }

    shapesRef.current = drawn;
    return () => {
      for (const cancel of shapeTimersRef.current) cancel();
      shapeTimersRef.current = [];
      for (const s of drawn.values()) s.setMap(null);
      shapesRef.current = new Map();
    };
  }, [map, mapDead, workMode, points, layers, hiddenTypes, hiddenLayers]);

  /** Hover and selection, applied to shapes that already exist. Cheap enough to run on every
   *  pointer move because it allocates nothing — it is a property write per visible shape.
   *
   *  It also takes the shapes OUT of the way while something is being drawn. A saved shape is
   *  clickable on purpose — that is how you select its point — but Google hands a click to the
   *  topmost overlay rather than to the map, so drawing a path across an existing area meant the
   *  clicks that should have placed corners were selecting whatever they landed on instead. While
   *  `drawKind` is set, the map is the only thing listening. */
  useEffect(() => {
    if (mapDead) return;
    for (const p of points) {
      const shape = shapesRef.current.get(p.id);
      if (!shape) continue;
      const lit = hoverLayer === null || layerOf(p, layers)?.id === hoverLayer;
      const mine = p.id === hoverPoint || p.id === selectedId;
      try {
        shape.setOptions({
          clickable: !drawKind,
          // Handles on the selected shape only, and only in Edit map. Every shape editable at once
          // would put a grab handle on every corner of every path on the parcel — the map would be
          // covered in them, and a click meant for the map would land on one.
          editable: Boolean(editing) && !drawKind && p.id === selectedId
            && (p.geometry === 'path' || p.geometry === 'area'),
          strokeOpacity: lit ? 0.95 : 0.25,
          strokeWeight: mine ? 4 : 2.5,
          ...(p.geometry === 'path' ? {} : { fillOpacity: lit ? 0.18 : 0.05 }),
        });
      } catch {
        // A shape Google has already disposed of. Nothing to restyle, and nothing worth saying.
      }
    }
  }, [mapDead, points, layers, hoverLayer, hoverPoint, selectedId, drawKind, editing]);

  /** The shape under construction, drawn as you click so it is not a guess until you finish. Its
   *  own effect because `draw` changes on every click and every FOV nudge, and rebuilding one
   *  in-progress outline is nothing — rebuilding the whole map's worth alongside it was the cost. */
  useEffect(() => {
    if (!map || mapDead || !draw || typeof google === 'undefined' || !google.maps?.Polygon) return;
    const path = shapePath(draw.geometry, draw.anchor, draw.vertices,
      draw.geometry === 'fov' ? { bearing: draw.bearing, spreadDeg: draw.spreadDeg, feet: draw.feet } : undefined);
    if (path.length < 2) return;

    const common = { map, strokeColor: '#FACC15', strokeOpacity: 1, strokeWeight: 3, clickable: false, zIndex: 9 };
    let shape: google.maps.Polygon | google.maps.Polyline;
    try {
      shape = draw.geometry === 'path'
        ? new google.maps.Polyline({ ...common, path })
        : new google.maps.Polygon({ ...common, paths: path, fillColor: '#FACC15', fillOpacity: 0.2 });
    } catch (err) {
      console.error('[property map] the shape being drawn could not be shown:', err);
      return;
    }
    return () => { shape.setMap(null); };
  }, [map, mapDead, draw]);

  // ── DRAWING YOU CAN SEE (owner, 2026-09-19) ───────────────────────────────────────────────────
  //
  // "there needs to be better representation for the walked path while we are are drawing it. Like,
  // I need to be able to click the first point and see the first point appear. Walked path needs to
  // have a starting point and a final point."
  //
  // Before this, the first click produced NOTHING on screen. A polyline needs two positions to be a
  // line, so a path with one corner in it drew nothing at all — you clicked where the walk began and
  // the map sat there, and the only way to find out whether it had registered was to click again.
  //
  // Three things now happen, and they are separate on purpose:
  //
  //   1. every corner gets a handle the moment it is placed, so one click is visibly one corner;
  //   2. the first and last are labelled START and END, because a walked path has a direction and a
  //      line on a photograph does not show which way somebody walked;
  //   3. a dashed line follows the cursor from the last corner, so the next leg is visible before
  //      it is committed rather than after.
  //
  // The rubber band is drawn IMPERATIVELY, off React state. `mousemove` fires about sixty times a
  // second and putting that through a setState would re-render this whole page — panels, tiles and
  // all — for every pixel of pointer movement.
  const drawMarksRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const rubberRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || mapDead || typeof google === 'undefined' || !google.maps?.marker) return;

    const clear = () => {
      for (const m of drawMarksRef.current) m.map = null;
      drawMarksRef.current = [];
      rubberRef.current?.setMap(null);
      rubberRef.current = null;
    };
    clear();
    if (!draw) return;

    try {
      const corners = [draw.anchor, ...draw.vertices];
      const walked = draw.geometry === 'path' || draw.geometry === 'area';

      corners.forEach((at, i) => {
        const el = document.createElement('div');
        el.className = 'gmap__vertex';
        if (walked && i === 0) el.classList.add('gmap__vertex--start');
        if (walked && i === corners.length - 1 && corners.length > 1) el.classList.add('gmap__vertex--end');
        if (walked && (i === 0 || (i === corners.length - 1 && corners.length > 1))) {
          const tag = document.createElement('span');
          tag.className = 'gmap__vertex-tag';
          // "END" only once there is something to be the end OF — on a single corner it is the
          // start and nothing else, and labelling it both would be a lie about a path of one point.
          tag.textContent = i === 0 ? (draw.geometry === 'area' ? 'FIRST' : 'START') : (draw.geometry === 'area' ? 'LAST' : 'END');
          el.appendChild(tag);
        }
        drawMarksRef.current.push(new google.maps.marker.AdvancedMarkerElement({
          map, position: at, content: el, zIndex: 20,
        }));
      });

      // The leg being aimed, from the last corner to wherever the pointer is. Dashed, because it is
      // not a leg yet — it becomes one on the next click.
      if (walked) {
        rubberRef.current = new google.maps.Polyline({
          map,
          path: [],
          strokeOpacity: 0,
          zIndex: 19,
          // ── THE BAND MUST NOT EAT THE CLICK (owner, 2026-09-19) ───────────────────────────────
          //
          // "I can place the initial point and then I can see the dashed line for where I am placing
          // the next part of the line segment, but it won't let me actually anchor it."
          //
          // `google.maps.Polyline` is CLICKABLE BY DEFAULT, and this particular polyline ends at the
          // cursor — that is its whole job. So it was always directly under the pointer, and Google
          // gives the click to the topmost overlay rather than the map: `onMapClick` never fired and
          // no second corner could ever be placed. The preview shape sets this for the same reason;
          // the band was added later and did not.
          clickable: false,
          icons: [{
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#FACC15', strokeWeight: 3, scale: 3 },
            offset: '0',
            repeat: '11px',
          }],
        });
      }
    } catch (err) {
      console.error('[property map] the drawing preview could not be shown:', err);
    }

    return clear;
  }, [map, mapDead, draw]);

  /** The rubber band follows the pointer. Separate from the effect above so moving the mouse does
   *  not tear down and rebuild every handle sixty times a second. */
  useEffect(() => {
    if (!map || mapDead || !draw) return;
    const walked = draw.geometry === 'path' || draw.geometry === 'area';
    if (!walked) return;
    const last = draw.vertices.length ? draw.vertices[draw.vertices.length - 1] : draw.anchor;

    const listener = map.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
      const at = e.latLng;
      const line = rubberRef.current;
      if (!at || !line) return;
      // An area closes back to where it started, so the band shows BOTH the leg being aimed and the
      // edge that will close the ring — otherwise the shape looks open right up until it is kept.
      line.setPath(draw.geometry === 'area' && draw.vertices.length
        ? [last, { lat: at.lat(), lng: at.lng() }, draw.anchor]
        : [last, { lat: at.lat(), lng: at.lng() }]);
    });
    return () => listener.remove();
  }, [map, mapDead, draw]);

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
    let ac: google.maps.places.Autocomplete;
    try {
      ac = new google.maps.places.Autocomplete(searchRef.current, {
        fields: ['geometry', 'formatted_address', 'name'],
        componentRestrictions: { country: 'us' },
      });
      ac.bindTo('bounds', map);
    } catch (err) {
      // The box stays; it just falls back to our own geocoding on Enter, which is a worse search
      // and an infinitely better outcome than the page not existing.
      console.error('[property map] address suggestions unavailable:', err);
      return;
    }
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

  // ── MAKING THE PREVIEWS THAT DO NOT EXIST YET ─────────────────────────────────────────────────
  //
  // Owner, 2026-09-19: "I need to be able to view the files and images and videos that are stored
  // in the listed files and stuff in the left panel ... We need to make sure their preview
  // thumbnails load even after searches and stuff."
  //
  // This came back from the image map, where it was left behind: the tiles moved across and the
  // thing that MAKES their pictures did not, so every PDF and every video showed an icon forever.
  //
  // The deployment has no PDF renderer and no video decoder. Every browser that opens this panel
  // has both, so the panel makes the previews that do not exist and posts them — the work happens
  // once per file for the whole company rather than once per person per visit.
  //
  // WHY SEARCHING DOES NOT LOSE THEM. A generated preview is written back onto the library row in
  // place, not held in a variable beside the filtered list, so narrowing the panel and clearing it
  // again shows the same pictures rather than starting the decoding over. `triedRef` is the other
  // half: a file that has already been attempted this session is never queued twice, however many
  // times the list it appears in is rebuilt.
  const thumbAbortRef = useRef<AbortController | null>(null);
  const thumbQueueRef = useRef<ThumbJob[]>([]);
  const thumbTriedRef = useRef<Set<string>>(new Set());
  const thumbWorkersRef = useRef(0);
  const [thumbLeft, setThumbLeft] = useState(0);

  /** One file, start to finish: decode it here, post the result, swap that one tile in place.
   *
   *  A FAILURE IS A RESULT. Every way this can go wrong — pdf.js refusing the document, a codec the
   *  browser has not got, a canvas tainted by a URL that answered without CORS headers, the
   *  deadline — ends in the same POST of `{ state: 'failed' }`, which is what stops the next panel,
   *  and everybody else's, spending those seconds on it again. The tile keeps its icon, which was
   *  always a perfectly good answer for a file with no picture in it. */
  const runThumbJob = useCallback(async (jobItem: ThumbJob, signal: AbortSignal) => {
    if (!job) return;
    let dataUrl: string | null = null;
    try {
      const work = jobItem.kind === 'video' ? videoThumb(jobItem.url, signal)
        : jobItem.isPdf ? pdfThumb(jobItem.url, signal)
          : imageThumb(jobItem.url, signal);
      dataUrl = await withDeadline(work, THUMB_TIMEOUT_MS, signal);
    } catch {
      dataUrl = null;
    }
    if (signal.aborted) return;

    // `silent`: a preview that could not be stored is not a page error anybody should see a banner
    // about. The file keeps its icon and the panel carries on.
    const saved = await safeFetch<{ ok: boolean; thumb_state: ThumbState }>(
      `/api/admin/jobs/${job.jobId}/property-map/thumbnail`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataUrl ? { job_file_id: jobItem.id, data_url: dataUrl } : { job_file_id: jobItem.id, state: 'failed' }),
        signal,
        silent: true,
      },
    );
    if (signal.aborted) return;

    // Updated IN PLACE rather than by reloading the library: a reload would reorder and rescroll a
    // panel somebody may have a file half-dragged out of, in order to show a picture that is
    // already in hand.
    const state: ThumbState = saved?.thumb_state ?? 'failed';
    setLibrary((cur) => cur.map((f) => (f.id === jobItem.id
      ? { ...f, thumbUrl: dataUrl ?? f.thumbUrl, thumbState: state }
      : f)));
  }, [job, safeFetch]);

  /** Top the worker loops up. Each takes jobs until the queue is empty and then exits, so "how many
   *  are running" needs no scheduler — only this call after an enqueue. */
  const startThumbWorkers = useCallback(() => {
    const controller = thumbAbortRef.current;
    if (!controller || controller.signal.aborted) return;
    const { signal } = controller;
    const sync = () => { if (!signal.aborted) setThumbLeft(thumbQueueRef.current.length + thumbWorkersRef.current); };
    while (thumbWorkersRef.current < THUMB_WORKERS && thumbQueueRef.current.length > 0) {
      thumbWorkersRef.current += 1;
      void (async () => {
        try {
          for (;;) {
            if (signal.aborted) return;
            const next = thumbQueueRef.current.shift();
            if (!next) return;
            sync();
            await runThumbJob(next, signal);
          }
        } finally {
          thumbWorkersRef.current -= 1;
          sync();
        }
      })();
    }
    sync();
  }, [runThumbJob]);

  // Queued from the WHOLE library, never from the filtered view: a search narrows what is on
  // screen, not what exists, and queueing from the filtered list would mean typing in the search
  // box quietly cancelled the previews for everything it hid.
  useEffect(() => {
    if (!filesOpen || library.length === 0) return;
    if (!thumbAbortRef.current || thumbAbortRef.current.signal.aborted) {
      thumbAbortRef.current = new AbortController();
    }
    let queued = 0;
    for (const f of library) {
      if (!f.url) continue;
      if (thumbTriedRef.current.has(f.id)) continue;
      if (!needsThumb(f.thumbState, f.kind, f.mimeType, f.name)) continue;
      // A SMALL image is served as its own tile and already has a `thumbUrl`, so there is nothing to
      // make. A big one arrives without one and goes through the queue like a PDF — see
      // `imageIsItsOwnThumb` in lib/jobs/file-thumbnails.ts for why that changed on 2026-09-19.
      if (f.kind === 'image' && f.thumbUrl) continue;
      thumbTriedRef.current.add(f.id);
      thumbQueueRef.current.push({ id: f.id, url: f.url, kind: f.kind, isPdf: isPdfFile(f) });
      queued += 1;
    }
    if (queued > 0) startThumbWorkers();
  }, [library, filesOpen, startThumbWorkers]);

  // Leaving stops it dead. The tried set is cleared too: under React's development double-mount the
  // first pass is aborted, and a set that survived it would mean a freshly mounted panel that never
  // queues anything at all.
  useEffect(() => () => {
    thumbAbortRef.current?.abort();
    thumbAbortRef.current = null;
    thumbQueueRef.current = [];
    thumbTriedRef.current.clear();
  }, []);

  // ── the files panel ───────────────────────────────────────────────────────────────────────────
  //
  // Sorted ONCE, when the library itself changes. Filtering preserves order, so re-sorting after it
  // is pure waste — and it used to happen on every keystroke in the search box, five hundred items
  // at a time, on the thread that was also supposed to be drawing the character you just typed.
  const sortedLibrary = useMemo(() => sortLibrary(library), [library]);

  const visibleFiles = useMemo(() => {
    const needle = fileSearch.trim().toLowerCase();
    return sortedLibrary.filter((f) => {
      if (kindFilter !== 'all' && f.kind !== kindFilter) return false;
      if (unplacedOnly && f.assignedTo.length > 0) return false;
      if (needle && !f.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [sortedLibrary, kindFilter, unplacedOnly, fileSearch]);

  // ── HOW MANY TILES EXIST AT ONCE ──────────────────────────────────────────────────────────────
  //
  // Owner, 2026-09-19: "the whole site is kind of forzen."
  //
  // A job can hold five hundred files and every one of them used to be mounted the moment the panel
  // opened — each tile an image, an inline rename, a tooltip and four buttons, so several thousand
  // nodes and as many React elements to reconcile on every state change in this page. The tiles are
  // lazy about their PICTURES, which is why this was not obvious; they were never lazy about
  // existing.
  //
  // A page size rather than a virtualiser: it is about fifteen lines instead of a dependency, it
  // keeps the grid a plain CSS grid that reflows at any width, and it leaves find-in-page working on
  // what is shown. The batch is generous enough that most jobs never see the button at all.
  const FILE_PAGE = 120;
  const [shownFiles, setShownFiles] = useState(FILE_PAGE);
  // Any change to what is being looked FOR starts the count again, so narrowing a search cannot
  // leave you scrolled past the end of a much shorter list.
  useEffect(() => { setShownFiles(FILE_PAGE); }, [fileSearch, kindFilter, unplacedOnly]);
  const shownList = useMemo(() => visibleFiles.slice(0, shownFiles), [visibleFiles, shownFiles]);

  const unplacedCount = useMemo(() => library.filter((f) => f.assignedTo.length === 0).length, [library]);

  // ── the viewer ────────────────────────────────────────────────────────────────────────────────
  const libraryCollection = useMemo<ViewerCollection>(() => ({
    id: mapId ?? 'library',
    title: job ? `${job.jobNumber ?? 'Job'} — files` : 'Job files',
    files: visibleFiles.filter((f) => f.url).map((f): ViewerFile => ({
      id: f.id, name: f.name, mime: f.mimeType, size: f.sizeBytes, url: f.url, createdAt: f.uploadedAt,
      posterUrl: f.kind === 'video' ? f.thumbUrl : null,
      meta: [
        { label: 'Kind', value: KIND_ONE[f.kind] },
        ...(f.assignedTo.length
          ? [{ label: f.assignedTo.length === 1 ? 'Placed on' : `Placed on ${f.assignedTo.length} points`, value: f.assignedTo.map((a) => a.title).filter(Boolean).join('  ·  ') }]
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
        // The file's name, not the caption — see the note in Tiles.tsx. A caption is a note about
        // this placement and belongs in the details, not in the title bar where it would contradict
        // the name the same file has in the library and in the job's folders.
        id: m.id, name: m.name, mime: m.mimeType, size: m.sizeBytes, url: m.url,
        posterUrl: m.kind === 'video' ? m.thumbUrl : null,
        meta: [
          { label: 'Kind', value: KIND_ONE[m.kind] },
          { label: 'Placed on', value: where },
          ...(m.caption ? [{ label: 'Caption', value: m.caption }] : []),
        ],
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
            placeholder={workMode ? 'Search an address or place…' : 'Search a job, an address or a place…'}
            aria-label={workMode ? 'Search for an address and fly there' : 'Search jobs, or an address to fly there'}
            data-testid="gmap-search"
            onChange={(e) => setJobSearch(e.target.value)}
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
                        else void goToQuery(addressLine(j));
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

        <button
          className={`gmap__btn${showLabels ? ' gmap__btn--on' : ''}`}
          type="button"
          aria-pressed={showLabels}
          title="Show each point's name beside its pin"
          data-testid="gmap-labels"
          onClick={() => setShowLabels((c) => !c)}
        >
          <Tag size={13} aria-hidden /> Names
        </button>

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
                  className={`pmap__layer${l.isVisible ? '' : ' pmap__layer--off'}${layerRowLit(l.id, { hoverLayer, hoverPoint, selectedId }, hoveredPointLayer) ? ' pmap__layer--lit' : ''}`}
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
              {thumbLeft > 0 && (
                <span className="gmap__thumbing" title="Making previews for files that have none yet">
                  <Loader2 size={11} className="gmap__spin" aria-hidden /> {thumbLeft}
                </span>
              )}
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
              {shownList.map((f) => (
                <FileTile
                  key={f.id}
                  file={f}
                  editing={editing}
                  armed={armedFileId === f.id}
                  placing={false}
                  flashing={false}
                  confirming={confirmUnassign === f.id}
                  onArm={() => setArmedFileId((cur) => (cur === f.id ? null : f.id))}
                  dragging={draggingFileId === f.id}
                  onDragStart={(e) => {
                    if (!editing) { e.preventDefault(); return; }
                    e.dataTransfer.setData(FILE_DRAG_TYPE, f.id);
                    e.dataTransfer.effectAllowed = 'copy';
                    setDraggingFileId(f.id);
                  }}
                  onDragEnd={() => setDraggingFileId(null)}
                  onOpen={() => { if (f.url) setViewerOn({ source: 'library', fileId: f.id }); }}
                  onShowPoint={() => {
                    const first = f.assignedTo[0];
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
            {visibleFiles.length > shownList.length && (
              <button
                className="gmap__files-more"
                type="button"
                data-testid="gmap-files-more"
                onClick={() => setShownFiles((n) => n + FILE_PAGE)}
              >
                Show {Math.min(FILE_PAGE, visibleFiles.length - shownList.length)} more
                <span className="gmap__files-more-rest">
                  {visibleFiles.length - shownList.length} not shown
                </span>
              </button>
            )}
          </aside>
        )}

        {/* ── the map ────────────────────────────────────────────────────────────────────────── */}
        <div className={`gmap__canvas${placing ? ' gmap__canvas--placing' : ''}${drawKind ? ' gmap__canvas--drawing' : ''}${armedFileId ? ' gmap__canvas--assigning' : ''}${draggingFileId ? ' gmap__canvas--dragging' : ''}${showLabels ? ' gmap__canvas--labels' : ''}${editing ? ' gmap__canvas--editing' : ''}`}>
          {/* The map, and only the map, lives inside this boundary. Google throws from inside its
              own constructor when it refuses a key, and without this that exception unmounted the
              entire page — files, layers, point panel and all. See MapFrame. */}
          <MapFrame onFailed={() => setMapDead(true)}>
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
          </MapFrame>

          {hint && !workMode && !mapDead && <div className="gmap__hint" role="status" data-testid="gmap-zoom-hint"><ZoomIn size={14} aria-hidden /> {hint}</div>}
          {capped && !hint && !workMode && !mapDead && <div className="gmap__hint gmap__hint--warn" role="status" data-testid="gmap-capped">Showing the first points in view — zoom in to see them all.</div>}
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
                  canRename
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

            {/* ── THE PANEL IS WHERE A POINT IS EDITED, FULL STOP ────────────────────────────
                Owner, 2026-09-19: "If I click on a point and the info panel for that point opens,
                then it should allow me to change the name."

                This form used to be behind Edit map, which meant clicking a pin showed you its name
                and refused to let you change it — and nothing on screen explained why. "Edit map"
                now means what it says: adding, drawing and deleting things ON the map. What a point
                is CALLED is a property of the point, and the panel you opened is where it lives. */}
            {(
              <>
                {/* ── RENAMING A POINT, PLAINLY ────────────────────────────────────────────────
                    Owner, 2026-09-19: "I need a clear and straight forward way to rename points."
                    There was a rename — a pencil beside the heading, revealed on hover — and a
                    control you have to discover by moving the mouse over the right six pixels is
                    not a way to do anything. The pencil stays, because renaming from the heading is
                    quick once you know it is there; this is the box you find without being told.
                    Both write the same draft and are saved by the same button. */}
                <label className="gmap__label" htmlFor="gmap-name">Name</label>
                <input
                  id="gmap-name"
                  className="gmap__input"
                  type="text"
                  value={draft?.title ?? ''}
                  maxLength={160}
                  placeholder="What is this point?"
                  data-testid="gmap-name"
                  onChange={(e) => setDraft((d) => ({ title: e.target.value, notes: d?.notes ?? '' }))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (draft?.title.trim()) void patchPoint(selected.id, { title: draft.title, notes: draft.notes }, 'Point saved.');
                  }}
                />

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
                  {!editing ? null : confirmPoint === selected.id ? (
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

            {/* The drop box sits ABOVE the attachments rather than below them: on a point with
                fifteen photographs, a box under the grid is a box nobody scrolls to. */}
            <div
              className={`gmap__drop${dropOver ? ' gmap__drop--over' : ''}`}
              data-testid="gmap-drop"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDropOver(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOver(false); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void dropOnPoint(selected.id, e); }}
            >
              <Upload size={15} aria-hidden />
              <strong>Drop files here</strong>
              <span>
                {armedFileId
                  ? 'Or click this point on the map to place the file you picked up.'
                  : 'From the files panel, or straight from a folder on your computer.'}
              </span>
            </div>

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
                <h2 className="gmap__panel-title">{browsePick.title}</h2>
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
