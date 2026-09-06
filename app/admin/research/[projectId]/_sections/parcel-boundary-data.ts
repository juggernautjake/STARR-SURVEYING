// app/admin/research/[projectId]/_sections/parcel-boundary-data.ts — plan 3.2 (B2).
//
// The subject parcel's boundary as STRUCTURED data — one row per side (bearing + ground length),
// plus perimeter and area — computed by the worker from the county's GIS parcel-fabric geometry and
// persisted to `analysis_metadata.boundarySegments` (worker/src/research/parcel-geometry.ts,
// emitted in the `cad_parcel_lines` render). These are GIS-computed figures, NOT recorded plat
// calls: the card labels them so a surveyor never mistakes one for the other. Same "declare the
// shape the page reads" pattern as source-comparison-data.ts / gis-quality-data.ts.

import type { ResearchProject } from '@/types/research';

/** One boundary side, GIS-computed. */
export interface BoundarySegment {
  from: [number, number];
  to: [number, number];
  lengthFt: number;
  azimuthDeg: number;
  bearing: string;
}

export interface ParcelBoundary {
  segments: BoundarySegment[];
  perimeterFt: number;
  areaAc: number;
}

/** Every key the page reads, held against the worker by the contract test. */
export const PARCEL_BOUNDARY_KEYS = [
  'segments', 'perimeterFt', 'areaAc',
  'from', 'to', 'lengthFt', 'azimuthDeg', 'bearing',
] as const;

/**
 * Read the boundary, or null when there is none. A run before B2 shipped, a run whose subject
 * polygon was never matched in the layer, or a non-Bell run all legitimately carry no boundary —
 * "no boundary" and "this run produced none" are the same, normal, silent case.
 */
export function parcelBoundaryOf(project: ResearchProject | null): ParcelBoundary | null {
  const meta = (project?.analysis_metadata ?? {}) as Record<string, unknown>;
  // `boundarySegments`, NOT `parcelBoundary` — the latter name is already taken by the raw polygon
  // rings on the pipeline result. This is the STRUCTURED bearing/length payload (plan B2).
  const raw = meta.boundarySegments as Record<string, unknown> | undefined;
  if (!raw || !Array.isArray(raw.segments) || raw.segments.length === 0) return null;

  const segments: BoundarySegment[] = (raw.segments as Record<string, unknown>[])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      from: Array.isArray(s.from) ? [Number(s.from[0]), Number(s.from[1])] : [0, 0],
      to: Array.isArray(s.to) ? [Number(s.to[0]), Number(s.to[1])] : [0, 0],
      lengthFt: typeof s.lengthFt === 'number' ? s.lengthFt : 0,
      azimuthDeg: typeof s.azimuthDeg === 'number' ? s.azimuthDeg : 0,
      bearing: String(s.bearing ?? ''),
    }));

  return {
    segments,
    perimeterFt: typeof raw.perimeterFt === 'number' ? raw.perimeterFt : segments.reduce((n, s) => n + s.lengthFt, 0),
    areaAc: typeof raw.areaAc === 'number' ? raw.areaAc : 0,
  };
}
