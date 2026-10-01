// lib/files/trv-preview.ts — Traverse PC drawings in the file viewer (owner, 2026-10-01).
//
// "making it so that we can clearly open and look at trv files in the file viewer and in the cad
// software."
//
// Pure: which files are TRV, and the SVG markup the viewer's TrvPreview draws. The drawing itself
// is resolved by lib/cad/io/trv-model.ts — the same model the Forge importer uses — so the preview
// and Starr CAD can never disagree about where a line or a curve is.
//
// `fileKind` in viewer-model.ts is deliberately NOT changed: it also decides which job folders
// accept an upload. The viewer asks `trvFormat` first, the same way it asks `sheetFormat`.

import type { TrvModel, TrvModelEntity, TrvModelLayer, TrvPathSegment } from '@/lib/cad/io/trv-model';
import type { TrvArc, XY } from '@/lib/cad/io/trv-geometry';

export type TrvFormat = 'trv' | 'trb';

/** Bigger than this is not fetched for a preview (the largest sample is ~350 KB). */
export const TRV_MAX_BYTES = 20 * 1024 * 1024;

/** Which Traverse PC format a file is, or null. By name: TPC files arrive typed as
 *  `application/octet-stream`, `text/plain` or nothing at all. `.TRB` is TPC's backup copy — the
 *  same format. */
export function trvFormat(name: string | null | undefined, _mime?: string | null): TrvFormat | null {
  const n = name ?? '';
  if (/\.trv$/i.test(n)) return 'trv';
  if (/\.trb$/i.test(n)) return 'trb';
  return null;
}

export function isTrv(name: string | null | undefined, mime?: string | null): boolean {
  return trvFormat(name, mime) !== null;
}

// ── SVG ─────────────────────────────────────────────────────────────────
//
// World coordinates are state-plane feet (northings near 10,000,000). SVG coordinates are single
// precision in most renderers, so everything is drawn relative to a local origin, with y flipped
// (SVG y runs down, northing runs up).

export interface SvgFrame { ox: number; oy: number }

export function frameFor(model: TrvModel): SvgFrame {
  const b = model.fitBounds ?? model.bounds;
  return b ? { ox: b.minX, oy: b.maxY } : { ox: 0, oy: 0 };
}

const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(3).replace(/\.?0+$/, ''));
export const sx = (fr: SvgFrame, p: XY) => f(p.x - fr.ox);
export const sy = (fr: SvgFrame, p: XY) => f(fr.oy - p.y);

/** XML-escape text from the file before it goes into markup. */
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** The SVG arc command that draws `arc` from its start to its end. World CCW is screen CW after the
 *  y flip, which is SVG's sweep-flag 1. */
export function svgArcTo(fr: SvgFrame, arc: TrvArc): string {
  const large = arc.delta > Math.PI ? 1 : 0;
  const sweepFlag = arc.anticlockwise ? 1 : 0;
  return `A${f(arc.radius)} ${f(arc.radius)} 0 ${large} ${sweepFlag} ${sx(fr, arc.end)} ${sy(fr, arc.end)}`;
}

/** Path data for a traverse: pen-up edges become moves, arcs are true SVG arcs. */
export function svgPathData(fr: SvgFrame, segments: ReadonlyArray<TrvPathSegment>): string {
  let d = '';
  let at: XY | null = null;
  for (const s of segments) {
    const from = s.kind === 'arc' ? s.arc.start : s.from;
    const to = s.kind === 'arc' ? s.arc.end : s.to;
    if (!s.drawn) { at = null; continue; }
    if (!at || Math.abs(at.x - from.x) > 1e-9 || Math.abs(at.y - from.y) > 1e-9) d += `M${sx(fr, from)} ${sy(fr, from)}`;
    d += s.kind === 'arc' ? svgArcTo(fr, s.arc) : `L${sx(fr, to)} ${sy(fr, to)}`;
    at = to;
  }
  return d;
}

const DASH: Record<string, string> = { dashed: ' stroke-dasharray="6 4"', fence: ' stroke-dasharray="10 3 2 3"', solid: '' };

function entitySvg(fr: SvgFrame, e: TrvModelEntity): string {
  switch (e.kind) {
    case 'point': {
      // A zero-length round-capped line is a dot that stays the same size at any zoom.
      return `<path class="trv-pt" d="M${sx(fr, e)} ${sy(fr, e)}h0"/>`;
    }
    case 'path': {
      const d = svgPathData(fr, e.segments);
      if (!d) return '';
      const fill = e.closed && e.fill ? ' class="trv-fill"' : '';
      // A filled closed path needs the full ring (pen-ups ignored) for its fill.
      const ring = e.closed && e.fill ? `<path class="trv-fillarea" d="${svgPathData(fr, e.segments.map((s) => ({ ...s, drawn: true })))}Z"/>` : '';
      return `${ring}<path${fill} d="${d}"${e.bold ? ' stroke-width="2"' : ''}${DASH[e.stroke]}/>`;
    }
    case 'line':
      return `<path d="M${sx(fr, e.from)} ${sy(fr, e.from)}L${sx(fr, e.to)} ${sy(fr, e.to)}"${DASH[e.stroke]}/>`;
    case 'arc':
      return `<path d="M${sx(fr, e.arc.start)} ${sy(fr, e.arc.start)}${svgArcTo(fr, e.arc)}"${DASH[e.stroke]}/>`;
    case 'polyline': {
      const pts = e.vertices.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(fr, v)} ${sy(fr, v)}`).join('');
      const arrow = e.source === 'leader' && e.vertices.length >= 2 ? ' marker-start="url(#trv-arrow)"' : '';
      return `<path d="${pts}${e.closed ? 'Z' : ''}"${DASH[e.stroke]}${arrow}/>`;
    }
    case 'symbol': {
      const x = sx(fr, e), y = sy(fr, e);
      return `<path class="trv-sym" d="M${x} ${y}h0"><title>Symbol ${escapeXml(e.symbolId)}</title></path>`;
    }
    case 'text': {
      const lines = e.text.split('\n');
      const x = sx(fr, e), y = sy(fr, e);
      const h = e.height;
      const anchor = e.hAlign === 'middle' ? 'middle' : 'start';
      // Multi-line: centre the block on the anchor when vertically centred, else lines go downward.
      const firstDy = e.vAlign === 'middle' ? -((lines.length - 1) * h * 1.2) / 2 : 0;
      const tspans = lines.map((ln, i) => `<tspan x="${x}" dy="${f(i === 0 ? firstDy : h * 1.2)}">${escapeXml(ln)}</tspan>`).join('');
      const rot = e.rotationDeg ? ` transform="rotate(${f(-e.rotationDeg)} ${x} ${y})"` : '';
      const base = e.vAlign === 'middle' ? ' dominant-baseline="central"' : '';
      return `<text class="trv-t trv-t--${e.role}" x="${x}" y="${y}" font-size="${f(h)}" text-anchor="${anchor}"${base}${rot}>${tspans}</text>`;
    }
  }
}

export interface TrvSvgOptions {
  /** Draw each point's id next to it. */
  showPointLabels?: boolean;
  /** Text height (world units) for point ids. Defaults to 6 pt at the model's plot scale. */
  pointLabelHeight?: number;
}

/** The drawing, grouped by layer (`<g data-layer="key">`), as an SVG fragment in the frame's local
 *  coordinates. Every string from the file is escaped. Hidden entities (TPC construction copies)
 *  are included but sit on their own layer, hidden by default via `layerVisibility`. */
export function renderTrvSvg(model: TrvModel, fr: SvgFrame, opts: TrvSvgOptions = {}): string {
  const byLayer = new Map<string, string[]>();
  for (const e of model.entities) {
    const out = entitySvg(fr, e);
    if (!out) continue;
    if (!byLayer.has(e.layerKey)) byLayer.set(e.layerKey, []);
    byLayer.get(e.layerKey)!.push(out);
  }
  const groups = model.layers.map((l) => {
    const parts = byLayer.get(l.key) ?? [];
    const color = l.color ? ` style="color:${escapeXml(l.color)}"` : '';
    return `<g data-layer="${escapeXml(l.key)}" class="trv-layer trv-layer--${l.role}"${color}>${parts.join('')}</g>`;
  });
  if (opts.showPointLabels) {
    const h = opts.pointLabelHeight ?? (6 / 72) * model.scale;
    const ids = model.entities
      .filter((e): e is Extract<TrvModelEntity, { kind: 'point' }> => e.kind === 'point')
      .map((p) => `<text x="${f(p.x - fr.ox + h * 0.4)}" y="${f(fr.oy - p.y - h * 0.4)}" font-size="${f(h)}">${escapeXml(p.id)}</text>`);
    groups.push(`<g data-layer="points" class="trv-ptlabels">${ids.join('')}</g>`);
  }
  return groups.join('');
}

/** The `<defs>` the drawing references (leader arrowheads). */
export const TRV_SVG_DEFS = '<defs><marker id="trv-arrow" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M10 0L0 5L10 10z" fill="currentColor"/></marker></defs>';

/** View box (local coordinates) that fits the model's fit bounds with a margin. */
export function fitViewBox(model: TrvModel, fr: SvgFrame, aspect = 4 / 3, margin = 0.06): { x: number; y: number; w: number; h: number } {
  const b = model.fitBounds ?? model.bounds;
  if (!b) return { x: -50, y: -50, w: 100, h: 100 / aspect };
  let w = Math.max(b.maxX - b.minX, 1);
  let h = Math.max(b.maxY - b.minY, 1);
  w *= 1 + margin * 2;
  h *= 1 + margin * 2;
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  const cx = (b.minX + b.maxX) / 2 - fr.ox;
  const cy = fr.oy - (b.minY + b.maxY) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Zoom a view box by `factor` (> 1 zooms in) keeping the local point (px, py) fixed. */
export function zoomViewBox(v: { x: number; y: number; w: number; h: number }, factor: number, px: number, py: number) {
  const w = v.w / factor;
  const h = v.h / factor;
  return { x: px - (px - v.x) / factor, y: py - (py - v.y) / factor, w, h };
}

/** One line of counts for the summary bar. */
export function summaryLine(model: TrvModel): Array<{ label: string; value: number }> {
  const s = model.summary;
  return [
    { label: 'Points', value: s.points },
    { label: 'Lines', value: s.lines },
    { label: 'Curves', value: s.curves },
    { label: 'Shapes', value: s.shapes },
    { label: 'Labels', value: s.labels + s.texts },
    { label: 'Layers', value: s.layers },
  ];
}

/** Layers listed in the panel: the model's layers with their entity counts. */
export function panelLayers(model: TrvModel): TrvModelLayer[] {
  return model.layers.filter((l) => l.count > 0);
}
