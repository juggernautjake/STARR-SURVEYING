// worker/src/sources/tceq-client.ts — Phase 11 Module C
// Texas Commission on Environmental Quality (TCEQ) data client.
// Queries underground storage tanks, contamination sites, and permits.
//
// Spec §11.4 — TCEQ Environmental Data
//
// Data sources:
//   - TCEQ Central Registry
//   - PST (Petroleum Storage Tank) database
//   - State Superfund sites
//   - TCEQ GIS: https://gis.tceq.texas.gov/arcgis/rest/services

import type { TCEQEnvironmentalResult } from '../types/expansion.js';
import { retryWithBackoff } from '../infra/resilience.js';

const TCEQ_PST_URL =
  'https://gis.tceq.texas.gov/arcgis/rest/services/PSTViewer/MapServer/0/query';
const TCEQ_SUPERFUND_URL =
  'https://gis.tceq.texas.gov/arcgis/rest/services/SuperfundSites/MapServer/0/query';
const TCEQ_PERMITS_URL =
  'https://gis.tceq.texas.gov/arcgis/rest/services/TCEQ_Permits/MapServer/0/query';

// ── TCEQ Client ─────────────────────────────────────────────────────────────

export class TCEQClient {
  private searchRadiusMiles: number;

  constructor(searchRadiusMiles: number = 1.0) {
    this.searchRadiusMiles = searchRadiusMiles;
  }

  /**
   * Query TCEQ for environmental data affecting a property.
   *
   * @param centroid [longitude, latitude] WGS84
   * @param propertyAddress Address for on-property matching
   */
  async queryEnvironmental(params: {
    centroid: [number, number];
    propertyAddress?: string;
  }): Promise<TCEQEnvironmentalResult> {
    const { centroid, propertyAddress } = params;
    const bufferFeet = this.searchRadiusMiles * 5280;

    // Run all queries in parallel
    const [storageTanks, contaminationSites, permits] = await Promise.all([
      this.queryStorageTanks(centroid, bufferFeet, propertyAddress),
      this.queryContaminationSites(centroid, bufferFeet, propertyAddress),
      this.queryPermits(centroid, bufferFeet, propertyAddress),
    ]);

    // Build summary
    const allIssues = [
      ...storageTanks.filter((t) => t.leakDetected || t.status === 'leaking'),
      ...contaminationSites,
    ];

    const nearestContamination = Math.min(
      ...contaminationSites.map((s) => s.distanceFromProperty),
      ...storageTanks
        .filter((t) => t.leakDetected)
        .map((t) => t.distanceFromProperty),
      Infinity,
    );

    const environmentalRisk =
      allIssues.some((i) => ('isOnProperty' in i && i.isOnProperty))
        ? 'critical'
        : nearestContamination < 500
          ? 'high'
          : nearestContamination < 2640 // 0.5 miles
            ? 'moderate'
            : allIssues.length > 0
              ? 'low'
              : 'none';

    return {
      storageTanks,
      contaminationSites,
      permits,
      summary: {
        environmentalRisk,
        issuesFound: allIssues.length,
        nearestContaminationFeet:
          nearestContamination === Infinity ? null : nearestContamination,
        requiresPhaseIESA: nearestContamination < 5280, // Within 1 mile
        notes: this.buildSummaryNotes(
          storageTanks,
          contaminationSites,
          permits,
        ),
      },
    };
  }

  // ── Storage Tank Query ──────────────────────────────────────────────────

  private async queryStorageTanks(
    centroid: [number, number],
    bufferFeet: number,
    propertyAddress?: string,
  ): Promise<TCEQEnvironmentalResult['storageTanks']> {
    try {
      const response = await this.queryArcGIS(TCEQ_PST_URL, centroid, bufferFeet);
      if (!response?.features?.length) return [];

      return response.features.map((f: any) => {
        const a = f.attributes;
        const dist = this.computeDistance(centroid, f.geometry);
        const dir = this.computeDirection(centroid, f.geometry);

        return {
          facilityId: a.FACILITY_ID || a.PST_ID || '',
          facilityName: a.FACILITY_NAME || a.NAME || '',
          address: a.ADDRESS || a.STREET_ADDRESS || '',
          distanceFromProperty: dist,
          direction: dir,
          tankCount: a.TANK_COUNT || a.NUM_TANKS || 1,
          status: this.normalizeTankStatus(a.STATUS || ''),
          substances: this.parseSubstances(a.SUBSTANCE || a.PRODUCT || ''),
          leakDetected: (a.LEAK_STATUS || '').toLowerCase().includes('leak'),
          remediationStatus: a.REMEDIATION_STATUS || a.CLEANUP_STATUS || '',
          lastInspectionDate: a.LAST_INSPECTION
            ? new Date(a.LAST_INSPECTION).toISOString().split('T')[0]
            : '',
          isOnProperty: this.isOnProperty(a.ADDRESS, propertyAddress, dist),
        };
      });
    } catch (err: any) {
      console.warn(`[TCEQ] Storage tank query failed: ${err.message}`);
      return [];
    }
  }

  // ── Contamination Site Query ────────────────────────────────────────────

  private async queryContaminationSites(
    centroid: [number, number],
    bufferFeet: number,
    propertyAddress?: string,
  ): Promise<TCEQEnvironmentalResult['contaminationSites']> {
    try {
      const response = await this.queryArcGIS(TCEQ_SUPERFUND_URL, centroid, bufferFeet);
      if (!response?.features?.length) return [];

      return response.features.map((f: any) => {
        const a = f.attributes;
        const dist = this.computeDistance(centroid, f.geometry);

        return {
          siteId: a.SITE_ID || a.VCP_ID || '',
          siteName: a.SITE_NAME || a.NAME || '',
          programType: this.normalizeProgramType(a.PROGRAM || a.PROGRAM_TYPE || ''),
          distanceFromProperty: dist,
          status: a.STATUS || a.SITE_STATUS || '',
          contaminants: this.parseSubstances(a.CONTAMINANTS || a.COC || ''),
          isOnProperty: dist < 100,
        };
      });
    } catch (err: any) {
      console.warn(`[TCEQ] Contamination query failed: ${err.message}`);
      return [];
    }
  }

  // ── Permit Query ────────────────────────────────────────────────────────

  private async queryPermits(
    centroid: [number, number],
    bufferFeet: number,
    propertyAddress?: string,
  ): Promise<TCEQEnvironmentalResult['permits']> {
    try {
      const response = await this.queryArcGIS(TCEQ_PERMITS_URL, centroid, bufferFeet);
      if (!response?.features?.length) return [];

      return response.features.map((f: any) => {
        const a = f.attributes;
        const dist = this.computeDistance(centroid, f.geometry);

        return {
          permitNumber: a.PERMIT_NUMBER || a.PERMIT_ID || '',
          type: a.PERMIT_TYPE || a.MEDIA_TYPE || '',
          facilityName: a.FACILITY_NAME || a.NAME || '',
          distanceFromProperty: dist,
          isOnProperty: dist < 100,
        };
      });
    } catch (err: any) {
      console.warn(`[TCEQ] Permit query failed: ${err.message}`);
      return [];
    }
  }

  // ── ArcGIS Query Helper ─────────────────────────────────────────────────

  private async queryArcGIS(
    url: string,
    centroid: [number, number],
    bufferFeet: number,
  ): Promise<any> {
    const params: Record<string, string> = {
      geometry: JSON.stringify({
        x: centroid[0],
        y: centroid[1],
        spatialReference: { wkid: 4326 },
      }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(bufferFeet),
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

  // ── Helpers ─────────────────────────────────────────────────────────────

  private computeDistance(
    centroid: [number, number],
    geometry: any,
  ): number {
    if (!geometry) return Infinity;
    const lon = geometry.x || geometry.longitude || centroid[0];
    const lat = geometry.y || geometry.latitude || centroid[1];
    // Rough degrees → feet (at ~30° latitude)
    const dLon = (lon - centroid[0]) * 288200;
    const dLat = (lat - centroid[1]) * 364000;
    return Math.sqrt(dLon * dLon + dLat * dLat);
  }

  private computeDirection(
    centroid: [number, number],
    geometry: any,
  ): string {
    if (!geometry) return '';
    const dLon = (geometry.x || 0) - centroid[0];
    const dLat = (geometry.y || 0) - centroid[1];
    const angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
    if (angle >= -22.5 && angle < 22.5) return 'N';
    if (angle >= 22.5 && angle < 67.5) return 'NE';
    if (angle >= 67.5 && angle < 112.5) return 'E';
    if (angle >= 112.5 && angle < 157.5) return 'SE';
    if (angle >= 157.5 || angle < -157.5) return 'S';
    if (angle >= -157.5 && angle < -112.5) return 'SW';
    if (angle >= -112.5 && angle < -67.5) return 'W';
    return 'NW';
  }

  private isOnProperty(
    facilityAddress: string,
    propertyAddress?: string,
    distance?: number,
  ): boolean {
    if (distance !== undefined && distance < 50) return true;
    if (!facilityAddress || !propertyAddress) return false;
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalize(facilityAddress).includes(
      normalize(propertyAddress).slice(0, 20),
    );
  }

  private normalizeTankStatus(status: string): TCEQEnvironmentalResult['storageTanks'][0]['status'] {
    const s = status.toLowerCase();
    if (s.includes('active') || s.includes('open')) return 'active';
    if (s.includes('closed') || s.includes('removed')) return 'closed';
    if (s.includes('leak')) return 'leaking';
    if (s.includes('remed') || s.includes('cleanup')) return 'remediation';
    return 'unknown';
  }

  private normalizeProgramType(type: string): TCEQEnvironmentalResult['contaminationSites'][0]['programType'] {
    const t = type.toLowerCase();
    if (t.includes('superfund')) return 'superfund';
    if (t.includes('vcp') || t.includes('voluntary')) return 'vcp';
    if (t.includes('brownfield')) return 'brownfield';
    if (t.includes('dry') || t.includes('cleaner')) return 'dry_cleaner';
    return 'other';
  }

  private parseSubstances(raw: string): string[] {
    if (!raw) return [];
    return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private buildSummaryNotes(
    tanks: TCEQEnvironmentalResult['storageTanks'],
    sites: TCEQEnvironmentalResult['contaminationSites'],
    permits: TCEQEnvironmentalResult['permits'],
  ): string {
    const notes: string[] = [];

    const leakingTanks = tanks.filter((t) => t.leakDetected);
    if (leakingTanks.length > 0) {
      notes.push(
        `${leakingTanks.length} leaking UST(s) within search radius`,
      );
    }

    const onPropertyTanks = tanks.filter((t) => t.isOnProperty);
    if (onPropertyTanks.length > 0) {
      notes.push(`${onPropertyTanks.length} UST(s) on subject property`);
    }

    if (sites.length > 0) {
      notes.push(`${sites.length} contamination site(s) nearby`);
    }

    if (notes.length === 0) {
      notes.push('No environmental concerns identified within search radius');
    }

    return notes.join('. ') + '.';
  }
}
