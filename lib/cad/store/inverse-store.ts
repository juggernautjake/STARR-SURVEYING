// lib/cad/store/inverse-store.ts
//
// Holds the result of the most recent INVERSE measurement so it can
// outlive the click that produced it. The INVERSE tool is a two-point
// one-shot: click a base point, click a second point, and the tool
// computes the distance + bearing/azimuth between them, then hands the
// cursor back to SELECT. The measurement lives here (not in the
// transient command bar) so it stays pinned in the Properties panel and
// drawn on the canvas until the surveyor starts another inverse or
// switches to a different tool.
//
// Pure store: no DOM / React / canvas access.

import { create } from 'zustand';
import type { Point2D } from '../types';

/** One end of an inverse measurement. */
export interface InverseEndpoint {
  /** World coordinate — x = Easting, y = Northing. */
  point: Point2D;
  /** Name/number of the point feature this endpoint snapped to, when the
   *  click landed on an existing survey point. Null for a free coordinate. */
  pointName: string | null;
}

/** A completed two-point inverse measurement. Distance + bearing + azimuth
 *  are DERIVED from `from`/`to` at display time (via inverseBearingDistance)
 *  so the readout always honours the live display-unit preferences. */
export interface InverseMeasurement {
  from: InverseEndpoint;
  to: InverseEndpoint;
  /** Active layer at the time of measurement. */
  layerId: string;
  layerName: string;
}

interface InverseStore {
  measurement: InverseMeasurement | null;
  setMeasurement: (m: InverseMeasurement | null) => void;
  clear: () => void;
}

export const useInverseStore = create<InverseStore>((set) => ({
  measurement: null,
  setMeasurement: (m) => set({ measurement: m }),
  clear: () => set({ measurement: null }),
}));
