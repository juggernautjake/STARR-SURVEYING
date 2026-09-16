// app/admin/jobs/[id]/map/page.tsx — the interactive property map.
//
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
//
// Owner, 2026-09-16: "whenever the user looks at the map, they will be able to see all of the
// points of interest … There will be list on the side of all of them so the user can find the point
// both on the map itself and in the list of points … if the user highlights or clicks a point on
// the map, then that same point in the list should also be highlighted or selected, and vice versa."
//
// ── THE THREE DECISIONS THIS FILE IS MADE OF ───────────────────────────────────────────────────
//
// 1. ALL OF THE RULES LIVE NEXT DOOR. Where a pin goes, what number it wears, what colour and icon
//    its type carries, which attachments sort first, what the summary line says — every one of
//    those is a pure function in `lib/jobs/property-map.ts`, tested without a browser. This file
//    renders and talks to the network; when it wants to know something, it asks.
//
// 2. ONE PIECE OF SELECTION STATE. `selectedId` and `hoverId` drive the map AND the list. There is
//    no "selected pin" separate from "selected row" to drift apart, which is the bug the owner
//    described in advance by asking for both directions of the same behaviour.
//
// 3. EVERY MUTATION RETURNS THE WHOLE MAP. The API is built that way on purpose, so the client
//    never merges a partial update into its own copy — `setPayload(response)` and the list, the
//    pins, the numbering and every signed URL are correct together.
//
// View mode is the default and can change nothing. Edit mode is a deliberate switch with a banner
// across the page, because the cost of not knowing which one you are in is a pin moved on somebody
// else's survey.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle, Camera, ChevronLeft, Crosshair, DoorOpen, ExternalLink, Fence, FileText, Hash,
  Home, MapPin, Mic, Music, Pencil, Plus, Route, Search, ShieldAlert, Spline, Tag, Target, Trash2,
  Trees, Upload, Video, Waves, X, Zap, type LucideIcon,
} from 'lucide-react';

import { usePageError } from '@/app/admin/hooks/usePageError';
import { useToast } from '@/app/admin/components/Toast';
import MediaViewer, { type MediaItem } from '@/app/admin/components/MediaViewer';
import AudioRecorder from '@/app/admin/components/fieldbook/AudioRecorder';
import { usePageTitle } from '@/lib/admin/page-title';
import { uploadJobFileBytes } from '@/lib/jobs/upload-client';
import { detectJobFileType } from '@/lib/files/job-folders';
import {
  POINT_STATUSES, POINT_TYPES, clampToImage, filterPoints, mapsHref, mediaKindFor, mediaSummary,
  pinStyle, pointLabel, pointType, relativeFromClick, sortMedia, typesInUse,
  type MapPoint, type MediaKind, type PointMedia, type PointStatus, type PointTypeId,
  type PropertyMap, type RelativePoint,
} from '@/lib/jobs/property-map';

import './PropertyMap.css';

/** Exactly what `GET /api/admin/jobs/[id]/property-map` answers, and what every mutating call
 *  answers too. One shape, so a response is always just the new state. */
interface MapPayload {
  map: PropertyMap | null;
  points: MapPoint[];
  imageUrl: string | null;
}

/** `POINT_TYPES` names its icon as a STRING so the pure module stays free of React. This is the one
 *  place that turns those names back into components — an unknown name falls back to the generic
 *  pin rather than rendering nothing, so a type added by a newer deploy still draws. */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  MapPin, Spline, Crosshair, Target, Home, Zap, Fence, Camera, DoorOpen, AlertTriangle, Waves,
  Trees, Route, ShieldAlert,
};

const KIND_ICON: Record<MediaKind, LucideIcon> = {
  image: Camera,
  video: Video,
  audio: Music,
  document: FileText,
};

/** The popup's width in `PropertyMap.css`, in pixels. Clamping needs a number, and a number that
 *  disagrees with the stylesheet clamps the wrong box — so it is named here and nowhere else. */
const POPUP_WIDTH = 256;

// ── DISPLAY PREFERENCES ─────────────────────────────────────────────────────────────────────────
// Owner's follow-up: "you should be able to turn point labels on and off." Per person, not per map:
// somebody who works with labels off works with them off on every job.

const PREFS_KEY = 'pmap:display:v1';

interface Prefs {
  labels: boolean;
  numbers: boolean;
  hiddenTypes: PointTypeId[];
}

const DEFAULT_PREFS: Prefs = { labels: true, numbers: true, hiddenTypes: [] };

/** Storage can throw outright — Safari's private mode, a locked-down profile, an embedded webview.
 *  A display toggle is never a reason for the page to fail to render, so every access is guarded
 *  and a failure simply means the defaults. */
function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      labels: parsed.labels !== false,
      numbers: parsed.numbers !== false,
      hiddenTypes: Array.isArray(parsed.hiddenTypes) ? (parsed.hiddenTypes as PointTypeId[]) : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Nothing to do and nothing worth saying: the toggles still work for this session.
  }
}

/** A point type's colour, handed to CSS as a custom property rather than as a literal — which is
 *  why there is not a single colour value in this file. The stylesheet owns the fourteen tokens and
 *  their dark-theme counterparts. */
function pinVars(typeId: PointTypeId): CSSProperties {
  return { '--pmap-pin-colour': `var(${pointType(typeId).token})` } as CSSProperties;
}

function swatchVars(token: string): CSSProperties {
  return { '--pmap-swatch': `var(${token})` } as CSSProperties;
}

/** The aerial's real pixel size, read in the browser before the map row is written. Stored so a
 *  later export and any georeferencing have the dimensions the coordinates were taken against. */
function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** Which of the job's standard folders a freshly attached file belongs in. Attaching to a pin is
 *  still an ordinary upload: the photo lands in Photos and stays findable in the File Explorer. */
function sectionFor(kind: MediaKind): string {
  if (kind === 'image') return 'photos';
  if (kind === 'video') return 'videos';
  return 'general';
}

/** `detectJobFileType` reads the extension, and a browser voice note is a `.webm` — which that
 *  function correctly calls a video. The recorder knows better, so the KIND decides for audio. */
function fileTypeFor(kind: MediaKind, name: string): string {
  if (kind === 'audio') return 'voice_memo';
  if (kind === 'video') return 'video';
  if (kind === 'image') return 'image';
  return detectJobFileType(name);
}

export default function JobPropertyMapPage() {
  const params = useParams();
  const jobId = String((params as Record<string, string | string[]> | null)?.id ?? '');
  const { safeFetch, safeAction, reportPageError } = usePageError('JobPropertyMapPage');
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<MapPayload | null>(null);
  const [busy, setBusy] = useState(false);

  // View is the default, and it cannot change anything.
  const [editing, setEditing] = useState(false);
  const [placing, setPlacing] = useState(false);

  // ONE selection, shared by the map and the list.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  const [viewing, setViewing] = useState<MediaItem | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [confirmPoint, setConfirmPoint] = useState<string | null>(null);
  const [confirmMedia, setConfirmMedia] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const [draft, setDraft] = useState<{ title: string; notes: string } | null>(null);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const attachRef = useRef<HTMLInputElement | null>(null);
  const aerialRef = useRef<HTMLInputElement | null>(null);
  /** A drag that actually moved must not also read as a click. */
  const movedRef = useRef(false);
  const pointsRef = useRef<MapPoint[]>([]);

  const map = payload?.map ?? null;
  const points = useMemo(() => payload?.points ?? [], [payload]);
  pointsRef.current = points;

  usePageTitle(map ? `${map.title} — Property map` : 'Property map');

  // ── LOADING: ONE REQUEST, EVERYTHING SIGNED ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    const data = await safeFetch<MapPayload>(`/api/admin/jobs/${jobId}/property-map`);
    if (data) setPayload(data);
    setLoading(false);
  }, [jobId, safeFetch]);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    void load();
  }, [jobId, load]);

  useEffect(() => { setPrefs(readPrefs()); }, []);

  const savePrefs = useCallback((next: Prefs) => { setPrefs(next); writePrefs(next); }, []);

  /** Every mutating call answers with the whole map, so this is the only place state is replaced. */
  const mutate = useCallback(async (what: string, url: string, init: RequestInit, done?: string) => {
    setBusy(true);
    const res = await safeFetch<MapPayload>(url, init);
    setBusy(false);
    if (!res) { addToast(`Could not ${what}.`, 'error'); return null; }
    setPayload(res);
    if (done) addToast(done, 'success');
    return res;
  }, [safeFetch, addToast]);

  // ── THE FRAME'S SIZE, WHICH THE POPUP IS CLAMPED AGAINST ──────────────────────────────────────
  const measure = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setFrame({ width: box.width, height: box.height });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, payload?.imageUrl]);

  // ── SELECTION ────────────────────────────────────────────────────────────────────────────────
  const selected = useMemo(() => points.find((p) => p.id === selectedId) ?? null, [points, selectedId]);

  // Selecting in either direction scrolls the list to the row, which is the half of "and vice
  // versa" that is easy to forget on a forty-point map where the row is off screen.
  useEffect(() => {
    if (!selectedId) return;
    const row = listRef.current?.querySelector(`[data-point-id="${selectedId}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  // The editable draft follows the SELECTION, not the payload — so attaching a photo half way
  // through typing a note does not wipe what has been typed.
  useEffect(() => {
    const p = pointsRef.current.find((x) => x.id === selectedId);
    setDraft(p ? { title: p.title, notes: p.notes ?? '' } : null);
    setConfirmPoint(null);
    setConfirmMedia(null);
  }, [selectedId]);

  // Escape unwinds one layer at a time: the open point, then the add-a-point cursor, then edit
  // mode. The media viewer closes itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || viewing) return;
      if (selectedId) { setSelectedId(null); return; }
      if (placing) { setPlacing(false); return; }
      if (editing) setEditing(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing, selectedId, placing, editing]);

  // ── FILTERS ──────────────────────────────────────────────────────────────────────────────────
  const legend = useMemo(() => typesInUse(points), [points]);

  const shownTypes = useMemo(
    () => legend.filter((t) => !prefs.hiddenTypes.includes(t.id)).map((t) => t.id),
    [legend, prefs.hiddenTypes],
  );

  /** The pins the map draws: the type filter, and nothing else. Text search narrows the LIST — a
   *  search that also emptied the map would hide the thing being searched for. */
  const onMap = useMemo(() => {
    if (shownTypes.length === legend.length) return points;
    if (shownTypes.length === 0) return [];
    return filterPoints(points, { types: shownTypes });
  }, [points, shownTypes, legend.length]);

  const listed = useMemo(() => filterPoints(onMap, { text: search }), [onMap, search]);

  const toggleType = (id: PointTypeId) => {
    const hidden = prefs.hiddenTypes.includes(id)
      ? prefs.hiddenTypes.filter((t) => t !== id)
      : [...prefs.hiddenTypes, id];
    savePrefs({ ...prefs, hiddenTypes: hidden });
  };

  // ── PLACING, DRAGGING ────────────────────────────────────────────────────────────────────────
  const liveAt = useCallback((p: MapPoint): RelativePoint => (
    drag?.id === p.id ? clampToImage({ x: drag.x, y: drag.y }) : { x: p.x, y: p.y }
  ), [drag]);

  const addPoint = useCallback(async (at: RelativePoint) => {
    if (!map) return;
    const res = await mutate(
      'place the point',
      `/api/admin/jobs/${jobId}/property-map/points`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_id: map.id, x: at.x, y: at.y }),
      },
      'Point placed.',
    );
    setPlacing(false);
    if (!res) return;
    // The server assigns the number, so the new point is the highest one that came back.
    const newest = [...res.points].sort((a, b) => b.ordinal - a.ordinal)[0];
    if (newest) {
      setSelectedId(newest.id);
      window.setTimeout(() => titleRef.current?.focus(), 60);
    }
  }, [map, jobId, mutate]);

  const onFrameClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editing || !placing || !map) return;
    const el = frameRef.current;
    if (!el) return;
    void addPoint(relativeFromClick(e.clientX, e.clientY, el.getBoundingClientRect()));
  };

  const onPinDown = (e: React.PointerEvent<HTMLButtonElement>, p: MapPoint) => {
    if (!editing) return;
    movedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: p.id, x: p.x, y: p.y });
  };

  const onPinMove = (e: React.PointerEvent<HTMLButtonElement>, p: MapPoint) => {
    if (!drag || drag.id !== p.id) return;
    const el = frameRef.current;
    if (!el) return;
    const at = relativeFromClick(e.clientX, e.clientY, el.getBoundingClientRect());
    if (Math.abs(at.x - p.x) > 0.003 || Math.abs(at.y - p.y) > 0.003) movedRef.current = true;
    setDrag({ id: p.id, x: at.x, y: at.y });
  };

  const onPinUp = async (p: MapPoint) => {
    if (!drag || drag.id !== p.id || !map) return;
    const at = clampToImage({ x: drag.x, y: drag.y });
    const moved = movedRef.current;
    setDrag(null);
    if (!moved) return;
    await mutate(
      'move the point',
      `/api/admin/jobs/${jobId}/property-map/points`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_id: map.id, point_id: p.id, x: at.x, y: at.y }),
      },
      'Point moved.',
    );
  };

  const onPinClick = (p: MapPoint) => {
    // A drag that ended over the pin fires a click too. Swallow that one.
    if (movedRef.current) { movedRef.current = false; return; }
    setSelectedId((cur) => (cur === p.id ? null : p.id));
  };

  // ── EDITING A POINT ──────────────────────────────────────────────────────────────────────────
  const patchPoint = useCallback(async (pointId: string, body: Record<string, unknown>, done: string) => {
    if (!map) return;
    await mutate(
      'save the point',
      `/api/admin/jobs/${jobId}/property-map/points`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_id: map.id, point_id: pointId, ...body }),
      },
      done,
    );
  }, [map, jobId, mutate]);

  const deletePoint = useCallback(async (pointId: string) => {
    if (!map) return;
    const res = await mutate(
      'delete the point',
      `/api/admin/jobs/${jobId}/property-map/points?map_id=${encodeURIComponent(map.id)}&point_id=${encodeURIComponent(pointId)}`,
      { method: 'DELETE' },
      'Point deleted.',
    );
    if (res) setSelectedId(null);
  }, [map, jobId, mutate]);

  const detachMedia = useCallback(async (pointId: string, mediaId: string) => {
    await mutate(
      'detach that file',
      `/api/admin/jobs/${jobId}/property-map/media?point_id=${encodeURIComponent(pointId)}&media_id=${encodeURIComponent(mediaId)}`,
      { method: 'DELETE' },
      'Detached. The file is still in the job.',
    );
    setConfirmMedia(null);
  }, [jobId, mutate]);

  // ── ATTACHING: UPLOAD THE BYTES, ROW THE FILE, LINK IT ───────────────────────────────────────
  // Three steps and no copying: the bytes go straight to storage, the row lands in the job's own
  // folders, and the point links to that row. One file, two ways to find it.
  const uploadIntoJob = useCallback(async (file: File, note: string) => {
    setUpload({ name: file.name, pct: 0 });
    try {
      const bytes = await uploadJobFileBytes(jobId, file, (p) => setUpload({ name: file.name, pct: p.pct }));
      const kind = mediaKindFor(file.type, file.name);
      const res = await fetch('/api/admin/jobs/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          file_id: bytes.file_id,
          storage_path: bytes.storage_path,
          storage_bucket: bytes.storage_bucket,
          file_name: file.name,
          file_type: fileTypeFor(kind, file.name),
          file_size: file.size,
          mime_type: file.type,
          section: sectionFor(kind),
          description: note,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${file.name} went up, but could not be filed in the job.`);
      }
      const body = (await res.json()) as { file?: { id?: string } };
      return { jobFileId: String(body.file?.id ?? bytes.file_id), kind };
    } finally {
      setUpload(null);
    }
  }, [jobId]);

  const attachFiles = useCallback(async (files: File[]) => {
    const point = selected;
    if (!point || files.length === 0) return;
    await safeAction('attaching media to a map point', async () => {
      let attached = 0;
      for (const file of files) {
        try {
          const { jobFileId } = await uploadIntoJob(file, `Attached to ${pointLabel(point)}`);
          const after = await safeFetch<MapPayload>(`/api/admin/jobs/${jobId}/property-map/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ point_id: point.id, job_file_id: jobFileId }),
          });
          if (after) { setPayload(after); attached += 1; }
        } catch (err) {
          reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'attach media' });
          addToast(err instanceof Error ? err.message : `Could not attach ${file.name}.`, 'error');
        }
      }
      if (attached > 0) addToast(`${attached} ${attached === 1 ? 'file' : 'files'} attached.`, 'success');
    });
  }, [selected, jobId, safeAction, safeFetch, reportPageError, addToast, uploadIntoJob]);

  const onVoiceNote = useCallback((blob: Blob) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    void attachFiles([new File([blob], `voice-note-${stamp}.webm`, { type: 'audio/webm' })]);
  }, [attachFiles]);

  // ── CREATING THE MAP, AND REPLACING ITS AERIAL ───────────────────────────────────────────────
  const createMap = useCallback(async (file: File) => {
    await safeAction('creating the property map', async () => {
      try {
        const [{ jobFileId }, size] = await Promise.all([
          uploadIntoJob(file, 'Aerial for the interactive property map'),
          readImageSize(file),
        ]);
        const created = await safeFetch<MapPayload>(`/api/admin/jobs/${jobId}/property-map`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Property map',
            file_id: jobFileId,
            image_width: size.width,
            image_height: size.height,
          }),
        });
        if (!created) { addToast('The aerial uploaded, but the map could not be created.', 'error'); return; }
        setPayload(created);
        setEditing(true);
        addToast('Interactive map created. Place your first point.', 'success');
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Could not create the map.', 'error');
      }
    });
  }, [jobId, safeAction, safeFetch, addToast, uploadIntoJob]);

  const replaceAerial = useCallback(async (file: File) => {
    if (!map) return;
    await safeAction('replacing the aerial', async () => {
      try {
        const [{ jobFileId }, size] = await Promise.all([
          uploadIntoJob(file, 'Aerial for the interactive property map'),
          readImageSize(file),
        ]);
        await mutate(
          'replace the aerial',
          `/api/admin/jobs/${jobId}/property-map`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              map_id: map.id, file_id: jobFileId, image_width: size.width, image_height: size.height,
            }),
          },
          'Aerial updated. Every pin kept its place.',
        );
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Could not replace the aerial.', 'error');
      }
    });
  }, [map, jobId, safeAction, mutate, addToast, uploadIntoJob]);

  // ── THE HOVER PREVIEW, CLAMPED SO IT NEVER LEAVES THE PICTURE ────────────────────────────────
  const popup = useMemo(() => {
    const p = points.find((x) => x.id === hoverId);
    if (!p || !frame.width || !frame.height) return null;
    const px = liveAt(p).x * frame.width;
    const py = liveAt(p).y * frame.height;
    const maxLeft = Math.max(4, frame.width - POPUP_WIDTH - 4);
    const above = py > frame.height * 0.55;
    return {
      point: p,
      left: Math.min(Math.max(px - POPUP_WIDTH / 2, 4), maxLeft),
      top: above ? py - 22 : py + 22,
      above,
    };
  }, [hoverId, points, frame, liveAt]);

  // ── RENDER ───────────────────────────────────────────────────────────────────────────────────
  const backHref = `/admin/jobs/${jobId}`;

  if (loading) {
    return (
      <div className="pmap" data-testid="pmap-loading">
        <div className="pmap__head">
          <div>
            <Link className="pmap__back" href={backHref}><ChevronLeft size={14} aria-hidden /> Back to the job</Link>
            <h1 className="pmap__title">Property map</h1>
          </div>
        </div>
        <div className="pmap__body">
          <div className="pmap__main"><div className="pmap__skeleton pmap__sk-map" /></div>
          <div className="pmap__side">
            {[0, 1, 2, 3, 4].map((n) => <div className="pmap__skeleton pmap__sk-row" key={n} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!map) {
    return (
      <div className="pmap" data-testid="pmap-empty">
        <div className="pmap__head">
          <div>
            <Link className="pmap__back" href={backHref}><ChevronLeft size={14} aria-hidden /> Back to the job</Link>
            <h1 className="pmap__title">Property map</h1>
            <p className="pmap__subtitle">Nothing here yet.</p>
          </div>
        </div>
        <div className="pmap__empty">
          <div>
            <strong>Create Interactive Map</strong>
            <p>
              Upload an aerial or satellite view of the property, then drop numbered points on it for
              the things that matter — monuments found, encroachments, the gate the truck fits
              through. Each point holds notes, photos, video and voice notes, so somebody who was
              never on the property can open this and understand it.
            </p>
            {upload && <p className="pmap__progress">Uploading {upload.name} — {upload.pct}%</p>}
          </div>
          <div>
            <input
              ref={aerialRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="pmap-aerial-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void createMap(file);
              }}
            />
            <button
              className="pmap__btn pmap__btn--primary"
              type="button"
              disabled={Boolean(upload)}
              data-testid="pmap-create"
              onClick={() => aerialRef.current?.click()}
            >
              <Upload size={14} aria-hidden /> {upload ? 'Uploading…' : 'Create Interactive Map'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pmap" data-testid="pmap">
      <div className="pmap__head">
        <div>
          <Link className="pmap__back" href={backHref} data-testid="pmap-back">
            <ChevronLeft size={14} aria-hidden /> Back to the job
          </Link>
          <h1 className="pmap__title">{map.title}</h1>
          <p className="pmap__subtitle">
            {points.length} {points.length === 1 ? 'point' : 'points'}
            {listed.length !== points.length ? ` · ${listed.length} shown` : ''}
            {' · '}{editing ? 'Editing' : 'Viewing'}
          </p>
        </div>
        <div className="pmap__head-actions">
          {!editing ? (
            <button
              className="pmap__btn pmap__btn--primary"
              type="button"
              data-testid="pmap-edit"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} aria-hidden /> Edit map
            </button>
          ) : (
            <button
              className="pmap__btn"
              type="button"
              data-testid="pmap-done"
              onClick={() => { setEditing(false); setPlacing(false); }}
            >
              Done
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="pmap__banner" role="status" data-testid="pmap-edit-banner">
          <span className="pmap__banner-text">
            <Pencil size={14} aria-hidden /> Edit mode
            <span className="pmap__banner-hint">
              {placing ? 'Click the aerial to place a point.' : 'Drag a pin to move it. Escape leaves edit mode.'}
            </span>
          </span>
          <span className="pmap__banner-actions">
            <button
              className={`pmap__btn${placing ? ' pmap__btn--primary' : ''}`}
              type="button"
              disabled={busy}
              data-testid="pmap-add-point"
              onClick={() => setPlacing((v) => !v)}
            >
              <Plus size={14} aria-hidden /> {placing ? 'Cancel placing' : 'Add point'}
            </button>
            <input
              ref={aerialRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="pmap-aerial-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void replaceAerial(file);
              }}
            />
            <button
              className="pmap__btn"
              type="button"
              disabled={Boolean(upload)}
              data-testid="pmap-replace-aerial"
              onClick={() => aerialRef.current?.click()}
            >
              <Upload size={14} aria-hidden /> Replace aerial
            </button>
            <button className="pmap__btn" type="button" data-testid="pmap-done-banner" onClick={() => { setEditing(false); setPlacing(false); }}>
              Done
            </button>
          </span>
        </div>
      )}

      <div className="pmap__toolbar">
        <button
          className={`pmap__toggle${prefs.labels ? ' pmap__toggle--on' : ''}`}
          type="button"
          aria-pressed={prefs.labels}
          data-testid="pmap-toggle-labels"
          onClick={() => savePrefs({ ...prefs, labels: !prefs.labels })}
        >
          <Tag size={12} aria-hidden /> Labels {prefs.labels ? 'on' : 'off'}
        </button>
        <button
          className={`pmap__toggle${prefs.numbers ? ' pmap__toggle--on' : ''}`}
          type="button"
          aria-pressed={prefs.numbers}
          data-testid="pmap-toggle-numbers"
          onClick={() => savePrefs({ ...prefs, numbers: !prefs.numbers })}
        >
          <Hash size={12} aria-hidden /> Numbers {prefs.numbers ? 'on' : 'off'}
        </button>
        <span className="pmap__search">
          <Search size={13} aria-hidden />
          <input
            className="pmap__search-input"
            type="search"
            value={search}
            placeholder="Search points, notes, captions…"
            aria-label="Search the points on this map"
            data-testid="pmap-search"
            onChange={(e) => setSearch(e.target.value)}
          />
        </span>
      </div>

      {legend.length > 0 && (
        <div className="pmap__legend" data-testid="pmap-legend">
          {legend.map((t) => {
            const off = prefs.hiddenTypes.includes(t.id);
            const Icon = ICON_BY_NAME[t.icon] ?? MapPin;
            return (
              <button
                key={t.id}
                type="button"
                className={`pmap__legend-chip${off ? ' pmap__legend-chip--off' : ''}`}
                style={swatchVars(t.token)}
                aria-pressed={!off}
                title={t.hint}
                data-testid={`pmap-legend-${t.id}`}
                onClick={() => toggleType(t.id)}
              >
                <span className="pmap__legend-swatch" aria-hidden />
                <Icon size={12} aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="pmap__body">
        <div className="pmap__main">
          <div className="pmap__stage">
            <div
              ref={frameRef}
              className={`pmap__frame${editing && placing ? ' pmap__frame--placing' : ''}`}
              onClick={onFrameClick}
              data-testid="pmap-frame"
            >
              {payload?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="pmap__aerial"
                  src={payload.imageUrl}
                  alt={`Aerial view for ${map.title}`}
                  decoding="async"
                  onLoad={measure}
                  draggable={false}
                />
              ) : (
                <div className="pmap__no-aerial" data-testid="pmap-no-aerial">
                  This map has no aerial yet. Use <strong>Edit map → Replace aerial</strong> to add one.
                </div>
              )}

              {onMap.map((p) => {
                const type = pointType(p.pointType);
                const Icon = ICON_BY_NAME[type.icon] ?? MapPin;
                const at = liveAt(p);
                const active = hoverId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={[
                      'pmap__pin',
                      `pmap__pin--${p.pointType}`,
                      editing ? 'pmap__pin--editing' : '',
                      drag?.id === p.id ? 'pmap__pin--dragging' : '',
                      selectedId === p.id ? 'pmap__pin--selected' : '',
                      active ? 'pmap__pin--active' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ ...pinStyle(at), ...pinVars(p.pointType) }}
                    title={pointLabel(p)}
                    aria-label={`${pointLabel(p)} — ${type.label}. ${mediaSummary(p.media)}`}
                    aria-pressed={selectedId === p.id}
                    data-point-id={p.id}
                    data-testid={`pmap-pin-${p.ordinal}`}
                    onClick={(e) => { e.stopPropagation(); onPinClick(p); }}
                    onPointerDown={(e) => onPinDown(e, p)}
                    onPointerMove={(e) => onPinMove(e, p)}
                    onPointerUp={() => { void onPinUp(p); }}
                    onPointerCancel={() => setDrag(null)}
                    onMouseEnter={() => setHoverId(p.id)}
                    onMouseLeave={() => setHoverId((cur) => (cur === p.id ? null : cur))}
                    onFocus={() => setHoverId(p.id)}
                    onBlur={() => setHoverId((cur) => (cur === p.id ? null : cur))}
                  >
                    <span className="pmap__pin-dot">
                      <Icon size={11} strokeWidth={2.5} aria-hidden />
                      {prefs.numbers && <span className="pmap__pin-num">{p.ordinal}</span>}
                    </span>
                    {prefs.labels && <span className="pmap__pin-label">{p.title}</span>}
                  </button>
                );
              })}

              {popup && (
                <div
                  className={`pmap__popup${popup.above ? ' pmap__popup--above' : ''}`}
                  style={{ left: `${popup.left}px`, top: `${popup.top}px` }}
                  data-testid="pmap-popup"
                >
                  <div className="pmap__popup-title">{pointLabel(popup.point)}</div>
                  <div className="pmap__popup-meta">
                    {pointType(popup.point.pointType).label} · {mediaSummary(popup.point.media)}
                  </div>
                  {popup.point.notes && <p className="pmap__popup-notes">{popup.point.notes}</p>}
                  {popup.point.media.length > 0 && (
                    <div className="pmap__popup-thumbs">
                      {sortMedia(popup.point.media).slice(0, 3).map((m) => (
                        m.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={m.id}
                            className="pmap__popup-thumb"
                            src={m.thumbUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="pmap__popup-more" key={m.id}>
                            {(() => { const K = KIND_ICON[m.kind]; return <K size={14} aria-hidden />; })()}
                          </span>
                        )
                      ))}
                      {popup.point.media.length > 3 && (
                        <span className="pmap__popup-more">+{popup.point.media.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pmap__side">
          <div className="pmap__side-head">Points ({listed.length})</div>
          <ul className="pmap__list" ref={listRef} data-testid="pmap-list">
            {listed.length === 0 && (
              <li className="pmap__row-empty">
                {points.length === 0
                  ? 'No points yet. Turn on Edit map and click the aerial to place the first one.'
                  : 'Nothing matches that search or filter.'}
              </li>
            )}
            {listed.map((p) => {
              const type = pointType(p.pointType);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={[
                      'pmap__row',
                      selectedId === p.id ? 'pmap__row--selected' : '',
                      hoverId === p.id ? 'pmap__row--active' : '',
                    ].filter(Boolean).join(' ')}
                    style={pinVars(p.pointType)}
                    data-point-id={p.id}
                    data-testid={`pmap-row-${p.ordinal}`}
                    aria-pressed={selectedId === p.id}
                    onClick={() => setSelectedId((cur) => (cur === p.id ? null : p.id))}
                    onMouseEnter={() => setHoverId(p.id)}
                    onMouseLeave={() => setHoverId((cur) => (cur === p.id ? null : cur))}
                    onFocus={() => setHoverId(p.id)}
                    onBlur={() => setHoverId((cur) => (cur === p.id ? null : cur))}
                  >
                    <span className="pmap__row-num">{p.ordinal}</span>
                    <span className="pmap__row-main">
                      <span className="pmap__row-title">{p.title}</span>
                      <span className="pmap__row-meta">
                        <span className="pmap__chip">
                          <span className="pmap__chip-dot" aria-hidden />
                          {type.label}
                        </span>
                        <span>{mediaSummary(p.media)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ── THE DETAIL PANEL ────────────────────────────────────────────────────────────────── */}
      <aside
        className={`pmap__detail${selected ? ' pmap__detail--open' : ''}`}
        aria-hidden={!selected}
        aria-label="Point details"
        data-testid="pmap-detail"
        onDragOver={(e) => { if (editing && selected) { e.preventDefault(); setDropOver(true); } }}
        onDragLeave={() => setDropOver(false)}
        onDrop={(e) => {
          if (!editing || !selected) return;
          e.preventDefault();
          setDropOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) void attachFiles(files);
        }}
      >
        {selected && (
          <>
            <div className="pmap__detail-head">
              <div>
                <h2 className="pmap__detail-title">{pointLabel(selected)}</h2>
                <p className="pmap__detail-sub">
                  {pointType(selected.pointType).label} · {mediaSummary(selected.media)}
                </p>
              </div>
              <button
                className="pmap__btn pmap__btn--ghost"
                type="button"
                aria-label="Close point details"
                data-testid="pmap-detail-close"
                onClick={() => setSelectedId(null)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            <div className="pmap__detail-body">
              {editing ? (
                <>
                  <div className="pmap__field">
                    <label className="pmap__label" htmlFor="pmap-title">Title</label>
                    <input
                      id="pmap-title"
                      ref={titleRef}
                      className="pmap__input"
                      value={draft?.title ?? ''}
                      data-testid="pmap-title-input"
                      onChange={(e) => setDraft((d) => ({ title: e.target.value, notes: d?.notes ?? '' }))}
                    />
                  </div>
                  <div className="pmap__field">
                    <label className="pmap__label" htmlFor="pmap-notes">Notes</label>
                    <textarea
                      id="pmap-notes"
                      className="pmap__textarea"
                      value={draft?.notes ?? ''}
                      placeholder="What is here, and why it matters."
                      data-testid="pmap-notes-input"
                      onChange={(e) => setDraft((d) => ({ title: d?.title ?? '', notes: e.target.value }))}
                    />
                    <p className="pmap__hint">Clearing this removes the notes from the point entirely.</p>
                  </div>
                  <div className="pmap__field">
                    <label className="pmap__label" htmlFor="pmap-type">Type</label>
                    <select
                      id="pmap-type"
                      className="pmap__select"
                      value={selected.pointType}
                      data-testid="pmap-type-select"
                      onChange={(e) => void patchPoint(selected.id, { point_type: e.target.value as PointTypeId }, 'Type changed.')}
                    >
                      {POINT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <p className="pmap__hint">{pointType(selected.pointType).hint}</p>
                  </div>
                  <div className="pmap__field">
                    <label className="pmap__label" htmlFor="pmap-status">Status</label>
                    <select
                      id="pmap-status"
                      className="pmap__select"
                      value={selected.status}
                      data-testid="pmap-status-select"
                      onChange={(e) => void patchPoint(selected.id, { status: e.target.value as PointStatus }, 'Status changed.')}
                    >
                      {POINT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>

                  <div className="pmap__row-actions">
                    <button
                      className="pmap__btn pmap__btn--primary"
                      type="button"
                      disabled={busy || !draft || !draft.title.trim()}
                      data-testid="pmap-save-point"
                      onClick={() => draft && void patchPoint(selected.id, { title: draft.title, notes: draft.notes }, 'Point saved.')}
                    >
                      Save changes
                    </button>
                    {confirmPoint === selected.id ? (
                      <>
                        <button
                          className="pmap__btn pmap__btn--danger"
                          type="button"
                          disabled={busy}
                          data-testid="pmap-delete-confirm"
                          onClick={() => void deletePoint(selected.id)}
                        >
                          <Trash2 size={14} aria-hidden /> Really delete
                        </button>
                        <button className="pmap__btn" type="button" onClick={() => setConfirmPoint(null)}>Keep it</button>
                      </>
                    ) : (
                      <button
                        className="pmap__btn pmap__btn--danger"
                        type="button"
                        data-testid="pmap-delete-point"
                        onClick={() => setConfirmPoint(selected.id)}
                      >
                        <Trash2 size={14} aria-hidden /> Delete point
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="pmap__section-title">Notes</h3>
                  <p className="pmap__notes">{selected.notes || 'No notes on this point.'}</p>
                </>
              )}

              {selected.lat !== null && selected.lng !== null && (
                <p className="pmap__hint">
                  <a
                    className="pmap__back"
                    href={mapsHref(selected.lat, selected.lng)}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="pmap-maps-link"
                  >
                    <ExternalLink size={13} aria-hidden /> Open in Google Maps
                  </a>
                </p>
              )}

              <h3 className="pmap__section-title">Attachments</h3>
              {selected.media.length === 0 ? (
                <p className="pmap__hint">Nothing attached to this point yet.</p>
              ) : (
                <div className="pmap__media" data-testid="pmap-media">
                  {sortMedia(selected.media).map((m) => (
                    <MediaTile
                      key={m.id}
                      media={m}
                      editing={editing}
                      confirming={confirmMedia === m.id}
                      onOpen={() => m.url && setViewing({ url: m.url, name: m.name, type: m.mimeType ?? undefined })}
                      onAskDetach={() => setConfirmMedia(m.id)}
                      onCancelDetach={() => setConfirmMedia(null)}
                      onDetach={() => void detachMedia(selected.id, m.id)}
                    />
                  ))}
                </div>
              )}

              {editing && (
                <div className={`pmap__drop${dropOver ? ' pmap__drop--over' : ''}`} data-testid="pmap-drop">
                  Drag photos, video or audio here to attach them to this point.
                  <div className="pmap__drop-actions">
                    <input
                      ref={attachRef}
                      type="file"
                      multiple
                      accept="image/*,video/*,audio/*"
                      hidden
                      data-testid="pmap-attach-input"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        if (files.length) void attachFiles(files);
                      }}
                    />
                    <button
                      className="pmap__btn"
                      type="button"
                      disabled={Boolean(upload)}
                      data-testid="pmap-attach"
                      onClick={() => attachRef.current?.click()}
                    >
                      <Upload size={14} aria-hidden /> Choose files
                    </button>
                    {/* The fieldbook's recorder, unchanged: a pin with a fifteen-second "this
                        corner was under a brush pile" is worth a paragraph nobody will type. */}
                    <AudioRecorder onRecordingComplete={onVoiceNote} />
                  </div>
                  {upload && <p className="pmap__progress">Uploading {upload.name} — {upload.pct}%</p>}
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      <MediaViewer media={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

/** One attachment. Thumbnails are lazy and decode off the main thread; video never preloads more
 *  than its metadata, which is the difference between opening a point and pulling 40 MB nobody
 *  asked for. Audio plays right here — a fifteen-second voice note is not worth a full-screen
 *  player. */
function MediaTile({
  media, editing, confirming, onOpen, onAskDetach, onCancelDetach, onDetach,
}: {
  media: PointMedia;
  editing: boolean;
  confirming: boolean;
  onOpen: () => void;
  onAskDetach: () => void;
  onCancelDetach: () => void;
  onDetach: () => void;
}) {
  const Kind = KIND_ICON[media.kind];

  if (media.kind === 'audio') {
    return (
      <div className="pmap__audio" data-testid={`pmap-audio-${media.id}`}>
        <span className="pmap__audio-name">
          <span><Mic size={12} aria-hidden /> {media.caption || media.name}</span>
          {editing && (
            confirming ? (
              <span>
                <button className="pmap__tile-detach" type="button" onClick={onDetach} data-testid={`pmap-detach-confirm-${media.id}`}>Really detach</button>
                {' '}
                <button className="pmap__btn pmap__btn--ghost" type="button" onClick={onCancelDetach}>Keep</button>
              </span>
            ) : (
              <button className="pmap__tile-detach" type="button" onClick={onAskDetach} data-testid={`pmap-detach-${media.id}`}>Detach</button>
            )
          )}
        </span>
        <audio controls preload="metadata" src={media.url ?? undefined}>
          Your browser cannot play this recording.
        </audio>
      </div>
    );
  }

  return (
    <div className="pmap__tile-wrap">
      <button className="pmap__tile" type="button" onClick={onOpen} data-testid={`pmap-media-${media.id}`}>
        {media.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="pmap__tile-img"
            src={media.thumbUrl}
            alt={media.caption || media.name}
            loading="lazy"
            decoding="async"
          />
        ) : media.kind === 'video' && media.url ? (
          <video className="pmap__tile-img" src={media.url} preload="metadata" muted playsInline />
        ) : (
          <span className="pmap__tile-blank"><Kind size={22} aria-hidden /></span>
        )}
        <span className="pmap__tile-name">{media.caption || media.name}</span>
      </button>
      <span className="pmap__tile-kind"><Kind size={10} aria-hidden /> {media.kind}</span>
      {editing && (
        confirming ? (
          <button className="pmap__tile-detach" type="button" onClick={onDetach} data-testid={`pmap-detach-confirm-${media.id}`}>
            Really detach
          </button>
        ) : (
          <button className="pmap__tile-detach" type="button" onClick={onAskDetach} data-testid={`pmap-detach-${media.id}`}>
            <X size={10} aria-hidden /> Detach
          </button>
        )
      )}
    </div>
  );
}
