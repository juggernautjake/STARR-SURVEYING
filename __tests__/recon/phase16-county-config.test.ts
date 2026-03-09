// __tests__/recon/phase16-county-config.test.ts
// Unit tests for STARR RECON Phase 16: County Configuration Registry & USPS Address Validation.
//
// Phase 16 delivers:
//   Module A: CountyConfigRegistry     (infra/county-config-registry.ts)
//   Module B: USPSAddressClient        (services/usps-address-client.ts)
//   Module C: normalizeTexasAddress    (services/usps-address-client.ts)
//   Module D: County Config Schema     (seeds/094_phase16_county_config.sql)
//   Module E: County Config API Route  (app/api/admin/research/county-config/route.ts)
//
// Tests are pure-logic only — no live network calls, no real USPS API calls.
//
// Test index:
//
// ── Module A: CountyConfigRegistry ───────────────────────────────────────────
//  1.  CountyConfigRegistry can be instantiated
//  2.  Registry loads 10 default county configs on construction
//  3.  get('48113', 'tyler_pay') returns Dallas config
//  4.  get('48027', 'henschen_pay') returns Bell County config
//  5.  get('99999') returns null for unknown FIPS
//  6.  get('48113') without platform returns first match for FIPS
//  7.  set() adds a new county config
//  8.  set() overwrites an existing config for same FIPS+platform
//  9.  getAll() returns array with at least 10 entries
//  10. getPlatformDefaults('tyler_pay') returns selectors object
//  11. getPlatformDefaults('unknown_platform') returns empty object
//  12. merge() combines base and override, preferring override
//  13. merge() deep-merges selectors without losing base keys
//  14. validate() returns valid=true for fully-specified config
//  15. validate() returns valid=false and lists missingFields
//
// ── Module B: USPSAddressClient ───────────────────────────────────────────────
//  16. USPSAddressClient can be instantiated without arguments
//  17. isConfigured = false when USPS_USER_ID env var not set
//  18. USPSAddressClient accepts explicit userId
//  19. isConfigured = true when userId provided to constructor
//  20. verify() returns fallback result when not configured
//  21. verify() fallback preserves address1 from input
//  22. verify() fallback preserves city/state from input
//  23. verify() fallback isDeliverable = false
//  24. verify() fallback isCorrected = false
//  25. verifyBatch([]) returns empty array
//  26. verifyBatch with 3 addresses returns 3 results when not configured
//  27. verifyBatch respects 5-address USPS limit (input >5 returns 5 results)
//  28. normalize() returns null for empty string
//  29. normalize() parses freeform address string when not configured
//  30. normalize() returns non-null for valid address string
//
// ── Module C: normalizeTexasAddress ──────────────────────────────────────────
//  31. normalizeTexasAddress returns address with state='TX'
//  32. FM road: "FM 123 RD" normalizes to include "FM 123 Rd"
//  33. FM road: "FM2305" normalizes to include "FM 2305 Rd"
//  34. County road: "CR 456" normalizes to "County Road 456"
//  35. Rural route: "RR 1 BOX 123" normalizes to "RR 1 Box 123"
//  36. isRuralRoute = true for "RR 1 Box 123"
//  37. isRuralRoute = false for regular street address
//  38. Highway: "HWY 190" normalizes to "Highway 190"
//  39. isHighwayAddress = true for "HWY 190"
//  40. isHighwayAddress = false for regular street
//
// ── Module D: County Config SQL Schema ───────────────────────────────────────
//  41. seeds/094_phase16_county_config.sql file exists
//  42. SQL file defines county_portal_configs table
//  43. SQL file has UNIQUE constraint on (county_fips, platform)
//  44. SQL file has RLS enabled
//  45. SQL file has authenticated policy for SELECT
//  46. SQL file has service_role policy for all operations
//  47. SQL file defines index on county_fips
//  48. SQL file defines index on platform
//  49. SQL file defines updated_at trigger
//  50. SQL file has platform CHECK constraint
//
// ── Module E: County Config API Route ────────────────────────────────────────
//  51. app/api/admin/research/county-config/route.ts file exists
//  52. Route exports GET handler
//  53. Route exports POST handler
//  54. Route exports DELETE handler
//  55. countyConfigRegistry singleton is exported from county-config-registry.ts

import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync:    vi.fn().mockReturnValue(true),
      mkdirSync:     vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync:  vi.fn().mockReturnValue('[]'),
    },
    existsSync:    vi.fn().mockReturnValue(true),
    mkdirSync:     vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync:  vi.fn().mockReturnValue('[]'),
  };
});

vi.mock('https', () => ({
  default: { get: vi.fn(), request: vi.fn() },
  get: vi.fn(),
  request: vi.fn(),
}));

vi.mock('http', () => ({
  default: { get: vi.fn() },
  get: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  CountyConfigRegistry,
  countyConfigRegistry,
  type CountyPortalConfig,
} from '../../worker/src/infra/county-config-registry.js';

import {
  USPSAddressClient,
  normalizeTexasAddress,
} from '../../worker/src/services/usps-address-client.js';

// ── Module A: CountyConfigRegistry ───────────────────────────────────────────

describe('Phase 16 — CountyConfigRegistry (infra/county-config-registry.ts)', () => {
  it('1. CountyConfigRegistry can be instantiated', () => {
    const registry = new CountyConfigRegistry();
    expect(registry).toBeDefined();
    expect(registry).toBeInstanceOf(CountyConfigRegistry);
  });

  it('2. Registry loads 10 default county configs on construction', () => {
    const registry = new CountyConfigRegistry();
    const all = registry.getAll();
    expect(all.length).toBeGreaterThanOrEqual(10);
  });

  it('3. get("48113", "tyler_pay") returns Dallas config', () => {
    const registry = new CountyConfigRegistry();
    const config = registry.get('48113', 'tyler_pay');
    expect(config).not.toBeNull();
    expect(config?.countyFIPS).toBe('48113');
    expect(config?.countyName).toBe('Dallas');
    expect(config?.platform).toBe('tyler_pay');
  });

  it('4. get("48027", "henschen_pay") returns Bell County config', () => {
    const registry = new CountyConfigRegistry();
    const config = registry.get('48027', 'henschen_pay');
    expect(config).not.toBeNull();
    expect(config?.countyName).toBe('Bell');
    expect(config?.platform).toBe('henschen_pay');
  });

  it('5. get("99999") returns null for unknown FIPS', () => {
    const registry = new CountyConfigRegistry();
    expect(registry.get('99999')).toBeNull();
    expect(registry.get('99999', 'tyler_pay')).toBeNull();
  });

  it('6. get("48113") without platform returns first match for FIPS', () => {
    const registry = new CountyConfigRegistry();
    const config = registry.get('48113');
    expect(config).not.toBeNull();
    expect(config?.countyFIPS).toBe('48113');
  });

  it('7. set() adds a new county config', () => {
    const registry = new CountyConfigRegistry();
    const newConfig: CountyPortalConfig = {
      countyFIPS: '48999',
      countyName: 'TestCounty',
      platform: 'landex',
      rateLimitRpm: 30,
    };
    registry.set(newConfig);
    const retrieved = registry.get('48999', 'landex');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.countyName).toBe('TestCounty');
  });

  it('8. set() overwrites an existing config for same FIPS+platform', () => {
    const registry = new CountyConfigRegistry();
    const updated: CountyPortalConfig = {
      countyFIPS: '48113',
      countyName: 'Dallas',
      platform: 'tyler_pay',
      baseUrl: 'https://new-dallas.tylerpay.com',
      rateLimitRpm: 25,
    };
    registry.set(updated);
    const config = registry.get('48113', 'tyler_pay');
    expect(config?.baseUrl).toBe('https://new-dallas.tylerpay.com');
    expect(config?.rateLimitRpm).toBe(25);
  });

  it('9. getAll() returns array with at least 10 entries', () => {
    const registry = new CountyConfigRegistry();
    const all = registry.getAll();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(all[0]).toHaveProperty('countyFIPS');
    expect(all[0]).toHaveProperty('platform');
  });

  it('10. getPlatformDefaults("tyler_pay") returns selectors object', () => {
    const registry = new CountyConfigRegistry();
    const defaults = registry.getPlatformDefaults('tyler_pay');
    expect(defaults).toBeDefined();
    expect(defaults.selectors).toBeDefined();
    expect(typeof defaults.selectors?.searchInput).toBe('string');
  });

  it('11. getPlatformDefaults("unknown_platform") returns empty object', () => {
    const registry = new CountyConfigRegistry();
    const defaults = registry.getPlatformDefaults('unknown_platform');
    expect(defaults).toEqual({});
  });

  it('12. merge() combines base and override, preferring override', () => {
    const registry = new CountyConfigRegistry();
    const base: Partial<CountyPortalConfig> = {
      countyFIPS: '48113',
      countyName: 'Dallas',
      platform: 'tyler_pay',
      rateLimitRpm: 20,
    };
    const override: Partial<CountyPortalConfig> = {
      countyFIPS: '48113',
      countyName: 'Dallas',
      platform: 'tyler_pay',
      rateLimitRpm: 10,
      baseUrl: 'https://custom.dallas.com',
    };
    const merged = registry.merge(base, override);
    expect(merged.rateLimitRpm).toBe(10);
    expect(merged.baseUrl).toBe('https://custom.dallas.com');
  });

  it('13. merge() deep-merges selectors without losing base keys', () => {
    const registry = new CountyConfigRegistry();
    const base: Partial<CountyPortalConfig> = {
      countyFIPS: '48113',
      countyName: 'Dallas',
      platform: 'tyler_pay',
      selectors: {
        searchInput: '#OldSearch',
        purchaseButton: '#Purchase',
        downloadButton: '#Download',
      },
    };
    const override: Partial<CountyPortalConfig> = {
      countyFIPS: '48113',
      countyName: 'Dallas',
      platform: 'tyler_pay',
      selectors: {
        searchInput: '#NewSearch',
      },
    };
    const merged = registry.merge(base, override);
    expect(merged.selectors?.searchInput).toBe('#NewSearch');
    expect(merged.selectors?.purchaseButton).toBe('#Purchase');
    expect(merged.selectors?.downloadButton).toBe('#Download');
  });

  it('14. validate() returns valid=true for a fully-specified landex config', () => {
    const registry = new CountyConfigRegistry();
    const config: CountyPortalConfig = {
      countyFIPS: '48113',
      countyName: 'Dallas',
      platform: 'landex',
    };
    const result = registry.validate(config);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it('15. validate() returns valid=false and lists missingFields for incomplete config', () => {
    const registry = new CountyConfigRegistry();
    const config: CountyPortalConfig = {
      countyFIPS: '48113',
      countyName: 'Dallas',
      platform: 'tyler_pay',
      // no selectors at all
    };
    const result = registry.validate(config);
    expect(result.valid).toBe(false);
    expect(result.missingFields.length).toBeGreaterThan(0);
    expect(result.missingFields.some(f => f.startsWith('selectors.'))).toBe(true);
  });
});

// ── Module B: USPSAddressClient ───────────────────────────────────────────────

describe('Phase 16 — USPSAddressClient (services/usps-address-client.ts)', () => {
  it('16. USPSAddressClient can be instantiated without arguments', () => {
    const client = new USPSAddressClient();
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(USPSAddressClient);
  });

  it('17. isConfigured = false when USPS_USER_ID env var not set', () => {
    const client = new USPSAddressClient();
    // USPS_USER_ID is not set in test environment
    expect(client.isConfigured).toBe(false);
  });

  it('18. USPSAddressClient accepts explicit userId', () => {
    const client = new USPSAddressClient('test-user-id-123');
    expect(client).toBeDefined();
  });

  it('19. isConfigured = true when userId provided to constructor', () => {
    const client = new USPSAddressClient('test-user-id-123');
    expect(client.isConfigured).toBe(true);
  });

  it('20. verify() returns fallback result when not configured', async () => {
    const client = new USPSAddressClient();
    const result = await client.verify({
      address1: '123 Main St',
      city: 'Belton',
      state: 'TX',
      zip: '76513',
    });
    expect(result).toBeDefined();
    expect(typeof result.isDeliverable).toBe('boolean');
    expect(typeof result.isCorrected).toBe('boolean');
    expect(result.originalInput).toBeDefined();
  });

  it('21. verify() fallback preserves address1 from input', async () => {
    const client = new USPSAddressClient();
    const result = await client.verify({ address1: 'FM 2305 Rd', city: 'Belton' });
    expect(result.address1).toBe('FM 2305 Rd');
  });

  it('22. verify() fallback preserves city/state from input', async () => {
    const client = new USPSAddressClient();
    const result = await client.verify({
      address1: '123 Main St',
      city: 'Temple',
      state: 'TX',
    });
    expect(result.city).toBe('Temple');
    expect(result.state).toBe('TX');
  });

  it('23. verify() fallback isDeliverable = false', async () => {
    const client = new USPSAddressClient();
    const result = await client.verify({ address1: '123 Main St' });
    expect(result.isDeliverable).toBe(false);
  });

  it('24. verify() fallback isCorrected = false', async () => {
    const client = new USPSAddressClient();
    const result = await client.verify({ address1: '123 Main St' });
    expect(result.isCorrected).toBe(false);
  });

  it('25. verifyBatch([]) returns empty array', async () => {
    const client = new USPSAddressClient();
    const results = await client.verifyBatch([]);
    expect(results).toEqual([]);
  });

  it('26. verifyBatch with 3 addresses returns 3 results when not configured', async () => {
    const client = new USPSAddressClient();
    const addresses = [
      { address1: '100 Main St', city: 'Belton', state: 'TX' },
      { address1: '200 Oak Ave', city: 'Temple', state: 'TX' },
      { address1: '300 Elm Dr', city: 'Waco',   state: 'TX' },
    ];
    const results = await client.verifyBatch(addresses);
    expect(results).toHaveLength(3);
    expect(results[0].address1).toBe('100 Main St');
    expect(results[2].address1).toBe('300 Elm Dr');
  });

  it('27. verifyBatch respects 5-address USPS limit (input >5 returns 5 results)', async () => {
    const client = new USPSAddressClient();
    const addresses = Array.from({ length: 8 }, (_, i) => ({
      address1: `${i + 1}00 Main St`,
      city: 'Belton',
      state: 'TX',
    }));
    const results = await client.verifyBatch(addresses);
    expect(results).toHaveLength(5);
  });

  it('28. normalize() returns null for empty string', async () => {
    const client = new USPSAddressClient();
    const result = await client.normalize('');
    expect(result).toBeNull();
  });

  it('29. normalize() parses freeform address string when not configured', async () => {
    const client = new USPSAddressClient();
    const result = await client.normalize('123 Main St, Belton, TX 76513');
    expect(result).not.toBeNull();
    expect(result?.originalInput).toBeDefined();
  });

  it('30. normalize() returns non-null for valid address string', async () => {
    const client = new USPSAddressClient();
    const result = await client.normalize('456 Oak Ave, Temple, TX 76501');
    expect(result).not.toBeNull();
    expect(result?.address1).toBeDefined();
  });
});

// ── Module C: normalizeTexasAddress ──────────────────────────────────────────

describe('Phase 16 — normalizeTexasAddress (services/usps-address-client.ts)', () => {
  it('31. normalizeTexasAddress returns address with state="TX"', () => {
    const result = normalizeTexasAddress('123 Main St, Belton, TX');
    expect(result.state).toBe('TX');
  });

  it('32. FM road: "FM 123 RD" normalizes to include "FM 123 Rd"', () => {
    const result = normalizeTexasAddress('FM 123 RD, Belton, TX');
    expect(result.address1).toContain('FM 123 Rd');
  });

  it('33. FM road: "FM2305" normalizes to include "FM 2305 Rd"', () => {
    const result = normalizeTexasAddress('FM2305, Belton, TX');
    expect(result.address1).toContain('FM 2305 Rd');
  });

  it('34. County road: "CR 456" normalizes to "County Road 456"', () => {
    const result = normalizeTexasAddress('CR 456, Lampasas, TX');
    expect(result.address1).toContain('County Road 456');
  });

  it('35. Rural route: "RR 1 BOX 123" normalizes to "RR 1 Box 123"', () => {
    const result = normalizeTexasAddress('RR 1 BOX 123, Rosebud, TX');
    expect(result.address1).toContain('RR 1 Box 123');
  });

  it('36. isRuralRoute = true for "RR 1 Box 123"', () => {
    const result = normalizeTexasAddress('RR 1 Box 123, Rosebud, TX');
    expect(result.isRuralRoute).toBe(true);
  });

  it('37. isRuralRoute = false for regular street address', () => {
    const result = normalizeTexasAddress('100 Main St, Belton, TX');
    expect(result.isRuralRoute).toBe(false);
  });

  it('38. Highway: "HWY 190" normalizes to "Highway 190"', () => {
    const result = normalizeTexasAddress('HWY 190, Copperas Cove, TX');
    expect(result.address1).toContain('Highway 190');
  });

  it('39. isHighwayAddress = true for "HWY 190"', () => {
    const result = normalizeTexasAddress('HWY 190, Copperas Cove, TX');
    expect(result.isHighwayAddress).toBe(true);
  });

  it('40. isHighwayAddress = false for regular street address', () => {
    const result = normalizeTexasAddress('200 Elm St, Waco, TX');
    expect(result.isHighwayAddress).toBe(false);
  });
});

// ── Module D: County Config SQL Schema ───────────────────────────────────────

describe('Phase 16 — County Config Schema (seeds/094_phase16_county_config.sql)', () => {
  const SQL_PATH = path.resolve(__dirname, '../../seeds/094_phase16_county_config.sql');

  it('41. seeds/094_phase16_county_config.sql file exists', async () => {
    const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
    expect(existsSync(SQL_PATH)).toBe(true);
  });

  it('42. SQL file defines county_portal_configs table', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('county_portal_configs');
    expect(sql).toContain('CREATE TABLE');
  });

  it('43. SQL file has UNIQUE constraint on (county_fips, platform)', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('UNIQUE');
    expect(sql).toContain('county_fips');
    expect(sql).toContain('platform');
  });

  it('44. SQL file has RLS enabled', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('ROW LEVEL SECURITY');
  });

  it('45. SQL file has authenticated policy for SELECT', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('authenticated');
    expect(sql).toContain('SELECT');
  });

  it('46. SQL file has service_role policy for all operations', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('service_role');
  });

  it('47. SQL file defines index on county_fips', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('idx_county_portal_configs_fips');
    expect(sql).toContain('CREATE INDEX');
  });

  it('48. SQL file defines index on platform', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('idx_county_portal_configs_platform');
  });

  it('49. SQL file defines updated_at trigger', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('TRIGGER');
    expect(sql).toContain('updated_at');
  });

  it('50. SQL file has platform CHECK constraint', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('CHECK');
    expect(sql).toContain('tyler_pay');
    expect(sql).toContain('henschen_pay');
  });
});

// ── Module E: County Config API Route ────────────────────────────────────────

describe('Phase 16 — County Config API Route (app/api/admin/research/county-config/route.ts)', () => {
  const ROUTE_PATH = path.resolve(
    __dirname,
    '../../app/api/admin/research/county-config/route.ts',
  );

  it('51. app/api/admin/research/county-config/route.ts file exists', async () => {
    const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  it('52. Route exports GET handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('export const GET');
  });

  it('53. Route exports POST handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('export const POST');
  });

  it('54. Route exports DELETE handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('export const DELETE');
  });

  it('55. countyConfigRegistry singleton is exported from county-config-registry.ts', () => {
    expect(countyConfigRegistry).toBeDefined();
    expect(countyConfigRegistry).toBeInstanceOf(CountyConfigRegistry);
    // Singleton should already have default configs loaded
    expect(countyConfigRegistry.getAll().length).toBeGreaterThanOrEqual(10);
  });
});
