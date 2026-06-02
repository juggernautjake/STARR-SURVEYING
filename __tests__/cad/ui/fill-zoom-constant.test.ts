// __tests__/cad/ui/fill-zoom-constant.test.ts
//
// cad-trv-fidelity — the infill pattern must be CONSTANT in world units
// (it scales with zoom like the geometry), not a fixed on-screen size.
// The renderer generates the pattern over the WORLD-space bbox
// (screen ÷ zoom) and scales every primitive back up by `zoom` when
// stroking. Source-locked (the fill render is a Pixi path; the pure
// pattern generator it calls is unit-tested separately).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('infill pattern stays constant in world units across zoom', () => {
  it('reads the current zoom in both fill renderers', () => {
    const matches = SRC.match(/const zoom = useViewportStore\.getState\(\)\.zoom \|\| 1;/g) ?? [];
    // drawFillPatternForPolygon + drawFillStackForPolygon.
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('generates the pattern over the WORLD bbox (screen ÷ zoom)', () => {
    const matches = SRC.match(/generateFillPattern\(width \/ zoom, height \/ zoom, cfg\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('scales dot positions + radius back to screen by zoom', () => {
    expect(SRC).toMatch(/drawCircle\(minX \+ d\.x \* zoom, minY \+ d\.y \* zoom, d\.r \* zoom\)/);
  });

  it('scales line endpoints + weight by zoom', () => {
    expect(SRC).toMatch(/moveTo\(minX \+ ln\.x1 \* zoom, minY \+ ln\.y1 \* zoom\)/);
    expect(SRC).toMatch(/lineTo\(minX \+ ln\.x2 \* zoom, minY \+ ln\.y2 \* zoom\)/);
    expect(SRC).toMatch(/patternLineWeight\(feature\.style\.patternScale \?\? 1\) \* zoom/);
    expect(SRC).toMatch(/patternLineWeight\(layer\.scale\) \* zoom/);
  });
});
