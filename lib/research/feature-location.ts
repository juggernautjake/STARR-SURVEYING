// lib/research/feature-location.ts — where a feature actually is, vs where we drew it (plan R19).
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `geometry.engine.ts` places easements like this, and says so in its own comment:
//
//     "Since easements rarely have explicit traversal coordinates, we render them
//      as labeled horizontal lines spaced below the centroid, inside the property."
//
// So a 20-foot utility easement that runs along the north line of the tract is drawn as a horizontal
// line through the middle of it, at a spacing chosen for legibility. The element carries a
// `confidence_score` taken from the extraction — which is confidence in the TEXT, not in the
// position — and nothing anywhere marks the position as invented.
//
// This is the same class of failure as reading dimensions off a superseded plat (R15): not a stale
// answer, a wrong location on a drawing a surveyor takes to the field.
//
// Monuments have a quieter version of it. They are placed at `points[mon.sequence_order]`, treating
// an extraction ordinal as a traverse-vertex index, and when that index does not exist the monument
// is silently dropped — it does not appear on the drawing and it does not appear anywhere else
// either. A called-for monument that vanishes is a monument nobody goes looking for.
//
// ── WHAT THIS MODULE ADDS ───────────────────────────────────────────────────────────────────────
//
// A basis for every placement, so "we computed this position" and "we put it somewhere so the label
// would fit" stop being the same thing on the page. And a real position where the deed states one:
// "along the North line" is locatable against a computed boundary, and is by far the commonest form.

export type LocationBasis =
  /** Computed from the boundary traverse — a real position. */
  | 'traverse_vertex'
  /** Derived from the call text against the computed boundary (e.g. "along the North line"). */
  | 'derived_from_call'
  /** Placed for legibility. NOT where the feature is. Must be drawn and labelled as diagrammatic. */
  | 'schematic'
  /** The feature is known to exist and we cannot place it at all. Belongs on a list, not on a map. */
  | 'unlocated';

export interface Placement {
  basis: LocationBasis;
  /** True only for bases that represent a real position. The renderer and the packet both key off
   *  this rather than re-deriving the rule in two places. */
  isReal: boolean;
  /** One sentence, shown on the element and in the drawing legend. */
  note: string;
}

export function placement(basis: LocationBasis, detail?: string): Placement {
  switch (basis) {
    case 'traverse_vertex':
      return { basis, isReal: true, note: detail ?? 'Position computed from the boundary traverse.' };
    case 'derived_from_call':
      return { basis, isReal: true, note: detail ?? 'Position derived from the call text against the computed boundary.' };
    case 'schematic':
      return {
        basis, isReal: false,
        note: detail ?? 'DIAGRAMMATIC ONLY — the document does not say where this is. The drawn position is for legibility and is not a location.',
      };
    case 'unlocated':
      return {
        basis, isReal: false,
        note: detail ?? 'This feature is called for but could not be placed. It is listed rather than drawn, so it is not mistaken for a located feature.',
      };
  }
}

// ── Reading a location out of the call ──────────────────────────────────────────────────────────

export type Side = 'north' | 'south' | 'east' | 'west';

export interface EasementCall {
  /** Which boundary of the tract it runs along, when the text says. */
  side: Side | null;
  /** Width in feet, when stated. */
  widthFt: number | null;
  /** True when the width is stated as a total either side of a centreline, which halves the offset
   *  from the line — getting this backwards doubles the encumbered strip. */
  centred: boolean;
  /** The purpose, for the label. */
  purpose: string | null;
  raw: string;
}

const SIDE_WORDS: Array<[RegExp, Side]> = [
  [/\b(?:north(?:erly)?|northern)\b/i, 'north'],
  [/\b(?:south(?:erly)?|southern)\b/i, 'south'],
  [/\b(?:east(?:erly)?|eastern)\b/i, 'east'],
  [/\b(?:west(?:erly)?|western)\b/i, 'west'],
];

/** Parse an easement description for anything that pins it to a boundary.
 *
 *  Only the forms that actually appear in Texas instruments are matched. A speculative parser that
 *  guesses at a position is worse than one that returns null, because a null becomes `schematic`
 *  and is labelled as diagrammatic, while a wrong guess becomes `derived_from_call` and is believed. */
export function parseEasementCall(text: string | null | undefined): EasementCall {
  const raw = (text ?? '').trim();
  const empty: EasementCall = { side: null, widthFt: null, centred: false, purpose: null, raw };
  if (!raw) return empty;

  // The side word must be attached to a LINE or a boundary — "the North line", "along the westerly
  // boundary". A bare compass word is a bearing in a metes-and-bounds recital, not a location.
  let side: Side | null = null;
  const nearLine = raw.match(
    /\b(north(?:erly)?|northern|south(?:erly)?|southern|east(?:erly)?|eastern|west(?:erly)?|western)\s+(?:\w+\s+){0,2}(?:line|boundary|property\s+line|side|margin)\b/i,
  );
  if (nearLine) {
    for (const [re, s] of SIDE_WORDS) if (re.test(nearLine[1]!)) { side = s; break; }
  }

  // Width: "20 foot", "20-ft", "a width of 20 feet", "20'".
  const widthMatch =
    raw.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:-|\s)?\s*(?:foot|feet|ft\.?|')\s*(?:wide|width|easement|strip)?/i) ??
    raw.match(/\bwidth\s+of\s+(\d{1,3}(?:\.\d+)?)\s*(?:foot|feet|ft\.?|')?/i);
  const widthFt = widthMatch ? Number(widthMatch[1]) : null;

  const centred = /\b(?:each\s+side|either\s+side|both\s+sides)\s+of\s+the\s+cent(?:er|re)line\b/i.test(raw)
    || /\bcent(?:er|re)ed\s+(?:on|upon)\b/i.test(raw);

  const purpose =
    raw.match(/\b(utility|electric|electrical|drainage|access|ingress|egress|pipeline|gas|water|sewer|telephone|communication|slope|sidewalk)\b/i)?.[1]?.toLowerCase()
    ?? null;

  return { side, widthFt: Number.isFinite(widthFt) ? widthFt : null, centred, purpose, raw };
}

// ── Placing it against the computed boundary ────────────────────────────────────────────────────

export interface Point { x: number; y: number }

export interface Segment { start: Point; end: Point }

/** The boundary segment that IS the named side of the tract.
 *
 *  Picks the segment whose midpoint is furthest in that compass direction, weighted to prefer
 *  segments that actually run across that direction — a north boundary runs east-west. Returns null
 *  rather than a best-effort pick when the boundary is too small to have distinct sides, because a
 *  wrong side is a wrong easement. */
export function sideSegment(points: Point[], side: Side): Segment | null {
  if (points.length < 3) return null;

  const segs: Segment[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (a.x === b.x && a.y === b.y) continue;
    segs.push({ start: a, end: b });
  }
  if (segs.length < 3) return null;

  // Survey space: +y is north, +x is east.
  const score = (s: Segment): number => {
    const mid = { x: (s.start.x + s.end.x) / 2, y: (s.start.y + s.end.y) / 2 };
    const dx = Math.abs(s.end.x - s.start.x);
    const dy = Math.abs(s.end.y - s.start.y);
    // A north or south boundary should run east-west, so its run in x should dominate.
    const orientation = side === 'north' || side === 'south' ? dx - dy : dy - dx;
    const extreme =
      side === 'north' ? mid.y : side === 'south' ? -mid.y : side === 'east' ? mid.x : -mid.x;
    return extreme + orientation * 0.25;
  };

  let best = segs[0]!;
  let bestScore = score(best);
  for (const s of segs.slice(1)) {
    const sc = score(s);
    if (sc > bestScore) { best = s; bestScore = sc; }
  }
  // A segment that does not run in the expected direction at all is not that side of the tract.
  const dx = Math.abs(best.end.x - best.start.x);
  const dy = Math.abs(best.end.y - best.start.y);
  const runsRight = side === 'north' || side === 'south' ? dx >= dy * 0.5 : dy >= dx * 0.5;
  return runsRight ? best : null;
}

export interface LocatedEasement {
  segment: Segment | null;
  placement: Placement;
  widthFt: number | null;
  label: string;
}

/** Place an easement against a computed boundary, or admit that we cannot.
 *
 *  `offsetInto` moves the drawn strip inside the tract so it does not sit exactly on the boundary
 *  line and disappear beneath it. It is a drawing offset, not a survey one, and it is small relative
 *  to the stated width so the strip still reads as being on that line. */
export function locateEasement(
  call: EasementCall,
  boundary: Point[],
  opts: { offsetInto?: number } = {},
): LocatedEasement {
  const label = [
    call.purpose ? `${call.purpose} easement` : 'easement',
    call.widthFt ? `${call.widthFt}'${call.centred ? ' (centred)' : ''}` : null,
  ].filter(Boolean).join(' ');

  if (!call.side) {
    return {
      segment: null, widthFt: call.widthFt, label,
      placement: placement('schematic',
        'DIAGRAMMATIC ONLY — the instrument does not say which boundary this easement runs along. ' +
        'Read the instrument before relying on any drawn position.'),
    };
  }

  const seg = sideSegment(boundary, call.side);
  if (!seg) {
    return {
      segment: null, widthFt: call.widthFt, label,
      placement: placement('unlocated',
        `The instrument places this easement along the ${call.side} line, but no ${call.side} boundary ` +
        'could be identified in the computed traverse. Listed rather than drawn.'),
    };
  }

  const offset = opts.offsetInto ?? Math.max(2, (call.widthFt ?? 10) / 2);
  const inward = inwardNormal(seg, boundary);
  const shifted: Segment = {
    start: { x: seg.start.x + inward.x * offset, y: seg.start.y + inward.y * offset },
    end: { x: seg.end.x + inward.x * offset, y: seg.end.y + inward.y * offset },
  };

  return {
    segment: shifted, widthFt: call.widthFt, label,
    placement: placement('derived_from_call',
      `Placed along the ${call.side} boundary as the instrument recites` +
      (call.widthFt ? `, ${call.widthFt} feet wide${call.centred ? ', centred on its centreline' : ''}.` : '.') +
      ' The width and side are from the text; the exact run was not surveyed.'),
  };
}

/** Unit normal of a segment pointing into the polygon. */
function inwardNormal(seg: Segment, poly: Point[]): Point {
  const dx = seg.end.x - seg.start.x;
  const dy = seg.end.y - seg.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const n = { x: -dy / len, y: dx / len };

  const mid = { x: (seg.start.x + seg.end.x) / 2, y: (seg.start.y + seg.end.y) / 2 };
  const centroid = poly.reduce(
    (acc, p) => ({ x: acc.x + p.x / poly.length, y: acc.y + p.y / poly.length }),
    { x: 0, y: 0 },
  );
  const toCentre = { x: centroid.x - mid.x, y: centroid.y - mid.y };
  return n.x * toCentre.x + n.y * toCentre.y >= 0 ? n : { x: -n.x, y: -n.y };
}

// ── Monuments ───────────────────────────────────────────────────────────────────────────────────

export interface MonumentPlacement {
  position: Point | null;
  placement: Placement;
}

/** Place a called-for monument at a traverse vertex, or keep it as an unlocated call.
 *
 *  The old code used `sequence_order` directly as a vertex index and dropped the monument when the
 *  index did not exist. A called-for monument that vanishes is a monument nobody goes looking for —
 *  and finding called-for monuments is most of what the field crew is being sent to do. */
export function locateMonument(
  sequenceOrder: number | null | undefined,
  vertices: Point[],
  description?: string | null,
): MonumentPlacement {
  const what = description?.trim() || 'monument';
  if (sequenceOrder == null || !Number.isInteger(sequenceOrder) || sequenceOrder < 0 || sequenceOrder >= vertices.length) {
    return {
      position: null,
      placement: placement('unlocated',
        `"${what}" is called for but could not be tied to a computed corner. ` +
        'Search for it from the adjoining calls — it is not drawn, so it will not be found by looking at the plat.'),
    };
  }
  return { position: vertices[sequenceOrder]!, placement: placement('traverse_vertex') };
}

// ── The list a reviewer reads ───────────────────────────────────────────────────────────────────

export interface FeatureLocationSummary {
  located: number;
  schematic: number;
  unlocated: number;
  headline: string;
}

/** Leads with what is NOT located, for the same reason R17's evidence headline does: a drawing that
 *  shows twelve features reads as twelve findings, when four of them may be at positions nobody
 *  established. */
export function summariseLocations(placements: Placement[]): FeatureLocationSummary {
  const located = placements.filter((p) => p.isReal).length;
  const schematic = placements.filter((p) => p.basis === 'schematic').length;
  const unlocated = placements.filter((p) => p.basis === 'unlocated').length;

  const headline = placements.length === 0
    ? 'No features have been placed.'
    : schematic + unlocated === 0
      ? `${located} feature(s), every one at a computed or recited position.`
      : `${located} feature(s) located; ${schematic} drawn diagrammatically (position not stated in any document)` +
        `${unlocated ? ` and ${unlocated} that could not be placed at all` : ''}. Do not scale off the diagrammatic ones.`;

  return { located, schematic, unlocated, headline };
}
