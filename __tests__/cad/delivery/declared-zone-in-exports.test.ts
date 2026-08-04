// __tests__/cad/delivery/declared-zone-in-exports.test.ts
//
// CAD_AUDIT Slice S16b — the declared Texas State Plane zone reaches every exporter.
//
// S16a built `lib/cad/geo/texas-state-plane.ts` after finding EPSG:2277 hardcoded in four exporters
// and *described as two different zones*. The module then shipped with **no production caller** — a
// zone table nothing consulted, which is the "authored but not wired" defect this repo produces more
// than any other, and it was flagged by the reachability guard S18 added in the same session.
//
// Two things are asserted here, and the second matters more than the first:
//
//   1. Declaring a zone changes what every exporter stamps.
//   2. NOT declaring one changes nothing at all. Every drawing saved before this field existed must
//      export byte-identically, because consolidating a constant must never silently relabel files
//      that were already correct. A test that only checked (1) would pass while quietly re-stamping
//      every historical drawing on its next export.
//
// The stakes are why the strings are pinned rather than smoke-tested: the zone is read by other
// firms' software, which re-projects from whatever the file claims. A wrong zone does not error —
// it lands the parcel thousands of feet from where it belongs, and every number involved looks
// individually plausible.

import { describe, it, expect } from 'vitest';
import { exportToGeoJSON } from '@/lib/cad/delivery/geojson-writer';
import { exportToLandXML } from '@/lib/cad/delivery/landxml-writer';
import { buildTraversePcBundle } from '@/lib/cad/delivery/traversepc-bundle';
import { TEXAS_STATE_PLANE_ZONES, zoneByKey } from '@/lib/cad/geo/texas-state-plane';
import type { DrawingDocument } from '@/lib/cad/types';

function makeDoc(zoneKey?: string): DrawingDocument {
  return {
    id: 'doc-1',
    name: 'Zone Test',
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
    author: 'Tester',
    features: {},
    layers: {
      'layer-1': {
        id: 'layer-1', name: 'BOUNDARY', visible: true, locked: false,
        frozen: false, color: '#000', lineWeight: 0.25, lineTypeId: 'SOLID',
        opacity: 1, groupId: null, sortOrder: 0, isDefault: false,
        isProtected: false, autoAssignCodes: [],
      },
    },
    layerOrder: ['layer-1'],
    layerGroups: {},
    layerGroupOrder: [],
    customSymbols: [],
    customLineTypes: [],
    codeStyleOverrides: {},
    globalStyleConfig: {} as DrawingDocument['globalStyleConfig'],
    settings: {
      ...(zoneKey === undefined ? {} : { stateplaneZoneKey: zoneKey }),
      titleBlock: { projectName: 'Zone Test' },
      displayPreferences: { originNorthing: 0, originEasting: 0 },
    } as unknown as DrawingDocument['settings'],
  } as unknown as DrawingDocument;
}

describe('S16b — a drawing declares its state plane zone', () => {
  describe('a drawing that never declared one exports exactly as it always did', () => {
    // The regression that would matter most, and the one nobody would notice: every drawing on disk
    // predates this field. If the default drifted, their next export would relabel them.
    const doc = makeDoc(undefined);

    it('GeoJSON still stamps the Central URN and label', () => {
      const gj = JSON.parse(exportToGeoJSON(doc));
      expect(gj.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::2277');
      expect(gj.metadata.coordinateSystem).toBe(
        'NAD83 / Texas State Plane Central (US ft) — EPSG:2277',
      );
    });

    it('LandXML still emits the identical CoordinateSystem element', () => {
      // Pinned as the whole element, not just the epsgCode: the human-readable `desc` is what a
      // person reads when deciding whether to trust the file, and S16b reworded it programmatically.
      expect(exportToLandXML(doc)).toContain(
        '<CoordinateSystem epsgCode="2277" horizontalDatum="NAD83" ' +
          'desc="NAD83 Texas State Plane Central Zone 4203 (US Survey Feet)"/>',
      );
    });

    it('the Traverse PC README still names Central, zone 4203, EPSG:2277', () => {
      const readme = buildTraversePcBundle({ doc }).files['IMPORT-STEPS.txt'];
      expect(readme).toContain('NAD83 Texas State Plane Central Zone 4203');
      expect(readme).toContain('U.S. Survey Feet (EPSG:2277)');
    });
  });

  describe('declaring a zone changes every exporter', () => {
    // North Central — 2276 — chosen deliberately: it is the zone the research service's comment
    // confused with Central, so it is the one a wrong default would most plausibly be mistaken for.
    const doc = makeDoc('NORTH_CENTRAL');

    it('GeoJSON stamps the declared zone', () => {
      const gj = JSON.parse(exportToGeoJSON(doc));
      expect(gj.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::2276');
      expect(gj.metadata.coordinateSystem).toContain('North Central');
      expect(gj.metadata.coordinateSystem).toContain('2276');
    });

    it('LandXML stamps the declared EPSG and the matching SPCS zone number', () => {
      const xml = exportToLandXML(doc);
      expect(xml).toContain('epsgCode="2276"');
      expect(xml).toContain('desc="NAD83 Texas State Plane North Central Zone 4202 (US Survey Feet)"');
      // A file claiming EPSG 2276 beside zone 4203 contradicts itself, which is worse than being
      // merely wrong — a reader cannot tell which half to believe.
      expect(xml).not.toContain('4203');
    });

    it('the Traverse PC README names the declared zone', () => {
      const readme = buildTraversePcBundle({ doc }).files['IMPORT-STEPS.txt'];
      expect(readme).toContain('NAD83 Texas State Plane North Central Zone 4202');
      expect(readme).toContain('EPSG:2276');
      expect(readme).not.toContain('2277');
    });
  });

  it('every zone in the table round-trips through GeoJSON', () => {
    // Guards the instrument as much as the code: if `stateplaneZoneKey` stopped being read, the
    // paired tests above would still pass for Central and fail only for one other zone. This fails
    // for four of five, which reads as "the field is ignored" rather than "one zone is wrong".
    for (const zone of TEXAS_STATE_PLANE_ZONES) {
      const gj = JSON.parse(exportToGeoJSON(makeDoc(zone.key)));
      expect(gj.crs.properties.name, `zone ${zone.key}`).toBe(
        `urn:ogc:def:crs:EPSG::${zone.epsg}`,
      );
      expect(gj.metadata.coordinateSystem, `zone ${zone.key}`).toBe(zone.label);
    }
  });

  it('an unrecognised zone key falls back to Central rather than emitting nothing', () => {
    // A drawing hand-edited or written by an older build can carry a key this table does not know.
    // `zoneByKey` falls back because "the drawing did not say" has a right answer; `zoneByEpsg` does
    // NOT, because an unrecognised EPSG is a positive claim about a zone we cannot honour.
    const gj = JSON.parse(exportToGeoJSON(makeDoc('ATLANTIS')));
    expect(gj.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::2277');
    expect(zoneByKey('ATLANTIS').key).toBe('CENTRAL');
  });
});
