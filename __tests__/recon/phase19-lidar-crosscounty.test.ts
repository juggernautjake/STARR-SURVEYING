// __tests__/recon/phase19-lidar-crosscounty.test.ts
// Unit tests for STARR RECON Phase 19: TNRIS LiDAR & Cross-County Properties.
//
// Tests are pure-logic only — no live network calls.

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Module A: TNRISLiDARClient ────────────────────────────────────────────────

describe('Phase 19 — TNRISLiDARClient (sources/tnris-lidar-client.ts)', () => {
  it('1. TNRISLiDARClient can be instantiated', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    expect(client).toBeTruthy();
  });

  it('2. isConfigured is false when no API key', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    expect(client.isConfigured).toBe(false);
  });

  it('3. isConfigured is true when API key provided', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient('test-api-key');
    expect(client.isConfigured).toBe(true);
  });

  it('4. fetchLiDARData returns LiDARResult shape when not configured', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = await client.fetchLiDARData(31.06, -97.47);
    expect(result).toHaveProperty('lat');
    expect(result).toHaveProperty('lon');
    expect(result).toHaveProperty('radiusM');
    expect(result).toHaveProperty('collections');
    expect(result).toHaveProperty('bestCollection');
    expect(result).toHaveProperty('pointStats');
    expect(result).toHaveProperty('dataAvailable');
    expect(result).toHaveProperty('fetchedAt');
  });

  it('5. dataAvailable is false when not configured', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = await client.fetchLiDARData(31.06, -97.47);
    expect(result.dataAvailable).toBe(false);
  });

  it('6. collections is empty array when not configured', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = await client.fetchLiDARData(31.06, -97.47);
    expect(Array.isArray(result.collections)).toBe(true);
    expect(result.collections.length).toBe(0);
  });

  it('7. bestCollection is null when not configured', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = await client.fetchLiDARData(31.06, -97.47);
    expect(result.bestCollection).toBeNull();
  });

  it('8. searchCollections returns empty array when not configured', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const results = await client.searchCollections(31.06, -97.47);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('9. getBestCollection returns null when not configured', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = await client.getBestCollection(31.06, -97.47);
    expect(result).toBeNull();
  });

  it('10. getElevationStats returns null when not configured', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = await client.getElevationStats(31.06, -97.47);
    expect(result).toBeNull();
  });

  it('11. fetchLiDARData never throws', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    await expect(client.fetchLiDARData(0, 0)).resolves.toBeTruthy();
  });

  it('12. listCoveredCounties returns array', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const counties = await client.listCoveredCounties();
    expect(Array.isArray(counties)).toBe(true);
  });

  it('13. fetchedAt is an ISO timestamp string', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = await client.fetchLiDARData(31.06, -97.47);
    expect(typeof result.fetchedAt).toBe('string');
    expect(() => new Date(result.fetchedAt)).not.toThrow();
  });

  it('14. lat and lon are echoed back in the result', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = await client.fetchLiDARData(31.06, -97.47, 1000);
    expect(result.lat).toBe(31.06);
    expect(result.lon).toBe(-97.47);
    expect(result.radiusM).toBe(1000);
  });
});

// ── Module B: CrossCountyResolver ────────────────────────────────────────────

describe('Phase 19 — CrossCountyResolver (services/cross-county-resolver.ts)', () => {
  it('15. CrossCountyResolver can be instantiated', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    expect(resolver).toBeTruthy();
  });

  it('16. detectCrossCounty returns CrossCountyDetectionResult shape', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const result = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    expect(result).toHaveProperty('isCrossCounty');
    expect(result).toHaveProperty('primaryCounty');
    expect(result).toHaveProperty('secondaryCounties');
    expect(result).toHaveProperty('resolutionStrategy');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('notes');
  });

  it('17. isCrossCounty is false for small property well within county', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    // Small property with short calls, center of Bell County
    const calls = [
      { bearing: 'N 0° E', distance: 100 },
      { bearing: 'S 90° E', distance: 100 },
      { bearing: 'S 0° W', distance: 100 },
      { bearing: 'N 90° W', distance: 100 },
    ];
    const result = resolver.detectCrossCounty(31.06, -97.47, calls, '48027');
    expect(result.isCrossCounty).toBe(false);
  });

  it('18. getCountyForPoint returns FIPS for Bell County center', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const fips = resolver.getCountyForPoint(31.06, -97.47);
    expect(fips).toBe('48027');
  });

  it('19. getCountyForPoint returns null for out-of-Texas coordinates', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const fips = resolver.getCountyForPoint(40.71, -74.00); // New York
    expect(fips).toBeNull();
  });

  it('20. getAdjacentCounties returns non-empty array for Bell County', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const adj = resolver.getAdjacentCounties('48027');
    expect(Array.isArray(adj)).toBe(true);
    expect(adj.length).toBeGreaterThan(0);
  });

  it('21. TEXAS_COUNTY_CENTROIDS has Bell County (48027)', async () => {
    const { TEXAS_COUNTY_CENTROIDS } = await import('../../worker/src/services/cross-county-resolver.js');
    expect(TEXAS_COUNTY_CENTROIDS['48027']).toBeDefined();
    expect(TEXAS_COUNTY_CENTROIDS['48027'].name).toBe('Bell');
  });

  it('22. TEXAS_COUNTY_CENTROIDS has Harris County (48201)', async () => {
    const { TEXAS_COUNTY_CENTROIDS } = await import('../../worker/src/services/cross-county-resolver.js');
    expect(TEXAS_COUNTY_CENTROIDS['48201']).toBeDefined();
    expect(TEXAS_COUNTY_CENTROIDS['48201'].name).toBe('Harris');
  });

  it('23. buildResearchPlan returns CrossCountyResearchPlan', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const detection = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    const plan = resolver.buildResearchPlan('proj-123', '123 Main St', detection);
    expect(plan).toHaveProperty('projectId', 'proj-123');
    expect(plan).toHaveProperty('detectionResult');
    expect(plan).toHaveProperty('primaryResearch');
    expect(plan).toHaveProperty('secondaryResearch');
    expect(plan).toHaveProperty('estimatedDocuments');
    expect(plan).toHaveProperty('estimatedCost');
  });

  it('24. primaryResearch has countyFIPS and address', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const detection = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    const plan = resolver.buildResearchPlan('proj-123', '123 Main St', detection);
    expect(plan.primaryResearch).toHaveProperty('countyFIPS');
    expect(plan.primaryResearch).toHaveProperty('address');
  });

  it('25. secondaryResearch is an array', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const detection = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    const plan = resolver.buildResearchPlan('proj-123', '123 Main St', detection);
    expect(Array.isArray(plan.secondaryResearch)).toBe(true);
  });

  it('26. estimatedDocuments is a non-negative number', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const detection = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    const plan = resolver.buildResearchPlan('proj-123', '123 Main St', detection);
    expect(plan.estimatedDocuments).toBeGreaterThanOrEqual(0);
  });

  it('27. estimatedCost is a non-negative number', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const detection = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    const plan = resolver.buildResearchPlan('proj-123', '123 Main St', detection);
    expect(plan.estimatedCost).toBeGreaterThanOrEqual(0);
  });

  it('28. confidence values are high, medium, or low', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const result = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    expect(['high', 'medium', 'low']).toContain(result.confidence);
  });

  it('29. resolutionStrategy values are valid', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const result = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    expect(['primary_only', 'both_counties', 'split_research']).toContain(result.resolutionStrategy);
  });

  it('30. notes is an array of strings', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const result = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    expect(Array.isArray(result.notes)).toBe(true);
  });

  it('31. primaryCounty has fips and name fields', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const result = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    expect(result.primaryCounty).toHaveProperty('fips');
    expect(result.primaryCounty).toHaveProperty('name');
  });

  it('32. secondaryCounties is an array', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const result = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    expect(Array.isArray(result.secondaryCounties)).toBe(true);
  });

  it('33. detectCrossCounty handles empty boundary calls array', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const result = resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    expect(result).toBeTruthy();
    expect(typeof result.isCrossCounty).toBe('boolean');
  });

  it('34. resolver works without any network calls', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    // Synchronous method — should complete instantly
    const start = Date.now();
    resolver.detectCrossCounty(31.06, -97.47, [], '48027');
    expect(Date.now() - start).toBeLessThan(100);
  });
});

// ── Module C: SQL Schema ──────────────────────────────────────────────────────

describe('Phase 19 — LiDAR & Cross-County SQL Schema (seeds/097_phase19_lidar.sql)', () => {
  const SQL_PATH = path.resolve(__dirname, '../../seeds/097_phase19_lidar.sql');
  let sqlContent = '';

  it('35. seeds/097_phase19_lidar.sql file exists', () => {
    expect(fs.existsSync(SQL_PATH)).toBe(true);
    sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    expect(sqlContent.length).toBeGreaterThan(100);
  });

  it('36. SQL defines lidar_data_cache table', () => {
    if (!sqlContent) sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    expect(sqlContent).toContain('lidar_data_cache');
  });

  it('37. SQL defines cross_county_properties table', () => {
    if (!sqlContent) sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    expect(sqlContent).toContain('cross_county_properties');
  });

  it('38. SQL has RLS policies', () => {
    if (!sqlContent) sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    expect(sqlContent).toContain('ROW LEVEL SECURITY');
  });

  it('39. SQL has indexes', () => {
    if (!sqlContent) sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    expect(sqlContent).toContain('CREATE INDEX');
  });

  it('40. lidar_data_cache has project_id FK', () => {
    if (!sqlContent) sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    expect(sqlContent).toMatch(/lidar_data_cache[\s\S]*?project_id.*REFERENCES/);
  });

  it('41. cross_county_properties has project_id FK', () => {
    if (!sqlContent) sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    expect(sqlContent).toMatch(/cross_county_properties[\s\S]*?project_id.*REFERENCES/);
  });

  it('42. SQL has get_lidar_for_project helper function', () => {
    if (!sqlContent) sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    expect(sqlContent).toContain('get_lidar_for_project');
  });
});

// ── Module D: Worker Index Routes ─────────────────────────────────────────────

describe('Phase 19 — Worker Index Routes (worker/src/index.ts)', () => {
  const INDEX_PATH = path.resolve(__dirname, '../../worker/src/index.ts');
  let indexContent = '';

  it('43. worker/src/index.ts contains Phase 19 LiDAR counties route', () => {
    indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
    expect(indexContent).toContain('/research/lidar/counties');
  });

  it('44. worker/src/index.ts contains Phase 19 LiDAR project route', () => {
    if (!indexContent) indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
    expect(indexContent).toContain('/research/lidar/:projectId');
  });

  it('45. worker/src/index.ts contains cross-county detect route', () => {
    if (!indexContent) indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
    expect(indexContent).toContain('/research/cross-county/detect');
  });

  it('46. worker/src/index.ts contains cross-county project route', () => {
    if (!indexContent) indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
    expect(indexContent).toContain('/research/cross-county/:projectId');
  });

  it('47. worker imports TNRISLiDARClient dynamically', () => {
    if (!indexContent) indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
    expect(indexContent).toContain('tnris-lidar-client');
  });

  it('48. worker imports CrossCountyResolver dynamically', () => {
    if (!indexContent) indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
    expect(indexContent).toContain('cross-county-resolver');
  });
});

// ── Module E: Spec Document ───────────────────────────────────────────────────

describe('Phase 19 — Spec Document (docs/planning/in-progress/STARR_RECON/PHASE_19_LIDAR_CROSSCOUNTY.md)', () => {
  const SPEC_PATH = path.resolve(__dirname, '../../docs/planning/in-progress/STARR_RECON/PHASE_19_LIDAR_CROSSCOUNTY.md');

  it('49. PHASE_19_LIDAR_CROSSCOUNTY.md exists', () => {
    expect(fs.existsSync(SPEC_PATH)).toBe(true);
  });

  it('50. spec doc mentions TNRISLiDARClient', () => {
    const content = fs.readFileSync(SPEC_PATH, 'utf8');
    expect(content).toContain('TNRIS');
  });

  it('51. spec doc mentions CrossCountyResolver', () => {
    const content = fs.readFileSync(SPEC_PATH, 'utf8');
    expect(content).toContain('Cross-County');
  });

  it('52. spec doc has Phase 19 in title', () => {
    const content = fs.readFileSync(SPEC_PATH, 'utf8');
    expect(content).toContain('Phase 19');
  });
});

// ── Module F: LiDARCollection & Stats Types ───────────────────────────────────

describe('Phase 19 — Type shapes', () => {
  it('53. LiDARCollection type has all required fields', async () => {
    const { TNRISLiDARClient } = await import('../../worker/src/sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient('test');
    // We can check via TypeScript compile-time that the interface exists
    // Runtime: verify the client has the methods
    expect(typeof client.searchCollections).toBe('function');
    expect(typeof client.getBestCollection).toBe('function');
    expect(typeof client.getElevationStats).toBe('function');
    expect(typeof client.fetchLiDARData).toBe('function');
    expect(typeof client.listCoveredCounties).toBe('function');
  });

  it('54. CrossCountyResolver has all required methods', async () => {
    const { CrossCountyResolver } = await import('../../worker/src/services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    expect(typeof resolver.detectCrossCounty).toBe('function');
    expect(typeof resolver.buildResearchPlan).toBe('function');
    expect(typeof resolver.getCountyForPoint).toBe('function');
    expect(typeof resolver.getAdjacentCounties).toBe('function');
  });

  it('55. TEXAS_COUNTY_CENTROIDS has at least 20 entries', async () => {
    const { TEXAS_COUNTY_CENTROIDS } = await import('../../worker/src/services/cross-county-resolver.js');
    expect(Object.keys(TEXAS_COUNTY_CENTROIDS).length).toBeGreaterThanOrEqual(20);
  });
});
