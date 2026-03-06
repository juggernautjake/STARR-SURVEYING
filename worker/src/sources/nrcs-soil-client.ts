// worker/src/sources/nrcs-soil-client.ts — Phase 11 Module E
// USDA NRCS Web Soil Survey client.
// Queries soil classifications, hydric soils, shrink-swell, drainage, and engineering ratings.
//
// Spec §11.6 — USDA NRCS Soil Data
//
// Data source: Soil Data Access (SDA) REST API
//   https://sdmdataaccess.nrcs.usda.gov/

import type { SoilResult } from '../types/expansion.js';
import { retryWithBackoff } from '../infra/resilience.js';

const SDA_QUERY_URL = 'https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest';
const SDA_SPATIAL_URL =
  'https://sdmdataaccess.nrcs.usda.gov/Spatial/SDM.wms';

// ── NRCS Soil Client ────────────────────────────────────────────────────────

export class NRCSSoilClient {

  /**
   * Query soil data for a property location.
   *
   * @param centroid [longitude, latitude] WGS84
   * @param polygon Optional boundary polygon for area-weighted results
   */
  async querySoilData(params: {
    centroid: [number, number];
    polygon?: number[][];
  }): Promise<SoilResult> {
    const { centroid, polygon } = params;

    // Step 1: Get map unit keys at the location
    const mapUnitKeys = await this.getMapUnitKeys(centroid, polygon);

    if (mapUnitKeys.length === 0) {
      return {
        mapUnits: [],
        summary: {
          dominantSoilType: 'Unknown',
          primaryConcerns: ['Soil data not available for this location'],
          septicFeasible: true,
          foundationConcerns: false,
          floodRiskFromSoil: false,
        },
      };
    }

    // Step 2: Get detailed properties for each map unit
    const mapUnits = await this.getMapUnitProperties(mapUnitKeys);

    // Step 3: Build summary
    const summary = this.buildSummary(mapUnits);

    return { mapUnits, summary };
  }

  // ── Get Map Unit Keys via SDA Spatial Query ─────────────────────────────

  private async getMapUnitKeys(
    centroid: [number, number],
    polygon?: number[][],
  ): Promise<string[]> {
    // Use Soil Data Access tabular query with spatial filter
    const aoi = polygon && polygon.length >= 3
      ? `POLYGON((${polygon.map((p) => `${p[0]} ${p[1]}`).join(', ')}))`
      : `POINT(${centroid[0]} ${centroid[1]})`;

    const query = `
      SELECT DISTINCT mukey, musym, muname, muacres
      FROM mapunit mu
      INNER JOIN SDA_Get_Mukey_from_intersection_with_WktWgs84('${aoi}') k
        ON mu.mukey = k.mukey
      ORDER BY muacres DESC
    `;

    try {
      const response = await this.executeSDAQuery(query);
      if (!response?.Table?.length) {
        // Fallback: try point-based query
        return this.getMapUnitKeysFromPoint(centroid);
      }
      return response.Table.map((row: any) => row.mukey);
    } catch {
      return this.getMapUnitKeysFromPoint(centroid);
    }
  }

  private async getMapUnitKeysFromPoint(
    centroid: [number, number],
  ): Promise<string[]> {
    const query = `
      SELECT mukey, musym, muname
      FROM mapunit mu
      INNER JOIN SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${centroid[0]} ${centroid[1]})') k
        ON mu.mukey = k.mukey
    `;

    try {
      const response = await this.executeSDAQuery(query);
      if (!response?.Table?.length) return [];
      return response.Table.map((row: any) => row.mukey);
    } catch {
      return [];
    }
  }

  // ── Get Detailed Map Unit Properties ────────────────────────────────────

  private async getMapUnitProperties(
    mukeys: string[],
  ): Promise<SoilResult['mapUnits']> {
    const mukeyList = mukeys.map((k) => `'${k}'`).join(',');

    const query = `
      SELECT
        mu.mukey, mu.musym, mu.muname,
        c.drainagecl, c.hydgrp, c.hydricrating,
        c.slopegradwta, c.brockdepmin, c.wtdepannmin,
        c.kffact, c.weg,
        c.corcon, c.corsteel
      FROM mapunit mu
      LEFT JOIN component c ON mu.mukey = c.mukey AND c.majcompflag = 'Yes'
      WHERE mu.mukey IN (${mukeyList})
    `;

    try {
      const response = await this.executeSDAQuery(query);
      if (!response?.Table?.length) {
        return mukeys.map((key) => this.defaultMapUnit(key));
      }

      return response.Table.map((row: any) => ({
        musym: row.musym || '',
        muname: row.muname || '',
        mukey: row.mukey || '',
        percentOfParcel: 100 / response.Table.length, // Simplified equal distribution
        drainageClass: row.drainagecl || 'Unknown',
        hydrolicGroup: this.normalizeHydGroup(row.hydgrp),
        isHydric: row.hydricrating === 'Yes',
        shrinkSwellPotential: this.determineShrinkSwell(row.muname || ''),
        depthToBedrockInches: row.brockdepmin || null,
        depthToWaterTableInches: row.wtdepannmin || null,
        permeabilityInPerHour: 0, // Would need chorizon query
        septicSuitability: this.determineSeptic(row),
        foundationRating: this.determineFoundation(row.muname || '', row.drainagecl || ''),
        roadSubgradeRating: this.determineRoadSubgrade(row),
        erosionFactor: row.kffact || 0,
        windErodibility: row.weg || 0,
      }));
    } catch (err: any) {
      console.warn(`[NRCS] Property query failed: ${err.message}`);
      return mukeys.map((key) => this.defaultMapUnit(key));
    }
  }

  // ── SDA REST Query ──────────────────────────────────────────────────────

  private async executeSDAQuery(query: string): Promise<any> {
    return retryWithBackoff(
      async () => {
        const response = await fetch(SDA_QUERY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, format: 'JSON' }),
          signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
      { maxAttempts: 3, baseDelayMs: 2000 },
    );
  }

  // ── Summary Builder ─────────────────────────────────────────────────────

  private buildSummary(
    mapUnits: SoilResult['mapUnits'],
  ): SoilResult['summary'] {
    if (mapUnits.length === 0) {
      return {
        dominantSoilType: 'Unknown',
        primaryConcerns: [],
        septicFeasible: true,
        foundationConcerns: false,
        floodRiskFromSoil: false,
      };
    }

    const dominant = mapUnits[0];
    const concerns: string[] = [];

    // Check for high shrink-swell
    if (mapUnits.some((m) => m.shrinkSwellPotential === 'high' || m.shrinkSwellPotential === 'very_high')) {
      concerns.push('High shrink-swell potential — expansive clay soils');
    }

    // Check for hydric soils
    if (mapUnits.some((m) => m.isHydric)) {
      concerns.push('Hydric soils present — potential wetland indicators');
    }

    // Check for poor drainage
    if (mapUnits.some((m) => m.drainageClass?.toLowerCase().includes('poorly'))) {
      concerns.push('Poorly drained soils — flooding/drainage concerns');
    }

    // Check for shallow bedrock
    if (mapUnits.some((m) => m.depthToBedrockInches !== null && m.depthToBedrockInches < 40)) {
      concerns.push('Shallow bedrock — excavation/foundation limitations');
    }

    // Check for high water table
    if (mapUnits.some((m) => m.depthToWaterTableInches !== null && m.depthToWaterTableInches < 24)) {
      concerns.push('High water table — basement/septic limitations');
    }

    return {
      dominantSoilType: dominant.muname,
      primaryConcerns: concerns,
      septicFeasible: !mapUnits.every((m) => m.septicSuitability === 'unsuitable'),
      foundationConcerns: mapUnits.some((m) => m.foundationRating === 'poor'),
      floodRiskFromSoil: mapUnits.some((m) => m.isHydric),
    };
  }

  // ── Normalization Helpers ───────────────────────────────────────────────

  private normalizeHydGroup(
    group: string | null,
  ): SoilResult['mapUnits'][0]['hydrolicGroup'] {
    if (!group) return 'C';
    const g = group.toUpperCase().trim();
    if (['A', 'B', 'C', 'D', 'A/D', 'B/D', 'C/D'].includes(g)) {
      return g as any;
    }
    return 'C';
  }

  private determineShrinkSwell(
    muname: string,
  ): SoilResult['mapUnits'][0]['shrinkSwellPotential'] {
    const name = muname.toLowerCase();
    // Central Texas soil patterns
    if (name.includes('houston black') || name.includes('branyon')) return 'very_high';
    if (name.includes('houston') || name.includes('heiden') || name.includes('ferris')) return 'high';
    if (name.includes('clay')) return 'high';
    if (name.includes('loam')) return 'moderate';
    if (name.includes('sand')) return 'low';
    return 'moderate';
  }

  private determineSeptic(
    row: any,
  ): SoilResult['mapUnits'][0]['septicSuitability'] {
    const drainage = (row.drainagecl || '').toLowerCase();
    const hydric = row.hydricrating === 'Yes';

    if (hydric || drainage.includes('very poorly')) return 'unsuitable';
    if (drainage.includes('poorly') || drainage.includes('somewhat poorly'))
      return 'marginal';
    return 'suitable';
  }

  private determineFoundation(
    muname: string,
    drainageClass: string,
  ): SoilResult['mapUnits'][0]['foundationRating'] {
    const name = muname.toLowerCase();
    if (name.includes('houston black') || name.includes('branyon'))
      return 'poor'; // High shrink-swell
    if (name.includes('clay') && name.includes('slope')) return 'poor';
    if (drainageClass.toLowerCase().includes('poorly')) return 'fair';
    return 'good';
  }

  private determineRoadSubgrade(
    row: any,
  ): SoilResult['mapUnits'][0]['roadSubgradeRating'] {
    const drainage = (row.drainagecl || '').toLowerCase();
    if (drainage.includes('very poorly') || drainage.includes('poorly'))
      return 'poor';
    if (drainage.includes('somewhat')) return 'fair';
    return 'good';
  }

  private defaultMapUnit(mukey: string): SoilResult['mapUnits'][0] {
    return {
      musym: '',
      muname: 'Unknown',
      mukey,
      percentOfParcel: 100,
      drainageClass: 'Unknown',
      hydrolicGroup: 'C',
      isHydric: false,
      shrinkSwellPotential: 'moderate',
      depthToBedrockInches: null,
      depthToWaterTableInches: null,
      permeabilityInPerHour: 0,
      septicSuitability: 'suitable',
      foundationRating: 'fair',
      roadSubgradeRating: 'fair',
      erosionFactor: 0,
      windErodibility: 0,
    };
  }
}
