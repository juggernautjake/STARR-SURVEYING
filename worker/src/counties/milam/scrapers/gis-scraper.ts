/**
 * Milam County GIS Scraper
 *
 * Queries the Milam AD parcel map's ArcGIS REST service directly — no browser, no viewer. The
 * service (`gisdata.pandai.com/pamaps01/…/MilamCADPublic`, Pritchard & Abbott) is what the county's
 * own viewer draws from, and its parcel layer is JOINED to the appraisal accounts: owner, legal,
 * acreage, situs, deed volume/page and the account code all ride on the polygon. Two further
 * layers carry what the Bell run has to infer from a legal description — the ORIGINAL SURVEY
 * (abstract number and original grantee, layer 3) and the SUBDIVISION (name and S-code, layer 5) —
 * so this scraper reads them at the parcel's centroid and hands them to the run as facts.
 *
 * Driven live 2026-09-09 (see config/endpoints.ts): 21,465 parcels, 412 surveys, 673 subdivisions.
 * Returns the Bell `GisSearchResult` shape so everything downstream of Phase 1 reads it unchanged.
 *
 * Search order: property ID → situs address → point-in-parcel at the geocode → owner name.
 */

import { MILAM_ENDPOINTS, MILAM_TIMEOUTS } from '../config/endpoints.js';
import {
  MILAM_GIS_FIELD_MAP, MILAM_SURVEY_FIELD_MAP, MILAM_SUBDIVISION_FIELD_MAP, MILAM_PARCEL_OUT_FIELDS,
  getField, getNumericField, composeSitusAddress, composeLegalDescription, composeMailingAddress,
  abstractNumberFromLegal, subdivisionCodeFromLegal,
} from '../config/field-maps.js';
import type {
  GisSearchInput, GisSearchResult, GisScraperProgress, GisDeedEntry, GisFeatureSummary,
} from '../../bell/scrapers/gis-scraper.js';
import type { ScreenshotCapture } from '../../bell/types/research-result.js';
import { hostGate } from '../../../infra/dead-host.js';

// ── ArcGIS REST ──────────────────────────────────────────────────────

interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: { rings?: number[][][] };
}

interface ArcGisQueryResult {
  features: ArcGisFeature[];
  error?: { code?: number; message?: string };
}

/** One layer query. `null` means the host did not answer or refused — not "no parcels". */
async function queryLayer(
  layerUrl: string,
  params: Record<string, string>,
  urlsVisited: string[],
): Promise<ArcGisQueryResult | null> {
  const qs = new URLSearchParams({ ...params, f: 'json' }).toString();
  const fullUrl = `${layerUrl}${MILAM_ENDPOINTS.gis.queryPath}?${qs}`;
  urlsVisited.push(fullUrl);
  // The 2026-09-02 Milam run spent 147 s on one dead host, one timeout per probe. Same gate.
  const gate = hostGate(fullUrl);
  if (gate.blocked) return null;
  try {
    const resp = await fetch(fullUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'STARR-SURVEYING/1.0' },
      signal: AbortSignal.timeout(MILAM_TIMEOUTS.arcgisQuery),
    });
    if (!resp.ok) return null;
    const json = await resp.json() as ArcGisQueryResult;
    if (json.error || !Array.isArray(json.features)) return null;
    return json;
  } catch {
    return null;
  }
}

const PARCEL = MILAM_ENDPOINTS.gis.parcelLayer;
const F = MILAM_GIS_FIELD_MAP;

/** SQL-quote a value for an ArcGIS `where`. */
function q(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Search the Milam parcel layer for the property.
 * Tries: property ID → situs address → point at the geocode → owner name.
 */
export async function scrapeMilamGis(
  input: GisSearchInput,
  onProgress: (p: GisScraperProgress) => void,
): Promise<GisSearchResult | null> {
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];
  const progress = (msg: string) => onProgress({ phase: 'GIS', message: msg, timestamp: new Date().toISOString() });

  const common = { outFields: MILAM_PARCEL_OUT_FIELDS, returnGeometry: 'true', outSR: '4326' };

  // ── 1. Property ID — the parcel's own name on the layer ─────────────
  if (input.propertyId) {
    progress(`Querying Milam GIS by property ID: ${input.propertyId}`);
    const r = await queryLayer(PARCEL, { where: `${F.propertyId[0]} = ${q(input.propertyId)}`, ...common }, urlsVisited);
    if (r && r.features.length > 0) {
      progress(`Found ${r.features.length} parcel(s) by property ID`);
      return await enrich(buildResult(r.features, screenshots, urlsVisited), urlsVisited, progress);
    }
    progress('No parcel carries that property ID — trying the address');
  }

  // ── 2. Situs address — number + street, ranked by the geocode ───────
  if (input.address) {
    const parsed = parseSitus(input.address);
    if (parsed.street) {
      const clauses = [`UPPER(${F.situsStreet[0]}) LIKE ${q(parsed.street + '%')}`];
      if (parsed.number) clauses.push(`${F.situsNumber[0]} = ${q(parsed.number)}`);
      progress(`Querying Milam GIS by situs: number=${parsed.number ?? '—'} street="${parsed.street}"${parsed.city ? ` city=${parsed.city}` : ''}`);
      const r = await queryLayer(PARCEL, { where: clauses.join(' AND '), ...common }, urlsVisited);
      if (r && r.features.length > 0) {
        progress(`${r.features.length} parcel(s) match the situs`);
        const ranked = rankFeatures(r.features, parsed, input.lat && input.lon ? { lat: input.lat, lon: input.lon } : undefined, progress);
        return await enrich(buildResult(ranked, screenshots, urlsVisited), urlsVisited, progress);
      }
      // The layer writes "MAIN" for some parcels and "MAIN ST" for others; a numbered miss is
      // retried without the number so the street's parcels can be ranked by the geocode.
      if (parsed.number) {
        const r2 = await queryLayer(PARCEL, { where: clauses[0], ...common }, urlsVisited);
        if (r2 && r2.features.length > 0) {
          progress(`${r2.features.length} parcel(s) on "${parsed.street}" (number ${parsed.number} not indexed) — ranking by address and geocode`);
          const ranked = rankFeatures(r2.features, parsed, input.lat && input.lon ? { lat: input.lat, lon: input.lon } : undefined, progress);
          // Only accept a street-only match when something beyond the street name agrees.
          const best = ranked[0];
          const bestNum = getField(best.attributes, F.situsNumber);
          const inside = input.lat && input.lon ? containsPoint(best, input.lon, input.lat) : false;
          if (inside || bestNum === parsed.number) {
            return await enrich(buildResult(ranked, screenshots, urlsVisited), screenshots.length ? urlsVisited : urlsVisited, progress);
          }
          progress('No parcel on that street carries the number or contains the geocode — not guessing');
        }
      }
    }
  }

  // ── 3. The geocode — the parcel the point falls in ──────────────────
  if (input.lat && input.lon) {
    progress(`Querying Milam GIS at ${input.lat.toFixed(5)}, ${input.lon.toFixed(5)}`);
    const r = await queryLayer(PARCEL, {
      geometry: `${input.lon},${input.lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', ...common,
    }, urlsVisited);
    if (r && r.features.length > 0) {
      progress(`Geocode falls in ${r.features.length} parcel(s)`);
      return await enrich(buildResult(r.features, screenshots, urlsVisited), urlsVisited, progress);
    }
  }

  // ── 4. Owner name ──────────────────────────────────────────────────
  if (input.ownerName) {
    const name = input.ownerName.trim().toUpperCase();
    progress(`Querying Milam GIS by owner: "${name}"`);
    const r = await queryLayer(PARCEL, { where: `UPPER(${F.ownerName[0]}) LIKE ${q(name + '%')}`, ...common, resultRecordCount: '25' }, urlsVisited);
    if (r && r.features.length > 0) {
      progress(`${r.features.length} parcel(s) owned by "${name}"`);
      const ranked = input.lat && input.lon
        ? rankFeatures(r.features, { number: null, street: null, dir: null, city: null }, { lat: input.lat, lon: input.lon }, progress)
        : r.features;
      return await enrich(buildResult(ranked, screenshots, urlsVisited), urlsVisited, progress);
    }
  }

  progress('Milam GIS: no parcel matched the property ID, address, geocode or owner');
  return null;
}

// ── Survey + subdivision at the parcel ───────────────────────────────

/**
 * Read the original survey (layer 3) and the subdivision (layer 5) under the parcel's centroid and
 * put them on the result. These are facts the county's own map holds; the Bell run has to guess
 * them from the legal description.
 */
async function enrich(result: GisSearchResult, urlsVisited: string[], progress: (msg: string) => void): Promise<GisSearchResult> {
  const ring = result.parcelBoundary?.[0];
  if (!ring || ring.length === 0) return result;
  const [lon, lat] = polygonCentroid(ring);
  const pt = { geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false' };

  const survey = await queryLayer(MILAM_ENDPOINTS.gis.surveyLayer, { ...pt, outFields: '*' }, urlsVisited);
  const s = survey?.features[0]?.attributes;
  if (s) {
    const grantee = getField(s, MILAM_SURVEY_FIELD_MAP.abstractName);
    const number = getField(s, MILAM_SURVEY_FIELD_MAP.abstractNumber);
    if (grantee) result.surveyName = surveyNameFromGrantee(grantee);
    if (number && !result.abstractNumber) result.abstractNumber = number;
    const glo = getField(s, MILAM_SURVEY_FIELD_MAP.gloAcreage);
    progress(`Original survey at the parcel: ${grantee ?? '?'} (A-${number ?? '?'})${glo ? `, GLO ${glo} ac` : ''}`);
  }

  const subdiv = await queryLayer(MILAM_ENDPOINTS.gis.subdivisionLayer, { ...pt, outFields: '*' }, urlsVisited);
  const d = subdiv?.features[0]?.attributes;
  if (d) {
    const name = getField(d, MILAM_SUBDIVISION_FIELD_MAP.name);
    const code = getField(d, MILAM_SUBDIVISION_FIELD_MAP.code);
    if (name) result.subdivisionName = name;
    if (code) result.subdivisionCode = code;
    progress(`Subdivision at the parcel: ${name ?? '?'}${code ? ` (${code})` : ''}`);
  } else if (!result.subdivisionName) {
    progress('No platted subdivision at the parcel — an abstract tract');
  }
  return result;
}

/** "HERBST, F" → "F HERBST"; "DE PENA, J.A." → "J.A. DE PENA". The county files grantees surname-first. */
export function surveyNameFromGrantee(grantee: string): string {
  const [last, first] = grantee.split(',').map(s => s.trim());
  return first ? `${first} ${last}` : last;
}

// ── Result assembly ───────────────────────────────────────────────────

function summarise(feat: ArcGisFeature): GisFeatureSummary {
  const a = feat.attributes;
  return {
    propertyId: getField(a, F.propertyId),
    ownerName: getField(a, F.ownerName),
    acreage: getNumericField(a, F.acreage),
    instrumentNumber: null,
    situsAddress: composeSitusAddress(a),
    legalDescription: composeLegalDescription(a),
  };
}

function buildResult(features: ArcGisFeature[], screenshots: ScreenshotCapture[], urlsVisited: string[]): GisSearchResult {
  const primary = features[0];
  const attrs = { ...primary.attributes };
  // The run reads `rawAttributes.OBJECTID` for the map capture; on this joined layer the OID is
  // published under its table prefix.
  const oid = attrs['DBO.TaxParcels.OBJECTID'];
  if (oid !== undefined && attrs.OBJECTID === undefined) attrs.OBJECTID = oid;

  const volume = getField(attrs, F.volume);
  const page = getField(attrs, F.page);
  const deedHistory: GisDeedEntry[] = volume && page ? [{ volume, page }] : [];
  const legal = composeLegalDescription(attrs);
  const abstractSubdiv = getField(attrs, F.abstractSubdiv);

  return {
    propertyId: getField(attrs, F.propertyId),
    ownerName: getField(attrs, F.ownerName),
    legalDescription: legal,
    acreage: getNumericField(attrs, F.acreage),
    situsAddress: composeSitusAddress(attrs),
    mapId: null,
    geoId: getField(attrs, F.geoId),
    abstractSubdiv,
    // Milam cites its deeds by volume/page; there is no instrument on the layer.
    instrumentNumbers: [],
    deedHistory,
    parcelBoundary: primary.geometry?.rings ?? null,
    rawAttributes: attrs,
    allFeatures: features.map(summarise),
    screenshots,
    urlsVisited,
    abstractNumber: getField(attrs, F.abstractNumber) ?? abstractNumberFromLegal(legal),
    subdivisionCode: subdivisionCodeFromLegal(legal) ?? (abstractSubdiv?.startsWith('S') ? abstractSubdiv : null),
    mailingAddress: composeMailingAddress(attrs),
  };
}

// ── Address parsing + ranking ────────────────────────────────────────

interface ParsedSitus { number: string | null; dir: string | null; street: string | null; city: string | null }

const DIRS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
const SUFFIXES = new Set(['ST', 'STREET', 'AVE', 'AVENUE', 'RD', 'ROAD', 'DR', 'DRIVE', 'LN', 'LANE', 'BLVD', 'CT', 'COURT', 'CIR', 'CIRCLE', 'HWY', 'HIGHWAY', 'PKWY', 'TRL', 'TRAIL', 'WAY', 'PL', 'PLACE', 'LOOP']);
/** Milam's towns, for stripping the city off a one-line address. */
export const MILAM_CITIES = ['CAMERON', 'ROCKDALE', 'THORNDALE', 'MILANO', 'BUCKHOLTS', 'GAUSE', 'DAVILLA', 'BURLINGTON', 'MINERVA', 'BEN ARNOLD', 'THORNDALE', 'SHARP', 'MAYSFIELD', 'BRANCHVILLE', 'VAL VERDE', 'SAN GABRIEL', 'TRACY', 'MARLOW', 'BALDRIDGE'];

/** "309 N Travis, Cameron, TX 76520" → number 309, dir N, street TRAVIS, city CAMERON. */
export function parseSitus(address: string): ParsedSitus {
  const clean = address.toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = clean.split(' ').filter(Boolean);
  while (parts.length && /^(TX|TEXAS|\d{5}(-\d{4})?)$/.test(parts[parts.length - 1])) parts.pop();
  let city: string | null = null;
  const tail = parts.join(' ');
  for (const c of MILAM_CITIES) {
    if (tail.endsWith(' ' + c)) { city = c; parts.splice(parts.length - c.split(' ').length); break; }
  }
  let number: string | null = null;
  if (parts.length && /^\d+[A-Z]?$/.test(parts[0])) number = parts.shift()!.replace(/[A-Z]$/, '');
  let dir: string | null = null;
  if (parts.length && DIRS.has(parts[0])) dir = parts.shift()!;
  // FM/CR roads: "FM 2095" is indexed as "FM 2095"; keep the prefix and the number together.
  if (parts.length && SUFFIXES.has(parts[parts.length - 1]) && parts.length > 1) parts.pop();
  const street = parts.join(' ') || null;
  return { number, dir, street, city };
}

function pointInPolygon(px: number, py: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function containsPoint(feat: ArcGisFeature, lon: number, lat: number): boolean {
  for (const ring of feat.geometry?.rings ?? []) if (pointInPolygon(lon, lat, ring)) return true;
  return false;
}

function polygonCentroid(ring: number[][]): [number, number] {
  const n = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.length - 1 : ring.length;
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; }
  return [x / n, y / n];
}

/** Point-in-parcel wins; then number, direction, city; nearest centroid breaks ties. */
function rankFeatures(features: ArcGisFeature[], parsed: ParsedSitus, point: { lat: number; lon: number } | undefined, progress: (msg: string) => void): ArcGisFeature[] {
  if (features.length <= 1) return features;
  const scored = features.map((feat, i) => {
    const a = feat.attributes;
    let score = 0;
    const inside = point ? containsPoint(feat, point.lon, point.lat) : false;
    if (inside) score += 50;
    if (parsed.number && getField(a, F.situsNumber) === parsed.number) score += 10;
    if (parsed.dir && getField(a, F.situsStreetPrefx) === parsed.dir) score += 2;
    if (parsed.city && (getField(a, F.situsCity) ?? '').toUpperCase().startsWith(parsed.city)) score += 2;
    let dist = Infinity;
    if (point && feat.geometry?.rings?.[0]) {
      const [cx, cy] = polygonCentroid(feat.geometry.rings[0]);
      dist = (cx - point.lon) ** 2 + (cy - point.lat) ** 2;
    }
    return { feat, score, dist, i, inside, situs: composeSitusAddress(a) ?? '' };
  });
  scored.sort((x, y) => y.score - x.score || x.dist - y.dist || x.i - y.i);
  const best = scored[0];
  progress(`Parcel selection: ${getField(best.feat.attributes, F.propertyId)} "${best.situs}" (score ${best.score}${best.inside ? ', contains the geocode' : ''}) over ${scored.length - 1} other(s)`);
  return scored.map(s => s.feat);
}

// ── Adjacent + sibling lots ──────────────────────────────────────────

function envelopeOf(parcelBoundary: number[][][], buffer: number): string {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of parcelBoundary) for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return `${minLon - buffer},${minLat - buffer},${maxLon + buffer},${maxLat + buffer}`;
}

/** Every parcel within ~100 m of the subject's polygon, one result each. */
export async function findMilamAdjacentParcels(
  parcelBoundary: number[][][],
  onProgress: (p: GisScraperProgress) => void,
): Promise<GisSearchResult[]> {
  const urlsVisited: string[] = [];
  onProgress({ phase: 'GIS', message: 'Searching for adjacent parcels...', timestamp: new Date().toISOString() });
  const r = await queryLayer(PARCEL, {
    geometry: envelopeOf(parcelBoundary, 0.001), geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326', outSR: '4326', outFields: MILAM_PARCEL_OUT_FIELDS, returnGeometry: 'true',
  }, urlsVisited);
  if (!r || r.features.length === 0) return [];
  onProgress({ phase: 'GIS', message: `Found ${r.features.length} parcels in vicinity`, timestamp: new Date().toISOString() });
  const grouped = new Map<string, ArcGisFeature[]>();
  for (const feat of r.features) {
    const pid = getField(feat.attributes, F.propertyId) ?? 'unknown';
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push(feat);
  }
  return [...grouped.values()].map(fs => buildResult(fs, [], urlsVisited));
}

/**
 * The other lots of the subject's subdivision (same S-code), within ~220 m — the candidates the
 * address-to-lot resolver compares situs addresses against.
 */
export async function discoverMilamSiblingLots(
  parcelBoundary: number[][][] | null,
  targetPropertyId: string | null,
  targetLegalDesc: string | null,
  onProgress: (p: GisScraperProgress) => void,
): Promise<GisFeatureSummary[]> {
  if (!parcelBoundary || parcelBoundary.length === 0) return [];
  const progress = (msg: string) => onProgress({ phase: 'GIS', message: msg, timestamp: new Date().toISOString() });
  const urlsVisited: string[] = [];
  progress('Discovering sibling lots in subdivision area...');
  const r = await queryLayer(PARCEL, {
    geometry: envelopeOf(parcelBoundary, 0.002), geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326', outFields: MILAM_PARCEL_OUT_FIELDS, returnGeometry: 'false',
  }, urlsVisited);
  if (!r || r.features.length === 0) { progress('No sibling lots found in spatial query'); return []; }
  const targetCode = subdivisionCodeFromLegal(targetLegalDesc);
  const siblings: GisFeatureSummary[] = [];
  for (const feat of r.features) {
    const a = feat.attributes;
    const pid = getField(a, F.propertyId);
    if (pid && pid === targetPropertyId) continue;
    if (targetCode) {
      const code = getField(a, F.abstractSubdiv) ?? subdivisionCodeFromLegal(composeLegalDescription(a));
      if (code !== targetCode) continue;
    }
    siblings.push(summarise(feat));
  }
  progress(`Found ${siblings.length} sibling lot(s) in subdivision`);
  return siblings;
}
