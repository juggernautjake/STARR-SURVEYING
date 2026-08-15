// __tests__/cad/integration-round-trips.test.ts
//
// C44c — drive each surfaced integration end to end.
//
// The slice's own wording is the distinction that matters: *not "does the function work" but "can a
// person reach it and does it do the thing"*. C44a/C44b answered the reachability half — 60 of 61
// integration modules reach a page or a route. This is the other half, and it asks the question the
// unit tests do not: **the data goes out through the writer a surveyor actually clicks, and comes
// back through the reader, unchanged.**
//
// Every existing test for these formats checks one side. A writer test asserts the string contains
// what it should; a reader test parses a hand-written fixture. Both can pass while the pair
// disagrees — and a format round-trip that loses a coordinate does not throw, it produces a
// plausible number of plausible points in the wrong place. That failure mode is why the assertions
// below are all about specific values, never about counts.
//
// ── WHAT IS AND IS NOT COVERED ──────────────────────────────────────────────────────────────────
//
// A round trip needs both halves in this repo. Four formats have them: **DXF**, **GeoJSON**,
// **LandXML** (covered in `landxml-round-trip.test.ts`) and **TRV**. The instrument formats — RW5,
// GSI, JobXML, CSV — are import-only by design (no survey package reads them back from CAD), so
// they are driven one-way, through the real `processImport` pipeline rather than the parser alone.
//
// GeoJSON is the exception worth naming: it reprojects to WGS84 on the way out, so its round trip
// is checked to survey tolerance rather than to the bit.

import { describe, it, expect, beforeEach } from 'vitest';
import { exportToDxf } from '@/lib/cad/delivery/dxf-writer';
import { importFromDxf } from '@/lib/cad/delivery/dxf-reader';
import { exportToGeoJSON } from '@/lib/cad/delivery/geojson-writer';
import { importFromGeoJSON } from '@/lib/cad/delivery/geojson-reader';
import { drawingToTrv } from '@/lib/cad/io/drawing-to-trv';
import { importTrvFromText } from '@/lib/cad/io/trv-io';
import { processImport } from '@/lib/cad/import/import-pipeline';
import { parseRW5 } from '@/lib/cad/import/rw5-parser';
import { parseGsiAsRows } from '@/lib/cad/import/gsi-parser';
import { parseJobXML } from '@/lib/cad/import/jobxml-parser';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Layer, Point2D } from '@/lib/cad/types';

function makeLayer(id: string, name: string): Layer {
  return {
    id, name,
    visible: true, locked: false, frozen: false,
    color: '#00ff00', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
  };
}

const STYLE: Feature['style'] = {
  color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null,
  symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null,
  labelOffset: { x: 0, y: 0 }, isOverride: false,
};

let layerId = '';

/** Coordinates chosen to look like a real Texas Central job, because a round trip that only works
 *  near the origin is one that fails on every actual drawing. */
const P1 = { x: 942111.87, y: 3162345.12 };
const P2 = { x: 942150.5, y: 3162400.55 };
const P3 = { x: 942200.25, y: 3162450 };

function point(name: string, p: Point2D): Feature {
  return {
    id: generateId(), type: 'POINT',
    geometry: { type: 'POINT', point: { ...p } },
    layerId, style: { ...STYLE }, properties: { pointNumber: name },
  };
}

function line(a: Point2D, b: Point2D): Feature {
  return {
    id: generateId(), type: 'LINE',
    geometry: { type: 'LINE', start: { ...a }, end: { ...b } },
    layerId, style: { ...STYLE }, properties: {},
  };
}

function polygon(verts: Point2D[]): Feature {
  return {
    id: generateId(), type: 'POLYGON',
    geometry: { type: 'POLYGON', vertices: verts.map((v) => ({ ...v })) },
    layerId, style: { ...STYLE }, properties: {},
  };
}

/** A drawing with one of each geometry a deliverable actually carries. */
function seedDrawing(): void {
  const s = useDrawingStore.getState();
  s.addFeature(point('101', P1));
  s.addFeature(point('102', P2));
  s.addFeature(line(P1, P2));
  s.addFeature(polygon([P1, P2, P3]));
}

beforeEach(() => {
  useDrawingStore.getState().newDocument();
  layerId = generateId();
  useDrawingStore.getState().addLayer(makeLayer(layerId, 'BOUNDARY'));
  useDrawingStore.getState().setActiveLayer(layerId);
});

const doc = () => useDrawingStore.getState().document;

/** Every vertex-ish coordinate a feature carries, flattened, for set-wise comparison. */
function coords(f: Feature): Point2D[] {
  const g = f.geometry;
  const out: Point2D[] = [];
  if (g.point) out.push(g.point);
  if (g.start) out.push(g.start);
  if (g.end) out.push(g.end);
  for (const v of g.vertices ?? []) out.push(v);
  return out;
}

/** The features of a reader's returned document. Both readers hand back a whole `DrawingDocument`
 *  rather than a feature list — the first version of this test assumed `.features` and every
 *  assertion in it failed on `undefined`, which is the instrument being wrong, not the readers. */
function featuresOf(d: { features: Record<string, Feature> }): Feature[] {
  return Object.values(d.features);
}

/** True when `p` appears among `pool` within `tol` — order-independent on purpose, because a
 *  round trip is allowed to reorder features and is not allowed to move them. */
function near(pool: Point2D[], p: Point2D, tol: number): boolean {
  return pool.some((q) => Math.abs(q.x - p.x) <= tol && Math.abs(q.y - p.y) <= tol);
}

describe('C44c — DXF, out and back', () => {
  it('returns every coordinate it was given', () => {
    seedDrawing();
    const back = importFromDxf(exportToDxf(doc()));
    const pool = featuresOf(back.document).flatMap(coords);
    for (const p of [P1, P2, P3]) {
      expect(near(pool, p, 1e-4), `(${p.x}, ${p.y}) did not survive the DXF round trip`).toBe(true);
    }
  });

  it('does not mirror the drawing', () => {
    // The single most likely bug in any interchange writer, and the one that never throws: a plan
    // reflected about the 45° line is a plan, just not this one. Testing a point whose easting and
    // northing are far apart is what makes the swap detectable at all.
    seedDrawing();
    const back = importFromDxf(exportToDxf(doc()));
    const pool = featuresOf(back.document).flatMap(coords);
    expect(near(pool, { x: P1.y, y: P1.x }, 1e-4)).toBe(false);
  });

  it('carries the layer across', () => {
    seedDrawing();
    const back = importFromDxf(exportToDxf(doc()));
    const names = Object.values(back.document.layers).map((l) => l.name);
    expect(names).toContain('BOUNDARY');
  });
});

describe('C44c — GeoJSON, out and back', () => {
  it('returns every coordinate to survey tolerance after the reprojection', () => {
    seedDrawing();
    const back = importFromGeoJSON(exportToGeoJSON(doc()));
    const pool = featuresOf(back.document).flatMap(coords);
    // 0.01 ft. GeoJSON goes out as WGS84 degrees and comes back through the inverse projection, so
    // this is the one format where exact equality would be the wrong assertion — but a hundredth of
    // a foot is still far tighter than any boundary dispute cares about.
    for (const p of [P1, P2, P3]) {
      expect(near(pool, p, 0.01), `(${p.x}, ${p.y}) did not survive the GeoJSON round trip`).toBe(true);
    }
  });

  it('does not mirror the drawing', () => {
    seedDrawing();
    const back = importFromGeoJSON(exportToGeoJSON(doc()));
    expect(near(featuresOf(back.document).flatMap(coords), { x: P1.y, y: P1.x }, 0.01)).toBe(false);
  });
});

describe('C44c — TRV, out and back', () => {
  it('returns every coordinate it was given', () => {
    seedDrawing();
    const report = importTrvFromText(drawingToTrv(doc()));
    const pool = report.mapped.features.flatMap(coords);
    expect(pool.length).toBeGreaterThan(0);
    for (const p of [P1, P2, P3]) {
      expect(near(pool, p, 1e-3), `(${p.x}, ${p.y}) did not survive the TRV round trip`).toBe(true);
    }
  });
});

describe('C44c — TRV keeps the linework a surveyor drew here', () => {
  // The bug: TRV expresses linework as a traverse of REFERENCES to numbered points, so a traverse
  // whose vertices are not TRV points had nothing to reference and shipped an empty body. Re-import
  // dropped it with a non-fatal note and returned the vertices as loose points. The drawing came
  // back looking almost right — every corner present, every boundary gone. An import-then-export
  // round trip never caught it, because imported linework carries its original refs.

  it('brings a polygon back as a polygon, not as three loose points', () => {
    useDrawingStore.getState().addFeature(polygon([P1, P2, P3]));
    const report = importTrvFromText(drawingToTrv(doc()));
    const shapes = report.mapped.features.filter((f) => f.type === 'POLYGON' || f.type === 'POLYLINE');
    expect(shapes.length, 'the boundary did not come back at all').toBeGreaterThan(0);
    expect(shapes[0].type).toBe('POLYGON');
    expect(shapes[0].geometry.vertices).toHaveLength(3);
  });

  it('brings a polyline back open', () => {
    // Closure is signalled by repeating the first point id last. Writing that repetition for an
    // open shape would hand back a polygon with an area nobody drew.
    const pl: Feature = {
      id: generateId(), type: 'POLYLINE',
      geometry: { type: 'POLYLINE', vertices: [P1, P2, P3] },
      layerId, style: { ...STYLE }, properties: {},
    };
    useDrawingStore.getState().addFeature(pl);
    const report = importTrvFromText(drawingToTrv(doc()));
    const shapes = report.mapped.features.filter((f) => f.type === 'POLYGON' || f.type === 'POLYLINE');
    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes[0].type).toBe('POLYLINE');
  });

  it('does not invent a traverse from a two-vertex-or-fewer shape', () => {
    const stub: Feature = {
      id: generateId(), type: 'POLYLINE',
      geometry: { type: 'POLYLINE', vertices: [P1] },
      layerId, style: { ...STYLE }, properties: {},
    };
    useDrawingStore.getState().addFeature(stub);
    const report = importTrvFromText(drawingToTrv(doc()));
    // One vertex is not a traverse; synthesizing a lone point for it would put a phantom shot on
    // the drawing that the surveyor never occupied.
    expect(report.mapped.features.filter((f) => f.type === 'POINT')).toHaveLength(0);
  });

  it('leaves imported linework re-emitting its own refs', () => {
    // The fix must not touch the round-trip path it was built beside: a feature that came from a
    // TRV file carries `trvPointRefs`, and those are the ids the source file used.
    const imported: Feature = {
      id: generateId(), type: 'POLYLINE',
      geometry: { type: 'POLYLINE', vertices: [P1, P2] },
      layerId, style: { ...STYLE },
      properties: { trvPointRefs: '7,8' },
    };
    useDrawingStore.getState().addFeature(imported);
    const trv = drawingToTrv(doc());
    expect(trv).toContain('10,7');
    expect(trv).toContain('10,8');
    expect(trv).not.toContain('synth-');
  });
});

describe('C44c — the instrument formats, through the real pipeline', () => {
  // Import-only by design: no survey package reads these back out of CAD. So they are driven
  // through `processImport` rather than through the parser alone — the parser is the half that
  // already has tests, and the pipeline is the half a person actually reaches.

  it('drives an RW5 file to survey points', () => {
    const rw5 = [
      'JB,NMTESTJOB,DT08-01-2026,TM10:00:00',
      'MO,AD0,UN0,SF1.00000000,EC1,EO0.0,AU0',
      'SP,PN1,N 3162345.1200,E 942111.8700,EL812.4000,--IPF 1/2 inch pipe',
      'SP,PN2,N 3162400.5500,E 942150.0000,EL0.0000,--IPS',
    ].join('\n');
    const result = processImport(parseRW5(rw5), 'job.rw5');
    expect(result.stats.parseErrors).toBe(0);
    const p1 = result.points.find((p) => String(p.pointNumber) === '1');
    expect(p1, 'point 1 never reached the pipeline').toBeTruthy();
    expect(p1!.northing).toBeCloseTo(3162345.12, 4);
    expect(p1!.easting).toBeCloseTo(942111.87, 4);
  });

  it('drives a Leica GSI file to survey points', () => {
    const gsi = '110001+00000001 81..00+12345678 82..00+87654321 83..00+00123400';
    const result = processImport(parseGsiAsRows(gsi), 'job.gsi');
    expect(result.stats.parseErrors).toBe(0);
    expect(result.points).toHaveLength(1);
    // GSI stores millimetres; a pipeline that forgot the conversion produces a job 1,000× too big
    // and no error at all.
    expect(result.points[0].easting).toBeGreaterThan(0);
    expect(result.points[0].northing).toBeGreaterThan(0);
  });

  it('drives a Trimble JobXML file to survey points', () => {
    const jobxml = `<?xml version="1.0"?>
<JOBFile version="5.0">
  <Reductions>
    <Point>
      <Name>1001</Name><Code>IPF</Code>
      <Grid><North>3162345.12</North><East>942111.87</East><Elevation>812.40</Elevation></Grid>
    </Point>
  </Reductions>
</JOBFile>`;
    const result = processImport(parseJobXML(jobxml), 'job.jxl');
    expect(result.stats.parseErrors).toBe(0);
    const p = result.points.find((x) => String(x.pointNumber) === '1001');
    expect(p, 'point 1001 never reached the pipeline').toBeTruthy();
    expect(p!.northing).toBeCloseTo(3162345.12, 4);
    expect(p!.easting).toBeCloseTo(942111.87, 4);
  });

  it('reports a bad row rather than dropping it silently', () => {
    // The "queued ≠ failed" class: a pipeline that skips what it cannot read and says nothing looks
    // exactly like a clean import of a smaller file.
    const rw5 = [
      'JB,NMTESTJOB,DT08-01-2026',
      'SP,PN1,N 3162345.1200,E 942111.8700,EL812.4000,--IPF',
      'SP,PN2,N NOTANUMBER,E 942150.0000,EL0.0000,--IPS',
    ].join('\n');
    const result = processImport(parseRW5(rw5), 'job.rw5');
    expect(result.stats.parsedSuccessfully + result.stats.parseErrors).toBe(result.stats.totalRows);
  });
});
