// worker/src/services/row-integration-engine.ts — Phase 6 §6.10
// Phase 6 orchestrator — coordinates all TxDOT ROW data sources.
//
// Input:  property_intelligence.json (Phase 3 output)
// Output: ROWReport saved to /tmp/analysis/{projectId}/row_data.json
//
// Architecture:
//   1. Extract roads from intelligence.roads[]
//   2. Determine property center (NAD83 → WGS84 bounds)
//   3. Query TxDOT ArcGIS ROW + centerline in parallel
//   4. For each road: TxDOT API (if TxDOT), county defaults (if county), deed-only (if city/private)
//   5. Run RPAM Playwright fallback per road when ArcGIS has no data
//   6. Run Texas Digital Archive search per TxDOT road
//   7. Run RoadBoundaryResolver.resolve() when deed/plat discrepancy exists
//   8. Assemble ROWReport and save to disk
//
// NOTES:
//   - ArcGIS ROW + centerline queries run in parallel (Promise.all)
//   - RPAM Playwright runs sequentially (memory constraints)
//   - ANTHROPIC_API_KEY required for RoadBoundaryResolver.resolve()
//   - AI model from RESEARCH_AI_MODEL env var
//   - All external calls are wrapped in try/catch — partial results on failure
//
// Spec §6.10

import * as fs from 'fs';
import * as path from 'path';
import type { PipelineLogger } from '../lib/logger.js';
import type { RoadInfo } from './property-validation-pipeline.js';
import { classifyRoadEnhanced } from './road-classifier.js';
import {
  queryTxDOTRow,
  queryTxDOTCenterlines,
  buildBoundsFromCenter,
  type TxDOTRowFeature,
  type TxDOTCenterlineFeature,
} from './txdot-row.js';
import { TxDOTRPAMClient, type RPAMResult } from './txdot-rpam-client.js';
import { TexasDigitalArchiveClient } from './texas-digital-archive-client.js';
import { RoadBoundaryResolver, type RoadBoundaryResolution } from './road-boundary-resolver.js';
import { getCountyROWDefaults } from './county-road-defaults.js';
import {
  buildWGS84BoundsFromNAD83,
  buildWGS84BoundsFromLatLon,
} from '../lib/coordinates.js';
import type { BoundaryCall } from '../types/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Full Phase 6 output — saved as row_data.json */
export interface ROWReport {
  status: 'complete' | 'partial' | 'failed';
  roads: ROWRoadResult[];
  resolvedDiscrepancies: ROWDiscrepancyResolution[];
  timing: { totalMs: number };
  sources: ROWDataSource[];
  errors: string[];
}

export interface ROWRoadResult {
  /** Road name as extracted from property_intelligence.json */
  name: string;
  /** Padded TxDOT designation (e.g., "FM 0436") or null */
  txdotDesignation: string | null;
  type: string;
  maintainedBy: 'txdot' | 'county' | 'city' | 'private' | 'unknown';
  district: string | null;
  controlSection: string | null;
  rowData: ROWData | null;
  propertyBoundaryResolution: RoadBoundaryResolution | null;
  /** Absolute path to RPAM screenshot (in /tmp/harvested/{projectId}/txdot/) */
  rpamScreenshot: string | null;
  /** Absolute path to downloaded ROW map PDF (if found via TDA) */
  rowMapPdf: string | null;
}

export interface ROWData {
  source: 'txdot_arcgis' | 'txdot_rpam' | 'county_records' | 'county_defaults' | 'deed_only';
  rowWidth: number | null;
  rowWidthUnit: 'feet' | 'meters';
  centerlineGeometry: GeoJSONGeometry | null;
  rowBoundaryGeometry: GeoJSONGeometry | null;
  boundaryType: 'straight' | 'curved' | 'mixed' | 'unknown';
  curves: ROWCurve[];
  acquisitionHistory: ROWAcquisitionRecord[];
  notes: string | null;
}

export interface ROWCurve {
  radius: number;
  arcLength: number;
  direction: 'left' | 'right';
  startStation?: string;
  endStation?: string;
}

export interface ROWAcquisitionRecord {
  csj: string;
  date: string | null;
  type: 'original_acquisition' | 'widening' | 'easement' | 'other';
  width: number | null;
  instrument: string | null;
}

export interface ROWDiscrepancyResolution {
  discrepancyId: string;
  originalDescription: string;
  resolution: string;
  newConfidence: number;
  previousConfidence: number;
}

export interface ROWDataSource {
  name: string;
  success: boolean;
  reason?: string;
}

export type GeoJSONGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

// ── Subset of Phase 3 intelligence relevant to Phase 6 ───────────────────────

interface Phase3IntelligenceSubset {
  county?: string;
  pointOfBeginning?: { northing?: number; easting?: number };
  roads?: RoadInfo[];
  discrepancies?: Array<{
    id?: string;
    callSequence?: number | null;
    description: string;
    category?: string;
    severity?: string;
    recommendation?: string;
  }>;
  /** Lat/lon from geocoding (Phase 1) */
  latitude?: number;
  longitude?: number;
}

// ── ROWIntegrationEngine ───────────────────────────────────────────────────────

export class ROWIntegrationEngine {
  private logger: PipelineLogger;

  constructor(logger: PipelineLogger) {
    this.logger = logger;
  }

  /**
   * Run Phase 6 for the given project.
   *
   * @param projectId    For output paths and logging
   * @param intelligence Parsed property_intelligence.json (Phase 3 output)
   * @param outputDir    Directory for RPAM screenshots (default: /tmp/harvested/{projectId}/txdot)
   */
  async analyze(
    projectId: string,
    intelligence: Phase3IntelligenceSubset,
    outputDir?: string,
  ): Promise<ROWReport> {
    const startTime = Date.now();
    const errors: string[] = [];
    const sources: ROWDataSource[] = [];
    const txdotOutputDir = outputDir ?? `/tmp/harvested/${projectId}/txdot`;

    // Ensure output directory exists
    try {
      fs.mkdirSync(txdotOutputDir, { recursive: true });
    } catch (e) {
      this.logger.warn('ROWIntegration', `Could not create output dir ${txdotOutputDir}: ${e}`);
    }

    this.logger.info('ROWIntegration', `Starting Phase 6 for project: ${projectId}`);

    const roads = intelligence.roads ?? [];
    if (roads.length === 0) {
      this.logger.info('ROWIntegration', 'No roads found in intelligence — Phase 6 complete (no roads)');
      return {
        status: 'complete',
        roads: [],
        resolvedDiscrepancies: [],
        timing: { totalMs: Date.now() - startTime },
        sources: [],
        errors: [],
      };
    }

    this.logger.info('ROWIntegration', `Processing ${roads.length} road(s): ${roads.map((r) => r.name).join(', ')}`);

    // ── Step 2: Determine property center for ArcGIS bbox query ───────────────
    let bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number } | null = null;

    if (
      intelligence.pointOfBeginning?.northing != null &&
      intelligence.pointOfBeginning?.easting != null
    ) {
      try {
        bounds = buildWGS84BoundsFromNAD83(
          intelligence.pointOfBeginning.easting,
          intelligence.pointOfBeginning.northing,
          2000, // 2000-foot buffer
        );
        this.logger.info('ROWIntegration', `Bounds from NAD83 state plane: ${JSON.stringify(bounds)}`);
      } catch (e) {
        this.logger.warn('ROWIntegration', `NAD83→WGS84 conversion failed: ${e}`);
      }
    }

    if (!bounds && intelligence.latitude != null && intelligence.longitude != null) {
      bounds = buildWGS84BoundsFromLatLon(intelligence.latitude, intelligence.longitude, 2000);
      this.logger.info('ROWIntegration', `Bounds from lat/lon: ${JSON.stringify(bounds)}`);
    }

    if (!bounds) {
      this.logger.warn(
        'ROWIntegration',
        'No property coordinates available — skipping TxDOT ArcGIS query, using county defaults for all roads',
      );
      errors.push(
        'property_intelligence.json lacks pointOfBeginning.northing/easting and latitude/longitude — ' +
        'cannot query TxDOT ArcGIS. Add coordinates from Phase 1 discovery or provide lat/lon manually.',
      );
    }

    // ── Step 3: Query TxDOT ArcGIS (ROW + centerlines in parallel) ────────────
    let rowFeatures: TxDOTRowFeature[] = [];
    let centerlineFeatures: TxDOTCenterlineFeature[] = [];

    if (bounds) {
      try {
        const [rowResult, clResult] = await Promise.all([
          queryTxDOTRow(bounds, this.logger),
          queryTxDOTCenterlines(bounds, this.logger),
        ]);

        rowFeatures = rowResult.features;
        centerlineFeatures = clResult;

        sources.push({
          name: 'TxDOT ArcGIS REST API (ROW)',
          success: rowResult.foundROW || rowResult.queried,
          reason: rowResult.errorMessage ?? undefined,
        });
        sources.push({
          name: 'TxDOT ArcGIS REST API (Centerlines)',
          success: centerlineFeatures.length > 0,
          reason: centerlineFeatures.length === 0 ? 'No centerline features found' : undefined,
        });

        this.logger.info(
          'ROWIntegration',
          `ArcGIS: ${rowFeatures.length} ROW features, ${centerlineFeatures.length} centerline features`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`TxDOT ArcGIS query failed: ${msg}`);
        sources.push({ name: 'TxDOT ArcGIS REST API', success: false, reason: msg });
        this.logger.warn('ROWIntegration', `ArcGIS query failed: ${msg}`);
      }
    }

    // ── Step 4: Process each road ────────────────────────────────────────────
    const rpamClient = new TxDOTRPAMClient(this.logger);
    const archiveClient = new TexasDigitalArchiveClient();
    const resolver = new RoadBoundaryResolver(this.logger);
    const roadResults: ROWRoadResult[] = [];
    const discrepancyResolutions: ROWDiscrepancyResolution[] = [];

    const discrepancies = intelligence.discrepancies ?? [];
    const county = intelligence.county ?? 'Unknown';

    for (const road of roads) {
      this.logger.info('ROWIntegration', `Processing road: ${road.name}`);
      const classified = classifyRoadEnhanced(road.name);

      try {
        const roadResult = await this.processRoad(
          road,
          classified,
          bounds,
          rowFeatures,
          centerlineFeatures,
          rpamClient,
          archiveClient,
          resolver,
          discrepancies,
          county,
          txdotOutputDir,
          sources,
          projectId,
        );

        roadResults.push(roadResult);

        if (roadResult.propertyBoundaryResolution?.resolvedDiscrepancy) {
          const rd = roadResult.propertyBoundaryResolution.resolvedDiscrepancy;
          const disc = discrepancies.find((d) => d.id === rd.discrepancyId);
          if (disc) {
            discrepancyResolutions.push({
              discrepancyId:      rd.discrepancyId,
              originalDescription: disc.description,
              resolution:         roadResult.propertyBoundaryResolution.explanation,
              newConfidence:      rd.newConfidence,
              previousConfidence: rd.previousConfidence,
            });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Road "${road.name}" processing failed: ${msg}`);
        this.logger.warn('ROWIntegration', `Road ${road.name} failed: ${msg}`);

        roadResults.push({
          name:                       road.name,
          txdotDesignation:           classified.txdotDesignation ?? null,
          type:                       classified.type,
          maintainedBy:               classified.maintainedBy,
          district:                   null,
          controlSection:             null,
          rowData:                    null,
          propertyBoundaryResolution: null,
          rpamScreenshot:             null,
          rowMapPdf:                  null,
        });
      }
    }

    // ── Determine overall status ──────────────────────────────────────────────
    const failedCount   = roadResults.filter((r) => r.rowData === null).length;
    const status: ROWReport['status'] =
      failedCount === roadResults.length && roadResults.length > 0
        ? 'failed'
        : failedCount > 0 || errors.length > 0
          ? 'partial'
          : 'complete';

    const report: ROWReport = {
      status,
      roads:                  roadResults,
      resolvedDiscrepancies:  discrepancyResolutions,
      timing:                 { totalMs: Date.now() - startTime },
      sources,
      errors,
    };

    // ── Save to disk ──────────────────────────────────────────────────────────
    const outputPath = `/tmp/analysis/${projectId}/row_data.json`;
    try {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
      this.logger.info('ROWIntegration', `Saved: ${outputPath}`);
    } catch (e) {
      this.logger.warn('ROWIntegration', `Failed to save report to ${outputPath}: ${e}`);
    }

    this.logger.info(
      'ROWIntegration',
      `COMPLETE: ${roadResults.length} road(s), ${discrepancyResolutions.length} discrepancies resolved, ` +
      `${errors.length} error(s) in ${Date.now() - startTime}ms`,
    );

    return report;
  }

  // ── Private: per-road processing ──────────────────────────────────────────────

  private async processRoad(
    road: RoadInfo,
    classified: ReturnType<typeof classifyRoadEnhanced>,
    bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number } | null,
    rowFeatures: TxDOTRowFeature[],
    centerlineFeatures: TxDOTCenterlineFeature[],
    rpamClient: TxDOTRPAMClient,
    archiveClient: TexasDigitalArchiveClient,
    resolver: RoadBoundaryResolver,
    discrepancies: Phase3IntelligenceSubset['discrepancies'],
    county: string,
    outputDir: string,
    sources: ROWDataSource[],
    projectId: string,
  ): Promise<ROWRoadResult> {
    const roadNameUpper = road.name.toUpperCase();

    // ── Case A: TxDOT-maintained road ────────────────────────────────────────
    if (classified.queryStrategy === 'txdot_api') {
      // Filter pre-fetched features to those matching this road
      const roadRowFeatures = rowFeatures.filter((f) => {
        const hwy = String(f.properties.HWY ?? '').toUpperCase();
        return hwy.includes(roadNameUpper) ||
          (classified.routeNumber && hwy.includes(classified.routeNumber));
      });

      const roadCenterlineFeatures = centerlineFeatures.filter((f) => {
        const rteNm = String(f.properties.RTE_NM ?? '').toUpperCase();
        return rteNm.includes(roadNameUpper) ||
          (classified.routeNumber && rteNm.includes(classified.routeNumber));
      });

      let rowData: ROWData | null = null;
      let rpamScreenshot: string | null = null;
      let rpamResult: RPAMResult | null = null;

      if (roadRowFeatures.length > 0) {
    // Build ROW data from ArcGIS features
    rowData = this.buildROWDataFromFeatures(roadRowFeatures, roadCenterlineFeatures, this.logger);
      } else if (bounds) {
        // No ArcGIS features for this road — try RPAM Playwright fallback
        this.logger.info(
          'ROWIntegration',
          `${road.name}: ArcGIS has no features, trying RPAM fallback...`,
        );
        rpamResult = await rpamClient.navigateToLocation(
          (bounds.minLat + bounds.maxLat) / 2,
          (bounds.minLon + bounds.maxLon) / 2,
          outputDir,
          classified.routeNumber ? `${classified.highwaySystem ?? 'road'}${classified.routeNumber}` : undefined,
        );

        if (rpamResult) {
          rpamScreenshot = rpamResult.screenshotPath;
          rowData = {
            source:              'txdot_rpam',
            rowWidth:            rpamResult.rowWidth ?? road.estimatedRowWidth_ft ?? null,
            rowWidthUnit:        'feet',
            centerlineGeometry:  null,
            rowBoundaryGeometry: null,
            boundaryType:        rpamResult.isCurved ? 'curved' : 'unknown',
            curves:              [],
            acquisitionHistory:  [],
            notes:               `From RPAM screenshot: ${rpamResult.aiAnalysis.slice(0, 200)}`,
          };
          sources.push({
            name:    `TxDOT RPAM (${road.name})`,
            success: true,
          });
        } else {
          sources.push({
            name:    `TxDOT RPAM (${road.name})`,
            success: false,
            reason:  'RPAM navigation failed or Playwright not installed',
          });
        }
      }

      // Texas Digital Archive search (sequential, per road)
      let rowMapPdf: string | null = null;
      try {
        const archiveResult = await archiveClient.searchROWRecords(
          road.name, county, undefined, this.logger,
        );
        if (archiveResult.recordsFound > 0) {
          sources.push({
            name:    `Texas Digital Archive (${road.name})`,
            success: true,
          });
          // If a map PDF was found, note it (actual download not implemented — deferred)
          const mapRecord = archiveResult.records.find((r) => r.type === 'map' && r.downloadUrl);
          if (mapRecord?.downloadUrl) {
            rowMapPdf = path.join(outputDir, `tda_${classified.routeNumber ?? 'row'}.pdf`);
          }
        } else {
          sources.push({
            name:    `Texas Digital Archive (${road.name})`,
            success: archiveResult.attempted,
            reason:  archiveResult.attempted
              ? 'No digitized records found (common for rural Texas roads)'
              : archiveResult.error ?? 'Not attempted',
          });
        }
      } catch (e) {
        this.logger.warn('ROWIntegration', `TDA search failed for ${road.name}: ${e}`);
        sources.push({
          name:    `Texas Digital Archive (${road.name})`,
          success: false,
          reason:  String(e),
        });
      }

      // Road boundary conflict resolution
      let resolution: RoadBoundaryResolution | null = null;
      const hasRoadDiscrepancy = (discrepancies ?? []).some(
        (d) => d.description.toUpperCase().includes(roadNameUpper),
      );
      if (hasRoadDiscrepancy || roadRowFeatures.length > 0) {
        // NOTE: deed/plat call extraction from property_intelligence.json would require
        // passing the full BoundaryCall[] from Phase 3. Phase 6 orchestrator receives
        // RoadInfo[] which does not include the individual boundary calls. A future
        // enhancement should pass the full Phase 3 lot/perimeter calls.
        // For now, pass empty arrays — the resolver will use TxDOT geometry as primary evidence.
        const deedCalls: BoundaryCall[] = [];
        const platCalls: BoundaryCall[] = [];
        resolution = await resolver.resolve(
          classified,
          deedCalls,
          platCalls,
          roadRowFeatures,
          roadCenterlineFeatures,
          rpamResult,
          discrepancies ?? [],
        ).catch((e) => {
          this.logger.warn('ROWIntegration', `Boundary resolution failed for ${road.name}: ${e}`);
          return null;
        });
      }

      // Get district and control section from features
      const district      = roadRowFeatures[0]?.properties.DISTRICT ?? null;
      const controlSection = roadRowFeatures[0]?.properties.CSJ?.split('-').slice(0, 2).join('-') ?? null;

      return {
        name:                       road.name,
        txdotDesignation:           classified.txdotDesignation ?? null,
        type:                       classified.type,
        maintainedBy:               'txdot',
        district:                   typeof district === 'string' ? district : null,
        controlSection:             typeof controlSection === 'string' ? controlSection : null,
        rowData,
        propertyBoundaryResolution: resolution,
        rpamScreenshot,
        rowMapPdf,
      };
    }

    // ── Case B: County-maintained road ───────────────────────────────────────
    if (classified.queryStrategy === 'county_records') {
      const countyDefaults = getCountyROWDefaults(county);
      const rowData: ROWData = {
        source:              'county_defaults',
        rowWidth:            countyDefaults.defaultROWWidth,
        rowWidthUnit:        'feet',
        centerlineGeometry:  null,
        rowBoundaryGeometry: null,
        boundaryType:        'straight', // county roads are typically straight
        curves:              [],
        acquisitionHistory:  [],
        notes:
          `${countyDefaults.notes} (Source: ${countyDefaults.source})`,
      };

      return {
        name:                       road.name,
        txdotDesignation:           null,
        type:                       'county_road',
        maintainedBy:               'county',
        district:                   null,
        controlSection:             null,
        rowData,
        propertyBoundaryResolution: null,
        rpamScreenshot:             null,
        rowMapPdf:                  null,
      };
    }

    // ── Case C: City/private/unknown road ────────────────────────────────────
    this.logger.info(
      'ROWIntegration',
      `${road.name}: ${classified.type} road — skipping TxDOT query`,
    );

    return {
      name:                       road.name,
      txdotDesignation:           null,
      type:                       classified.type,
      maintainedBy:               classified.maintainedBy,
      district:                   null,
      controlSection:             null,
      rowData: {
        source:              'deed_only',
        rowWidth:            road.estimatedRowWidth_ft ?? null,
        rowWidthUnit:        'feet',
        centerlineGeometry:  null,
        rowBoundaryGeometry: null,
        boundaryType:        'unknown',
        curves:              [],
        acquisitionHistory:  [],
        notes:               `${classified.type} road — no TxDOT data available. Width from deed/plat only.`,
      },
      propertyBoundaryResolution: null,
      rpamScreenshot:             null,
      rowMapPdf:                  null,
    };
  }

  // ── Private: build ROWData from ArcGIS features ───────────────────────────────

  private buildROWDataFromFeatures(
    rowFeatures: TxDOTRowFeature[],
    centerlineFeatures: TxDOTCenterlineFeature[],
    logger: PipelineLogger,
  ): ROWData {
    // ROW width: max of all features
    const widths = rowFeatures
      .map((f) => f.properties.ROW_WIDTH)
      .filter((w): w is number => typeof w === 'number' && w > 0);
    const rowWidth = widths.length > 0 ? Math.max(...widths) : null;

    // Acquisition history from features
    const acquisitionHistory: ROWAcquisitionRecord[] = rowFeatures
      .filter((f) => f.properties.CSJ)
      .map((f) => ({
        csj:        String(f.properties.CSJ ?? ''),
        date:       f.properties.ACQUISITION_DATE ?? null,
        type:       'original_acquisition' as const,
        width:      typeof f.properties.ROW_WIDTH === 'number' ? f.properties.ROW_WIDTH : null,
        instrument: f.properties.DEED_REF ?? null,
      }))
      .filter(
        (a, i, arr) => arr.findIndex((b) => b.csj === a.csj) === i, // deduplicate by CSJ
      );

    // Boundary type from centerline geometry — use the real logger
    const resolver = new RoadBoundaryResolver(logger);
    const boundaryType = resolver.analyzeTxDOTGeometry(rowFeatures, centerlineFeatures);

    // Use first ROW polygon as boundary geometry
    const rowBoundaryGeometry = rowFeatures[0]?.geometry as GeoJSONGeometry | null ?? null;

    // Use first centerline as centerline geometry (flatten MultiLineString if needed)
    let centerlineGeometry: GeoJSONGeometry | null = null;
    const firstCL = centerlineFeatures[0];
    if (firstCL?.geometry) {
      const geom = firstCL.geometry;
      if (geom.type === 'LineString') {
        centerlineGeometry = {
          type: 'LineString',
          coordinates: geom.coordinates as number[][],
        };
      } else if (geom.type === 'MultiLineString') {
        // Flatten all lines into one LineString for simplicity
        const allCoords = (geom.coordinates as number[][][]).flat();
        centerlineGeometry = {
          type: 'LineString',
          coordinates: allCoords,
        };
      }
    }

    return {
      source:              'txdot_arcgis',
      rowWidth,
      rowWidthUnit:        'feet',
      centerlineGeometry,
      rowBoundaryGeometry: rowBoundaryGeometry,
      boundaryType,
      curves:              [],    // Curve extraction from geometry is a future enhancement
      acquisitionHistory,
      notes:               null,
    };
  }
}

// ── Standalone runner ─────────────────────────────────────────────────────────

/**
 * Run Phase 6 given a path to property_intelligence.json.
 * Called by worker/src/index.ts POST /research/row handler.
 *
 * @param projectId       Project identifier
 * @param intelligencePath Absolute path to property_intelligence.json
 * @param logger          Pipeline logger instance
 */
export async function runROWIntegration(
  projectId: string,
  intelligencePath: string,
  logger: PipelineLogger,
): Promise<ROWReport> {
  if (!fs.existsSync(intelligencePath)) {
    throw new Error(`Intelligence file not found: ${intelligencePath}`);
  }

  const intelligence = JSON.parse(
    fs.readFileSync(intelligencePath, 'utf-8'),
  ) as Phase3IntelligenceSubset;

  const engine = new ROWIntegrationEngine(logger);
  return engine.analyze(projectId, intelligence);
}
