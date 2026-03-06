// worker/src/sources/fema-nfhl-client.ts — Phase 11 Module A
// FEMA National Flood Hazard Layer (NFHL) client.
// Queries flood zones, FIRM panels, BFE lines, and LOMA/LOMR records.
//
// Spec §11.2 — FEMA Flood Zone Integration
//
// Data sources:
//   - NFHL MapServer Layer 28: Flood Zones
//   - NFHL MapServer Layer 3: FIRM Panels
//   - NFHL MapServer Layer 14: BFE Lines
//   - NFHL MapServer Layer 35: LOMA/LOMR

import type { FloodZone, FloodZoneResult } from '../types/expansion.js';
import { retryWithBackoff } from '../infra/resilience.js';

const NFHL_FLOOD_ZONES_URL =
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query';
const NFHL_BFE_LINES_URL =
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/14/query';
const NFHL_FIRM_PANELS_URL =
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/3/query';
const NFHL_LOMA_URL =
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/35/query';

// ── FEMA NFHL Client ────────────────────────────────────────────────────────

export class FEMANFHLClient {
  private retryCount = 3;
  private retryDelay = 2000;

  /**
   * Query flood zone data for a property using its boundary polygon or centroid.
   *
   * @param polygon Array of [longitude, latitude] coordinate pairs (WGS84)
   * @param centroid [longitude, latitude] in WGS84 for point query fallback
   * @param bufferFeet Buffer around centroid if no polygon
   */
  async queryFloodZones(params: {
    polygon?: number[][];
    centroid: [number, number];
    bufferFeet?: number;
  }): Promise<FloodZoneResult> {
    const { centroid, polygon, bufferFeet = 100 } = params;

    // Build geometry for query
    let geometry: string;
    let geometryType: string;
    const spatialRel = 'esriSpatialRelIntersects';

    if (polygon && polygon.length >= 3) {
      geometry = JSON.stringify({
        rings: [polygon],
        spatialReference: { wkid: 4326 },
      });
      geometryType = 'esriGeometryPolygon';
    } else {
      geometry = JSON.stringify({
        x: centroid[0],
        y: centroid[1],
        spatialReference: { wkid: 4326 },
      });
      geometryType = 'esriGeometryPoint';
    }

    // ── Query 1: Flood Zones ────────────────────────────────────────────
    const zonesResponse = await this.queryMapServer(NFHL_FLOOD_ZONES_URL, {
      geometry,
      geometryType,
      spatialRel,
      outFields:
        'FLD_ZONE,ZONE_SUBTY,STATIC_BFE,DEPTH,VELOCITY,AR_REVERT,AR_SUBTRV,SFHA_TF',
      returnGeometry: 'true',
      f: 'json',
    });

    const zones = this.parseFloodZones(zonesResponse);

    // ── Query 2: FIRM Panel ─────────────────────────────────────────────
    const firmResponse = await this.queryMapServer(NFHL_FIRM_PANELS_URL, {
      geometry,
      geometryType,
      spatialRel,
      outFields:
        'FIRM_PAN,SUFFIX,EFF_DATE,PANEL_TYP,PCOMM,COMMUNITY,CNTY_FIPS,ST_FIPS',
      returnGeometry: 'false',
      f: 'json',
    });

    const firmPanel = this.parseFIRMPanel(firmResponse);

    // ── Query 3: BFE Lines ──────────────────────────────────────────────
    const bfeResponse = await this.queryMapServer(NFHL_BFE_LINES_URL, {
      geometry: JSON.stringify({
        x: centroid[0],
        y: centroid[1],
        spatialReference: { wkid: 4326 },
      }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      distance: '500',
      units: 'esriSRUnit_Foot',
      outFields: 'ELEV,LEN_UNIT,V_DATUM,SOURCE_CIT',
      returnGeometry: 'true',
      f: 'json',
    });

    const bfe = this.parseBFE(bfeResponse, centroid);

    // ── Query 4: LOMA/LOMR ──────────────────────────────────────────────
    const lomaResponse = await this.queryMapServer(NFHL_LOMA_URL, {
      geometry,
      geometryType,
      spatialRel,
      outFields: 'CASE_NO,CASE_TYP,EFF_DATE,STATUS,CASE_DESC',
      returnGeometry: 'false',
      f: 'json',
    });

    const lomaLomr = this.parseLomaLomr(lomaResponse);

    // ── Build Summary ───────────────────────────────────────────────────
    const primaryZone = this.determinePrimaryZone(zones);
    const isInFloodplain = zones.some((z) => z.isSpecialFloodHazardArea);
    const floodInsuranceRequired = zones.some(
      (z) => z.floodInsuranceRequired,
    );

    return {
      zones,
      firmPanel,
      basFloodElevation: bfe,
      lomaLomr,
      summary: {
        primaryZone: primaryZone?.zone || 'X',
        isInFloodplain,
        floodInsuranceRequired,
        basFloodElevation:
          bfe?.elevation || primaryZone?.staticBFE || null,
        firmPanelNumber: firmPanel?.panelNumber || null,
        firmEffectiveDate: firmPanel?.effectiveDate || null,
        hasLomaLomr: lomaLomr.length > 0,
        riskLevel: isInFloodplain
          ? 'high'
          : zones.some((z) => z.zoneSubtype?.includes('0.2 PCT'))
            ? 'moderate'
            : primaryZone?.zone === 'D'
              ? 'undetermined'
              : 'low',
      },
    };
  }

  // ── ArcGIS REST Query ───────────────────────────────────────────────────

  private async queryMapServer(
    url: string,
    params: Record<string, string>,
  ): Promise<any> {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = `${url}?${queryString}`;

    return retryWithBackoff(
      async () => {
        const response = await fetch(fullUrl, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if ((data as any).error) {
          throw new Error(
            `FEMA API error: ${(data as any).error.message}`,
          );
        }
        return data;
      },
      { maxAttempts: this.retryCount, baseDelayMs: this.retryDelay },
    );
  }

  // ── Response Parsers ────────────────────────────────────────────────────

  private parseFloodZones(
    response: any,
  ): FloodZoneResult['zones'] {
    if (!response?.features?.length) return [];

    return response.features.map((f: any) => {
      const attrs = f.attributes;
      const zone = (attrs.FLD_ZONE || 'X') as FloodZone;
      const isSFHA = [
        'A', 'AE', 'AH', 'AO', 'AR', 'A99', 'V', 'VE',
      ].includes(zone);

      return {
        zone,
        zoneSubtype: attrs.ZONE_SUBTY || zone,
        staticBFE: attrs.STATIC_BFE || null,
        depthNumber: attrs.DEPTH || null,
        velocityNumber: attrs.VELOCITY || null,
        arEscarpment: attrs.AR_REVERT === 'T',
        percentageOfParcel: 100, // Full polygon intersection would compute exact %
        isSpecialFloodHazardArea: isSFHA,
        floodInsuranceRequired: isSFHA,
      };
    });
  }

  private parseFIRMPanel(
    response: any,
  ): FloodZoneResult['firmPanel'] {
    if (!response?.features?.length) return null;
    const attrs = response.features[0].attributes;
    return {
      panelNumber: attrs.FIRM_PAN || '',
      suffix: attrs.SUFFIX || '',
      effectiveDate: attrs.EFF_DATE
        ? new Date(attrs.EFF_DATE).toISOString().split('T')[0]
        : '',
      communityName: attrs.PCOMM || '',
      communityNumber: attrs.COMMUNITY || '',
      countyFIPS: attrs.CNTY_FIPS || '',
      state: 'TX',
    };
  }

  private parseBFE(
    response: any,
    centroid: [number, number],
  ): FloodZoneResult['basFloodElevation'] {
    if (!response?.features?.length) return null;

    let nearest = response.features[0];
    let minDist = Infinity;

    for (const feat of response.features) {
      if (feat.geometry?.paths) {
        for (const path of feat.geometry.paths) {
          for (const pt of path) {
            const dist = Math.sqrt(
              Math.pow(pt[0] - centroid[0], 2) +
                Math.pow(pt[1] - centroid[1], 2),
            );
            if (dist < minDist) {
              minDist = dist;
              nearest = feat;
            }
          }
        }
      }
    }

    return {
      elevation: nearest.attributes.ELEV || 0,
      source: 'BFE Line',
      distanceFromBFELine: minDist * 364000, // Rough degrees→feet conversion
      interpolated: response.features.length > 1,
    };
  }

  private parseLomaLomr(
    response: any,
  ): FloodZoneResult['lomaLomr'] {
    if (!response?.features?.length) return [];
    return response.features.map((f: any) => ({
      caseNumber: f.attributes.CASE_NO || '',
      type: (f.attributes.CASE_TYP || 'LOMA') as any,
      effectiveDate: f.attributes.EFF_DATE
        ? new Date(f.attributes.EFF_DATE).toISOString().split('T')[0]
        : '',
      description: f.attributes.CASE_DESC || '',
      determinedZone: 'X' as FloodZone,
      previousZone: 'AE' as FloodZone,
    }));
  }

  private determinePrimaryZone(
    zones: FloodZoneResult['zones'],
  ): FloodZoneResult['zones'][0] | null {
    if (zones.length === 0) return null;
    const riskOrder = [
      'VE', 'V', 'AE', 'A', 'AO', 'AH', 'AR', 'A99', 'X', 'D',
    ];
    return [...zones].sort(
      (a, b) =>
        riskOrder.indexOf(a.zone) - riskOrder.indexOf(b.zone),
    )[0];
  }
}
