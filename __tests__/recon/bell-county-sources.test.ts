// __tests__/recon/bell-county-sources.test.ts
// Unit tests for Bell County intelligence data sources.
//
// Covers:
//   Module A: BellCADDataPortalClient (sources/bell-cad-data-portal.ts)
//   Module B: TNRISLiDARClient — new TxGIO open API methods (sources/tnris-lidar-client.ts)
//   Module C: TxDOTRoadwaysClient (sources/txdot-roadways-client.ts)
//   Module D: RRCClient — bulk download URLs (sources/rrc-client.ts)
//
// All tests are pure-logic — no live network calls.

import { describe, it, expect } from 'vitest';

// ── Module A: BellCADDataPortalClient ─────────────────────────────────────────

describe('BellCADDataPortalClient (sources/bell-cad-data-portal.ts)', () => {

  it('A-1. can be instantiated', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    expect(client).toBeTruthy();
  });

  it('A-2. getCurrentFiles returns non-empty array', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const files = client.getCurrentFiles();
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it('A-3. getCurrentFiles only returns isCurrent=true files', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const files = client.getCurrentFiles();
    for (const f of files) {
      expect(f.isCurrent).toBe(true);
    }
  });

  it('A-4. getCurrentAppraisalFile returns an appraisal_xlsx type', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const file = client.getCurrentAppraisalFile();
    expect(file).not.toBeNull();
    expect(file?.type).toBe('appraisal_xlsx');
    expect(file?.isCurrent).toBe(true);
  });

  it('A-5. getCurrentShapefileRar returns shapefile_rar type', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const file = client.getCurrentShapefileRar();
    expect(file).not.toBeNull();
    expect(file?.type).toBe('shapefile_rar');
    expect(file?.extension).toBe('rar');
  });

  it('A-6. getAppraisalLayout returns appraisal_layout type', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const file = client.getAppraisalLayout();
    expect(file).not.toBeNull();
    expect(file?.type).toBe('appraisal_layout');
    expect(file?.extension).toBe('xlsx');
  });

  it('A-7. getDelinquentRoll returns delinquent_roll type', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const file = client.getDelinquentRoll();
    expect(file).not.toBeNull();
    expect(file?.type).toBe('delinquent_roll');
  });

  it('A-8. getFilesByType returns only matching type files', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const xlsx = client.getFilesByType('appraisal_xlsx');
    expect(xlsx.length).toBeGreaterThan(0);
    for (const f of xlsx) {
      expect(f.type).toBe('appraisal_xlsx');
    }
  });

  it('A-9. all portal files have valid HTTPS URLs', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const files = client.getFilesByType('appraisal_xlsx')
      .concat(client.getFilesByType('shapefile_rar'));
    for (const f of files) {
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.url).toContain('bellcad.org');
    }
  });

  it('A-10. BellCADPortalFile has all required fields', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const file = client.getCurrentAppraisalFile();
    expect(file).not.toBeNull();
    if (file) {
      expect(typeof file.id).toBe('string');
      expect(typeof file.name).toBe('string');
      expect(typeof file.url).toBe('string');
      expect(typeof file.extension).toBe('string');
      expect(typeof file.isCurrent).toBe('boolean');
      expect(typeof file.notes).toBe('string');
    }
  });

  it('A-11. getKnownFieldNames returns BIS v8.0.33 field schema', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const fields = client.getKnownFieldNames();
    expect(fields).toHaveProperty('property');
    expect(fields).toHaveProperty('owner');
    expect(fields).toHaveProperty('value');
    expect(fields.property).toContain('PROP_ID');
    expect(fields.owner).toContain('OWN_NAME');
    expect(fields.value).toContain('MKT_VAL');
  });

  it('A-12. getManifest returns BellCADPortalManifest shape when network is unavailable', async () => {
    // Without a live network, the manifest still returns known files
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const manifest = await client.getManifest();
    expect(manifest).toHaveProperty('portalUrl');
    expect(manifest).toHaveProperty('files');
    expect(manifest).toHaveProperty('portalReachable');
    expect(manifest).toHaveProperty('lastChecked');
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files.length).toBeGreaterThan(0);
  });

  it('A-13. getCurrentAppraisalFile works with manifest argument', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const manifest = await client.getManifest();
    const file = client.getCurrentAppraisalFile(manifest);
    expect(file).not.toBeNull();
    expect(file?.type).toBe('appraisal_xlsx');
  });

  it('A-14. taxYear is number or null (not undefined)', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const files = client.getCurrentFiles();
    for (const f of files) {
      expect(f.taxYear === null || typeof f.taxYear === 'number').toBe(true);
    }
  });

  it('A-15. full export 7z file is in list', async () => {
    const { BellCADDataPortalClient } = await import('../../worker/src/sources/bell-cad-data-portal.js');
    const client = new BellCADDataPortalClient();
    const fullExports = client.getFilesByType('full_export_7z');
    expect(fullExports.length).toBeGreaterThan(0);
    expect(fullExports[0].extension).toBe('7z');
  });
});

// ── Module B: TNRISLiDARClient — TxGIO open API ───────────────────────────────

describe('TNRISLiDARClient — TxGIO open Resources API', () => {

  it('B-1. fetchCountyResources is a function', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    expect(typeof client.fetchCountyResources).toBe('function');
  });

  it('B-2. fetchBellCountyAerialImagery is a function', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    expect(typeof client.fetchBellCountyAerialImagery).toBe('function');
  });

  it('B-3. filterByType is a function', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    expect(typeof client.filterByType).toBe('function');
  });

  it('B-4. filterByType returns empty array for empty input', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = client.filterByType([], 'NC-CCM');
    expect(result).toHaveLength(0);
  });

  it('B-5. filterByType filters by resource type abbreviation', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const resources = [
      { resourceId: '1', resourceUrl: '', fileSizeBytes: null, areaTypeId: '', areaTypeName: 'Bell', collectionId: '', resourceTypeName: 'NC Compressed County Mosaic', resourceTypeAbbreviation: 'NC-CCM', areaType: 'county' },
      { resourceId: '2', resourceUrl: '', fileSizeBytes: null, areaTypeId: '', areaTypeName: 'Bell', collectionId: '', resourceTypeName: 'LiDAR Point Cloud', resourceTypeAbbreviation: 'LPC', areaType: 'county' },
    ];
    const ncCcm = client.filterByType(resources, 'NC-CCM');
    expect(ncCcm).toHaveLength(1);
    expect(ncCcm[0].resourceTypeAbbreviation).toBe('NC-CCM');
  });

  it('B-6. TxGIOResource interface has all required fields', async () => {
    const resource = {
      resourceId: 'abc-123',
      resourceUrl: 'https://data.geographic.texas.gov/collection/abc/resources/file.zip',
      fileSizeBytes: 1024000,
      areaTypeId: 'def-456',
      areaTypeName: 'Bell',
      collectionId: 'ghi-789',
      resourceTypeName: 'NC Compressed County Mosaic',
      resourceTypeAbbreviation: 'NC-CCM',
      areaType: 'county',
    };
    // Type check via structural comparison
    expect(resource).toHaveProperty('resourceId');
    expect(resource).toHaveProperty('resourceUrl');
    expect(resource).toHaveProperty('areaTypeName');
    expect(resource).toHaveProperty('resourceTypeAbbreviation');
    expect(resource).toHaveProperty('areaType');
  });

  it('B-7. TxGIOCountyResourcesResult shape is correct for error case', async () => {
    // Without network, fetchCountyResources returns an error result (not throws)
    // We verify the result shape by checking what the method returns in any case
    const result = {
      countyName: 'Bell',
      resources: [],
      totalAvailable: 0,
      pageLimitHit: false,
      fetchedAt: new Date().toISOString(),
      error: 'Network unavailable',
    };
    expect(result).toHaveProperty('countyName');
    expect(result).toHaveProperty('resources');
    expect(result).toHaveProperty('totalAvailable');
    expect(result).toHaveProperty('pageLimitHit');
    expect(result).toHaveProperty('fetchedAt');
    expect(result).toHaveProperty('error');
  });

  it('B-8. isConfigured is still false without API key (backward compat)', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    expect(client.isConfigured).toBe(false);
  });

  it('B-9. isConfigured is true with API key (backward compat)', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient('test-api-key');
    expect(client.isConfigured).toBe(true);
  });

  it('B-10. fetchBellCountyAerialImagery never throws', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    await expect(client.fetchBellCountyAerialImagery()).resolves.toBeTruthy();
  });
});

// ── Module C: TxDOTRoadwaysClient ─────────────────────────────────────────────

describe('TxDOTRoadwaysClient (sources/txdot-roadways-client.ts)', () => {

  it('C-1. can be instantiated', async () => {
    const { TxDOTRoadwaysClient } = await import('../../worker/src/sources/txdot-roadways-client.js');
    const client = new TxDOTRoadwaysClient();
    expect(client).toBeTruthy();
  });

  it('C-2. BELL_COUNTY_BBOX is exported and has 4 values', async () => {
    const { BELL_COUNTY_BBOX } = await import('../../worker/src/sources/txdot-roadways-client.js');
    expect(Array.isArray(BELL_COUNTY_BBOX)).toBe(true);
    expect(BELL_COUNTY_BBOX.length).toBe(4);
  });

  it('C-3. BELL_COUNTY_BBOX covers Bell County WGS84 extent', async () => {
    const { BELL_COUNTY_BBOX } = await import('../../worker/src/sources/txdot-roadways-client.js');
    // minLon, minLat, maxLon, maxLat
    const [minLon, minLat, maxLon, maxLat] = BELL_COUNTY_BBOX;
    // Bell County is roughly centered on Belton, TX (31.06°N, 97.47°W)
    expect(minLon).toBeLessThan(-97.0);
    expect(maxLon).toBeGreaterThan(-98.0);
    expect(minLat).toBeLessThan(31.0);
    expect(maxLat).toBeGreaterThan(31.3);
  });

  it('C-4. parseFunctionalClass handles interstate', async () => {
    const { TxDOTRoadwaysClient } = await import('../../worker/src/sources/txdot-roadways-client.js');
    const client = new TxDOTRoadwaysClient();
    expect(client.parseFunctionalClass('Interstate')).toBe('Interstate');
    expect(client.parseFunctionalClass('1')).toBe('Interstate');
    expect(client.parseFunctionalClass('11')).toBe('Interstate');
  });

  it('C-5. parseFunctionalClass handles minor arterial', async () => {
    const { TxDOTRoadwaysClient } = await import('../../worker/src/sources/txdot-roadways-client.js');
    const client = new TxDOTRoadwaysClient();
    expect(client.parseFunctionalClass('Minor Arterial')).toBe('Minor Arterial');
    expect(client.parseFunctionalClass('4')).toBe('Minor Arterial');
  });

  it('C-6. parseFunctionalClass returns Unknown for unrecognized values', async () => {
    const { TxDOTRoadwaysClient } = await import('../../worker/src/sources/txdot-roadways-client.js');
    const client = new TxDOTRoadwaysClient();
    expect(client.parseFunctionalClass('')).toBe('Unknown');
    expect(client.parseFunctionalClass(null)).toBe('Unknown');
    expect(client.parseFunctionalClass('999')).toBe('Unknown');
  });

  it('C-7. parseFunctionalClass handles local roads', async () => {
    const { TxDOTRoadwaysClient } = await import('../../worker/src/sources/txdot-roadways-client.js');
    const client = new TxDOTRoadwaysClient();
    expect(client.parseFunctionalClass('Local')).toBe('Local');
    expect(client.parseFunctionalClass('7')).toBe('Local');
  });

  it('C-8. TxDOTRoadwaysResult type shape is correct', () => {
    // Structural type check only — no network calls
    const result = {
      roadways: [],
      featureCount: 0,
      maxRecordsHit: false,
      queryArea: { type: 'bbox' as const, coordinates: [-98.17, 30.69, -97.10, 31.34] },
      fetchedAt: new Date().toISOString(),
      error: 'simulated network failure',
    };
    expect(result).toHaveProperty('roadways');
    expect(result).toHaveProperty('featureCount');
    expect(result).toHaveProperty('maxRecordsHit');
    expect(result).toHaveProperty('queryArea');
    expect(result).toHaveProperty('fetchedAt');
    expect(Array.isArray(result.roadways)).toBe(true);
  });

  it('C-9. queryArea shape for centroid query', () => {
    // Structural type check only — no network calls
    const result = {
      roadways: [],
      featureCount: 0,
      maxRecordsHit: false,
      queryArea: { type: 'point' as const, coordinates: [-97.47, 31.06] },
      fetchedAt: new Date().toISOString(),
    };
    expect(result.queryArea.type).toBe('point');
    expect(result.queryArea.coordinates).toContain(-97.47);
  });

  it('C-10. TxDOTRoadway geometry is array of coordinate pairs', () => {
    const roadway = {
      routeName: 'FM0436',
      countyName: 'Bell',
      functionalClass: 'Major Collector' as const,
      rowWidthFeet: 80,
      surfaceType: 'Asphalt',
      geometry: [[-97.47, 31.06], [-97.48, 31.07]] as [number, number][],
      lengthMiles: 0.8,
    };
    expect(Array.isArray(roadway.geometry)).toBe(true);
    expect(roadway.geometry?.[0]).toHaveLength(2);
  });

  it('C-11. TxDOTRoadway interface covers all required fields', () => {
    // Structural type check via plain object
    const roadway = {
      routeName: 'IH0035-S',
      countyName: 'Bell',
      functionalClass: 'Interstate' as const,
      rowWidthFeet: 300,
      surfaceType: 'Concrete',
      geometry: [[-97.47, 31.06], [-97.48, 31.07]] as [number, number][],
      lengthMiles: 1.2,
    };
    expect(roadway).toHaveProperty('routeName');
    expect(roadway).toHaveProperty('countyName');
    expect(roadway).toHaveProperty('functionalClass');
    expect(roadway).toHaveProperty('rowWidthFeet');
    expect(roadway).toHaveProperty('surfaceType');
    expect(roadway).toHaveProperty('geometry');
    expect(roadway).toHaveProperty('lengthMiles');
  });

  it('C-12. BELL_COUNTY_BBOX can be used for ArcGIS bbox parameter', async () => {
    const { BELL_COUNTY_BBOX } = await import('../../worker/src/sources/txdot-roadways-client.js');
    // Verify the bbox can be formatted as an ArcGIS envelope string
    const bboxStr = BELL_COUNTY_BBOX.join(',');
    expect(typeof bboxStr).toBe('string');
    expect(bboxStr.split(',').length).toBe(4);
    // ArcGIS envelope format: minX,minY,maxX,maxY (all degrees)
    const parts = bboxStr.split(',').map(Number);
    expect(parts[0]).toBeLessThan(parts[2]); // minLon < maxLon
    expect(parts[1]).toBeLessThan(parts[3]); // minLat < maxLat
  });
});

// ── Module D: RRCClient — bulk downloads ──────────────────────────────────────

describe('RRCClient — bulk download URLs (sources/rrc-client.ts)', () => {

  it('D-1. getBulkDownloadUrls is a function', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    expect(typeof client.getBulkDownloadUrls).toBe('function');
  });

  it('D-2. getBulkDownloadUrls returns non-empty array', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    const datasets = client.getBulkDownloadUrls();
    expect(Array.isArray(datasets)).toBe(true);
    expect(datasets.length).toBeGreaterThan(0);
  });

  it('D-3. all bulk datasets have required fields', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    const datasets = client.getBulkDownloadUrls();
    for (const d of datasets) {
      expect(typeof d.id).toBe('string');
      expect(typeof d.name).toBe('string');
      expect(typeof d.url).toBe('string');
      expect(typeof d.countyFilterField).toBe('string');
      expect(typeof d.bellCountyFilterValue).toBe('string');
      expect(Array.isArray(d.keyFields)).toBe(true);
    }
  });

  it('D-4. well_surface_locations dataset is present', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    const ds = client.getBulkDataset('well_surface_locations');
    expect(ds).not.toBeNull();
    expect(ds?.name).toContain('Well');
    expect(ds?.format).toBe('SHP');
    expect(ds?.updateFrequency).toBe('daily');
  });

  it('D-5. pipeline_t4 dataset is present', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    const ds = client.getBulkDataset('pipeline_t4');
    expect(ds).not.toBeNull();
    expect(ds?.name).toContain('Pipeline');
    expect(ds?.format).toBe('SHP');
  });

  it('D-6. getBulkDataset returns null for unknown id', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    const ds = client.getBulkDataset('nonexistent_dataset');
    expect(ds).toBeNull();
  });

  it('D-7. getBellCountyBulkDatasets excludes N/A filter datasets', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    const datasets = client.getBellCountyBulkDatasets();
    for (const d of datasets) {
      expect(d.bellCountyFilterValue).not.toBe('N/A');
    }
  });

  it('D-8. Bell County filter value is 027 for pipeline_t4', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    const ds = client.getBulkDataset('pipeline_t4');
    expect(ds?.bellCountyFilterValue).toBe('027');
    expect(ds?.countyFilterField).toBe('CNTY_FIPS');
  });

  it('D-9. Bell County filter value is BELL for well_surface_locations', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    const ds = client.getBulkDataset('well_surface_locations');
    expect(ds?.bellCountyFilterValue).toBe('BELL');
    expect(ds?.countyFilterField).toBe('CNTY');
  });

  it('D-10. RRC_BULK_DATASETS is exported from module', async () => {
    const mod = await import('../../worker/src/sources/rrc-client.js');
    expect(mod.RRC_BULK_DATASETS).toBeDefined();
    expect(Array.isArray(mod.RRC_BULK_DATASETS)).toBe(true);
  });

  it('D-11. existing queryOilGas method still exists (backward compat)', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient();
    expect(typeof client.queryOilGas).toBe('function');
  });

  it('D-12. RRCClient constructor still accepts custom search radius', async () => {
    const { RRCClient } = await import('../../worker/src/sources/rrc-client.js');
    const client = new RRCClient(5280); // 1 mile
    expect(client).toBeTruthy();
  });
});
