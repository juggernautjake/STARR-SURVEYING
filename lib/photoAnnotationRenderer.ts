// lib/photoAnnotationRenderer.ts — server/web-side renderer helpers
// for the photo annotation JSON document the mobile annotator
// produces (mobile/lib/photoAnnotation.ts).
//
// These are PURE functions — no React dependency — so the admin
// /admin/field-data/[id] page can render the SVG overlay using
// inline <svg> + <path> without pulling react-native-svg into the
// Next.js build. The mobile primitives in
// mobile/lib/photoAnnotation.ts have an identical shape; they
// can't be imported here because the mobile package targets RN.
//
// Annotation shape contract — keep in sync with the mobile module:
//   { schema: 1, updated_at, updated_by, items: [...] }

export interface PenStroke {
  type: 'pen';
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

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

export interface AnnotationDocument {
  schema: 1;
  updated_at: string;
  updated_by: string | null;
  items: Annotation[];
}

/** Defensive parse — returns null on bad/missing JSON. */
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

/** Convert a stroke to an SVG `d` attribute scaled to the displayed
 *  image dimensions. Identical algorithm to the mobile renderer so
 *  the same JSON renders consistently in both places. */
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

/** Stroke width in display pixels — uses the shorter edge so the
 *  apparent thickness is consistent across orientations. */
export function strokeWidthPx(
  normalisedWidth: number,
  displayWidth: number,
  displayHeight: number
): number {
  const shorter = Math.min(displayWidth, displayHeight);
  return Math.max(1, Math.round(normalisedWidth * shorter));
}
