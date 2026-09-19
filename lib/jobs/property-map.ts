// lib/jobs/property-map.ts — the interactive property map, with no browser and no database in it.
//
// Owner, 2026-09-16: "For each job, I want it so that we can create an interactive map … place
// points of interest on the map image … with that dot we can attach meta data."
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
//
// Everything here is a pure function or a constant, on purpose. The rules that decide where a pin
// sits, what number it wears, what colour it is and what kind of thing is attached to it are the
// parts that will be wrong in interesting ways, so they live where a test can reach them without a
// DOM, a network or a Supabase client. The React component and the API routes are thin over this.

// The four ways a point can be DRAWN — a dot, a camera cone, a walked path, an area — and the
// trigonometry they need live in ./property-map-shapes.ts. Only the type is imported here, and only
// as a type: that import is erased at compile time, so the two modules do not form a runtime cycle.
// Consumers that need the helpers import them from ./property-map-shapes directly.
import type { GeometryId } from './property-map-shapes';

// ── THE SHAPES ──────────────────────────────────────────────────────────────────────────────────

/** A point's position: 0–1 fractions of the image's own box, never pixels. An aerial can be
 *  rescanned at a different size and every pin stays on the fence corner it was put on. */
export interface RelativePoint {
  x: number;
  y: number;
}

export interface PropertyMap {
  id: string;
  jobId: string;
  title: string;
  fileId: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  georeference: Georeference | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MapPoint {
  id: string;
  mapId: string;
  ordinal: number;
  title: string;
  notes: string | null;
  /** Where the numbered marker sits. For a path it is the start; for a cone, where the camera was.
   *  Required for every shape, so a point whose geometry fails to render is still a labelled dot
   *  rather than a missing row. */
  x: number;
  y: number;
  pointType: PointTypeId;
  status: PointStatus;
  /** Which sheet this point is on. NULL reads as the map's default layer — see `layerOf`. */
  layerId: string | null;
  /** How this one is drawn. See POINT_GEOMETRIES. */
  geometry: GeometryId;
  /** The bends after the anchor, for `path` and `area`. Empty for the other two.
   *
   *  Real coordinates since seeds/647 — they were fractions of an uploaded image, which is why a
   *  path had no length and an area had no acreage until the map moved to the earth. */
  vertices: Array<{ lat: number; lng: number }>;
  /** `fov` only: which way the camera faced, and how wide and far to draw the cone. */
  bearingDeg: number | null;
  fovDeg: number | null;
  fovRadius: number | null;
  lat: number | null;
  lng: number | null;
  media: PointMedia[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document';

export interface PointMedia {
  id: string;
  pointId: string;
  jobFileId: string;
  kind: MediaKind;
  name: string;
  caption: string | null;
  ordinal: number;
  /** Signed, ready to use. The map's one GET returns these so the browser never asks per file. */
  url: string | null;
  thumbUrl: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
}

// ── WHAT A POINT CAN BE ─────────────────────────────────────────────────────────────────────────
// Owner, 2026-09-16: "we should be able to make the points of interest appear as different colors
// depending on what they are. there should be a generic point of interest, but there can be points
// of interest related to buildings, utilities, fences, property boundaries, street view, and
// whatever you can think of. The default for a new point of interest is the generic kind."
//
// The vocabulary lives here rather than in a database CHECK so that adding "cattle guard" next
// spring is one line and a colour token instead of a migration. Every entry carries:
//
//   token   a CSS custom property holding the colour, defined in the page's stylesheet. Colour is
//           never the only signal — the icon, the number and the label all carry the meaning too,
//           for colour-blind readers and for anything printed in grey.
//   icon    a lucide-react component NAME, as a string, so this module stays free of React.
//   hint    what a person should pick it for, shown under the option in the editor.
export type PointTypeId =
  | 'generic' | 'boundary' | 'monument_found' | 'monument_set' | 'building' | 'utility'
  | 'fence' | 'street_view' | 'access' | 'encroachment' | 'water' | 'vegetation'
  | 'easement' | 'hazard';

export interface PointType {
  id: PointTypeId;
  label: string;
  hint: string;
  token: string;
  icon: string;
}

export const POINT_TYPES: readonly PointType[] = [
  { id: 'generic',        label: 'Point of interest', hint: 'Anything worth marking. The default.',                     token: '--map-pin-generic',   icon: 'MapPin' },
  { id: 'boundary',       label: 'Property boundary', hint: 'A property line, a corner in question, a line of occupation.', token: '--map-pin-boundary', icon: 'Spline' },
  { id: 'monument_found', label: 'Monument found',    hint: 'An existing pin, rod, pipe or axle located on the ground.',  token: '--map-pin-found',     icon: 'Crosshair' },
  { id: 'monument_set',   label: 'Monument set',      hint: 'A corner the crew set.',                                     token: '--map-pin-set',       icon: 'Target' },
  { id: 'building',       label: 'Building',          hint: 'A house, barn, shed, slab or foundation.',                   token: '--map-pin-building',  icon: 'Home' },
  { id: 'utility',        label: 'Utility',           hint: 'Meter, pole, pedestal, riser, manhole, buried line marker.',  token: '--map-pin-utility',   icon: 'Zap' },
  { id: 'fence',          label: 'Fence',             hint: 'A fence, a gate post, or where the fence type changes.',      token: '--map-pin-fence',     icon: 'Fence' },
  { id: 'street_view',    label: 'Street view',       hint: 'Stand here, look this way — a vantage photo.',                token: '--map-pin-view',      icon: 'Camera' },
  { id: 'access',         label: 'Access',            hint: 'Gate, cattle guard, locked entry, the way in for the truck.', token: '--map-pin-access',    icon: 'DoorOpen' },
  { id: 'encroachment',   label: 'Encroachment',      hint: 'Something across a line. The thing Hank must see.',           token: '--map-pin-encroach',  icon: 'AlertTriangle' },
  { id: 'water',          label: 'Water / drainage',  hint: 'Creek, pond, culvert, drainage, flood-prone ground.',         token: '--map-pin-water',     icon: 'Waves' },
  { id: 'vegetation',     label: 'Vegetation',        hint: 'Heavy brush, tree line, a clearing problem for the crew.',    token: '--map-pin-vegetation', icon: 'Trees' },
  { id: 'easement',       label: 'Easement',          hint: 'A recorded easement, where it actually runs on the ground.',  token: '--map-pin-easement',  icon: 'Route' },
  { id: 'hazard',         label: 'Hazard',            hint: 'Dog, bull, unstable ground, live wire. Crew safety.',         token: '--map-pin-hazard',    icon: 'ShieldAlert' },
];

export const DEFAULT_POINT_TYPE: PointTypeId = 'generic';

export function pointType(id: string | null | undefined): PointType {
  return POINT_TYPES.find((t) => t.id === id) ?? POINT_TYPES[0]!;
}

/** A point type the database gave us that this build does not know about — a row written by a newer
 *  deploy, or a hand edit. It renders as generic rather than disappearing. */
export function isKnownPointType(id: string | null | undefined): id is PointTypeId {
  return POINT_TYPES.some((t) => t.id === id);
}

export type PointStatus = 'open' | 'resolved' | 'attention';

export const POINT_STATUSES: readonly { id: PointStatus; label: string; hint: string }[] = [
  { id: 'open',      label: 'Open',            hint: 'Recorded. Nothing outstanding.' },
  { id: 'resolved',  label: 'Resolved',        hint: 'Dealt with — the corner was set, the question answered.' },
  { id: 'attention', label: 'Needs attention', hint: 'Somebody has to go back to this, or Hank has to see it.' },
];

export function pointStatus(id: string | null | undefined): PointStatus {
  return POINT_STATUSES.some((s) => s.id === id) ? (id as PointStatus) : 'open';
}

// ── WHERE A PIN GOES ────────────────────────────────────────────────────────────────────────────

/** Turn a click anywhere on (or slightly off) the image into a position on it.
 *
 *  Clamped, not rejected: a click two pixels past the edge is somebody aiming at the corner pin, and
 *  dropping it would feel broken. A zero-sized box (the image has not laid out yet) answers the
 *  centre rather than dividing by zero. */
export function relativeFromClick(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }): RelativePoint {
  if (!(box.width > 0) || !(box.height > 0)) return { x: 0.5, y: 0.5 };
  return clampToImage({ x: (clientX - box.left) / box.width, y: (clientY - box.top) / box.height });
}

export function clampToImage(p: RelativePoint): RelativePoint {
  const fix = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);
  return { x: round6(fix(p.x)), y: round6(fix(p.y)) };
}

/** Six decimals is about a tenth of a pixel on a 100-megapixel image — past the point of meaning,
 *  and it keeps the JSON small when forty points go over the wire. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Where a pin sits in CSS terms, as percentages of the frame. */
export function pinStyle(p: RelativePoint): { left: string; top: string } {
  const c = clampToImage(p);
  return { left: `${c.x * 100}%`, top: `${c.y * 100}%` };
}

/** Pixels on the stored image, for export and for georeferencing. */
export function toImagePixels(p: RelativePoint, width: number, height: number): { x: number; y: number } {
  const c = clampToImage(p);
  return { x: Math.round(c.x * width), y: Math.round(c.y * height) };
}

// ── NUMBERING ───────────────────────────────────────────────────────────────────────────────────

/** The number a new point should wear: one past the highest in use, never a gap-filler. Reusing a
 *  freed number would silently rename "point 4" in every note, photo caption and phone call that
 *  ever referred to it. */
export function nextOrdinal(points: Pick<MapPoint, 'ordinal'>[]): number {
  return points.reduce((max, p) => Math.max(max, p.ordinal || 0), 0) + 1;
}

/** Close the gaps after a delete or a reorder: 1..n in the current order, stable for anything
 *  already correct. Returns only what actually changed, so the API writes two rows instead of forty. */
export function renumber<T extends { id: string; ordinal: number }>(points: T[]): Array<{ id: string; ordinal: number }> {
  return [...points]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((p, i) => ({ id: p.id, ordinal: i + 1 }))
    .filter((next) => points.find((p) => p.id === next.id)?.ordinal !== next.ordinal);
}

/** Move a point to a new position in the list (drag to reorder), then renumber. */
export function reorder<T extends { id: string; ordinal: number }>(points: T[], id: string, toIndex: number): Array<{ id: string; ordinal: number }> {
  const sorted = [...points].sort((a, b) => a.ordinal - b.ordinal);
  const from = sorted.findIndex((p) => p.id === id);
  if (from < 0) return [];
  const target = Math.min(sorted.length - 1, Math.max(0, toIndex));
  const [moved] = sorted.splice(from, 1);
  sorted.splice(target, 0, moved!);
  return sorted.map((p, i) => ({ id: p.id, ordinal: i + 1 })).filter((next) => points.find((p) => p.id === next.id)?.ordinal !== next.ordinal);
}

export function sortPoints<T extends { ordinal: number }>(points: T[]): T[] {
  return [...points].sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * What a point is called: its name, and nothing else.
 *
 * Owner, 2026-09-19: "I want to get rid of point numbers altogether and just have names for the
 * points." This used to return "3. Pipe at the NE corner"; it returns "Pipe at the NE corner".
 *
 * `ordinal` STAYS on the row. It is the ordering key, it has a unique index per map, and deleting a
 * point renumbers the rest — all of which is still wanted. What changed is that it stopped being
 * something anybody is shown, so a point no longer has two identities to keep in step. The argument
 * keeps its shape so every caller does not have to change for a display decision.
 */
export function pointLabel(point: Pick<MapPoint, 'ordinal' | 'title'>): string {
  return point.title.trim();
}

// ── WHAT IS ATTACHED ────────────────────────────────────────────────────────────────────────────

/** Which of the four kinds a file is, from its MIME type and, failing that, its name.
 *
 *  Phone cameras and the audio recorder both produce types the obvious `startsWith` misses —
 *  `video/quicktime` from an iPhone, `audio/webm;codecs=opus` from the fieldbook recorder, and
 *  HEIC photos that arrive as `image/heic` or with no type at all. */
export function mediaKindFor(mimeType: string | null | undefined, fileName?: string | null): MediaKind {
  const mime = (mimeType ?? '').toLowerCase().split(';')[0]!.trim();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  const ext = (fileName ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', 'hevc', '3gp'].includes(ext)) return 'video';
  if (['m4a', 'mp3', 'wav', 'aac', 'ogg', 'oga', 'opus', 'amr', 'caf'].includes(ext)) return 'audio';
  return 'document';
}

/** Only images and video get a generated preview; audio and documents show an icon. */
export function wantsThumbnail(kind: MediaKind): boolean {
  return kind === 'image' || kind === 'video';
}

/** What the point's card shows before anything is opened: the counts, worded for a person. */
export function mediaSummary(media: Pick<PointMedia, 'kind'>[]): string {
  const n = (k: MediaKind) => media.filter((m) => m.kind === k).length;
  const parts = [
    [n('image'), 'photo', 'photos'] as const,
    [n('video'), 'video', 'videos'] as const,
    [n('audio'), 'voice note', 'voice notes'] as const,
    [n('document'), 'file', 'files'] as const,
  ].filter(([count]) => count > 0).map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  return parts.length ? parts.join(', ') : 'No attachments yet';
}

/** The order media shows in: photos first (they are what people scan), then video, voice notes,
 *  files; within a kind, the order they were attached. */
export function sortMedia(media: PointMedia[]): PointMedia[] {
  const rank: Record<MediaKind, number> = { image: 0, video: 1, audio: 2, document: 3 };
  return [...media].sort((a, b) => rank[a.kind] - rank[b.kind] || a.ordinal - b.ordinal);
}

// ── FINDING A POINT ─────────────────────────────────────────────────────────────────────────────

export interface PointFilter {
  text?: string;
  types?: PointTypeId[];
  statuses?: PointStatus[];
  withMediaOnly?: boolean;
  /** Layers switched off in the panel. A point on one of these is filtered out of the list and the
   *  map — it is hidden, not deleted, and turning the sheet back on brings it straight back. */
  hiddenLayerIds?: string[];
  /** Needed to resolve a null `layerId` to the default sheet, so hiding the base layer works. */
  layers?: Array<{ id: string; isDefault: boolean; isVisible: boolean }>;
}

/** The side list's search and filter. Text matches the title, the notes, the type's label and any
 *  caption or file name — so "pipe", "encroach" and "NE corner" all find the right pin.
 *
 *  A query that is ONLY digits is treated as the point's number first, because that is what a person
 *  typing "7" means. Without that, "7" also matches every photo called IMG_4471.JPG, and the one
 *  search everybody uses — jump to the point somebody just read out to me over the phone — returns
 *  half the map. It falls back to a normal text search when no point wears that number. */
export function filterPoints(points: MapPoint[], filter: PointFilter): MapPoint[] {
  const text = (filter.text ?? '').trim().toLowerCase();
  const hidden = new Set(filter.hiddenLayerIds ?? []);
  const byType = points.filter((p) => {
    if (filter.types?.length && !filter.types.includes(p.pointType)) return false;
    if (filter.statuses?.length && !filter.statuses.includes(p.status)) return false;
    if (filter.withMediaOnly && p.media.length === 0) return false;
    // Resolved through `layerOf` rather than compared directly, so a point with a null layerId is
    // hidden when the DEFAULT sheet is switched off — which is the sheet it is actually on.
    if (hidden.size) {
      const layer = filter.layers ? layerOf(p, filter.layers) : null;
      if (layer ? hidden.has(layer.id) : (p.layerId && hidden.has(p.layerId))) return false;
    }
    return true;
  });
  if (!text) return byType;

  if (/^\d+$/.test(text)) {
    const numbered = byType.filter((p) => String(p.ordinal) === text);
    if (numbered.length) return numbered;
  }
  return byType.filter((p) => [
    String(p.ordinal), p.title, p.notes ?? '', pointType(p.pointType).label,
    ...p.media.map((m) => `${m.name} ${m.caption ?? ''}`),
  ].join(' ').toLowerCase().includes(text));
}

/** The types actually present on a map — the legend shows these and nothing else, so a map of
 *  fence corners does not display a key of fourteen things it does not contain. */
export function typesInUse(points: Pick<MapPoint, 'pointType'>[]): PointType[] {
  const present = new Set(points.map((p) => p.pointType));
  return POINT_TYPES.filter((t) => present.has(t.id));
}

// ── LAYERS ──────────────────────────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-18: "I want it where we can create different layers for points … that might make
// things get cramped a little … We can still put all of the points on one layer, but we can also
// create and name layers and have layer management and move points between layers … We need to be
// able to hide and unhide the different layers too."
//
// A layer is a SHEET somebody made and named; `pointType` is a CLASSIFICATION from a fixed
// vocabulary. They are different questions and both filter at once — see seeds/645 for the argument.

export const DEFAULT_LAYER_NAME = 'Base layer';
export const MAX_LAYER_NAME = 120;

export interface MapLayer {
  id: string;
  mapId: string;
  name: string;
  ordinal: number;
  /** Saved, not per-browser: the other person looking at the same job sees the same sheet turned off. */
  isVisible: boolean;
  /** The sheet a point lands on when nobody chose. Exactly one per map; renameable, not deletable. */
  isDefault: boolean;
  /**
   * What colour this sheet's points are drawn in, as #RRGGBB, or null for "no opinion".
   *
   * Null is the important case: those points keep the colour of their point_type, which is how
   * every map looked before layer colours existed. Colouring a layer is an override somebody chose,
   * not a default the feature imposes.
   */
  colour: string | null;
}

/**
 * The palette a layer can be coloured from.
 *
 * A fixed set rather than a colour picker, for two reasons that both matter more than choice. These
 * are drawn on satellite imagery — which is dark, green and brown almost everywhere — so a free
 * picker reliably produces a layer nobody can see; every colour here has been checked against
 * aerial photography. And eight distinguishable colours is already past what anybody can hold in
 * their head, so offering sixteen million invites a map with four shades of blue on it.
 */
export const LAYER_COLOURS: readonly { id: string; label: string; hex: string }[] = [
  { id: 'none', label: 'By point type', hex: '' },
  { id: 'amber', label: 'Amber', hex: '#F59E0B' },
  { id: 'rose', label: 'Rose', hex: '#F43F5E' },
  { id: 'violet', label: 'Violet', hex: '#8B5CF6' },
  { id: 'cyan', label: 'Cyan', hex: '#06B6D4' },
  { id: 'lime', label: 'Lime', hex: '#84CC16' },
  { id: 'orange', label: 'Orange', hex: '#F97316' },
  { id: 'pink', label: 'Pink', hex: '#EC4899' },
  { id: 'white', label: 'White', hex: '#F8FAFC' },
];

/** A colour the database will accept: #RRGGBB, or null to clear it. Anything else is refused rather
 *  than coerced — a silently-ignored colour is a layer somebody thinks they coloured. */
export function checkLayerColour(raw: unknown): { ok: boolean; value?: string | null; error?: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'A colour must be text.' };
  const v = raw.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) return { ok: false, error: 'A colour must look like #RRGGBB.' };
  return { ok: true, value: v.toUpperCase() };
}

/**
 * What colour a point is actually drawn in.
 *
 * The layer wins when it has one, because that is the question somebody asked by colouring it. With
 * no layer colour the point keeps its type's colour, which is how the map read before this existed.
 */
export function pointColour(
  point: { pointType: PointTypeId; layerId: string | null },
  layers: Array<{ id: string; isDefault: boolean; colour: string | null }>,
  typeColour: (t: PointTypeId) => string,
): string {
  const layer = layerOf(point, layers);
  return layer?.colour || typeColour(point.pointType);
}

export interface LayerNameCheck {
  ok: boolean;
  value?: string;
  error?: string;
}

/** Validate a layer's name. Same shape as `checkLabel` for files, and the same reasoning: control
 *  characters would render as a one-line name with invisible holes in it. Blank is an ERROR here
 *  rather than a clear, because a layer always has to be called something to be pickable in a list. */
export function checkLayerName(raw: unknown): LayerNameCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'A layer needs a name.' };
  const cleaned = raw.replace(new RegExp('[\\u0000-\\u001F\\u007F]', 'g'), ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { ok: false, error: 'A layer needs a name.' };
  if (cleaned.length > MAX_LAYER_NAME) {
    return { ok: false, error: `A layer name must be ${MAX_LAYER_NAME} characters or fewer.` };
  }
  return { ok: true, value: cleaned };
}

/** Panel order: by ordinal, and the default sheet first whatever its ordinal, because it is the one
 *  every map has and the one points fall back to. */
export function sortLayers<T extends { ordinal: number; isDefault: boolean; name: string }>(layers: T[]): T[] {
  return [...layers].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
    return a.name.localeCompare(b.name);
  });
}

/** The layer a point is on. A null `layerId` — every point that predates seeds/645, and any point
 *  whose layer was deleted — reads as the default sheet, so a point is never on no layer at all. */
export function layerOf<T extends { id: string; isDefault: boolean }>(
  point: { layerId: string | null },
  layers: T[],
): T | null {
  if (point.layerId) {
    const found = layers.find((l) => l.id === point.layerId);
    if (found) return found;
  }
  // A layerId pointing at a layer that is not in the list (deleted, or another map's) falls back
  // rather than hiding the point: a point nobody can see is worse than a point on the wrong sheet.
  return layers.find((l) => l.isDefault) ?? null;
}

/** The ids of the layers that are switched off, for the filter. */
export function hiddenLayerIds<T extends { id: string; isVisible: boolean }>(layers: T[]): string[] {
  return layers.filter((l) => !l.isVisible).map((l) => l.id);
}

/** Is this point on a sheet that is currently showing?
 *
 *  Hiding is a VIEW rule, not a delete: the point is still on the map, still numbered, and turning
 *  the sheet back on brings it straight back. */
export function isPointVisible<T extends { id: string; isDefault: boolean; isVisible: boolean }>(
  point: { layerId: string | null },
  layers: T[],
): boolean {
  const layer = layerOf(point, layers);
  return layer ? layer.isVisible : true;
}

/** How many live points sit on each layer — the count beside each name in the panel, and what the
 *  delete confirmation needs so it can say what is about to move. */
export function pointsPerLayer<T extends { id: string; isDefault: boolean }>(
  points: Array<{ layerId: string | null }>,
  layers: T[],
): Map<string, number> {
  const out = new Map<string, number>(layers.map((l) => [l.id, 0]));
  for (const p of points) {
    const l = layerOf(p, layers);
    if (l) out.set(l.id, (out.get(l.id) ?? 0) + 1);
  }
  return out;
}

/** A name for a new sheet that does not collide with one already there: "Layer 2", "Layer 3", … */
export function nextLayerName(layers: Array<{ name: string }>, base = 'Layer'): string {
  const taken = new Set(layers.map((l) => l.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`;
}

// ── REAL-WORLD COORDINATES (Phase 7; pure, so it is built and tested once) ──────────────────────

export interface GeoAnchor extends RelativePoint {
  lat: number;
  lng: number;
}

export interface Georeference {
  a: GeoAnchor;
  b: GeoAnchor;
}

/** A two-anchor affine tie: scale and offset per axis, from two points whose real coordinates are
 *  known. Deliberately not a full rotation fit — an aerial the operator saved from a mapping site is
 *  north-up, and two corners are all anybody will patiently click. Returns null when the anchors are
 *  too close together to define a scale, which would otherwise produce coordinates in the Atlantic. */
export function affineFromTwoPoints(geo: Georeference | null | undefined): { lat0: number; lng0: number; dLat: number; dLng: number } | null {
  if (!geo?.a || !geo?.b) return null;
  const dx = geo.b.x - geo.a.x;
  const dy = geo.b.y - geo.a.y;
  if (Math.abs(dx) < 0.02 || Math.abs(dy) < 0.02) return null;
  const dLng = (geo.b.lng - geo.a.lng) / dx;
  const dLat = (geo.b.lat - geo.a.lat) / dy;
  return { lat0: geo.a.lat - geo.a.y * dLat, lng0: geo.a.lng - geo.a.x * dLng, dLat, dLng };
}

export function pixelToLatLng(p: RelativePoint, geo: Georeference | null | undefined): { lat: number; lng: number } | null {
  const fit = affineFromTwoPoints(geo);
  if (!fit) return null;
  const c = clampToImage(p);
  return { lat: round6(fit.lat0 + c.y * fit.dLat), lng: round6(fit.lng0 + c.x * fit.dLng) };
}

/** Straight-line distance in feet between two pins on a georeferenced map. Equirectangular, which
 *  is accurate to a fraction of a foot over a property and far easier to reason about than
 *  haversine at this scale. */
export function distanceFeet(a: RelativePoint, b: RelativePoint, geo: Georeference | null | undefined): number | null {
  const pa = pixelToLatLng(a, geo);
  const pb = pixelToLatLng(b, geo);
  if (!pa || !pb) return null;
  const midLat = ((pa.lat + pb.lat) / 2) * (Math.PI / 180);
  const feetPerDegLat = 364000;
  const dLat = (pb.lat - pa.lat) * feetPerDegLat;
  const dLng = (pb.lng - pa.lng) * feetPerDegLat * Math.cos(midLat);
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
}

/** A link a phone will open in its maps app. */
export function mapsHref(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
