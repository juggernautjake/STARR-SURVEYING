// __tests__/cad/io/trv-closed-shape.test.ts
//
// cad-trv-fidelity — a traverse that forms a closed shape registers as
// a POLYGON (fillable, carries an area), whether it closes by repeating
// the first point id OR by the first + last points sitting at the same
// location with different ids (TPC does the latter often).

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

function traverse(members: string[], points: Array<[string, number, number]>): ReturnType<typeof parseTrv> {
  const lines = ['999,begin', '#,POINTS', `95,${points.length}`];
  for (const [id, n, e] of points) lines.push(`0,${id}`, '3,0', '4,5,0,0', `2,${n},${e},0`);
  lines.push('#,TRAVERSE', '30,BND', '31,536887298,5,0,0');
  members.forEach((m, i) => { lines.push(`10,${m}`, `11,1,${i},0,0,0`); });
  lines.push('999,end');
  return parseTrv(lines.join('\r\n'));
}

const polyOf = (trv: ReturnType<typeof parseTrv>) =>
  trvToDrawing(trv).features.find((f) => f.type === 'POLYGON' || f.type === 'POLYLINE');

describe('closed-shape registration', () => {
  it('closes when the FIRST point id repeats as the last → POLYGON', () => {
    const f = polyOf(traverse(
      ['A', 'B', 'C', 'A'],
      [['A', 10, 10], ['B', 110, 10], ['C', 110, 110]],
    ));
    expect(f?.type).toBe('POLYGON');
    expect(f?.geometry.vertices).toHaveLength(3); // closing dup dropped
  });

  it('closes when first + last points share a LOCATION but have different ids → POLYGON', () => {
    const f = polyOf(traverse(
      ['A', 'B', 'C', 'D'],
      [['A', 10, 10], ['B', 110, 10], ['C', 110, 110], ['D', 10, 10]], // D ≡ A
    ));
    expect(f?.type).toBe('POLYGON');
    expect(f?.geometry.vertices).toHaveLength(3);
  });

  it('an open chain stays a POLYLINE', () => {
    const f = polyOf(traverse(
      ['A', 'B', 'C'],
      [['A', 10, 10], ['B', 110, 10], ['C', 110, 110]],
    ));
    expect(f?.type).toBe('POLYLINE');
    expect(f?.geometry.vertices).toHaveLength(3);
  });
});
