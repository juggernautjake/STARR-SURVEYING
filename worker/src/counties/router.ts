/**
 * County Router — Unified Entry Point
 *
 * This is the single entry point for ALL property research in Texas.
 * The user provides property information (address, county, etc.),
 * and this router determines which county-specific code to execute.
 *
 * Flow:
 *   1. User submits property info (any Texas county)
 *   2. Router normalizes the county name
 *   3. If county has dedicated code (e.g., Bell) → route to that module
 *   4. Otherwise → fall back to the generic pipeline (pipeline.ts)
 *
 * Adding a new county:
 *   1. Create worker/src/counties/{county-name}/ folder
 *   2. Implement the orchestrator following Bell County's pattern
 *   3. Add a case to the switch statement below
 *   4. Add the county name to COUNTY_SPECIFIC_MODULES
 */

import type { PipelineInput, PipelineResult } from '../types/index.js';
import type { BellResearchResult } from './bell/types/research-result';
import { resolveCounty, TEXAS_COUNTIES, type CountyRecord } from '../lib/county-fips.js';

// ── Unified Input ───────────────────────────────────────────────────

export interface CountyResearchInput {
  /** County name (e.g., "Bell", "Williamson", "Travis") — REQUIRED */
  county: string;
  /** State (defaults to "TX") */
  state?: string;
  /** Supabase project ID */
  projectId: string;
  /** Property address — REQUIRED */
  address?: string;
  /** CAD property ID */
  propertyId?: string;
  /** Owner name */
  ownerName?: string;
  /** Instrument number */
  instrumentNumber?: string;
  /** Survey type */
  surveyType?: string;
  /** Job purpose */
  jobPurpose?: string;
  /** Special instructions */
  specialInstructions?: string;
  /** Uploaded files */
  uploadedFiles?: Array<{ name: string; mimeType: string; content: string; isUrl?: boolean; description?: string }>;
  /** Research adjacent properties */
  includeAdjacentProperties?: boolean;
  /** Max research time (minutes) */
  maxResearchTimeMinutes?: number;
}

// ── Unified Progress ────────────────────────────────────────────────

export interface CountyResearchProgress {
  phase: string;
  message: string;
  timestamp: string;
  pct?: number;
}

// ── Unified Result ──────────────────────────────────────────────────
//
// Discriminated union: the frontend checks `resultType` to know
// which shape of data it received.

export interface CountySpecificResult {
  resultType: 'county-specific';
  county: string;
  /** The full county-specific result (e.g., BellResearchResult) */
  data: BellResearchResult; // Union with other county result types as they're added
}

export interface GenericPipelineResult {
  resultType: 'generic-pipeline';
  county: string;
  /** The generic pipeline result */
  data: PipelineResult;
}

export type UnifiedResearchResult = CountySpecificResult | GenericPipelineResult;

// ── County Module Registry ──────────────────────────────────────────

/**
 * Counties with dedicated research modules.
 * These get full county-specific scraping, analysis, and reporting.
 */
const COUNTY_SPECIFIC_MODULES = ['bell'] as const;

export function hasCountySpecificModule(county: string): boolean {
  return COUNTY_SPECIFIC_MODULES.includes(
    county.toLowerCase().trim() as typeof COUNTY_SPECIFIC_MODULES[number],
  );
}

export function getCountiesWithModules(): string[] {
  return [...COUNTY_SPECIFIC_MODULES];
}

// ── Address/County Validation ────────────────────────────────────────

export interface AddressCountyMismatchError {
  code: 'ADDRESS_COUNTY_MISMATCH';
  message: string;
  /** The county the user provided */
  providedCounty: string;
  /** The county detected from geocoding the address */
  detectedCounty: string;
  /** Suggested counties (detected county first, then nearby matches) */
  suggestedCounties: string[];
}

export interface ValidationError {
  code: 'MISSING_ADDRESS' | 'MISSING_COUNTY' | 'INVALID_COUNTY' | 'GEOCODE_FAILED' | 'ADDRESS_COUNTY_MISMATCH';
  message: string;
  suggestedCounties?: string[];
  providedCounty?: string;
  detectedCounty?: string;
}

/**
 * Validate that the address and county match before starting the pipeline.
 *
 * Geocodes the address, reverse-geocodes to detect the actual county,
 * and compares against what the user provided. Returns null if valid,
 * or a ValidationError if there's a problem.
 */
export async function validateAddressCounty(
  address: string,
  county: string,
): Promise<ValidationError | null> {
  if (!address || !address.trim()) {
    return { code: 'MISSING_ADDRESS', message: 'Property address is required.' };
  }
  if (!county || !county.trim()) {
    return { code: 'MISSING_COUNTY', message: 'County is required.' };
  }

  // Validate county name against the 254 Texas counties
  const resolvedCounty = resolveCounty(county);
  if (!resolvedCounty) {
    // Try fuzzy match to suggest corrections
    const normalized = county.toLowerCase().replace(/\s*county\s*/i, '').trim();
    const suggestions = TEXAS_COUNTIES
      .filter(c => c.key.startsWith(normalized.slice(0, 3)) || c.name.toLowerCase().includes(normalized))
      .map(c => c.name)
      .slice(0, 5);
    return {
      code: 'INVALID_COUNTY',
      message: `"${county}" is not a recognized Texas county.${suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : ''}`,
      suggestedCounties: suggestions,
    };
  }

  // Geocode the address to get coordinates
  const coords = await geocodeForValidation(address);
  if (!coords) {
    // Can't geocode — allow the pipeline to proceed (it has its own geocoding)
    // but log a warning. We don't block on geocode failure since the address
    // might still be valid but just not in the geocoder's database yet.
    return null;
  }

  // Reverse-geocode to detect which county the coordinates fall in
  const detectedCounty = await reverseGeocodeCounty(coords.lat, coords.lon);
  if (!detectedCounty) {
    // Reverse geocode failed — don't block, let the pipeline try
    return null;
  }

  // Compare: normalize both to lowercase for comparison
  const providedKey = resolvedCounty.key;
  const detectedKey = detectedCounty.key;

  if (providedKey === detectedKey) {
    return null; // Match — all good
  }

  // Mismatch — build helpful error
  return {
    code: 'ADDRESS_COUNTY_MISMATCH',
    message:
      `The address "${address}" is located in ${detectedCounty.name} County, ` +
      `but you selected ${resolvedCounty.name} County. ` +
      `Please verify the address or select ${detectedCounty.name} County.`,
    providedCounty: resolvedCounty.name,
    detectedCounty: detectedCounty.name,
    suggestedCounties: [detectedCounty.name],
  };
}

// ── Geocoding helpers (for validation only) ─────────────────────────

async function geocodeForValidation(address: string): Promise<{ lat: number; lon: number } | null> {
  // Try Census geocoder first (US-only, fast, free)
  try {
    const params = new URLSearchParams({
      address,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (resp.ok) {
      const data = await resp.json() as {
        result?: { addressMatches?: Array<{ coordinates: { y: number; x: number } }> };
      };
      const match = data.result?.addressMatches?.[0];
      if (match) return { lat: match.coordinates.y, lon: match.coordinates.x };
    }
  } catch { /* Census geocoder failed */ }

  // Nominatim fallback
  try {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      countrycodes: 'us',
    });
    const url = `https://nominatim.openstreetmap.org/search?${params}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'STARR-SURVEYING/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) {
      const data = await resp.json() as Array<{ lat: string; lon: string }>;
      if (data.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch { /* Nominatim failed */ }

  return null;
}

async function reverseGeocodeCounty(lat: number, lon: number): Promise<CountyRecord | null> {
  // Use Census geocoder reverse (returns county directly)
  try {
    const params = new URLSearchParams({
      x: lon.toString(),
      y: lat.toString(),
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      layers: 'Counties',
      format: 'json',
    });
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?${params}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (resp.ok) {
      const data = await resp.json() as {
        result?: {
          geographies?: {
            Counties?: Array<{ GEOID?: string; NAME?: string; STATE?: string }>;
          };
        };
      };
      const countyGeo = data.result?.geographies?.Counties?.[0];
      if (countyGeo) {
        // GEOID is the full FIPS (state + county), e.g., "48027" for Bell County
        if (countyGeo.GEOID) {
          const record = resolveCounty(countyGeo.GEOID);
          if (record) return record;
        }
        // Fall back to name matching
        if (countyGeo.NAME) {
          const record = resolveCounty(countyGeo.NAME);
          if (record) return record;
        }
      }
    }
  } catch { /* Census reverse geocoder failed */ }

  // Nominatim reverse fallback
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      format: 'json',
      zoom: '10', // County level
    });
    const url = `https://nominatim.openstreetmap.org/reverse?${params}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'STARR-SURVEYING/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) {
      const data = await resp.json() as {
        address?: { county?: string };
      };
      if (data.address?.county) {
        // Nominatim returns "Bell County" — strip " County" suffix
        const name = data.address.county.replace(/\s+county$/i, '').trim();
        const record = resolveCounty(name);
        if (record) return record;
      }
    }
  } catch { /* Nominatim reverse failed */ }

  return null;
}

// ── Router ──────────────────────────────────────────────────────────

/**
 * Route a research request to the correct county module.
 *
 * This is the ONLY function that should be called to start property research.
 * It handles both county-specific and generic pipeline execution.
 *
 * @param input - User-provided property information (any Texas county)
 * @param onProgress - Real-time progress callback (drives the UI log)
 * @returns Unified result with discriminated `resultType` field
 */
export async function runCountyResearch(
  input: CountyResearchInput,
  onProgress: (p: CountyResearchProgress) => void,
): Promise<UnifiedResearchResult> {
  // ── Validate address + county match before doing any work ────────
  if (input.address) {
    onProgress({
      phase: 'Validation',
      message: 'Verifying address and county match...',
      timestamp: new Date().toISOString(),
    });

    const validationError = await validateAddressCounty(input.address, input.county);
    if (validationError) {
      // Return a failed result with the validation error details
      const failedResult: PipelineResult = {
        projectId: input.projectId,
        status: 'failed',
        propertyId: null,
        geoId: null,
        ownerName: null,
        legalDescription: null,
        acreage: null,
        documents: [],
        boundary: null,
        validation: null,
        log: [{
          layer: 'Validation',
          source: 'address-county-check',
          method: 'geocode',
          input: `${input.address} / ${input.county}`,
          status: 'fail',
          duration_ms: 0,
          dataPointsFound: 0,
          error: validationError.message,
          timestamp: new Date().toISOString(),
        }],
        duration_ms: 0,
        failureReason: validationError.message,
      };

      onProgress({
        phase: 'Validation',
        message: `STOPPED: ${validationError.message}`,
        timestamp: new Date().toISOString(),
      });

      return {
        resultType: 'generic-pipeline',
        county: input.county,
        data: failedResult,
      };
    }

    onProgress({
      phase: 'Validation',
      message: 'Address and county verified — proceeding',
      timestamp: new Date().toISOString(),
    });
  }

  const county = input.county.toLowerCase().trim();

  switch (county) {
    // ── Bell County — Dedicated module (disabled for now) ───────────
    // The Bell County module in ./bell/ is preserved and ready to enable.
    // To activate it, uncomment the case below:
    //
    // case 'bell': {
    //   onProgress({
    //     phase: 'Router',
    //     message: `Routing to Bell County dedicated research module`,
    //     timestamp: new Date().toISOString(),
    //   });
    //   const { runBellCountyResearch } = await import('./bell/index.js');
    //   const result = await runBellCountyResearch(
    //     {
    //       projectId: input.projectId,
    //       address: input.address,
    //       propertyId: input.propertyId,
    //       ownerName: input.ownerName,
    //       instrumentNumber: input.instrumentNumber,
    //       surveyType: input.surveyType as import('./bell/types/research-input').SurveyType | undefined,
    //       jobPurpose: input.jobPurpose,
    //       specialInstructions: input.specialInstructions,
    //       uploadedFiles: input.uploadedFiles,
    //       includeAdjacentProperties: input.includeAdjacentProperties,
    //       maxResearchTimeMinutes: input.maxResearchTimeMinutes,
    //     },
    //     onProgress,
    //   );
    //   return { resultType: 'county-specific', county: 'Bell', data: result };
    // }

    // ── All Counties — Generic Pipeline ─────────────────────────────
    default: {
      onProgress({
        phase: 'Router',
        message: `No dedicated module for ${input.county} — using generic pipeline`,
        timestamp: new Date().toISOString(),
      });

      const { runPipeline } = await import('../services/pipeline.js');

      // Adapt CountyResearchInput → PipelineInput
      const pipelineInput: PipelineInput = {
        projectId: input.projectId,
        address: input.address ?? '',
        county: input.county,
        state: input.state ?? 'TX',
        propertyId: input.propertyId,
        ownerName: input.ownerName,
        // Convert uploaded files to the generic UserFile format
        userFiles: input.uploadedFiles?.map(f => ({
          filename: f.name,
          mimeType: f.mimeType,
          data: f.content,
          size: f.content.length,
          description: f.description,
        })),
      };

      // Bridge progress: convert PipelineLogger events to CountyResearchProgress
      // The generic pipeline uses its own internal logging, so we emit stage
      // transitions via the onProgress callback by wrapping the pipeline call.
      const result = await runPipeline(pipelineInput);

      return {
        resultType: 'generic-pipeline',
        county: input.county,
        data: result,
      };
    }
  }
}
