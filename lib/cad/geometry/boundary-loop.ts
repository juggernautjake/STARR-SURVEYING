// lib/cad/geometry/boundary-loop.ts
//
// cad-fills Slice 4 — assemble a closed boundary ring from a set of
// UNORDERED, possibly-disconnected line segments, so the user can
// select N separate LINE/POLYLINE features that visually enclose an
// area and "Fill enclosed area" (the screenshot case: a quad drawn as
// 4 separate lines, which isn't a single closed polyline and so had no
// fill option).
//
// Pure + dependency-free → unit-tested in node.

import type { Point2D } from '../types';

export interface BoundarySeg {
  a: Point2D;
  b: Point2D;
}

/** Default endpoint-merge tolerance, in drawing feet. Endpoints closer
 *  than this are treated as the same vertex. */
export const DEFAULT_LOOP_TOLERANCE_FT = 0.01;

interface Node {
  sumX: number;
  sumY: number;
  count: number;
  edges: number[]; // indices into the edge list
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Chain unordered segments endpoint-to-endpoint into a single closed
 * ring of vertices. Returns the ordered vertex list (no repeated
 * closing vertex) when the segments form exactly one simple closed
 * loop; returns null when they don't (open chain, a branch/junction,
 * multiple disjoint loops, or fewer than 3 edges).
 */
export function assembleBoundaryLoop(
  segments: ReadonlyArray<BoundarySeg>,
  tol: number = DEFAULT_LOOP_TOLERANCE_FT,
): Point2D[] | null {
  const tol2 = tol * tol;
  const nodes: Node[] = [];

  // Merge an endpoint into the node list (O(n) scan — fine for the
  // handful of segments a user multi-selects).
  const nodeFor = (p: Point2D): number => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const cx = n.sumX / n.count;
      const cy = n.sumY / n.count;
      if (dist2(cx, cy, p.x, p.y) <= tol2) {
        n.sumX += p.x;
        n.sumY += p.y;
        n.count += 1;
        return i;
      }
    }
    nodes.push({ sumX: p.x, sumY: p.y, count: 1, edges: [] });
    return nodes.length - 1;
  };

  interface Edge { u: number; v: number; }
  const edges: Edge[] = [];
  for (const seg of segments) {
    if (!seg || !seg.a || !seg.b) continue;
    if (dist2(seg.a.x, seg.a.y, seg.b.x, seg.b.y) <= tol2) continue; // zero-length
    const u = nodeFor(seg.a);
    const v = nodeFor(seg.b);
    if (u === v) continue; // collapsed to a single node
    const idx = edges.length;
    edges.push({ u, v });
    nodes[u].edges.push(idx);
    nodes[v].edges.push(idx);
  }

  if (edges.length < 3) return null;
  // A simple closed loop ⇒ every node has degree exactly 2 and the
  // node count equals the edge count.
  if (nodes.length !== edges.length) return null;
  for (const n of nodes) {
    if (n.edges.length !== 2) return null;
  }

  // Walk the cycle from edge 0, following the un-traversed incident
  // edge at each node. If we return to the start having used every
  // edge, it's one simple loop.
  const rep = (i: number): Point2D => ({ x: nodes[i].sumX / nodes[i].count, y: nodes[i].sumY / nodes[i].count });
  const start = edges[0].u;
  let current = edges[0].v;
  let prevEdge = 0;
  const order: number[] = [start];
  const usedEdges = new Set<number>([0]);

  while (current !== start) {
    order.push(current);
    const incident = nodes[current].edges;
    const nextEdge = incident.find((e) => e !== prevEdge);
    if (nextEdge === undefined) return null; // dead end
    const e = edges[nextEdge];
    const nextNode = e.u === current ? e.v : e.u;
    prevEdge = nextEdge;
    usedEdges.add(nextEdge);
    current = nextNode;
    if (order.length > nodes.length) return null; // runaway guard
  }

  // Closed back to start — must have used every edge (single loop, not
  // a sub-cycle leaving stragglers).
  if (usedEdges.size !== edges.length) return null;
  return order.map(rep);
}

/** Convenience: pull boundary segments out of feature-like objects.
 *  LINE → one segment (start→end); POLYLINE/POLYGON → consecutive
 *  vertex segments. Other geometry kinds contribute nothing. */
export function segmentsFromFeatureLike(
  features: ReadonlyArray<{ type: string; geometry: { start?: Point2D; end?: Point2D; vertices?: Point2D[] } }>,
): BoundarySeg[] {
  const segs: BoundarySeg[] = [];
  for (const f of features) {
    const g = f.geometry;
    if (f.type === 'LINE' && g.start && g.end) {
      segs.push({ a: g.start, b: g.end });
    } else if ((f.type === 'POLYLINE' || f.type === 'POLYGON') && g.vertices && g.vertices.length >= 2) {
      for (let i = 0; i < g.vertices.length - 1; i++) {
        segs.push({ a: g.vertices[i], b: g.vertices[i + 1] });
      }
      if (f.type === 'POLYGON') {
        segs.push({ a: g.vertices[g.vertices.length - 1], b: g.vertices[0] });
      }
    }
  }
  return segs;
}
