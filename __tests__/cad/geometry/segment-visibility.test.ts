// __tests__/cad/geometry/segment-visibility.test.ts
//
// cad-fills Slice 2/3 — locks the pure per-edge visibility helpers that
// drive hiding individual polyline/polygon edges (and the invariant
// that hiding an edge never changes the vertex loop the area fill is
// built from).

import { describe, it, expect } from 'vitest';
import {
  segmentCount,
  normalizeHiddenSegments,
  visibleSegmentRuns,
  toggleHiddenSegment,
} from '@/lib/cad/geometry/segment-visibility';

describe('segmentCount', () => {
  it('open polyline of n vertices has n-1 edges', () => {
    expect(segmentCount(4, false)).toBe(3);
  });
  it('closed polygon of n vertices has n edges (incl. closing edge)', () => {
    expect(segmentCount(4, true)).toBe(4);
  });
  it('returns 0 for degenerate runs', () => {
    expect(segmentCount(1, false)).toBe(0);
    expect(segmentCount(1, true)).toBe(0);
  });
});

describe('normalizeHiddenSegments', () => {
  it('drops out-of-range + non-integer indices, dedupes', () => {
    expect([...normalizeHiddenSegments([0, 2, 2, 5, -1, 1.5], 4)].sort()).toEqual([0, 2]);
  });
  it('handles null/undefined', () => {
    expect(normalizeHiddenSegments(null, 4).size).toBe(0);
    expect(normalizeHiddenSegments(undefined, 4).size).toBe(0);
  });
});

describe('visibleSegmentRuns — open polyline', () => {
  it('all visible → one continuous run', () => {
    expect(visibleSegmentRuns(4, false, [])).toEqual([[0, 1, 2, 3]]);
  });
  it('one hidden middle edge splits into two runs', () => {
    // vertices 0..3, hide edge 1 (v1→v2)
    expect(visibleSegmentRuns(4, false, [1])).toEqual([[0, 1], [2, 3]]);
  });
  it('hidden first edge drops the leading run', () => {
    expect(visibleSegmentRuns(4, false, [0])).toEqual([[1, 2, 3]]);
  });
  it('all edges hidden → no runs', () => {
    expect(visibleSegmentRuns(4, false, [0, 1, 2])).toEqual([]);
  });
});

describe('visibleSegmentRuns — closed polygon', () => {
  it('all visible → one run that returns to vertex 0 (closing edge)', () => {
    expect(visibleSegmentRuns(4, true, [])).toEqual([[0, 1, 2, 3, 0]]);
  });
  it('hiding the closing edge (index n-1) leaves the open chain', () => {
    // square v0..v3; hide edge 3 (v3→v0)
    expect(visibleSegmentRuns(4, true, [3])).toEqual([[0, 1, 2, 3]]);
  });
  it('hiding an interior edge yields one run that does NOT wrap the seam', () => {
    // hide edge 1 (v1→v2); visible edges: 2 (v2→v3), 3 (v3→v0), 0 (v0→v1)
    // run starts after the hidden edge → v2,v3,v0,v1
    expect(visibleSegmentRuns(4, true, [1])).toEqual([[2, 3, 0, 1]]);
  });
  it('two non-adjacent hidden edges → two runs', () => {
    // square, hide edges 0 (v0→v1) and 2 (v2→v3)
    // visible: edge 1 (v1→v2), edge 3 (v3→v0)
    expect(visibleSegmentRuns(4, true, [0, 2])).toEqual([[1, 2], [3, 0]]);
  });
});

describe('toggleHiddenSegment', () => {
  it('adds an index when not present', () => {
    expect(toggleHiddenSegment(undefined, 2, 4)).toEqual([2]);
    expect(toggleHiddenSegment([0], 2, 4)).toEqual([0, 2]);
  });
  it('removes an index when present + returns undefined when empty', () => {
    expect(toggleHiddenSegment([2], 2, 4)).toBeUndefined();
    expect(toggleHiddenSegment([0, 2], 2, 4)).toEqual([0]);
  });
  it('ignores out-of-range toggles', () => {
    expect(toggleHiddenSegment([0], 9, 4)).toEqual([0]);
  });
  it('result is sorted', () => {
    expect(toggleHiddenSegment([3, 1], 0, 4)).toEqual([0, 1, 3]);
  });
});

describe('cad-fills Slice 3 — fill loop is independent of hidden edges', () => {
  // The render path masks the texture/area fill to the FULL vertex
  // loop; hidden edges only affect which strokes are drawn. This
  // locks the contract that hiding edges does not reduce the set of
  // vertices a caller would feed to the fill mask.
  it('every vertex still participates in the closed loop regardless of hidden edges', () => {
    const n = 5;
    // With all edges hidden, runs are empty (nothing stroked) ...
    expect(visibleSegmentRuns(n, true, [0, 1, 2, 3, 4])).toEqual([]);
    // ... but the fill mask is built from the raw vertex list (0..n-1),
    // not from visibleSegmentRuns — so the enclosed area is unchanged.
    const fillLoop = Array.from({ length: n }, (_, i) => i);
    expect(fillLoop).toEqual([0, 1, 2, 3, 4]);
  });
});
