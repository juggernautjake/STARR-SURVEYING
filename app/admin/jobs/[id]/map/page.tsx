// app/admin/jobs/[id]/map/page.tsx — the interactive property map.
//
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
//
// Owner, 2026-09-16: "whenever the user looks at the map, they will be able to see all of the
// points of interest … There will be list on the side of all of them so the user can find the point
// both on the map itself and in the list of points … if the user highlights or clicks a point on
// the map, then that same point in the list should also be highlighted or selected, and vice versa."
//
// And, the same day, the four SHAPES a point can be: "a point that is just a single point on the
// map … a point that has a field of view feature … for pictures that are taken and the uploader
// wanted to show where they were and what direction they were facing … a mechanic where the user
// create the first point, then can click to draw connected lines that represent what path they
// walked … The user would need to be able to define the field of view too, how wide or narrow it is
// and in what direction from the point." And: "make them easy to learn and use."
//
// ── THE FOUR DECISIONS THIS FILE IS MADE OF ────────────────────────────────────────────────────
//
// 1. ALL OF THE RULES LIVE NEXT DOOR. Where a pin goes, what number it wears, what colour and icon
//    its type carries, which attachments sort first, what the summary line says — and every angle,
//    arc, handle position and SVG path the shapes need — is a pure function in
//    `lib/jobs/property-map.ts` / `lib/jobs/property-map-shapes.ts`, tested without a browser. There
//    is not one line of trigonometry in this file. When it wants to know something, it asks.
//
// 2. ONE PIECE OF SELECTION STATE. `selectedId` and `hoverId` drive the map AND the list AND the
//    shapes drawn over the aerial. There is no "selected pin" separate from "selected row" to drift
//    apart, which is the bug the owner described in advance by asking for both directions of the
//    same behaviour.
//
// 3. EVERY MUTATION RETURNS THE WHOLE MAP. The API is built that way on purpose, so the client
//    never merges a partial update into its own copy — `setPayload(response)` and the list, the
//    pins, the shapes, the numbering and every signed URL are correct together.
//
// 4. THE INSTRUCTIONS ARE ON THE SCREEN WHILE YOU DRAW. "Easy to learn" is not a help page nobody
//    opens; it is `POINT_GEOMETRIES[n].howTo` in a bar that stays up the whole time the shape is
//    being drawn, next to a Finish button that says why it is not available yet.
//
// View mode is the default and can change nothing. Edit mode is a deliberate switch with a banner
// across the page, because the cost of not knowing which one you are in is a pin moved on somebody
// else's survey.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle, Camera, Check, ChevronDown, ChevronLeft, ChevronUp, Compass, Crosshair, DoorOpen,
  ExternalLink, Eye, Fence, FileText, Folder, GripVertical, Hash, Hexagon, Home, MapPin, Maximize2,
  Mic, Minus, Music, Pencil, Plus, Route, Search, ShieldAlert, Spline, Tag, Target, Trash2, Trees,
  Undo2, Upload, Video, Waves, X, Zap, type LucideIcon,
} from 'lucide-react';

import { usePageError } from '@/app/admin/hooks/usePageError';
import { useToast } from '@/app/admin/components/Toast';
import SharedFileViewer from '@/app/admin/components/files/FileViewer';
import InlineRename from '@/app/admin/components/files/InlineRename';
import Tooltip from '@/app/admin/research/components/Tooltip';
import AudioRecorder from '@/app/admin/components/fieldbook/AudioRecorder';
import { usePageTitle } from '@/lib/admin/page-title';
import { formatBytes } from '@/app/admin/components/files/format';
import { uploadJobFileBytes } from '@/lib/jobs/upload-client';
import { detectJobFileType } from '@/lib/files/job-folders';
import type { ViewerCapabilities, ViewerCollection, ViewerFile } from '@/lib/files/viewer-model';
import {
  THUMB_MIME, THUMB_QUALITY, needsThumb, posterTime, thumbSize, type ThumbState,
} from '@/lib/jobs/file-thumbnails';
import type { LibraryFile } from '@/lib/jobs/property-map-server';
import {
  DEFAULT_POINT_TYPE, POINT_STATUSES, POINT_TYPES, clampToImage, filterPoints, mapsHref,
  mediaKindFor, mediaSummary,
  pinStyle, pointLabel, pointType, relativeFromClick, sortMedia, typesInUse,
  type MapPoint, type MediaKind, type PointMedia, type PointStatus, type PointTypeId,
  type PropertyMap, type RelativePoint,
} from '@/lib/jobs/property-map';
import {
  DEFAULT_GEOMETRY,
  FOV_DEFAULT_DEG, FOV_DEFAULT_RADIUS, FOV_MAX_DEG, FOV_MIN_DEG, FOV_PRESETS, POINT_GEOMETRIES,
  SQUARE, appendVertex, bearingBetween, bearingLabel, clampBearing, clampFovDeg, clampFovRadius,
  fovAimHandle, fovDegFromHandle, fovPath, fovWidthHandle, geometryOf, isDrawable, radiusBetween,
  shapeLabelAt, shapePoints, shapePointsAttr, shapeSummary,
  type GeometryId, type ImageBox,
} from '@/lib/jobs/property-map-shapes';

import './PropertyMap.css';

/** Exactly what `GET /api/admin/jobs/[id]/property-map` answers, and what every mutating call
 *  answers too. One shape, so a response is always just the new state. */
interface MapPayload {
  map: PropertyMap | null;
  points: MapPoint[];
  imageUrl: string | null;
}

/** `POINT_TYPES` and `POINT_GEOMETRIES` name their icons as STRINGS so the pure modules stay free of
 *  React. This is the one place that turns those names back into components — an unknown name falls
 *  back to the generic pin rather than rendering nothing, so a type or a shape added by a newer
 *  deploy still draws. */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  MapPin, Spline, Crosshair, Target, Home, Zap, Fence, Camera, DoorOpen, AlertTriangle, Waves,
  Trees, Route, ShieldAlert, Video, Hexagon,
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

// ── THE FILE PANEL ──────────────────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-16: "we need all of the job files, photos, videos, audio files, etc to be available
// to us to see in a panel next to the map while we are building the interactive map … We should be
// able to grab the thumbnail/preview of the file … and drag it to a point, or open up a point's
// panel and it should have a drop box that we can then drag the files into … once a file has been
// assigned to a point, it cannot be assigned to another point. It will still be in the … panel, but
// it will be a bit transparent and marked as already assigned … Please build this all out so that I
// can start placing points and then adding data to them very quickly and easily!"
//
// ── THE THREE DECISIONS THE PANEL IS MADE OF ───────────────────────────────────────────────────
//
// 1. THE PANEL IS ON THE LEFT, NOT THE RIGHT. The detail drawer is fixed to the right edge and
//    covers whatever is under it — so a file panel on the right would be hidden at exactly the
//    moment a point's drop box is open and somebody wants to drag into it. Left of the aerial, the
//    tiles and the drop box are on screen together.
//
// 2. DRAG IS THE FAST PATH, NOT THE ONLY PATH. HTML5 drag-and-drop does not exist on a phone and
//    cannot be driven from a keyboard. So every assignment goes through ONE function, and three
//    gestures reach it: a drag onto a target, a tap that arms a tile and a second tap on a target,
//    and Enter on the tile followed by Enter on a pin. Arming is the same state for touch and for
//    the keyboard, which is why there is only one of it.
//
// 3. THE TILE GOES GREY THE INSTANT IT IS DROPPED. "Assigning should feel like dealing cards" is a
//    latency requirement: the answer comes back with the whole map in it, which is not free, and a
//    tile that waits for it reads as a drop that did not take. It greys optimistically and comes
//    back if the request fails.

/** The drag payload. A private MIME type, so a photo dragged out of the desktop's file manager and
 *  a tile dragged out of this panel can never be mistaken for one another — the first uploads, the
 *  second only links. */
const FILE_DRAG_TYPE = 'application/x-starr-file';

/** How long a tile flashes after a 409, in ms. Long enough to find with your eye, short enough that
 *  the next drag is not waiting on it. */
const FLASH_MS = 1800;

/** The order the panel groups kinds in, and what each group is called. Photographs first because on
 *  a survey there are ten of them for every other thing. */
const KIND_ORDER: readonly MediaKind[] = ['image', 'video', 'audio', 'document'];
const KIND_LABEL: Record<MediaKind, string> = {
  image: 'Photos', video: 'Video', audio: 'Audio', document: 'Documents',
};
const KIND_ONE: Record<MediaKind, string> = {
  image: 'Photo', video: 'Video', audio: 'Audio', document: 'Document',
};

/** A file the panel is waiting on, or one the server refused. */
interface Conflict {
  fileId: string;
  message: string;
  pointId: string | null;
}

/** What the "On 4" chip says. A file held by a point on ANOTHER map of the same job comes back with
 *  an ordinal of 0 — the constraint is job-wide, the numbering is not — and "On 0" is a lie, so
 *  that case says so plainly instead. */
function assignedChip(file: LibraryFile): string {
  const ord = file.assignedTo?.ordinal ?? 0;
  return ord > 0 ? `On ${ord}` : 'Assigned';
}

/** Unplaced first, then newest first — the panel is a to-do list, and the thing most likely to be
 *  wanted next is the photograph that came off the camera last. */
function sortLibrary(files: LibraryFile[]): LibraryFile[] {
  return [...files].sort((a, b) => {
    const placed = Number(Boolean(a.assignedTo)) - Number(Boolean(b.assignedTo));
    if (placed !== 0) return placed;
    return String(b.uploadedAt ?? '').localeCompare(String(a.uploadedAt ?? ''));
  });
}

// ── THE PREVIEWS ARE MADE HERE, IN THIS BROWSER ─────────────────────────────────────────────────
//
// Owner, 2026-09-16: "we need to make it so that we can see the first page thumbnail and poster
// frames for videos."
//
// The deployment has no PDF renderer and no video decoder. Every browser that opens this panel has
// both. So the panel makes the previews that do not exist yet and posts them to
// `POST …/property-map/thumbnail`, which keeps them for everybody else — the work happens once per
// file for the whole company rather than once per person per visit.
//
// WHAT A PREVIEW IS ALLOWED TO BE is not decided here. `lib/jobs/file-thumbnails.ts` owns every
// number — which kinds can have one, how big it may be, what format and quality, and where in a
// clip the frame is grabbed from — and is tested without a browser. Not one of those values is
// repeated in this file; they are imported.
//
// ── THE THREE RULES THE QUEUE IS BUILT AROUND ──────────────────────────────────────────────────
//
// 1. IT NEVER BLOCKS THE PANEL, AND NEVER BLOCKS A DRAG. A tile renders its icon immediately and
//    swaps the picture in when it arrives. Two files at a time: a job with two hundred photographs
//    must not open two hundred sockets, and rendering PDFs back to back on the main thread is how
//    a panel becomes unusable to drag out of.
//
// 2. ONE ATTEMPT PER FILE, PER SESSION, EVER. A file that fails posts `failed`, which is what stops
//    this panel — and every other person's — spending fifteen seconds on the same unopenable scan
//    forever. Within a session `thumbTriedRef` is the second half of that promise: a library
//    refresh after every assignment must not re-queue what is already in flight.
//
// 3. IT STOPS DEAD ON UNMOUNT. One AbortController for the whole queue: leaving the page rejects
//    the in-flight decode, cancels the POST, and the workers exit at their next check.

/** Two at a time. */
const THUMB_WORKERS = 2;

/** A PDF pdf.js cannot make sense of and a codec the browser will not decode both tend to HANG
 *  rather than fail, so every attempt carries its own deadline. Past it the file is reported as
 *  failed, which is the honest answer: this browser could not do it. */
const THUMB_TIMEOUT_MS = 15_000;

/** One file to make a preview of. Captured at the moment it is queued, so a worker never reads back
 *  into React state that has moved on under it. */
interface ThumbJob {
  id: string;
  url: string;
  kind: MediaKind;
  isPdf: boolean;
}

// ── pdf.js, loaded on first use ─────────────────────────────────────────────────────────────────
// Copied deliberately, line for line, from `app/admin/components/files/FileViewer.tsx`: the
// minified build, the worker served from /pdfjs/, the wasm and standard-font paths beside it. The
// comment there explains why each of those is not negotiable; duplicating the loader rather than
// exporting it keeps the viewer — which is the thing people actually read PDFs in — free of any
// dependency on this panel.

type PdfViewport = { width: number; height: number };
type PdfPage = {
  getViewport(o: { scale: number; rotation?: number }): PdfViewport;
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void>; cancel(): void };
};
type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfLib = {
  getDocument(src: { url: string; withCredentials?: boolean; wasmUrl?: string; standardFontDataUrl?: string }): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

const PDFJS_ASSETS = '/pdfjs/';
let pdfLibPromise: Promise<PdfLib> | null = null;
function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLibPromise) {
    // The MINIFIED build on purpose. pdf.mjs is itself a webpack bundle with its own
    // __webpack_require__; under next dev (eval-wrapped modules) that name collides with Next's and
    // module evaluation dies in __webpack_require__.r with 'Object.defineProperty called on
    // non-object' — while next build, which mangles names, passes. pdf.min.mjs has them mangled
    // already, so it evaluates the same way in both (2026-09-10).
    pdfLibPromise = import('pdfjs-dist/build/pdf.min.mjs').then((mod) => {
      const lib = mod as unknown as PdfLib;
      // The worker is a static file copied from node_modules by scripts/copy-pdfjs-assets.mjs
      // (prebuild/predev). Bundling it by URL worked in dev and failed the production build.
      lib.GlobalWorkerOptions.workerSrc = PDFJS_ASSETS + 'pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfLibPromise;
}

/** Documents here are PDFs; a .docx or a .dwg has no renderer in this browser either, which is why
 *  the shared rules decide by MIME and extension rather than by kind. */
function isPdfFile(file: { mimeType: string | null; name: string }): boolean {
  return (file.mimeType ?? '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** `crossOrigin` when — and only when — the bytes come from somewhere else. An <img> or <video>
 *  WITHOUT it taints the canvas and `toDataURL` throws a SecurityError; one WITH it against a
 *  server that answers no CORS headers refuses to load at all. Same origin needs neither. */
function crossOriginFor(url: string): 'anonymous' | undefined {
  if (url.startsWith('/')) return undefined;
  try {
    return new URL(url, window.location.href).origin === window.location.origin ? undefined : 'anonymous';
  } catch {
    return undefined;
  }
}

/** Paint a loaded image or a seeked video onto a canvas at the size the shared rules ask for, and
 *  hand back the data URL. `thumbSize` fits the long edge and never scales anything UP. */
function drawToThumb(source: CanvasImageSource, width: number, height: number): string {
  if (!width || !height) throw new Error('That file reported no dimensions.');
  const want = thumbSize(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = want.width;
  canvas.height = want.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2D canvas.');
  ctx.drawImage(source, 0, 0, want.width, want.height);
  return canvas.toDataURL(THUMB_MIME, THUMB_QUALITY);
}

/** Page one of a PDF, rendered at the scale `thumbSize` asks for rather than at a scale invented
 *  here — which is also what stops a small page being blown up into a blurrier file. */
async function pdfThumb(url: string, signal: AbortSignal): Promise<string> {
  const lib = await loadPdfLib();
  if (signal.aborted) throw new Error('The page was left.');
  const doc = await lib.getDocument({
    url,
    withCredentials: url.startsWith('/'),
    wasmUrl: PDFJS_ASSETS + 'wasm/',
    standardFontDataUrl: PDFJS_ASSETS + 'standard_fonts/',
  }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const want = thumbSize(base.width, base.height);
    const viewport = page.getViewport({ scale: want.width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser gave no 2D canvas.');
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (signal.aborted) throw new Error('The page was left.');
    return canvas.toDataURL(THUMB_MIME, THUMB_QUALITY);
  } finally {
    void doc.destroy();
  }
}

/** A poster frame: a detached <video> that loads its metadata only, seeks to where `posterTime`
 *  says the picture actually starts — never frame zero, which on a phone is a black frame or
 *  somebody's boot — and is painted onto a canvas once the seek lands. */
function videoThumb(url: string, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const cross = crossOriginFor(url);
    if (cross) video.crossOrigin = cross;

    let settled = false;
    const finish = (act: () => void) => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      // Let go of the bytes: a queue of 4K clips left attached is a hundred megabytes of nothing.
      video.removeAttribute('src');
      video.load();
      act();
    };
    const onMeta = () => {
      try {
        video.currentTime = posterTime(video.duration);
      } catch {
        finish(() => reject(new Error('That video would not seek.')));
      }
    };
    const onSeeked = () => {
      try {
        const shot = drawToThumb(video, video.videoWidth, video.videoHeight);
        finish(() => resolve(shot));
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };
    const onError = () => finish(() => reject(new Error('That video would not decode here.')));
    const onAbort = () => finish(() => reject(new Error('The page was left.')));

    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    video.src = url;
    video.load();
  });
}

/** Only ever reached for an image whose `thumbUrl` came back empty — normally an image falls back
 *  to itself and there is nothing to make. */
function imageThumb(url: string, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const img = new window.Image();
    const cross = crossOriginFor(url);
    if (cross) img.crossOrigin = cross;
    let settled = false;
    const finish = (act: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      act();
    };
    const onAbort = () => finish(() => reject(new Error('The page was left.')));
    img.onload = () => {
      try {
        const shot = drawToThumb(img, img.naturalWidth, img.naturalHeight);
        finish(() => resolve(shot));
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };
    img.onerror = () => finish(() => reject(new Error('That image would not load.')));
    signal.addEventListener('abort', onAbort, { once: true });
    img.src = url;
  });
}

/** Give a decode a deadline, and a way out when the page is left. */
function withDeadline<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('That preview took too long.')), ms);
    const onAbort = () => reject(new Error('The page was left.'));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    });
  });
}

// ── WHAT THE DEDICATED VIEWER IS HANDED ─────────────────────────────────────────────────────────
//
// Owner, 2026-09-16: "a user should be able to open and view the document/picture/video/audio file.
// Please make sure we can open the dedicated file viewer for the files."
//
// The dedicated viewer is `app/admin/components/files/FileViewer.tsx` — the ONE viewer every file
// surface in this admin uses — and the only thing it takes is a `ViewerCollection`
// (lib/files/viewer-model.ts). It reads a file's kind off the name and MIME itself, so neither
// mapper below has to tell it what it is looking at.

/** A file in the panel → a file in the viewer. */
function viewerFileFor(file: LibraryFile): ViewerFile {
  const on = file.assignedTo;
  return {
    id: file.id,
    name: file.name,
    mime: file.mimeType,
    size: file.sizeBytes,
    url: file.url,
    createdAt: file.uploadedAt,
    meta: [
      { label: 'Kind', value: KIND_ONE[file.kind] },
      // The panel's whole question — "where did this one end up?" — answered inside the viewer too,
      // so the answer does not require closing it. A file held by a point on ANOTHER map of the
      // same job has no ordinal here, which is why the title carries the sentence when it is 0.
      ...(on
        ? [{ label: 'Placed on', value: on.ordinal > 0 ? `Point ${on.ordinal} · ${on.title}` : (on.title || 'A point on another map of this job') }]
        : []),
    ],
  };
}

/** An attachment on a point → a file in the viewer. */
function viewerFileForMedia(media: PointMedia, where: string): ViewerFile {
  return {
    id: media.id,
    name: media.caption || media.name,
    mime: media.mimeType,
    size: media.sizeBytes,
    url: media.url,
    meta: [
      { label: 'Kind', value: KIND_ONE[media.kind] },
      { label: 'Placed on', value: where },
    ],
  };
}

/** A drag has to travel this far, in screen pixels, before it counts as a drag rather than a click.
 *  Below it, placing a cone is a plain click and gets the phone-camera defaults. */
const DRAG_SLOP = 6;

// ── ZOOM AND PAN ────────────────────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-16: "we need to be able to zoom in on the image and zoom out with the scroll
// wheel. Please make this a reality."
//
// ── THE ONE DECISION EVERYTHING ELSE FOLLOWS FROM ──────────────────────────────────────────────
//
// THE TRANSFORM IS ON THE FRAME, AND NOTHING SUBTRACTS IT BACK OUT. `.pmap__frame` gets a
// `translate(…) scale(…)`, and `relativeFromClick()` goes on measuring that frame's
// `getBoundingClientRect()` — which already reflects the transform, because that is what a bounding
// rect IS. So a click at 6× lands on exactly the fraction of the picture that is under the cursor,
// with no zoom arithmetic anywhere near the placement path. Every attempt to "correct" a click for
// the current zoom is a bug waiting for the day the two copies of the maths disagree.
//
// The maths that IS here — where a wheel notch leaves the picture — deliberately never reads a
// transformed rect either. It reads `offsetLeft` and `offsetWidth`, which are layout and do not see
// a transform, so the current pan can be added to them rather than having to be teased out of them.
//
// ── THE PICTURE TRANSFORMS. THE MARKS DO NOT. ──────────────────────────────────────────────────
//
// This is the rule the whole overlay is built on, and it was arrived at the hard way, through three
// owner reports in one afternoon:
//
//   1. "All of the points and shapes and stuff should also zoom with the image" — so the pins were
//      put inside the transformed frame and left to ride it.
//   2. "when I zoom in, the points start to appear really big, which is not what I want … they
//      should be getting smaller as we zoom in, but they will appear to be the same size to the
//      viewer" — POSITION was what they meant, not size. So the pins were counter-scaled:
//      `scale(1 / zoom)` inside a parent scaled by `zoom`, which cancels to the right size.
//   3. "they are getting really fuzzy. like, they look clear as I am zooming in, but as soon as I
//      stop zooming they get fuzzy. they get fuzzier the more I zoom in."
//
// The third report is what makes the second fix wrong, and no amount of `will-change`,
// `translateZ(0)` or backface tricks would have saved it. A counter-scale is still a scale: the
// compositor rasterises the frame's subtree ONCE, at the layer's own resolution, and resamples that
// bitmap. At 8× a 26-pixel pin is drawn into about three pixels of texture and blown back up. The
// "clear while zooming, fuzzy when it stops" is exactly the signature of it — the layer is
// re-rasterised live during the gesture and then settles back onto the cached one.
//
// So the marks are not scaled at all. They are laid out in SCREEN space, at their natural size, in
// `.pmap__marks` — a sibling of the frame with NO transform on it or on any ancestor up to the
// stage — and positioned from `marks`, which is the frame's layout box with the zoom and the pan
// applied to it arithmetically. This is what every mapping library does, for this reason.
//
// WHAT LIVES WHERE, and the test is always "is this drawn ON the property, or ABOUT it?":
//   · in the frame, scaling: the aerial, and the shape GEOMETRY — the polyline of a walk, the
//     polygon of an area, the cone's wedge. A cone that kept its screen size would stop describing
//     the ground the camera saw. Their strokes hold steady via `vector-effect: non-scaling-stroke`,
//     which is the same principle applied inside SVG.
//   · in the marks overlay, not scaling: the numbered pins with their numbers and labels, every
//     drag handle, and the hover preview. A grab target that doubles at 2× is as wrong as one that
//     halves, and a label is for reading.
//
// `unit` needs no change for any of this, and the reason is worth keeping: the handles' SVG used to
// be `frame.width` wide inside a frame scaled by `zoom`, and is now `frame.width * zoom` wide with
// no transform. Same pixels per viewBox unit, both ways.

/** Fit, and eight times it. Past 8× an aerial is mush: the limit is the scan's resolution, not the
 *  viewer's. Below 1× is the fit, and there is nothing under the picture worth showing. */
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;

/** One wheel notch (deltaY ≈ 100) is about 16%. Multiplicative, so every notch feels the same size
 *  whether you are at 1× or at 6× — which additive steps famously do not. */
const ZOOM_RATE = 1.0015;

/** A trackpad fling arrives as ONE event with an enormous deltaY. Clamped per event so a flick
 *  travels a notch or two rather than the whole range in a single frame. */
const WHEEL_MAX_DELTA = 120;

/** What the +/− buttons, the keyboard and a double-click move by. */
const ZOOM_STEP = 1.5;

function clampZoomLevel(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** How the aerial is being looked at: the scale, and the translation in the stage's own pixels.
 *  `transform-origin` is the frame's top-left, so `x`/`y` are simply where that corner has moved. */
interface View {
  zoom: number;
  x: number;
  y: number;
}

const FIT_VIEW: View = { zoom: 1, x: 0, y: 0 };

/** The frame's box WITHOUT its transform, in client coordinates, beside the stage that clips it.
 *  `offsetLeft`/`offsetWidth` are layout: a transform is invisible to them, which is exactly why
 *  the zoom maths uses them and never a bounding rect. Requires the stage to be the frame's
 *  offset parent — `.pmap__stage { position: relative }` — which is asserted in the stylesheet. */
interface Boxes {
  stageLeft: number;
  stageTop: number;
  stageWidth: number;
  stageHeight: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

function readBoxes(stage: HTMLElement, frame: HTMLElement): Boxes {
  const s = stage.getBoundingClientRect();
  // `offsetLeft` is measured from the offset parent's PADDING edge, and `getBoundingClientRect`
  // from its BORDER edge. `clientLeft` is the border between them. Left out, the fit view comes
  // back one pixel — the stage's border width — off centre, which is small enough to ship and
  // exactly the kind of thing that is never found again. The stage's client box is used for the
  // clamping too, so both sides of every comparison are the same box.
  const stageLeft = s.left + stage.clientLeft;
  const stageTop = s.top + stage.clientTop;
  return {
    stageLeft,
    stageTop,
    stageWidth: stage.clientWidth,
    stageHeight: stage.clientHeight,
    left: stageLeft + frame.offsetLeft,
    top: stageTop + frame.offsetTop,
    width: frame.offsetWidth,
    height: frame.offsetHeight,
  };
}

/** Keep the picture where it can be seen.
 *
 *  Bigger than the stage: neither edge may come inside it, so there is never a band of empty
 *  background beside a zoomed-in aerial. Smaller than the stage (which is every zoom at or near the
 *  fit): it is simply centred, which is also what re-centres it the moment somebody zooms back
 *  out of a corner. */
function clampView(box: Boxes, next: View): View {
  const w = box.width * next.zoom;
  const h = box.height * next.zoom;
  const fl = box.left - box.stageLeft;
  const ft = box.top - box.stageTop;
  const x = w <= box.stageWidth
    ? (box.stageWidth - w) / 2 - fl
    : Math.min(-fl, Math.max(box.stageWidth - w - fl, next.x));
  const y = h <= box.stageHeight
    ? (box.stageHeight - h) / 2 - ft
    : Math.min(-ft, Math.max(box.stageHeight - h - ft, next.y));
  return { zoom: next.zoom, x, y };
}

/** THE ONE PIECE OF ZOOM ARITHMETIC. Whatever was under `from` on the screen ends up under `to`,
 *  at the new scale.
 *
 *  A local coordinate `u` in the untransformed frame is drawn at `box.left + x + zoom * u`. Read
 *  that backwards to find what `from` was pointing at, then forwards to find the `x` that puts it
 *  under `to`. Both gestures are this function: a wheel passes the same point twice (nothing under
 *  the cursor moves), a pinch passes the old finger midpoint and the new one (so two fingers that
 *  travel together pan, and two that spread also zoom, in one gesture and one calculation). */
function anchorTo(box: Boxes, from: View, zoom: number, fromX: number, fromY: number, toX: number, toY: number): View {
  const u = (fromX - box.left - from.x) / from.zoom;
  const v = (fromY - box.top - from.y) / from.zoom;
  return clampView(box, { zoom, x: toX - box.left - zoom * u, y: toY - box.top - zoom * v });
}

/** Zoom about a point on the screen, so whatever is under the cursor stays under the cursor. That
 *  is the whole difference between a map and a slideshow. */
function zoomAbout(box: Boxes, cur: View, factor: number, clientX: number, clientY: number): View {
  const zoom = clampZoomLevel(cur.zoom * factor);
  if (zoom === cur.zoom) return cur;
  return anchorTo(box, cur, zoom, clientX, clientY, clientX, clientY);
}

/** Handle sizes, in SCREEN pixels. The overlay's coordinates are the aerial's own pixels — a 4000px
 *  wide image drawn 800px wide — so every one of these is divided by that scale before it is used,
 *  or the handles on a big aerial come out five times too small to grab. */
const HANDLE_R = 9;
const VERTEX_R = 7;
const MIDPOINT_R = 6;
const BEND_R = 4;

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

/** The three numbers that make a cone. Held together because every one of the four ways of changing
 *  a cone — two handles, a number box, a slider — sets one and has to resend the other two. */
interface Cone {
  bearingDeg: number;
  fovDeg: number;
  fovRadius: number;
}

/** A shape being drawn right now. `anchor === null` means a shape has been PICKED but the first
 *  click has not happened yet — the state the how-to bar is written for. */
interface Draw {
  geometry: GeometryId;
  anchor: RelativePoint | null;
  vertices: RelativePoint[];
  bearingDeg: number;
  fovRadius: number;
}

/** Why Finish is not available yet, in the words of the thing still to do. A disabled button with no
 *  explanation is the commonest way a drawing tool feels broken. */
function whyNotDone(geometry: GeometryId, vertexCount: number): string | null {
  if (isDrawable(geometry, vertexCount)) return null;
  if (geometry === 'path') return 'Click where you walked to — a path needs at least two points.';
  const more = 2 - vertexCount;
  return `Click ${more} more ${more === 1 ? 'corner' : 'corners'} — an area needs three.`;
}

/** The smallest number of points a shape can keep, said out loud, for the moment somebody tries to
 *  delete one too many. */
function floorMessage(geometry: GeometryId): string {
  return geometry === 'area'
    ? 'An area needs at least three corners.'
    : 'A path needs at least two points.';
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

// ── A MAP LEFT OPEN ALL AFTERNOON HAS TO STILL WORK ─────────────────────────────────────────────
//
// The defect this exists for, 2026-09-17: the owner placed a second point and "everything broke" —
// a broken-image glyph where the aerial was, both pins piled into the top-left corner, the layout
// in ruins. Nothing was corrupted. The points were at sensible, distinct fractions and the aerial's
// row was intact. What had happened is that `loadPropertyMap` signs every URL for two hours, and
// somebody building a map sits on this page for longer than that. The moment the signature expired
// the `<img>` 403'd; the frame shrink-wraps that image, so it collapsed to nothing; and every pin
// positioned as a PERCENTAGE OF THAT FRAME landed on top of the others in the corner. A sleeping
// laptop, a deploy mid-session and a dropped connection all produce the identical picture.
//
// Three defences, in order of how much they cost:
//
//   1. DO NOT GET STALE. Every mutation already answers with the whole map, freshly signed, so
//      ordinary editing keeps the URLs young by itself — `applyPayload` is the one place state is
//      replaced and it resets the clock. On top of that: a refresh when the tab comes back after
//      twenty minutes away, and a timer at forty-five, comfortably inside the two-hour window and
//      asleep while the tab is hidden. No socket, no poll running for nobody.
//   2. HEAL, DO NOT SHOW A BROKEN GLYPH. The aerial's `onError` re-fetches the payload (which
//      re-signs everything) and tries again, twice, with a short backoff — and says "Reloading the
//      picture…" while it does, because that is the truth. Only after that does it show a message
//      and a Reload button. Thumbnails get one library refresh between them, not one each.
//   3. NEVER PLACE INTO A COLLAPSED FRAME. `relativeFromClick` answers the CENTRE for a zero-sized
//      box, by design — which, on a frame that has collapsed, means silently stacking every new
//      point at 0.5/0.5 on top of nothing. `atFrame` is the single place the frame's box is read,
//      so that is where placement, dragging and drawing are refused instead.

/** A payload older than this, when the tab comes back, is refreshed before it is trusted. */
const STALE_MS = 20 * 60 * 1000;
/** And on a timer, well inside the two hours a signed URL lasts. */
const REFRESH_MS = 45 * 60 * 1000;
/** How many times the aerial re-signs itself before giving up and asking a person. */
const AERIAL_TRIES = 2;

// ── DROPPING A FILE ON EMPTY MAP MAKES A POINT ──────────────────────────────────────────────────
//
// Owner, 2026-09-17: "I want to be able to just drag and drop a file or image or whatever anywhere
// on the map to create a new point. If I do this, then it should have a dialogue about what kind of
// point it should be … if I drop it on an existing point then it will be added to that existing
// points files."
//
// Two gestures that look identical and mean different things, told apart by one thing only: what is
// under the cursor when the file lands. The pins and the shapes already own their own drops and
// stop them from travelling further, so ANYTHING that reaches the picture's own handler is, by
// construction, a drop on empty aerial. `overWhat` is the one exception to that: the drag handles
// do not stop a drop, and a vertex handle is somewhere to grab rather than somewhere to put a
// photo; and in VIEW mode a pin does not accept a drop at all, so the event arrives here with the
// pin as its target and has to be routed back to it rather than making a second point on top of it.

/** What is under a pointer or a drag over the picture. `inert` is the furniture a drop must simply
 *  bounce off; `pointId` is a pin or a shape that owns the drop instead. */
function overWhat(target: EventTarget | null): { pointId: string | null; inert: boolean } {
  const el = target instanceof Element ? target : null;
  if (!el) return { pointId: null, inert: false };
  if (el.closest('.pmap__handles, .pmap__zoom, .pmap__popup')) return { pointId: null, inert: true };
  return { pointId: el.closest('[data-point-id]')?.getAttribute('data-point-id') ?? null, inert: false };
}

/** Is there anything in this drag worth catching — a tile from the panel, or files from the
 *  desktop? Read from `types`, because `getData` is deliberately blank until the drop itself. */
function dragCarriesFile(e: React.DragEvent): boolean {
  const types = Array.from(e.dataTransfer?.types ?? []);
  return types.includes(FILE_DRAG_TYPE) || types.includes('Files');
}

/** The title a dropped file SUGGESTS. A photo dropped on a fence corner is usually called something
 *  like the photo, so the dialogue opens with the file's own name — without the extension, and with
 *  the underscores a camera puts in turned back into spaces. Offered, never imposed: the field is
 *  focused and its text selected, so typing over it is one keystroke. */
function titleFromFileName(name: string | null | undefined): string {
  const stem = (name ?? '')
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stem.slice(0, 160) || 'Point of interest';
}

/** The point a drop just made, held while the person says what it is. The point ALREADY EXISTS and
 *  the file is ALREADY ON IT — this is an edit waiting to be applied, not a form waiting to create
 *  something. Which is why Cancel keeps it: somebody who dragged a photo onto a fence corner meant
 *  to put it there, and losing the file because they closed a dialogue would be the worst outcome
 *  in the whole feature. */
interface NewPointDraft {
  pointId: string;
  ordinal: number;
  title: string;
  notes: string;
  pointType: PointTypeId;
  geometry: GeometryId;
  /** What landed on it, named — so the dialogue and the "keep it" toast can both say so. */
  fileNames: string[];
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

  // ONE selection, shared by the map, the shapes and the list.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  /** The dedicated viewer: WHICH list its arrows are walking, and which file it is showing. One
   *  piece of state rather than two, because "open on the point's attachments" and "open on the
   *  panel" are the same viewer pointed at different collections, and an id from one list means
   *  nothing in the other. */
  const [viewerOn, setViewerOn] = useState<{ source: 'library' | 'point'; fileId: string } | null>(null);
  /** The frame's LAYOUT box inside the stage — where the picture would be at 1× with no pan, and
   *  how big it would be. The zoom and the pan are applied to it in `marks` below, in one place. */
  const [frame, setFrame] = useState({ width: 0, height: 0, left: 0, top: 0 });

  /** How the aerial is being looked at. One piece of state for the scale and both offsets, because
   *  every gesture that changes one has to re-clamp the others in the same breath. */
  const [view, setView] = useState<View>(FIT_VIEW);
  /** Space held down: the universal "pan instead of whatever this drag normally means". */
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** Panning right now, purely so the cursor can say so. */
  const [panning, setPanning] = useState(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [confirmPoint, setConfirmPoint] = useState<string | null>(null);
  const [confirmMedia, setConfirmMedia] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState(false);
  /** A drag carrying a file is somewhere over the stage. Lights the whole map up as a target, for
   *  a desktop file exactly as an armed tile already does. */
  const [fileOver, setFileOver] = useState(false);
  /** …and is over EMPTY aerial right this second, so the dashed inset can say "this will make a new
   *  point" while a pin under the cursor goes on saying "this will go on point 4". */
  const [dropOnMap, setDropOnMap] = useState(false);
  /** The point a drop just made, waiting on the new-point dialogue. */
  const [newPoint, setNewPoint] = useState<NewPointDraft | null>(null);
  /** When the payload — and therefore every signed URL in it — was last fetched. */
  const [fetchedAt, setFetchedAt] = useState(0);
  /** Whether the aerial is on screen, on its way back, or beaten. */
  const [aerialState, setAerialState] = useState<'ok' | 'retrying' | 'failed'>('ok');
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const [draft, setDraft] = useState<{ title: string; notes: string } | null>(null);

  // ── THE FILE PANEL ───────────────────────────────────────────────────────────────────────────
  const [library, setLibrary] = useState<LibraryFile[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<MediaKind | 'all'>('all');
  const [unplacedOnly, setUnplacedOnly] = useState(false);
  /** The tile that has been tapped or Entered: the touch and keyboard half of a drag. */
  const [armedFileId, setArmedFileId] = useState<string | null>(null);
  /** The tile being dragged right now, which is what turns every pin into a lit drop target. */
  const [dragFileId, setDragFileId] = useState<string | null>(null);
  /** Which target the pointer is over, so exactly one thing is highlighted at a time. */
  const [overPointId, setOverPointId] = useState<string | null>(null);
  /** Optimistically greyed: dropped, not yet answered for. */
  const [placing, setPlacing] = useState<string[]>([]);
  const [confirmUnassign, setConfirmUnassign] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [flashFileId, setFlashFileId] = useState<string | null>(null);
  /** How many previews are still to be made, for the quiet line in the panel's header. Zero while
   *  nothing is happening, which is most of the time — the second visit to a job has none left. */
  const [thumbLeft, setThumbLeft] = useState(0);

  /** Every file this browser has already had a go at, this session. A library refresh happens after
   *  every single assignment; without this, each one would re-queue everything still in flight. */
  const thumbTriedRef = useRef<Set<string>>(new Set());
  const thumbQueueRef = useRef<ThumbJob[]>([]);
  /** How many worker loops are alive. Each one holds exactly one job while it is alive, so this is
   *  also the number in flight — which is what makes `queue.length + workers` the count to show. */
  const thumbWorkersRef = useRef(0);
  const thumbAbortRef = useRef<AbortController | null>(null);

  const filesScrollRef = useRef<HTMLDivElement | null>(null);
  /** Where the panel was scrolled to when a refresh started. A reload that jumps the panel back to
   *  the top costs more time than the assignment saved. */
  const keepScrollRef = useRef<number | null>(null);
  /** `dataTransfer.getData` is empty during dragover in every browser, and Safari empties it on
   *  drop for a custom type often enough to matter. The id is mirrored here as the fallback. */
  const dragFileRef = useRef<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  // ── DRAWING AND EDITING SHAPES ───────────────────────────────────────────────────────────────
  const [draw, setDraw] = useState<Draw | null>(null);
  /** Where the cursor is while a path or an area is part-drawn, for the rubber-band segment. */
  const [cursor, setCursor] = useState<RelativePoint | null>(null);
  /** The live cone while a handle is being dragged or a control is being nudged, so the drawing
   *  follows the finger before the round trip. */
  const [cone, setCone] = useState<({ pointId: string } & Cone) | null>(null);
  const [coneHandle, setConeHandle] = useState<'aim' | 'width' | null>(null);
  const [vertexDrag, setVertexDrag] = useState<{ pointId: string; index: number; at: RelativePoint } | null>(null);
  const [vertexSel, setVertexSel] = useState<{ pointId: string; index: number } | null>(null);

  const frameRef = useRef<HTMLDivElement | null>(null);
  /** The viewport the frame is transformed inside, and the surface every zoom gesture is read on. */
  const stageRef = useRef<HTMLDivElement | null>(null);
  /** The same element, in state as well as in a ref — and the reason is a bug this had.
   *
   *  While the map is loading this component returns a skeleton, so the stage is NOT in the DOM on
   *  the first render. The effect that attaches the wheel listener ran then, found `stageRef.current`
   *  null, and returned; its only dependency was a stable `useCallback`, so it never ran again once
   *  the stage appeared. Every other use of the ref reads it inside a handler — by the time somebody
   *  clicks, the element is there — which is why the buttons zoomed and the wheel did nothing, and
   *  why it took a real browser to notice. A callback ref that sets state re-runs the effect at the
   *  moment the element exists. */
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const attachStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el;
    setStageEl(el);
  }, []);
  /** The view as the DOM currently has it. A wheel handler attached outside React sees this rather
   *  than a closure captured at the last render, which is what stops fast scrolling stuttering. */
  const viewRef = useRef<View>(FIT_VIEW);
  /** Space, mirrored for the handlers that run outside React's event system. */
  const spaceRef = useRef(false);
  /** The pan in progress: the pointer that owns it and where the view was when it started. */
  const panRef = useRef<{ pointerId: number; x: number; y: number; from: View } | null>(null);
  /** Every touch currently down on the stage, so a second finger can turn a pan into a pinch. */
  const touchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  /** The pinch in progress: the finger spread and the view it started from. */
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; from: View } | null>(null);
  /** A pan or a pinch that actually moved must not also read as a click that places a point. */
  const panMovedRef = useRef(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  /** How many times the aerial has re-signed itself for the CURRENT failure. Zeroed on every
   *  successful load, so a picture that fails again in an hour gets its two tries again. */
  const aerialTriesRef = useRef(0);
  const fetchedAtRef = useRef(0);
  /** A refresh that came due mid-gesture, waiting for the gesture to end. */
  const wantRefreshRef = useRef(false);
  /** True while something is being dragged, drawn or uploaded. A refresh here replaces the point
   *  under the finger with a fresh copy of itself, which reads as the drag being dropped. */
  const gestureRef = useRef(false);
  /** One library refresh for a grid of expired thumbnails, not one per tile. */
  const thumbHealRef = useRef(0);
  /** The last time the "nothing can be placed yet" toast was shown. A pointer move fires the guard
   *  sixty times a second and a toast per move is worse than the defect. */
  const warnedRef = useRef(0);
  /** The new-point dialogue's own title box, focused and selected the moment it opens. */
  const newTitleRef = useRef<HTMLInputElement | null>(null);
  /** Whatever had the focus when a panel or a dialogue took it, so closing gives it back rather
   *  than dumping a keyboard user at the top of the document. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const attachRef = useRef<HTMLInputElement | null>(null);
  const aerialRef = useRef<HTMLInputElement | null>(null);
  /** A drag that actually moved must not also read as a click. */
  const movedRef = useRef(false);
  const vertexMovedRef = useRef(false);
  /** Where a cone drag started, in client pixels, so a plain click can be told from an aim. */
  const aimRef = useRef<{ x: number; y: number } | null>(null);
  /** The slider fires on every pixel of travel; one PATCH at the end of the gesture is enough. */
  const coneTimer = useRef<number | null>(null);
  const pointsRef = useRef<MapPoint[]>([]);

  const map = payload?.map ?? null;
  const points = useMemo(() => payload?.points ?? [], [payload]);
  pointsRef.current = points;

  usePageTitle(map ? `${map.title} — Property map` : 'Property map');

  /** The aerial's own pixel box — the space every angle and arc is worked out in. A map whose
   *  dimensions were never recorded gets a square, which is the honest approximation. */
  const box: ImageBox = useMemo(() => (
    map?.imageWidth && map?.imageHeight ? { width: map.imageWidth, height: map.imageHeight } : SQUARE
  ), [map?.imageWidth, map?.imageHeight]);

  /** Image pixels per screen pixel. Handle radii are written in screen pixels and divided by this,
   *  so a handle is the same size to a finger whatever the aerial's resolution.
   *
   *  THE ZOOM IS FOLDED IN HERE, deliberately, and nowhere else. The overlay is drawn in the
   *  image's own coordinates inside a frame the browser is scaling, so a circle of radius r comes
   *  out `r * zoom` screen pixels across. Dividing by the zoom once, at the single place the
   *  conversion is defined, keeps all seven radius expressions below exactly as they were — and
   *  keeps a drag handle nine pixels wide at 8× instead of seventy-two. */
  const unit = frame.width > 0 ? box.width / (frame.width * view.zoom) : 1;

  /** WHERE THE PICTURE ACTUALLY IS ON SCREEN, in the stage's own coordinates — the frame's layout
   *  box with the zoom and the pan done to it by hand.
   *
   *  This is the arithmetic the frame's `transform: translate(x, y) scale(z)` performs, written out
   *  once, because `transform-origin` is the frame's top-left: the corner moves to (x, y) and the
   *  box grows from there. The marks overlay is given exactly this box, so a pin at `left: 30%` of
   *  it lands on the same place on the photograph as a pin at `left: 30%` of the frame did — with
   *  no transform anywhere above it, which is the whole point.
   *
   *  Not a `getBoundingClientRect`: that would be measuring the answer we are computing, once per
   *  render, and it would be a frame behind during a pan. */
  const marks = useMemo(() => ({
    left: frame.left + view.x,
    top: frame.top + view.y,
    width: frame.width * view.zoom,
    height: frame.height * view.zoom,
  }), [frame, view]);

  // ── LOADING: ONE REQUEST, EVERYTHING SIGNED ───────────────────────────────────────────────────
  /** THE ONE PLACE THE MAP'S STATE IS REPLACED. Every mutating call answers with the whole map,
   *  freshly signed, so going through here means ordinary editing keeps the signatures young by
   *  itself and the staleness timer below rarely has anything to do. */
  const applyPayload = useCallback((next: MapPayload) => {
    setPayload(next);
    setFetchedAt(Date.now());
    fetchedAtRef.current = Date.now();
  }, []);

  const load = useCallback(async () => {
    const data = await safeFetch<MapPayload>(`/api/admin/jobs/${jobId}/property-map`);
    if (data) applyPayload(data);
    setLoading(false);
  }, [jobId, safeFetch, applyPayload]);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    void load();
  }, [jobId, load]);

  useEffect(() => { setPrefs(readPrefs()); }, []);

  useEffect(() => () => { if (coneTimer.current) window.clearTimeout(coneTimer.current); }, []);

  const savePrefs = useCallback((next: Prefs) => { setPrefs(next); writePrefs(next); }, []);

  /** Put the armed tile down again. Declared up here because Escape — which is the only way out of
   *  a half-finished gesture — is bound long before the assignment code below runs. */
  const disarm = useCallback(() => { setArmedFileId(null); setOverPointId(null); }, []);

  /** Close the file panel, and put the focus back on the toggle that opens it — so a keyboard user
   *  is left on the control they will press next rather than at the top of the document. */
  const closeFiles = useCallback(() => {
    setPanelOpen(false);
    window.setTimeout(
      () => document.querySelector<HTMLElement>('[data-testid="pmap-files-toggle"]')?.focus(),
      0,
    );
  }, []);

  /** Close the point panel and give the focus back to whatever opened it. Declared up here for the
   *  same reason `disarm` is: Escape is bound long before the panel's markup exists. */
  const closeDetail = useCallback(() => {
    setSelectedId((cur) => {
      if (cur) {
        const pin = document.querySelector<HTMLElement>(`.pmap__pin[data-point-id="${cur}"]`);
        window.setTimeout(() => (pin ?? returnFocusRef.current)?.focus?.(), 0);
      }
      return null;
    });
  }, []);

  /** Cancel the new-point dialogue. It KEEPS the point and everything on it — the whole reason the
   *  dialogue is an edit rather than a form — and says so BY NAME, so nobody goes looking in the
   *  files panel for a photo they think they lost by pressing Escape. */
  const keepNewPoint = useCallback(() => {
    if (!newPoint) return;
    const point = pointsRef.current.find((p) => p.id === newPoint.pointId);
    addToast(
      `Kept as ${pointLabel(point ?? { ordinal: newPoint.ordinal, title: 'Point of interest' })}. `
      + `${newPoint.fileNames.length === 1 ? 'The file is' : 'The files are'} on it.`,
      'info',
      3200,
    );
    setNewPoint(null);
    window.setTimeout(() => returnFocusRef.current?.focus?.(), 0);
  }, [newPoint, addToast]);

  /** Every mutating call answers with the whole map, so this is the only place state is replaced. */
  const mutate = useCallback(async (what: string, url: string, init: RequestInit, done?: string) => {
    setBusy(true);
    const res = await safeFetch<MapPayload>(url, init);
    setBusy(false);
    if (!res) { addToast(`Could not ${what}.`, 'error'); return null; }
    applyPayload(res);
    if (done) addToast(done, 'success');
    return res;
  }, [safeFetch, addToast, applyPayload]);

  // ── THE LIBRARY: ONE REQUEST, EVERY FILE, ALREADY SIGNED ──────────────────────────────────────
  // Deliberately its own call and not folded into the map's. Uploading changes the library, drawing
  // changes the map, and a drag that assigns one photo should reload neither more than it must.
  const loadLibrary = useCallback(async (mapId: string | null) => {
    const qs = mapId ? `?map_id=${encodeURIComponent(mapId)}` : '';
    const data = await safeFetch<{ files: LibraryFile[] }>(`/api/admin/jobs/${jobId}/property-map/library${qs}`);
    setLibraryLoading(false);
    if (data) setLibrary(Array.isArray(data.files) ? data.files : []);
  }, [jobId, safeFetch]);

  /** Refresh the panel without losing the person's place in it. */
  const refreshLibrary = useCallback((mapId: string | null) => {
    keepScrollRef.current = filesScrollRef.current?.scrollTop ?? null;
    void loadLibrary(mapId);
  }, [loadLibrary]);

  useEffect(() => {
    if (!jobId || !map?.id) return;
    setLibraryLoading(true);
    void loadLibrary(map.id);
  }, [jobId, map?.id, loadLibrary]);

  // Put the panel back where it was. Layout has to have happened first, which is what makes this an
  // effect on the data rather than a line at the end of the fetch.
  useEffect(() => {
    const to = keepScrollRef.current;
    if (to === null || !filesScrollRef.current) return;
    filesScrollRef.current.scrollTop = to;
    keepScrollRef.current = null;
  }, [library]);

  // Edit mode is when files get placed, so that is when the panel opens itself. It stays a toggle:
  // seeing what is still unplaced is useful while reviewing too, which is why it exists in view mode.
  useEffect(() => { setPanelOpen(editing); }, [editing]);

  // ── STAYING FRESH: THE SIGNED URLS LAST TWO HOURS, AND PEOPLE SIT HERE LONGER ─────────────────
  // The account of the defect is at the top of the file. What follows is the mechanism.

  /** Something is being dragged, drawn, aimed or uploaded right now. Mirrored into a ref because
   *  the listeners below are bound once and would otherwise read a stale copy of it. */
  const gestureBusy = Boolean(
    drag || draw || panning || upload || dragFileId || vertexDrag || coneHandle || newPoint || busy,
  );
  useEffect(() => { gestureRef.current = gestureBusy; }, [gestureBusy]);

  /** Re-fetch the map AND the library, quietly. Nothing here touches the zoom, the pan, the
   *  selection, the open panel, the half-typed title in it, the armed tile or the panel's scroll
   *  position: those are separate state and a refresh that snapped any of them back would be worse
   *  than the stale URL it fixed. `refreshLibrary` even puts the scroll back where it was. */
  const refreshNow = useCallback(() => {
    const mapId = map?.id ?? null;
    if (!mapId) return;
    // A refresh mid-drag hands the drag a fresh copy of the point under the finger, which reads as
    // the drag being dropped. It waits — the effect below fires it the moment the hand comes off.
    if (gestureRef.current) { wantRefreshRef.current = true; return; }
    wantRefreshRef.current = false;
    void load();
    refreshLibrary(mapId);
  }, [map?.id, load, refreshLibrary]);

  /** The queued refresh, let go of when the gesture ends. */
  useEffect(() => {
    if (gestureBusy || !wantRefreshRef.current) return;
    refreshNow();
  }, [gestureBusy, refreshNow]);

  /** Back at the tab after a while away — the commonest way a page goes stale, and the one moment
   *  a person is guaranteed not to be mid-gesture. */
  useEffect(() => {
    const maybe = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - fetchedAtRef.current < STALE_MS) return;
      refreshNow();
    };
    window.addEventListener('focus', maybe);
    document.addEventListener('visibilitychange', maybe);
    return () => {
      window.removeEventListener('focus', maybe);
      document.removeEventListener('visibilitychange', maybe);
    };
  }, [refreshNow]);

  /** And a timer, for the map left open on a second monitor all afternoon. It does nothing while
   *  the tab is hidden: this is a re-signing, not a live feed, and there is no reason to poll for
   *  somebody who is not looking. */
  useEffect(() => {
    if (!map?.id) return undefined;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      refreshNow();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [map?.id, refreshNow]);

  // ── THE AERIAL HEALS ITSELF ──────────────────────────────────────────────────────────────────
  /** Ask for the picture again. The payload comes back with every URL re-signed, so the `<img>`
   *  gets a genuinely different `src` and the browser really does try again. */
  const retryAerial = useCallback(() => {
    setAerialState('retrying');
    void load();
  }, [load]);

  const onAerialError = useCallback(() => {
    if (aerialTriesRef.current >= AERIAL_TRIES) { setAerialState('failed'); return; }
    const attempt = aerialTriesRef.current + 1;
    aerialTriesRef.current = attempt;
    setAerialState('retrying');
    // A short, growing wait: the commonest cause is an expired signature, which a re-fetch fixes
    // instantly, and the second commonest is a connection that came back a moment ago.
    window.setTimeout(() => { void load(); }, 400 * attempt);
  }, [load]);

  /** The picture arrived. `measure()` is called beside this in the markup rather than from in here,
   *  because it is declared further down and this callback is built during render. */
  const onAerialOk = useCallback(() => {
    aerialTriesRef.current = 0;
    setAerialState('ok');
  }, []);

  /** A watchdog on "Reloading the picture…", because the one way that state can get stuck is
   *  silent: if the re-fetch answers with the SAME url — a cached signature, a server that did not
   *  re-sign — React writes no new `src`, the browser starts no new request, and there is no second
   *  `error` event to move things along. A spinner that spins forever is a worse lie than the
   *  broken glyph it replaced, so after eight seconds it says so and offers the button. */
  useEffect(() => {
    if (aerialState !== 'retrying') return undefined;
    const t = window.setTimeout(() => setAerialState('failed'), 8000);
    return () => window.clearTimeout(t);
  }, [aerialState, payload?.imageUrl]);

  /** A thumbnail that 403s means the whole library's signatures went with it. One refresh between
   *  them, at most once a minute, rather than forty tiles each asking for their own. */
  const healThumbs = useCallback(() => {
    const mapId = map?.id ?? null;
    if (!mapId) return;
    const now = Date.now();
    if (now - thumbHealRef.current < 60_000) return;
    thumbHealRef.current = now;
    refreshLibrary(mapId);
  }, [map?.id, refreshLibrary]);

  // ── MAKING THE PREVIEWS THAT DO NOT EXIST YET ─────────────────────────────────────────────────
  // The long argument is at the top of the file. What follows is the mechanism: one job, one worker
  // loop, one enqueue, one stop.

  /** One file, start to finish: decode it here, post the result, swap that one tile in place.
   *
   *  A FAILURE IS A RESULT. Every way this can go wrong — pdf.js refusing the document, a codec the
   *  browser has not got, a canvas tainted by a URL that answered without CORS headers, the
   *  fifteen-second deadline — ends in the same POST of `{ state: 'failed' }`, which is what stops
   *  the next panel, and everybody else's, spending those seconds on it again. The tile keeps its
   *  icon, which was always a perfectly good answer for a file with no picture in it. */
  const runThumbJob = useCallback(async (job: ThumbJob, signal: AbortSignal) => {
    let dataUrl: string | null = null;
    try {
      const work = job.kind === 'video' ? videoThumb(job.url, signal)
        : job.isPdf ? pdfThumb(job.url, signal)
          : imageThumb(job.url, signal);
      dataUrl = await withDeadline(work, THUMB_TIMEOUT_MS, signal);
    } catch {
      dataUrl = null;
    }
    if (signal.aborted) return;

    // `silent` on purpose: a preview that could not be stored is not a page error anybody should be
    // shown a banner about. The file keeps its icon and the panel carries on.
    const saved = await safeFetch<{ ok: boolean; thumb_state: ThumbState }>(
      `/api/admin/jobs/${jobId}/property-map/thumbnail`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataUrl ? { job_file_id: job.id, data_url: dataUrl } : { job_file_id: job.id, state: 'failed' }),
        signal,
        silent: true,
      },
    );
    if (signal.aborted) return;

    // The tile is updated IN PLACE rather than by reloading the library. A reload would reorder and
    // rescroll a panel somebody may have a file half-dragged out of, to show a picture — and the
    // picture is already in hand, so there is nothing to fetch back anyway.
    // The state comes from the SERVER, never from having made a picture: a preview that was made
    // and then refused (over the size cap, a bucket that would not take it) is not `ok`, and
    // claiming it is would be this browser telling itself a file is done when the next visit will
    // find it still pending. The picture is shown either way — it is in hand and it is correct.
    const state: ThumbState = saved?.thumb_state ?? 'failed';
    setLibrary((cur) => cur.map((f) => (f.id === job.id
      ? { ...f, thumbUrl: dataUrl ?? f.thumbUrl, thumbState: state }
      : f)));
  }, [jobId, safeFetch]);

  /** Top the worker loops up to THUMB_WORKERS. Each loop takes jobs until the queue is empty and
   *  then exits, so "how many are running" needs no scheduler — only this call after an enqueue. */
  const startThumbWorkers = useCallback(() => {
    const controller = thumbAbortRef.current;
    if (!controller || controller.signal.aborted) return;
    const { signal } = controller;
    const sync = () => {
      if (!signal.aborted) setThumbLeft(thumbQueueRef.current.length + thumbWorkersRef.current);
    };
    while (thumbWorkersRef.current < THUMB_WORKERS && thumbQueueRef.current.length > 0) {
      thumbWorkersRef.current += 1;
      void (async () => {
        try {
          for (;;) {
            if (signal.aborted) return;
            const job = thumbQueueRef.current.shift();
            if (!job) return;
            sync();
            await runThumbJob(job, signal);
          }
        } finally {
          thumbWorkersRef.current -= 1;
          sync();
        }
      })();
    }
    sync();
  }, [runThumbJob]);

  // Queue whatever the library says still needs one — but ONLY while the panel is open. In view
  // mode with the panel shut, nobody is looking at a tile, and a page that quietly decodes two
  // hundred videos for a map somebody is only reading is a page that costs a field crew their data
  // allowance for nothing.
  useEffect(() => {
    if (!panelOpen || library.length === 0) return;
    if (!thumbAbortRef.current || thumbAbortRef.current.signal.aborted) {
      thumbAbortRef.current = new AbortController();
    }
    let queued = 0;
    for (const f of library) {
      if (!f.url) continue;
      if (thumbTriedRef.current.has(f.id)) continue;
      if (!needsThumb(f.thumbState, f.kind, f.mimeType, f.name)) continue;
      // An image already falls back to itself, so there is nothing to make and nothing to store.
      if (f.kind === 'image' && f.thumbUrl) continue;
      thumbTriedRef.current.add(f.id);
      thumbQueueRef.current.push({ id: f.id, url: f.url, kind: f.kind, isPdf: isPdfFile(f) });
      queued += 1;
    }
    if (queued > 0) startThumbWorkers();
  }, [library, panelOpen, startThumbWorkers]);

  // Leaving the page stops it dead. The tried set is cleared too: under React's development
  // double-mount the first pass is aborted, and a set that survived it would mean a freshly mounted
  // panel that never queues anything at all.
  useEffect(() => () => {
    thumbAbortRef.current?.abort();
    thumbAbortRef.current = null;
    thumbQueueRef.current = [];
    thumbTriedRef.current.clear();
  }, []);

  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);

  // ── THE FRAME'S LAYOUT BOX, WHICH EVERY MARK IS PLACED FROM ───────────────────────────────────
  // `offsetLeft`/`offsetWidth`, never a bounding rect: these are LAYOUT numbers and a transform is
  // invisible to them. That is what lets the zoom and the pan be applied to them exactly once, in
  // `marks` below, instead of being measured in and then subtracted back out somewhere else.
  const measure = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    setFrame((cur) => {
      const next = { width: el.offsetWidth, height: el.offsetHeight, left: el.offsetLeft, top: el.offsetTop };
      // Bail when nothing moved. The ResizeObserver below would otherwise re-enter on its own
      // state update, which is the classic way to write an infinite loop with one.
      return cur.width === next.width && cur.height === next.height
        && cur.left === next.left && cur.top === next.top ? cur : next;
    });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, payload?.imageUrl]);

  // A window resize is not the only thing that moves the picture: opening the file panel changes
  // the grid, which changes the stage's width, which re-CENTRES the frame inside it. The marks
  // overlay is positioned from that box, so a stale copy of it lands every pin a few pixels off the
  // thing it is pointing at — silently, and only on the layouts nobody tests.
  useEffect(() => {
    const stage = stageEl;
    const el = frameRef.current;
    if (!stage || !el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(stage);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageEl, measure, payload?.imageUrl]);

  // ── ZOOM AND PAN ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => { viewRef.current = view; }, [view]);

  /** Apply a change to the view, clamped. Everything below goes through this. */
  const applyView = useCallback((next: (cur: View, box: Boxes) => View) => {
    const stage = stageRef.current;
    const el = frameRef.current;
    if (!stage || !el) return;
    const box = readBoxes(stage, el);
    const after = clampView(box, next(viewRef.current, box));
    viewRef.current = after;
    setView(after);
  }, []);

  /** Zoom by a factor about a point on the screen. */
  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    applyView((cur, box) => zoomAbout(box, cur, factor, clientX, clientY));
  }, [applyView]);

  /** Zoom about the middle of what is on screen — what the buttons and the keyboard do, because
   *  neither of them has a cursor to zoom about. */
  const zoomByStep = useCallback((factor: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }, [zoomAt]);

  const fitView = useCallback(() => {
    applyView(() => FIT_VIEW);
  }, [applyView]);

  /** A window that changed size, or a panel that opened beside the map, moves the stage under a
   *  view that was clamped against the old one. Re-clamped rather than reset: losing your place
   *  because a sidebar opened is worse than a few pixels of drift. */
  useEffect(() => {
    applyView((cur) => cur);
  }, [applyView, frame.width, frame.height, panelOpen]);

  // THE WHEEL LISTENER IS ATTACHED BY HAND, and this is not a style preference: React's `onWheel`
  // goes through a listener React registers as PASSIVE on the root in several paths, and a passive
  // listener cannot call `preventDefault()`. Without the preventDefault the page scrolls out from
  // under the map while the map zooms, which is the worst of both. So: the real element, the real
  // option, and a real cleanup.
  useEffect(() => {
    const stage = stageEl;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // deltaMode 1 is lines and 2 is pages; Firefox still sends lines for a mouse wheel.
      const raw = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const dy = Math.max(-WHEEL_MAX_DELTA, Math.min(WHEEL_MAX_DELTA, raw));
      if (dy === 0) return;
      zoomAt(ZOOM_RATE ** -dy, e.clientX, e.clientY);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [stageEl, zoomAt]);

  // Space held = pan, whatever the drag would otherwise have meant. Held rather than toggled, so
  // there is no mode to get stuck in, and released on blur because a window that loses focus
  // mid-hold never sends the keyup.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || el.tagName === 'BUTTON')) return;
      e.preventDefault();
      spaceRef.current = true;
      setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    const clear = () => { spaceRef.current = false; setSpaceHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  /** Whether this press is a pan rather than a placement, a pin drag or a shape click.
   *
   *  A drag on the aerial ALREADY means two things in edit mode — move that pin, add that corner —
   *  and a third meaning on the same gesture would be a coin toss. So: in VIEW mode, where a drag
   *  means nothing yet, a plain drag pans. In EDIT mode it takes a deliberate modifier — the middle
   *  button, or the space bar — and two fingers on a touch screen, which is handled separately.
   *  Never from a pin, a handle, a shape or a control: those own their own drags. */
  const panGesture = useCallback((e: React.PointerEvent): boolean => {
    if (e.pointerType === 'touch') return false;
    const el = e.target as Element | null;
    if (el?.closest?.('.pmap__pin, .pmap__shape, .pmap__handles, .pmap__zoom, .pmap__popup')) return false;
    if (e.button === 1) return true;
    if (e.button !== 0) return false;
    if (spaceRef.current) return true;
    return !editing && viewRef.current.zoom > ZOOM_MIN;
  }, [editing]);

  const onStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Cleared at the START of every new press, not at the end of the last one. A pan that captured
    // the pointer on this stage often has its trailing `click` retargeted here rather than to the
    // frame — so the flag can outlive the gesture it was set by, and the click it would then
    // swallow is somebody's next point. A new press is unambiguously a new gesture.
    panMovedRef.current = false;
    if (e.pointerType === 'touch') {
      touchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Two fingers: pinch to zoom AND drag to pan, in both modes. It is the one gesture on a touch
      // screen that cannot be confused with placing or drawing anything, which is why it is allowed
      // to work while a shape is half-drawn.
      if (touchRef.current.size === 2) {
        const [a, b] = Array.from(touchRef.current.values());
        pinchRef.current = {
          dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1,
          cx: (a!.x + b!.x) / 2,
          cy: (a!.y + b!.y) / 2,
          from: viewRef.current,
        };
        panRef.current = null;
        setPanning(true);
      }
      return;
    }
    if (!panGesture(e)) return;
    // Middle-click otherwise starts the browser's own auto-scroll.
    e.preventDefault();
    panRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, from: viewRef.current };
    panMovedRef.current = false;
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      if (!touchRef.current.has(e.pointerId)) return;
      touchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      if (!pinch || touchRef.current.size !== 2) return;
      const [a, b] = Array.from(touchRef.current.values());
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
      // The midpoint of the two fingers is the cursor for the same "stays under the pointer" rule —
      // and because the OLD midpoint is anchored to the NEW one, two fingers travelling together
      // pan the picture without having to be a separate gesture.
      const cx = (a!.x + b!.x) / 2;
      const cy = (a!.y + b!.y) / 2;
      panMovedRef.current = true;
      applyView((_cur, box) => anchorTo(
        box,
        pinch.from,
        clampZoomLevel(pinch.from.zoom * (dist / pinch.dist)),
        pinch.cx, pinch.cy, cx, cy,
      ));
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    const dx = e.clientX - pan.x;
    const dy = e.clientY - pan.y;
    if (!panMovedRef.current && Math.hypot(dx, dy) < DRAG_SLOP) return;
    panMovedRef.current = true;
    applyView(() => ({ zoom: pan.from.zoom, x: pan.from.x + dx, y: pan.from.y + dy }));
  };

  const onStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      touchRef.current.delete(e.pointerId);
      if (touchRef.current.size < 2) { pinchRef.current = null; setPanning(false); }
      return;
    }
    if (panRef.current?.pointerId !== e.pointerId) return;
    panRef.current = null;
    setPanning(false);
  };

  /** Panning is available right now — which is the only reason to show a grab cursor. */
  const canPan = view.zoom > ZOOM_MIN && (spaceHeld || !editing);

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
  // through typing a note does not wipe what has been typed. The live cone and the picked vertex
  // belong to the open point too, and must not survive it.
  useEffect(() => {
    const p = pointsRef.current.find((x) => x.id === selectedId);
    setDraft(p ? { title: p.title, notes: p.notes ?? '' } : null);
    setConfirmPoint(null);
    setConfirmMedia(null);
    setCone(null);
    setVertexSel(null);
  }, [selectedId]);

  // ── FILTERS ──────────────────────────────────────────────────────────────────────────────────
  const legend = useMemo(() => typesInUse(points), [points]);

  const shownTypes = useMemo(
    () => legend.filter((t) => !prefs.hiddenTypes.includes(t.id)).map((t) => t.id),
    [legend, prefs.hiddenTypes],
  );

  /** The pins AND the shapes the map draws: the type filter, and nothing else. Text search narrows
   *  the LIST — a search that also emptied the map would hide the thing being searched for. */
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

  // ── WHAT A POINT LOOKS LIKE RIGHT NOW ────────────────────────────────────────────────────────
  // Three small overrides, so a drag is drawn under the finger instead of after the round trip.
  const liveAt = useCallback((p: MapPoint): RelativePoint => (
    drag?.id === p.id ? clampToImage({ x: drag.x, y: drag.y }) : { x: p.x, y: p.y }
  ), [drag]);

  const liveVertices = useCallback((p: MapPoint): RelativePoint[] => {
    if (vertexDrag?.pointId !== p.id) return p.vertices;
    const next = [...p.vertices];
    next[vertexDrag.index] = vertexDrag.at;
    return next;
  }, [vertexDrag]);

  const liveCone = useCallback((p: MapPoint): Cone => (
    cone && cone.pointId === p.id
      ? { bearingDeg: cone.bearingDeg, fovDeg: cone.fovDeg, fovRadius: cone.fovRadius }
      : {
        bearingDeg: clampBearing(p.bearingDeg),
        fovDeg: clampFovDeg(p.fovDeg),
        fovRadius: clampFovRadius(p.fovRadius),
      }
  ), [cone]);

  /** Every vertex of a point as it stands on screen this frame, anchor first. */
  const livePoints = useCallback((p: MapPoint): RelativePoint[] => {
    const at = liveAt(p);
    return shapePoints({ x: at.x, y: at.y, vertices: liveVertices(p) });
  }, [liveAt, liveVertices]);

  /** A relative point, in the overlay's coordinates — which are the aerial's own pixels. */
  const px = useCallback((p: RelativePoint) => ({ x: p.x * box.width, y: p.y * box.height }), [box]);

  /** THE ONE PLACE THE FRAME'S BOX IS READ, and therefore the one place to refuse a gesture that
   *  would be answered with a lie. `relativeFromClick` returns the CENTRE for a zero-sized box —
   *  correct for it, and a disaster here: a frame that has collapsed because the aerial failed to
   *  load would silently stack every point at 0.5/0.5 on top of nothing. Callers already handle
   *  `null` by doing nothing, so every placement, drag and draw inherits the guard for free. */
  const atFrame = useCallback((clientX: number, clientY: number): RelativePoint | null => {
    const el = frameRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (aerialState !== 'ok' || !(rect.width > 0) || !(rect.height > 0)) {
      // A pointer move fires this sixty times a second; one sentence every few seconds is a
      // warning, and sixty is a fault of its own.
      const now = Date.now();
      if (now - warnedRef.current > 4000) {
        warnedRef.current = now;
        addToast('The aerial has not loaded yet — nothing can be placed on it until it has.', 'info', 3200);
      }
      return null;
    }
    return relativeFromClick(clientX, clientY, rect);
  }, [aerialState, addToast]);

  // ── CREATING AND EDITING ─────────────────────────────────────────────────────────────────────
  /** Write a point and hand back the row the server made, which is the only place its NUMBER comes
   *  from. Two callers now: the shape picker, which then opens the panel on it, and a file dropped
   *  on empty aerial, which then puts the file on it and asks what it is. */
  const placePoint = useCallback(async (body: Record<string, unknown>, done?: string): Promise<MapPoint | null> => {
    if (!map) return null;
    const res = await mutate(
      'place the point',
      `/api/admin/jobs/${jobId}/property-map/points`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_id: map.id, ...body }),
      },
      done,
    );
    if (!res) return null;
    // The server assigns the number, so the new point is the highest one that came back.
    return [...res.points].sort((a, b) => b.ordinal - a.ordinal)[0] ?? null;
  }, [map, jobId, mutate]);

  const createPoint = useCallback(async (body: Record<string, unknown>) => {
    const newest = await placePoint(body, 'Point placed.');
    setDraw(null);
    setCursor(null);
    if (newest) {
      setSelectedId(newest.id);
      window.setTimeout(() => titleRef.current?.focus(), 60);
    }
  }, [placePoint]);

  const patchPoint = useCallback(async (pointId: string, body: Record<string, unknown>, done: string) => {
    if (!map) return null;
    // Returned rather than swallowed so a caller that has to know — the inline rename, which puts
    // the old name back if the save did not land — can tell success from failure.
    return mutate(
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
    if (!res) return;
    setSelectedId(null);
    // Its attachments went with it, so every one of those files is free again and the panel has to
    // stop showing them as placed on a point that no longer exists.
    refreshLibrary(map.id);
  }, [map, jobId, mutate, refreshLibrary]);

  // ── DRAWING ──────────────────────────────────────────────────────────────────────────────────
  const arm = useCallback((geometry: GeometryId) => {
    setCursor(null);
    setDraw((cur) => (cur && cur.geometry === geometry && !cur.anchor ? null : {
      geometry,
      anchor: null,
      vertices: [],
      bearingDeg: 0,
      fovRadius: FOV_DEFAULT_RADIUS,
    }));
  }, []);

  const cancelDraw = useCallback(() => { setDraw(null); setCursor(null); aimRef.current = null; }, []);

  const finishDraw = useCallback(async () => {
    if (!draw?.anchor || !isDrawable(draw.geometry, draw.vertices.length)) return;
    const body: Record<string, unknown> = {
      x: draw.anchor.x, y: draw.anchor.y, geometry: draw.geometry,
    };
    if (draw.geometry === 'path' || draw.geometry === 'area') body.vertices = draw.vertices;
    if (draw.geometry === 'fov') {
      body.bearing_deg = draw.bearingDeg;
      body.fov_deg = FOV_DEFAULT_DEG;
      body.fov_radius = draw.fovRadius;
    }
    await createPoint(body);
  }, [draw, createPoint]);

  const onFrameClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // A pan that actually travelled ends in a click on this frame, and a click on this frame places
    // a point. Swallowed exactly once, here, rather than guarded for in four places.
    if (panMovedRef.current) { panMovedRef.current = false; return; }
    if (!map) return;

    // ── THE TOUCH AND KEYBOARD HALF OF "DROP ON EMPTY MAP" ────────────────────────────────────
    // A tile is armed and the tap landed on bare picture, so it means the same thing the drop
    // does: make a point here and put the file on it. A tap on a pin or a shape never reaches
    // this — the pin stops its click, and the shape's own handler has already assigned — but the
    // shape does not STOP the event, so its point id is what tells the two apart.
    if (armedFileId && !draw) {
      const under = overWhat(e.target);
      if (under.pointId || under.inert) return;
      const where = atFrame(e.clientX, e.clientY);
      if (where) void dropNewPoint(where, armedFileId, []);
      return;
    }

    if (!editing || !draw) return;
    const at = atFrame(e.clientX, e.clientY);
    if (!at) return;
    // The cone is drawn with pointer events, not clicks — the whole interaction is one press-drag.
    if (draw.geometry === 'fov') return;
    if (draw.geometry === 'point') { void createPoint({ x: at.x, y: at.y, geometry: 'point' }); return; }
    if (!draw.anchor) { setDraw({ ...draw, anchor: at }); setCursor(at); return; }
    setDraw({ ...draw, vertices: appendVertex(draw.vertices, at, box) });
  };

  const onFrameDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || !draw || draw.geometry !== 'fov' || !map) return;
    const at = atFrame(e.clientX, e.clientY);
    if (!at) return;
    aimRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraw({ ...draw, anchor: at, bearingDeg: 0, fovRadius: FOV_DEFAULT_RADIUS });
  };

  const onFrameMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || !draw) return;
    const at = atFrame(e.clientX, e.clientY);
    if (!at) return;
    if (draw.geometry === 'fov') {
      const from = aimRef.current;
      if (!from || !draw.anchor) return;
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_SLOP) return;
      setDraw({
        ...draw,
        bearingDeg: bearingBetween(draw.anchor, at, box),
        fovRadius: radiusBetween(draw.anchor, at, box),
      });
      return;
    }
    if (draw.anchor) setCursor(at);
  };

  const onFrameUp = () => {
    if (!draw || draw.geometry !== 'fov' || !draw.anchor || !aimRef.current) return;
    aimRef.current = null;
    void finishDraw();
  };

  const onFrameDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // While a path or an area is being drawn, a double-click already MEANS something — "that is the
    // last corner" — and it has to go on meaning it. Zooming is what a double-click means every
    // other time.
    if (draw?.anchor && geometryOf(draw.geometry).multiClick) {
      if (isDrawable(draw.geometry, draw.vertices.length)) void finishDraw();
      return;
    }
    if (draw) return;
    zoomAt(ZOOM_STEP, e.clientX, e.clientY);
  };

  const undoVertex = useCallback(() => {
    setDraw((d) => (d && d.vertices.length ? { ...d, vertices: d.vertices.slice(0, -1) } : d));
  }, []);

  // ── EDITING A CONE AFTERWARDS ────────────────────────────────────────────────────────────────
  /** Show the new cone straight away, and save it once the gesture settles. `delay` is the whole
   *  difference between a slider that writes forty rows and one that writes one. */
  const pushCone = useCallback((p: MapPoint, next: Cone, delay: number) => {
    setCone({ pointId: p.id, ...next });
    if (coneTimer.current) window.clearTimeout(coneTimer.current);
    coneTimer.current = window.setTimeout(() => {
      void (async () => {
        await patchPoint(
          p.id,
          { bearing_deg: next.bearingDeg, fov_deg: next.fovDeg, fov_radius: next.fovRadius },
          'Field of view updated.',
        );
        setCone(null);
      })();
    }, delay);
  }, [patchPoint]);

  const onConeDown = (e: React.PointerEvent<SVGCircleElement>, p: MapPoint, kind: 'aim' | 'width') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setConeHandle(kind);
    setCone({ pointId: p.id, ...liveCone(p) });
  };

  const onConeMove = (e: React.PointerEvent<SVGCircleElement>, p: MapPoint, kind: 'aim' | 'width') => {
    if (coneHandle !== kind) return;
    e.stopPropagation();
    const at = atFrame(e.clientX, e.clientY);
    if (!at) return;
    const origin = liveAt(p);
    const now = liveCone(p);
    setCone(kind === 'aim'
      ? {
        pointId: p.id,
        bearingDeg: bearingBetween(origin, at, box),
        fovDeg: now.fovDeg,
        fovRadius: radiusBetween(origin, at, box),
      }
      : {
        pointId: p.id,
        bearingDeg: now.bearingDeg,
        fovDeg: fovDegFromHandle(origin, now.bearingDeg, at, box),
        fovRadius: now.fovRadius,
      });
  };

  const onConeUp = (p: MapPoint) => {
    if (!coneHandle) return;
    setConeHandle(null);
    pushCone(p, liveCone(p), 0);
  };

  // ── EDITING A PATH OR AN AREA AFTERWARDS ─────────────────────────────────────────────────────
  const onVertexDown = (e: React.PointerEvent<SVGCircleElement>, p: MapPoint, index: number) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    vertexMovedRef.current = false;
    setVertexSel({ pointId: p.id, index });
    const at = p.vertices[index];
    if (at) setVertexDrag({ pointId: p.id, index, at });
  };

  const onVertexMove = (e: React.PointerEvent<SVGCircleElement>, p: MapPoint, index: number) => {
    if (vertexDrag?.pointId !== p.id || vertexDrag.index !== index) return;
    e.stopPropagation();
    const at = atFrame(e.clientX, e.clientY);
    if (!at) return;
    const from = p.vertices[index];
    if (from && (Math.abs(at.x - from.x) > 0.003 || Math.abs(at.y - from.y) > 0.003)) vertexMovedRef.current = true;
    setVertexDrag({ pointId: p.id, index, at });
  };

  const onVertexUp = (p: MapPoint, index: number) => {
    if (vertexDrag?.pointId !== p.id || vertexDrag.index !== index) return;
    const at = vertexDrag.at;
    if (!vertexMovedRef.current) { setVertexDrag(null); return; }
    const next = [...p.vertices];
    next[index] = at;
    // The override is held until the round trip lands, or the handle snaps back to where it was
    // for the length of the request and then jumps — which reads as a drag that did not take.
    void (async () => {
      await patchPoint(p.id, { vertices: next }, 'Shape updated.');
      setVertexDrag(null);
    })();
  };

  /** The "+" between two handles. The new corner goes exactly half way along the segment — which
   *  `shapeLabelAt` already works out, in pixel space, for a two-point path. */
  const insertVertex = useCallback((p: MapPoint, segment: number) => {
    const pts = livePoints(p);
    const a = pts[segment];
    const b = pts[(segment + 1) % pts.length];
    if (!a || !b) return;
    const next = [...p.vertices];
    next.splice(segment, 0, shapeLabelAt('path', [a, b], box));
    void patchPoint(p.id, { vertices: next }, 'Point added to the shape.');
  }, [livePoints, box, patchPoint]);

  const removeVertex = useCallback(() => {
    if (!vertexSel) return;
    const p = pointsRef.current.find((x) => x.id === vertexSel.pointId);
    if (!p) return;
    if (!isDrawable(p.geometry, p.vertices.length - 1)) { addToast(floorMessage(p.geometry), 'error'); return; }
    setVertexSel(null);
    void patchPoint(p.id, { vertices: p.vertices.filter((_, i) => i !== vertexSel.index) }, 'Point removed from the shape.');
  }, [vertexSel, addToast, patchPoint]);

  /** For a shape that arrived without enough of itself — a point somebody switched to a path — put
   *  the next handle a little east of the last one, where it can be seen and dragged. */
  const extendShape = useCallback((p: MapPoint) => {
    const pts = livePoints(p);
    const last = pts[pts.length - 1];
    if (!last) return;
    let next = fovAimHandle(last, 90, 0.08, box);
    if (next.x === last.x && next.y === last.y) next = fovAimHandle(last, 270, 0.08, box);
    void patchPoint(p.id, { vertices: appendVertex(p.vertices, next, box) }, 'Point added to the shape.');
  }, [livePoints, box, patchPoint]);

  // ── KEYBOARD ─────────────────────────────────────────────────────────────────────────────────
  // Escape unwinds one layer at a time: the shape being drawn, then the open point, then edit mode.
  // Enter finishes a shape, Backspace takes back the last click — the three keys the how-to line
  // names, so that what it says and what happens are the same thing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = Boolean(el) && (
        el!.tagName === 'INPUT' || el!.tagName === 'TEXTAREA' || el!.tagName === 'SELECT' || el!.isContentEditable
      );

      if (e.key === 'Escape') {
        // The dedicated viewer binds its own Escape and owns the topmost layer while it is up.
        if (viewerOn) return;
        // The new-point dialogue is modal, so it owns Escape next — and Escape there KEEPS the
        // point and its files, exactly as the Cancel button does. Nothing about this feature can
        // lose a file, including the key people press without reading.
        if (newPoint) { e.preventDefault(); keepNewPoint(); return; }
        // An armed tile is the newest thing on screen, so it is the first thing Escape takes back.
        if (armedFileId) { e.preventDefault(); disarm(); return; }
        if (conflict) { e.preventDefault(); setConflict(null); return; }
        if (draw) { e.preventDefault(); cancelDraw(); return; }
        if (selectedId) { e.preventDefault(); closeDetail(); return; }
        // In edit mode the file panel is part of the mode and leaves with it, one line down.
        if (panelOpen && !editing) { e.preventDefault(); closeFiles(); return; }
        if (editing) setEditing(false);
        return;
      }
      if (typing) return;

      // Zoom, from the keyboard. `=` because that is the unshifted key `+` lives on, and `-` on the
      // numeric pad arrives as its own code.
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomByStep(ZOOM_STEP); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomByStep(1 / ZOOM_STEP); return; }
      if (e.key === '0') { e.preventDefault(); fitView(); return; }

      if (draw?.anchor) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (isDrawable(draw.geometry, draw.vertices.length)) void finishDraw();
          return;
        }
        if (e.key === 'Backspace') { e.preventDefault(); undoVertex(); return; }
        return;
      }
      if (editing && vertexSel && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        removeVertex();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    viewerOn, selectedId, editing, draw, vertexSel, armedFileId, conflict, newPoint, panelOpen,
    cancelDraw, finishDraw, undoVertex, removeVertex, disarm, zoomByStep, fitView,
    keepNewPoint, closeDetail, closeFiles,
  ]);

  const onPinDown = (e: React.PointerEvent<HTMLButtonElement>, p: MapPoint) => {
    if (!editing) return;
    movedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: p.id, x: p.x, y: p.y });
  };

  const onPinMove = (e: React.PointerEvent<HTMLButtonElement>, p: MapPoint) => {
    if (!drag || drag.id !== p.id) return;
    const at = atFrame(e.clientX, e.clientY);
    if (!at) return;
    if (Math.abs(at.x - p.x) > 0.003 || Math.abs(at.y - p.y) > 0.003) movedRef.current = true;
    setDrag({ id: p.id, x: at.x, y: at.y });
  };

  const onPinUp = async (p: MapPoint) => {
    if (!drag || drag.id !== p.id || !map) return;
    const at = clampToImage({ x: drag.x, y: drag.y });
    const moved = movedRef.current;
    setDrag(null);
    if (!moved) return;
    await patchPoint(p.id, { x: at.x, y: at.y }, 'Point moved.');
  };

  const onPinClick = (p: MapPoint) => {
    // A drag that ended over the pin fires a click too. Swallow that one.
    if (movedRef.current) { movedRef.current = false; return; }
    // While a tile is armed, a pin is a destination rather than a thing to open.
    if (takeTarget(p.id)) return;
    setSelectedId((cur) => (cur === p.id ? null : p.id));
  };

  const detachMedia = useCallback(async (pointId: string, mediaId: string) => {
    await mutate(
      'detach that file',
      `/api/admin/jobs/${jobId}/property-map/media?point_id=${encodeURIComponent(pointId)}&media_id=${encodeURIComponent(mediaId)}`,
      { method: 'DELETE' },
      'Detached. The file is free again, and still in the job.',
    );
    setConfirmMedia(null);
    // Detaching here and unassigning in the panel are the same act seen from two sides. The panel
    // has to hear about it or the tile stays greyed out over a point that no longer has it.
    refreshLibrary(map?.id ?? null);
  }, [jobId, mutate, refreshLibrary, map?.id]);

  // ── ASSIGNING: ONE FUNCTION, THREE GESTURES ──────────────────────────────────────────────────
  /** A tile that just bounced off a 409, lit for long enough to find. */
  const flashTile = useCallback((fileId: string) => {
    setFlashFileId(fileId);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashFileId(null), FLASH_MS);
  }, []);

  /** Attach a file the job already has to a point. Not `safeFetch`, and that is the point: a 409
   *  here is not a failure to report, it is a SENTENCE the server wrote for this exact moment
   *  ("That file is already on point 4, Pipe at NE corner…"), and `safeFetch` returns null. */
  const assignFile = useCallback(async (pointId: string, fileId: string) => {
    if (!map || !fileId) return;
    // ── WHY THIS DOES NOT BAIL WHEN THE POINT IS NOT IN THE REF ──────────────────────────────
    // It used to `return` when the point was missing from `pointsRef.current`, and that silently
    // broke drop-a-file-on-bare-map: that flow creates a point and then attaches the file to it in
    // the same tick. `pointsRef.current` is assigned during RENDER, so between the create
    // resolving and React re-rendering it still holds the points from before — the brand-new point
    // is not in it, the guard fired, and the point appeared with nothing on it. Exactly what the
    // owner reported: "the point is created, but the file is not assigned to it like it should be."
    //
    // The lookup only ever fed the optimistic label on the tile. The server is the authority on
    // whether the point exists — it answers 404 when it is not on this job — and its response
    // carries the point back as `landed`, which is better information than the ref ever had.
    const point = pointsRef.current.find((p) => p.id === pointId) ?? null;

    setArmedFileId(null);
    setOverPointId(null);
    setConflict(null);
    // Grey it NOW. The response carries the whole map, which is not free, and a tile that waits for
    // it reads as a drop that did not take.
    setPlacing((cur) => (cur.includes(fileId) ? cur : [...cur, fileId]));

    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/property-map/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ point_id: pointId, job_file_id: fileId }),
      });

      if (res.ok) {
        const next = (await res.json()) as MapPayload;
        applyPayload(next);
        // Mark the tile placed from the answer we already have, so it does not blink back to
        // "unplaced" for the length of the library's own round trip.
        const landed = next.points.find((p) => p.id === pointId);
        const row = landed?.media.find((m) => m.jobFileId === fileId);
        setLibrary((cur) => cur.map((f) => (f.id === fileId
          ? {
            ...f,
            assignedTo: {
              pointId,
              mediaId: row?.id ?? '',
              ordinal: landed?.ordinal ?? point?.ordinal ?? 0,
              title: landed?.title ?? point?.title ?? 'that point',
            },
          }
          : f)));
        const onto = landed ?? point;
        addToast(onto ? `Added to ${pointLabel(onto)}.` : 'Added to the point.', 'success', 1800);
        refreshLibrary(map.id);
        return;
      }

      const body = (await res.json().catch(() => ({}))) as {
        error?: string; code?: string; assigned_point_id?: string;
      };
      // The server's words, not ours: it knows which pin has the file and says so by name.
      const message = body.error ?? 'That file could not be added to this point.';
      addToast(message, 'error');
      if (body.code === 'already_assigned') {
        setConflict({ fileId, message, pointId: body.assigned_point_id ?? null });
        refreshLibrary(map.id);
      }
      flashTile(fileId);
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'assign a file to a map point' });
      addToast('Could not reach the server — nothing was changed.', 'error');
      flashTile(fileId);
    } finally {
      // Roll the optimistic grey back. On the happy path the tile is already marked placed above,
      // so this only ever undoes a drop that failed.
      setPlacing((cur) => cur.filter((id) => id !== fileId));
    }
  }, [map, jobId, addToast, refreshLibrary, flashTile, reportPageError, applyPayload]);

  const unassignFile = useCallback(async (file: LibraryFile) => {
    const at = file.assignedTo;
    if (!at || !map) return;
    setConfirmUnassign(null);
    setPlacing((cur) => (cur.includes(file.id) ? cur : [...cur, file.id]));
    const res = await mutate(
      'unassign that file',
      `/api/admin/jobs/${jobId}/property-map/media?point_id=${encodeURIComponent(at.pointId)}&media_id=${encodeURIComponent(at.mediaId)}`,
      { method: 'DELETE' },
      'Unassigned. The file is free to go on another point.',
    );
    setPlacing((cur) => cur.filter((id) => id !== file.id));
    if (!res) return;
    setLibrary((cur) => cur.map((f) => (f.id === file.id ? { ...f, assignedTo: null } : f)));
    if (conflict?.fileId === file.id) setConflict(null);
    refreshLibrary(map.id);
  }, [map, jobId, mutate, refreshLibrary, conflict?.fileId]);

  // ── RENAMING A FILE, FROM THE MAP ─────────────────────────────────────────────────────────────
  //
  // Owner, 2026-09-18: "make sure that we can fully rename pictures/videos/files inside of
  // projects/jobs and in the interactive map editor too."
  //
  // The map is where files off a phone actually get triaged, so it is where naming forty files
  // called IMG_5685.jpg has to be possible — and until today it was the one file surface that could
  // not rename at all.
  //
  // ONE NAME, NOT A MAP-LOCAL ONE. This writes `job_files.label`, the same field the job's Files tab
  // and the shared viewer write, so a file renamed on the map is renamed in the job, in the File
  // Explorer and on the phone. A point media row has its own `caption`, and it was tempting to edit
  // that instead — but then the same photograph would answer to two different names depending on
  // where you were standing, which is what "fully rename" is asking not to happen.
  const renameFile = useCallback(async (jobFileId: string, next: string) => {
    const res = await fetch(`/api/admin/jobs/files/${jobFileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      addToast(body.error ?? 'That file could not be renamed.', 'error');
      throw new Error(body.error ?? 'rename failed');
    }
    // Paint the new name immediately — in the panel AND on any point holding the file, because the
    // same rename shows in both and a tile that lagged would read as the edit not having taken.
    setLibrary((cur) => cur.map((f) => (f.id === jobFileId ? { ...f, name: next } : f)));
    setPayload((cur) => (cur ? {
      ...cur,
      points: cur.points.map((p) => ({
        ...p,
        media: p.media.map((m) => (m.jobFileId === jobFileId ? { ...m, name: next } : m)),
      })),
    } : cur));
    addToast('Renamed.', 'success', 1600);
    refreshLibrary(map?.id ?? null);
  }, [addToast, refreshLibrary, map?.id]);

  /** Rename a point that already has a name.
   *
   *  The same PATCH the Title box under it sends. The draft is moved along too: it is seeded from
   *  the point when the SELECTION changes, so without this the box below would keep showing the old
   *  name until you clicked away and back, and pressing Save there would put it straight back. */
  const renamePoint = useCallback(async (pointId: string, next: string) => {
    const title = next.trim();
    if (!title) return;
    const res = await patchPoint(pointId, { title }, 'Point renamed.');
    if (!res) throw new Error('rename failed');
    setDraft((d) => (d ? { ...d, title } : d));
  }, [patchPoint]);

  /** Rename the map itself. A title is not a file name, so no extension is preserved — but it goes
   *  through the same inline control so renaming is one gesture everywhere on this page. */
  const renameMap = useCallback(async (next: string) => {
    if (!map) return;
    const res = await mutate(
      'rename the map',
      `/api/admin/jobs/${jobId}/property-map`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_id: map.id, title: next }),
      },
      'Map renamed.',
    );
    if (!res) throw new Error('rename failed');
  }, [map, jobId, mutate]);

  /** The one-click recovery from a 409: go and look at the pin that already has the file. */
  const showConflictPoint = useCallback(() => {
    if (!conflict?.pointId) return;
    setSelectedId(conflict.pointId);
    flashTile(conflict.fileId);
    setConflict(null);
  }, [conflict, flashTile]);

  /** The "On 4" chip. Clicking it selects that point, on the map and in the list at once. */
  const showFilePoint = useCallback((file: LibraryFile) => {
    if (file.assignedTo) setSelectedId(file.assignedTo.pointId);
  }, []);

  /** True when the click was spent assigning, so the caller does not ALSO change the selection.
   *  This is the touch and keyboard path: arm a tile, then tap a pin, a shape or a row. */
  const takeTarget = useCallback((pointId: string): boolean => {
    if (!editing || !armedFileId) return false;
    void assignFile(pointId, armedFileId);
    return true;
  }, [editing, armedFileId, assignFile]);

  // ── THE DRAG ITSELF ──────────────────────────────────────────────────────────────────────────
  const onTileDragStart = useCallback((e: React.DragEvent, file: LibraryFile) => {
    if (!editing || file.assignedTo) { e.preventDefault(); return; }
    e.dataTransfer.setData(FILE_DRAG_TYPE, file.id);
    e.dataTransfer.setData('text/plain', file.name);
    e.dataTransfer.effectAllowed = 'copy';
    dragFileRef.current = file.id;
    setDragFileId(file.id);
    setConflict(null);
  }, [editing]);

  const onTileDragEnd = useCallback(() => {
    dragFileRef.current = null;
    setDragFileId(null);
    setOverPointId(null);
  }, []);

  const onTargetDragOver = useCallback((e: React.DragEvent, pointId: string) => {
    if (!editing || !dragFileRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setOverPointId(pointId);
    // A pin wins over the picture underneath it. This handler stops the event travelling, so the
    // aerial's own dragover never runs while the cursor is here and could not put its own
    // highlight out by itself — which would leave the map saying "new point" over a pin.
    setDropOnMap(false);
  }, [editing]);

  const onTargetDragLeave = useCallback((pointId: string) => {
    setOverPointId((cur) => (cur === pointId ? null : cur));
  }, []);

  const onTargetDrop = useCallback((e: React.DragEvent, pointId: string) => {
    if (!editing) return;
    const fileId = e.dataTransfer.getData(FILE_DRAG_TYPE) || dragFileRef.current || '';
    if (!fileId) return;
    e.preventDefault();
    e.stopPropagation();
    dragFileRef.current = null;
    setDragFileId(null);
    setOverPointId(null);
    void assignFile(pointId, fileId);
  }, [editing, assignFile]);

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

  /** Upload files from the desktop and hang them on ONE named point. Taking the point as an
   *  argument rather than reading the selection is what lets a drop on empty aerial attach to the
   *  point it has just made, in the same breath and down the same path. */
  const attachFilesTo = useCallback(async (point: Pick<MapPoint, 'id' | 'ordinal' | 'title'>, files: File[]) => {
    if (files.length === 0) return 0;
    let attached = 0;
    await safeAction('attaching media to a map point', async () => {
      for (const file of files) {
        try {
          const { jobFileId } = await uploadIntoJob(file, `Attached to ${pointLabel(point)}`);
          const after = await safeFetch<MapPayload>(`/api/admin/jobs/${jobId}/property-map/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ point_id: point.id, job_file_id: jobFileId }),
          });
          if (after) { applyPayload(after); attached += 1; }
        } catch (err) {
          reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'attach media' });
          addToast(err instanceof Error ? err.message : `Could not attach ${file.name}.`, 'error');
        }
      }
      if (attached > 0) addToast(`${attached} ${attached === 1 ? 'file' : 'files'} attached.`, 'success');
      // A file that just landed in the job belongs in the panel, already marked as placed.
      if (attached > 0) refreshLibrary(map?.id ?? null);
    });
    return attached;
  }, [jobId, safeAction, safeFetch, reportPageError, addToast, uploadIntoJob, refreshLibrary, map?.id, applyPayload]);

  const attachFiles = useCallback(async (files: File[]) => {
    if (!selected) return;
    await attachFilesTo(selected, files);
  }, [selected, attachFilesTo]);

  const onVoiceNote = useCallback((blob: Blob) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    void attachFiles([new File([blob], `voice-note-${stamp}.webm`, { type: 'audio/webm' })]);
  }, [attachFiles]);

  // ── THE POINT'S OWN DROP BOX ─────────────────────────────────────────────────────────────────
  // Owner: "open up a point's panel and it should have a drop box that we can then drag the files
  // into." It takes both kinds of drop, and they are not the same act: a tile from the panel is a
  // file the job already has, so it only LINKS; a file from the desktop uploads first and then
  // links, down the same path everything else on this page uploads through.
  const onDetailDragOver = useCallback((e: React.DragEvent) => {
    if (!editing || !selectedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropOver(true);
  }, [editing, selectedId]);

  const onDetailDrop = useCallback((e: React.DragEvent) => {
    if (!editing || !selectedId) return;
    e.preventDefault();
    e.stopPropagation();
    setDropOver(false);
    const fileId = e.dataTransfer.getData(FILE_DRAG_TYPE) || dragFileRef.current || '';
    if (fileId) {
      dragFileRef.current = null;
      setDragFileId(null);
      setOverPointId(null);
      void assignFile(selectedId, fileId);
      return;
    }
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void attachFiles(files);
  }, [editing, selectedId, assignFile, attachFiles]);

  // ── DROPPING ON EMPTY AERIAL: MAKE THE POINT, THEN ASK WHAT IT IS ────────────────────────────
  // The long argument is at the top of the file. What follows is the mechanism, and its one
  // invariant: THE FILE IS ATTACHED BEFORE THE DIALOGUE OPENS. The dialogue is an edit on a point
  // that already exists and already holds the file, so there is no path through it — Cancel,
  // Escape, a closed laptop — that loses what somebody dragged onto a fence corner.

  /** Put a file on a point that is already there. The view-mode half of an existing-pin drop: the
   *  pin cannot accept it itself without edit mode, so the picture catches it and turns edit on. */
  const dropOnPoint = useCallback(async (pointId: string, tileId: string, files: File[]) => {
    const point = pointsRef.current.find((p) => p.id === pointId);
    if (!point) return;
    setEditing(true);
    setSelectedId(pointId);
    if (tileId) { await assignFile(pointId, tileId); return; }
    await attachFilesTo(point, files);
  }, [assignFile, attachFilesTo]);

  /** A file landed on bare picture. Make a point there, put the file on it, then ask. */
  const dropNewPoint = useCallback(async (at: RelativePoint, tileId: string, files: File[]) => {
    if (!map) return;
    // Owner: dragging a file onto the map is unambiguous intent, so view mode is not a refusal —
    // it is a mode change, and the banner across the page is what makes the new state obvious.
    setEditing(true);
    disarm();
    // Where the focus was before the dialogue took it — the armed tile's own button, on the
    // keyboard path — so closing gives it back instead of dumping somebody at the top of the page.
    const from = document.activeElement;
    returnFocusRef.current = from instanceof HTMLElement ? from : null;

    const names = tileId
      ? [library.find((f) => f.id === tileId)?.name ?? 'the file']
      : files.map((f) => f.name);

    const point = await placePoint({ x: at.x, y: at.y, geometry: DEFAULT_GEOMETRY });
    if (!point) return;
    setSelectedId(point.id);

    // ONE point for however many files: "do not scatter a point per file" — a handful of photos of
    // the same gate is one place, not five.
    if (tileId) await assignFile(point.id, tileId);
    else await attachFilesTo(point, files);

    setNewPoint({
      pointId: point.id,
      ordinal: point.ordinal,
      title: titleFromFileName(names[0]),
      notes: '',
      pointType: DEFAULT_POINT_TYPE,
      geometry: DEFAULT_GEOMETRY,
      fileNames: names,
    });
  }, [map, library, placePoint, assignFile, attachFilesTo, disarm]);

  /** The picture's own dragover. Says yes to the drop AND decides which of the two highlights is
   *  on: the dashed inset that means "a new point here", or a pin's ring that means "on point 4". */
  /** Is the cursor actually over the photograph, rather than over the grey the stage letterboxes it
   *  with? A few pixels of slop, for the same reason `relativeFromClick` clamps instead of
   *  rejecting: somebody aiming at the corner of the picture is aiming at the picture. Without it,
   *  a file let go in the margin at 1× would make a point clamped onto the edge of the aerial,
   *  which is not where anybody dropped it. */
  const overPicture = useCallback((clientX: number, clientY: number) => {
    const el = frameRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return false;
    const slop = 4;
    return clientX >= r.left - slop && clientX <= r.right + slop
      && clientY >= r.top - slop && clientY <= r.bottom + slop;
  }, []);

  const onAerialDragOver = useCallback((e: React.DragEvent) => {
    if (!map || !dragCarriesFile(e)) return;
    const where = overWhat(e.target);
    if (where.inert) { setDropOnMap(false); return; }
    if (!where.pointId && !overPicture(e.clientX, e.clientY)) { setDropOnMap(false); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setFileOver(true);
    // A pin the drag is sitting on wins, and the map stops offering to make a new point. In edit
    // mode the pin's own handler has already claimed this and we never get here at all.
    setDropOnMap(!where.pointId);
    setOverPointId(where.pointId);
  }, [map, overPicture]);

  const onAerialDrop = useCallback((e: React.DragEvent) => {
    if (!map) return;
    const where = overWhat(e.target);
    if (where.inert) return;
    if (!where.pointId && !overPicture(e.clientX, e.clientY)) return;
    const tileId = e.dataTransfer.getData(FILE_DRAG_TYPE) || dragFileRef.current || '';
    const files = Array.from(e.dataTransfer.files ?? []);
    if (!tileId && files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragFileRef.current = null;
    setDragFileId(null);
    setOverPointId(null);
    setDropOnMap(false);
    setFileOver(false);

    if (where.pointId) { void dropOnPoint(where.pointId, tileId, files); return; }
    // `atFrame` reads the frame's own rect, which already has the zoom and the pan in it — that is
    // what a bounding rect IS — so this is the whole of the placement maths, at 1× and at 8× alike.
    // It is also where a drop onto a picture that has not loaded is refused.
    const at = atFrame(e.clientX, e.clientY);
    if (!at) return;
    void dropNewPoint(at, tileId, files);
  }, [map, atFrame, overPicture, dropOnPoint, dropNewPoint]);

  /** Leaving the stage entirely, rather than crossing from the picture onto a pin — which fires a
   *  `dragleave` too and must not put the highlight out mid-gesture. */
  const onStageDragLeave = useCallback((e: React.DragEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && e.currentTarget.contains(to)) return;
    setFileOver(false);
    setDropOnMap(false);
  }, []);

  // A drag that ends anywhere else — dropped on the desktop, pressed Escape, left the window —
  // never reaches the stage, and a map left ringed for a drag that is over is a map that lies.
  useEffect(() => {
    const clear = () => { setFileOver(false); setDropOnMap(false); };
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, []);

  // ── THE NEW-POINT DIALOGUE ───────────────────────────────────────────────────────────────────
  /** Focused and SELECTED, so the suggested name is one keystroke from gone and one Tab from kept.
   *  Keyed on the point's id rather than on the draft, or every letter typed would reselect the
   *  box under the person typing it. */
  const newPointId = newPoint?.pointId ?? null;
  useEffect(() => {
    if (!newPointId) return undefined;
    const t = window.setTimeout(() => {
      newTitleRef.current?.focus();
      newTitleRef.current?.select();
    }, 60);
    return () => window.clearTimeout(t);
  }, [newPointId]);

  const saveNewPoint = useCallback(async () => {
    if (!newPoint) return;
    const title = newPoint.title.trim() || 'Point of interest';
    const draftOf = newPoint;
    setNewPoint(null);
    await patchPoint(
      draftOf.pointId,
      {
        title,
        notes: draftOf.notes,
        point_type: draftOf.pointType,
        geometry: draftOf.geometry,
      },
      `${draftOf.ordinal}. ${title} saved.`,
    );
    window.setTimeout(() => titleRef.current?.focus(), 60);
  }, [newPoint, patchPoint]);

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
        applyPayload(created);
        setEditing(true);
        addToast('Interactive map created. Place your first point.', 'success');
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Could not create the map.', 'error');
      }
    });
  }, [jobId, safeAction, safeFetch, addToast, uploadIntoJob, applyPayload]);

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
  // It lives in the marks overlay now, at its natural size, so every number below is plain screen
  // pixels — no counter-scale to divide by, and nothing to keep in step with the stylesheet except
  // POPUP_WIDTH, which is the one measurement this file and the CSS must agree on.
  const popup = useMemo(() => {
    const p = points.find((x) => x.id === hoverId);
    if (!p || !marks.width || !marks.height) return null;
    const at = drag?.id === p.id ? clampToImage({ x: drag.x, y: drag.y }) : { x: p.x, y: p.y };
    const cx = at.x * marks.width;
    const cy = at.y * marks.height;
    const maxLeft = Math.max(4, marks.width - POPUP_WIDTH - 4);
    const above = cy > marks.height * 0.55;
    return {
      point: p,
      left: Math.min(Math.max(cx - POPUP_WIDTH / 2, 4), maxLeft),
      top: above ? cy - 22 : cy + 22,
      above,
    };
  }, [hoverId, points, marks, drag]);

  // ── THE PANEL'S OWN DERIVED STATE ────────────────────────────────────────────────────────────
  /** "22 files · 14 unplaced" — the progress bar of the whole exercise. */
  const unplacedCount = useMemo(() => library.filter((f) => !f.assignedTo).length, [library]);

  const kindCounts = useMemo(() => {
    const out: Record<MediaKind, number> = { image: 0, video: 0, audio: 0, document: 0 };
    for (const f of library) out[f.kind] += 1;
    return out;
  }, [library]);

  const visibleFiles = useMemo(() => {
    const needle = fileSearch.trim().toLowerCase();
    return sortLibrary(library.filter((f) => {
      if (kindFilter !== 'all' && f.kind !== kindFilter) return false;
      if (unplacedOnly && f.assignedTo) return false;
      if (needle && !f.name.toLowerCase().includes(needle)) return false;
      return true;
    }));
  }, [library, kindFilter, unplacedOnly, fileSearch]);

  /** Grouped by kind while nothing is filtered — a heading is cheaper to read than a chip you have
   *  to click. With a kind chosen there is only one group, so the headings go away. */
  const fileGroups = useMemo(() => (
    KIND_ORDER
      .map((kind) => ({ kind, files: visibleFiles.filter((f) => f.kind === kind) }))
      .filter((g) => g.files.length > 0)
  ), [visibleFiles]);

  const armedFile = useMemo(
    () => library.find((f) => f.id === armedFileId) ?? null,
    [library, armedFileId],
  );

  // ── THE DEDICATED VIEWER'S TWO COLLECTIONS ───────────────────────────────────────────────────
  //
  // The panel's collection is `visibleFiles` — the CURRENT, FILTERED list, in the order it is on
  // screen. That is the point of building it from the filtered list rather than from the whole
  // library: filter to "Video · unplaced only", open one, and the arrows step through exactly the
  // unplaced videos, which is the review somebody was already doing when they opened it.
  //
  // Neither collection is given a capability. This is a read-and-look surface; renaming, moving and
  // deleting a job's files stay in the Files tab, where the folder, the confirmations and the audit
  // trail are. A viewer with no `delete` simply has no delete button.
  const libraryCollection = useMemo<ViewerCollection>(() => ({
    id: map?.id ?? jobId,
    title: map?.title ? `${map.title} — job files` : 'Job files',
    files: visibleFiles.filter((f) => f.url).map(viewerFileFor),
  }), [visibleFiles, map?.id, map?.title, jobId]);

  /** A point's own attachments, audio and video included — so the arrows walk what is pinned to
   *  THIS point rather than the whole job. */
  const pointCollection = useMemo<ViewerCollection | null>(() => {
    if (!selected) return null;
    const where = pointLabel(selected);
    return {
      id: selected.id,
      title: where,
      files: sortMedia(selected.media).filter((m) => m.url).map((m) => viewerFileForMedia(m, where)),
    };
  }, [selected]);

  const viewerCollection = viewerOn?.source === 'point' ? pointCollection : libraryCollection;
  /** Only open on a file the chosen collection still contains: a filter typed while the viewer is
   *  up, or an attachment detached under it, must close it rather than show an empty stage. */
  const viewerFileId = viewerOn && viewerCollection?.files.some((f) => f.id === viewerOn.fileId)
    ? viewerOn.fileId
    : null;

  /** The viewer's arrows moved it. Followed here so closing and reopening lands where it was left. */
  const onViewerStep = useCallback((fileId: string) => {
    setViewerOn((cur) => (cur && cur.fileId !== fileId ? { ...cur, fileId } : cur));
  }, []);

  // ── THE VIEWER CAN RENAME HERE TOO ────────────────────────────────────────────────────────────
  //
  // The shared viewer has had an inline rename in its header all along; this page just never handed
  // it the capability, so the same file could be renamed from the job's Files tab and not from the
  // map. Now it can, and it is the same write either way (`job_files.label`).
  //
  // The id the viewer holds is not always a job file id: for a point's attachments the collection is
  // built from media rows, whose ids are the media rows' own. So it is resolved back to the file
  // before the PATCH, and a row that cannot be resolved refuses rather than renaming the wrong file.
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

  /** Open a panel tile in the dedicated viewer. */
  const openLibraryFile = useCallback((file: LibraryFile) => {
    if (!file.url) { addToast(`${file.name} has nothing to show yet.`, 'info', 2400); return; }
    setViewerOn({ source: 'library', fileId: file.id });
  }, [addToast]);

  /** Open one of a point's attachments in the dedicated viewer. */
  const openPointMedia = useCallback((media: PointMedia) => {
    if (!media.url) { addToast(`${media.name} has nothing to show yet.`, 'info', 2400); return; }
    setViewerOn({ source: 'point', fileId: media.id });
  }, [addToast]);

  /** Every pin, shape and row is a landing place right now — which is what the highlight is for.
   *  A file dragged in from the desktop counts too: it has no tile to light up, and the map still
   *  has to say where it can go. */
  const assigning = Boolean(dragFileId || armedFileId || fileOver);

  const pointOrdinal = useCallback(
    (pointId: string | null | undefined) => points.find((p) => p.id === pointId)?.ordinal ?? null,
    [points],
  );

  const armTile = useCallback((file: LibraryFile) => {
    if (!editing) {
      addToast('Turn on Edit map to place files on points.', 'info', 2600);
      return;
    }
    if (file.assignedTo) {
      addToast(`${file.name} is already on ${assignedChip(file).toLowerCase()}. Unassign it first.`, 'info', 2600);
      flashTile(file.id);
      return;
    }
    setConflict(null);
    setArmedFileId((cur) => (cur === file.id ? null : file.id));
  }, [editing, addToast, flashTile]);

  /** Drop targets each need the same four props. Written once so a pin, a shape and a row cannot
   *  drift apart in what they accept. */
  const targetProps = useCallback((pointId: string) => ({
    onDragOver: (e: React.DragEvent) => onTargetDragOver(e, pointId),
    onDragEnter: (e: React.DragEvent) => onTargetDragOver(e, pointId),
    onDragLeave: () => onTargetDragLeave(pointId),
    onDrop: (e: React.DragEvent) => onTargetDrop(e, pointId),
  }), [onTargetDragOver, onTargetDragLeave, onTargetDrop]);

  /** What a target is called while something is being assigned — the "Assign selected file"
   *  affordance the keyboard needs, said in the accessible name rather than only drawn. */
  const targetLabel = useCallback((p: MapPoint, fallback: string) => (
    assigning ? `Assign selected file to ${pointLabel(p)}` : fallback
  ), [assigning]);

  // ── RENDER ───────────────────────────────────────────────────────────────────────────────────
  const backHref = `/admin/jobs/${jobId}`;
  const drawing = geometryOf(draw?.geometry);
  const drawWhy = draw ? whyNotDone(draw.geometry, draw.vertices.length) : null;
  const viewBox = `0 0 ${box.width} ${box.height}`;

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
              through. Mark where a photo was taken and which way the camera faced, or trace the path
              you walked while filming. Each point holds notes, photos, video and voice notes, so
              somebody who was never on the property can open this and understand it.
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
    <div
      className={`pmap${assigning ? ' pmap--assigning' : ''}`}
      data-testid="pmap"
      data-assigning={assigning ? 'true' : 'false'}
    >
      <div className="pmap__head">
        <div>
          <Link className="pmap__back" href={backHref} data-testid="pmap-back">
            <ChevronLeft size={14} aria-hidden /> Back to the job
          </Link>
          {/* The map's own name. The route has taken a `title` since the map existed; the page just
              printed it, so the one thing you could never rename here was the map itself. */}
          <InlineRename
            name={map.title}
            onRename={renameMap}
            canRename={editing}
            preserveExtension={false}
            className="pmap__titlerow"
            inputClassName="pmap__title-rename"
            buttonClassName="pmap__file-pencil"
            testId="pmap-map"
          >
            <h1 className="pmap__title">{map.title}</h1>
          </InlineRename>
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
              onClick={() => { setEditing(false); cancelDraw(); }}
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
              {draw
                ? drawing.howTo
                : 'Pick what to draw, or drag a pin or a handle to move it. Escape leaves edit mode.'}
            </span>
          </span>
          <span className="pmap__banner-actions">
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
            <button className="pmap__btn" type="button" data-testid="pmap-done-banner" onClick={() => { setEditing(false); cancelDraw(); }}>
              Done
            </button>
          </span>
        </div>
      )}

      {/* ── THE SHAPE PICKER ─────────────────────────────────────────────────────────────────── */}
      {/* Four buttons, each saying what its shape is FOR. Picking one arms the map; the bar below
          then says what to do, and stays up until the shape is finished. */}
      {editing && (
        <div className="pmap__picker" role="group" aria-label="What to draw" data-testid="pmap-shape-picker">
          {POINT_GEOMETRIES.map((g) => {
            const Icon = ICON_BY_NAME[g.icon] ?? MapPin;
            const on = draw?.geometry === g.id;
            return (
              <button
                key={g.id}
                type="button"
                className={`pmap__pick${on ? ' pmap__pick--on' : ''}`}
                aria-pressed={on}
                disabled={busy}
                title={g.hint}
                data-testid={`pmap-draw-${g.id}`}
                onClick={() => arm(g.id)}
              >
                <span className="pmap__pick-head"><Icon size={14} aria-hidden /> {g.label}</span>
                <span className="pmap__pick-hint">{g.hint}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── THE HOW-TO BAR ───────────────────────────────────────────────────────────────────── */}
      {/* It is rendered into a slot that is ALWAYS in the layout, and the reason is a defect found
          by driving the real page: the bar used to appear when a tool was armed, which pushed the
          aerial down by about sixty-six pixels — at the exact moment somebody is aiming at a fence
          corner and about to click. The picture moved under the cursor between deciding where to
          click and clicking. Reserving the space costs nothing and the aerial never moves. */}
      <div className={`pmap__howto-slot${editing && draw ? ' pmap__howto-slot--on' : ''}`} data-testid="pmap-howto-slot" aria-live="polite">
      {editing && draw && (
        <div className="pmap__howto" role="status" data-testid="pmap-howto">
          <span className="pmap__howto-text">
            {(() => { const I = ICON_BY_NAME[drawing.icon] ?? MapPin; return <I size={14} aria-hidden />; })()}
            <strong>{drawing.label}</strong>
            <span className="pmap__howto-steps">{drawing.howTo}</span>
          </span>
          <span className="pmap__howto-actions">
            {drawing.multiClick && (
              <>
                <span className="pmap__howto-count" data-testid="pmap-draw-count">
                  {draw.anchor ? `${draw.vertices.length + 1} placed` : 'Click to start'}
                </span>
                <button
                  className="pmap__btn"
                  type="button"
                  disabled={!draw.anchor || draw.vertices.length === 0}
                  data-testid="pmap-draw-undo"
                  onClick={undoVertex}
                >
                  <Undo2 size={14} aria-hidden /> Undo last
                </button>
                <button
                  className="pmap__btn pmap__btn--primary"
                  type="button"
                  disabled={!draw.anchor || Boolean(drawWhy) || busy}
                  title={drawWhy ?? 'Finish this shape'}
                  data-testid="pmap-draw-finish"
                  onClick={() => void finishDraw()}
                >
                  <Check size={14} aria-hidden /> Finish
                </button>
              </>
            )}
            <button className="pmap__btn" type="button" data-testid="pmap-draw-cancel" onClick={cancelDraw}>
              <X size={14} aria-hidden /> Cancel
            </button>
          </span>
          {draw.anchor && drawWhy && (
            <span className="pmap__howto-why" data-testid="pmap-draw-why">{drawWhy}</span>
          )}
        </div>
      )}
      </div>

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
        {/* The panel opens itself in edit mode, but seeing what is still unplaced is worth having
            while reviewing too — so it is a toggle in both, and it says the count either way. */}
        <button
          className={`pmap__toggle${panelOpen ? ' pmap__toggle--on' : ''}`}
          type="button"
          aria-pressed={panelOpen}
          aria-controls="pmap-files-panel"
          data-testid="pmap-files-toggle"
          onClick={() => setPanelOpen((cur) => !cur)}
        >
          <Folder size={12} aria-hidden /> Files
          <span className="pmap__toggle-count" data-testid="pmap-files-toggle-count">
            {libraryLoading ? '…' : `${library.length} · ${unplacedCount} unplaced`}
          </span>
          {panelOpen ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
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

      {/* ── WHAT IS BEING ASSIGNED, AND WHAT WENT WRONG ──────────────────────────────────────── */}
      {/* One bar, above the fold, for both — because on a phone the panel is BELOW the map and a
          message that lives inside it is a message nobody sees while tapping a pin. */}
      {(armedFile || conflict) && (
        <div className="pmap__assign-bar" data-testid="pmap-assign-bar">
          {armedFile && (
            <>
              <span className="pmap__assign-msg" role="status" data-testid="pmap-armed">
                <Target size={14} aria-hidden />
                <strong>Assign to…</strong>
                <span className="pmap__assign-name" title={armedFile.name}>{armedFile.name}</span>
                <span className="pmap__assign-hint">
                  Tap a pin, a shape or a row in the list to put it there — or tap anywhere else on
                  the aerial to make a new point for it. Escape cancels.
                </span>
              </span>
              <button
                className="pmap__btn"
                type="button"
                data-testid="pmap-armed-cancel"
                onClick={disarm}
              >
                <X size={13} aria-hidden /> Cancel
              </button>
            </>
          )}
          {conflict && (
            <>
              <span className="pmap__assign-msg pmap__assign-msg--bad" role="alert" data-testid="pmap-conflict">
                <AlertTriangle size={14} aria-hidden /> {conflict.message}
              </span>
              {conflict.pointId && (
                <button
                  className="pmap__btn pmap__btn--primary"
                  type="button"
                  data-testid="pmap-conflict-show"
                  onClick={showConflictPoint}
                >
                  <Eye size={13} aria-hidden /> Show me
                </button>
              )}
              <button
                className="pmap__btn"
                type="button"
                data-testid="pmap-conflict-dismiss"
                onClick={() => setConflict(null)}
              >
                <X size={13} aria-hidden /> Dismiss
              </button>
            </>
          )}
        </div>
      )}

      <div className={`pmap__body${panelOpen ? ' pmap__body--files' : ''}`}>
        <div className="pmap__main">
          {/* ── THE STAGE IS THE VIEWPORT ─────────────────────────────────────────────────────
              It clips, and it is what every zoom gesture is read against. The frame inside it is
              what moves. Keeping the two jobs in two elements is what lets the frame's bounding
              rect go on being the honest answer to "where is the picture", which is the one thing
              placement depends on. */}
          <div
            ref={attachStage}
            className={[
              'pmap__stage',
              canPan ? 'pmap__stage--pannable' : '',
              panning ? 'pmap__stage--panning' : '',
              dropOnMap ? 'pmap__stage--dropping' : '',
            ].filter(Boolean).join(' ')}
            data-testid="pmap-stage"
            data-dropping={dropOnMap ? 'true' : 'false'}
            // THE PICTURE IS A DROP TARGET, and the handlers sit HERE rather than on the frame
            // because the pins no longer live inside the frame — they are in the marks overlay
            // beside it. The stage is the one element that contains both, so it is the one place a
            // drop can be sorted into "onto that pin" and "onto bare aerial" by what is under the
            // cursor. In edit mode a pin claims its own drop and stops it before it gets here.
            onDragOver={onAerialDragOver}
            onDragEnter={onAerialDragOver}
            onDrop={onAerialDrop}
            onDragLeave={onStageDragLeave}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            // The browser's auto-scroll on a middle click, which would fight the pan.
            onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
          >
            <div
              ref={frameRef}
              className={`pmap__frame${editing && draw ? ' pmap__frame--drawing' : ''}`}
              // The ONLY transform on this page, and it applies to the photograph and the shapes
              // drawn on it — nothing that is read rather than looked at. No custom properties ride
              // along with it any more: there is nothing left inside here that needs to undo it.
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
              onClick={onFrameClick}
              onDoubleClick={onFrameDoubleClick}
              onPointerDown={onFrameDown}
              onPointerMove={onFrameMove}
              onPointerUp={onFrameUp}
              onPointerCancel={() => { aimRef.current = null; }}
              data-testid="pmap-frame"
            >
              {payload?.imageUrl ? (
                <>
                  {/* ── THE PICTURE, AND WHAT STANDS IN FOR IT WHEN IT WILL NOT COME ───────────
                      It is never removed from the DOM while it is retrying — an element that is
                      not there cannot load — it is taken out of FLOW, and the box below holds the
                      frame's size in its place. That box is the whole fix for the owner's "every-
                      thing broke": a frame that keeps its shape keeps every pin on its fraction
                      instead of piling them into the corner. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={`pmap__aerial${aerialState === 'ok' ? '' : ' pmap__aerial--away'}`}
                    src={payload.imageUrl}
                    alt={`Aerial view for ${map.title}`}
                    decoding="async"
                    data-testid="pmap-aerial"
                    onLoad={() => { onAerialOk(); measure(); }}
                    onError={onAerialError}
                    draggable={false}
                  />
                  {aerialState !== 'ok' && (
                    <div
                      className="pmap__aerial-gap"
                      style={{ '--pmap-aerial-ratio': `${box.width} / ${box.height}` } as CSSProperties}
                      data-testid="pmap-aerial-gap"
                      role="status"
                    >
                      {aerialState === 'retrying' ? (
                        <>
                          <span className="pmap__aerial-spinner" aria-hidden />
                          <strong>Reloading the picture…</strong>
                          <span className="pmap__aerial-why">
                            The link to it had expired. Your points are safe — they are stored as
                            positions on the picture, not on the link.
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={20} aria-hidden />
                          <strong>The aerial would not load.</strong>
                          <span className="pmap__aerial-why">
                            Nothing is lost: every point is still here and still where you put it.
                            The picture&apos;s link went stale, which usually means this page has
                            been open a long while.
                          </span>
                          <button
                            className="pmap__btn pmap__btn--primary"
                            type="button"
                            data-testid="pmap-aerial-retry"
                            onClick={retryAerial}
                          >
                            <Undo2 size={14} aria-hidden /> Reload the picture
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="pmap__no-aerial" data-testid="pmap-no-aerial">
                  This map has no aerial yet. Use <strong>Edit map → Replace aerial</strong> to add one.
                </div>
              )}

              {/* ── THE SHAPE OVERLAY ───────────────────────────────────────────────────────── */}
              {/* Exactly over the aerial, under the pins, in the IMAGE's own pixel space — which is
                  what lets every path come straight out of the geometry module with no scaling done
                  here. `preserveAspectRatio="none"` because the frame shrink-wraps the picture, so
                  stretching the viewBox to the frame is stretching it onto the image itself. */}
              <svg
                className={`pmap__shapes${editing && draw ? ' pmap__shapes--inert' : ''}`}
                viewBox={viewBox}
                preserveAspectRatio="none"
                aria-hidden
                focusable="false"
                data-testid="pmap-shapes"
              >
                {onMap.map((p) => {
                  if (p.geometry === 'point') return null;    // the pin IS the shape
                  const pts = livePoints(p);
                  const origin = pts[0]!;
                  const c = liveCone(p);
                  const cls = [
                    'pmap__shape',
                    `pmap__shape--${p.geometry}`,
                    selectedId === p.id ? 'pmap__shape--selected' : '',
                    hoverId === p.id ? 'pmap__shape--active' : '',
                    assigning ? 'pmap__shape--target' : '',
                    overPointId === p.id ? 'pmap__shape--over' : '',
                  ].filter(Boolean).join(' ');
                  const aim = px(fovAimHandle(origin, c.bearingDeg, c.fovRadius, box));
                  const o = px(origin);
                  return (
                    <g
                      key={p.id}
                      className={cls}
                      style={pinVars(p.pointType)}
                      data-point-id={p.id}
                      data-testid={`pmap-shape-${p.ordinal}`}
                      {...targetProps(p.id)}
                      onClick={() => {
                        if (takeTarget(p.id)) return;
                        setSelectedId((cur) => (cur === p.id ? null : p.id));
                      }}
                      onPointerEnter={() => setHoverId(p.id)}
                      onPointerLeave={() => setHoverId((cur) => (cur === p.id ? null : cur))}
                    >
                      <title>{targetLabel(p, `${pointLabel(p)} — ${shapeSummary(p, map.georeference)}`)}</title>
                      {p.geometry === 'fov' && (
                        <>
                          <path className="pmap__shape-fill" d={fovPath(origin, c.bearingDeg, c.fovDeg, c.fovRadius, box)} />
                          <line className="pmap__shape-centre" x1={o.x} y1={o.y} x2={aim.x} y2={aim.y} />
                        </>
                      )}
                      {p.geometry === 'path' && (
                        <>
                          <polyline className="pmap__shape-line" points={shapePointsAttr(pts, box)} />
                          {pts.slice(1).map((v, i) => {
                            const q = px(v);
                            return <circle className="pmap__shape-bend" key={`${p.id}-b${i}`} cx={q.x} cy={q.y} r={BEND_R * unit} />;
                          })}
                        </>
                      )}
                      {p.geometry === 'area' && (
                        <polygon className="pmap__shape-fill" points={shapePointsAttr(pts, box)} />
                      )}
                    </g>
                  );
                })}

                {/* The shape being drawn right now, including the rubber band to the cursor. */}
                {draw?.anchor && (
                  <g className="pmap__shape pmap__shape--draft" data-testid="pmap-draft">
                    {draw.geometry === 'fov' && (
                      <path
                        className="pmap__shape-fill"
                        d={fovPath(draw.anchor, draw.bearingDeg, FOV_DEFAULT_DEG, draw.fovRadius, box)}
                      />
                    )}
                    {draw.geometry === 'path' && (
                      <polyline className="pmap__shape-line" points={shapePointsAttr([draw.anchor, ...draw.vertices], box)} />
                    )}
                    {draw.geometry === 'area' && (
                      <polygon className="pmap__shape-fill" points={shapePointsAttr([draw.anchor, ...draw.vertices], box)} />
                    )}
                    {geometryOf(draw.geometry).multiClick && cursor && (() => {
                      const last = px([draw.anchor, ...draw.vertices][draw.vertices.length]!);
                      const to = px(cursor);
                      return <line className="pmap__shape-band" x1={last.x} y1={last.y} x2={to.x} y2={to.y} />;
                    })()}
                    {[draw.anchor, ...draw.vertices].map((v, i) => {
                      const q = px(v);
                      return <circle className="pmap__shape-bend" key={`draft-${i}`} cx={q.x} cy={q.y} r={BEND_R * unit} />;
                    })}
                  </g>
                )}
              </svg>
            </div>

            {/* ── THE MARKS: EVERYTHING THAT IS READ RATHER THAN LOOKED AT ────────────────────
                A sibling of the frame, not a child, and that is the whole crispness fix. It has no
                transform and no transformed ancestor, so a pin is rasterised at its real size at
                every zoom instead of being drawn into a scaled-down texture and blown back up.

                It is laid over exactly where the picture currently is — `marks` is the frame's
                layout box with the zoom and the pan done to it arithmetically — so a pin at
                `left: 30%` of this box is on the same square foot of ground it always was.

                Inert as a sheet; each mark opts back in. Otherwise this would swallow every click
                meant for the picture underneath it, which is where points are placed. */}
            <div
              className={`pmap__marks${editing && draw ? ' pmap__marks--drawing' : ''}`}
              style={{
                left: `${marks.left}px`,
                top: `${marks.top}px`,
                width: `${marks.width}px`,
                height: `${marks.height}px`,
              }}
              data-testid="pmap-marks"
            >
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
                      assigning ? 'pmap__pin--target' : '',
                      overPointId === p.id ? 'pmap__pin--over' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ ...pinStyle(at), ...pinVars(p.pointType) }}
                    title={targetLabel(p, pointLabel(p))}
                    aria-label={assigning
                      ? `Assign selected file to ${pointLabel(p)}`
                      : `${pointLabel(p)} — ${type.label}, ${geometryOf(p.geometry).label}. ${shapeSummary(p, map.georeference)}. ${mediaSummary(p.media)}`}
                    aria-pressed={selectedId === p.id}
                    data-point-id={p.id}
                    data-testid={`pmap-pin-${p.ordinal}`}
                    {...targetProps(p.id)}
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
                    {/* The "Assign selected file" affordance, drawn. It only exists while something
                        is armed or in mid-drag, so there is never a field of plus signs to read. */}
                    {assigning && (
                      <span className="pmap__pin-take" aria-hidden data-testid={`pmap-pin-take-${p.ordinal}`}>
                        <Plus size={10} strokeWidth={3} />
                      </span>
                    )}
                    {prefs.labels && <span className="pmap__pin-label">{p.title}</span>}
                  </button>
                );
              })}

              {/* ── THE HANDLES, ABOVE THE PINS BECAUSE THEY ARE WHAT YOU ARE GRABBING ──────── */}
              {editing && !draw && selected && selected.geometry !== 'point' && (
                <svg
                  className="pmap__handles"
                  viewBox={viewBox}
                  preserveAspectRatio="none"
                  aria-hidden
                  focusable="false"
                  data-testid="pmap-handles"
                >
                  {selected.geometry === 'fov' && (() => {
                    const origin = liveAt(selected);
                    const c = liveCone(selected);
                    const aim = px(fovAimHandle(origin, c.bearingDeg, c.fovRadius, box));
                    const wide = px(fovWidthHandle(origin, c.bearingDeg, c.fovDeg, c.fovRadius, box));
                    return (
                      <g className="pmap__handle-group" style={pinVars(selected.pointType)}>
                        <circle
                          className={`pmap__handle pmap__handle--aim${coneHandle === 'aim' ? ' pmap__handle--live' : ''}`}
                          cx={aim.x}
                          cy={aim.y}
                          r={HANDLE_R * unit}
                          data-testid="pmap-handle-aim"
                          onPointerDown={(e) => onConeDown(e, selected, 'aim')}
                          onPointerMove={(e) => onConeMove(e, selected, 'aim')}
                          onPointerUp={() => onConeUp(selected)}
                          onPointerCancel={() => setConeHandle(null)}
                        >
                          <title>Drag to aim the camera and set how far it reaches</title>
                        </circle>
                        <circle
                          className={`pmap__handle pmap__handle--width${coneHandle === 'width' ? ' pmap__handle--live' : ''}`}
                          cx={wide.x}
                          cy={wide.y}
                          r={HANDLE_R * unit}
                          data-testid="pmap-handle-width"
                          onPointerDown={(e) => onConeDown(e, selected, 'width')}
                          onPointerMove={(e) => onConeMove(e, selected, 'width')}
                          onPointerUp={() => onConeUp(selected)}
                          onPointerCancel={() => setConeHandle(null)}
                        >
                          <title>Drag around the point to widen or narrow the field of view</title>
                        </circle>
                      </g>
                    );
                  })()}

                  {(selected.geometry === 'path' || selected.geometry === 'area') && (() => {
                    const pts = livePoints(selected);
                    // An area closes back to the anchor, so it has one more segment than a path.
                    const segments = selected.geometry === 'area' && pts.length > 2
                      ? pts.length
                      : Math.max(0, pts.length - 1);
                    return (
                      <g className="pmap__handle-group" style={pinVars(selected.pointType)}>
                        {Array.from({ length: segments }, (_, i) => {
                          const a = pts[i]!;
                          const b = pts[(i + 1) % pts.length]!;
                          const mid = px(shapeLabelAt('path', [a, b], box));
                          const tick = MIDPOINT_R * unit * 0.55;
                          return (
                            <g
                              className="pmap__handle-add"
                              key={`mid-${i}`}
                              data-testid={`pmap-handle-add-${i}`}
                              onClick={() => insertVertex(selected, i)}
                            >
                              <title>Add a point here</title>
                              <circle cx={mid.x} cy={mid.y} r={MIDPOINT_R * unit} />
                              <line x1={mid.x - tick} y1={mid.y} x2={mid.x + tick} y2={mid.y} />
                              <line x1={mid.x} y1={mid.y - tick} x2={mid.x} y2={mid.y + tick} />
                            </g>
                          );
                        })}
                        {liveVertices(selected).map((v, j) => {
                          const q = px(v);
                          const picked = vertexSel?.pointId === selected.id && vertexSel.index === j;
                          return (
                            <circle
                              key={`v-${j}`}
                              className={`pmap__handle pmap__handle--vertex${picked ? ' pmap__handle--live' : ''}`}
                              cx={q.x}
                              cy={q.y}
                              r={VERTEX_R * unit}
                              data-testid={`pmap-handle-vertex-${j}`}
                              onPointerDown={(e) => onVertexDown(e, selected, j)}
                              onPointerMove={(e) => onVertexMove(e, selected, j)}
                              onPointerUp={() => onVertexUp(selected, j)}
                              onPointerCancel={() => setVertexDrag(null)}
                            >
                              <title>Drag to move this point. Tap it, then press Delete, to remove it.</title>
                            </circle>
                          );
                        })}
                      </g>
                    );
                  })()}
                </svg>
              )}

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
                  <div className="pmap__popup-meta">{shapeSummary(popup.point, map.georeference)}</div>
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

            {/* What the dashed inset means, said in words — a dashed rectangle is a convention,
                and the difference between "a new point here" and "onto point 4" is exactly the
                thing somebody needs to know BEFORE they let go. */}
            {dropOnMap && (
              <span className="pmap__new-here" role="status" data-testid="pmap-drop-hint">
                <Plus size={13} aria-hidden /> Drop here to make a new point
              </span>
            )}

            {/* ── THE ZOOM CONTROLS ─────────────────────────────────────────────────────────────
                A wheel is not the only way in, and on a laptop trackpad it is not even the obvious
                one. Fixed to the stage rather than the frame, so they do not sail off with the
                picture, and they carry the current percentage because "am I at 2× or 5×?" is the
                question somebody asks right before they give up and reload the page. */}
            {payload?.imageUrl && (
              <div className="pmap__zoom" role="group" aria-label="Zoom the aerial" data-testid="pmap-zoom">
                <button
                  className="pmap__zoom-btn"
                  type="button"
                  disabled={view.zoom <= ZOOM_MIN}
                  aria-label="Zoom out"
                  title="Zoom out (−)"
                  data-testid="pmap-zoom-out"
                  onClick={() => zoomByStep(1 / ZOOM_STEP)}
                >
                  <Minus size={13} aria-hidden />
                </button>
                <span className="pmap__zoom-read" data-testid="pmap-zoom-level" aria-live="polite">
                  {Math.round(view.zoom * 100)}%
                </span>
                <button
                  className="pmap__zoom-btn"
                  type="button"
                  disabled={view.zoom >= ZOOM_MAX}
                  aria-label="Zoom in"
                  title="Zoom in (+)"
                  data-testid="pmap-zoom-in"
                  onClick={() => zoomByStep(ZOOM_STEP)}
                >
                  <Plus size={13} aria-hidden />
                </button>
                <button
                  className="pmap__zoom-btn pmap__zoom-btn--fit"
                  type="button"
                  disabled={view.zoom <= ZOOM_MIN}
                  aria-label="Fit the whole aerial"
                  title="Fit the whole aerial (0)"
                  data-testid="pmap-zoom-fit"
                  onClick={fitView}
                >
                  <Maximize2 size={12} aria-hidden /> Fit
                </button>
              </div>
            )}
          </div>

          {payload?.imageUrl && (
            <p className="pmap__zoom-hint" data-testid="pmap-zoom-hint">
              Scroll to zoom, or pinch. {editing
                ? 'Hold space — or the middle mouse button — to drag the picture around.'
                : 'Drag the picture to move around it.'} Press 0 to fit.
            </p>
          )}
        </div>

        {/* ── THE FILE PANEL ──────────────────────────────────────────────────────────────────── */}
        {/* Left of the aerial on purpose: the detail drawer is fixed to the RIGHT edge, so a panel
            over there would be hidden at exactly the moment a point's drop box is open. */}
        {panelOpen && (
          <aside
            className="pmap__files"
            id="pmap-files-panel"
            aria-label="Job files"
            data-testid="pmap-files"
          >
            <div className="pmap__files-head">
              <span className="pmap__files-title">
                <Folder size={14} aria-hidden /> Files
              </span>
              <span className="pmap__files-count" data-testid="pmap-files-count">
                {library.length} {library.length === 1 ? 'file' : 'files'} · {unplacedCount} unplaced
              </span>
              {/* Quiet on purpose. It is a background job nobody asked for, and the only reason to
                  mention it at all is so a panel of icons that fills in over the next minute reads
                  as working rather than broken. */}
              {thumbLeft > 0 && (
                <span className="pmap__files-making" data-testid="pmap-files-thumbs" aria-live="polite">
                  Making {thumbLeft} {thumbLeft === 1 ? 'preview' : 'previews'}…
                </span>
              )}
              <button
                className="pmap__icon-btn"
                type="button"
                aria-label="Hide the file panel"
                title={editing ? 'Hide the file panel' : 'Hide the file panel (Escape)'}
                data-testid="pmap-files-close"
                onClick={closeFiles}
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            <div className="pmap__files-tools">
              <span className="pmap__search">
                <Search size={13} aria-hidden />
                <input
                  className="pmap__search-input"
                  type="search"
                  value={fileSearch}
                  placeholder="Search files by name…"
                  aria-label="Search this job's files by name"
                  data-testid="pmap-files-search"
                  onChange={(e) => setFileSearch(e.target.value)}
                />
              </span>
              <div className="pmap__files-kinds" role="group" aria-label="Show one kind of file">
                <button
                  type="button"
                  className={`pmap__files-kind${kindFilter === 'all' ? ' pmap__files-kind--on' : ''}`}
                  aria-pressed={kindFilter === 'all'}
                  data-testid="pmap-files-kind-all"
                  onClick={() => setKindFilter('all')}
                >
                  All <span className="pmap__files-kind-n">{library.length}</span>
                </button>
                {KIND_ORDER.filter((k) => kindCounts[k] > 0).map((k) => {
                  const K = KIND_ICON[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`pmap__files-kind${kindFilter === k ? ' pmap__files-kind--on' : ''}`}
                      aria-pressed={kindFilter === k}
                      data-testid={`pmap-files-kind-${k}`}
                      onClick={() => setKindFilter((cur) => (cur === k ? 'all' : k))}
                    >
                      <K size={11} aria-hidden /> {KIND_LABEL[k]}
                      <span className="pmap__files-kind-n">{kindCounts[k]}</span>
                    </button>
                  );
                })}
              </div>
              <label className="pmap__files-only">
                <input
                  type="checkbox"
                  checked={unplacedOnly}
                  data-testid="pmap-files-unplaced-only"
                  onChange={(e) => setUnplacedOnly(e.target.checked)}
                />
                Unplaced only
              </label>
            </div>

            <div className="pmap__files-scroll" ref={filesScrollRef} data-testid="pmap-files-scroll">
              {libraryLoading && (
                <p className="pmap__hint" data-testid="pmap-files-loading">Loading this job&apos;s files…</p>
              )}
              {!libraryLoading && visibleFiles.length === 0 && (
                <p className="pmap__hint" data-testid="pmap-files-empty">
                  {library.length === 0
                    ? 'This job has no files yet. Upload from the job page, or attach straight to a point below.'
                    : 'No file matches that search or filter.'}
                </p>
              )}
              {fileGroups.map((group) => {
                const K = KIND_ICON[group.kind];
                return (
                  <section className="pmap__files-section" key={group.kind}>
                    {kindFilter === 'all' && (
                      <h3 className="pmap__files-section-head">
                        <K size={12} aria-hidden /> {KIND_LABEL[group.kind]}
                        <span className="pmap__files-kind-n">{group.files.length}</span>
                      </h3>
                    )}
                    <div className="pmap__files-grid">
                      {group.files.map((file) => (
                        <FileTile
                          key={file.id}
                          file={file}
                          editing={editing}
                          armed={armedFileId === file.id}
                          dragging={dragFileId === file.id}
                          placing={placing.includes(file.id)}
                          flashing={flashFileId === file.id}
                          confirming={confirmUnassign === file.id}
                          onArm={() => armTile(file)}
                          onDragStart={(e) => onTileDragStart(e, file)}
                          onDragEnd={onTileDragEnd}
                          onOpen={() => openLibraryFile(file)}
                          onShowPoint={() => showFilePoint(file)}
                          onAskUnassign={() => setConfirmUnassign(file.id)}
                          onCancelUnassign={() => setConfirmUnassign(null)}
                          onUnassign={() => void unassignFile(file)}
                          onThumbError={healThumbs}
                          onRename={(next) => renameFile(file.id, next)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            <p className="pmap__files-foot">
              {editing
                ? 'Drag a tile onto a pin, a shape or a row — or tap a tile, then tap where it goes.'
                : 'Turn on Edit map to place these on points.'}
            </p>
          </aside>
        )}

        <div className="pmap__side">
          <div className="pmap__side-head">Points ({listed.length})</div>
          <ul className="pmap__list" ref={listRef} data-testid="pmap-list">
            {listed.length === 0 && (
              <li className="pmap__row-empty">
                {points.length === 0
                  ? 'No points yet. Turn on Edit map, pick a shape, and click the aerial to draw the first one.'
                  : 'Nothing matches that search or filter.'}
              </li>
            )}
            {listed.map((p) => {
              const type = pointType(p.pointType);
              const geom = geometryOf(p.geometry);
              const GIcon = ICON_BY_NAME[geom.icon] ?? MapPin;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={[
                      'pmap__row',
                      selectedId === p.id ? 'pmap__row--selected' : '',
                      hoverId === p.id ? 'pmap__row--active' : '',
                      assigning ? 'pmap__row--target' : '',
                      overPointId === p.id ? 'pmap__row--over' : '',
                    ].filter(Boolean).join(' ')}
                    style={pinVars(p.pointType)}
                    data-point-id={p.id}
                    data-testid={`pmap-row-${p.ordinal}`}
                    aria-pressed={selectedId === p.id}
                    aria-label={assigning ? `Assign selected file to ${pointLabel(p)}` : undefined}
                    {...targetProps(p.id)}
                    onClick={() => {
                      if (takeTarget(p.id)) return;
                      setSelectedId((cur) => (cur === p.id ? null : p.id));
                    }}
                    onMouseEnter={() => setHoverId(p.id)}
                    onMouseLeave={() => setHoverId((cur) => (cur === p.id ? null : cur))}
                    onFocus={() => setHoverId(p.id)}
                    onBlur={() => setHoverId((cur) => (cur === p.id ? null : cur))}
                  >
                    <span className="pmap__row-mark">
                      <span className="pmap__row-num">{p.ordinal}</span>
                      <span className="pmap__row-geom" title={geom.label}>
                        <GIcon size={11} aria-hidden />
                      </span>
                    </span>
                    <span className="pmap__row-main">
                      <span className="pmap__row-title">{p.title}</span>
                      <span className="pmap__row-shape" data-testid={`pmap-row-shape-${p.ordinal}`}>
                        {shapeSummary(p, map.georeference)}
                      </span>
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
        onDragOver={onDetailDragOver}
        onDragLeave={() => setDropOver(false)}
        onDrop={onDetailDrop}
      >
        {selected && (
          <>
            <div className="pmap__detail-head">
              <div className="pmap__detail-heading">
                {/* ── RENAMING A POINT AFTER IT IS NAMED (owner, 2026-09-18) ──────────────────
                    "once I have named a point, I can still go back and rename it."
                    It was already possible — a Title box further down the panel, behind Save — but
                    only in edit mode, below the fold, and looking like part of the form you fill in
                    once when you place a point. Nothing said the name you were reading at the top of
                    the panel was the same field. Now the heading itself is the edit, the way a file
                    name is, so renaming looks the same everywhere on this page.
                    `name` is the bare title; the ordinal in front of it belongs to the map's own
                    numbering and is deliberately not editable. */}
                <InlineRename
                  name={selected.title}
                  onRename={(next) => renamePoint(selected.id, next)}
                  canRename={editing}
                  preserveExtension={false}
                  className="pmap__titlerow"
                  inputClassName="pmap__detail-rename"
                  buttonClassName="pmap__file-pencil"
                  testId="pmap-point"
                >
                  <h2 className="pmap__detail-title">{pointLabel(selected)}</h2>
                </InlineRename>
                <p className="pmap__detail-sub">
                  {pointType(selected.pointType).label} · {mediaSummary(selected.media)}
                </p>
                <p className="pmap__detail-sub" data-testid="pmap-detail-shape">
                  {(() => {
                    const G = ICON_BY_NAME[geometryOf(selected.geometry).icon] ?? MapPin;
                    return <G size={11} aria-hidden />;
                  })()}
                  {' '}{shapeSummary(selected, map.georeference)}
                </p>
              </div>
              {/* Owner, 2026-09-17: "I don't see a button to close the panel." It was always
                  rendered — it was UNDERNEATH the admin's fixed topbar, which starts at the same
                  `top: 0` and outranks this panel 200 to 60. The stylesheet now starts the panel
                  below the bar, and this header is sticky so the × is reachable at every scroll
                  position rather than only at the top of a long form. */}
              <button
                className="pmap__icon-btn"
                type="button"
                aria-label="Close point details"
                title="Close (Escape)"
                data-testid="pmap-detail-close"
                onClick={closeDetail}
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            {/* ── TWO PARTS, NOT SEVEN EQUAL ONES ──────────────────────────────────────────────
                Owner, 2026-09-17: the panel "read as one long undifferentiated column". It is two
                different jobs and now looks like two: what this point IS — the things you set —
                and what is ON it. The save and delete row belongs to the first of those and is
                inside it, so it no longer reads as the end of the whole panel with a section of
                attachments somehow after it. */}
            <div className="pmap__detail-body">
              <section className="pmap__part" data-testid="pmap-part-about">
              {editing ? (
                <>
                  <h3 className="pmap__section-title">What this point is</h3>
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

                  {/* ── THE SHAPE SWITCHER ──────────────────────────────────────────────────── */}
                  <div className="pmap__field">
                    <span className="pmap__label" id="pmap-shape-label">Shape</span>
                    <div className="pmap__switch" role="group" aria-labelledby="pmap-shape-label">
                      {POINT_GEOMETRIES.map((g) => {
                        const Icon = ICON_BY_NAME[g.icon] ?? MapPin;
                        const on = selected.geometry === g.id;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            className={`pmap__switch-btn${on ? ' pmap__switch-btn--on' : ''}`}
                            aria-pressed={on}
                            disabled={busy}
                            title={g.hint}
                            data-testid={`pmap-shape-set-${g.id}`}
                            onClick={() => { if (!on) void patchPoint(selected.id, { geometry: g.id }, `Now a ${g.label.toLowerCase()}.`); }}
                          >
                            <Icon size={13} aria-hidden /> {g.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="pmap__hint">{geometryOf(selected.geometry).hint}</p>
                  </div>

                  {/* ── AIMING THE CONE ─────────────────────────────────────────────────────── */}
                  {selected.geometry === 'fov' && (() => {
                    const c = liveCone(selected);
                    return (
                      <>
                        <div className="pmap__field">
                          <label className="pmap__label" htmlFor="pmap-bearing">Which way it faces</label>
                          <div className="pmap__inline">
                            <input
                              id="pmap-bearing"
                              className="pmap__input pmap__input--num"
                              type="number"
                              min={0}
                              max={359}
                              step={1}
                              value={Math.round(c.bearingDeg)}
                              data-testid="pmap-bearing-input"
                              onChange={(e) => pushCone(selected, { ...c, bearingDeg: clampBearing(Number(e.target.value)) }, 400)}
                            />
                            <span className="pmap__bearing" data-testid="pmap-bearing-label">
                              <Compass size={13} aria-hidden /> {bearingLabel(c.bearingDeg)}
                            </span>
                          </div>
                          <p className="pmap__hint">0° is straight up the aerial, and it turns clockwise.</p>
                        </div>
                        <div className="pmap__field">
                          <label className="pmap__label" htmlFor="pmap-fov">
                            How wide — {Math.round(c.fovDeg)}° across
                          </label>
                          <input
                            id="pmap-fov"
                            className="pmap__range"
                            type="range"
                            min={FOV_MIN_DEG}
                            max={FOV_MAX_DEG}
                            step={1}
                            value={Math.round(c.fovDeg)}
                            data-testid="pmap-fov-slider"
                            onChange={(e) => pushCone(selected, { ...c, fovDeg: clampFovDeg(Number(e.target.value)) }, 400)}
                          />
                          <div className="pmap__presets" role="group" aria-label="Common camera widths">
                            {FOV_PRESETS.map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                className={`pmap__preset${Math.round(c.fovDeg) === preset.deg ? ' pmap__preset--on' : ''}`}
                                aria-pressed={Math.round(c.fovDeg) === preset.deg}
                                data-testid={`pmap-fov-preset-${preset.deg}`}
                                onClick={() => pushCone(selected, { ...c, fovDeg: preset.deg }, 0)}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <p className="pmap__hint">
                            On the map: drag the round handle to aim it and set how far it reaches, and
                            the handle on the cone&apos;s edge to widen or narrow it.
                          </p>
                        </div>
                      </>
                    );
                  })()}

                  {/* ── THE POINTS OF A PATH OR AN AREA ─────────────────────────────────────── */}
                  {(selected.geometry === 'path' || selected.geometry === 'area') && (
                    <div className="pmap__field">
                      <span className="pmap__label">
                        {selected.geometry === 'area' ? 'Corners' : 'Points along the walk'}
                      </span>
                      <p className="pmap__hint">
                        On the map: drag a handle to move it, tap one and press Delete to remove it, or
                        click a <strong>+</strong> between two handles to add one.
                        {!isDrawable(selected.geometry, selected.vertices.length) && ` ${floorMessage(selected.geometry)}`}
                      </p>
                      <button
                        className="pmap__btn"
                        type="button"
                        disabled={busy}
                        data-testid="pmap-add-vertex"
                        onClick={() => extendShape(selected)}
                      >
                        <Plus size={14} aria-hidden /> Add a point to this shape
                      </button>
                    </div>
                  )}

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
              </section>

              <section className="pmap__part" data-testid="pmap-part-files">
              <h3 className="pmap__section-title">
                Attachments
                <span className="pmap__section-count">{mediaSummary(selected.media)}</span>
              </h3>
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
                      onOpen={() => openPointMedia(m)}
                      onAskDetach={() => setConfirmMedia(m.id)}
                      onCancelDetach={() => setConfirmMedia(null)}
                      onDetach={() => void detachMedia(selected.id, m.id)}
                      onRename={(next) => renameFile(m.jobFileId, next)}
                    />
                  ))}
                </div>
              )}

              {editing && (
                <div
                  className={[
                    'pmap__drop',
                    dropOver ? 'pmap__drop--over' : '',
                    assigning ? 'pmap__drop--target' : '',
                  ].filter(Boolean).join(' ')}
                  data-testid="pmap-drop"
                  onDragOver={onDetailDragOver}
                  onDragEnter={onDetailDragOver}
                  onDragLeave={() => setDropOver(false)}
                  onDrop={onDetailDrop}
                >
                  <strong className="pmap__drop-head">Drop files here to add them to this point</strong>
                  <span className="pmap__drop-sub">
                    From the panel on the left, or straight from your computer.
                  </span>
                  {armedFile && (
                    <button
                      className="pmap__btn pmap__btn--primary pmap__drop-take"
                      type="button"
                      data-testid="pmap-drop-assign-armed"
                      onClick={() => void assignFile(selected.id, armedFile.id)}
                    >
                      <Plus size={13} aria-hidden /> Put {armedFile.name} here
                    </button>
                  )}
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
              </section>
            </div>
          </>
        )}
      </aside>

      {/* ── THE NEW-POINT DIALOGUE ──────────────────────────────────────────────────────────────
          Owner: "it should have a dialogue about what kind of point it should be and that kind of
          thing."

          A MODAL, and not a "new point" state of the detail panel, for three reasons. The panel
          slides open on every selection already, so a person who has just dropped a photo would
          see the thing they see whenever they click anything — which reads as "nothing happened"
          rather than as the deliberate step the owner asked for. The panel is also the editor for a
          point that exists, thirteen controls deep; bending it into a second mode would put a
          conditional through every one of them. And on a phone it is a bottom sheet under the file
          panel, where a "Keep as Point 4" affordance has nowhere to live that anybody would find.

          The point behind this dialogue ALREADY EXISTS and the file is ALREADY ON IT. Everything
          here is an edit, which is what makes Cancel safe. */}
      {newPoint && (
        <div className="pmap__new" role="presentation" data-testid="pmap-new-point">
          {/* Clicking the dark ground is the same act as Cancel — and, like Cancel, it keeps. */}
          <button
            className="pmap__new-scrim"
            type="button"
            tabIndex={-1}
            aria-label={`Close this and keep point ${newPoint.ordinal}`}
            data-testid="pmap-new-scrim"
            onClick={keepNewPoint}
          />
          <div
            className="pmap__new-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pmap-new-title"
            data-testid="pmap-new-card"
          >
            <div className="pmap__new-head">
              <div className="pmap__new-heading">
                <h2 className="pmap__new-title" id="pmap-new-title">New point {newPoint.ordinal}</h2>
                <p className="pmap__new-sub" data-testid="pmap-new-files">
                  <Check size={12} aria-hidden />
                  {newPoint.fileNames.length === 1
                    ? `${newPoint.fileNames[0]} is already on it.`
                    : `${newPoint.fileNames.length} files are already on it.`}
                  {' '}Say what it is, or keep it as it stands.
                </p>
              </div>
              <button
                className="pmap__icon-btn"
                type="button"
                aria-label={`Close this and keep point ${newPoint.ordinal}`}
                title={`Keep point ${newPoint.ordinal} as it is`}
                data-testid="pmap-new-close"
                onClick={keepNewPoint}
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            <div className="pmap__new-body">
              <div className="pmap__field">
                <label className="pmap__label" htmlFor="pmap-new-name">Title</label>
                <input
                  id="pmap-new-name"
                  ref={newTitleRef}
                  className="pmap__input"
                  value={newPoint.title}
                  maxLength={160}
                  data-testid="pmap-new-title-input"
                  onChange={(e) => setNewPoint((d) => (d ? { ...d, title: e.target.value } : d))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveNewPoint(); } }}
                />
                <p className="pmap__hint">Suggested from the file&apos;s name. Type over it.</p>
              </div>

              {/* ── WHAT KIND OF POINT IT IS ────────────────────────────────────────────────── */}
              {/* The owner's "what kind of point it should be", as the fourteen themselves rather
                  than a dropdown: the colour and the one-line hint are the whole of the decision,
                  and neither survives being folded into an <option>. */}
              <div className="pmap__field">
                <span className="pmap__label" id="pmap-new-type-label">What kind of point</span>
                <div className="pmap__types" role="radiogroup" aria-labelledby="pmap-new-type-label" data-testid="pmap-new-types">
                  {POINT_TYPES.map((t) => {
                    const Icon = ICON_BY_NAME[t.icon] ?? MapPin;
                    const on = newPoint.pointType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={`pmap__type${on ? ' pmap__type--on' : ''}`}
                        style={swatchVars(t.token)}
                        data-testid={`pmap-new-type-${t.id}`}
                        onClick={() => setNewPoint((d) => (d ? { ...d, pointType: t.id } : d))}
                      >
                        <span className="pmap__type-head">
                          <span className="pmap__type-swatch" aria-hidden><Icon size={11} strokeWidth={2.5} /></span>
                          {t.label}
                        </span>
                        <span className="pmap__type-hint">{t.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── AND WHAT SHAPE ──────────────────────────────────────────────────────────── */}
              {/* So a dropped photo can become a photo-direction cone here rather than being
                  placed again from scratch. The cone is aimed on the map afterwards, with the
                  handles the panel already explains. */}
              <div className="pmap__field">
                <span className="pmap__label" id="pmap-new-shape-label">Shape</span>
                <div className="pmap__switch" role="group" aria-labelledby="pmap-new-shape-label">
                  {POINT_GEOMETRIES.map((g) => {
                    const Icon = ICON_BY_NAME[g.icon] ?? MapPin;
                    const on = newPoint.geometry === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        className={`pmap__switch-btn${on ? ' pmap__switch-btn--on' : ''}`}
                        aria-pressed={on}
                        title={g.hint}
                        data-testid={`pmap-new-shape-${g.id}`}
                        onClick={() => setNewPoint((d) => (d ? { ...d, geometry: g.id } : d))}
                      >
                        <Icon size={13} aria-hidden /> {g.label}
                      </button>
                    );
                  })}
                </div>
                <p className="pmap__hint">{geometryOf(newPoint.geometry).hint}</p>
              </div>

              <div className="pmap__field">
                <label className="pmap__label" htmlFor="pmap-new-notes">Notes (optional)</label>
                <textarea
                  id="pmap-new-notes"
                  className="pmap__textarea"
                  value={newPoint.notes}
                  placeholder="What is here, and why it matters."
                  data-testid="pmap-new-notes-input"
                  onChange={(e) => setNewPoint((d) => (d ? { ...d, notes: e.target.value } : d))}
                />
              </div>
            </div>

            {/* ── THE TWO WAYS OUT, AND NEITHER LOSES THE FILE ────────────────────────────────
                The cancel says what it does instead of saying "Cancel", because "Cancel" next to a
                photo somebody just dragged onto a fence corner reads as "throw it away" — and the
                one thing this feature must never do is make that a reasonable fear. */}
            <div className="pmap__new-foot">
              <button
                className="pmap__btn pmap__btn--primary"
                type="button"
                disabled={busy}
                data-testid="pmap-new-save"
                onClick={() => void saveNewPoint()}
              >
                <Check size={14} aria-hidden /> Save this point
              </button>
              <button
                className="pmap__btn"
                type="button"
                data-testid="pmap-new-keep"
                onClick={keepNewPoint}
              >
                Keep as Point {newPoint.ordinal}
              </button>
              <span className="pmap__new-safe">
                Either way the point stays and{' '}
                {newPoint.fileNames.length === 1 ? 'the file stays' : 'the files stay'} on it.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* THE dedicated viewer — the same component the File Explorer, the job's Files tab and the
          research documents open. Nothing about a file is viewed anywhere else, which is the whole
          reason there is only one of them. */}
      {viewerCollection && viewerFileId && (
        <SharedFileViewer
          collection={viewerCollection}
          fileId={viewerFileId}
          onClose={() => setViewerOn(null)}
          onCurrentChange={onViewerStep}
          capabilities={editing ? viewerCapabilities : undefined}
        />
      )}
    </div>
  );
}

/** One attachment. Thumbnails are lazy and decode off the main thread; video never preloads more
 *  than its metadata, which is the difference between opening a point and pulling 40 MB nobody
 *  asked for. Audio plays right here — a fifteen-second voice note is not worth a full-screen
 *  player. */
function MediaTile({
  media, editing, confirming, onOpen, onAskDetach, onCancelDetach, onDetach, onRename,
}: {
  media: PointMedia;
  editing: boolean;
  confirming: boolean;
  onOpen: () => void;
  onAskDetach: () => void;
  onCancelDetach: () => void;
  onDetach: () => void;
  /** Renames the underlying job file, not a caption local to this point — see `renameFile`. */
  onRename: (next: string) => Promise<void>;
}) {
  const Kind = KIND_ICON[media.kind];

  if (media.kind === 'audio') {
    return (
      <div className="pmap__audio" data-testid={`pmap-audio-${media.id}`}>
        <span className="pmap__audio-name">
          <Tooltip text={media.name}>
            <span><Mic size={12} aria-hidden /> {media.caption || media.name}</span>
          </Tooltip>
          {/* THE ONE CASE THAT KEEPS ITS OWN PLAYER (2026-09-16). Every other attachment opens in
              the dedicated viewer; a voice note plays right here as well, because the reason to
              press play on a fifteen-second "this corner was under a brush pile" is to hear it
              WHILE reading the point's notes — and a full-screen viewer covers the notes. The Open
              button is beside it for the case that is not that one: stepping through everything on
              the point, where the audio has to be one of the stops or the arrows lie. */}
          {media.url && (
            <button
              className="pmap__tile-open"
              type="button"
              data-testid={`pmap-audio-open-${media.id}`}
              aria-label={`Open ${media.name} in the file viewer`}
              onClick={onOpen}
            >
              <Eye size={11} aria-hidden /> Open
            </button>
          )}
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

  // ── THE TILE IS A STACK, NOT A PILE ─────────────────────────────────────────────────────────
  // Owner, 2026-09-17, with a screenshot: the kind chip and the Detach button were both absolutely
  // positioned over the top corners of a tile about a hundred pixels wide, so at any real file name
  // they overlapped each other AND the thumbnail — it read "docu… ✕ Detach". Nothing about that
  // needed to be an overlay. It is now the same stack the library tiles beside it already use:
  // picture, then name, then what it is, then what you can do to it, each on its own line, so
  // neither the panel's grid nor a long name can ever make two of them collide.
  return (
    <div className="pmap__tile-wrap" data-testid={`pmap-media-tile-${media.id}`}>
      <button
        className="pmap__tile"
        type="button"
        onClick={onOpen}
        aria-label={`Open ${media.name}`}
        data-testid={`pmap-media-${media.id}`}
      >
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
      </button>
      <InlineRename
        name={media.caption || media.name}
        onRename={(next) => onRename(next)}
        canRename={editing}
        className="pmap__tile-namerow"
        inputClassName="pmap__tile-rename"
        buttonClassName="pmap__file-pencil"
        testId={`pmap-media-${media.id}`}
      >
        <Tooltip text={media.name}>
          <span className="pmap__tile-name">{media.caption || media.name}</span>
        </Tooltip>
      </InlineRename>
      <span className="pmap__tile-kind">
        <Kind size={10} aria-hidden /> {KIND_ONE[media.kind]}
        {media.sizeBytes ? ` · ${formatBytes(media.sizeBytes)}` : ''}
      </span>
      {editing && (
        confirming ? (
          <span className="pmap__tile-acts" role="group" data-testid={`pmap-tile-confirm-${media.id}`}>
            <button className="pmap__tile-detach pmap__tile-detach--go" type="button" onClick={onDetach} data-testid={`pmap-detach-confirm-${media.id}`}>
              Really detach
            </button>
            <button className="pmap__tile-detach" type="button" onClick={onCancelDetach} data-testid={`pmap-detach-cancel-${media.id}`}>
              Keep
            </button>
          </span>
        ) : (
          <span className="pmap__tile-acts">
            <button
              className="pmap__tile-detach"
              type="button"
              aria-label={`Detach ${media.name} from this point`}
              onClick={onAskDetach}
              data-testid={`pmap-detach-${media.id}`}
            >
              <X size={10} aria-hidden /> Detach
            </button>
          </span>
        )
      )}
    </div>
  );
}

/** One file in the panel beside the map.
 *
 *  Owner: "We should be able to grab the thumbnail/preview of the file … and drag it to a point …
 *  once a file has been assigned to a point, it cannot be assigned to another point. It will still
 *  be in the … panel, but it will be a bit transparent and marked as already assigned. There will be
 *  an option to unassign it which will require confirmation."
 *
 *  So an assigned tile is NOT removed, and it is not merely faded either: fade alone is a signal
 *  somebody with low vision or a bright screen cannot read. It fades AND wears a chip with the
 *  point's number on it — and that chip is a button, because the first question after "which point
 *  has it?" is always "show me".
 *
 *  The confirm is inline and not `window.confirm`: a modal dialog takes the focus away from a panel
 *  somebody is working down, and cannot say which point in the same breath. */
function FileTile({
  file, editing, armed, dragging, placing, flashing, confirming,
  onArm, onDragStart, onDragEnd, onOpen, onShowPoint, onAskUnassign, onCancelUnassign, onUnassign, onThumbError,
  onRename,
}: {
  file: LibraryFile;
  editing: boolean;
  armed: boolean;
  dragging: boolean;
  placing: boolean;
  flashing: boolean;
  confirming: boolean;
  onArm: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onShowPoint: () => void;
  onAskUnassign: () => void;
  onCancelUnassign: () => void;
  onUnassign: () => void;
  /** An expired thumbnail URL. The page turns one of these into ONE library refresh. */
  onThumbError: () => void;
  /** Writes `job_files.label`, so the new name follows the file out of this panel. */
  onRename: (next: string) => Promise<void>;
}) {
  const Kind = KIND_ICON[file.kind];
  const assigned = Boolean(file.assignedTo);
  const chip = assignedChip(file);
  // ── NEVER SHOW A BROKEN IMAGE (owner, 2026-09-17) ─────────────────────────────────────────
  // The owner reported the PDF previews as broken. They were not — they were still arriving, and
  // a bare <img> whose bytes have not turned up yet renders the browser's broken-image glyph.
  // A tile that says "this file is broken" while it loads is a bug report waiting to happen, and
  // it produced exactly one. So the thumbnail is only shown once it has actually decoded: until
  // then the tile wears its kind icon, and if the image genuinely fails it keeps it for good.
  const [imgState, setImgState] = useState<'loading' | 'ok' | 'failed'>(file.thumbUrl ? 'loading' : 'failed');
  useEffect(() => { setImgState(file.thumbUrl ? 'loading' : 'failed'); }, [file.thumbUrl]);
  const where = file.assignedTo?.ordinal ? `point ${file.assignedTo.ordinal}` : 'that point';
  // An assigned file cannot go anywhere else, so it cannot be dragged anywhere else. Refusing the
  // drag is kinder than accepting it and answering with a 409.
  const canDrag = editing && !assigned && !placing;
  /** No signed URL means there is nothing for the viewer to show — a row whose bytes went missing. */
  const canOpen = Boolean(file.url);

  return (
    <div
      className={[
        'pmap__file',
        assigned ? 'pmap__file--assigned' : '',
        armed ? 'pmap__file--armed' : '',
        dragging ? 'pmap__file--dragging' : '',
        placing ? 'pmap__file--placing' : '',
        flashing ? 'pmap__file--flash' : '',
        canDrag ? 'pmap__file--draggable' : '',
      ].filter(Boolean).join(' ')}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-file-id={file.id}
      data-testid={`pmap-file-${file.id}`}
    >
      {/* ── THE THUMBNAIL IS THE OPEN BUTTON ───────────────────────────────────────────────────
          Owner, 2026-09-16: "a user should be able to open and view the document/picture/video/
          audio file." The picture is the thing a hand goes to, so clicking it — or pressing Enter
          on it — opens the dedicated viewer on this file, with the panel's current list behind the
          arrows. Assigning got its own control below, so the two are never one ambiguous click.

          Still draggable, on the BUTTON as well as on the tile around it: Firefox will not start a
          drag from inside a form control just because an ancestor is draggable, and the thumbnail
          is the thing the owner asked to be able to "grab". A drag does not fire a click, so
          grabbing the picture and clicking it remain different gestures on the same pixel.
          `dragstart` bubbles, so the tile's handler still gets it either way. */}
      <button
        className="pmap__file-shot"
        type="button"
        draggable={canDrag}
        disabled={!canOpen}
        data-testid={`pmap-file-open-${file.id}`}
        aria-label={[
          canOpen ? `Open ${file.name}` : file.name,
          KIND_ONE[file.kind],
          formatBytes(file.sizeBytes),
          assigned ? `already on ${where}` : 'not placed yet',
        ].filter(Boolean).join(', ')}
        onClick={onOpen}
      >
        {file.thumbUrl && imgState !== 'failed' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={`pmap__file-img${imgState === 'ok' ? '' : ' pmap__file-img--waiting'}`}
            src={file.thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setImgState('ok')}
            // A thumbnail that will not load is very rarely a bad thumbnail — it is a signature
            // that expired while this page sat open. Say so upwards; the page turns however many
            // of these arrive into one library refresh, which re-signs the lot.
            onError={() => { setImgState('failed'); onThumbError(); }}
          />
        )}
        {imgState === 'loading' && (
          // A spinner rather than the kind icon while the preview is on its way (owner, 2026-09-17:
          // "if they are loading they just like, have spinning loading wheel"). It says "wait" where
          // a static icon says "this is what you get" — and the browser's broken glyph, which is
          // what used to be here, said "this is broken".
          <span className="pmap__file-spinner" role="status" aria-label={`Loading the preview of ${file.name}`} data-testid={`pmap-file-loading-${file.id}`} />
        )}
        {imgState === 'failed' && (
          <span className="pmap__file-icon"><Kind size={20} aria-hidden /></span>
        )}
        {canOpen && <span className="pmap__file-eye" aria-hidden><Eye size={11} /></span>}
        {placing && <span className="pmap__file-veil" data-testid={`pmap-file-placing-${file.id}`}>Placing…</span>}
        {armed && <span className="pmap__file-veil" data-testid={`pmap-file-armed-${file.id}`}>Assign to…</span>}
      </button>

      {/* ── THE TITLE, AND THE WHOLE TITLE ─────────────────────────────────────────────────────
          Owner: "Each item should have the title of the file below it and if the user hovers over
          the item then a tooltip displays the full title." Two lines clamped — one is not enough
          for "2026-09-14 NE corner iron rod found.jpg", and three turns the grid into a wall of
          text — and the hover gives the rest. The shared tooltip, so it behaves like every other
          tooltip in this admin: 300 ms, and gone the instant the pointer is. */}
      <InlineRename
        name={file.name}
        onRename={(next) => onRename(next)}
        canRename={editing}
        className="pmap__file-namerow"
        inputClassName="pmap__file-rename"
        buttonClassName="pmap__file-pencil"
        testId={`pmap-file-${file.id}`}
      >
        <Tooltip text={file.name}>
          <span className="pmap__file-name" data-testid={`pmap-file-name-${file.id}`}>{file.name}</span>
        </Tooltip>
      </InlineRename>
      <span className="pmap__file-meta">{KIND_ONE[file.kind]} · {formatBytes(file.sizeBytes)}</span>

      {/* ── THE ASSIGN CONTROL ─────────────────────────────────────────────────────────────────
          The touch and keyboard half of the drag, and now a control of its own rather than "click
          anywhere on the tile": with the thumbnail opening the viewer, arming had to become
          something you can see and aim at. It is still exactly one piece of state — `armed` — so
          the finger path and the keyboard path cannot drift apart. */}
      {editing && !assigned && (
        <button
          className={`pmap__file-assign${armed ? ' pmap__file-assign--on' : ''}`}
          type="button"
          draggable={canDrag}
          aria-pressed={armed}
          data-testid={`pmap-file-pick-${file.id}`}
          aria-label={armed
            ? `${file.name} is picked up. Choose the point to put it on, or press Escape.`
            : `Assign ${file.name} to a point. You can also drag it onto one.`}
          onClick={onArm}
        >
          <GripVertical size={11} aria-hidden /> {armed ? 'Pick a point…' : 'Assign'}
        </button>
      )}

      {assigned && (
        <button
          className="pmap__file-on"
          type="button"
          title={`Show me ${where}`}
          aria-label={`${file.name} is on ${where}. Show me.`}
          data-testid={`pmap-file-on-${file.id}`}
          onClick={onShowPoint}
        >
          <MapPin size={10} aria-hidden /> {chip}
        </button>
      )}

      {assigned && editing && (
        confirming ? (
          <div className="pmap__file-confirm" role="group" data-testid={`pmap-file-confirm-${file.id}`}>
            <span className="pmap__file-confirm-ask">Take this off {where}?</span>
            <span className="pmap__file-confirm-acts">
              <button
                className="pmap__btn pmap__btn--danger"
                type="button"
                data-testid={`pmap-file-unassign-yes-${file.id}`}
                onClick={onUnassign}
              >
                Unassign
              </button>
              <button
                className="pmap__btn"
                type="button"
                data-testid={`pmap-file-unassign-no-${file.id}`}
                onClick={onCancelUnassign}
              >
                Cancel
              </button>
            </span>
          </div>
        ) : (
          <button
            className="pmap__file-unassign"
            type="button"
            aria-label={`Unassign ${file.name} from ${where}`}
            data-testid={`pmap-file-unassign-${file.id}`}
            onClick={onAskUnassign}
          >
            <X size={10} aria-hidden /> Unassign
          </button>
        )
      )}
    </div>
  );
}
