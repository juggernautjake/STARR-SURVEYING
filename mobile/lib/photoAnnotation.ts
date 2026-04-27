/**
 * Photo annotation data model + helpers.
 *
 * Per plan §5.4: "the original is ALWAYS preserved unmodified.
 * Annotations are rendered on top." We keep annotations as a small
 * JSON blob in `field_media.annotations` (TEXT-encoded JSONB on the
 * server), with coordinates normalised 0..1 over the image so the
 * overlay renders identically on any display size — phone, tablet,
 * web admin lightbox.
 *
 * v1 ships pen strokes only. Arrow / circle / text primitives are
 * deferred to F3 polish; the JSON shape below is forward-compatible
 * (each annotation has a `type` discriminator).
 */

/**
 * A single freehand pen stroke. Points are normalised 0..1 over the
 * image's intrinsic dimensions — the renderer multiplies by the
 * displayed width / height to plot. width is also normalised by the
 * SHORTER edge (so a 4 px stroke on a phone becomes ~12 px on a
 * tablet, scaling proportionally).
 */
export interface PenStroke {
  type: 'pen';
  color: string;
  /** Normalised 0..1 over the shorter image edge. v1 hardcodes
   *  ~0.008 (≈8 px on a 1000-px-wide photo). */
  width: number;
  points: Array<{ x: number; y: number }>;
}

/** Future primitives — schema reserved so v1 readers don't choke
 *  when v2 starts emitting them. */
export interface ArrowPrimitive {
  type: 'arrow';
  color: string;
  width: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface CirclePrimitive {
  type: 'circle';
  color: string;
  width: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface TextPrimitive {
  type: 'text';
  color: string;
  size: number;
  x: number;
  y: number;
  text: string;
}

export type Annotation =
  | PenStroke
  | ArrowPrimitive
  | CirclePrimitive
  | TextPrimitive;

/** Top-level shape persisted to `field_media.annotations`. The
 *  envelope lets us add metadata (annotated_by, annotated_at, tool
 *  versions) without breaking older readers. */
export interface AnnotationDocument {
  /** Schema version. v1 = 1; bump when readers can't tolerate new
   *  primitives without code change. */
  schema: 1;
  /** ISO timestamp of the latest save. */
  updated_at: string;
  /** auth.users.id of the most recent annotator. */
  updated_by: string | null;
  /** The drawing primitives in z-order (last item renders on top). */
  items: Annotation[];
}

/**
 * Parse the `annotations` JSON column safely. Returns null when the
 * column is empty OR the JSON is malformed (defensive — a bad row
 * shouldn't crash the renderer).
 */
export function parseAnnotations(
  raw: string | null | undefined
): AnnotationDocument | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'items' in parsed &&
      Array.isArray((parsed as AnnotationDocument).items)
    ) {
      return parsed as AnnotationDocument;
    }
    return null;
  } catch {
    return null;
  }
}

/** Build an empty doc the editor seeds with on first open. */
export function emptyAnnotationDocument(
  updatedBy: string | null
): AnnotationDocument {
  return {
    schema: 1,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
    items: [],
  };
}

/** Default pen-stroke width (normalised 0..1). ~8 px at 1000-px
 *  display width. Surveyors need a stroke heavy enough to read in
 *  full sun; thinner is illegible on the field photo's HDR sky. */
export const DEFAULT_PEN_WIDTH = 0.008;

/** Default pen colour. Red is the highest-contrast against the
 *  earth-tone palette of typical field photos (brush, dirt, monuments). */
export const DEFAULT_PEN_COLOR = '#FF1744';

/** Available annotation colours — paired with default-pen-width
 *  for v1. Red is the default; yellow + black are alternates for
 *  high-contrast scenes (yellow on dark soil, black on snow). */
export const ANNOTATION_COLORS: ReadonlyArray<{
  id: string;
  hex: string;
  label: string;
}> = [
  { id: 'red', hex: '#FF1744', label: 'Red' },
  { id: 'yellow', hex: '#FFD600', label: 'Yellow' },
  { id: 'cyan', hex: '#00E5FF', label: 'Cyan' },
  { id: 'black', hex: '#000000', label: 'Black' },
];

/**
 * Convert a `PenStroke`'s normalised points to an SVG path `d`
 * attribute scaled to the displayed image dimensions. Used by both
 * the mobile editor and the admin renderer so a stroke draws
 * identically wherever it's rendered.
 *
 * Algorithm: M <first>; L <each subsequent>. Smooth curves can come
 * later — for the surveyor "circle this monument" use case, polylines
 * are perfectly readable.
 */
export function strokeToPath(
  stroke: PenStroke,
  displayWidth: number,
  displayHeight: number
): string {
  if (stroke.points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < stroke.points.length; i++) {
    const p = stroke.points[i];
    const x = p.x * displayWidth;
    const y = p.y * displayHeight;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return parts.join(' ');
}

/**
 * Convert a normalised stroke width to display pixels. The shorter
 * displayed edge drives the scale, matching the pen-stroke
 * coordinate system (so the stroke's apparent thickness is
 * consistent across rotations + display sizes).
 */
export function strokeWidthPx(
  normalisedWidth: number,
  displayWidth: number,
  displayHeight: number
): number {
  const shorter = Math.min(displayWidth, displayHeight);
  return Math.max(1, Math.round(normalisedWidth * shorter));
}
