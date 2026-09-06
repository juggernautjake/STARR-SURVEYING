// app/admin/research/[projectId]/_sections/ParcelBoundaryCard.tsx — plan 3.2 (B2).
//
// The subject parcel's boundary as a table — bearing + ground length per side, with perimeter and
// area — computed from the county GIS parcel-fabric geometry. Dumb: `parcelBoundaryOf` decides
// whether there is a boundary; this renders one. Labelled "GIS-computed" so a surveyor never reads a
// fabric bearing as a recorded plat call. Styles live in `.parcel-boundary__*` in AdminResearch.css.

'use client';

import { Compass } from 'lucide-react';
import type { ParcelBoundary } from './parcel-boundary-data';

export default function ParcelBoundaryCard({ report }: { report: ParcelBoundary | null }) {
  if (!report) return null;

  return (
    <div className="parcel-boundary">
      <h4 className="parcel-boundary__title">
        <Compass size={15} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
        Parcel Boundary — GIS-computed
      </h4>
      <p className="parcel-boundary__summary">
        {report.segments.length} side{report.segments.length === 1 ? '' : 's'} ·{' '}
        perimeter {report.perimeterFt.toFixed(0)}′ · area {report.areaAc.toFixed(2)} ac. Bearings and
        lengths are computed from the county parcel-fabric geometry, <strong>not</strong> the recorded
        plat calls — treat them as a sketch, not a boundary of record.
      </p>

      <div className="parcel-boundary__table-wrap">
        <table className="parcel-boundary__table">
          <thead>
            <tr>
              <th scope="col">Side</th>
              <th scope="col">Bearing</th>
              <th scope="col">Length (ft)</th>
              <th scope="col">Azimuth</th>
            </tr>
          </thead>
          <tbody>
            {report.segments.map((s, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="parcel-boundary__bearing">{s.bearing}</td>
                <td className="parcel-boundary__num">{s.lengthFt.toFixed(1)}</td>
                <td className="parcel-boundary__num">{s.azimuthDeg.toFixed(1)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
