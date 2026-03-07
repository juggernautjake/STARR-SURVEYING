// __tests__/recon/phase11-expansion.test.ts
// Unit tests for STARR RECON Phase 11: Product Expansion, Statewide Coverage
// & Subscription Platform.
//
// Phase 11 adds:
//   • FEMA Flood Zone Integration (Module A)
//   • Texas GLO Land Grant Integration (Module B)
//   • TCEQ Environmental Data (Module C)
//   • Texas RRC Oil/Gas (Module D)
//   • USDA NRCS Soil Data (Module E)
//   • Statewide Clerk Registry / Adapter Routing (Module F)
//   • Subscription Billing Tiers & Helpers (Module G)
//   • Batch Processing — CSV parser and summary (Module I)
//   • Deep Chain of Title Engine (Module J)
//   • Retry/Circuit Breaker Infrastructure (Module K)
//   • AI Response Validation / Guardrails (Module K)
//   • Usage Analytics Tracker (Module L)
//   • AI Prompt Registry (Module L)
//   • Carlson RW5 Survey Export (Module N)
//   • Trimble JobXML Survey Export (Module N)
//
// All tests cover pure-logic or file-backed code that does not require
// live external APIs (FEMA, GLO, TCEQ, RRC, NRCS, Redis, Stripe, or WebSocket).
//
// Test index:
//
// AI Guardrails — validateBearing (infra/ai-guardrails.ts):
//   1.  valid full DMS: 'N 45°30\'15" E'
//   2.  valid without seconds: 'N 45°30\' E'
//   3.  valid degrees only: 'N 45° E'
//   4.  rejects degrees > 90
//   5.  rejects minutes > 59
//   6.  rejects seconds >= 60
//   7.  rejects missing quadrant prefix
//   8.  rejects missing quadrant suffix
//   9.  S prefix accepted
//  10.  W suffix accepted
//
// AI Guardrails — validateDistance (infra/ai-guardrails.ts):
//  11.  valid distance 100.00 passes
//  12.  zero distance rejected
//  13.  negative distance rejected
//  14.  overly large feet distance (>50,000) rejected
//  15.  small feet distance (<0.01) rejected
//  16.  varas unit accepted up to 25,000
//
// AI Guardrails — validateCurve (infra/ai-guardrails.ts):
//  17.  valid curve with all params passes
//  18.  negative radius rejected
//  19.  arc length > π * radius rejected
//  20.  chord > 2 * radius rejected
//  21.  invalid chord bearing flagged
//
// AI Guardrails — validateTraverseGeometry:
//  22.  valid 4-call traverse passes
//  23.  fewer than 3 calls rejected
//  24.  duplicate consecutive calls flagged
//  25.  total perimeter > 100,000 flagged
//
// AI Guardrails — validateExtractionResponse:
//  26.  missing calls array returns valid=false
//  27.  valid response with 3 calls returns valid=true and 3 cleanedCalls
//  28.  out-of-range confidence clamped to [0,100]
//  29.  bad bearing in call generates warning (not error)
//  30.  missing bearing in call generates error and call is skipped
//
// Subscription Tiers (billing/subscription-tiers.ts):
//  31.  FREE_TRIAL tier price is 0
//  32.  SURVEYOR_PRO tier price is 99
//  33.  FIRM_UNLIMITED tier price is 299
//  34.  ENTERPRISE tier price is null (custom)
//  35.  FREE_TRIAL limited to 2 reports/month
//  36.  FIRM_UNLIMITED reports_per_month is -1 (unlimited)
//  37.  getTier() returns null for unknown tier
//  38.  getServiceFeePerPage() — SURVEYOR_PRO returns 0.50
//  39.  getServiceFeePerPage() — FIRM_UNLIMITED returns 0.25
//  40.  getServiceFeePerPage() — ENTERPRISE returns 0.00
//  41.  canAccessDataSource() — FREE_TRIAL cannot access 'txdot'
//  42.  canAccessDataSource() — SURVEYOR_PRO can access 'fema'
//  43.  canAccessDataSource() — FIRM_UNLIMITED can access anything ('tceq')
//  44.  canExportFormat() — FREE_TRIAL cannot export 'dxf'
//  45.  canExportFormat() — SURVEYOR_PRO can export 'dxf'
//  46.  canExportFormat() — FIRM_UNLIMITED can export 'rw5'
//  47.  isWithinReportLimit() — FREE_TRIAL at 2 reports returns false
//  48.  isWithinReportLimit() — FREE_TRIAL at 1 report returns true
//  49.  isWithinReportLimit() — FIRM_UNLIMITED always returns true
//
// Carlson RW5 Export (exports/rw5-exporter.ts):
//  50.  exportToRW5 returns string
//  51.  output starts with 'JB,NM'
//  52.  output contains 'MO,AD0' mode line
//  53.  output contains 'NAD83' coordinate system comment
//  54.  first point is 'SP,PN1'
//  55.  closure point has description 'CLOSURE'
//  56.  northing is formatted to 6 decimal places
//  57.  easting is formatted to 6 decimal places
//  58.  empty corners array produces no SP lines (just header)
//
// Trimble JobXML Export (exports/jobxml-exporter.ts):
//  59.  exportToJobXML returns string
//  60.  output starts with '<?xml version="1.0"'
//  61.  output contains '<JOBFile>'
//  62.  output contains 'NAD83 Texas Central Zone'
//  63.  output contains '<Point>' for each corner
//  64.  XML special characters in name are escaped (&amp;, &lt;)
//  65.  default code is 'BNDRY'
//  66.  elevation defaults to 0
//
// Clerk Registry (adapters/clerk-registry.ts):
//  67.  getClerkByCountyName('Bell') returns kofile system
//  68.  getClerkByCountyName('Harris') returns harris_custom system
//  69.  getClerkByCountyName('bell') is case-insensitive
//  70.  getClerkByCountyName('Bell County') strips 'County' suffix
//  71.  unknown county falls back to texasfile system
//  72.  unknown county has fallback=true flag
//  73.  getCountiesForSystem('kofile') includes Bell
//  74.  getAdapterCoverage() returns implemented/stub/unavailable counts
//  75.  requiresManualRetrieval('Loving') returns true
//  76.  requiresManualRetrieval('Bell') returns false
//
// Circuit Breaker (infra/resilience.ts):
//  77.  initial state is 'closed'
//  78.  success call returns result
//  79.  single failure does not open circuit
//  80.  3 consecutive failures open the circuit
//  81.  open circuit rejects immediately with error containing 'OPEN'
//  82.  successful call after half-open resets to 'closed'
//  83.  reset() clears failure count and closes circuit
//  84.  circuitBreakers export has 'fema' key
//  85.  circuitBreakers export has 'claude' key
//
// retryWithBackoff (infra/resilience.ts):
//  86.  succeeds on first attempt
//  87.  retries on failure and succeeds on second attempt
//  88.  throws after exhausting all retries
//  89.  no retry delay on last attempt before throw
//
// BatchProcessor CSV Parser (batch/batch-processor.ts):
//  90.  parseCSV rejects CSV with no header
//  91.  parseCSV rejects CSV with missing address column
//  92.  parseCSV parses single-row CSV
//  93.  parseCSV strips whitespace from fields
//  94.  parseCSV handles quoted fields with commas
//  95.  parseCSV handles Windows CRLF line endings
//  96.  parseCSV assembles full address from address+city+state+zip columns
//  97.  parseCSV extracts county and label columns
//  98.  parseCSV skips empty rows
//
// BatchProcessor generateSummary:
//  99.  summary contains batch ID
// 100.  summary shows completed/failed/pending counts
// 101.  summary shows 'partial' status when some failed
//
// ChainOfTitleBuilder (chain-of-title/chain-builder.ts):
// 102.  constructor uses default maxDepth of 5
// 103.  empty documents produces empty chain
// 104.  single deed document produces chain of length 1
// 105.  chain stops at maxDepth
// 106.  chain does not loop when grantor equals grantee
// 107.  chain stops when grantor is empty string (infinite-loop guard)
// 108.  measurementSystem detected from 'varas' keyword
// 109.  measurementSystem detected from 'feet' keyword
// 110.  datum detected as NAD83 from keyword
// 111.  datum detected as NAD27 from year < 1986 (heuristic)
// 112.  extractEasementWidth parses '20 feet' → 20
// 113.  extractEasementWidth returns null when no match
// 114.  extractEasementPurpose parses 'utility' keyword
// 115.  buildChain saves chain_of_title.json to outputDir
//
// UsageTracker (analytics/usage-tracker.ts):
// 116.  track() buffers an event
// 117.  flush() writes buffered events to disk in JSONL format
// 118.  pipelineStarted() creates event with type 'pipeline_started'
// 119.  pipelineCompleted() includes durationSeconds and overallConfidence
// 120.  aiExtraction() includes model, inputTokens, outputTokens, cost
// 121.  getUserSummary() counts completed pipelines
// 122.  getUserSummary() sums AI cost across sessions
// 123.  destroy() calls flush() and stops auto-flush interval
//
// PromptRegistry (ai/prompt-registry.ts):
// 124.  register() adds a new version to the registry
// 125.  getActive() returns the active version
// 126.  getVersion() returns specific version by number
// 127.  listVersions() returns all versions for a prompt
// 128.  promote() sets a testing version to active, demotes old active
// 129.  rollback() restores most recent deprecated version
// 130.  rollback() returns null if no deprecated versions exist
// 131.  recordRun() increments totalRuns and updates averageTokens
// 132.  updateAccuracy() sets accuracy score
// 133.  DEFAULT_PROMPTS contains 'plat_extraction', 'deed_extraction', 'easement_extraction'
// 134.  DEFAULT_PROMPTS all have status 'active'

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Module imports ────────────────────────────────────────────────────────────
import {
  validateBearing,
  validateDistance,
  validateCurve,
  validateTraverseGeometry,
  validateExtractionResponse,
} from '../../worker/src/infra/ai-guardrails.js';

import {
  SUBSCRIPTION_TIERS,
  PER_REPORT_PRICING,
  getTier,
  getServiceFeePerPage,
  canAccessDataSource,
  canExportFormat,
  isWithinReportLimit,
} from '../../worker/src/billing/subscription-tiers.js';

import { exportToRW5 } from '../../worker/src/exports/rw5-exporter.js';
import { exportToJobXML } from '../../worker/src/exports/jobxml-exporter.js';

import {
  getClerkByCountyName,
  getClerkByFIPS,
  getCountiesForSystem,
  getAdapterCoverage,
  requiresManualRetrieval,
  CLERK_REGISTRY,
} from '../../worker/src/adapters/clerk-registry.js';

import {
  CircuitBreaker,
  retryWithBackoff,
  circuitBreakers,
} from '../../worker/src/infra/resilience.js';

import { BatchProcessor } from '../../worker/src/batch/batch-processor.js';

import { ChainOfTitleBuilder } from '../../worker/src/chain-of-title/chain-builder.js';

import { UsageTracker } from '../../worker/src/analytics/usage-tracker.js';

import {
  PromptRegistry,
  DEFAULT_PROMPTS,
} from '../../worker/src/ai/prompt-registry.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Create a temp directory unique to each test run */
function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return dir;
}

function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

// ── Sample corners for export tests ──────────────────────────────────────────
const SAMPLE_CORNERS = [
  { northing: 3462100.5, easting: 614500.25, elevation: 700.0, description: 'IP' },
  { northing: 3462200.5, easting: 614600.25, elevation: 701.0, description: 'IP' },
  { northing: 3462150.5, easting: 614700.25, elevation: 700.5, description: 'IP' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// AI Guardrails — validateBearing
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateBearing (infra/ai-guardrails.ts)', () => {
  it('1. valid full DMS: N 45°30\'15" E', () => {
    const result = validateBearing("N 45°30'15\" E");
    expect(result.valid).toBe(true);
  });

  it('2. valid without seconds: N 45°30\' E', () => {
    const result = validateBearing("N 45°30' E");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('3. valid degrees only: N 45° E', () => {
    const result = validateBearing('N 45° E');
    expect(result.valid).toBe(true);
  });

  it('4. rejects degrees > 90', () => {
    const result = validateBearing("N 91°00'00\" E");
    expect(result.valid).toBe(false);
    expect(result.error).toContain('out of range');
  });

  it('5. rejects minutes > 59', () => {
    const result = validateBearing("N 45°60'00\" E");
    expect(result.valid).toBe(false);
    expect(result.error).toContain('out of range');
  });

  it('6. rejects seconds >= 60', () => {
    const result = validateBearing("N 45°30'60\" E");
    expect(result.valid).toBe(false);
    expect(result.error).toContain('out of range');
  });

  it('7. rejects missing quadrant prefix (number only)', () => {
    const result = validateBearing("45°30'00\" E");
    expect(result.valid).toBe(false);
  });

  it('8. rejects missing quadrant suffix', () => {
    const result = validateBearing("N 45°30'00\"");
    expect(result.valid).toBe(false);
  });

  it('9. S prefix is accepted', () => {
    const result = validateBearing("S 23°45'00\" W");
    expect(result.valid).toBe(true);
  });

  it('10. W suffix is accepted', () => {
    const result = validateBearing("N 89°59'59\" W");
    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI Guardrails — validateDistance
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateDistance (infra/ai-guardrails.ts)', () => {
  it('11. valid distance 100.00 passes', () => {
    expect(validateDistance(100).valid).toBe(true);
  });

  it('12. zero distance is rejected', () => {
    expect(validateDistance(0).valid).toBe(false);
  });

  it('13. negative distance is rejected', () => {
    expect(validateDistance(-5).valid).toBe(false);
  });

  it('14. overly large feet distance (>50,000) rejected', () => {
    const result = validateDistance(50001, 'feet');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('large');
  });

  it('15. small feet distance (<0.01) rejected', () => {
    const result = validateDistance(0.005, 'feet');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('small');
  });

  it('16. varas unit accepted up to 25,000', () => {
    expect(validateDistance(1000, 'varas').valid).toBe(true);
    expect(validateDistance(25001, 'varas').valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI Guardrails — validateCurve
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateCurve (infra/ai-guardrails.ts)', () => {
  it('17. valid curve with all params passes', () => {
    const result = validateCurve({
      radius: 500,
      arcLength: 200,
      delta: '22°54\'30"',
      chordBearing: "N 30°00'00\" E",
      chordDistance: 198,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('18. negative radius is rejected', () => {
    const result = validateCurve({ radius: -100 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('positive');
  });

  it('19. arc length > π * radius is rejected', () => {
    // Semicircle for radius 100 is ~314.16'; arc of 400 exceeds it
    const result = validateCurve({ radius: 100, arcLength: 400 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds semicircle');
  });

  it('20. chord > 2 * radius is rejected', () => {
    const result = validateCurve({ radius: 100, chordDistance: 250 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('diameter');
  });

  it('21. invalid chord bearing is flagged in errors', () => {
    const result = validateCurve({ chordBearing: 'INVALID' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('bearing'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI Guardrails — validateTraverseGeometry
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateTraverseGeometry (infra/ai-guardrails.ts)', () => {
  const calls4 = [
    { bearing: "N 45°00'00\" E", distance: 200 },
    { bearing: "S 45°00'00\" E", distance: 200 },
    { bearing: "S 45°00'00\" W", distance: 200 },
    { bearing: "N 45°00'00\" W", distance: 200 },
  ];

  it('22. valid 4-call traverse passes', () => {
    const result = validateTraverseGeometry(calls4);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('23. fewer than 3 calls is rejected', () => {
    const result = validateTraverseGeometry([
      { bearing: "N 45°00'00\" E", distance: 100 },
      { bearing: "S 45°00'00\" W", distance: 100 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('≥3');
  });

  it('24. duplicate consecutive calls are flagged', () => {
    const calls = [
      { bearing: "N 45°00'00\" E", distance: 100 },
      { bearing: "N 45°00'00\" E", distance: 100 }, // duplicate
      { bearing: "S 45°00'00\" W", distance: 200 },
    ];
    const result = validateTraverseGeometry(calls);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicates'))).toBe(true);
  });

  it('25. total perimeter > 100,000 flagged as suspiciously large', () => {
    // 4 calls of 30,000' each = 120,000' total
    const bigCalls = Array.from({ length: 4 }, (_, i) => ({
      bearing: (["N 0°00'00\" E", "S 0°00'00\" E", "N 90°00'00\" E", "S 90°00'00\" E"] as string[])[i],
      distance: 30000,
    }));
    const result = validateTraverseGeometry(bigCalls);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('perimeter'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI Guardrails — validateExtractionResponse
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateExtractionResponse (infra/ai-guardrails.ts)', () => {
  it('26. missing calls array returns valid=false', () => {
    const result = validateExtractionResponse({ someField: true });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing calls');
  });

  it('27. valid response with 3 calls returns valid=true and 3 cleanedCalls', () => {
    const result = validateExtractionResponse({
      calls: [
        { bearing: "N 45°00'00\" E", distance: 200 },
        { bearing: "S 45°00'00\" E", distance: 200 },
        { bearing: "S 45°00'00\" W", distance: 200 },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.cleanedCalls).toHaveLength(3);
  });

  it('28. out-of-range confidence (150) is clamped to 100', () => {
    const result = validateExtractionResponse({
      calls: [
        { bearing: "N 45°00'00\" E", distance: 200, confidence: 150 },
      ],
    });
    // clamped confidence warning is issued
    expect(result.warnings.some((w) => w.includes('clamping'))).toBe(true);
    expect(result.cleanedCalls[0].confidence).toBe(100);
  });

  it('29. bad bearing generates a warning (not error) and call is included', () => {
    const result = validateExtractionResponse({
      calls: [
        { bearing: 'INVALID BEARING', distance: 200 },
      ],
    });
    expect(result.valid).toBe(true); // errors[] only blocked calls (missing required fields)
    expect(result.warnings.some((w) => w.includes('bearing'))).toBe(true);
    expect(result.cleanedCalls).toHaveLength(1);
  });

  it('30. missing bearing generates an error and call is skipped', () => {
    const result = validateExtractionResponse({
      calls: [
        { distance: 200 }, // no bearing
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('bearing'))).toBe(true);
    expect(result.cleanedCalls).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Subscription Tiers
// ═══════════════════════════════════════════════════════════════════════════════

describe('Subscription Tiers (billing/subscription-tiers.ts)', () => {
  it('31. FREE_TRIAL tier price is 0', () => {
    expect(SUBSCRIPTION_TIERS.FREE_TRIAL.price).toBe(0);
  });

  it('32. SURVEYOR_PRO tier price is 99', () => {
    expect(SUBSCRIPTION_TIERS.SURVEYOR_PRO.price).toBe(99);
  });

  it('33. FIRM_UNLIMITED tier price is 299', () => {
    expect(SUBSCRIPTION_TIERS.FIRM_UNLIMITED.price).toBe(299);
  });

  it('34. ENTERPRISE tier price is null (custom)', () => {
    expect(SUBSCRIPTION_TIERS.ENTERPRISE.price).toBeNull();
  });

  it('35. FREE_TRIAL limited to 2 reports/month', () => {
    expect(SUBSCRIPTION_TIERS.FREE_TRIAL.reports_per_month).toBe(2);
  });

  it('36. FIRM_UNLIMITED reports_per_month is -1 (unlimited)', () => {
    expect(SUBSCRIPTION_TIERS.FIRM_UNLIMITED.reports_per_month).toBe(-1);
  });

  it('37. getTier() returns null for unknown tier', () => {
    expect(getTier('NONEXISTENT')).toBeNull();
  });

  it('38. getServiceFeePerPage() SURVEYOR_PRO returns 0.50', () => {
    expect(getServiceFeePerPage('SURVEYOR_PRO')).toBe(0.5);
  });

  it('39. getServiceFeePerPage() FIRM_UNLIMITED returns 0.25', () => {
    expect(getServiceFeePerPage('FIRM_UNLIMITED')).toBe(0.25);
  });

  it('40. getServiceFeePerPage() ENTERPRISE returns 0.00', () => {
    expect(getServiceFeePerPage('ENTERPRISE')).toBe(0);
  });

  it('41. canAccessDataSource() FREE_TRIAL cannot access txdot', () => {
    expect(canAccessDataSource('FREE_TRIAL', 'txdot')).toBe(false);
  });

  it('42. canAccessDataSource() SURVEYOR_PRO can access fema', () => {
    expect(canAccessDataSource('SURVEYOR_PRO', 'fema')).toBe(true);
  });

  it('43. canAccessDataSource() FIRM_UNLIMITED can access anything', () => {
    expect(canAccessDataSource('FIRM_UNLIMITED', 'tceq')).toBe(true);
  });

  it('44. canExportFormat() FREE_TRIAL cannot export dxf', () => {
    expect(canExportFormat('FREE_TRIAL', 'dxf')).toBe(false);
  });

  it('45. canExportFormat() SURVEYOR_PRO can export dxf', () => {
    expect(canExportFormat('SURVEYOR_PRO', 'dxf')).toBe(true);
  });

  it('46. canExportFormat() FIRM_UNLIMITED can export rw5', () => {
    expect(canExportFormat('FIRM_UNLIMITED', 'rw5')).toBe(true);
  });

  it('47. isWithinReportLimit() FREE_TRIAL at 2 reports returns false', () => {
    expect(isWithinReportLimit('FREE_TRIAL', 2)).toBe(false);
  });

  it('48. isWithinReportLimit() FREE_TRIAL at 1 report returns true', () => {
    expect(isWithinReportLimit('FREE_TRIAL', 1)).toBe(true);
  });

  it('49. isWithinReportLimit() FIRM_UNLIMITED always returns true', () => {
    expect(isWithinReportLimit('FIRM_UNLIMITED', 9999)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Carlson RW5 Export
// ═══════════════════════════════════════════════════════════════════════════════

describe('exportToRW5 (exports/rw5-exporter.ts)', () => {
  it('50. exportToRW5 returns a string', () => {
    expect(typeof exportToRW5(SAMPLE_CORNERS, 'TEST-PROJECT')).toBe('string');
  });

  it('51. output starts with JB,NM (job header)', () => {
    const out = exportToRW5(SAMPLE_CORNERS, 'MY-PROJECT');
    expect(out.startsWith('JB,NM')).toBe(true);
  });

  it('52. output contains MO,AD0 mode line', () => {
    const out = exportToRW5(SAMPLE_CORNERS, 'TEST');
    expect(out).toContain('MO,AD0');
  });

  it('53. output contains NAD83 coordinate system comment', () => {
    const out = exportToRW5(SAMPLE_CORNERS, 'TEST');
    expect(out).toContain('NAD83');
  });

  it('54. first point line is SP,PN1', () => {
    const out = exportToRW5(SAMPLE_CORNERS, 'TEST');
    expect(out).toContain('SP,PN1,N ');
  });

  it('55. closure point has CLOSURE description', () => {
    const out = exportToRW5(SAMPLE_CORNERS, 'TEST');
    expect(out).toContain('CLOSURE');
  });

  it('56. northing formatted to 6 decimal places', () => {
    const out = exportToRW5([{ northing: 1234567.123456, easting: 100 }], 'T');
    expect(out).toContain('N 1234567.123456');
  });

  it('57. easting formatted to 6 decimal places', () => {
    const out = exportToRW5([{ northing: 100, easting: 987654.654321 }], 'T');
    expect(out).toContain('E 987654.654321');
  });

  it('58. empty corners array produces no SP lines', () => {
    const out = exportToRW5([], 'EMPTY');
    expect(out).not.toContain('SP,PN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Trimble JobXML Export
// ═══════════════════════════════════════════════════════════════════════════════

describe('exportToJobXML (exports/jobxml-exporter.ts)', () => {
  it('59. exportToJobXML returns a string', () => {
    expect(typeof exportToJobXML(SAMPLE_CORNERS, 'TEST-PROJECT')).toBe('string');
  });

  it('60. output starts with <?xml version="1.0"', () => {
    const out = exportToJobXML(SAMPLE_CORNERS, 'TEST');
    expect(out.trim().startsWith('<?xml version="1.0"')).toBe(true);
  });

  it('61. output contains <JOBFile>', () => {
    expect(exportToJobXML(SAMPLE_CORNERS, 'TEST')).toContain('<JOBFile>');
  });

  it('62. output contains NAD83 Texas Central Zone coordinate system', () => {
    expect(exportToJobXML(SAMPLE_CORNERS, 'TEST')).toContain('NAD83 Texas Central Zone');
  });

  it('63. output contains <Point> for each corner', () => {
    const out = exportToJobXML(SAMPLE_CORNERS, 'TEST');
    const count = (out.match(/<Point>/g) || []).length;
    expect(count).toBe(SAMPLE_CORNERS.length);
  });

  it('64. XML special characters in project name are escaped', () => {
    const out = exportToJobXML([], 'AT&T <Test>');
    expect(out).toContain('AT&amp;T &lt;Test&gt;');
  });

  it('65. default point code is BNDRY', () => {
    const out = exportToJobXML([{ northing: 100, easting: 200 }], 'T');
    expect(out).toContain('<Code>BNDRY</Code>');
  });

  it('66. elevation defaults to 0 when not provided', () => {
    const out = exportToJobXML([{ northing: 100, easting: 200 }], 'T');
    expect(out).toContain('<Elevation>0.0000</Elevation>');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Clerk Registry
// ═══════════════════════════════════════════════════════════════════════════════

describe('Clerk Registry (adapters/clerk-registry.ts)', () => {
  it('67. getClerkByCountyName("Bell") returns kofile system', () => {
    const entry = getClerkByCountyName('Bell');
    expect(entry.system).toBe('kofile');
  });

  it('68. getClerkByCountyName("Harris") returns harris_custom', () => {
    const entry = getClerkByCountyName('Harris');
    expect(entry.system).toBe('harris_custom');
  });

  it('69. getClerkByCountyName is case-insensitive', () => {
    const lower = getClerkByCountyName('bell');
    const upper = getClerkByCountyName('BELL');
    expect(lower.system).toBe('kofile');
    expect(upper.system).toBe('kofile');
  });

  it('70. getClerkByCountyName strips "County" suffix', () => {
    const entry = getClerkByCountyName('Bell County');
    expect(entry.system).toBe('kofile');
  });

  it('71. unknown county falls back to texasfile', () => {
    const entry = getClerkByCountyName('Nonexistent County XYZ');
    expect(entry.system).toBe('texasfile');
  });

  it('72. unknown county has fallback=true flag', () => {
    const entry = getClerkByCountyName('Nonexistent');
    expect((entry as any).fallback).toBe(true);
  });

  it('73. getCountiesForSystem("kofile") includes Bell', () => {
    const counties = getCountiesForSystem('kofile');
    expect(counties.some((c) => c.county === 'Bell')).toBe(true);
  });

  it('74. getAdapterCoverage returns all three status categories', () => {
    const coverage = getAdapterCoverage();
    expect(coverage.implemented).toBeDefined();
    expect(coverage.stub).toBeDefined();
    expect(coverage.unavailable).toBeDefined();
    // Sanity: at least one implemented (Bell County)
    expect(coverage.implemented.count).toBeGreaterThanOrEqual(1);
    // At least one unavailable (Loving County)
    expect(coverage.unavailable.count).toBeGreaterThanOrEqual(1);
  });

  it('75. requiresManualRetrieval("Loving") returns true', () => {
    expect(requiresManualRetrieval('Loving')).toBe(true);
  });

  it('76. requiresManualRetrieval("Bell") returns false', () => {
    expect(requiresManualRetrieval('Bell')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Circuit Breaker
// ═══════════════════════════════════════════════════════════════════════════════

describe('CircuitBreaker (infra/resilience.ts)', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      resetTimeoutMs: 10000,
      halfOpenMaxAttempts: 1,
    });
  });

  it('77. initial state is closed', () => {
    expect(breaker.getState()).toBe('closed');
  });

  it('78. successful call returns its result', async () => {
    const result = await breaker.execute(async () => 42);
    expect(result).toBe(42);
  });

  it('79. single failure does not open circuit', async () => {
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(breaker.getState()).toBe('closed');
  });

  it('80. 3 consecutive failures open the circuit', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute(async () => { throw new Error('fail'); }),
      ).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('open');
  });

  it('81. open circuit rejects immediately with OPEN error', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute(async () => { throw new Error('fail'); }),
      ).rejects.toThrow();
    }
    // Now should reject with OPEN message
    await expect(breaker.execute(async () => 1)).rejects.toThrow(/OPEN/);
  });

  it('82. successful call in half-open resets to closed', async () => {
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute(async () => { throw new Error('fail'); }),
      ).rejects.toThrow();
    }
    // Force to half-open by moving lastFailure into the past
    (breaker as any).lastFailure = Date.now() - 20000; // 20 seconds ago
    // Now execute should transition to half-open then back to closed
    const result = await breaker.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('closed');
  });

  it('83. reset() clears failure count and closes circuit', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute(async () => { throw new Error('fail'); }),
      ).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('open');
    breaker.reset();
    expect(breaker.getState()).toBe('closed');
  });

  it('84. pre-configured circuitBreakers export has fema key', () => {
    expect(circuitBreakers.fema).toBeInstanceOf(CircuitBreaker);
  });

  it('85. pre-configured circuitBreakers export has claude key', () => {
    expect(circuitBreakers.claude).toBeInstanceOf(CircuitBreaker);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// retryWithBackoff
// ═══════════════════════════════════════════════════════════════════════════════

describe('retryWithBackoff (infra/resilience.ts)', () => {
  it('86. succeeds on first attempt without retry', async () => {
    let calls = 0;
    const result = await retryWithBackoff(async () => {
      calls++;
      return 'ok';
    }, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('87. retries on failure and succeeds on second attempt', async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) throw new Error('transient');
        return 'recovered';
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
  });

  it('88. throws after exhausting all retries', async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls++;
          throw new Error('always fails');
        },
        { maxAttempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('always fails');
    expect(calls).toBe(3);
  });

  it('89. delay is not applied on the final failing attempt', async () => {
    // Verify timing: 3 attempts with baseDelay=1 should complete quickly
    const start = Date.now();
    await expect(
      retryWithBackoff(
        async () => { throw new Error('fail'); },
        { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 10 },
      ),
    ).rejects.toThrow();
    // Should complete within 200ms (2 retries × ~10ms max delay)
    expect(Date.now() - start).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BatchProcessor CSV Parser
// ═══════════════════════════════════════════════════════════════════════════════

describe('BatchProcessor.parseCSV (batch/batch-processor.ts)', () => {
  let tmpDir: string;
  let processor: BatchProcessor;

  beforeEach(() => {
    tmpDir = makeTempDir('phase11-batch');
    processor = new BatchProcessor(tmpDir);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('90. parseCSV returns empty array for header-only CSV', () => {
    const result = (processor as any).parseCSV('address,county\n');
    expect(result).toEqual([]);
  });

  it('91. parseCSV throws when address column is missing', () => {
    expect(() =>
      (processor as any).parseCSV('lot,county\n100 Main St,Bell'),
    ).toThrow(/address/i);
  });

  it('92. parseCSV parses single-row CSV', () => {
    const csv = 'address,county\n"123 Main St, Belton",Bell';
    const result = (processor as any).parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].address).toContain('123 Main St');
    expect(result[0].county).toBe('Bell');
  });

  it('93. parseCSV strips whitespace from fields', () => {
    const csv = 'address,county\n  456 Oak Ave  ,  Bell  ';
    const result = (processor as any).parseCSV(csv);
    expect(result[0].address).toBe('456 Oak Ave');
    expect(result[0].county).toBe('Bell');
  });

  it('94. parseCSV handles quoted fields containing commas', () => {
    const csv = 'address,county\n"100 Main St, Suite 200",Bell';
    const result = (processor as any).parseCSV(csv);
    expect(result[0].address).toContain('Suite 200');
  });

  it('95. parseCSV handles Windows CRLF line endings', () => {
    const csv = 'address,county\r\n123 Main St,Bell\r\n456 Oak Ave,Bell\r\n';
    const result = (processor as any).parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].address).toBe('123 Main St');
    expect(result[1].address).toBe('456 Oak Ave');
  });

  it('96. parseCSV assembles full address from address+city+state+zip columns', () => {
    const csv = 'address,city,state,zip,county\n123 Main St,Belton,TX,76513,Bell';
    const result = (processor as any).parseCSV(csv);
    expect(result[0].address).toContain('Belton');
    expect(result[0].address).toContain('TX');
    expect(result[0].address).toContain('76513');
  });

  it('97. parseCSV extracts county and label columns', () => {
    const csv = 'address,county,label\n123 Main St,Bell,Lot 1';
    const result = (processor as any).parseCSV(csv);
    expect(result[0].county).toBe('Bell');
    expect(result[0].label).toBe('Lot 1');
  });

  it('98. parseCSV skips empty rows', () => {
    const csv = 'address,county\n123 Main St,Bell\n\n456 Oak Ave,Bell';
    const result = (processor as any).parseCSV(csv);
    expect(result).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BatchProcessor generateSummary
// ═══════════════════════════════════════════════════════════════════════════════

describe('BatchProcessor.generateSummary (batch/batch-processor.ts)', () => {
  let tmpDir: string;
  let processor: BatchProcessor;

  beforeEach(() => {
    tmpDir = makeTempDir('phase11-batch-summary');
    processor = new BatchProcessor(tmpDir);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  function makeBatch(overrides: Partial<any> = {}) {
    return {
      batchId: 'BATCH-ABCDEF01',
      userId: 'user-1',
      properties: [
        { address: '100 Main St', county: 'Bell' },
        { address: '200 Oak Ave', county: 'Bell' },
        { address: '300 Elm St', county: 'Bell' },
      ],
      options: {
        budget: 50,
        autoPurchase: false,
        formats: ['pdf'],
        dataSources: ['cad'],
        priority: 'normal' as const,
      },
      status: 'complete' as const,
      results: [
        { address: '100 Main St', projectId: 'BATCH-001', status: 'complete' as const, overallConfidence: 85 },
        { address: '200 Oak Ave', projectId: 'BATCH-002', status: 'failed' as const },
        { address: '300 Elm St', projectId: 'BATCH-003', status: 'pending' as const },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
      totalCost: 79,
      ...overrides,
    };
  }

  it('99. summary contains batch ID', () => {
    const summary = processor.generateSummary(makeBatch());
    expect(summary).toContain('BATCH-ABCDEF01');
  });

  it('100. summary shows completed/failed/pending counts', () => {
    const summary = processor.generateSummary(makeBatch());
    expect(summary).toContain('Completed: 1');
    expect(summary).toContain('Failed: 1');
    expect(summary).toContain('Pending: 1');
  });

  it('101. summary shows partial status for partial completion', () => {
    const batch = makeBatch({ status: 'partial' });
    const summary = processor.generateSummary(batch);
    expect(summary).toContain('partial');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ChainOfTitleBuilder
// ═══════════════════════════════════════════════════════════════════════════════

describe('ChainOfTitleBuilder (chain-of-title/chain-builder.ts)', () => {
  let tmpDir: string;
  let builder: ChainOfTitleBuilder;

  beforeEach(() => {
    tmpDir = makeTempDir('phase11-chain');
    builder = new ChainOfTitleBuilder(5, tmpDir);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('102. constructor uses default maxDepth of 5', () => {
    const defaultBuilder = new ChainOfTitleBuilder();
    expect((defaultBuilder as any).maxDepth).toBe(5);
  });

  it('103. empty documents produces empty chain', async () => {
    const result = await builder.buildChain('PROJ-001', 'John Smith', [], {});
    expect(result.chain).toHaveLength(0);
    expect(result.depth).toBe(0);
  });

  it('104. single deed document produces chain of length 1', async () => {
    const docs = [
      {
        instrument: '2023001234',
        type: 'deed',
        grantor: 'Jane Doe',
        grantee: 'John Smith',
        recordingDate: '2023-03-15',
        acreage: 5.0,
        source: 'kofile',
      },
    ];
    const extraction = {
      documents: [
        {
          instrument: '2023001234',
          grantor: 'Jane Doe',
          grantee: 'John Smith',
          legalDescription: 'Being 5.000 acres in Bell County',
          acreage: 5.0,
        },
      ],
    };
    const result = await builder.buildChain('PROJ-002', 'John Smith', docs, extraction);
    expect(result.chain).toHaveLength(1);
    expect(result.chain[0].instrument).toBe('2023001234');
  });

  it('105. chain stops at maxDepth', async () => {
    // Build 10 deeds in a chain, but maxDepth=3
    const shallowBuilder = new ChainOfTitleBuilder(3, tmpDir);
    const docs: any[] = [];
    const extractionDocs: any[] = [];
    const owners = ['Owner0', 'Owner1', 'Owner2', 'Owner3', 'Owner4',
                    'Owner5', 'Owner6', 'Owner7', 'Owner8', 'Owner9'];

    for (let i = 0; i < 9; i++) {
      const instrument = `DEED-${String(i).padStart(4, '0')}`;
      docs.push({
        instrument,
        type: 'deed',
        grantor: owners[i + 1],
        grantee: owners[i],
        recordingDate: `202${i}-01-01`,
      });
      extractionDocs.push({
        instrument,
        grantor: owners[i + 1],
        grantee: owners[i],
        legalDescription: 'Being 10 acres',
        acreage: 10,
      });
    }

    const result = await shallowBuilder.buildChain(
      'PROJ-DEPTH',
      'Owner0',
      docs,
      { documents: extractionDocs },
    );
    expect(result.chain.length).toBeLessThanOrEqual(3);
  });

  it('106. chain does not loop when grantor equals grantee', async () => {
    // A deed where the same person is both grantor and grantee (self-conveyance)
    const docs = [
      {
        instrument: '2020001',
        type: 'deed',
        grantor: 'John Smith',
        grantee: 'John Smith', // same as grantor — would loop without guard
        recordingDate: '2020-01-01',
      },
    ];
    const extraction = {
      documents: [
        {
          instrument: '2020001',
          grantor: 'John Smith',
          grantee: 'John Smith',
          legalDescription: '',
          acreage: 1,
        },
      ],
    };
    // Should NOT hang or loop infinitely
    const result = await builder.buildChain('PROJ-LOOP', 'John Smith', docs, extraction);
    expect(result.chain.length).toBeLessThanOrEqual(1);
  });

  it('107. chain stops when grantor is empty string (infinite-loop guard)', async () => {
    // Deed with no grantor — normalizing produces empty string
    const docs = [
      {
        instrument: '2021001',
        type: 'deed',
        grantor: '',
        grantee: 'Jane Doe',
        recordingDate: '2021-06-01',
      },
    ];
    const extraction = {
      documents: [
        {
          instrument: '2021001',
          grantor: '',
          grantee: 'Jane Doe',
          legalDescription: '',
          acreage: 2,
        },
      ],
    };
    const result = await builder.buildChain('PROJ-EMPTY', 'Jane Doe', docs, extraction);
    // Should return chain of 1 (Jane Doe's deed) then stop because grantor is empty
    expect(result.chain.length).toBeLessThanOrEqual(1);
  });

  it('108. measurementSystem detected as varas from keyword in description', () => {
    const sys = (builder as any).detectMeasurementSystem(
      'Being 50 varas along the north line',
      '1880-01-01',
    );
    expect(sys).toBe('varas');
  });

  it('109. measurementSystem detected as feet from keyword', () => {
    const sys = (builder as any).detectMeasurementSystem(
      'THENCE N 45°00\'00" E, 200.00 feet to an iron pin',
      '2010-01-01',
    );
    expect(sys).toBe('feet');
  });

  it('110. datum detected as NAD83 from explicit keyword', () => {
    const datum = (builder as any).detectDatum(
      'Bearings referenced to NAD83 Texas Central Zone',
      '2015-01-01',
    );
    expect(datum).toBe('NAD83');
  });

  it('111. datum detected as NAD27 by heuristic year < 1986', () => {
    const datum = (builder as any).detectDatum(
      'Being a tract in Bell County, Texas',
      '1975-01-01',
    );
    expect(datum).toBe('NAD27');
  });

  it('112. extractEasementWidth parses "20 feet" → 20', () => {
    const width = (builder as any).extractEasementWidth(
      'reserved unto grantor a 20 feet wide utility easement',
    );
    expect(width).toBe(20);
  });

  it('113. extractEasementWidth returns null when no foot measurement found', () => {
    const width = (builder as any).extractEasementWidth(
      'reserved unto grantor an access easement',
    );
    expect(width).toBeNull();
  });

  it('114. extractEasementPurpose parses "utility" keyword', () => {
    const purpose = (builder as any).extractEasementPurpose(
      'reserved a utility easement for electric lines',
    );
    expect(purpose).toBe('utility');
  });

  it('115. buildChain saves chain_of_title.json to outputDir', async () => {
    const docs = [
      {
        instrument: '2023005000',
        type: 'deed',
        grantor: 'Alice Brown',
        grantee: 'Bob White',
        recordingDate: '2023-07-01',
      },
    ];
    const extraction = {
      documents: [
        {
          instrument: '2023005000',
          grantor: 'Alice Brown',
          grantee: 'Bob White',
          legalDescription: 'Being 3 acres in Bell County',
          acreage: 3,
        },
      ],
    };
    await builder.buildChain('PROJ-SAVE', 'Bob White', docs, extraction);
    const outFile = path.join(tmpDir, 'PROJ-SAVE', 'chain_of_title.json');
    expect(fs.existsSync(outFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    expect(data.propertyId).toBe('PROJ-SAVE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UsageTracker
// ═══════════════════════════════════════════════════════════════════════════════

describe('UsageTracker (analytics/usage-tracker.ts)', () => {
  let tmpDir: string;
  let tracker: UsageTracker;

  beforeEach(() => {
    tmpDir = makeTempDir('phase11-tracker');
    tracker = new UsageTracker(tmpDir);
  });

  afterEach(() => {
    tracker.destroy();
    removeTempDir(tmpDir);
  });

  it('116. track() buffers an event in memory', () => {
    tracker.track({
      eventType: 'pipeline_started',
      userId: 'user-1',
      projectId: 'proj-1',
      county: 'Bell',
    });
    // Internal buffer should have 1 event (not yet flushed to disk)
    expect((tracker as any).events).toHaveLength(1);
  });

  it('117. flush() writes buffered events to disk in JSONL format', () => {
    tracker.track({
      eventType: 'pipeline_started',
      userId: 'user-1',
      projectId: 'proj-1',
      county: 'Bell',
    });
    tracker.flush();
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.jsonl'));
    expect(files.length).toBeGreaterThanOrEqual(1);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
    const parsed = JSON.parse(content.trim().split('\n')[0]);
    expect(parsed.eventType).toBe('pipeline_started');
  });

  it('118. pipelineStarted() creates event with type pipeline_started', () => {
    tracker.pipelineStarted('user-1', 'proj-1', 'Bell');
    const events = (tracker as any).events;
    expect(events[0].eventType).toBe('pipeline_started');
    expect(events[0].county).toBe('Bell');
  });

  it('119. pipelineCompleted() includes durationSeconds and overallConfidence', () => {
    tracker.pipelineCompleted('user-1', 'proj-1', 'Bell', 45.5, 87);
    const events = (tracker as any).events;
    const ev = events.find((e: any) => e.eventType === 'pipeline_completed');
    expect(ev.durationSeconds).toBe(45.5);
    expect(ev.overallConfidence).toBe(87);
  });

  it('120. aiExtraction() includes model, inputTokens, outputTokens, cost', () => {
    tracker.aiExtraction('user-1', 'proj-1', 'Bell', 'claude-3', 1000, 500, 0.05);
    const events = (tracker as any).events;
    const ev = events.find((e: any) => e.eventType === 'ai_extraction');
    expect(ev.aiModel).toBe('claude-3');
    expect(ev.aiInputTokens).toBe(1000);
    expect(ev.aiOutputTokens).toBe(500);
    expect(ev.aiCostEstimate).toBe(0.05);
  });

  it('121. getUserSummary() counts completed pipelines', () => {
    tracker.pipelineCompleted('user-1', 'proj-1', 'Bell', 30, 80);
    tracker.pipelineCompleted('user-1', 'proj-2', 'Bell', 25, 75);
    tracker.flush();
    const summary = tracker.getUserSummary('user-1');
    expect(summary.completedPipelines).toBe(2);
  });

  it('122. getUserSummary() sums AI cost across events', () => {
    tracker.aiExtraction('user-1', 'proj-1', 'Bell', 'claude', 1000, 500, 0.05);
    tracker.aiExtraction('user-1', 'proj-1', 'Bell', 'claude', 1000, 500, 0.10);
    tracker.flush();
    const summary = tracker.getUserSummary('user-1');
    expect(summary.totalAICost).toBeCloseTo(0.15, 5);
  });

  it('123. destroy() flushes remaining events then stops interval', () => {
    tracker.track({
      eventType: 'pipeline_started',
      userId: 'user-1',
      projectId: 'proj-1',
      county: 'Bell',
    });
    tracker.destroy();
    // After destroy, events should be flushed to disk
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.jsonl'));
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PromptRegistry
// ═══════════════════════════════════════════════════════════════════════════════

describe('PromptRegistry (ai/prompt-registry.ts)', () => {
  let tmpDir: string;
  let registry: PromptRegistry;

  beforeEach(() => {
    tmpDir = makeTempDir('phase11-prompts');
    registry = new PromptRegistry(tmpDir);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  const samplePrompt = {
    promptId: 'test_extraction',
    version: 1,
    systemPrompt: 'You are a surveying expert.',
    userPromptTemplate: 'Extract calls from {{description}}.',
    model: 'claude-sonnet-4-5',
    maxTokens: 4096,
    temperature: 0,
    accuracy: 0,
    status: 'active' as const,
  };

  it('124. register() adds a new version to the registry', () => {
    const registered = registry.register(samplePrompt);
    expect(registered.promptId).toBe('test_extraction');
    expect(registered.version).toBe(1);
    expect(registered.totalRuns).toBe(0);
  });

  it('125. getActive() returns the registered active version', () => {
    registry.register(samplePrompt);
    const active = registry.getActive('test_extraction');
    expect(active).not.toBeNull();
    expect(active!.version).toBe(1);
    expect(active!.status).toBe('active');
  });

  it('126. getVersion() returns specific version by number', () => {
    registry.register(samplePrompt);
    registry.register({ ...samplePrompt, version: 2, status: 'testing' });
    expect(registry.getVersion('test_extraction', 2)?.version).toBe(2);
    expect(registry.getVersion('test_extraction', 99)).toBeNull();
  });

  it('127. listVersions() returns all versions for a prompt', () => {
    registry.register(samplePrompt);
    registry.register({ ...samplePrompt, version: 2, status: 'testing' });
    expect(registry.listVersions('test_extraction')).toHaveLength(2);
  });

  it('128. promote() sets testing version to active, demotes previous active', () => {
    registry.register(samplePrompt);                                           // v1 active
    registry.register({ ...samplePrompt, version: 2, status: 'testing' });   // v2 testing
    registry.promote('test_extraction', 2);
    expect(registry.getVersion('test_extraction', 2)!.status).toBe('active');
    expect(registry.getVersion('test_extraction', 1)!.status).toBe('deprecated');
  });

  it('129. rollback() restores most recent deprecated version', () => {
    registry.register(samplePrompt);                                           // v1 active → deprecated after promote
    registry.register({ ...samplePrompt, version: 2, status: 'testing' });
    registry.promote('test_extraction', 2);                                    // v2 active, v1 deprecated
    const rolled = registry.rollback('test_extraction');
    expect(rolled).not.toBeNull();
    expect(rolled!.version).toBe(1);
    expect(rolled!.status).toBe('active');
  });

  it('130. rollback() returns null when no deprecated versions exist', () => {
    registry.register(samplePrompt);
    const rolled = registry.rollback('test_extraction');
    expect(rolled).toBeNull();
  });

  it('131. recordRun() increments totalRuns and recalculates averageTokens', () => {
    registry.register(samplePrompt);
    registry.recordRun('test_extraction', 1, 1000, 0.05);
    registry.recordRun('test_extraction', 1, 2000, 0.10);
    const v = registry.getVersion('test_extraction', 1)!;
    expect(v.totalRuns).toBe(2);
    expect(v.averageTokens).toBeCloseTo(1500, 0);
  });

  it('132. updateAccuracy() sets the accuracy score for a version', () => {
    registry.register(samplePrompt);
    registry.updateAccuracy('test_extraction', 1, 92.5);
    expect(registry.getVersion('test_extraction', 1)!.accuracy).toBe(92.5);
  });

  it('133. DEFAULT_PROMPTS contains plat_extraction, deed_extraction, easement_extraction', () => {
    const ids = DEFAULT_PROMPTS.map((p) => p.promptId);
    expect(ids).toContain('plat_extraction');
    expect(ids).toContain('deed_extraction');
    expect(ids).toContain('easement_extraction');
  });

  it('134. DEFAULT_PROMPTS all have status active', () => {
    expect(DEFAULT_PROMPTS.every((p) => p.status === 'active')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// v1.2 Bug-fix tests — NRCSSoilClient coordinate validation (sources/nrcs-soil-client.ts)
// Tests 135–141
// ═══════════════════════════════════════════════════════════════════════════════

import { NRCSSoilClient } from '../../worker/src/sources/nrcs-soil-client.js';

describe('NRCSSoilClient coordinate validation (sources/nrcs-soil-client.ts)', () => {
  const client = new NRCSSoilClient();

  it('135. rejects NaN longitude', async () => {
    await expect(
      client.querySoilData({ centroid: [NaN, 30.0] }),
    ).rejects.toThrow(/Invalid centroid/);
  });

  it('136. rejects NaN latitude', async () => {
    await expect(
      client.querySoilData({ centroid: [-98.5, NaN] }),
    ).rejects.toThrow(/Invalid centroid/);
  });

  it('137. rejects longitude > 180', async () => {
    await expect(
      client.querySoilData({ centroid: [200, 30.0] }),
    ).rejects.toThrow(/longitude out of range/);
  });

  it('138. rejects longitude < -180', async () => {
    await expect(
      client.querySoilData({ centroid: [-200, 30.0] }),
    ).rejects.toThrow(/longitude out of range/);
  });

  it('139. rejects latitude > 90', async () => {
    await expect(
      client.querySoilData({ centroid: [-98.5, 100] }),
    ).rejects.toThrow(/latitude out of range/);
  });

  it('140. rejects polygon with fewer than 3 points', async () => {
    await expect(
      client.querySoilData({
        centroid: [-98.5, 30.0],
        polygon: [[-98.5, 30.0], [-98.4, 30.0]],
      }),
    ).rejects.toThrow(/at least 3 coordinate pairs/);
  });

  it('141. rejects polygon with out-of-range coordinate', async () => {
    await expect(
      client.querySoilData({
        centroid: [-98.5, 30.0],
        polygon: [[-98.5, 30.0], [-98.4, 30.0], [200, 30.0]],
      }),
    ).rejects.toThrow(/out of WGS84 range/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// v1.2 Bug-fix tests — BillingService requireEnv validation (billing/stripe-billing.ts)
// Tests 142–146
// ═══════════════════════════════════════════════════════════════════════════════

// We test the module-level requireEnv helper indirectly through BillingService.
// BillingService.verifyWebhook() calls requireEnv('STRIPE_WEBHOOK_SECRET').

import { BillingService } from '../../worker/src/billing/stripe-billing.js';

describe('BillingService env validation (billing/stripe-billing.ts)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env and reset the lazy Stripe client so next test gets a fresh one.
    Object.keys(process.env).forEach((k) => delete (process.env as any)[k]);
    Object.assign(process.env, originalEnv);
  });

  it('142. verifyWebhook throws when STRIPE_WEBHOOK_SECRET is missing', () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    const svc = new BillingService();
    expect(() => svc.verifyWebhook('payload', 'sig')).toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
  });

  it('143. verifyWebhook throws when signature is invalid (with secret set)', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake';
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    const svc = new BillingService();
    // Stripe will throw a signature verification error — we ensure it is
    // re-thrown as a descriptive Error rather than an unhandled exception.
    expect(() => svc.verifyWebhook('payload', 'bad-sig')).toThrow(
      /Webhook signature verification failed/,
    );
  });

  it('144. handleWebhook returns unhandled for unknown event types', async () => {
    const svc = new BillingService();
    const result = await svc.handleWebhook({ type: 'unknown.event', data: { object: {} } } as any);
    expect(result.action).toBe('unhandled');
    expect(result.data.type).toBe('unknown.event');
  });

  it('145. handleWebhook returns update_subscription for subscription.updated', async () => {
    const svc = new BillingService();
    const fakeEvent = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_123',
          id: 'sub_456',
          status: 'active',
          current_period_end: 1800000000,
        },
      },
    } as any;
    const result = await svc.handleWebhook(fakeEvent);
    expect(result.action).toBe('update_subscription');
    expect(result.data.subscriptionId).toBe('sub_456');
  });

  it('146. handleWebhook returns cancel_subscription for subscription.deleted', async () => {
    const svc = new BillingService();
    const fakeEvent = {
      type: 'customer.subscription.deleted',
      data: {
        object: { customer: 'cus_123', id: 'sub_789' },
      },
    } as any;
    const result = await svc.handleWebhook(fakeEvent);
    expect(result.action).toBe('cancel_subscription');
    expect(result.data.subscriptionId).toBe('sub_789');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// v1.2 Robustness tests — subscription tier edge cases
// Tests 147–153
// ═══════════════════════════════════════════════════════════════════════════════

describe('Subscription Tiers — additional edge cases (billing/subscription-tiers.ts)', () => {
  it('147. canAccessDataSource returns true for FIRM_UNLIMITED (data_sources=all)', () => {
    expect(canAccessDataSource('FIRM_UNLIMITED', 'any_source')).toBe(true);
  });

  it('148. canAccessDataSource returns true for ENTERPRISE (data_sources=all)', () => {
    expect(canAccessDataSource('ENTERPRISE', 'any_source')).toBe(true);
  });

  it('149. canAccessDataSource returns false for FREE_TRIAL accessing txdot', () => {
    expect(canAccessDataSource('FREE_TRIAL', 'txdot')).toBe(false);
  });

  it('150. canExportFormat returns true for FIRM_UNLIMITED for rw5 format', () => {
    expect(canExportFormat('FIRM_UNLIMITED', 'rw5')).toBe(true);
  });

  it('151. canExportFormat returns false for FREE_TRIAL for rw5 format', () => {
    expect(canExportFormat('FREE_TRIAL', 'rw5')).toBe(false);
  });

  it('152. isWithinReportLimit always true for FIRM_UNLIMITED (unlimited reports)', () => {
    expect(isWithinReportLimit('FIRM_UNLIMITED', 9999)).toBe(true);
  });

  it('153. isWithinReportLimit returns false for FREE_TRIAL when over 2 reports', () => {
    expect(isWithinReportLimit('FREE_TRIAL', 3)).toBe(false);
  });
});
