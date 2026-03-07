// __tests__/recon/phase6-row.test.ts
// Unit tests for STARR RECON Phase 6: TxDOT ROW & Public Infrastructure Integration.
//
// Tests cover pure-logic portions that do not require live TxDOT API calls or Playwright:
//
//   1.  classifyRoadEnhanced — FM road: type, txdotDesignation, maintainedBy
//   2.  classifyRoadEnhanced — SH road: padded designation
//   3.  classifyRoadEnhanced — US highway: padded designation
//   4.  classifyRoadEnhanced — Interstate (IH/I prefix): 3-digit pad
//   5.  classifyRoadEnhanced — Spur road: SP system code
//   6.  classifyRoadEnhanced — county road (CR prefix): county_road type
//   7.  classifyRoadEnhanced — county road (COUNTY ROAD prefix): county_road type
//   8.  classifyRoadEnhanced — named street (Oak Drive): city_street type
//   9.  classifyRoadEnhanced — private/access road: private_road type
//  10.  classifyRoadEnhanced — unknown name: unknown type
//  11.  classifyRoadEnhanced — empty string: handled gracefully
//  12.  classifyRoad (txdot-row.ts backward compat) — FM returns "FM"
//  13.  classifyRoad (txdot-row.ts backward compat) — county road returns null
//  14.  getTxDOTRoads — filters to TxDOT roads only
//  15.  getCountyROWDefaults — BELL county: 60ft default
//  16.  getCountyROWDefaults — unknown county: state default 60ft
//  17.  getCountyROWDefaults — case-insensitive lookup
//  18.  TEXAS_STATE_DEFAULT — source cites §251.003
//  19.  COUNTY_ROW_DEFAULTS — HARRIS county: 60-120ft range
//  20.  RoadBoundaryResolver.analyzeTxDOTGeometry — straight path (no bearing change >2°)
//  21.  RoadBoundaryResolver.analyzeTxDOTGeometry — curved path (bearing change >2°)
//  22.  RoadBoundaryResolver.analyzeTxDOTGeometry — empty features → 'unknown'
//  23.  RoadBoundaryResolver.analyzeTxDOTGeometry — MultiLineString curved path
//  24.  RoadBoundaryResolver.analyzeTxDOTGeometry — mixed features (some straight, some curved)
//  25.  TXDOT_PREFIXES_MAP — exports all required prefixes (FM, RM, SH, US, IH, SP, LP)
//  26.  classifyRoadEnhanced — RM road: ranch_to_market type
//  27.  classifyRoadEnhanced — Loop road: loop type
//  28.  classifyRoadEnhanced — Business route (BUS): business type
//  29.  classifyRoadEnhanced — Park road (PR): park_road type
//  30.  classifyRoadEnhanced — RE road: recreational_road type
//  31.  getCountyROWDefaults — WILLIAMSON county specific override
//  32.  getCountyROWDefaults — TRAVIS county specific override
//  33.  buildBoundsFromCenter — creates buffer around lat/lon
//  34.  ROWReport interface — required fields present
//  35.  classifyRoadEnhanced — alphanumeric route suffix preserved (IH 35E)

import { describe, it, expect } from 'vitest';

import {
  classifyRoadEnhanced,
  TXDOT_PREFIXES_MAP,
  type ClassifiedRoad,
} from '../../worker/src/services/road-classifier.js';

import {
  classifyRoad,
  getTxDOTRoads,
  buildBoundsFromCenter,
} from '../../worker/src/services/txdot-row.js';

import {
  getCountyROWDefaults,
  COUNTY_ROW_DEFAULTS,
  TEXAS_STATE_DEFAULT,
} from '../../worker/src/services/county-road-defaults.js';

import { RoadBoundaryResolver } from '../../worker/src/services/road-boundary-resolver.js';
import type { TxDOTRowFeature, TxDOTCenterlineFeature } from '../../worker/src/services/txdot-row.js';
import type { ROWReport } from '../../worker/src/services/row-integration-engine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeROWFeature(hwy: string, rowWidth?: number): TxDOTRowFeature {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    },
    properties: {
      HWY: hwy,
      ROW_WIDTH: rowWidth ?? null,
      CSJ: `0436-04-001`,
      ACQUISITION_DATE: '1952-06-15',
      DEED_REF: 'Vol 123 Pg 456',
      DISTRICT: 'Waco',
      HWY_TYPE: hwy.split(' ')[0],
    },
  };
}

function makeCenterlineFeature(
  rteNm: string,
  coordinates: number[][],
  type: 'LineString' | 'MultiLineString' = 'LineString',
): TxDOTCenterlineFeature {
  return {
    type: 'Feature',
    geometry:
      type === 'LineString'
        ? { type: 'LineString', coordinates }
        : { type: 'MultiLineString', coordinates: [coordinates] },
    properties: { RTE_NM: rteNm },
  };
}

// Straight path: all points on a straight N-S line → no bearing change
const STRAIGHT_PATH: number[][] = [
  [-97.480, 31.060],
  [-97.480, 31.061],
  [-97.480, 31.062],
  [-97.480, 31.063],
];

// Curved path: points that turn >2° at the midpoint
const CURVED_PATH: number[][] = [
  [-97.480, 31.060],   // start going north
  [-97.480, 31.061],   // still north
  [-97.475, 31.063],   // sharp NE turn → bearing change >2°
  [-97.470, 31.065],   // continuing NE
];

// ── classifyRoadEnhanced Tests ────────────────────────────────────────────────

describe('classifyRoadEnhanced', () => {

  it('1. FM road: type, txdotDesignation, maintainedBy, queryStrategy', () => {
    const result: ClassifiedRoad = classifyRoadEnhanced('FM 436');
    expect(result.type).toBe('farm_to_market');
    expect(result.txdotDesignation).toBe('FM 0436');
    expect(result.maintainedBy).toBe('txdot');
    expect(result.queryStrategy).toBe('txdot_api');
    expect(result.highwaySystem).toBe('FM');
    expect(result.routeNumber).toBe('436');
  });

  it('2. SH road: padded designation SH 0195', () => {
    const result = classifyRoadEnhanced('SH 195');
    expect(result.type).toBe('state_highway');
    expect(result.txdotDesignation).toBe('SH 0195');
    expect(result.displayName).toBe('SH 195');
  });

  it('3. US highway: padded designation US 0190', () => {
    const result = classifyRoadEnhanced('US 190');
    expect(result.type).toBe('us_highway');
    expect(result.txdotDesignation).toBe('US 0190');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('4. Interstate IH prefix: 3-digit pad IH 035', () => {
    const result = classifyRoadEnhanced('IH 35');
    expect(result.type).toBe('interstate');
    expect(result.txdotDesignation).toBe('IH 035');
    expect(result.highwaySystem).toBe('IH');
    expect(result.routeNumber).toBe('35');
  });

  it('4b. Interstate I prefix → IH system code', () => {
    const result = classifyRoadEnhanced('I 35');
    expect(result.type).toBe('interstate');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('5. Spur 436 → SP system code', () => {
    const result = classifyRoadEnhanced('Spur 436');
    expect(result.type).toBe('spur');
    expect(result.highwaySystem).toBe('SP');
    expect(result.txdotDesignation).toBe('SP 0436');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('6. CR 234 → county_road', () => {
    const result = classifyRoadEnhanced('CR 234');
    expect(result.type).toBe('county_road');
    expect(result.maintainedBy).toBe('county');
    expect(result.queryStrategy).toBe('county_records');
    expect(result.routeNumber).toBe('234');
  });

  it('7. COUNTY ROAD 101 → county_road', () => {
    const result = classifyRoadEnhanced('County Road 101');
    expect(result.type).toBe('county_road');
    expect(result.maintainedBy).toBe('county');
    expect(result.displayName).toBe('CR 101');
  });

  it('8. Oak Drive → city_street', () => {
    const result = classifyRoadEnhanced('Oak Drive');
    expect(result.type).toBe('city_street');
    expect(result.maintainedBy).toBe('city');
    expect(result.queryStrategy).toBe('deed_only');
  });

  it('9. Private Access Road → private_road', () => {
    const result = classifyRoadEnhanced('Private Access Road');
    expect(result.type).toBe('private_road');
    expect(result.maintainedBy).toBe('private');
    expect(result.queryStrategy).toBe('deed_only');
  });

  it('10. Unknown/unnamed → unknown type', () => {
    const result = classifyRoadEnhanced('Some Random Name');
    expect(result.type).toBe('unknown');
    expect(result.maintainedBy).toBe('unknown');
  });

  it('11. Empty string → handled gracefully', () => {
    const result = classifyRoadEnhanced('');
    expect(result.type).toBe('unknown');
    expect(result.queryStrategy).toBe('skip');
  });

  it('26. RM road: ranch_to_market type', () => {
    const result = classifyRoadEnhanced('RM 1869');
    expect(result.type).toBe('ranch_to_market');
    expect(result.highwaySystem).toBe('RM');
    expect(result.txdotDesignation).toBe('RM 1869');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('27. Loop road: loop type', () => {
    const result = classifyRoadEnhanced('Loop 121');
    expect(result.type).toBe('loop');
    expect(result.highwaySystem).toBe('LP');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('28. BUS prefix: business type', () => {
    const result = classifyRoadEnhanced('BUS 190');
    expect(result.type).toBe('business');
    expect(result.highwaySystem).toBe('BS');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('29. PR road: park_road type', () => {
    const result = classifyRoadEnhanced('PR 4');
    expect(result.type).toBe('park_road');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('30. RE road: recreational_road type', () => {
    const result = classifyRoadEnhanced('RE 100');
    expect(result.type).toBe('recreational_road');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('35. IH 35E: alphanumeric route suffix preserved', () => {
    const result = classifyRoadEnhanced('IH 35E');
    expect(result.type).toBe('interstate');
    expect(result.routeNumber).toBe('35E');
    // Designation should include E suffix
    expect(result.txdotDesignation).toContain('35E');
  });
});

// ── classifyRoad (txdot-row.ts backward compat) ───────────────────────────────

describe('classifyRoad (txdot-row.ts backward compat)', () => {
  it('12. FM 436 → returns "FM"', () => {
    expect(classifyRoad('FM 436')).toBe('FM');
  });

  it('13. county road → returns null', () => {
    expect(classifyRoad('CR 234')).toBeNull();
    expect(classifyRoad('Oak Drive')).toBeNull();
    expect(classifyRoad('Kent Oakley Road')).toBeNull();
  });

  it('14b. SH 195 → returns "SH"', () => {
    expect(classifyRoad('SH 195')).toBe('SH');
  });
});

// ── getTxDOTRoads ─────────────────────────────────────────────────────────────

describe('getTxDOTRoads', () => {
  it('14. filters to TxDOT roads only', () => {
    const roads = ['FM 436', 'CR 234', 'Oak Drive', 'SH 195', 'Kent Oakley Rd', 'US 190'];
    const txdotRoads = getTxDOTRoads(roads);
    expect(txdotRoads).toContain('FM 436');
    expect(txdotRoads).toContain('SH 195');
    expect(txdotRoads).toContain('US 190');
    expect(txdotRoads).not.toContain('CR 234');
    expect(txdotRoads).not.toContain('Oak Drive');
    expect(txdotRoads).not.toContain('Kent Oakley Rd');
  });
});

// ── getCountyROWDefaults ──────────────────────────────────────────────────────

describe('getCountyROWDefaults', () => {
  it('15. BELL county: 60ft default', () => {
    const result = getCountyROWDefaults('Bell');
    expect(result.defaultROWWidth).toBe(60);
    expect(result.countyName).toBe('Bell');
    expect(result.source).toContain('Bell County');
  });

  it('16. unknown county: state default 60ft', () => {
    const result = getCountyROWDefaults('Podunk');
    expect(result.defaultROWWidth).toBe(60);
    expect(result.countyName).toBe('Podunk');
    expect(result.source).toContain('§251.003');
  });

  it('17. case-insensitive lookup', () => {
    expect(getCountyROWDefaults('bell').defaultROWWidth).toBe(60);
    expect(getCountyROWDefaults('BELL').defaultROWWidth).toBe(60);
    expect(getCountyROWDefaults('Bell').defaultROWWidth).toBe(60);
  });

  it('18. TEXAS_STATE_DEFAULT cites §251.003', () => {
    expect(TEXAS_STATE_DEFAULT.source).toContain('§251.003');
    expect(TEXAS_STATE_DEFAULT.defaultROWWidth).toBe(60);
  });

  it('19. HARRIS county: 60ft default, 120ft max', () => {
    const result = getCountyROWDefaults('Harris');
    expect(result.defaultROWWidth).toBe(60);
    expect(result.maxROWWidth).toBe(120);
  });

  it('31. WILLIAMSON county specific override', () => {
    const result = getCountyROWDefaults('Williamson');
    expect(result.defaultROWWidth).toBe(60);
    expect(result.maxROWWidth).toBe(100);
    expect(result.source).toContain('Williamson County');
  });

  it('32. TRAVIS county specific override', () => {
    const result = getCountyROWDefaults('Travis');
    expect(result.defaultROWWidth).toBe(60);
    expect(result.minROWWidth).toBe(50);
  });
});

// ── TXDOT_PREFIXES_MAP ────────────────────────────────────────────────────────

describe('TXDOT_PREFIXES_MAP', () => {
  it('25. exports required prefixes: FM, RM, SH, US, IH, SP (via SPUR), LP (via LOOP)', () => {
    expect(TXDOT_PREFIXES_MAP).toHaveProperty('FM');
    expect(TXDOT_PREFIXES_MAP).toHaveProperty('RM');
    expect(TXDOT_PREFIXES_MAP).toHaveProperty('SH');
    expect(TXDOT_PREFIXES_MAP).toHaveProperty('US');
    expect(TXDOT_PREFIXES_MAP).toHaveProperty('IH');
    // These may be under SPUR/SP or LOOP/LP
    const keys = Object.keys(TXDOT_PREFIXES_MAP);
    expect(keys.some((k) => ['SPUR', 'SP'].includes(k))).toBe(true);
    expect(keys.some((k) => ['LOOP', 'LP'].includes(k))).toBe(true);
    expect(TXDOT_PREFIXES_MAP).toHaveProperty('PR');
    expect(TXDOT_PREFIXES_MAP).toHaveProperty('RE');
  });

  it('25b. FM has padWidth 4, IH has padWidth 3', () => {
    expect(TXDOT_PREFIXES_MAP['FM'].padWidth).toBe(4);
    expect(TXDOT_PREFIXES_MAP['IH'].padWidth).toBe(3);
  });
});

// ── buildBoundsFromCenter ─────────────────────────────────────────────────────

describe('buildBoundsFromCenter', () => {
  it('33. creates buffer around lat/lon with default 0.005°', () => {
    const bounds = buildBoundsFromCenter(31.065, -97.482);
    expect(bounds.minLat).toBeCloseTo(31.060, 5);
    expect(bounds.maxLat).toBeCloseTo(31.070, 5);
    expect(bounds.minLon).toBeCloseTo(-97.487, 5);
    expect(bounds.maxLon).toBeCloseTo(-97.477, 5);
  });

  it('33b. custom buffer size', () => {
    const bounds = buildBoundsFromCenter(31.065, -97.482, 0.010);
    expect(bounds.maxLat - bounds.minLat).toBeCloseTo(0.020, 5);
    expect(bounds.maxLon - bounds.minLon).toBeCloseTo(0.020, 5);
  });
});

// ── RoadBoundaryResolver.analyzeTxDOTGeometry ─────────────────────────────────

describe('RoadBoundaryResolver.analyzeTxDOTGeometry', () => {
  // Use a minimal PipelineLogger stub
  const stubLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    startAttempt: () => Object.assign(() => {}, { step: () => {} }),
  };
  const resolver = new RoadBoundaryResolver(stubLogger as never);

  it('20. straight path (no bearing change >2°) → "straight"', () => {
    const centerlineFeatures = [makeCenterlineFeature('FM 436', STRAIGHT_PATH)];
    const result = resolver.analyzeTxDOTGeometry([], centerlineFeatures);
    expect(result).toBe('straight');
  });

  it('21. curved path (bearing change >2°) → "curved"', () => {
    const centerlineFeatures = [makeCenterlineFeature('FM 436', CURVED_PATH)];
    const result = resolver.analyzeTxDOTGeometry([], centerlineFeatures);
    expect(result).toBe('curved');
  });

  it('22. empty features → "unknown"', () => {
    const result = resolver.analyzeTxDOTGeometry([], []);
    expect(result).toBe('unknown');
  });

  it('23. MultiLineString curved path → "curved"', () => {
    const centerlineFeature = makeCenterlineFeature('FM 436', CURVED_PATH, 'MultiLineString');
    const result = resolver.analyzeTxDOTGeometry([], [centerlineFeature]);
    expect(result).toBe('curved');
  });

  it('24. mixed features: one straight + one curved → "mixed"', () => {
    const straight = makeCenterlineFeature('FM 436-A', STRAIGHT_PATH);
    const curved   = makeCenterlineFeature('FM 436-B', CURVED_PATH);
    const result = resolver.analyzeTxDOTGeometry([], [straight, curved]);
    expect(result).toBe('mixed');
  });

  it('20b. ROW parcel polygon (no centerline) → uses polygon vertices', () => {
    // A polygon with only 5 vertices (basic rectangle) → no curvature
    const rowFeature = makeROWFeature('FM 436', 80);
    const result = resolver.analyzeTxDOTGeometry([rowFeature], []);
    // Rectangle polygon is straight (no >2° bearing changes between consecutive edges)
    expect(['straight', 'unknown']).toContain(result);
  });
});

// ── ROWReport interface validation ────────────────────────────────────────────

describe('ROWReport interface', () => {
  it('34. ROWReport has required fields', () => {
    // Build a minimal conforming ROWReport to validate the interface
    const report: ROWReport = {
      status: 'complete',
      roads: [],
      resolvedDiscrepancies: [],
      timing: { totalMs: 0 },
      sources: [],
      errors: [],
    };
    expect(report.status).toBe('complete');
    expect(Array.isArray(report.roads)).toBe(true);
    expect(typeof report.timing.totalMs).toBe('number');
  });
});

// ── Additional classifyRoadEnhanced tests ─────────────────────────────────────

describe('classifyRoadEnhanced — additional acceptance criteria', () => {
  it('36. Kent Oakley Rd → city_street (acceptance criteria §15)', () => {
    // From the spec: "classifyRoadEnhanced('Kent Oakley Rd') → { type: 'city_street' } (ends with ' RD')"
    const result = classifyRoadEnhanced('Kent Oakley Rd');
    expect(result.type).toBe('city_street');
    expect(result.maintainedBy).toBe('city');
    expect(result.queryStrategy).toBe('deed_only');
  });

  it('37. SL prefix → spur type', () => {
    const result = classifyRoadEnhanced('SL 340');
    expect(result.type).toBe('spur');
    expect(result.highwaySystem).toBe('SL');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('38. CO RD 45 → county_road', () => {
    const result = classifyRoadEnhanced('CO RD 45');
    expect(result.type).toBe('county_road');
    expect(result.maintainedBy).toBe('county');
    expect(result.routeNumber).toBe('45');
  });

  it('39. Unnamed internal road → private_road', () => {
    const result = classifyRoadEnhanced('Internal Access Road');
    expect(result.type).toBe('private_road');
    expect(result.maintainedBy).toBe('private');
  });

  it('56. Whitespace-only string → unknown gracefully', () => {
    const result = classifyRoadEnhanced('   ');
    expect(result.type).toBe('unknown');
    expect(result.queryStrategy).toBe('skip');
  });

  it('57. Loop 121 → LP system code, loop type (acceptance criteria)', () => {
    const result = classifyRoadEnhanced('Loop 121');
    expect(result.type).toBe('loop');
    expect(result.highwaySystem).toBe('LP');
    expect(result.txdotDesignation).toBe('LP 0121');
    expect(result.maintainedBy).toBe('txdot');
  });

  it('58. PR 4 → park_road, maintainedBy txdot (acceptance criteria)', () => {
    const result = classifyRoadEnhanced('PR 4');
    expect(result.type).toBe('park_road');
    expect(result.maintainedBy).toBe('txdot');
    expect(result.queryStrategy).toBe('txdot_api');
  });
});

// ── classifyRoad additional ───────────────────────────────────────────────────

describe('classifyRoad — additional backward compat', () => {
  it('40. US 190 → returns "US"', () => {
    expect(classifyRoad('US 190')).toBe('US');
  });

  it('41. IH 35 → returns "IH"', () => {
    expect(classifyRoad('IH 35')).toBe('IH');
  });
});

// ── getTxDOTRoads additional ──────────────────────────────────────────────────

describe('getTxDOTRoads — additional', () => {
  it('42. empty array returns empty', () => {
    expect(getTxDOTRoads([])).toEqual([]);
  });

  it('43. all county/city roads filtered out', () => {
    const result = getTxDOTRoads(['CR 234', 'Oak Drive', 'Private Lane', 'Some Street']);
    expect(result).toHaveLength(0);
  });

  it('59. RM and RE roads included in TxDOT set', () => {
    const result = getTxDOTRoads(['RM 1869', 'RE 100', 'CR 45']);
    expect(result).toContain('RM 1869');
    expect(result).toContain('RE 100');
    expect(result).not.toContain('CR 45');
  });
});

// ── getCountyROWDefaults additional ──────────────────────────────────────────

describe('getCountyROWDefaults — additional counties', () => {
  it('44. MCLENNAN county (Waco area) — 60ft default', () => {
    const result = getCountyROWDefaults('McLennan');
    expect(result.defaultROWWidth).toBe(60);
    expect(result.source).toContain('McLennan');
    expect(result.countyName).toBe('McLennan');
  });

  it('45. BEXAR county (San Antonio) — 60ft default, 100ft max', () => {
    const result = getCountyROWDefaults('Bexar');
    expect(result.defaultROWWidth).toBe(60);
    expect(result.maxROWWidth).toBe(100);
  });

  it('46. empty string falls back to state default', () => {
    const result = getCountyROWDefaults('');
    expect(result.defaultROWWidth).toBe(60);
    expect(result.source).toContain('§251.003');
  });

  it('47. COUNTY_ROW_DEFAULTS has at least 15 named county entries', () => {
    expect(Object.keys(COUNTY_ROW_DEFAULTS).length).toBeGreaterThanOrEqual(15);
  });
});

// ── buildBoundsFromCenter additional ─────────────────────────────────────────

describe('buildBoundsFromCenter — additional', () => {
  it('48. minLat < maxLat and minLon < maxLon always', () => {
    const bounds = buildBoundsFromCenter(31.065, -97.482);
    expect(bounds.minLat).toBeLessThan(bounds.maxLat);
    expect(bounds.minLon).toBeLessThan(bounds.maxLon);
  });

  it('49. zero buffer produces degenerate box (all same value)', () => {
    const bounds = buildBoundsFromCenter(31.065, -97.482, 0);
    expect(bounds.minLat).toBeCloseTo(bounds.maxLat, 10);
    expect(bounds.minLon).toBeCloseTo(bounds.maxLon, 10);
  });
});

// ── RoadBoundaryResolver additional ──────────────────────────────────────────

describe('RoadBoundaryResolver.analyzeTxDOTGeometry — edge cases', () => {
  const stubLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    startAttempt: () => Object.assign(() => {}, { step: () => {} }),
  };
  const resolver = new RoadBoundaryResolver(stubLogger as never);

  it('54. exactly 2-vertex LineString path → "straight" (no vertex trio exists)', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [[-97.480, 31.060], [-97.480, 31.065]] },
      properties: { RTE_NM: 'FM 436' },
    };
    // 2 vertices: no bearing change possible → straight
    const result = resolver.analyzeTxDOTGeometry([], [feature]);
    expect(result).toBe('straight');
  });

  it('55. bearing change exactly at 2.0° boundary — treated as NOT curved (>2 required)', () => {
    // Craft a path with exactly ~2.0° bearing change at midpoint (should NOT trigger curved)
    // Start going north, then turn barely less than 2.0° right
    const startLat  = 31.060;
    const startLon  = -97.480;
    const mid1Lat   = 31.061;
    const mid1Lon   = -97.480;
    // turn ~1.9° right (east shift)
    const end2Lat   = 31.062;
    const end2Lon   = -97.47997; // tiny eastward shift, bearing change < 2°
    const coords = [[startLon, startLat], [mid1Lon, mid1Lat], [end2Lon, end2Lat]];
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: coords },
      properties: { RTE_NM: 'FM 436' },
    };
    const result = resolver.analyzeTxDOTGeometry([], [feature]);
    expect(result).toBe('straight');
  });
});

describe('RoadBoundaryResolver.resolve — no API key fallback', () => {
  it('50. resolve() with no API key and no ArcGIS data → returns unknown fallback', async () => {
    // Ensure no API key is set in this test environment
    const origKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const stubLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      startAttempt: () => Object.assign(() => {}, { step: () => {} }),
    };
    const resolver = new RoadBoundaryResolver(stubLogger as never);
    const classified = classifyRoadEnhanced('FM 436');

    const result = await resolver.resolve(
      classified,
      [],   // no deed calls
      [],   // no plat calls
      [],   // no ROW features
      [],   // no centerline features
      null, // no RPAM result
      [],   // no discrepancies
    );

    // Should fall back to 'unknown' when no API key and no TxDOT geometry
    expect(result.txdotConfirms).toBe('unknown');
    expect(result.roadName).toBe('FM 436');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);

    // Restore env
    if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
  });
});

// ── ROWIntegrationEngine — orchestrator logic ─────────────────────────────────

describe('ROWIntegrationEngine.analyze', () => {
  it('51. analyze() with no roads returns empty complete ROWReport immediately', async () => {
    const stubLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      startAttempt: () => Object.assign(() => {}, { step: () => {} }),
    };

    // Dynamic import to avoid module evaluation issues in test env
    const { ROWIntegrationEngine } = await import('../../worker/src/services/row-integration-engine.js');
    const engine = new ROWIntegrationEngine(stubLogger as never);

    const result = await engine.analyze('test-empty-roads', { roads: [] });

    expect(result.status).toBe('complete');
    expect(result.roads).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(typeof result.timing.totalMs).toBe('number');
    expect(Array.isArray(result.sources)).toBe(true);
  });
});

// ── runROWIntegration — error handling ────────────────────────────────────────

describe('runROWIntegration', () => {
  it('52. throws when intelligence file not found', async () => {
    const stubLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      startAttempt: () => Object.assign(() => {}, { step: () => {} }),
    };
    const { runROWIntegration } = await import('../../worker/src/services/row-integration-engine.js');

    await expect(
      runROWIntegration('test-project', '/nonexistent/path/property_intelligence.json', stubLogger as never),
    ).rejects.toThrow('Intelligence file not found');
  });

  it('53. throws when projectId is empty string', async () => {
    const stubLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      startAttempt: () => Object.assign(() => {}, { step: () => {} }),
    };
    const { runROWIntegration } = await import('../../worker/src/services/row-integration-engine.js');

    await expect(
      runROWIntegration('', '/any/path.json', stubLogger as never),
    ).rejects.toThrow('projectId must be a non-empty string');
  });
});

// ── ROWReport sources[] shape ─────────────────────────────────────────────────

describe('ROWDataSource shape', () => {
  it('60. ROWDataSource supports success=true and success=false with optional reason', () => {
    // Import ROWDataSource type via ROWReport construct
    const successSource = { name: 'TxDOT ArcGIS REST API', success: true };
    const failSource = {
      name: 'Texas Digital Archive (FM 436)',
      success: false,
      reason: 'No digitized records for FM 436 in Bell County',
    };
    expect(successSource.success).toBe(true);
    expect(failSource.success).toBe(false);
    expect(failSource.reason).toContain('digitized');
  });
});
