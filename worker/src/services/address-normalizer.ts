// worker/src/services/address-normalizer.ts
// Stage 1A: Address parsing, variant generation, and geocoding.
//
// Exports three independent functions that the discovery engine consumes:
//   parseAddress()            — split raw string into structured components
//   generateAddressVariants() — produce ordered list of CAD search strings
//   geocodeAddress()          — resolve lat/lon + county FIPS via Census/Nominatim

import { lookupCountyFIPS } from '../lib/county-fips.js';

// Re-export for consumers that import all address utilities from a single module
export { lookupCountyFIPS } from '../lib/county-fips.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ParsedAddress {
  streetNumber: string;
  streetName: string;
  streetSuffix?: string;
  unitType?: string;
  unitNumber?: string;
  city: string;
  state: string;
  zip?: string;
  county?: string;
  rawInput: string;
}

export interface GeocodedAddress extends ParsedAddress {
  latitude: number;
  longitude: number;
  countyFIPS: string;
  countyName: string;
  formattedAddress: string;
}

export interface AddressVariant {
  searchString: string;
  strategy: string;
  priority: number;  // 1 = try first
}

// ── Road prefix / suffix tables ───────────────────────────────────────────────

// Texas road prefixes that may or may not be in CAD index
const TX_ROAD_PREFIXES: Record<string, string[]> = {
  'FM':   ['FM', ''],
  'RM':   ['RM', ''],
  'CR':   ['CR', 'COUNTY ROAD', 'COUNTY RD'],
  'SH':   ['SH', 'STATE HWY', 'STATE HIGHWAY'],
  'US':   ['US', 'US HWY', 'US HIGHWAY', 'HIGHWAY'],
  'IH':   ['IH', 'I', 'INTERSTATE', 'I-'],
  'PR':   ['PR', 'PARK RD', 'PARK ROAD'],
  'SPUR': ['SPUR', 'SP'],
  'LOOP': ['LOOP', 'LP'],
  'BUS':  ['BUS', 'BUSINESS'],
};

const STREET_SUFFIX_MAP: Record<string, string[]> = {
  'DR':   ['DR', 'DRIVE'],
  'ST':   ['ST', 'STREET'],
  'AVE':  ['AVE', 'AVENUE'],
  'BLVD': ['BLVD', 'BOULEVARD'],
  'LN':   ['LN', 'LANE'],
  'CT':   ['CT', 'COURT'],
  'CIR':  ['CIR', 'CIRCLE'],
  'PL':   ['PL', 'PLACE'],
  'WAY':  ['WAY'],
  'TRL':  ['TRL', 'TRAIL'],
  'RD':   ['RD', 'ROAD'],
  'PKWY': ['PKWY', 'PARKWAY'],
  'HWY':  ['HWY', 'HIGHWAY'],
};

const DIRECTIONAL_MAP: Record<string, string[]> = {
  'N':  ['N', 'NORTH'],
  'S':  ['S', 'SOUTH'],
  'E':  ['E', 'EAST'],
  'W':  ['W', 'WEST'],
  'NE': ['NE', 'NORTHEAST'],
  'NW': ['NW', 'NORTHWEST'],
  'SE': ['SE', 'SOUTHEAST'],
  'SW': ['SW', 'SOUTHWEST'],
};

// ── parseAddress ──────────────────────────────────────────────────────────────

export function parseAddress(rawAddress: string): ParsedAddress {
  const cleaned = rawAddress.trim().replace(/\s+/g, ' ').toUpperCase();

  // Pattern: {number} {street} {suffix?}, {city}, {state} {zip?}
  const fullPattern = /^(\d+[A-Z]?)\s+(.+?)(?:\s+(SUITE|STE|APT|UNIT|LOT|SPACE|#)\s*(\S+))?\s*,\s*(.+?)\s*,\s*(TX|TEXAS)\s*(\d{5}(?:-\d{4})?)?$/i;
  const match = cleaned.match(fullPattern);

  if (match) {
    return {
      streetNumber: match[1],
      streetName:   match[2].trim(),
      unitType:     match[3] || undefined,
      unitNumber:   match[4] || undefined,
      city:         match[5].trim(),
      state:        'TX',
      zip:          match[7] || undefined,
      rawInput:     rawAddress,
    };
  }

  // Simpler pattern without city/state
  const simplePattern = /^(\d+[A-Z]?)\s+(.+?)$/i;
  const simpleMatch = cleaned.match(simplePattern);
  if (simpleMatch) {
    return {
      streetNumber: simpleMatch[1],
      streetName:   simpleMatch[2].trim(),
      city:         '',
      state:        'TX',
      rawInput:     rawAddress,
    };
  }

  // Return as-is if unparseable
  return {
    streetNumber: '',
    streetName:   cleaned,
    city:         '',
    state:        'TX',
    rawInput:     rawAddress,
  };
}

// ── generateAddressVariants ───────────────────────────────────────────────────

export function generateAddressVariants(parsed: ParsedAddress): AddressVariant[] {
  const variants: AddressVariant[] = [];
  let priority = 1;

  const streetParts = parsed.streetName.split(' ');

  // Detect if this is a Texas highway address
  const firstWord = streetParts[0];
  const txPrefixes = TX_ROAD_PREFIXES[firstWord as keyof typeof TX_ROAD_PREFIXES];

  if (txPrefixes) {
    // It's a Texas highway — generate variants with/without prefix
    const highwayNumber = streetParts.slice(1).join(' ');

    for (const prefix of txPrefixes) {
      const street = prefix ? `${prefix} ${highwayNumber}` : highwayNumber;
      variants.push({
        searchString: `${parsed.streetNumber} ${street}`.trim(),
        strategy:     `highway_variant_${prefix || 'bare'}`,
        priority:     priority++,
      });
    }
  } else {
    // Regular street address

    // Variant 1: As-entered
    variants.push({
      searchString: `${parsed.streetNumber} ${parsed.streetName}`,
      strategy:     'as_entered',
      priority:     priority++,
    });

    // Variant 2: Without directional prefix / with alternate directional form
    for (const [abbr, forms] of Object.entries(DIRECTIONAL_MAP)) {
      for (const form of forms) {
        if (parsed.streetName.startsWith(form + ' ')) {
          const withoutDir = parsed.streetName.replace(new RegExp(`^${form}\\s+`, 'i'), '');
          variants.push({
            searchString: `${parsed.streetNumber} ${withoutDir}`,
            strategy:     `strip_directional_${abbr}`,
            priority:     priority++,
          });
          // Also try the other form of the same directional
          for (const altForm of forms) {
            if (altForm !== form) {
              variants.push({
                searchString: `${parsed.streetNumber} ${altForm} ${withoutDir}`,
                strategy:     `alt_directional_${altForm}`,
                priority:     priority++,
              });
            }
          }
        }
      }
    }

    // Variant 3: Suffix variations (DR ↔ DRIVE, etc.)
    for (const [, forms] of Object.entries(STREET_SUFFIX_MAP)) {
      for (const form of forms) {
        if (parsed.streetName.endsWith(' ' + form)) {
          const baseName = parsed.streetName.slice(0, -(form.length + 1));
          for (const altForm of forms) {
            if (altForm !== form) {
              variants.push({
                searchString: `${parsed.streetNumber} ${baseName} ${altForm}`,
                strategy:     `suffix_variant_${altForm}`,
                priority:     priority++,
              });
            }
          }
          // Also try without suffix entirely
          variants.push({
            searchString: `${parsed.streetNumber} ${baseName}`,
            strategy:     'strip_suffix',
            priority:     priority++,
          });
        }
      }
    }
  }

  // Street number only (broadest possible search — last resort)
  variants.push({
    searchString: parsed.streetNumber,
    strategy:     'number_only',
    priority:     99,
  });

  // De-duplicate and sort by priority
  const seen = new Set<string>();
  return variants
    .filter(v => {
      const key = v.searchString.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.priority - b.priority);
}

// ── geocodeAddress ────────────────────────────────────────────────────────────

export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  const parsed = parseAddress(address);

  // Try Census Bureau Geocoder first (free, no API key needed, US-specific)
  try {
    const encodedAddr = encodeURIComponent(address);
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodedAddr}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

    const response = await fetch(censusUrl, { signal: AbortSignal.timeout(10000) });
    const data = await response.json() as {
      result?: {
        addressMatches?: Array<{
          coordinates: { x: string; y: string };
          matchedAddress: string;
          geographies?: { Counties?: Array<{ GEOID: string; NAME: string }> };
        }>;
      };
    };

    const match = data?.result?.addressMatches?.[0];
    if (match) {
      const county = match.geographies?.Counties?.[0];
      return {
        ...parsed,
        latitude:         parseFloat(match.coordinates.y),
        longitude:        parseFloat(match.coordinates.x),
        countyFIPS:       county?.GEOID ?? '',
        countyName:       county?.NAME ?? '',
        formattedAddress: match.matchedAddress,
      };
    }
  } catch (e) {
    console.warn('Census geocoder failed:', e);
  }

  // Fallback: Nominatim (OpenStreetMap)
  try {
    const encodedAddr = encodeURIComponent(address);
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodedAddr}&format=json&addressdetails=1&countrycodes=us&limit=1`;

    const response = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'StarrSoftware/1.0 (property-research)' },
      signal:  AbortSignal.timeout(10000),
    });
    const data = await response.json() as Array<{
      lat: string;
      lon: string;
      display_name: string;
      address?: { county?: string };
    }>;

    if (data?.length > 0) {
      const result = data[0];
      const rawCounty = result.address?.county?.replace(/ County$/i, '') ?? '';

      // Resolve FIPS from the county name using the shared lookup
      const fips = lookupCountyFIPS(rawCounty, 'TX');

      return {
        ...parsed,
        latitude:         parseFloat(result.lat),
        longitude:        parseFloat(result.lon),
        countyFIPS:       fips,
        countyName:       rawCounty.toUpperCase(),
        formattedAddress: result.display_name,
      };
    }
  } catch (e) {
    console.warn('Nominatim geocoder failed:', e);
  }

  return null;
}
