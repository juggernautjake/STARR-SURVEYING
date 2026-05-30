// __tests__/cad/geometry/boundary-loop.test.ts
//
// cad-fills Slice 4 — locks the pure boundary-ring assembler that lets
// the user fill an area bounded by SEPARATE line features (the
// screenshot quad = 4 disconnected lines).

import { describe, it, expect } from 'vitest';
import {
  assembleBoundaryLoop,
  segmentsFromFeatureLike,
  type BoundarySeg,
} from '@/lib/cad/geometry/boundary-loop';

const square: BoundarySeg[] = [
  { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
  { a: { x: 10, y: 0 }, b: { x: 10, y: 10 } },
  { a: { x: 10, y: 10 }, b: { x: 0, y: 10 } },
  { a: { x: 0, y: 10 }, b: { x: 0, y: 0 } },
];

describe('assembleBoundaryLoop — closes a ring', () => {
  it('chains 4 ordered segments into a 4-vertex ring', () => {
    const ring = assembleBoundaryLoop(square);
    expect(ring).not.toBeNull();
    expect(ring!).toHaveLength(4);
  });

  it('works regardless of segment order or direction (shuffled + flipped)', () => {
    const shuffled: BoundarySeg[] = [
      { a: { x: 0, y: 10 }, b: { x: 0, y: 0 } },   // left, going down
      { a: { x: 10, y: 0 }, b: { x: 0, y: 0 } },   // bottom, flipped
      { a: { x: 10, y: 10 }, b: { x: 10, y: 0 } }, // right, flipped
      { a: { x: 0, y: 10 }, b: { x: 10, y: 10 } }, // top
    ];
    const ring = assembleBoundaryLoop(shuffled);
    expect(ring).not.toBeNull();
    expect(ring!).toHaveLength(4);
    // The 4 corners are all present (order/rotation may vary).
    const corners = new Set(ring!.map((p) => `${p.x},${p.y}`));
    expect(corners).toEqual(new Set(['0,0', '10,0', '10,10', '0,10']));
  });

  it('merges endpoints within tolerance (tiny gaps still close)', () => {
    const gappy: BoundarySeg[] = [
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { a: { x: 10.005, y: 0 }, b: { x: 10, y: 10 } }, // 0.005 ft gap
      { a: { x: 10, y: 10 }, b: { x: 0, y: 10 } },
      { a: { x: 0, y: 10.004 }, b: { x: 0.002, y: 0 } },
    ];
    expect(assembleBoundaryLoop(gappy, 0.01)).not.toBeNull();
  });

  it('assembles a triangle (3 segments)', () => {
    const tri: BoundarySeg[] = [
      { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
      { a: { x: 4, y: 0 }, b: { x: 2, y: 3 } },
      { a: { x: 2, y: 3 }, b: { x: 0, y: 0 } },
    ];
    expect(assembleBoundaryLoop(tri)).toHaveLength(3);
  });
});

describe('assembleBoundaryLoop — rejects non-loops', () => {
  it('open chain (missing closing edge) → null', () => {
    expect(assembleBoundaryLoop(square.slice(0, 3))).toBeNull();
  });

  it('fewer than 3 edges → null', () => {
    expect(assembleBoundaryLoop(square.slice(0, 2))).toBeNull();
  });

  it('a branch / T-junction (a node with degree 3) → null', () => {
    const branched: BoundarySeg[] = [
      ...square,
      { a: { x: 5, y: 0 }, b: { x: 5, y: -5 } }, // spur off the bottom edge midpoint...
    ];
    // (5,0) isn't a node of the square, but (the spur shares no node) →
    // disjoint, so still not a single loop.
    expect(assembleBoundaryLoop(branched)).toBeNull();
  });

  it('two disjoint loops → null (not a single ring)', () => {
    const two: BoundarySeg[] = [
      ...square,
      { a: { x: 100, y: 100 }, b: { x: 104, y: 100 } },
      { a: { x: 104, y: 100 }, b: { x: 102, y: 103 } },
      { a: { x: 102, y: 103 }, b: { x: 100, y: 100 } },
    ];
    expect(assembleBoundaryLoop(two)).toBeNull();
  });

  it('drops zero-length segments rather than crashing', () => {
    const withDegenerate: BoundarySeg[] = [
      ...square,
      { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
    ];
    expect(assembleBoundaryLoop(withDegenerate)).toHaveLength(4);
  });
});

describe('segmentsFromFeatureLike', () => {
  it('extracts one segment per LINE', () => {
    const segs = segmentsFromFeatureLike([
      { type: 'LINE', geometry: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } },
    ]);
    expect(segs).toEqual([{ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }]);
  });

  it('extracts consecutive segments from a POLYLINE (open) + closes a POLYGON', () => {
    const open = segmentsFromFeatureLike([
      { type: 'POLYLINE', geometry: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } },
    ]);
    expect(open).toHaveLength(2);
    const closed = segmentsFromFeatureLike([
      { type: 'POLYGON', geometry: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } },
    ]);
    expect(closed).toHaveLength(3); // includes the closing edge
  });

  it('ignores geometry kinds without line segments', () => {
    expect(segmentsFromFeatureLike([{ type: 'POINT', geometry: {} }])).toEqual([]);
  });

  it('round-trips: 4 LINE features → segments → a closed ring', () => {
    const lines = [
      { type: 'LINE', geometry: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } } },
      { type: 'LINE', geometry: { start: { x: 10, y: 0 }, end: { x: 10, y: 10 } } },
      { type: 'LINE', geometry: { start: { x: 10, y: 10 }, end: { x: 0, y: 10 } } },
      { type: 'LINE', geometry: { start: { x: 0, y: 10 }, end: { x: 0, y: 0 } } },
    ];
    const ring = assembleBoundaryLoop(segmentsFromFeatureLike(lines));
    expect(ring).toHaveLength(4);
  });
});
