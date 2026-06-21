// lib/diagrams/survey-diagram.ts
// Pure, DOM-free SVG generator for randomized surveying problems. Given the
// concrete values produced by the problem engine, it renders a labeled diagram
// (traverse, inverse line, triangle, horizontal curve, leveling profile, compass)
// that TRULY matches the generated numbers. Runs server-side in the quiz API in
// well under a millisecond. Reuses the STARR CAD survey-geometry helpers.
//
// A template carries a `diagram` SPEC that references its parameter names; at
// generation time `buildDiagramFromSpec(spec, vars)` resolves those names to the
// freshly-generated numbers and returns an <svg> string (or null on any error —
// a missing diagram must never break a quiz).

import { forwardPoint, formatBearing, formatAzimuth } from '../cad/geometry/bearing';
import type { Point2D } from '../cad/types';

// ────────────────────────────────────────────────────────────────────────────
// Spec types (stored on a problem_template; var names resolved at gen time)
// ────────────────────────────────────────────────────────────────────────────
export interface TraverseLegSpec { azVar?: string; az?: number; distVar?: string; dist?: number; label?: string; }
export interface DiagramSpec {
  type: 'traverse' | 'inverse' | 'triangle' | 'curve' | 'leveling' | 'compass';
  // traverse
  startNVar?: string; startEVar?: string;
  legs?: TraverseLegSpec[];
  closed?: boolean;
  // highlight an inverse between two vertex indices (0-based) of the traverse
  inverseFrom?: number; inverseTo?: number;
  // inverse (two explicit points)
  aNVar?: string; aEVar?: string; bNVar?: string; bEVar?: string; aLabel?: string; bLabel?: string;
  // triangle (three points by var, or two sides + included angle)
  vertices?: { nVar?: string; eVar?: string; n?: number; e?: number; label?: string }[];
  // curve (horizontal): radius + central angle (deg)
  rVar?: string; iVar?: string;
  // leveling: backsight/foresight readings on a benchmark + turning point
  bsVar?: string; fsVar?: string; biLabel?: string;
  // compass: a single azimuth to illustrate
  azVar?: string;
  title?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Canvas + world→screen helpers
// ────────────────────────────────────────────────────────────────────────────
const W = 520, H = 380, PAD = 46;

interface Xf { sx: (e: number) => number; sy: (n: number) => number; }

function fitTransform(pts: Point2D[]): Xf {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const p of pts) {
    if (p.x < minE) minE = p.x; if (p.x > maxE) maxE = p.x;
    if (p.y < minN) minN = p.y; if (p.y > maxN) maxN = p.y;
  }
  let spanE = maxE - minE, spanN = maxN - minN;
  if (!isFinite(spanE) || spanE === 0) spanE = 1;
  if (!isFinite(spanN) || spanN === 0) spanN = 1;
  const scale = Math.min((W - 2 * PAD) / spanE, (H - 2 * PAD) / spanN);
  const offE = (W - scale * spanE) / 2;
  const offN = (H - scale * spanN) / 2;
  return {
    sx: (e: number) => offE + (e - minE) * scale,
    // y-flip: survey north is up, SVG y is down
    sy: (n: number) => H - (offN + (n - minN) * scale),
  };
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

function svgWrap(inner: string, title?: string): string {
  const t = title ? `<text x="${W / 2}" y="20" text-anchor="middle" font-size="14" font-weight="700" fill="#1D3095">${esc(title)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;height:auto;background:#fff;border:1px solid #d8dce6;border-radius:8px;font-family:system-ui,sans-serif">`
    + `<rect x="0" y="0" width="${W}" height="${H}" fill="#fbfcff"/>` + t + inner + `</svg>`;
}

function northArrow(x = W - 30, y = 56): string {
  return `<g stroke="#1D3095" stroke-width="1.5" fill="#1D3095">`
    + `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 26}"/>`
    + `<path d="M ${x} ${y - 32} L ${x - 5} ${y - 22} L ${x + 5} ${y - 22} Z"/>`
    + `<text x="${x}" y="${y + 14}" text-anchor="middle" font-size="11" stroke="none">N</text></g>`;
}

function dot(x: number, y: number, label?: string, color = '#1D3095'): string {
  const c = `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`;
  return label ? c + `<text x="${x + 6}" y="${y - 6}" font-size="12" font-weight="600" fill="#111">${esc(label)}</text>` : c;
}

// midpoint label with a small perpendicular offset so it doesn't sit on the line
function legLabel(ax: number, ay: number, bx: number, by: number, text: string): string {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  let dx = by - ay, dy = ax - bx; // perpendicular
  const len = Math.hypot(dx, dy) || 1;
  dx = (dx / len) * 14; dy = (dy / len) * 14;
  return `<text x="${mx + dx}" y="${my + dy}" text-anchor="middle" font-size="11" fill="#334">`
    + `<tspan>${esc(text)}</tspan></text>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Renderers (take concrete numbers)
// ────────────────────────────────────────────────────────────────────────────
const LETTERS = 'ABCDEFGHIJKLMNOP';

export function renderTraverse(legs: { az: number; dist: number; label?: string }[], opts: {
  startN?: number; startE?: number; closed?: boolean; inverseFrom?: number; inverseTo?: number; title?: string;
} = {}): string {
  const pts: Point2D[] = [{ x: opts.startE ?? 0, y: opts.startN ?? 0 }];
  for (const leg of legs) pts.push(forwardPoint(pts[pts.length - 1], leg.az, leg.dist));
  const xf = fitTransform(pts);
  const S = pts.map(p => ({ x: xf.sx(p.x), y: xf.sy(p.y) }));
  let g = '';
  // legs
  for (let i = 0; i < legs.length; i++) {
    const a = S[i], b = S[i + 1];
    g += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#1D3095" stroke-width="2"/>`;
    const lbl = `${formatBearing(legs[i].az)}  ${f2(legs[i].dist)}'`;
    g += legLabel(a.x, a.y, b.x, b.y, lbl);
  }
  if (opts.closed) {
    const a = S[S.length - 1], b = S[0];
    g += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#1D3095" stroke-width="2" stroke-dasharray="2 3"/>`;
  }
  // highlighted inverse line between two vertices
  if (opts.inverseFrom != null && opts.inverseTo != null && S[opts.inverseFrom] && S[opts.inverseTo]) {
    const a = S[opts.inverseFrom], b = S[opts.inverseTo];
    g += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#C0392B" stroke-width="1.6" stroke-dasharray="6 4"/>`;
    g += `<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 4}" text-anchor="middle" font-size="11" fill="#C0392B" font-weight="700">inverse = ?</text>`;
  }
  // vertices
  for (let i = 0; i < S.length; i++) {
    const isLast = opts.closed && i === S.length - 1;
    if (isLast) continue;
    g += dot(S[i].x, S[i].y, LETTERS[i] || `P${i}`);
  }
  return svgWrap(g + northArrow(), opts.title || 'Traverse');
}

export function renderInverse(a: { n: number; e: number; label?: string }, b: { n: number; e: number; label?: string }, opts: { title?: string } = {}): string {
  const pts: Point2D[] = [{ x: a.e, y: a.n }, { x: b.e, y: b.n }];
  const xf = fitTransform(pts);
  const A = { x: xf.sx(a.e), y: xf.sy(a.n) }, B = { x: xf.sx(b.e), y: xf.sy(b.n) };
  const dE = b.e - a.e, dN = b.n - a.n;
  let azimuth = Math.atan2(dE, dN) * 180 / Math.PI; if (azimuth < 0) azimuth += 360;
  let g = `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#1D3095" stroke-width="2"/>`;
  g += legLabel(A.x, A.y, B.x, B.y, `Az ${formatAzimuth(azimuth)}  •  dist = ?`);
  g += dot(A.x, A.y, `${a.label || 'A'} (N ${f2(a.n)}, E ${f2(a.e)})`);
  g += dot(B.x, B.y, `${b.label || 'B'} (N ${f2(b.n)}, E ${f2(b.e)})`);
  return svgWrap(g + northArrow(), opts.title || 'Inverse between two points');
}

function renderTriangle(verts: { n: number; e: number; label?: string }[], title?: string): string {
  if (verts.length < 3) return svgWrap('', title);
  const pts: Point2D[] = verts.map(v => ({ x: v.e, y: v.n }));
  const xf = fitTransform(pts);
  const S = pts.map(p => ({ x: xf.sx(p.x), y: xf.sy(p.y) }));
  let g = `<polygon points="${S.map(p => `${p.x},${p.y}`).join(' ')}" fill="#1D309511" stroke="#1D3095" stroke-width="2"/>`;
  for (let i = 0; i < S.length; i++) {
    const a = S[i], b = S[(i + 1) % S.length];
    const d = Math.hypot(verts[(i + 1) % S.length].e - verts[i].e, verts[(i + 1) % S.length].n - verts[i].n);
    g += legLabel(a.x, a.y, b.x, b.y, `${f2(d)}'`);
    g += dot(a.x, a.y, verts[i].label || LETTERS[i]);
  }
  return svgWrap(g + northArrow(), title || 'Triangle');
}

function renderCurve(R: number, I: number, title?: string): string {
  // Build PC, PI, PT geometry around a circle; central angle I (deg)
  const cx = W / 2, cy = H / 2 + 40, r = Math.min(W, H) * 0.30;
  const half = (I * Math.PI / 180) / 2;
  const a0 = -Math.PI / 2 - half, a1 = -Math.PI / 2 + half; // symmetric about top
  const pc = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) };
  const pt = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) };
  // tangents meet at PI
  const T = r * Math.tan(half);
  // tangent direction at PC is perpendicular to radius
  const ti = { x: cx, y: cy - r / Math.cos(half) }; // PI on the symmetry axis
  let g = `<path d="M ${pc.x} ${pc.y} A ${r} ${r} 0 0 1 ${pt.x} ${pt.y}" fill="none" stroke="#1D3095" stroke-width="2.5"/>`;
  g += `<line x1="${pc.x}" y1="${pc.y}" x2="${ti.x}" y2="${ti.y}" stroke="#888" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  g += `<line x1="${pt.x}" y1="${pt.y}" x2="${ti.x}" y2="${ti.y}" stroke="#888" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  g += `<line x1="${cx}" y1="${cy}" x2="${pc.x}" y2="${pc.y}" stroke="#bbb" stroke-width="1"/>`;
  g += `<line x1="${cx}" y1="${cy}" x2="${pt.x}" y2="${pt.y}" stroke="#bbb" stroke-width="1"/>`;
  g += dot(pc.x, pc.y, 'PC') + dot(pt.x, pt.y, 'PT') + dot(ti.x, ti.y, 'PI') + dot(cx, cy, 'O', '#999');
  g += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="#333">R = ${f2(R)}'</text>`;
  g += `<text x="${ti.x}" y="${ti.y - 8}" text-anchor="middle" font-size="11" fill="#333">I = ${formatAzimuth(I)}</text>`;
  return svgWrap(g, title || 'Horizontal Curve');
}

function renderLeveling(bs: number, fs: number, title?: string): string {
  const groundY = H - 70, instrX = W / 2;
  let g = `<line x1="30" y1="${groundY}" x2="${W - 30}" y2="${groundY}" stroke="#7a5230" stroke-width="2"/>`;
  // instrument
  g += `<line x1="${instrX}" y1="${groundY}" x2="${instrX}" y2="${groundY - 70}" stroke="#333" stroke-width="2"/>`;
  g += `<rect x="${instrX - 14}" y="${groundY - 84}" width="28" height="14" rx="2" fill="#333"/>`;
  g += `<line x1="${instrX - 80}" y1="${groundY - 77}" x2="${instrX + 80}" y2="${groundY - 77}" stroke="#1D3095" stroke-width="1" stroke-dasharray="4 3"/>`;
  g += `<text x="${instrX}" y="${groundY - 92}" text-anchor="middle" font-size="11" fill="#333">Level (HI)</text>`;
  // BS rod (left), FS rod (right)
  const rodTop = groundY - 120;
  g += `<line x1="90" y1="${groundY}" x2="90" y2="${rodTop}" stroke="#0a7" stroke-width="3"/>`;
  g += `<text x="90" y="${rodTop - 6}" text-anchor="middle" font-size="11" fill="#0a7" font-weight="700">BS ${f2(bs)}'</text>`;
  g += `<text x="90" y="${groundY + 16}" text-anchor="middle" font-size="11" fill="#333">BM</text>`;
  g += `<line x1="${W - 90}" y1="${groundY}" x2="${W - 90}" y2="${rodTop}" stroke="#c0392b" stroke-width="3"/>`;
  g += `<text x="${W - 90}" y="${rodTop - 6}" text-anchor="middle" font-size="11" fill="#c0392b" font-weight="700">FS ${f2(fs)}'</text>`;
  g += `<text x="${W - 90}" y="${groundY + 16}" text-anchor="middle" font-size="11" fill="#333">TP</text>`;
  return svgWrap(g, title || 'Differential Leveling');
}

function renderCompass(az: number, title?: string): string {
  const cx = W / 2, cy = H / 2 + 10, r = 110;
  let g = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#aab" stroke-width="1.5"/>`;
  for (const [ang, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']] as [number, string][]) {
    const a = (ang - 90) * Math.PI / 180;
    g += `<text x="${cx + (r + 14) * Math.cos(a)}" y="${cy + (r + 14) * Math.sin(a) + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#556">${lab}</text>`;
  }
  const a = (az - 90) * Math.PI / 180;
  const ex = cx + r * Math.cos(a), ey = cy + r * Math.sin(a);
  g += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="#C0392B" stroke-width="2.5"/>`;
  g += `<path d="M ${ex} ${ey} L ${ex - 9 * Math.cos(a - 0.4)} ${ey - 9 * Math.sin(a - 0.4)} L ${ex - 9 * Math.cos(a + 0.4)} ${ey - 9 * Math.sin(a + 0.4)} Z" fill="#C0392B"/>`;
  g += dot(cx, cy, '', '#333');
  g += `<text x="${cx}" y="${cy + r + 34}" text-anchor="middle" font-size="12" fill="#333">Azimuth ${formatAzimuth(az)}  =  ${formatBearing(az)}</text>`;
  return svgWrap(g, title || 'Direction');
}

// ────────────────────────────────────────────────────────────────────────────
// Spec → SVG (resolves var names against generated vars)
// ────────────────────────────────────────────────────────────────────────────
function num(v: unknown): number { const n = typeof v === 'number' ? v : parseFloat(String(v)); return isFinite(n) ? n : NaN; }

export function buildDiagramFromSpec(spec: DiagramSpec | undefined | null, vars: Record<string, number | string>): string | null {
  if (!spec || !spec.type) return null;
  try {
    const rv = (vn?: string, lit?: number): number | undefined => {
      if (vn != null && vars[vn] != null) return num(vars[vn]);
      if (lit != null) return lit;
      return undefined;
    };
    switch (spec.type) {
      case 'traverse': {
        const legs = (spec.legs || []).map(l => ({ az: num(rv(l.azVar, l.az)), dist: num(rv(l.distVar, l.dist)), label: l.label }))
          .filter(l => isFinite(l.az) && isFinite(l.dist) && l.dist > 0);
        if (legs.length < 1) return null;
        return renderTraverse(legs, {
          startN: rv(spec.startNVar) ?? 0, startE: rv(spec.startEVar) ?? 0,
          closed: spec.closed, inverseFrom: spec.inverseFrom, inverseTo: spec.inverseTo, title: spec.title,
        });
      }
      case 'inverse': {
        const an = rv(spec.aNVar), ae = rv(spec.aEVar), bn = rv(spec.bNVar), be = rv(spec.bEVar);
        if ([an, ae, bn, be].some(v => v == null || !isFinite(v as number))) return null;
        return renderInverse({ n: an as number, e: ae as number, label: spec.aLabel }, { n: bn as number, e: be as number, label: spec.bLabel }, { title: spec.title });
      }
      case 'triangle': {
        const verts = (spec.vertices || []).map(v => ({ n: num(rv(v.nVar, v.n)), e: num(rv(v.eVar, v.e)), label: v.label }))
          .filter(v => isFinite(v.n) && isFinite(v.e));
        if (verts.length < 3) return null;
        return renderTriangle(verts, spec.title);
      }
      case 'curve': {
        const R = rv(spec.rVar), I = rv(spec.iVar);
        if (R == null || I == null || !isFinite(R) || !isFinite(I) || R <= 0) return null;
        return renderCurve(R, I, spec.title);
      }
      case 'leveling': {
        const bs = rv(spec.bsVar), fs = rv(spec.fsVar);
        if (bs == null || fs == null) return null;
        return renderLeveling(bs, fs, spec.title);
      }
      case 'compass': {
        const az = rv(spec.azVar);
        if (az == null || !isFinite(az)) return null;
        return renderCompass(az, spec.title);
      }
      default:
        return null;
    }
  } catch {
    return null; // never break a quiz over a diagram
  }
}
