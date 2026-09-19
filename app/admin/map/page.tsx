'use client';

// app/admin/map/page.tsx — one map, every job, on the actual earth.
//
// Owner, 2026-09-18: "I was thinking it would be cool to be able to keep track of all of our points
// for each job on one big file that is attached to google earth. Like, we just have google earth in
// a viewer, just like we do for the current map set up, but we can zoom around and scroll in and all
// of that. Then say we put in an address and the map zooms us to that location. if we have stored
// points at that property with files and stuff assigned to them, then we will be able to see them
// show up. Of course, the point loading and rendering would only show up at a certain level of zoom.
// We wouldn't want a situation where we have 500 points loading all at once."
//
// And, on the map this replaces: "For the one interactive map that we had already built out that
// doesn't use geocoder or the map, you can get rid of it and build the new system."
//
// ── WHAT REPLACED WHAT ──────────────────────────────────────────────────────────────────────────
//
// The old map was an uploaded aerial with points stored as fractions of that image — `x: 0.42`. It
// could not be searched by address, two jobs could not be seen together, and nothing on it could be
// measured in feet. This is Google satellite imagery with points stored as coordinates, which fixes
// all three by construction.
//
// Everything that hangs OFF a point survived the move untouched: its title, notes, type, status,
// the layer it sits on, and every file attached to it. That is why this page can be new while the
// per-job routes it writes through are the same ones as before.
//
// ── THE ZOOM RULE IS LOAD-BEARING ───────────────────────────────────────────────────────────────
//
// Below MIN_POINT_ZOOM nothing is requested at all — and the server refuses too, rather than
// trusting this file. The reason is legibility more than bytes: at county zoom, forty pins inside
// one property are one unreadable blob, and the request that fetched them was wasted. Above it, what
// comes back is clustered until the zoom at which pins are further apart than they are wide.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GoogleMap, LoadScript } from '@react-google-maps/api';
import {
  ChevronLeft, Layers, Loader2, MapPin, Plus, Search, Target, X, ZoomIn,
} from 'lucide-react';
import { usePageError } from '@/app/admin/hooks/usePageError';
import { useToast } from '@/app/admin/components/Toast';
import { usePageTitle } from '@/lib/admin/page-title';
import { POINT_TYPES, pointType, pointLabel, type PointTypeId } from '@/lib/jobs/property-map';
import {
  clusterPoints, shouldLoadPoints, zoomHint, padBounds, boundsOf, padPoint,
  DEFAULT_CENTER, DEFAULT_ZOOM, JOB_ZOOM, MIN_POINT_ZOOM,
  type Bounds, type LatLng,
} from '@/lib/jobs/map-world';
import './PropertyMap.css';

// ── GOOGLE ──────────────────────────────────────────────────────────────────────────────────────
// `hybrid` is satellite with the road and label overlay — the same mode the public service-area map
// uses. Plain `satellite` looks better and is much harder to navigate: with no road names, finding
// the right field is guesswork.
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
};

const CONTAINER = { width: '100%', height: '100%' };

interface WorldPoint {
  id: string;
  mapId: string;
  jobId: string;
  jobNumber: string | null;
  jobName: string | null;
  ordinal: number;
  title: string;
  lat: number;
  lng: number;
  pointType: PointTypeId;
  status: string;
  layerId: string | null;
  geometry: string;
  mediaCount: number;
}

interface JobPlace {
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

/** The swatch a pin wears, read off the same token the legend uses so the two cannot drift. */
function colourOf(type: PointTypeId): string {
  const token = pointType(type).token;
  if (typeof window === 'undefined') return '#1D3095';
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return v || '#1D3095';
}

export default function GlobalPropertyMapPage() {
  usePageTitle('Property map');
  const router = useRouter();
  const params = useSearchParams();
  const { addToast } = useToast();
  const { safeFetch, reportPageError } = usePageError('GlobalPropertyMapPage');

  const jobParam = params.get('job');

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [points, setPoints] = useState<WorldPoint[]>([]);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<WorldPoint | null>(null);
  const [jobs, setJobs] = useState<JobPlace[]>([]);
  const [activeJob, setActiveJob] = useState<JobPlace | null>(null);
  const [placing, setPlacing] = useState(false);
  const [search, setSearch] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState<PointTypeId[]>([]);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);

  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const searchBoxRef = useRef<HTMLInputElement | null>(null);
  const placingRef = useRef(false);
  useEffect(() => { placingRef.current = placing; }, [placing]);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  // ── THE JOB LIST, AND THE JOB WE ARRIVED FOR ──────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    void (async () => {
      const data = await safeFetch<{ jobs: JobPlace[] }>('/api/admin/map/points?jobs=1');
      if (alive && data?.jobs) setJobs(data.jobs);
    })();
    return () => { alive = false; };
  }, [safeFetch]);

  /** Arriving from a job page: fly there, and make it the job new points belong to. */
  useEffect(() => {
    if (!jobParam || !map) return;
    let alive = true;
    void (async () => {
      const data = await safeFetch<{ job: JobPlace }>(`/api/admin/map/job/${jobParam}`);
      if (!alive || !data?.job) return;
      setActiveJob(data.job);
      if (data.job.lat !== null && data.job.lng !== null) {
        map.setCenter({ lat: data.job.lat, lng: data.job.lng });
        map.setZoom(JOB_ZOOM);
      } else {
        // The job has no coordinates — an address nobody could geocode, or none at all. Say so;
        // silently opening on Belton would look like the map ignoring the job.
        addToast(
          `${data.job.jobNumber ?? 'That job'} has no location yet. Search its address, then place points.`,
          'info',
          4200,
        );
      }
    })();
    return () => { alive = false; };
  }, [jobParam, map, safeFetch, addToast]);

  // ── LOADING WHAT IS IN VIEW ───────────────────────────────────────────────────────────────────
  const fetchPoints = useCallback(async (b: Bounds, z: number) => {
    if (!shouldLoadPoints(z)) { setPoints([]); setCapped(false); return; }
    const padded = padBounds(b);
    const qs = new URLSearchParams({
      north: String(padded.north), south: String(padded.south),
      east: String(padded.east), west: String(padded.west),
      zoom: String(z),
    });
    setLoading(true);
    const data = await safeFetch<{ points: WorldPoint[]; capped: boolean }>(`/api/admin/map/points?${qs}`);
    setLoading(false);
    if (!data) return;
    setPoints(data.points ?? []);
    setCapped(Boolean(data.capped));
  }, [safeFetch]);

  /** The map settled after a pan or a zoom. Debounced, because `idle` fires per gesture and a drag
   *  across the county is one intention, not forty requests. */
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
    void fetchPoints(next, z);
  }, [map, fetchPoints]);

  const reload = useCallback(() => {
    if (bounds) void fetchPoints(bounds, zoom);
  }, [bounds, zoom, fetchPoints]);

  // ── WHAT IS DRAWN ─────────────────────────────────────────────────────────────────────────────
  const shown = useMemo(
    () => points.filter((p) => !hiddenTypes.includes(p.pointType)),
    [points, hiddenTypes],
  );

  const clusters = useMemo(() => clusterPoints(shown, zoom), [shown, zoom]);

  const legend = useMemo(() => {
    const present = new Set(points.map((p) => p.pointType));
    return POINT_TYPES.filter((t) => present.has(t.id));
  }, [points]);

  // ── MARKERS ───────────────────────────────────────────────────────────────────────────────────
  // Built imperatively rather than as React children: AdvancedMarkerElement is a DOM element Google
  // owns, and re-rendering six hundred of them through React's reconciler is how a pan starts
  // dropping frames. They are torn down and rebuilt whenever the cluster set changes, which is the
  // cheapest correct thing at this scale.
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.marker) return;

    for (const m of markersRef.current) m.map = null;
    markersRef.current = [];

    for (const c of clusters) {
      const el = document.createElement('div');
      if (c.items.length === 1) {
        const p = c.items[0];
        el.className = 'gmap__pin';
        el.style.setProperty('--pin', colourOf(p.pointType));
        el.innerHTML = `<span class="gmap__pin-num">${p.ordinal}</span>`;
        if (p.mediaCount > 0) el.classList.add('gmap__pin--has-files');
        el.title = `${pointLabel(p)}${p.jobNumber ? ` · ${p.jobNumber}` : ''}`;
      } else {
        el.className = 'gmap__cluster';
        el.textContent = String(c.items.length);
        el.title = `${c.items.length} points here — zoom in to separate them`;
      }

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: c.lat, lng: c.lng },
        content: el,
      });

      marker.addListener('gmp-click', () => {
        if (c.items.length === 1) {
          setSelected(c.items[0]);
        } else {
          // Zooming to the cluster's own extent, not by a fixed step: two points a mile apart and
          // forty in one field need very different amounts of zoom to separate.
          const b = boundsOf(c.items) ?? padPoint({ lat: c.lat, lng: c.lng });
          map.fitBounds(new google.maps.LatLngBounds(
            { lat: b.south, lng: b.west },
            { lat: b.north, lng: b.east },
          ), 64);
        }
      });

      markersRef.current.push(marker);
    }

    return () => { for (const m of markersRef.current) m.map = null; };
  }, [map, clusters]);

  // ── PLACING A POINT ───────────────────────────────────────────────────────────────────────────
  const placePoint = useCallback(async (at: LatLng) => {
    if (!activeJob) {
      addToast('Pick a job first — a point belongs to one.', 'info', 3000);
      setJobPickerOpen(true);
      return;
    }
    let mapId = activeJob.mapId;
    // A job that has never had a map gets one now, rather than making somebody visit another screen
    // to create an empty container before they can drop a pin.
    if (!mapId) {
      const made = await safeFetch<{ map: { id: string } }>(`/api/admin/jobs/${activeJob.jobId}/property-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Property map' }),
      });
      mapId = made?.map?.id ?? null;
      if (!mapId) { addToast('Could not start a map for this job.', 'error'); return; }
      setActiveJob((cur) => (cur ? { ...cur, mapId } : cur));
    }

    const res = await safeFetch<{ points: Array<{ id: string; ordinal: number }> }>(
      `/api/admin/jobs/${activeJob.jobId}/property-map/points`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_id: mapId, lat: at.lat, lng: at.lng, title: 'Point of interest' }),
      },
    );
    if (!res) { addToast('That point could not be placed.', 'error'); return; }
    addToast('Point placed.', 'success', 1600);
    setPlacing(false);
    reload();
  }, [activeJob, safeFetch, addToast, reload]);

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!placingRef.current || !e.latLng) return;
    void placePoint({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  }, [placePoint]);

  // ── SEARCHING FOR A PLACE ─────────────────────────────────────────────────────────────────────
  // Google's own Places Autocomplete, bound to the map: typing an address and pressing Enter flies
  // there. This is the "put in an address and the map zooms us to that location" the owner asked
  // for, and it is Google's widget rather than ours because it already knows how to disambiguate
  // "Main St" from the fourteen other Main Streets in range.
  useEffect(() => {
    if (!map || !searchBoxRef.current || typeof google === 'undefined' || !google.maps?.places) return;
    const ac = new google.maps.places.Autocomplete(searchBoxRef.current, {
      fields: ['geometry', 'formatted_address', 'name'],
      componentRestrictions: { country: 'us' },
    });
    ac.bindTo('bounds', map);
    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      const at = place.geometry?.location;
      if (!at) { addToast('Nothing found for that address.', 'info', 2600); return; }
      map.setCenter(at);
      map.setZoom(JOB_ZOOM);
    });
    return () => { listener.remove(); };
  }, [map, addToast]);

  const hint = zoomHint(zoom, points.length);

  // ── NO KEY, NO MAP ────────────────────────────────────────────────────────────────────────────
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
    <div className="gmap" data-testid="gmap">
      {/* ── THE BAR ──────────────────────────────────────────────────────────────────────────── */}
      <div className="gmap__bar">
        <Link className="gmap__back" href={activeJob ? `/admin/jobs/${activeJob.jobId}` : '/admin/jobs'}>
          <ChevronLeft size={14} aria-hidden /> {activeJob ? 'Back to the job' : 'Jobs'}
        </Link>

        <span className="gmap__search">
          <Search size={14} aria-hidden />
          <input
            ref={searchBoxRef}
            className="gmap__search-input"
            type="text"
            placeholder="Search an address or place…"
            aria-label="Search for an address and fly there"
            data-testid="gmap-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          />
        </span>

        {/* Which job a new point belongs to. A point without one has nowhere to live, so this is
            required before placing rather than asked for afterwards. */}
        <div className="gmap__jobpick">
          <button
            className={`gmap__btn${activeJob ? ' gmap__btn--on' : ''}`}
            type="button"
            aria-expanded={jobPickerOpen}
            data-testid="gmap-job-toggle"
            onClick={() => setJobPickerOpen((c) => !c)}
          >
            <Target size={13} aria-hidden />
            {activeJob ? `${activeJob.jobNumber ?? 'Job'} · ${activeJob.name ?? ''}`.slice(0, 32) : 'Pick a job'}
          </button>
          {jobPickerOpen && (
            <div className="gmap__joblist" role="listbox" data-testid="gmap-job-list">
              {jobs.length === 0 && <p className="gmap__joblist-empty">No jobs have a location yet.</p>}
              {jobs.map((j) => (
                <button
                  key={j.jobId}
                  className={`gmap__jobrow${activeJob?.jobId === j.jobId ? ' gmap__jobrow--on' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={activeJob?.jobId === j.jobId}
                  data-testid={`gmap-job-${j.jobId}`}
                  onClick={() => {
                    setActiveJob(j);
                    setJobPickerOpen(false);
                    if (map && j.lat !== null && j.lng !== null) {
                      map.setCenter({ lat: j.lat, lng: j.lng });
                      map.setZoom(JOB_ZOOM);
                    }
                  }}
                >
                  <strong>{j.jobNumber ?? '—'}</strong>
                  <span>{j.name ?? ''}</span>
                  <small>{[j.address, j.city].filter(Boolean).join(', ')}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className={`gmap__btn${placing ? ' gmap__btn--on' : ''}`}
          type="button"
          aria-pressed={placing}
          data-testid="gmap-place"
          onClick={() => {
            if (!activeJob) { setJobPickerOpen(true); addToast('Pick a job first — a point belongs to one.', 'info', 2600); return; }
            setPlacing((c) => !c);
          }}
        >
          <Plus size={13} aria-hidden /> {placing ? 'Click the map…' : 'Add point'}
        </button>

        {loading && <Loader2 className="gmap__spin" size={15} aria-label="Loading points" />}
      </div>

      {/* ── THE LEGEND ───────────────────────────────────────────────────────────────────────── */}
      {legend.length > 0 && (
        <div className="gmap__legend" data-testid="gmap-legend">
          <Layers size={12} aria-hidden />
          {legend.map((t) => {
            const off = hiddenTypes.includes(t.id);
            return (
              <button
                key={t.id}
                className={`gmap__chip${off ? ' gmap__chip--off' : ''}`}
                type="button"
                aria-pressed={!off}
                title={t.hint}
                data-testid={`gmap-legend-${t.id}`}
                style={{ '--swatch': `var(${t.token})` } as React.CSSProperties}
                onClick={() => setHiddenTypes((cur) => (off ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
              >
                <span className="gmap__chip-swatch" aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── THE MAP ──────────────────────────────────────────────────────────────────────────── */}
      <div className={`gmap__canvas${placing ? ' gmap__canvas--placing' : ''}`}>
        <LoadScript googleMapsApiKey={apiKey} libraries={LIBRARIES} loadingElement={<div className="gmap__loading">Loading the map…</div>}>
          <GoogleMap
            mapContainerStyle={CONTAINER}
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            options={{ ...MAP_OPTIONS, mapId: 'DEMO_MAP_ID' }}
            onLoad={(m) => setMap(m)}
            onUnmount={() => setMap(null)}
            onIdle={onIdle}
            onClick={onMapClick}
          />
        </LoadScript>

        {hint && (
          <div className="gmap__hint" role="status" data-testid="gmap-zoom-hint">
            <ZoomIn size={14} aria-hidden /> {hint}
          </div>
        )}

        {capped && !hint && (
          <div className="gmap__hint gmap__hint--warn" role="status" data-testid="gmap-capped">
            Showing the first points in view — zoom in to see them all.
          </div>
        )}

        {placing && (
          <div className="gmap__hint gmap__hint--go" role="status" data-testid="gmap-placing">
            Click where the point goes. Escape to stop.
          </div>
        )}
      </div>

      {/* ── ONE POINT ────────────────────────────────────────────────────────────────────────── */}
      {selected && (
        <aside className="gmap__panel" aria-label="Point details" data-testid="gmap-panel">
          <div className="gmap__panel-head">
            <div>
              <h2 className="gmap__panel-title">{pointLabel(selected)}</h2>
              <p className="gmap__panel-sub">
                {pointType(selected.pointType).label}
                {selected.mediaCount > 0 && ` · ${selected.mediaCount} file${selected.mediaCount === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              className="gmap__icon-btn"
              type="button"
              aria-label="Close point details"
              data-testid="gmap-panel-close"
              onClick={() => setSelected(null)}
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          <dl className="gmap__facts">
            <dt>Job</dt>
            <dd>
              <Link href={`/admin/jobs/${selected.jobId}`}>
                {selected.jobNumber ?? 'Job'}{selected.jobName ? ` · ${selected.jobName}` : ''}
              </Link>
            </dd>
            <dt>Where</dt>
            <dd>
              <a href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`} target="_blank" rel="noopener noreferrer">
                {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
              </a>
            </dd>
          </dl>

          {/* The files live on the job's own map screen, which already knows how to sign, preview and
              attach them. Duplicating that here would be a second implementation of the hardest part
              of the feature. */}
          <Link
            className="gmap__btn gmap__btn--primary"
            href={`/admin/jobs/${selected.jobId}/map?point=${selected.id}`}
            data-testid="gmap-open-point"
          >
            <MapPin size={13} aria-hidden /> Open this point
          </Link>
        </aside>
      )}
    </div>
  );
}
