// worker/src/sources/rrc-client.ts — Phase 11 Module D
// Texas Railroad Commission (RRC) oil/gas well and pipeline client.
// Queries well locations, pipeline easements, and regulatory setbacks.
//
// Spec §11.5 — Texas Railroad Commission (Oil & Gas)
//
// Two access modes:
//   1. GIS Viewer ArcGIS REST — real-time point/proximity queries
//      https://gis.rrc.texas.gov/arcgis/rest/services/
//   2. Bulk Download (FREE) — static SHP/ZIP files updated daily or monthly
//      https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/
//      Bell County filter: CNTY_FIPS = 027 (wells & pipelines) or CNTY = "BELL"
//
// ⚠️ ALL RRC GIS data is in NAD27 Geographic (Decimal Degrees).
//    Must transform to NAD83 for integration with other Bell County layers.
//    Use proj4 or GDAL for coordinate conversion.

import type { RRCResult } from '../types/expansion.js';
import { retryWithBackoff } from '../infra/resilience.js';

const RRC_WELLS_URL =
  'https://gis.rrc.texas.gov/arcgis/rest/services/Wells/MapServer/0/query';
const RRC_PIPELINES_URL =
  'https://gis.rrc.texas.gov/arcgis/rest/services/Pipelines/MapServer/0/query';

// ── Bulk Download Metadata ───────────────────────────────────────────────────

/**
 * A downloadable bulk dataset from the RRC Data Downloads page.
 * All files are free and require no authentication.
 */
export interface RRCBulkDataset {
  /** Short identifier */
  id: string;
  /** Human-readable dataset name */
  name: string;
  /** Direct download URL */
  url: string;
  /** File format */
  format: 'SHP' | 'ZIP' | 'TXT' | 'DBF';
  /** How often the file is updated */
  updateFrequency: 'daily' | 'monthly' | 'continuous';
  /** Key field names for Bell County filtering */
  countyFilterField: string;
  /** Value to use for Bell County (CNTY_FIPS=027 or CNTY="BELL") */
  bellCountyFilterValue: string;
  /** Key attribute fields in this dataset */
  keyFields: string[];
  /** Notes on coordinate system, format, etc. */
  notes: string;
}

/** Known RRC bulk download files (verified March 2026) */
export const RRC_BULK_DATASETS: RRCBulkDataset[] = [
  {
    id: 'well_surface_locations',
    name: 'Well Locations (Surface)',
    url: 'https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/',
    format: 'SHP',
    updateFrequency: 'daily',
    countyFilterField: 'CNTY',
    bellCountyFilterValue: 'BELL',
    keyFields: ['API_NUM', 'WELL_NO', 'LEASE_NM', 'OPER_NM', 'STATUS', 'SURF_LAT', 'SURF_LON'],
    notes: 'NAD27 Decimal Degrees. Filter by CNTY="BELL" after download. Daily updates.',
  },
  {
    id: 'pipeline_t4',
    name: 'Pipeline Locations (T-4)',
    url: 'https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/',
    format: 'SHP',
    updateFrequency: 'continuous',
    countyFilterField: 'CNTY_FIPS',
    bellCountyFilterValue: '027',
    keyFields: ['P5_NUM', 'SYS_NM', 'CNTY_CD', 'OPER_NM', 'commodity', 'CNTY_FIPS'],
    notes: 'NAD27 Decimal Degrees. Filter by CNTY_FIPS=027 for Bell County. Continuous updates.',
  },
  {
    id: 'drilling_permits',
    name: 'Drilling Permits',
    url: 'https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/',
    format: 'TXT',
    updateFrequency: 'daily',
    countyFilterField: 'CNTY_CD',
    bellCountyFilterValue: '027',
    keyFields: ['API_NUM', 'OPER_NM', 'SURF_LAT', 'SURF_LON', 'CNTY_CD'],
    notes: 'Text/DBF format. Filter by CNTY_CD=027 for Bell County. Daily updates.',
  },
  {
    id: 'wellbore_database',
    name: 'Wellbore Database',
    url: 'https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/',
    format: 'TXT',
    updateFrequency: 'monthly',
    countyFilterField: 'CNTY_CD',
    bellCountyFilterValue: '027',
    keyFields: ['API', 'completion_date', 'plug_date', 'formation'],
    notes: 'Text/DBF format. Filter by county code. Monthly updates.',
  },
  {
    id: 'organization_p5',
    name: 'Organization Report (P-5)',
    url: 'https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/',
    format: 'TXT',
    updateFrequency: 'monthly',
    countyFilterField: 'N/A',
    bellCountyFilterValue: 'N/A',
    keyFields: ['P5_NUM', 'OPER_NM', 'ADDR', 'PHONE', 'active_status'],
    notes: 'Statewide operator registry — no county filter. Monthly updates.',
  },
];

// ── RRC Client ──────────────────────────────────────────────────────────────

export class RRCClient {
  private searchRadiusFeet: number;

  constructor(searchRadiusFeet: number = 2640) {
    // Default 0.5 mile search radius
    this.searchRadiusFeet = searchRadiusFeet;
  }

  /**
   * Query RRC for wells and pipelines near a property.
   *
   * @param centroid [longitude, latitude] WGS84
   */
  async queryOilGas(params: {
    centroid: [number, number];
    polygon?: number[][];
  }): Promise<RRCResult> {
    const { centroid } = params;

    const [wells, pipelines] = await Promise.all([
      this.queryWells(centroid),
      this.queryPipelines(centroid),
    ]);

    const wellsOnProperty = wells.filter((w) => w.isOnProperty).length;
    const wellsNearby = wells.filter(
      (w) => w.distanceFromProperty <= 500,
    ).length;
    const pipelinesCrossing = pipelines.filter(
      (p) => p.crossesProperty,
    ).length;
    const pipelinesNearby = pipelines.filter(
      (p) => p.distanceFromProperty <= 200,
    ).length;

    const setbackRestrictions: string[] = [];
    if (wellsOnProperty > 0) {
      setbackRestrictions.push(
        'Active wells on property — building setback restrictions apply',
      );
    }
    for (const p of pipelines.filter((p) => p.crossesProperty)) {
      setbackRestrictions.push(
        `${p.commodity.toUpperCase()} pipeline (${p.diameter}" diameter) — ` +
        `${p.regulatorySetback}' setback required`,
      );
    }

    return {
      wells,
      pipelines,
      summary: {
        wellsOnProperty,
        wellsWithin500Feet: wellsNearby,
        pipelinesCrossingProperty: pipelinesCrossing,
        pipelinesWithin200Feet: pipelinesNearby,
        mineralRightsNote:
          wellsOnProperty > 0
            ? 'Active wells present — mineral rights may be severed. Verify mineral ownership.'
            : 'No wells on property — mineral rights status should still be verified.',
        setbackRestrictions,
      },
    };
  }

  // ── Well Query ──────────────────────────────────────────────────────────

  private async queryWells(
    centroid: [number, number],
  ): Promise<RRCResult['wells']> {
    try {
      const response = await this.queryArcGIS(RRC_WELLS_URL, centroid);
      if (!response?.features?.length) return [];

      return response.features.map((f: any) => {
        const a = f.attributes;
        const dist = this.computeDistance(centroid, f.geometry);

        return {
          apiNumber: a.API_NUMBER || a.API || '',
          wellName: a.WELL_NAME || a.LEASE_NAME || '',
          operator: a.OPERATOR_NAME || a.OPERATOR || '',
          wellType: this.normalizeWellType(a.WELL_TYPE || a.TYPE || ''),
          status: this.normalizeWellStatus(a.WELL_STATUS || a.STATUS || ''),
          distanceFromProperty: dist,
          isOnProperty: dist < 100,
          surfaceLatitude: f.geometry?.y || 0,
          surfaceLongitude: f.geometry?.x || 0,
          depthFeet: a.TOTAL_DEPTH || a.DEPTH || 0,
          completionDate: a.COMPLETION_DATE
            ? new Date(a.COMPLETION_DATE).toISOString().split('T')[0]
            : '',
          plugDate: a.PLUG_DATE
            ? new Date(a.PLUG_DATE).toISOString().split('T')[0]
            : null,
          fieldName: a.FIELD_NAME || a.FIELD || '',
          leaseNumber: a.LEASE_NUMBER || a.LEASE_NO || '',
        };
      });
    } catch (err: any) {
      console.warn(`[RRC] Well query failed: ${err.message}`);
      return [];
    }
  }

  // ── Pipeline Query ──────────────────────────────────────────────────────

  private async queryPipelines(
    centroid: [number, number],
  ): Promise<RRCResult['pipelines']> {
    try {
      const response = await this.queryArcGIS(
        RRC_PIPELINES_URL,
        centroid,
      );
      if (!response?.features?.length) return [];

      return response.features.map((f: any) => {
        const a = f.attributes;
        const dist = this.computeDistanceToLine(centroid, f.geometry);
        const diameter = a.DIAMETER || a.PIPE_DIAMETER || 0;

        return {
          pipelineId: a.PIPELINE_ID || a.PERMIT_NUMBER || '',
          operator: a.OPERATOR_NAME || a.OPERATOR || '',
          commodity: this.normalizeCommodity(
            a.COMMODITY || a.PRODUCT || '',
          ),
          diameter,
          status: this.normalizePipelineStatus(a.STATUS || ''),
          distanceFromProperty: dist,
          crossesProperty: dist < 50,
          estimatedEasementWidth: this.estimateEasementWidth(diameter),
          regulatorySetback: this.computeSetback(
            a.COMMODITY || '',
            diameter,
          ),
        };
      });
    } catch (err: any) {
      console.warn(`[RRC] Pipeline query failed: ${err.message}`);
      return [];
    }
  }

  // ── ArcGIS Query ────────────────────────────────────────────────────────

  private async queryArcGIS(
    url: string,
    centroid: [number, number],
  ): Promise<any> {
    const params: Record<string, string> = {
      geometry: JSON.stringify({
        x: centroid[0],
        y: centroid[1],
        spatialReference: { wkid: 4326 },
      }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(this.searchRadiusFeet),
      units: 'esriSRUnit_Foot',
      outFields: '*',
      returnGeometry: 'true',
      f: 'json',
    };

    const queryString = new URLSearchParams(params).toString();
    return retryWithBackoff(
      async () => {
        const response = await fetch(`${url}?${queryString}`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
      { maxAttempts: 3, baseDelayMs: 2000 },
    );
  }

  // ── Distance Helpers ────────────────────────────────────────────────────

  private computeDistance(
    centroid: [number, number],
    geometry: any,
  ): number {
    if (!geometry) return Infinity;
    const dLon = ((geometry.x || 0) - centroid[0]) * 288200;
    const dLat = ((geometry.y || 0) - centroid[1]) * 364000;
    return Math.sqrt(dLon * dLon + dLat * dLat);
  }

  private computeDistanceToLine(
    centroid: [number, number],
    geometry: any,
  ): number {
    if (!geometry?.paths) {
      return this.computeDistance(centroid, geometry);
    }

    let minDist = Infinity;
    for (const path of geometry.paths) {
      for (const pt of path) {
        const dLon = (pt[0] - centroid[0]) * 288200;
        const dLat = (pt[1] - centroid[1]) * 364000;
        const dist = Math.sqrt(dLon * dLon + dLat * dLat);
        if (dist < minDist) minDist = dist;
      }
    }
    return minDist;
  }

  // ── Normalization Helpers ───────────────────────────────────────────────

  private normalizeWellType(type: string): RRCResult['wells'][0]['wellType'] {
    const t = type.toLowerCase();
    if (t.includes('oil')) return 'oil';
    if (t.includes('gas')) return 'gas';
    if (t.includes('inject')) return 'injection';
    if (t.includes('dispos')) return 'disposal';
    return 'dry';
  }

  private normalizeWellStatus(status: string): RRCResult['wells'][0]['status'] {
    const s = status.toLowerCase();
    if (s.includes('active') || s.includes('producing')) return 'active';
    if (s.includes('inactive') || s.includes('shut')) return 'inactive';
    if (s.includes('plug')) return 'plugged';
    if (s.includes('permit')) return 'permitted';
    return 'abandoned';
  }

  private normalizeCommodity(commodity: string): RRCResult['pipelines'][0]['commodity'] {
    const c = commodity.toLowerCase();
    if (c.includes('oil') || c.includes('crude')) return 'oil';
    if (c.includes('gas') || c.includes('natural')) return 'gas';
    if (c.includes('ngl') || c.includes('liquid')) return 'NGL';
    if (c.includes('co2')) return 'CO2';
    if (c.includes('water') || c.includes('brine')) return 'water';
    return 'other';
  }

  private normalizePipelineStatus(status: string): RRCResult['pipelines'][0]['status'] {
    const s = status.toLowerCase();
    if (s.includes('active') || s.includes('operating')) return 'active';
    if (s.includes('inactive') || s.includes('idle')) return 'inactive';
    return 'abandoned';
  }

  private estimateEasementWidth(diameterInches: number): number {
    if (diameterInches <= 4) return 25;
    if (diameterInches <= 12) return 50;
    if (diameterInches <= 24) return 75;
    return 100;
  }

  private computeSetback(commodity: string, diameter: number): number {
    const c = commodity.toLowerCase();
    // Texas RRC and local codes — approximate setbacks
    if (c.includes('gas') || c.includes('ngl')) {
      return diameter <= 12 ? 50 : 100;
    }
    if (c.includes('oil')) return 50;
    return 25;
  }

  // ── Bulk Download Access ────────────────────────────────────────────────

  /**
   * Get metadata for all RRC bulk download datasets.
   *
   * These are static SHP/ZIP/TXT files from the RRC Data Downloads page.
   * No authentication required — all files are free.
   *
   * After downloading, filter by `countyFilterField === bellCountyFilterValue`
   * to extract Bell County records.
   *
   * ⚠️ All RRC GIS files use NAD27 Geographic (Decimal Degrees).
   *    Transform to NAD83 before integrating with other Bell County layers.
   */
  getBulkDownloadUrls(): RRCBulkDataset[] {
    return RRC_BULK_DATASETS;
  }

  /**
   * Get the bulk download entry for a specific dataset by ID.
   */
  getBulkDataset(id: string): RRCBulkDataset | null {
    return RRC_BULK_DATASETS.find((d) => d.id === id) ?? null;
  }

  /**
   * Get all bulk datasets that have Bell County-specific filter instructions.
   */
  getBellCountyBulkDatasets(): RRCBulkDataset[] {
    return RRC_BULK_DATASETS.filter((d) => d.bellCountyFilterValue !== 'N/A');
  }
}
