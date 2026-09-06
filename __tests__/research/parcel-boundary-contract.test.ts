// __tests__/research/parcel-boundary-contract.test.ts — plan 3.2/3.3 (B2).
//
// The worker computes the subject parcel's boundary (bearing + length per side, perimeter, area) from
// the GIS parcel-fabric geometry and persists it to `analysis_metadata.boundarySegments`; the Review
// Artifacts tab reads it through `parcelBoundaryOf` into a table. Guards the "authored but not wired"
// shape: the worker persists it, the page mounts the card, and the shaper is unit-tested.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ResearchProject } from '@/types/research';
import { parcelBoundaryOf, PARCEL_BOUNDARY_KEYS } from '@/app/admin/research/[projectId]/_sections/parcel-boundary-data';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const PAGE = 'app/admin/research/[projectId]/page.tsx';
const WORKER = 'worker/src/index.ts';
const GEOM = 'worker/src/research/parcel-geometry.ts';

const project = (boundarySegments: unknown): ResearchProject =>
  ({ analysis_metadata: { boundarySegments } }) as unknown as ResearchProject;

describe('the worker emits the boundary the page reads', () => {
  it('persists boundarySegments (not baked only into the PNG)', () => {
    const worker = read(WORKER);
    expect(worker).toContain('boundarySegments: map.subjectGeometry');
    expect(worker).toContain('analysis_metadata');
  });

  it('the geometry module exports every field the payload carries', () => {
    const geom = read(GEOM);
    // ParcelBoundary { segments, perimeterFt, areaAc }; ParcelSegment { from, to, lengthFt, azimuthDeg, bearing }.
    for (const key of PARCEL_BOUNDARY_KEYS) {
      expect(geom, `${key} is read by the page and produced by nobody`).toMatch(new RegExp(`\\b${key}\\b`));
    }
    expect(geom).toContain('export function parcelBoundary(');
    expect(geom).toContain('export function ringAreaAcres(');
  });
});

describe('the page mounts the card', () => {
  it('renders ParcelBoundaryCard from parcelBoundaryOf', () => {
    const page = read(PAGE);
    expect(page).toContain('<ParcelBoundaryCard report={parcelBoundaryOf(project)} />');
    expect(page).toContain("from './_sections/parcel-boundary-data'");
  });
});

describe('parcelBoundaryOf shapes the payload', () => {
  it('returns null when there is no boundary (pre-B2 / unmatched / non-Bell run)', () => {
    expect(parcelBoundaryOf(project(undefined))).toBeNull();
    expect(parcelBoundaryOf(project({ segments: [] }))).toBeNull();
    expect(parcelBoundaryOf(null)).toBeNull();
  });

  it('reads segments, perimeter and area', () => {
    const b = parcelBoundaryOf(project({
      segments: [
        { from: [-97.4, 31.1], to: [-97.399, 31.1], lengthFt: 312.4, azimuthDeg: 90, bearing: 'N90°00′E' },
        { from: [-97.399, 31.1], to: [-97.399, 31.101], lengthFt: 364.0, azimuthDeg: 0, bearing: 'N0°00′E' },
      ],
      perimeterFt: 676.4,
      areaAc: 2.61,
    }));
    expect(b).not.toBeNull();
    expect(b!.segments).toHaveLength(2);
    expect(b!.segments[0].bearing).toBe('N90°00′E');
    expect(b!.perimeterFt).toBeCloseTo(676.4, 3);
    expect(b!.areaAc).toBeCloseTo(2.61, 3);
  });

  it('falls back to summing the segments when perimeter is missing', () => {
    const b = parcelBoundaryOf(project({
      segments: [
        { from: [0, 0], to: [0, 0], lengthFt: 100, azimuthDeg: 0, bearing: 'N0°00′E' },
        { from: [0, 0], to: [0, 0], lengthFt: 50, azimuthDeg: 90, bearing: 'N90°00′E' },
      ],
    }));
    expect(b!.perimeterFt).toBe(150);
    expect(b!.areaAc).toBe(0);
  });
});
