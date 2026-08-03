// worker/src/services/survey-drawing.ts — drawing the boundary from the calls we just read.
//
// The owner's ask: *"get to a place where the AI could programmatically recreate the boundary survey
// drawing and clearly show the bearings/azimuths and distances, and convert varas to US survey ft for
// older surveys."*
//
// ── WHY THIS IS NOT `reports/svg-renderer.ts` ───────────────────────────────────────────────────
//
// That renderer draws `model.reconciledPerimeter` — the output of Phase 7, after every source has
// been cross-validated and reconciled. It is the final report's drawing.
//
// This one draws a SINGLE DOCUMENT'S calls, at the moment the document is read, before anything has
// been reconciled with anything. That is a genuinely different job: it is how a person looks at what
// one deed actually says, and it has to be able to draw a boundary that does NOT close, because a
// single deed frequently does not.
//
// ── A DRAWING THAT CLOSES A GAP IT DOES NOT HAVE IS A LIE ───────────────────────────────────────
//
// The tempting implementation joins the last point back to the first and fills the polygon. Every
// drawing then looks like a closed, surveyed parcel — including the ones built from calls we could
// not read, and the ones whose closure is fifty feet.
//
// So: unplaced calls break the outline visibly, the closure line is drawn dashed and in its own
// colour when it is not negligible, and the figure is never filled as though it were proven.
//
// ── AND THE LABELS ARE IN THE DEED'S UNITS ──────────────────────────────────────────────────────
//
// A line recited as "1900 varas" is labelled `1900 vrs` with `(5277.78')` beneath it. Labelling it
// only in feet quietly rewrites the document — a surveyor comparing this drawing against the deed in
// their hand needs to see the deed's own number first, and the conversion second.

import { azimuthToBearing, type Leg, type TraverseResult } from './survey-geometry.js';
import { convertLength, unitLabel, type LengthUnit } from './survey-units.js';
import { parseMonument, type Monument } from './monuments.js';

export interface DrawingOptions {
  widthPx?: number;
  heightPx?: number;
  marginPx?: number;
  title?: string;
  /** Draw azimuths instead of quadrant bearings. */
  useAzimuths?: boolean;
}

export interface LabelledLeg {
  leg: Leg;
  /** As the deed says it. */
  bearingLabel: string;
  distanceLabel: string;
  /** The conversion, when the deed's unit is not feet. Null when they are the same. */
  convertedLabel: string | null;
  monument: Monument | null;
}

/** Label a leg the way the document does, with the conversion as a secondary line. */
export function labelLeg(leg: Leg, useAzimuths = false): LabelledLeg {
  const bearingLabel = useAzimuths
    ? `${leg.bearing.azimuthDeg.toFixed(4)}°`
    : (leg.bearing.quadrant ? leg.bearing.raw.trim() : azimuthToBearing(leg.bearing.azimuthDeg));

  // `leg.distance` is always internal feet; recover the deed's own number for the primary label.
  const inDeedUnit = leg.unit === 'us_survey_feet'
    ? leg.distance
    : convertLength(leg.distance, 'us_survey_feet', leg.unit).value;

  const distanceLabel = leg.unit === 'us_survey_feet'
    ? `${leg.distance.toFixed(2)}'`
    : `${round(inDeedUnit, 2)} ${shortUnit(leg.unit)}`;

  const convertedLabel = leg.unit === 'us_survey_feet' ? null : `(${leg.distance.toFixed(2)}')`;

  return { leg, bearingLabel, distanceLabel, convertedLabel, monument: parseMonument(leg.toPoint) };
}

const SHORT: Partial<Record<LengthUnit, string>> = {
  varas: 'vrs', chains: 'ch', rods: 'rds', links: 'lks', meters: 'm',
  international_feet: 'ift', us_survey_feet: "'",
};
function shortUnit(u: LengthUnit): string { return SHORT[u] ?? unitLabel(u); }

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Monument glyph: found monuments are filled, set are hollow.
 *
 *  The convention matches what a plat legend does, and it carries the distinction that matters — a
 *  reader can see at a glance which corners are existing evidence and which are somebody's opinion. */
function monumentGlyph(m: Monument | null, x: number, y: number): string {
  if (!m) return `<circle cx="${x}" cy="${y}" r="2" class="pt" />`;
  switch (m.status) {
    case 'found':
      return `<circle cx="${x}" cy="${y}" r="4" class="mon-found" />`;
    case 'set':
      return `<circle cx="${x}" cy="${y}" r="4" class="mon-set" />`;
    case 'not_found':
      // An X: searched for, not there. Visually distinct from both, because it is neither.
      return `<path d="M${x - 4},${y - 4} L${x + 4},${y + 4} M${x + 4},${y - 4} L${x - 4},${y + 4}" class="mon-missing" />`;
    default:
      return `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" class="mon-unknown" />`;
  }
}

export interface DrawingResult {
  svg: string;
  /** What the drawing does and does not show. Printed beside it, never left implicit. */
  caveats: string[];
  labelled: LabelledLeg[];
}

/** Draw the boundary described by a traverse. */
export function drawBoundary(t: TraverseResult, opts: DrawingOptions = {}): DrawingResult {
  const W = opts.widthPx ?? 1000;
  const H = opts.heightPx ?? 800;
  const M = opts.marginPx ?? 70;
  const labelled = t.legs.map((l) => labelLeg(l, opts.useAzimuths));
  const caveats: string[] = [];

  if (t.legs.length === 0) {
    return {
      svg: emptySvg(W, H, 'No call could be placed — there is no boundary to draw.'),
      caveats: ['No call in this description could be placed, so nothing is drawn. This is a statement about the document, not about the property.'],
      labelled,
    };
  }

  // ── Fit, WITHOUT distorting ───────────────────────────────────────────────────────────────────
  //
  // One scale for both axes. Stretching to fill the frame would change every angle in the drawing,
  // and a survey drawing whose angles are wrong is worse than no drawing — somebody will scale off it.
  const ns = t.points.map((p) => p.n);
  const es = t.points.map((p) => p.e);
  const minN = Math.min(...ns), maxN = Math.max(...ns);
  const minE = Math.min(...es), maxE = Math.max(...es);
  const spanN = Math.max(maxN - minN, 1e-6);
  const spanE = Math.max(maxE - minE, 1e-6);
  const scale = Math.min((W - 2 * M) / spanE, (H - 2 * M) / spanN);

  // Northing increases UP the page; SVG y increases down. Inverting here rather than negating
  // coordinates upstream keeps the geometry module free of any notion of a screen.
  const px = (e: number) => M + (e - minE) * scale + ((W - 2 * M) - spanE * scale) / 2;
  const py = (n: number) => H - M - (n - minN) * scale - ((H - 2 * M) - spanN * scale) / 2;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<style>
    .bnd { stroke:#1a1a1a; stroke-width:2; fill:none; }
    .closure { stroke:#cc0000; stroke-width:1.5; stroke-dasharray:6 4; fill:none; }
    .lbl { font-family:'Courier New',monospace; font-size:11px; fill:#111; }
    .lbl-conv { font-family:'Courier New',monospace; font-size:9px; fill:#666; }
    .mon-found { fill:#111; stroke:#111; }
    .mon-set { fill:#fff; stroke:#111; stroke-width:1.5; }
    .mon-missing { stroke:#cc0000; stroke-width:2; fill:none; }
    .mon-unknown { fill:#fff; stroke:#888; stroke-width:1.5; stroke-dasharray:2 2; }
    .pt { fill:#888; }
    .title { font-family:Arial,sans-serif; font-size:15px; font-weight:bold; fill:#000; }
    .note { font-family:Arial,sans-serif; font-size:10px; fill:#a00; }
    .north { stroke:#111; stroke-width:1.5; fill:#111; }
  </style>`);
  parts.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  if (opts.title) parts.push(`<text x="${M}" y="28" class="title">${escapeXml(opts.title)}</text>`);

  // ── The boundary ──────────────────────────────────────────────────────────────────────────────
  //
  // Drawn as separate segments rather than one polyline, so a break where a call could not be placed
  // is VISIBLE rather than bridged by a line nobody measured.
  for (const L of labelled) {
    const { from, to } = L.leg;
    parts.push(`<line x1="${px(from.e).toFixed(1)}" y1="${py(from.n).toFixed(1)}" x2="${px(to.e).toFixed(1)}" y2="${py(to.n).toFixed(1)}" class="bnd"/>`);

    const mx = (px(from.e) + px(to.e)) / 2;
    const my = (py(from.n) + py(to.n)) / 2;
    parts.push(`<text x="${mx.toFixed(1)}" y="${(my - 4).toFixed(1)}" class="lbl" text-anchor="middle">${escapeXml(`${L.bearingLabel}  ${L.distanceLabel}`)}</text>`);
    if (L.convertedLabel) {
      parts.push(`<text x="${mx.toFixed(1)}" y="${(my + 8).toFixed(1)}" class="lbl-conv" text-anchor="middle">${escapeXml(L.convertedLabel)}</text>`);
    }
  }

  // ── Corners ───────────────────────────────────────────────────────────────────────────────────
  t.points.forEach((p, i) => {
    const mon = i > 0 ? labelled[i - 1]?.monument ?? null : null;
    parts.push(monumentGlyph(mon, Number(px(p.e).toFixed(1)), Number(py(p.n).toFixed(1))));
  });

  // ── Closure ───────────────────────────────────────────────────────────────────────────────────
  const first = t.points[0]!;
  const last = t.points[t.points.length - 1]!;
  if (t.unusable.length === 0 && Number.isFinite(t.closureDistance) && t.closureDistance > 0.01) {
    // Dashed, red, and labelled. A closure gap silently joined with a solid line is a drawing that
    // claims the parcel closes when it does not.
    parts.push(`<line x1="${px(last.e).toFixed(1)}" y1="${py(last.n).toFixed(1)}" x2="${px(first.e).toFixed(1)}" y2="${py(first.n).toFixed(1)}" class="closure"/>`);
    parts.push(`<text x="${M}" y="${H - 30}" class="note">Closure gap ${t.closureDistance.toFixed(2)}' shown dashed — the description does not close.</text>`);
    caveats.push(`This description does not close: ${t.closureDistance.toFixed(2)} ft over a ${t.perimeter.toFixed(2)} ft perimeter (about 1 in ${t.closurePrecision ?? '?'}). The dashed line is that gap, not a boundary line.`);
  }

  if (t.unusable.length > 0) {
    parts.push(`<text x="${M}" y="${H - 14}" class="note">${escapeXml(`${t.unusable.length} call(s) could not be placed — this outline is INCOMPLETE.`)}</text>`);
    caveats.push(
      `${t.unusable.length} call(s) could not be placed, so this outline is broken where they belong. ` +
      `The segments shown are correct relative to each other only within each unbroken run.`,
    );
  }

  // North arrow. Up is north because the traverse was computed that way — stated so nobody assumes
  // the drawing is rotated to grid.
  parts.push(`<g transform="translate(${W - 45},${M})"><line x1="0" y1="34" x2="0" y2="0" class="north"/><path d="M-5,8 L0,0 L5,8 Z" class="north"/><text x="0" y="48" class="lbl" text-anchor="middle">N</text></g>`);
  parts.push(scaleBar(scale, M, H - 52));
  parts.push('</svg>');

  const units = new Set(labelled.map((l) => l.leg.unit));
  if (units.size > 1) {
    caveats.push(`This description mixes units (${[...units].map(unitLabel).join(', ')}). Each line is labelled in the unit the deed used, with feet beneath.`);
  } else if (!units.has('us_survey_feet')) {
    const u = [...units][0]!;
    caveats.push(`Distances are recited in ${unitLabel(u)}; the converted US survey feet are shown beneath each label.`);
  }
  caveats.push('North is up: this is the description as written, NOT rotated to grid. Use the rotation fit to place it on the state plane.');

  return { svg: parts.join('\n'), caveats, labelled };
}

function scaleBar(scale: number, x: number, y: number): string {
  // A round number of feet, near 150 px.
  const targets = [10, 20, 25, 50, 100, 200, 300, 500, 1000, 2000, 5000];
  const feet = targets.find((t) => t * scale > 90) ?? targets[targets.length - 1]!;
  const w = feet * scale;
  return `<g><line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="#111" stroke-width="2"/>` +
    `<line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="#111" stroke-width="2"/>` +
    `<line x1="${x + w}" y1="${y - 4}" x2="${x + w}" y2="${y + 4}" stroke="#111" stroke-width="2"/>` +
    `<text x="${x + w / 2}" y="${y - 8}" class="lbl" text-anchor="middle">${feet}'</text></g>`;
}

function emptySvg(W: number, H: number, message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    `<text x="${W / 2}" y="${H / 2}" font-family="Arial" font-size="14" fill="#a00" text-anchor="middle">${escapeXml(message)}</text></svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
}
