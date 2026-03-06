// worker/src/services/property-discovery.ts
// Phase 1: PropertyDiscoveryEngine — main orchestrator tying together
// geocoding, CAD detection, adapter selection, and property detail enrichment.
//
// POST /research/discover → DiscoveryResult
//
// Steps:
//   1. Geocode address → county FIPS
//   2. Look up CAD config → select adapter
//   3. Search CAD for the property (multiple address variants)
//   4. Fetch full property detail for best match
//   5. Cross-validate and return
//
// Spec §1.6

import {
  parseAddress,
  generateAddressVariants,
  geocodeAddress,
  lookupCountyFIPS,
} from './address-normalizer.js';
import { getCADConfig, buildDetailUrl } from './cad-registry.js';
import type { CADConfig } from './cad-registry.js';
import { BISAdapter }            from '../adapters/bis-adapter.js';
import { TylerAdapter }          from '../adapters/tyler-adapter.js';
import { TrueAutomationAdapter } from '../adapters/trueautomation-adapter.js';
import { HCADAdapter }           from '../adapters/hcad-adapter.js';
import { TADAdapter }            from '../adapters/tad-adapter.js';
import { GenericCADAdapter }     from '../adapters/generic-cad-adapter.js';
import type { CADAdapter, PropertyDetail, PropertySearchResult } from '../adapters/cad-adapter.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface SourceLog {
  name:       string;
  url:        string;
  method:     string;
  success:    boolean;
  durationMs: number;
}

/** Full output of POST /research/discover */
export interface DiscoveryResult {
  status:        'complete' | 'partial' | 'failed';
  property:      (PropertyDetail & { county: string; countyFIPS: string; cadSystem: string }) | null;
  searchResults: PropertySearchResult[];
  sources:       SourceLog[];
  timing:        Record<string, number>;
  errors:        string[];
  warnings:      string[];
}

// ── PropertyDiscoveryEngine ───────────────────────────────────────────────────

export class PropertyDiscoveryEngine {
  private adapter:  CADAdapter | null = null;
  private sources:  SourceLog[]       = [];
  private timing:   Record<string, number> = {};
  private errors:   string[]          = [];
  private warnings: string[]          = [];

  async discover(
    address: string,
    county?: string,
    state  = 'TX',
  ): Promise<DiscoveryResult> {
    const startTime = Date.now();

    try {
      // ── STEP 1: Geocode and resolve county FIPS ────────────────────────────

      const t1 = Date.now();
      const geocoded = await geocodeAddress(address);
      this.timing.geocode = Date.now() - t1;

      let countyFIPS: string;
      let countyName: string;

      if (geocoded?.countyFIPS) {
        countyFIPS = geocoded.countyFIPS;
        countyName = geocoded.countyName;
        this.sources.push({
          name:       'Census Bureau Geocoder',
          url:        'geocoding.geo.census.gov',
          method:     'http_api',
          success:    true,
          durationMs: this.timing.geocode,
        });
      } else if (county) {
        // Geocoding failed — use the caller-supplied county hint
        countyFIPS = lookupCountyFIPS(county, state);
        countyName = county;
        this.warnings.push(
          `Geocoding failed for "${address}" — using provided county: ${county}`,
        );
      } else {
        this.errors.push(
          `Could not geocode "${address}" and no county provided`,
        );
        return this.buildResult(null, []);
      }

      console.log(`[Discovery] County: ${countyName} (FIPS: ${countyFIPS})`);

      // ── STEP 2: Select adapter for this county ─────────────────────────────

      const t2 = Date.now();
      const config = getCADConfig(countyFIPS);

      if (config) {
        this.adapter = this.createAdapter(config);
        console.log(
          `[Discovery] Using ${config.vendor} adapter for ${countyName} County`,
        );
      } else {
        console.log(
          `[Discovery] No config for ${countyName} County — using AI-assisted generic adapter`,
        );
        this.adapter = new GenericCADAdapter(countyName, countyFIPS);
        this.warnings.push(
          `No dedicated adapter for ${countyName} County — using generic AI-assisted adapter`,
        );
      }

      // ── STEP 3: Search the CAD for the property ────────────────────────────

      const parsed   = parseAddress(address);
      const variants = generateAddressVariants(parsed);

      console.log(`[Discovery] Trying ${variants.length} address variants...`);

      let searchResults = await this.adapter.searchByAddress(variants);
      this.timing.cad_search = Date.now() - t2;

      this.sources.push({
        name:       `${countyName} CAD`,
        url:        config?.searchUrl ?? 'unknown',
        method:     config?.searchMethod ?? 'playwright',
        success:    searchResults.length > 0,
        durationMs: this.timing.cad_search,
      });

      // Broad fallback: street-number-only search
      if (searchResults.length === 0 && parsed.streetNumber) {
        console.log(
          `[Discovery] Address search returned 0 results — trying street-number fallback...`,
        );
        const broadResults = await this.adapter.searchByAddress([
          { searchString: parsed.streetNumber, strategy: 'number_only', priority: 99 },
        ]);
        searchResults = broadResults;
      }

      if (searchResults.length === 0) {
        this.errors.push(
          `No property found matching "${address}" in ${countyName} County CAD`,
        );
        return this.buildResult(null, []);
      }

      // ── STEP 4: Enrich best match with full property detail ────────────────

      const t3       = Date.now();
      const bestMatch = searchResults[0]; // Highest matchScore
      console.log(
        `[Discovery] Best match: ${bestMatch.propertyId} — ${bestMatch.owner} (score: ${bestMatch.matchScore})`,
      );

      const detail = await this.adapter.getPropertyDetail(bestMatch.propertyId);
      this.timing.detail_enrichment = Date.now() - t3;

      const detailPageUrl = config
        ? buildDetailUrl(config, bestMatch.propertyId)
        : 'unknown';

      this.sources.push({
        name:       `${countyName} CAD Property Detail`,
        url:        detailPageUrl,
        method:     'playwright',
        success:    !!detail.owner,
        durationMs: this.timing.detail_enrichment,
      });

      // ── STEP 5: Cross-validate ─────────────────────────────────────────────

      if (
        detail.acreage &&
        bestMatch.acreage &&
        Math.abs(detail.acreage - bestMatch.acreage) > 0.01
      ) {
        this.warnings.push(
          `Acreage mismatch: search=${bestMatch.acreage}, detail=${detail.acreage}`,
        );
      }

      this.timing.total = Date.now() - startTime;

      const enriched = {
        ...detail,
        county:     countyName,
        countyFIPS,
        cadSystem:  config?.vendor ?? 'generic',
      };

      return this.buildResult(enriched, searchResults);

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.errors.push(`Discovery failed: ${msg}`);
      this.timing.total = Date.now() - startTime;
      return this.buildResult(null, []);

    } finally {
      if (this.adapter) {
        await this.adapter.destroy();
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private createAdapter(config: CADConfig): CADAdapter {
    switch (config.vendor) {
      case 'bis':           return new BISAdapter(config);
      case 'tyler':         return new TylerAdapter(config);
      case 'trueautomation':return new TrueAutomationAdapter(config);
      case 'dcad':          return new TrueAutomationAdapter(config); // DCAD uses TrueAuto structure
      case 'hcad':          return new HCADAdapter(config);           // Harris County custom portal
      case 'tad':           return new TADAdapter(config);            // Tarrant County custom portal
      default: {
        // Unknown vendor — use AI-assisted generic adapter rather than silently
        // misrouting to BISAdapter (which would fail with wrong URLs/selectors).
        // The county name is parsed from the config display name.
        // The FIPS is not stored in CADConfig so we pass an empty string;
        // GenericCADAdapter only uses it for a diagnostic note, not URL construction.
        const countyName = config.name.replace(/\s*(?:Appraisal District|CAD).*$/i, '').trim();
        return new GenericCADAdapter(countyName || config.name, '');
      }
    }
  }

  private buildResult(
    property: DiscoveryResult['property'],
    searchResults: PropertySearchResult[],
  ): DiscoveryResult {
    return {
      status:        property
        ? (this.errors.length > 0 ? 'partial' : 'complete')
        : 'failed',
      property,
      searchResults,
      sources:       this.sources,
      timing:        this.timing,
      errors:        this.errors,
      warnings:      this.warnings,
    };
  }
}
