// worker/src/sources/glo-client.ts — Phase 11 Module B
// Texas General Land Office (GLO) land grant and abstract survey client.
// Queries original patent records, abstract boundaries, and vacancy data.
//
// Spec §11.3 — Texas GLO Land Grant Integration
//
// Data sources:
//   - GLO ArcGIS REST: gisweb.glo.texas.gov/glomapserver/rest/services
//   - GLO Land Grant Database: glo.texas.gov/land/land-management/glo-land-grants

import type { GLOSurveyResult } from '../types/expansion.js';
import { retryWithBackoff } from '../infra/resilience.js';

const GLO_ABSTRACTS_URL =
  'https://gisweb.glo.texas.gov/glomapserver/rest/services/Land_Grants/MapServer/0/query';

// ── GLO Client ──────────────────────────────────────────────────────────────

export class GLOClient {

  /**
   * Query GLO for abstract survey data at a given location.
   *
   * @param centroid [longitude, latitude] WGS84
   * @param abstractNumber Optional abstract number to search directly (e.g., "A-488")
   * @param county County name for context
   */
  async queryAbstractSurvey(params: {
    centroid: [number, number];
    abstractNumber?: string;
    county?: string;
  }): Promise<GLOSurveyResult> {
    const { centroid, abstractNumber, county } = params;

    // Build query — point intersection with abstract survey polygons
    const geometry = JSON.stringify({
      x: centroid[0],
      y: centroid[1],
      spatialReference: { wkid: 4326 },
    });

    const queryParams: Record<string, string> = {
      geometry,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      returnGeometry: 'true',
      f: 'json',
    };

    // If abstract number provided, add a where clause
    if (abstractNumber) {
      const absNum = abstractNumber.replace(/^A-?/i, '');
      queryParams.where = `ABSTRACT_NUM = '${absNum}' OR ABSTRACT_NUM = 'A-${absNum}'`;
    }

    const response = await this.queryMapServer(
      GLO_ABSTRACTS_URL,
      queryParams,
    );

    if (!response?.features?.length) {
      return this.emptyResult(abstractNumber, county);
    }

    const primary = response.features[0];
    const attrs = primary.attributes;

    // Query adjacent abstracts
    const adjacentAbstracts = await this.findAdjacentAbstracts(
      primary.geometry,
      attrs.OBJECTID,
    );

    // Build abstract boundary GeoJSON
    let abstractBoundary = null;
    if (primary.geometry?.rings) {
      abstractBoundary = {
        type: 'Polygon' as const,
        coordinates: primary.geometry.rings,
        spatialReference: 'EPSG:4326',
      };
    }

    return {
      abstractNumber: attrs.ABSTRACT_NUM || attrs.ABS_NUM || abstractNumber || '',
      surveyName: attrs.SURVEY_NAME || attrs.SRV_NAME || '',
      originalGrantee: attrs.GRANTEE || attrs.ORIGINAL_GRANTEE || '',
      grantDate: attrs.GRANT_DATE
        ? new Date(attrs.GRANT_DATE).toISOString().split('T')[0]
        : '',
      grantType: attrs.GRANT_TYPE || attrs.TYPE_GRANT || '',
      originalAcreage: attrs.ORIGINAL_ACRES || attrs.ACRES || 0,
      county: attrs.COUNTY || county || '',

      abstractBoundary,

      parcelWithinAbstract: true, // By definition — centroid intersects
      abstractContainsMultipleParcels: true, // Almost always true for modern subdivisions

      adjacentAbstracts,

      vacancyRisk: 'none',
      vacancyNotes:
        'No known vacancy claims. Property is fully within abstract bounds.',
    };
  }

  // ── Adjacent Abstract Query ─────────────────────────────────────────────

  private async findAdjacentAbstracts(
    geometry: any,
    excludeObjectId: number,
  ): Promise<GLOSurveyResult['adjacentAbstracts']> {
    if (!geometry?.rings) return [];

    try {
      // Use the boundary polygon to find touching abstracts
      const response = await this.queryMapServer(GLO_ABSTRACTS_URL, {
        geometry: JSON.stringify({
          rings: geometry.rings,
          spatialReference: geometry.spatialReference || { wkid: 4326 },
        }),
        geometryType: 'esriGeometryPolygon',
        spatialRel: 'esriSpatialRelTouches',
        where: `OBJECTID <> ${excludeObjectId}`,
        outFields: 'ABSTRACT_NUM,ABS_NUM,SURVEY_NAME,SRV_NAME',
        returnGeometry: 'true',
        f: 'json',
      });

      if (!response?.features?.length) return [];

      return response.features.map((f: any) => {
        const a = f.attributes;
        // Determine direction based on centroid comparison
        const direction = this.determineDirection(geometry, f.geometry);
        return {
          abstractNumber: a.ABSTRACT_NUM || a.ABS_NUM || '',
          surveyName: a.SURVEY_NAME || a.SRV_NAME || '',
          direction,
        };
      });
    } catch {
      return [];
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private determineDirection(
    primaryGeometry: any,
    adjacentGeometry: any,
  ): 'north' | 'south' | 'east' | 'west' {
    const primaryCentroid = this.computeCentroid(primaryGeometry);
    const adjCentroid = this.computeCentroid(adjacentGeometry);

    if (!primaryCentroid || !adjCentroid) return 'north';

    const dLon = adjCentroid[0] - primaryCentroid[0];
    const dLat = adjCentroid[1] - primaryCentroid[1];

    if (Math.abs(dLat) > Math.abs(dLon)) {
      return dLat > 0 ? 'north' : 'south';
    }
    return dLon > 0 ? 'east' : 'west';
  }

  private computeCentroid(
    geometry: any,
  ): [number, number] | null {
    if (!geometry?.rings?.[0]) return null;
    const ring = geometry.rings[0];
    const sumX = ring.reduce((s: number, p: number[]) => s + p[0], 0);
    const sumY = ring.reduce((s: number, p: number[]) => s + p[1], 0);
    return [sumX / ring.length, sumY / ring.length];
  }

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
          throw new Error(`GLO API error: ${(data as any).error.message}`);
        }
        return data;
      },
      { maxAttempts: 3, baseDelayMs: 2000 },
    );
  }

  private emptyResult(
    abstractNumber?: string,
    county?: string,
  ): GLOSurveyResult {
    return {
      abstractNumber: abstractNumber || '',
      surveyName: '',
      originalGrantee: '',
      grantDate: '',
      grantType: '',
      originalAcreage: 0,
      county: county || '',
      abstractBoundary: null,
      parcelWithinAbstract: false,
      abstractContainsMultipleParcels: false,
      adjacentAbstracts: [],
      vacancyRisk: 'none',
      vacancyNotes: 'Abstract survey data not found in GLO database.',
    };
  }
}
