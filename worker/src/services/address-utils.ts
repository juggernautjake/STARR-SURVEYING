// worker/src/services/address-utils.ts — Stage 0: Address Normalization
// Geocodes raw addresses via Nominatim → Census → manual parse, then generates
// multiple search variants for county CAD queries.

import type { NormalizedAddress, AddressVariant, ParsedAddress } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Road Abbreviation Maps ─────────────────────────────────────────────────

const ROAD_EXPANSIONS: Record<string, string> = {
  'Farm-to-Market Road': 'FM',
  'Farm to Market Road': 'FM',
  'State Highway': 'SH',
  'State Hwy': 'SH',
  'County Road': 'CR',
  'Ranch Road': 'RR',
  'Ranch-to-Market Road': 'RM',
  'Ranch to Market Road': 'RM',
  'US Highway': 'US',
  'Interstate': 'IH',
};

const STREET_TYPE_ABBREVS: Record<string, string> = {
  street: 'St',
  avenue: 'Ave',
  boulevard: 'Blvd',
  drive: 'Dr',
  lane: 'Ln',
  road: 'Rd',
  court: 'Ct',
  circle: 'Cir',
  place: 'Pl',
  way: 'Way',
  trail: 'Trl',
  terrace: 'Ter',
  parkway: 'Pkwy',
  highway: 'Hwy',
  loop: 'Loop',
};

const DIRECTIONAL_PREFIXES = /^(North|South|East|West|N|S|E|W)\s+/i;
const DIRECTIONAL_SUFFIXES = /\s+(North|South|East|West|N|S|E|W)$/i;

// ── Nominatim Geocoder (Layer 0A) ──────────────────────────────────────────

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    county?: string;
    country_code?: string;
  };
}

async function geocodeNominatim(address: string, logger: PipelineLogger): Promise<{
  success: boolean;
  road: string | null;
  houseNumber: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lon: number | null;
}> {
  const finish = logger.startAttempt({
    layer: 'Stage0A',
    source: 'Nominatim',
    method: 'geocode',
    input: address,
  });

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=1&countrycodes=us`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'StarrResearchPipeline/5.0 (property-research)',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      finish({ status: 'fail', error: `HTTP ${response.status}` });
      return { success: false, road: null, houseNumber: null, city: null, state: null, zip: null, lat: null, lon: null };
    }

    const results = (await response.json()) as NominatimResult[];
    if (!results.length) {
      finish({ status: 'fail', error: 'No results' });
      return { success: false, road: null, houseNumber: null, city: null, state: null, zip: null, lat: null, lon: null };
    }

    const r = results[0];
    const addr = r.address;

    finish({
      status: 'success',
      dataPointsFound: 1,
      details: `Road: ${addr.road ?? 'N/A'}, House: ${addr.house_number ?? 'N/A'}`,
    });

    return {
      success: true,
      road: addr.road ?? null,
      houseNumber: addr.house_number ?? null,
      city: addr.city ?? addr.town ?? addr.village ?? null,
      state: addr.state ?? null,
      zip: addr.postcode ?? null,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
    };
  } catch (err) {
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return { success: false, road: null, houseNumber: null, city: null, state: null, zip: null, lat: null, lon: null };
  }
}

// ── US Census Geocoder (Layer 0B) ──────────────────────────────────────────

interface CensusResult {
  result: {
    addressMatches: Array<{
      matchedAddress: string;
      coordinates: { x: number; y: number };
      addressComponents: {
        fromAddress: string;
        toAddress: string;
        preQualifier: string;
        preDirection: string;
        preType: string;
        streetName: string;
        suffixType: string;
        suffixDirection: string;
        suffixQualifier: string;
        city: string;
        state: string;
        zip: string;
      };
    }>;
  };
}

async function geocodeCensus(address: string, logger: PipelineLogger): Promise<{
  success: boolean;
  streetName: string | null;
  preDirection: string | null;
  suffixType: string | null;
  suffixDirection: string | null;
  fromAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lon: number | null;
}> {
  const finish = logger.startAttempt({
    layer: 'Stage0B',
    source: 'Census',
    method: 'geocode',
    input: address,
  });

  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      finish({ status: 'fail', error: `HTTP ${response.status}` });
      return { success: false, streetName: null, preDirection: null, suffixType: null, suffixDirection: null, fromAddress: null, city: null, state: null, zip: null, lat: null, lon: null };
    }

    const data = (await response.json()) as CensusResult;
    const matches = data.result?.addressMatches;

    if (!matches?.length) {
      finish({ status: 'fail', error: 'No address matches' });
      return { success: false, streetName: null, preDirection: null, suffixType: null, suffixDirection: null, fromAddress: null, city: null, state: null, zip: null, lat: null, lon: null };
    }

    const match = matches[0];
    const comp = match.addressComponents;

    finish({
      status: 'success',
      dataPointsFound: 1,
      details: `Street: ${comp.streetName}, Type: ${comp.suffixType}`,
    });

    return {
      success: true,
      streetName: comp.streetName || null,
      preDirection: comp.preDirection || null,
      suffixType: comp.suffixType || null,
      suffixDirection: comp.suffixDirection || null,
      fromAddress: comp.fromAddress || null,
      city: comp.city || null,
      state: comp.state || null,
      zip: comp.zip || null,
      lat: match.coordinates.y,
      lon: match.coordinates.x,
    };
  } catch (err) {
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return { success: false, streetName: null, preDirection: null, suffixType: null, suffixDirection: null, fromAddress: null, city: null, state: null, zip: null, lat: null, lon: null };
  }
}

// ── Road String Parser ─────────────────────────────────────────────────────

/**
 * Convert geocoder road output to CAD-friendly format.
 * "Farm-to-Market Road 436" → "FM 436"
 * "State Highway 195" → "SH 195"
 */
export function parseRoadString(road: string): string {
  let result = road.trim();

  // Convert long-form road names to abbreviations
  for (const [longForm, abbrev] of Object.entries(ROAD_EXPANSIONS)) {
    const re = new RegExp(longForm, 'i');
    if (re.test(result)) {
      result = result.replace(re, abbrev);
      break;
    }
  }

  return result.trim();
}

// ── Manual Address Parser (Layer 0C) ───────────────────────────────────────

/**
 * Regex-based address parser as fallback when geocoding fails.
 */
export function parseAddressManually(raw: string): ParsedAddress {
  const cleaned = raw.trim().replace(/\s+/g, ' ');

  // Match: number, street name (with possible prefix/type), unit, city, state, zip
  const fullMatch = cleaned.match(
    /^(\d+[-\w]*)\s+(.+?)(?:\s+(?:(?:Apt|Suite|Ste|Unit|#)\s*\S+))?\s*,\s*([^,]+)\s*,\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i,
  );

  if (fullMatch) {
    const [, num, street, city, state, zip] = fullMatch;

    // Separate street name from street type
    const typeMatch = street.match(
      /^(.+?)\s+(Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Circle|Cir|Place|Pl|Way|Trail|Trl|Terrace|Ter|Parkway|Pkwy|Highway|Hwy|Loop)$/i,
    );

    const unitMatch = cleaned.match(/(?:Apt|Suite|Ste|Unit|#)\s*(\S+)/i);

    return {
      streetNumber: num,
      streetName: typeMatch ? typeMatch[1] : street,
      streetType: typeMatch ? typeMatch[2] : '',
      unit: unitMatch?.[1] ?? null,
      city: city.trim(),
      state: state.toUpperCase(),
      zip: zip ?? null,
    };
  }

  // Simple fallback: just grab the number and rest
  const simpleMatch = cleaned.match(/^(\d+[-\w]*)\s+(.+)/);
  if (simpleMatch) {
    return {
      streetNumber: simpleMatch[1],
      streetName: simpleMatch[2].replace(/,.*$/, '').trim(),
      streetType: '',
      unit: null,
      city: null,
      state: null,
      zip: null,
    };
  }

  return {
    streetNumber: '',
    streetName: cleaned,
    streetType: '',
    unit: null,
    city: null,
    state: null,
    zip: null,
  };
}

// ── Directional Stripping for FM/SH/CR Roads ──────────────────────────────

/**
 * Strip directional prefixes from Texas state road names.
 * "W FM 436" → "FM 436"
 * "North SH 195" → "SH 195"
 * "FM 436 W" → "FM 436"
 */
function stripDirectionalFromRoad(streetName: string): string {
  const txRoadPattern = /^(North|South|East|West|N|S|E|W)\s+(FM|SH|CR|RR|RM|HWY|US|IH)\s+/i;
  const txRoadSuffix = /\s+(FM|SH|CR|RR|RM|HWY|US|IH)\s+(\d+)\s+(North|South|East|West|N|S|E|W)$/i;

  let result = streetName;

  // Strip leading directional before TX road type
  const leadMatch = result.match(txRoadPattern);
  if (leadMatch) {
    result = result.replace(DIRECTIONAL_PREFIXES, '');
  }

  // Strip trailing directional after TX road number
  const trailMatch = result.match(txRoadSuffix);
  if (trailMatch) {
    result = result.replace(DIRECTIONAL_SUFFIXES, '');
  }

  return result.trim();
}

// ── Variant Generation ─────────────────────────────────────────────────────

/**
 * Generate multiple search query variants from a normalized address.
 * CAD systems index addresses inconsistently, so we try multiple formats.
 */
export function generateVariants(
  streetNumber: string,
  streetName: string,
  streetType: string,
): AddressVariant[] {
  const variants: AddressVariant[] = [];
  const seen = new Set<string>();

  function add(num: string, name: string, format: string): void {
    const key = `${num}|${name}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({
      streetNumber: num,
      streetName: name,
      format,
      query: `${num} ${name}`,
    });
  }

  const stripped = stripDirectionalFromRoad(streetName);

  // 1. Exact geocoded form
  add(streetNumber, stripped, 'geocoded');

  // 2. With street type appended
  if (streetType) {
    add(streetNumber, `${stripped} ${streetType}`, 'with-type');
  }

  // 3. Without directional prefix (if different from stripped)
  const noDir = streetName.replace(DIRECTIONAL_PREFIXES, '').trim();
  if (noDir !== stripped) {
    add(streetNumber, noDir, 'no-directional');
  }

  // 4. With "RD" suffix for FM/SH/CR roads
  const fmMatch = stripped.match(/^(FM|SH|CR|RR|RM)\s+(\d+)$/i);
  if (fmMatch) {
    add(streetNumber, `${fmMatch[1]} ${fmMatch[2]} RD`, 'road-suffix');
    add(streetNumber, `${fmMatch[1]} RD ${fmMatch[2]}`, 'road-prefix');
  }

  // 5. Without trailing directional
  const noTrailingDir = streetName.replace(DIRECTIONAL_SUFFIXES, '').trim();
  if (noTrailingDir !== stripped && noTrailingDir !== streetName) {
    add(streetNumber, noTrailingDir, 'no-trailing-dir');
  }

  // 6. Raw name as fallback
  if (streetName !== stripped) {
    add(streetNumber, streetName, 'raw');
  }

  return variants;
}

// ── Main Normalize Function ────────────────────────────────────────────────

/**
 * Normalize an address through Nominatim → Census → manual parse,
 * then generate search variants for CAD queries.
 */
export async function normalizeAddress(
  rawAddress: string,
  logger: PipelineLogger,
): Promise<NormalizedAddress> {
  logger.info('Stage0', `Normalizing address: ${rawAddress}`);

  let lat: number | null = null;
  let lon: number | null = null;

  // Layer 0A: Nominatim
  const nom = await geocodeNominatim(rawAddress, logger);
  if (nom.success && nom.road && nom.houseNumber) {
    const parsedRoad = parseRoadString(nom.road);
    const parsed: ParsedAddress = {
      streetNumber: nom.houseNumber,
      streetName: parsedRoad,
      streetType: '',
      unit: null,
      city: nom.city,
      state: nom.state,
      zip: nom.zip,
    };

    lat = nom.lat;
    lon = nom.lon;

    const variants = generateVariants(parsed.streetNumber, parsed.streetName, parsed.streetType);

    return {
      raw: rawAddress,
      canonical: `${parsed.streetNumber} ${parsed.streetName}`,
      parsed,
      geocoded: true,
      source: 'nominatim',
      variants,
      lat,
      lon,
    };
  }

  // Layer 0B: Census Geocoder
  const census = await geocodeCensus(rawAddress, logger);
  if (census.success && census.streetName && census.fromAddress) {
    const streetParts = [census.preDirection, census.streetName, census.suffixType, census.suffixDirection]
      .filter(Boolean)
      .join(' ');

    const parsed: ParsedAddress = {
      streetNumber: census.fromAddress,
      streetName: parseRoadString(census.streetName),
      streetType: census.suffixType ?? '',
      unit: null,
      city: census.city,
      state: census.state,
      zip: census.zip,
    };

    lat = census.lat;
    lon = census.lon;

    const variants = generateVariants(parsed.streetNumber, parsed.streetName, parsed.streetType);

    return {
      raw: rawAddress,
      canonical: `${parsed.streetNumber} ${streetParts}`,
      parsed,
      geocoded: true,
      source: 'census',
      variants,
      lat,
      lon,
    };
  }

  // Layer 0C: Manual parse
  logger.info('Stage0C', 'Falling back to manual address parsing');
  const parsed = parseAddressManually(rawAddress);
  parsed.streetName = stripDirectionalFromRoad(parsed.streetName);

  const variants = generateVariants(parsed.streetNumber, parsed.streetName, parsed.streetType);

  return {
    raw: rawAddress,
    canonical: `${parsed.streetNumber} ${parsed.streetName}`,
    parsed,
    geocoded: false,
    source: 'manual',
    variants,
    lat: null,
    lon: null,
  };
}
