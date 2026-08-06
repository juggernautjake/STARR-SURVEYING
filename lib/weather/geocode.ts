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
    country_code?: string;
    postcodes?: string[];
  }>;
}

/** Pick the first usable US geocoding hit, labelling it with the ZIP the
 *  user entered (more recognizable than the city the postcode maps to).
 *  Returns null when no hit carries coordinates.
 *
 *  ── THE `country_code` GUARD (2026-08-06) ────────────────────────────
 *
 *  The caller asks Open-Meteo for US results. It used to ask with
 *  `&country=US`, which is not a parameter the API has — it was accepted
 *  and ignored. Measured that day: `zip=78701` returned Austin, Texas
 *  followed by Conflans-Sainte-Honorine, France, and "Killeen" returned
 *  three towns in Ireland. Taking "the first hit with coordinates" is
 *  therefore not safe on its own; when the US match is not first, this
 *  returned a forecast for the wrong continent under the user's own ZIP.
 *
 *  The parameter is fixed at the call site AND filtered here, because a
 *  query-string typo is invisible and this is not. */
export function firstGeoPoint(geo: OpenMeteoGeocode, zip: string): GeoPoint | null {
  const hit = (geo.results ?? []).find(
    (r) =>
      typeof r.latitude === 'number' &&
      typeof r.longitude === 'number' &&
      r.country_code === 'US',
  );
  if (!hit) return null;
  const place = [hit.name, hit.admin1].filter(Boolean).join(', ');
  return {
    latitude: hit.latitude as number,
    longitude: hit.longitude as number,
    label: place ? `${place} ${zip}`.trim() : zip,
  };
}
