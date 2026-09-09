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
 * Adding a new county (2026-09-09, the Milam shape):
 *   1. Create worker/src/counties/{county-name}/ with a config/, the scrapers its sites need, and a
 *      module.ts that fills in `CountyModule` (counties/county-module.ts) — the shared orchestrator
 *      runs it; do NOT copy orchestrator.ts
 *   2. Export run{County}CountyResearch from its index.ts (see counties/milam/index.ts)
 *   3. Add the county to the dedicated-module arm of the switch below and to COUNTY_SPECIFIC_MODULES
 *   4. Add its address detection beside isBellCountyAddress / isMilamCountyAddress
 */

import type { PipelineInput, PipelineResult } from '../types/index.js';
import type { BellResearchResult } from './bell/types/research-result.js';
import { resolveCounty, TEXAS_COUNTIES, type CountyRecord } from '../lib/county-fips.js';
import { describeAbort } from '../research/abort-reason.js';

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
  /**
   * The address in the SEPARATE FIELDS the operator filled in (seed 624).
   *
   * `address` above is the flattened display line, and re-deriving the street name from it is what
   * `research/address-parts.ts` exists to stop: measured on 2026-09-02, the app's own format made
   * `parseAddress` return "MAIN ST, TEMPLE, TX, 76501" as a street name, which was then typed into
   * a county CAD search box that could never match it.
   *
   * Optional because projects created before the columns existed have nothing to send. Absence
   * means "fall back to parsing, and say in the log that you did".
   */
  addressParts?: import('../research/address-parts.js').AddressParts;
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
  /**
   * Free text the operator wrote about THIS property — intake notes, per-run notes, and any
   * note the attachment step left behind. The app joins those three into one string.
   *
   * ── THE CHANNEL THAT WAS ADVERTISED AND NEVER CONNECTED ──────────────────────────────────
   *
   * The create form says, under the notes box, "Sent to the AI with the run." The pipeline route
   * that starts a run carries a comment calling `operatorNotes` "the channel that already reaches
   * the AI briefing". Both were written in good faith and both were false: `operatorNotes` had
   * three occurrences in the entire worker — a type, and two places that copy it into a record of
   * what the operator SENT — and was never once put on this object, which is the only thing the
   * research code ever sees.
   *
   * So "the fence is not the line" and "seller says 2.3 acres" were typed, stored, displayed back,
   * and never read by anything that could act on them.
   *
   * `specialInstructions` above is the same defect one layer deeper: declared here, declared again
   * on the Bell input, and read only by `generateSurveyPlan`, which nothing in a run calls. It is
   * left alone rather than quietly repurposed — this field is the one the app actually sends.
   */
  operatorNotes?: string;
  /**
   * Called the moment the run knows which parcel it is researching.
   *
   * This is the whole of Phase C. The owner asked for "drawings/plats, then the overhead views,
   * then the rest of the documents", and the run did the exact inverse: imagery and the drawing
   * hunt were post-processing steps in `index.ts`, after `runCountyResearch` had returned and
   * every deed had been searched, downloaded and analysed.
   *
   * The visual work cannot simply move to the top — an aerial needs coordinates and a plat needs a
   * subdivision name — so the order is "visuals first among the things possible once the parcel is
   * known". Both paths already have that moment; neither had any way to tell a caller about it.
   *
   * Awaited by both paths. Fire-and-forget would let the deeds start immediately and restore the
   * old ordering in everything but name.
   */
  onPropertyIdentified?: import('../research/run-order.js').OnPropertyIdentified;
  /** Uploaded files */
  uploadedFiles?: Array<{ name: string; mimeType: string; content: string; isUrl?: boolean; description?: string }>;
  /** Research adjacent properties */
  includeAdjacentProperties?: boolean;
  /** Max research time (minutes) */
  maxResearchTimeMinutes?: number;
  /** Max USD for this run. Clamped to MAX_COST_CEILING_USD; 0 means free sources only. */
  maxCostUsd?: number;
  /**
   * Which half of the split pipeline this run is (plan GATHER_AND_REVIEW_SPLIT). A `gather` run finds,
   * buys and captures files ONLY — no AI reads them; the user starts the ANALYZE run afterwards from
   * the Analysis stage. Carried to the dedicated county modules, which cannot see the run settings.
   * On 2026-09-06 the Bell run spent 65 of its 76 minutes inside Phase 3 deed analysis because this
   * was never passed, and the stall watchdog then reported the whole run as a failure.
   */
  phase?: 'gather' | 'analyze';
}

// ── Unified Progress ────────────────────────────────────────────────

export interface CountyResearchProgress {
  phase: string;
  message: string;
  timestamp: string;
  /**
   * How far through THIS phase the run is, 0–100.
   *
   * Optional; absent means "unknown", which `RunProgressTracker` treats as "just entered the
   * phase". It has been declared on this interface since it was written and **nothing has ever set
   * it** — which is why the client was reduced to running regexes over the status prose to guess a
   * percentage. Setting it from a phase that knows its own denominator ("deed 12 of 40") is the
   * cheapest possible improvement to the bar.
   */
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
const COUNTY_SPECIFIC_MODULES = ['bell', 'milam'] as const;

export function hasCountySpecificModule(county: string): boolean {
  return COUNTY_SPECIFIC_MODULES.includes(
    county.toLowerCase().trim() as typeof COUNTY_SPECIFIC_MODULES[number],
  );
}

export function getCountiesWithModules(): string[] {
  return [...COUNTY_SPECIFIC_MODULES];
}

// ── Bell County Auto-Detection ──────────────────────────────────────

/**
 * Bell County cities and communities in Texas.
 * Used to auto-detect Bell County from an address string.
 */
export const BELL_COUNTY_CITIES = [
  'belton', 'killeen', 'temple', 'harker heights', 'nolanville', 'salado',
  'holland', 'rogers', 'troy', 'moody', 'bartlett', 'little river-academy',
  'little river academy', 'copperas cove', 'morgans point resort', 'moffat',
  'pendleton', 'eddy', 'heidenheimer', 'academy', 'prairie dell',
] as const;

/**
 * Bell County ZIP code ranges (Texas).
 * Covers Temple (765xx), Belton (76513), Killeen (765xx), and surrounding area.
 */
const BELL_COUNTY_ZIPS = new Set([
  '76501', '76502', '76503', '76504', '76505', '76506', '76507', '76508',
  '76513', '76517', '76520', '76522', '76523', '76524', '76525', '76526',
  '76527', '76528', '76530', '76534', '76537', '76538', '76539',
  '76540', '76541', '76542', '76543', '76544', '76545', '76546', '76547',
  '76548', '76549', '76554', '76557', '76561', '76569', '76570', '76571',
]);

/**
 * Detect whether an address string is in Bell County, TX.
 *
 * Checks for:
 *   1. Explicit "Bell County" mention
 *   2. Known Bell County city names
 *   3. Bell County ZIP codes
 *
 * This is used by the frontend to auto-populate the County field and by
 * the pipeline to ensure Bell County properties are routed correctly.
 *
 * @param address - Raw address string from user input
 * @returns `true` if the address appears to be in Bell County, TX
 */
export function isBellCountyAddress(address: string): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();

  // Explicit "Bell County" mention
  if (/\bbell\s+county\b/.test(lower)) return true;

  // Check for known Bell County cities
  for (const city of BELL_COUNTY_CITIES) {
    // Match whole word (e.g. "temple" but not "temple hills")
    const pattern = new RegExp(`\\b${city.replace(/-/g, '[-\\s]?')}\\b`);
    if (pattern.test(lower)) return true;
  }

  // Check for Bell County ZIP codes
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/g);
  if (zipMatch) {
    for (const zip of zipMatch) {
      if (BELL_COUNTY_ZIPS.has(zip.slice(0, 5))) return true;
    }
  }

  return false;
}

// ── Milam County Auto-Detection ─────────────────────────────────────

/**
 * Milam County towns. "Cameron" is deliberately NOT here: it is the county seat of Milam AND the
 * name of a county 300 miles south (Brownsville), so on its own it is ambiguous — see
 * lib/research/place-county.ts. A Cameron address is recognised by its ZIP (76520) or by
 * "Milam County" in the text.
 */
export const MILAM_COUNTY_CITIES = [
  'rockdale', 'thorndale', 'milano', 'buckholts', 'gause', 'davilla', 'burlington',
  'minerva', 'ben arnold', 'maysfield', 'branchville',
] as const;

/**
 * Milam County ZIP codes. 76523 (Davilla) is left out because Bell's set already claims it and the
 * two counties share the ZIP; an address there resolves to Bell first, as it always has.
 */
const MILAM_COUNTY_ZIPS = new Set(['76518', '76519', '76520', '76556', '76567', '76577', '76629', '77857']);

/** Detect whether an address string is in Milam County, TX. */
export function isMilamCountyAddress(address: string): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  if (/\bmilam\s+county\b/.test(lower)) return true;
  for (const city of MILAM_COUNTY_CITIES) {
    const pattern = new RegExp(`\\b${city.replace(/-/g, '[-\\s]?')}\\b`);
    if (pattern.test(lower)) return true;
  }
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/g);
  if (zipMatch) {
    for (const zip of zipMatch) {
      if (MILAM_COUNTY_ZIPS.has(zip.slice(0, 5))) return true;
    }
  }
  return false;
}

/**
 * If the county field is blank and the address looks like Bell County,
 * returns 'Bell'. Otherwise returns `null` (no auto-fill).
 *
 * This lets callers decide whether to prompt or silently populate the field.
 */
export function detectCountyFromAddress(address: string, existingCounty?: string): string | null {
  if (existingCounty && existingCounty.trim()) return null; // county already set
  if (isBellCountyAddress(address)) return 'Bell';
  if (isMilamCountyAddress(address)) return 'Milam';
  return null;
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
  signal?: AbortSignal,
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

  console.log(`[CountyRouter] ${input.projectId}: routing to county="${county}" address="${input.address ?? ''}"`);

  switch (county) {
    // ── Dedicated county modules — Bell, Milam ──────────────────────
    //
    // One arm for every county with its own module (2026-09-09). The body that used to sit here
    // named Bell nine times and would have had to be copied for Milam; it is `runDedicatedModule`
    // below, and the only county-shaped things in it are the name and the loader.
    case 'bell':
    case 'milam': {
      const dedicated: DedicatedModule = county === 'bell'
        ? { name: 'Bell', key: 'bell', load: async () => (await import('./bell/index.js')).runBellCountyResearch }
        : { name: 'Milam', key: 'milam', load: async () => (await import('./milam/index.js')).runMilamCountyResearch };
      return runDedicatedModule(dedicated, input, onProgress, signal);
    }

    // ── All Counties — Generic Pipeline ─────────────────────────────
    default: {
      onProgress({
        phase: 'Stage 0',
        message: `Stage 0: Routing to generic pipeline for ${input.county} County…`,
        timestamp: new Date().toISOString(),
      });

      console.log(`[CountyRouter] ${input.projectId}: using GENERIC pipeline for county="${county}"`);

      const { runPipeline } = await import('../services/pipeline.js');
      const { fileGenericDocumentNow } = await import('../research/file-generic-document.js');

      // Adapt CountyResearchInput → PipelineInput
      const pipelineInput: PipelineInput = {
        projectId: input.projectId,
        address: input.address ?? '',
        // Seed 624 — the generic pipeline's Stage 0 prefers these over parsing `address`.
        addressParts: input.addressParts,
        // Seed 625 — the generic path gets the starting deed too, not just Bell.
        instrumentNumber: input.instrumentNumber,
        county: input.county,
        state: input.state ?? 'TX',
        propertyId: input.propertyId,
        ownerName: input.ownerName,
        // What the operator wrote about this property. Reaches the Stage 5 synthesis prompt.
        operatorNotes: input.operatorNotes,
        // Fired at the Stage 1 / Stage 2 boundary — the generic path's identification moment.
        onPropertyIdentified: input.onPropertyIdentified,
        // ── THE STOP BUTTON REACHED ONE COUNTY OUT OF FORTY-ONE ──────────────────────────
        //
        // `runCountyResearch` has taken a signal since it was written and Bell has been given it
        // since it was written. The generic pipeline — every other routed county — was called
        // without one, so an operator pressing Cancel, and the budget ceiling firing, both had
        // nothing to abort. The run kept going until it ended on its own.
        //
        // Same shape as `operatorNotes` above: the value existed at the call site and was simply
        // not written into the object being passed.
        signal,
        // Convert uploaded files to the generic UserFile format
        userFiles: input.uploadedFiles?.map(f => ({
          filename: f.name,
          mimeType: f.mimeType,
          data: f.content,
          size: f.content.length,
          description: f.description,
        })),
        // B2 — file each document the moment it is found, not in a batch when the run ends.
        //
        // The Bell orchestrator has done this since it was written; the generic pipeline, which
        // serves every other routed county, accumulated everything and let the caller delete and
        // bulk-insert at the end. Same product, opposite behaviour, and only one of them was
        // guarded.
        //
        // Deliberately not awaited: filing is a side effect of finding, and a slow write must not
        // pace the research. `fileGenericDocumentNow` never throws, and a document it cannot write
        // is counted and explained by the run's filing tally rather than lost silently.
        onDocument: (doc) => { void fileGenericDocumentNow(input.projectId, doc); },
      };

      // The generic pipeline calls updateStatus() which writes research_message to
      // Supabase. The worker's /research/status/:id endpoint reads that value and
      // forwards it as `message` to the frontend so PipelineProgressPanel shows
      // accurate stage labels. We emit a final progress event when the pipeline
      // completes or fails so activePipelines.currentStage stays up to date.
      let result;
      try {
        result = await runPipeline(pipelineInput);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // ── AN EXPECTED STOP IS NOT A CRASH ────────────────────────────────────────────────
        //
        // The same distinction the Bell branch above draws, on the path that serves the other
        // forty counties. Until this slice the generic pipeline could not be stopped at all, so
        // the branch had nothing to distinguish; now that it can, a run that ended where its
        // operator or its budget told it to must not be announced as a failure.
        const abort = signal?.aborted
          ? describeAbort((signal as AbortSignal & { reason?: unknown }).reason)
          : null;
        const expected = abort?.isExpected === true;
        if (expected) {
          console.log(`[CountyRouter] ${input.projectId}: generic pipeline stopped early — ${abort!.message}`);
        } else {
          console.error(`[CountyRouter] ${input.projectId}: generic pipeline CRASHED — ${errMsg.slice(0, 200)}`);
        }
        onProgress({
          phase: expected ? 'Stopped' : 'Failed',
          message: expected ? abort!.message : `Pipeline failed: ${errMsg}`,
          timestamp: new Date().toISOString(),
        });
        throw err;
      }

      console.log(
        `[CountyRouter] ${input.projectId}: generic pipeline DONE — status=${result.status} docs=${result.documents?.length ?? 0}`,
      );

      onProgress({
        phase: result.status === 'failed' ? 'Failed' : 'Complete',
        message: `Pipeline ${result.status}: ${result.ownerName ?? input.address ?? ''}`,
        timestamp: new Date().toISOString(),
      });

      return {
        resultType: 'generic-pipeline',
        county: input.county,
        data: result,
      };
    }
  }
}

// ── Dedicated module runner ─────────────────────────────────────────

/** The entry point every dedicated county module exports — Bell's shape, which Milam shares. */
type DedicatedRunner = (
  input: import('./bell/types/research-input.js').BellResearchInput,
  onProgress: (p: CountyResearchProgress) => void,
  signal?: AbortSignal,
) => Promise<BellResearchResult>;

interface DedicatedModule {
  /** "Bell", "Milam" — the word the log and the result carry. */
  name: string;
  /** 'bell', 'milam' — the registry key. */
  key: string;
  /** Loads the module's entry point (dynamic, so a county's code is only loaded for its runs). */
  load: () => Promise<DedicatedRunner>;
}

/**
 * Run a dedicated county module and map every way it can end — done, stopped at a ceiling, stopped by
 * the operator, crashed — onto the unified result. This is the Bell dispatch arm of 2026-09-03..08,
 * with the county as a parameter.
 */
async function runDedicatedModule(
  module: DedicatedModule,
  input: CountyResearchInput,
  onProgress: (p: CountyResearchProgress) => void,
  signal?: AbortSignal,
): Promise<UnifiedResearchResult> {
  onProgress({
    phase: 'Router',
    message: `Routing to ${module.name} County dedicated research module`,
    timestamp: new Date().toISOString(),
  });
  let bellResult;
  try {
    const run = await module.load();
    bellResult = await run(
      {
        projectId: input.projectId,
        address: input.address,
        // Seed 624. Without this line the parts reach the router and stop there — the shape of
        // defect this codebase keeps finding: a value carried to the door and left on the step.
        addressParts: input.addressParts,
        propertyId: input.propertyId,
        ownerName: input.ownerName,
        instrumentNumber: input.instrumentNumber,
        surveyType: input.surveyType as import('./bell/types/research-input.js').SurveyType | undefined,
        jobPurpose: input.jobPurpose,
        specialInstructions: input.specialInstructions,
        // What the operator wrote. Reaches the deed-summary prompt via the orchestrator.
        operatorNotes: input.operatorNotes,
        // Fired at "Phase 1 complete", before the clerk search that ate 163 minutes.
        onPropertyIdentified: input.onPropertyIdentified,
        uploadedFiles: input.uploadedFiles,
        includeAdjacentProperties: input.includeAdjacentProperties,
        maxResearchTimeMinutes: input.maxResearchTimeMinutes,
        maxCostUsd: input.maxCostUsd,
        // A gather run must not read the deeds with AI — that is the separate ANALYZE run.
        phase: input.phase,
      },
      onProgress,
      signal,
    );
  } catch (err) {
    const errMsg = err instanceof Error
      ? (err.message || `${err.constructor?.name ?? 'Error'}: (no message)`)
      : String(err ?? 'Unknown error');
    // ── AN EXPECTED STOP IS NOT A CRASH ────────────────────────────────────────────────
    //
    // This reported `phase: 'Failed'` and "Bell County pipeline error: ..." for ANY throw,
    // including the AbortError the BUDGET raises when a run reaches the ceiling the operator
    // set. On 2026-09-03 that produced a run row carrying `status: "complete"` beside
    // `phase: "Failed"` and a message beginning "pipeline error" — three fields describing
    // one ordinary early finish, disagreeing with each other.
    //
    // `signal.reason` now says which kind of stop this was, so the phase can match it.
    const abort = signal?.aborted ? describeAbort((signal as AbortSignal & { reason?: unknown }).reason) : null;
    const expected = abort?.isExpected === true;
    if (expected) {
      console.log(`[CountyRouter] ${input.projectId}: ${module.name} County stopped early — ${abort!.message}`);
    } else {
      console.error(`[CountyRouter] ${input.projectId}: ${module.name} County CRASHED — ${errMsg.slice(0, 200)}`);
    }
    onProgress({
      phase: expected ? 'Stopped' : 'Failed',
      message: expected ? abort!.message : `${module.name} County pipeline error: ${errMsg}`,
      timestamp: new Date().toISOString(),
    });
    // Return a structured failed result rather than re-throwing, so the
    // caller always receives a typed UnifiedResearchResult and the error is
    // surfaced cleanly in the UI (failureReason banner + log entry).
    // ── A BUDGET STOP IS A PARTIAL RESULT, NOT A FAILED ONE ────────────────────────────
    //
    // This stub carried `status: 'failed'` and "Bell County research failed: …" for an
    // expected stop too, so a Bell run that finished at the operator's own ceiling reached
    // index.ts as a failure: describeRunOutcome said "Research Found Nothing", the project
    // never moved to review, and the deeds it had filed sat behind a red banner. The
    // orchestrator's accumulated result is still discarded on this path (it throws rather
    // than returning) — that is the remaining half, recorded in the plan.
    // A stall stop is a partial too: the watchdog's own message promises "everything it already
    // retrieved is kept", and on 2026-09-06 the same stop was reported as "found no documents".
    const budgetStop = expected && (abort?.kind === 'budget' || abort?.kind === 'stall');
    const failedResult: PipelineResult = {
      projectId: input.projectId,
      status: budgetStop ? 'partial' : 'failed',
      stopReason: budgetStop ? 'budget_reached' : expected ? 'cancelled_by_user' : 'error',
      propertyId: null,
      geoId: null,
      ownerName: null,
      legalDescription: null,
      acreage: null,
      documents: [],
      boundary: null,
      validation: null,
      log: [{
        layer: 'Pipeline',
        source: budgetStop ? 'budget' : expected ? 'cancelled' : 'crash',
        method: budgetStop ? 'budget-ceiling' : expected ? 'user-cancel' : `${module.key}-county-crash`,
        input: input.address ?? '',
        status: budgetStop ? 'skip' : 'fail',
        duration_ms: 0,
        dataPointsFound: 0,
        error: errMsg,
        timestamp: new Date().toISOString(),
      }],
      duration_ms: 0,
      failureReason: budgetStop ? undefined : expected ? errMsg : `${module.name} County research failed: ${errMsg}`,
    };
    return { resultType: 'generic-pipeline', county: module.name, data: failedResult };
  }
  console.log(
    `[CountyRouter] ${input.projectId}: ${module.name} County DONE — owner="${bellResult.property?.ownerName ?? ''}" confidence=${bellResult.overallConfidence?.tier ?? 'n/a'}`,
  );
  return { resultType: 'county-specific', county: module.name, data: bellResult };
}
