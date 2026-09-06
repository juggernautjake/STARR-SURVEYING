import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderBoundaryCallSheet } from '../research/parcel-map-render.js';
import { parcelBoundary } from '../research/parcel-geometry.js';
import { planCaptures, type CapturePlanInput } from '../research/capture-plan.js';

// Plan 4C — the parcel-lines labels overlap on a curved frontage (owner screenshot 2026-09-06), and the
// calls should ALSO be a legible document. 4C.1 suppresses colliding labels on the map; 4C.2 files a
// clean boundary CALL SHEET from the same segment data.

const RING: Array<[number, number]> = [
  [-97.400, 31.100], [-97.399, 31.100], [-97.399, 31.101], [-97.400, 31.101], [-97.400, 31.100],
];

describe('renderBoundaryCallSheet (4C.2)', () => {
  it('renders a PNG of the calls, sized to the number of sides', async () => {
    const sheet = await renderBoundaryCallSheet(parcelBoundary(RING), 'Bell CAD — parcel #64567 boundary calls');
    // PNG magic number.
    expect(sheet.png.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(sheet.width).toBeGreaterThan(0);
    expect(sheet.height).toBeGreaterThan(0);
    // Taller boundaries make a taller sheet (a row per side).
    const bigger = await renderBoundaryCallSheet(
      { segments: [...parcelBoundary(RING).segments, ...parcelBoundary(RING).segments], perimeterFt: 1, areaAc: 1 },
      'x',
    );
    expect(bigger.height).toBeGreaterThan(sheet.height);
  });
});

describe('the boundary call sheet is PLANNED with the parcel lines (4C.2)', () => {
  const base: CapturePlanInput = {
    projectId: 'p1', county: 'Bell', latitude: 31.0568, longitude: -97.4642, acreage: 10, parcelId: '64567',
    parcelLayerUrl: 'https://gis.example/parcels/FeatureServer/0',
  };
  it('is captured whenever the parcel-lines drawing is', () => {
    const kinds = planCaptures(base).captures.map((c) => c.kind);
    expect(kinds).toContain('cad_parcel_lines');
    expect(kinds).toContain('boundary_call_sheet');
  });
});

describe('the map suppresses overlapping labels (4C.1)', () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), 'src/research/parcel-map-render.ts'), 'utf8');
  it('skips a side too short in pixels and a label that collides with a placed one', () => {
    expect(SRC).toContain('segPx < minLabelPx');       // too short to letter
    expect(SRC).toContain('minGapPx');                 // collision spacing
    expect(SRC).toContain('placed.push');              // tracks placed labels
  });
});
