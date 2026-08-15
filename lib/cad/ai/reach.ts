// lib/cad/ai/reach.ts
//
// C39 — how much of the editor the AI can actually drive, as a number.
//
// D1 claim 1 is "nothing the surveyor can do by hand is unavailable to the AI", measured as tools
// reachable by AI ÷ 51. The audit's opening figure — "13 AI tools registered, so AI reaches 25% of
// the editor" — was a count of REGISTRY ENTRIES, not a coverage measurement. The two look alike and
// are different numbers: `drawPolylineThrough` covers two editor tools, `mirrorFeatures` covers
// three, and eight solvers cover almost none. Counting the registry measures how much vocabulary
// exists; this measures how much of the editor it reaches, which is the claim being made.
//
// The mapping below is the whole instrument, and it is deliberately hostile to its own number:
//
// **Emulation is not reach.** A model can compute a hexagon's six vertices and call
// `drawPolylineThrough`, and it can compute a point 47.5 ft along a line if it first asks for the
// line's geometry. Neither is counted. If it were, every gap in the list would close by argument
// rather than by code, and the measurement would become a description of what a clever model might
// manage rather than of what the product provides.
//
// **Same OUTPUT, different input device, is reach.** `DRAW_CIRCLE_EDGE` and `DRAW_CIRCLE` produce
// the identical feature; the difference is where the surveyor clicks, and the AI does not click.
// Counting those separately would penalise the product for offering two ways to draw one circle.
//
// **Exempt is a claim that needs a reason.** Four tools are exempt and each says why inline. An
// exemption without a reason is how a coverage number gets talked upward.

import type { ToolType } from '../types';
import { toolRegistry, type ToolName } from './tool-registry';

export type ReachStatus =
  /** The AI can produce this tool's result through the registry. */
  | 'REACHABLE'
  /** No AI path exists. This is the work list. */
  | 'GAP'
  /** Nothing for the AI to reach — a viewport control, or an input the model does not have. */
  | 'EXEMPT';

export interface ToolReach {
  status: ReachStatus;
  /** Registry tools that produce this tool's result. More than one means the AI composes them. */
  tools: ToolName[];
  /** Why, in the surveyor's terms. Required for EXEMPT and useful everywhere. */
  note: string;
}

/**
 * Every editor tool, and whether the AI can drive it.
 *
 * Typed as an exhaustive `Record<ToolType, …>` on purpose: adding a `ToolType` without an entry is
 * a **compile error**, so a new tool cannot quietly join the denominator. The runtime guard in the
 * tests covers the other half — a new tool added here as a `GAP` changes the pinned gap set and
 * fails, so the omission has to be a decision somebody made rather than one nobody noticed.
 */
export const TOOL_AI_REACH: Record<ToolType, ToolReach> = {
  // ── Viewport and input-device tools ───────────────────────────────────────────────────────────
  SELECT: {
    status: 'EXEMPT',
    tools: [],
    note: 'A pointer mode, not an action. The AI names features by id and scopes work with C32 pins.',
  },
  PAN: { status: 'EXEMPT', tools: [], note: 'Moves the viewport, not the drawing.' },
  DRAW_IMAGE: {
    status: 'EXEMPT',
    tools: [],
    note: 'Places a raster file from disk. The model has no file to place.',
  },
  DRAW_FREEHAND: {
    status: 'EXEMPT',
    tools: [],
    note: 'Captures a hand movement. Its OUTPUT is a POLYLINE, which drawPolylineThrough already makes; the tool exists for the gesture.',
  },

  // ── Drawing ───────────────────────────────────────────────────────────────────────────────────
  DRAW_POINT: { status: 'REACHABLE', tools: ['addPoint'], note: 'Direct.' },
  DRAW_LINE: { status: 'REACHABLE', tools: ['drawLineBetween'], note: 'Direct.' },
  DRAW_POLYLINE: { status: 'REACHABLE', tools: ['drawPolylineThrough'], note: 'Direct.' },
  DRAW_POLYGON: {
    status: 'REACHABLE',
    tools: ['drawPolylineThrough'],
    note: 'Same tool with closed: true — the same feature the editor produces.',
  },
  DRAW_RECTANGLE: { status: 'REACHABLE', tools: ['drawRectangle'], note: 'C34.' },
  DRAW_CIRCLE: { status: 'REACHABLE', tools: ['drawCircle'], note: 'C34.' },
  DRAW_CIRCLE_EDGE: {
    status: 'REACHABLE',
    tools: ['drawCircle'],
    note: 'Identical output; centre-vs-edge is where the surveyor clicks, and the AI does not click.',
  },
  DRAW_ARC: { status: 'REACHABLE', tools: ['drawArc'], note: 'C34.' },
  DRAW_TEXT: { status: 'REACHABLE', tools: ['drawText'], note: 'C34.' },
  DRAW_REGULAR_POLYGON: {
    status: 'GAP',
    tools: [],
    note: 'The AI would have to compute n vertices itself. Emulation is not reach.',
  },
  DRAW_ELLIPSE: { status: 'GAP', tools: [], note: 'No ellipse tool in the registry.' },
  DRAW_ELLIPSE_EDGE: { status: 'GAP', tools: [], note: 'No ellipse tool in the registry.' },
  DRAW_SPLINE_FIT: { status: 'GAP', tools: [], note: 'No spline tool in the registry.' },
  DRAW_SPLINE_CONTROL: { status: 'GAP', tools: [], note: 'No spline tool in the registry.' },
  DRAW_CURVED_LINE: { status: 'GAP', tools: [], note: 'No curved-line tool in the registry.' },
  CURB_RETURN: { status: 'GAP', tools: [], note: 'Needs an intersection solve against two existing lines.' },

  // ── Transform ─────────────────────────────────────────────────────────────────────────────────
  MOVE: { status: 'REACHABLE', tools: ['moveFeatures'], note: 'C35.' },
  ROTATE: { status: 'REACHABLE', tools: ['rotateFeatures'], note: 'C35.' },
  SCALE: { status: 'REACHABLE', tools: ['scaleFeatures'], note: 'C35.' },
  MIRROR: { status: 'REACHABLE', tools: ['mirrorFeatures'], note: 'C35.' },
  FLIP: {
    status: 'REACHABLE',
    tools: ['mirrorFeatures'],
    note: 'A flip is a mirror across an axis through the centroid — expressible exactly, not approximately.',
  },
  INVERT: {
    status: 'REACHABLE',
    tools: ['rotateFeatures'],
    note: 'The toolbar defines invert as a 180° rotation about a clicked centre. Same operation.',
  },
  ERASE: { status: 'REACHABLE', tools: ['deleteFeatures'], note: 'C35.' },
  COPY: {
    status: 'GAP',
    tools: [],
    note: 'moveFeatures MOVES. There is no duplicate-then-offset tool, and moving is not copying.',
  },
  ARRAY: { status: 'GAP', tools: [], note: 'No array tool in the registry.' },

  // ── Edit ──────────────────────────────────────────────────────────────────────────────────────
  SPLIT: { status: 'GAP', tools: [], note: 'No split tool in the registry.' },
  TRIM: { status: 'GAP', tools: [], note: 'No trim tool in the registry.' },
  EXTEND: { status: 'GAP', tools: [], note: 'No extend tool in the registry.' },
  JOIN: { status: 'GAP', tools: [], note: 'No join tool in the registry.' },
  FILLET: { status: 'GAP', tools: [], note: 'No fillet tool in the registry.' },
  CHAMFER: { status: 'GAP', tools: [], note: 'No chamfer tool in the registry.' },
  DIVIDE: { status: 'GAP', tools: [], note: 'Needs station placement along an existing feature.' },
  EXPLODE: { status: 'GAP', tools: [], note: 'No explode tool in the registry.' },
  REVERSE: { status: 'GAP', tools: [], note: 'No vertex-order tool in the registry.' },
  MATCH_PROPERTIES: { status: 'GAP', tools: [], note: 'No style-copy tool in the registry.' },
  SMOOTH_POLYLINE: { status: 'GAP', tools: [], note: 'No polyline-smoothing tool in the registry.' },
  SIMPLIFY_POLYLINE: { status: 'GAP', tools: [], note: 'No polyline-simplify tool in the registry.' },
  INSERT_VERTEX: { status: 'GAP', tools: [], note: 'No vertex-editing tool in the registry.' },
  REMOVE_VERTEX: { status: 'GAP', tools: [], note: 'No vertex-editing tool in the registry.' },
  OFFSET: { status: 'GAP', tools: [], note: 'calcPointParallelToLine offsets a POINT, not a feature.' },
  POINT_AT_DISTANCE: {
    status: 'GAP',
    tools: [],
    note: 'Needs a distance measured ALONG an existing feature, which no registry tool does.',
  },
  PERPENDICULAR: {
    status: 'GAP',
    tools: [],
    note: 'Drops a foot from a point to a line. calcPointFromBearingAndLine solves a different intersection.',
  },
  DIM: { status: 'GAP', tools: [], note: 'No dimension-annotation tool in the registry.' },

  // ── Report and calculate ──────────────────────────────────────────────────────────────────────
  LIST: { status: 'REACHABLE', tools: ['describeFeature'], note: 'C36.' },
  MEASURE_AREA: { status: 'REACHABLE', tools: ['measureFeature', 'measureTotalArea'], note: 'C36.' },
  INVERSE: { status: 'REACHABLE', tools: ['inverseTwoPoints'], note: 'Direct.' },
  FORWARD_POINT: {
    status: 'REACHABLE',
    tools: ['calcPointFromBearingDistance', 'addPoint'],
    note: 'Two calls: solve the coordinate, then place it. The editor tool does both in one.',
  },
};

export interface AIReach {
  /** Every tool in `ToolType` — the denominator D1 named. */
  total: number;
  reachable: number;
  gaps: number;
  exempt: number;
  /** Tools the AI could conceivably need to drive: total minus exempt. */
  applicable: number;
  /** reachable ÷ total, 0–100, rounded to a whole percent. */
  pct: number;
  /** reachable ÷ applicable, 0–100 — the fairer number, reported beside the literal one. */
  pctOfApplicable: number;
  /** Sorted list of tools with no AI path. This is the work list, not a footnote. */
  gapList: ToolType[];
}

/** Measure how much of the editor the AI can drive. Pure — derived entirely from the table above. */
export function aiReach(): AIReach {
  const entries = Object.entries(TOOL_AI_REACH) as [ToolType, ToolReach][];
  const total = entries.length;
  const reachable = entries.filter(([, r]) => r.status === 'REACHABLE').length;
  const exempt = entries.filter(([, r]) => r.status === 'EXEMPT').length;
  const gapList = entries
    .filter(([, r]) => r.status === 'GAP')
    .map(([t]) => t)
    .sort();
  const applicable = total - exempt;
  return {
    total,
    reachable,
    gaps: gapList.length,
    exempt,
    applicable,
    pct: Math.round((reachable / total) * 100),
    pctOfApplicable: Math.round((reachable / applicable) * 100),
    gapList,
  };
}

/** One line for a UI chip or a log. Reports the literal ÷51 figure D1 asked for. */
export function describeAIReach(r: AIReach = aiReach()): string {
  return `AI can drive ${r.reachable} of ${r.total} tools (${r.pct}%); ${r.gaps} gaps, ${r.exempt} exempt.`;
}

/** Registry tools named by the table that do not exist. Non-empty means the map has drifted. */
export function danglingReachTools(): string[] {
  const out = new Set<string>();
  for (const entry of Object.values(TOOL_AI_REACH)) {
    for (const t of entry.tools) if (!(t in toolRegistry)) out.add(t);
  }
  return [...out].sort();
}
