// __tests__/cad/ai-reach-ratchet.test.ts
//
// C39 — "tools reachable by AI ÷ 51", made permanent.
//
// D1 claim 1 is the one claim in this doc that can rot silently: a `ToolType` added next month
// joins the denominator without anybody deciding it should, and the number that was true when it
// was written quietly stops being true. So the number is pinned here, and so is the SET of tools
// with no AI path — because a ratchet on the count alone would let a new gap in as long as an old
// one closed in the same commit.
//
// The compile side of the guard is in `reach.ts` itself: `TOOL_AI_REACH` is an exhaustive
// `Record<ToolType, …>`, so a new tool with no entry does not build.

import { describe, it, expect } from 'vitest';
import {
  TOOL_AI_REACH,
  aiReach,
  describeAIReach,
  danglingReachTools,
} from '@/lib/cad/ai/reach';
import { toolRegistry } from '@/lib/cad/ai/tool-registry';

/**
 * The measurement as of C39. `reachable` may only go UP; `gapList` is pinned exactly.
 *
 * Raising the floor is the point of the slice — closing a gap should require deleting its line
 * here, which is a two-line diff that says what changed. Lowering it needs a reason in the commit.
 */
const REACH_FLOOR = 20;
const KNOWN_GAPS = [
  'ARRAY',
  'CHAMFER',
  'COPY',
  'CURB_RETURN',
  'DIM',
  'DIVIDE',
  'DRAW_CURVED_LINE',
  'DRAW_ELLIPSE',
  'DRAW_ELLIPSE_EDGE',
  'DRAW_REGULAR_POLYGON',
  'DRAW_SPLINE_CONTROL',
  'DRAW_SPLINE_FIT',
  'EXPLODE',
  'EXTEND',
  'FILLET',
  'INSERT_VERTEX',
  'JOIN',
  'MATCH_PROPERTIES',
  'OFFSET',
  'PERPENDICULAR',
  'POINT_AT_DISTANCE',
  'REMOVE_VERTEX',
  'REVERSE',
  'SIMPLIFY_POLYLINE',
  'SMOOTH_POLYLINE',
  'SPLIT',
  'TRIM',
];

describe('C39 — the reach measurement', () => {
  it('measures against the 51-tool denominator D1 named', () => {
    expect(aiReach().total).toBe(51);
  });

  it('reports a number, and the number is what the table says', () => {
    const r = aiReach();
    expect(r.reachable + r.gaps + r.exempt).toBe(r.total);
    expect(r.applicable).toBe(r.total - r.exempt);
    expect(r.pct).toBe(Math.round((r.reachable / r.total) * 100));
    // Reported out loud so the figure is visible in a log, not only inside an assertion.
    expect(describeAIReach(r)).toContain(`${r.reachable} of 51`);
  });

  it('has not gone backwards', () => {
    // C34–C36 took this from the audit's opening claim to here. It ratchets.
    expect(aiReach().reachable).toBeGreaterThanOrEqual(REACH_FLOOR);
  });

  it('fails when a tool joins the editor without an AI path', () => {
    // The point of pinning the SET rather than the count: a new GAP slipping in while an old one
    // closes leaves the number unchanged and the claim quietly weaker.
    expect(aiReach().gapList).toEqual(KNOWN_GAPS);
  });

  it('names only registry tools that exist', () => {
    // A map that names a deleted tool measures a reach the product does not have.
    expect(danglingReachTools()).toEqual([]);
  });

  it('gives every exemption a reason', () => {
    const exempt = Object.entries(TOOL_AI_REACH).filter(([, r]) => r.status === 'EXEMPT');
    expect(exempt.length).toBeGreaterThan(0);
    for (const [tool, r] of exempt) {
      // An exemption without a reason is how a coverage number gets talked upward.
      expect(r.note.length, `${tool} is exempt with no reason`).toBeGreaterThan(20);
      expect(r.tools, `${tool} is exempt but names tools`).toEqual([]);
    }
  });

  it('gives every reachable tool at least one registry tool', () => {
    for (const [tool, r] of Object.entries(TOOL_AI_REACH)) {
      if (r.status === 'REACHABLE') {
        expect(r.tools.length, `${tool} is reachable via nothing`).toBeGreaterThan(0);
      } else {
        expect(r.tools, `${tool} is not reachable but names tools`).toEqual([]);
      }
    }
  });

  it('counts editor coverage, not registry size — they are different numbers', () => {
    const r = aiReach();
    const registrySize = Object.keys(toolRegistry).length;
    // The audit's opening figure ("13 tools registered, so AI reaches 25%") conflated the two.
    // `drawPolylineThrough` covers two editor tools and `mirrorFeatures` covers three, while eight
    // solvers cover almost none — so the counts move independently and neither predicts the other.
    expect(registrySize).toBe(25);
    expect(r.reachable).not.toBe(registrySize);
  });

  it('does not count emulation as reach', () => {
    // A model can compute a hexagon's vertices and call drawPolylineThrough. If that counted, every
    // gap below would close by argument rather than by code.
    expect(TOOL_AI_REACH.DRAW_REGULAR_POLYGON.status).toBe('GAP');
    expect(TOOL_AI_REACH.POINT_AT_DISTANCE.status).toBe('GAP');
    // But the same OUTPUT reached by a different input device does count: the AI does not click.
    expect(TOOL_AI_REACH.DRAW_CIRCLE_EDGE.tools).toEqual(['drawCircle']);
  });
});
