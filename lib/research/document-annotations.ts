// lib/research/document-annotations.ts — markup that survives, kept apart from the original (R24).
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────────────
//
// `SourceDocumentViewer` has had a full drawing canvas — colours, widths, freehand strokes, per page
// — since it was written, and `drawPaths` is React state and nothing else. Close the viewer and
// every mark is gone. A feature that looks complete and keeps nothing is worse than one that is
// missing: somebody marks up a plat, closes the tab, and only then finds out.
//
// ── TWO CONTRACTS ───────────────────────────────────────────────────────────────────────────────
//
// 1. The original file is never modified. Annotations are rows keyed to the document; nothing
//    re-encodes the image or writes to `storage_path`. A recorded instrument that has been drawn on
//    is no longer the recorded instrument.
//
// 2. Coordinates are FRACTIONS of the page, 0–1 — never pixels. The viewer draws into a canvas sized
//    to `img.naturalWidth`; storing those pixels pins every stroke to one rendering of one scan, and
//    a page re-uploaded at a different resolution (which the re-run path does) moves the markup
//    somewhere else on the page without anybody noticing. Same rule R17 set for fact bounding boxes.

export type StrokeKind = 'freehand' | 'line' | 'rect' | 'ellipse' | 'text' | 'arrow';

export interface NormPoint { x: number; y: number }

export interface Stroke {
  kind: StrokeKind;
  /** 0–1 fractions of page width/height. */
  points: NormPoint[];
  color: string;
  /** Fraction of page width, so a stroke keeps its visual weight at any zoom or render size. */
  width: number;
  text?: string;
}

export interface AnnotationLayer {
  id?: string;
  documentId: string;
  page: number;
  layerName: string;
  layerColor?: string | null;
  layerOrder: number;
  visible: boolean;
  strokes: Stroke[];
  authorEmail: string;
  updatedAt?: string;
}

// ── Coordinate conversion ───────────────────────────────────────────────────────────────────────

/** Pixels on a rendered page → fractions. The one direction that matters at save time. */
export function toNormalised(
  points: Array<{ x: number; y: number }>,
  pageWidthPx: number,
  pageHeightPx: number,
): NormPoint[] {
  if (!(pageWidthPx > 0) || !(pageHeightPx > 0)) return [];
  return points.map((p) => ({
    x: clamp01(p.x / pageWidthPx),
    y: clamp01(p.y / pageHeightPx),
  }));
}

/** Fractions → pixels for whatever size the page is being drawn at right now. */
export function toPixels(
  points: NormPoint[],
  pageWidthPx: number,
  pageHeightPx: number,
): Array<{ x: number; y: number }> {
  return points.map((p) => ({ x: p.x * pageWidthPx, y: p.y * pageHeightPx }));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Stroke width as a fraction of page width, so a 3px line drawn on a 2000px scan does not become a
 *  hairline when the same page is rendered at 600px. */
export function normaliseWidth(pxWidth: number, pageWidthPx: number): number {
  if (!(pageWidthPx > 0)) return 0.002;
  return clamp01(pxWidth / pageWidthPx) || 0.002;
}

export function widthInPixels(normWidth: number, pageWidthPx: number): number {
  // Never below 1px: a stroke that rounds to zero is a stroke that vanished, and the user would
  // reasonably conclude their markup was lost again.
  return Math.max(1, normWidth * pageWidthPx);
}

// ── Validation ──────────────────────────────────────────────────────────────────────────────────

/** Reject anything that is not already normalised.
 *
 *  Deliberately strict at the boundary rather than clamping quietly: a payload carrying pixel
 *  coordinates means a caller has the contract wrong, and silently squashing 1400 → 1 would put the
 *  markup in the corner of the page and look like a rendering bug for weeks. */
export function validateStrokes(strokes: unknown): string | null {
  if (!Array.isArray(strokes)) return 'Strokes must be an array.';
  if (strokes.length > 2000) return 'Too many strokes in one layer (limit 2000).';

  for (const [i, s] of strokes.entries()) {
    const st = s as Partial<Stroke>;
    if (!st || typeof st !== 'object') return `Stroke ${i} is not an object.`;
    if (!Array.isArray(st.points) || st.points.length === 0) return `Stroke ${i} has no points.`;
    if (st.points.length > 5000) return `Stroke ${i} has too many points (limit 5000).`;
    for (const p of st.points) {
      if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        return `Stroke ${i} has a point that is not a pair of numbers.`;
      }
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
        return `Stroke ${i} has a point outside 0–1. Coordinates must be fractions of the page, not pixels.`;
      }
    }
    if (typeof st.color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(st.color)) {
      return `Stroke ${i} has no valid colour.`;
    }
    if (typeof st.width !== 'number' || st.width <= 0 || st.width > 1) {
      return `Stroke ${i} has an invalid width — it must be a fraction of the page width.`;
    }
  }
  return null;
}

// ── Flattening for export ───────────────────────────────────────────────────────────────────────

/** Visible layers for one page, in draw order.
 *
 *  Hidden layers are dropped rather than drawn faintly — "visible: false" is a decision the author
 *  made, and a flattened export that quietly includes it hands somebody a document with markup they
 *  had deliberately turned off. */
export function flattenLayers(layers: AnnotationLayer[], page: number): Stroke[] {
  return layers
    .filter((l) => l.page === page && l.visible)
    .sort((a, b) => a.layerOrder - b.layerOrder)
    .flatMap((l) => l.strokes);
}

export interface AnnotationSummary {
  layers: number;
  strokes: number;
  pages: number[];
  authors: string[];
  headline: string;
}

/** What is on this document, said before a reader opens it — otherwise markup on page 7 of a
 *  12-page plat is invisible until somebody happens to scroll there. */
export function summariseAnnotations(layers: AnnotationLayer[]): AnnotationSummary {
  const withStrokes = layers.filter((l) => l.strokes.length > 0);
  const pages = [...new Set(withStrokes.map((l) => l.page))].sort((a, b) => a - b);
  const authors = [...new Set(withStrokes.map((l) => l.authorEmail))];
  const strokes = withStrokes.reduce((n, l) => n + l.strokes.length, 0);

  const headline = withStrokes.length === 0
    ? 'No markup has been saved on this document.'
    : `${strokes} mark(s) across ${withStrokes.length} layer(s) on page(s) ${pages.map((p) => p + 1).join(', ')}` +
      `, by ${authors.join(', ')}. The original document is unchanged.`;

  return { layers: withStrokes.length, strokes, pages, authors, headline };
}

// ── Row mapping ─────────────────────────────────────────────────────────────────────────────────

export interface AnnotationRow {
  id: string;
  research_project_id: string;
  document_id: string;
  page: number;
  layer_name: string;
  layer_color: string | null;
  layer_order: number;
  visible: boolean;
  strokes: Stroke[];
  author_email: string;
  updated_at: string;
}

export function toLayer(r: AnnotationRow): AnnotationLayer {
  return {
    id: r.id,
    documentId: r.document_id,
    page: r.page,
    layerName: r.layer_name,
    layerColor: r.layer_color,
    layerOrder: r.layer_order,
    visible: r.visible,
    strokes: Array.isArray(r.strokes) ? r.strokes : [],
    authorEmail: r.author_email,
    updatedAt: r.updated_at,
  };
}
