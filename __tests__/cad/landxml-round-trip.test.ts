// __tests__/cad/landxml-round-trip.test.ts
//
// C44b — the shipped LandXML writer, checked against the rules the ORPHAN writer encoded.
//
// C44a found two LandXML writers. `lib/cad/export/landxml-writer.ts` has no path to any surface and
// a good test suite; `lib/cad/delivery/landxml-writer.ts` ships, reachable from the CAD page in
// three hops, and had **no test that its output could be read back at all**. Every dead module this
// codebase has found had passing tests — that is the ratchet's own opening line — and this pair is
// the cleanest example of it: the rules were written down and tested against the writer nobody runs.
//
// So before the orphan is deleted, its rules are re-asserted here against the writer that runs. A
// deletion that discards the only place a requirement was written down is not a cleanup.

import { describe, it, expect, beforeEach } from 'vitest';
import { exportToLandXML } from '@/lib/cad/delivery/landxml-writer';
import { parseLandXml } from '@/lib/cad/import/landxml-parser';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Layer } from '@/lib/cad/types';

function makeLayer(id: string, name: string): Layer {
  return {
    id, name,
    visible: true, locked: false, frozen: false,
    color: '#00ff00', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
  };
}

let layerId = '';

function point(name: string, x: number, y: number, props: Record<string, string | number> = {}): Feature {
  return {
    id: generateId(),
    type: 'POINT',
    geometry: { type: 'POINT', point: { x, y } },
    layerId,
    style: {
      color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null,
      symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null,
      labelOffset: { x: 0, y: 0 }, isOverride: false,
    },
    properties: { pointNumber: name, ...props },
  };
}

beforeEach(() => {
  useDrawingStore.getState().newDocument();
  layerId = generateId();
  useDrawingStore.getState().addLayer(makeLayer(layerId, 'CONTROL'));
  useDrawingStore.getState().setActiveLayer(layerId);
});

const doc = () => useDrawingStore.getState().document;

describe('C44b — the shipped writer round-trips through the shipped reader', () => {
  it('brings the coordinates back as they went in', () => {
    useDrawingStore.getState().addFeature(point('101', 942111.87, 3162345.12));
    const xml = exportToLandXML(doc());
    const back = parseLandXml(xml);
    const p = back.points.find((x) => x.name === '101');
    expect(p, 'point 101 did not survive the round trip').toBeTruthy();
    // Checked against the ORIGINALS, not against each other — if both sides flipped northing and
    // easting, comparing the two would still pass and the plan would still be mirrored.
    expect(p!.northing).toBeCloseTo(3162345.12, 4);
    expect(p!.easting).toBeCloseTo(942111.87, 4);
  });

  it('declares its units, which Civil 3D and Trimble both need', () => {
    useDrawingStore.getState().addFeature(point('1', 100, 200));
    const back = parseLandXml(exportToLandXML(doc()));
    // A document with no unit declaration is rejected or silently mis-scaled by the receiving
    // package — a survey off by a factor of 3.28, which looks like a survey.
    expect(back.units.linear).toBe('USSurveyFoot');
  });

  it('escapes text that would otherwise break the receiving software', () => {
    useDrawingStore.getState().addFeature(
      point('1', 10, 20, { code: 'IPF', description: '1/2" pipe <found> & held' }),
    );
    const xml = exportToLandXML(doc());
    // A raw & or < produces a file that fails to parse downstream, with an error naming a line
    // number and nothing about why. "TREE 12<AT FENCE" is exactly what a crew types.
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&lt;found&gt;');
    expect(xml).toContain('&amp;');
    // And it must still parse.
    expect(() => parseLandXml(xml)).not.toThrow();
  });

  it('keeps survey-significant precision', () => {
    useDrawingStore.getState().addFeature(point('1', 942111.8765, 3162345.4321));
    const back = parseLandXml(exportToLandXML(doc()));
    const p = back.points.find((x) => x.name === '1')!;
    // Four decimals of a US Survey Foot is 0.03 mm. The orphan promised "full precision" and this
    // writer rounds; the promise is stronger than the requirement, and the requirement is what a
    // total station can actually resolve.
    expect(p.northing).toBeCloseTo(3162345.4321, 4);
    expect(p.easting).toBeCloseTo(942111.8765, 4);
  });

  it('emits no exponential notation, which no consumer reliably reads', () => {
    useDrawingStore.getState().addFeature(point('1', 942111.87, 3162345.12));
    expect(exportToLandXML(doc())).not.toMatch(/\de[+-]\d/i);
  });
});
