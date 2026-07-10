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
  type: 'traverse' | 'inverse' | 'triangle' | 'curve' | 'leveling' | 'compass' | 'towerTwoAngles';
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
  // towerTwoAngles: baseline distance + two elevation angles (deg)
  dVar?: string; alphaVar?: string; betaVar?: string;
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
  // Build PC, PI, PT geometry around a circle; central angle I (deg).
  // Labels the full element set: T (tangent), LC (long chord), E (external),
  // M (middle ordinate), R, I, and the tangent–chord (deflection) angle = I/2.
  const cx = W / 2, cy = H / 2 + 54, r = Math.min(W, H) * 0.28;
  const half = (I * Math.PI / 180) / 2;
  const a0 = -Math.PI / 2 - half, a1 = -Math.PI / 2 + half; // symmetric about top
  const pc = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) };
  const pt = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) };
  const pi = { x: cx, y: cy - r / Math.cos(half) };  // PI on the symmetry axis
  const apex = { x: cx, y: cy - r };                 // midpoint of the arc
  const chordMid = { x: cx, y: (pc.y + pt.y) / 2 };  // midpoint of long chord
  // true element lengths (for labels)
  const T = R * Math.tan(half);
  const LC = 2 * R * Math.sin(half);
  const E = R / Math.cos(half) - R;
  const M = R * (1 - Math.cos(half));
  let g = `<path d="M ${pc.x} ${pc.y} A ${r} ${r} 0 0 1 ${pt.x} ${pt.y}" fill="none" stroke="#1D3095" stroke-width="2.5"/>`;
  // tangents PC→PI and PT→PI
  g += `<line x1="${pc.x}" y1="${pc.y}" x2="${pi.x}" y2="${pi.y}" stroke="#888" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  g += `<line x1="${pt.x}" y1="${pt.y}" x2="${pi.x}" y2="${pi.y}" stroke="#888" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  // long chord PC→PT
  g += `<line x1="${pc.x}" y1="${pc.y}" x2="${pt.x}" y2="${pt.y}" stroke="#0a7a5a" stroke-width="1.6"/>`;
  // radii to PC/PT + E and M along the symmetry axis
  g += `<line x1="${cx}" y1="${cy}" x2="${pc.x}" y2="${pc.y}" stroke="#bbb" stroke-width="1"/>`;
  g += `<line x1="${cx}" y1="${cy}" x2="${pt.x}" y2="${pt.y}" stroke="#bbb" stroke-width="1"/>`;
  g += `<line x1="${pi.x}" y1="${pi.y}" x2="${chordMid.x}" y2="${chordMid.y}" stroke="#c0392b" stroke-width="1" stroke-dasharray="3 3"/>`;
  g += dot(pc.x, pc.y, 'PC') + dot(pt.x, pt.y, 'PT') + dot(pi.x, pi.y, 'PI') + dot(cx, cy, 'O', '#999');
  // element labels
  g += legLabel(pc.x, pc.y, pi.x, pi.y, `T = ${f2(T)}'`);
  g += `<text x="${cx}" y="${(pc.y + pt.y) / 2 + 16}" text-anchor="middle" font-size="11" fill="#0a7a5a">LC = ${f2(LC)}'</text>`;
  g += `<text x="${cx + 8}" y="${(pi.y + apex.y) / 2 + 3}" font-size="10" fill="#c0392b">E = ${f2(E)}'</text>`;
  g += `<text x="${cx + 8}" y="${(apex.y + chordMid.y) / 2 + 3}" font-size="10" fill="#c0392b">M = ${f2(M)}'</text>`;
  g += `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="11" fill="#333">R = ${f2(R)}'</text>`;
  g += `<text x="${pi.x}" y="${pi.y - 8}" text-anchor="middle" font-size="11" fill="#333">I = ${formatAzimuth(I)}</text>`;
  // tangent–chord (deflection) angle at PC = I/2
  g += `<text x="${pc.x - 4}" y="${pc.y + 18}" text-anchor="end" font-size="10" fill="#1D3095" font-weight="700">∠(T,LC) = I/2</text>`;
  return svgWrap(g, title || 'Horizontal Curve');
}

// Height of an inaccessible point from two angle stations on a level baseline
// `d` apart. α is the (smaller) elevation angle at the far station, β the
// (larger) angle at the near station. h = d / (cot α − cot β).
export function renderTowerTwoAngles(d: number, alphaDeg: number, betaDeg: number, title?: string): string {
  const a = alphaDeg * Math.PI / 180, b = betaDeg * Math.PI / 180;
  const cotA = 1 / Math.tan(a), cotB = 1 / Math.tan(b);
  const denom = cotA - cotB;
  if (!(denom > 0) || !(alphaDeg > 0) || !(betaDeg > alphaDeg) || betaDeg >= 90) return svgWrap('', title || 'Height from two angles');
  const h = d / denom;                 // height of the top above the baseline
  const x2 = h * cotB;                 // near station → base
  const x1 = h * cotA;                 // far station → base  (x1 = x2 + d)
  // world points: base at origin, top above it, stations to the left
  const base = { x: 0, y: 0 }, top = { x: 0, y: h }, s2 = { x: -x2, y: 0 }, s1 = { x: -x1, y: 0 };
  const xf = fitTransform([top, s1, base]);
  const P = (p: { x: number; y: number }) => ({ x: xf.sx(p.x), y: xf.sy(p.y) });
  const B = P(base), Tp = P(top), S2 = P(s2), S1 = P(s1);
  let g = '';
  // ground line
  g += `<line x1="${S1.x - 14}" y1="${B.y}" x2="${B.x + 24}" y2="${B.y}" stroke="#7a5230" stroke-width="2"/>`;
  // tower
  g += `<line x1="${B.x}" y1="${B.y}" x2="${Tp.x}" y2="${Tp.y}" stroke="#1D3095" stroke-width="3"/>`;
  // rays
  g += `<line x1="${S1.x}" y1="${S1.y}" x2="${Tp.x}" y2="${Tp.y}" stroke="#888" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  g += `<line x1="${S2.x}" y1="${S2.y}" x2="${Tp.x}" y2="${Tp.y}" stroke="#888" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  // stations + labels
  g += dot(S1.x, S1.y, '1') + dot(S2.x, S2.y, '2') + dot(Tp.x, Tp.y, '');
  g += `<text x="${S1.x + 4}" y="${S1.y + 16}" font-size="11" fill="#1D3095">A = ${formatAzimuth(alphaDeg)}</text>`;
  g += `<text x="${S2.x + 4}" y="${S2.y - 8}" font-size="11" fill="#1D3095">B = ${formatAzimuth(betaDeg)}</text>`;
  g += `<text x="${(S1.x + S2.x) / 2}" y="${B.y + 30}" text-anchor="middle" font-size="11" fill="#333">${f2(d)}'</text>`;
  g += `<text x="${Tp.x + 8}" y="${(B.y + Tp.y) / 2}" font-size="12" fill="#c0392b" font-weight="700">h = ?</text>`;
  g += `<text x="${W / 2}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#888">NOT TO SCALE</text>`;
  return svgWrap(g, title || 'Height from two angles');
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
      case 'towerTwoAngles': {
        const d = rv(spec.dVar), alpha = rv(spec.alphaVar), beta = rv(spec.betaVar);
        if ([d, alpha, beta].some(v => v == null || !isFinite(v as number)) || (d as number) <= 0) return null;
        return renderTowerTwoAngles(d as number, alpha as number, beta as number, spec.title);
      }
      default:
        return null;
    }
  } catch {
    return null; // never break a quiz over a diagram
  }
}
