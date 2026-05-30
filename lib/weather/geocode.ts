// lib/weather/geocode.ts
//
// hub-widget-excellence-15 — weather. Pure parsing of the Open-Meteo
// geocoding response (used to turn a manual ZIP into coordinates) plus
// the Central-Texas default the widget falls back to for `auto` /
// `active-job` / no-ZIP. Dependency-free → unit-tested in node.

export interface GeoPoint {
  latitude: number;
  longitude: number;
  label: string;
}

// Mirrors lib/research/property-search.service.ts — STARR operates in
// Central Texas, so that's the sensible default when we have no ZIP.
export const DEFAULT_LOCATION: GeoPoint = {
  latitude: 31.0698,
  longitude: -97.3536,
  label: 'Central Texas',
};

export interface OpenMeteoGeocode {
  results?: Array<{
    latitude?: number;
    longitude?: number;
    name?: string;
    admin1?: string;
    postcodes?: string[];
  }>;
}

/** Pick the first usable geocoding hit, labelling it with the ZIP the
 *  user entered (more recognizable than the city the postcode maps to).
 *  Returns null when no hit carries coordinates. */
export function firstGeoPoint(geo: OpenMeteoGeocode, zip: string): GeoPoint | null {
  const hit = (geo.results ?? []).find(
    (r) => typeof r.latitude === 'number' && typeof r.longitude === 'number',
  );
  if (!hit) return null;
  const place = [hit.name, hit.admin1].filter(Boolean).join(', ');
  return {
    latitude: hit.latitude as number,
    longitude: hit.longitude as number,
    label: place ? `${place} ${zip}`.trim() : zip,
  };
}
