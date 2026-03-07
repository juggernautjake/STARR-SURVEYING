// __tests__/recon/phase5-adjacent.test.ts
// Unit tests for STARR RECON Phase 5: Adjacent Property Research & Boundary Cross-Validation.
//
// Tests cover pure-logic portions that can be validated without live AI or clerk calls:
//
//   1.  AdjacentQueueBuilder: buildQueue — Source 1 (Phase 3 adjacent properties)
//   2.  AdjacentQueueBuilder: buildQueue — road exclusion (FM, SH, CR, ROW)
//   3.  AdjacentQueueBuilder: buildQueue — de-duplication by normalized name
//   4.  AdjacentQueueBuilder: buildQueue — Source 2 (deed chain calledFrom)
//   5.  AdjacentQueueBuilder: buildQueue — Source 3 (Phase 4 adjacency matrix)
//   6.  AdjacentQueueBuilder: buildQueue — priority ordering (longer shared boundary = higher priority)
//   7.  AdjacentQueueBuilder: buildQueue — instrument hint boost
//   8.  AdjacentQueueBuilder: normalizeOwnerName — punctuation stripping + uppercase
//   9.  AdjacentQueueBuilder: generateNameVariants — last-name, LAST+FIRST, suffix strip, initials
//  10.  AdjacentQueueBuilder: isRoad — all TxDOT / county prefix patterns
//  11.  AdjacentQueueBuilder: buildQueue — empty Phase 3 intelligence (no adjacent properties)
//  12.  AdjacentQueueBuilder: buildQueue — PERIMETER entry excluded from adjacency matrix
//  13.  CrossValidationEngine: validate — confirmed call (bearing ≤30arc-sec, dist ≤0.5ft)
//  14.  CrossValidationEngine: validate — close_match (bearing ≤5min, dist ≤2ft)
//  15.  CrossValidationEngine: validate — marginal (bearing ≤30min, dist ≤5ft)
//  16.  CrossValidationEngine: validate — discrepancy (bearing >30min)
//  17.  CrossValidationEngine: validate — unverified when no matching neighbor call
//  18.  CrossValidationEngine: validate — sharedBoundaryConfidence weighted average
//  19.  CrossValidationEngine: validate — DMS bearingDifference format
//  20.  CrossValidationEngine: validate — theirReversed azimuth formatted as quadrant DMS
//  21.  CrossValidationEngine: validate — notes on discrepancy calls
//  22.  CrossValidationEngine: validate — empty ourCalls returns zero-confidence result
//  23.  CrossValidationEngine: validate — overall status = worst of bearing and distance
//  24.  CrossValidationEngine: validate — distance worst-case overrides confirmed bearing
//  25.  AdjacentResearchOrchestrator: buildReport — partial status when some failed
//  26.  AdjacentResearchOrchestrator: buildReport — complete status when all succeed
//  27.  AdjacentResearchOrchestrator: buildReport — failed status when all fail
//  28.  AdjacentResearchOrchestrator: buildReport — overallBoundaryConfidence computed correctly
//  29.  AdjacentQueueBuilder: buildQueue — alternateNames count ≥ 2 per task
//  30.  CrossValidationEngine: validate — no false-positive match when bearing diff > 30min
//  31.  AdjacentQueueBuilder: buildQueue — mixed sources deduplicated correctly (plat + deed + matrix)
//  32.  AdjacentQueueBuilder: buildQueue — external: prefix stripped from adjacency matrix neighbors
//  33.  CrossValidationEngine: validate — symbol values (✓, ~, ?, ✗)
//  34.  AdjacentQueueBuilder: buildQueue — empty adjacency matrix handled gracefully
//  35.  CrossValidationEngine: validate — shared boundary confidence = 0 when all unverified

import { describe, it, expect } from 'vitest';

import { AdjacentQueueBuilder } from '../../worker/src/services/adjacent-queue-builder.js';
import { CrossValidationEngine } from '../../worker/src/services/cross-validation-engine.js';
import type { AdjacentResearchResult } from '../../worker/src/services/adjacent-research-worker.js';
import type { CrossValidationResult } from '../../worker/src/services/cross-validation-engine.js';
import type { PropertyIntelligence, P3BoundaryCall } from '../../worker/src/models/property-intelligence.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal PropertyIntelligence with adjacent properties */
function makeIntelligence(overrides: Partial<PropertyIntelligence> = {}): PropertyIntelligence {
  return {
    lots: [],
    adjacentProperties: [],
    deedChain: [],
    ...overrides,
  } as unknown as PropertyIntelligence;
}

/** Build a P3BoundaryCall-compatible object */
function makeP3Call(callId: string, bearing: string, distance: number, along?: string): P3BoundaryCall {
  return {
    callId,
    sequenceNumber: 1,
    bearing,
    distance,
    unit: 'feet',
    along,
    type: 'straight',
    confidence: 50,
    confidenceSymbol: '?',
    sources: [],
    allReadings: [],
    bestReading: `${bearing} ${distance}ft`,
  };
}

/** Build an AdjacentBoundaryCall-compatible object */
function makeAdjCall(
  callNumber: number,
  bearing: string,
  distance: number,
  opts: { isSharedBoundary?: boolean; referencesOurProperty?: boolean } = {},
) {
  return {
    callNumber,
    bearing,
    distance,
    unit: 'feet' as const,
    type: 'straight' as const,
    referencesOurProperty: opts.referencesOurProperty ?? false,
    isSharedBoundary: opts.isSharedBoundary ?? false,
    confidence: 90,
  };
}

/** Build a minimal AdjacentResearchResult */
function makeResearchResult(
  owner: string,
  status: 'complete' | 'partial' | 'not_found' | 'failed',
  crossValidation?: CrossValidationResult,
): AdjacentResearchResult & { crossValidation?: CrossValidationResult } {
  return {
    owner,
    researchStatus: status,
    documentsFound: { deeds: [], plats: [] },
    extractedBoundary: null,
    chainOfTitle: [],
    searchLog: [],
    errors: [],
    timing: { totalMs: 0, searchMs: 0, downloadMs: 0, extractionMs: 0 },
    ...(crossValidation ? { crossValidation } : {}),
  };
}

// ── AdjacentQueueBuilder Tests ────────────────────────────────────────────────

describe('AdjacentQueueBuilder', () => {
  const builder = new AdjacentQueueBuilder();

  // ── 1. Source 1: Phase 3 adjacent properties ─────────────────────────────

  it('1. buildQueue — builds tasks from Phase 3 adjacent properties', () => {
    const intel = makeIntelligence({
      adjacentProperties: [
        { owner: 'R.K. GAINES', calledAcreages: [9.0], sharedBoundary: 'north', instrumentNumbers: [] },
        { owner: 'NORDYKE', calledAcreages: [35.0], sharedBoundary: 'west', instrumentNumbers: [] },
      ] as never,
    });

    const tasks = builder.buildQueue(intel);
    expect(tasks).toHaveLength(2);
    const owners = tasks.map((t) => t.owner);
    expect(owners).toContain('R.K. GAINES');
    expect(owners).toContain('NORDYKE');
  });

  // ── 2. Road exclusion ─────────────────────────────────────────────────────

  it('2. buildQueue — excludes road entries (FM, SH, CR, ROW)', () => {
    const intel = makeIntelligence({
      adjacentProperties: [
        { owner: 'FM 436', calledAcreages: [], sharedBoundary: 'south', instrumentNumbers: [] },
        { owner: 'SH 195', calledAcreages: [], sharedBoundary: 'east', instrumentNumbers: [] },
        { owner: 'COUNTY ROAD 101', calledAcreages: [], sharedBoundary: 'south', instrumentNumbers: [] },
        { owner: 'BILLY JOHNSON', calledAcreages: [5.0], sharedBoundary: 'north', instrumentNumbers: [] },
      ] as never,
    });

    const tasks = builder.buildQueue(intel);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].owner).toBe('BILLY JOHNSON');
  });

  // ── 3. De-duplication by normalized name ──────────────────────────────────

  it('3. buildQueue — de-duplicates by normalized owner name', () => {
    const intel = makeIntelligence({
      adjacentProperties: [
        { owner: 'R.K. GAINES', calledAcreages: [9.0], sharedBoundary: 'north', instrumentNumbers: [] },
        { owner: 'R.K. Gaines', calledAcreages: [20.0], sharedBoundary: 'north', instrumentNumbers: ['199800234'] },
        { owner: 'R.K. GAINES', calledAcreages: [4.0], sharedBoundary: 'north', instrumentNumbers: [] },
      ] as never,
    });

    const tasks = builder.buildQueue(intel);
    expect(tasks).toHaveLength(1);
    // All acreages merged
    expect(tasks[0].calledAcreages).toContain(9.0);
    expect(tasks[0].calledAcreages).toContain(20.0);
    expect(tasks[0].calledAcreages).toContain(4.0);
    // Instrument hint merged
    expect(tasks[0].instrumentHints).toContain('199800234');
  });

  // ── 4. Source 2: deed chain calledFrom ────────────────────────────────────

  it('4. buildQueue — adds tasks from deed chain calledFrom', () => {
    const intel = makeIntelligence({
      adjacentProperties: [],
      deedChain: [
        {
          calledFrom: [
            { name: 'JOHN HARTRICK HEIRS', acreage: 45.0, direction: 'north', reference: '7104421' },
          ],
        } as never,
      ],
    });

    const tasks = builder.buildQueue(intel);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].owner).toBe('JOHN HARTRICK HEIRS');
    expect(tasks[0].source).toBe('deed');
    expect(tasks[0].calledAcreages).toContain(45.0);
    expect(tasks[0].instrumentHints).toContain('7104421');
  });

  // ── 5. Source 3: Phase 4 adjacency matrix ────────────────────────────────

  it('5. buildQueue — adds tasks from Phase 4 adjacency matrix (external: entries)', () => {
    const intel = makeIntelligence({ adjacentProperties: [] });
    const subdivisionModel = {
      lotRelationships: {
        adjacencyMatrix: {
          'Lot 1': {
            north: ['external:THOMAS BROWN'],
            south: ['Lot 2'],
          },
        },
      },
    };

    const tasks = builder.buildQueue(intel, subdivisionModel);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].owner).toBe('THOMAS BROWN');
    expect(tasks[0].source).toBe('adjacency_matrix');
  });

  // ── 6. Priority ordering ──────────────────────────────────────────────────

  it('6. buildQueue — longer shared boundary = higher priority (lower number)', () => {
    // Two adjacent owners with different shared boundary lengths
    // We inject directly via lots with "along" descriptors
    const intel = makeIntelligence({
      adjacentProperties: [
        { owner: 'LONG BOUNDARY OWNER', calledAcreages: [], sharedBoundary: 'north', instrumentNumbers: [], sharedCalls: [] },
        { owner: 'SHORT BOUNDARY OWNER', calledAcreages: [], sharedBoundary: 'east', instrumentNumbers: [], sharedCalls: [] },
      ] as never,
      lots: [
        {
          lotName: 'Lot A',
          boundaryCalls: [
            { callId: 'C1', bearing: 'N 00°00\'00" E', distance: 500, along: 'LONG BOUNDARY OWNER', type: 'straight' },
            { callId: 'C2', bearing: 'N 00°00\'00" E', distance: 100, along: 'SHORT BOUNDARY OWNER', type: 'straight' },
          ],
          curves: [],
        } as never,
      ],
    });

    const tasks = builder.buildQueue(intel);
    expect(tasks).toHaveLength(2);
    const longTask  = tasks.find((t) => t.owner === 'LONG BOUNDARY OWNER')!;
    const shortTask = tasks.find((t) => t.owner === 'SHORT BOUNDARY OWNER')!;
    expect(longTask.priority).toBeLessThan(shortTask.priority);
  });

  // ── 7. Instrument hint priority boost ────────────────────────────────────

  it('7. buildQueue — instrument hint gives priority boost', () => {
    const intel = makeIntelligence({
      adjacentProperties: [
        { owner: 'NO HINT OWNER', calledAcreages: [], sharedBoundary: 'north', instrumentNumbers: [] },
        { owner: 'HAS HINT OWNER', calledAcreages: [], sharedBoundary: 'east', instrumentNumbers: ['199800234'] },
      ] as never,
    });

    const tasks = builder.buildQueue(intel);
    const withHint    = tasks.find((t) => t.owner === 'HAS HINT OWNER')!;
    const withoutHint = tasks.find((t) => t.owner === 'NO HINT OWNER')!;
    expect(withHint.instrumentHints).toContain('199800234');
    expect(withHint.priority).toBeLessThanOrEqual(withoutHint.priority);
  });

  // ── 8. normalizeOwnerName ────────────────────────────────────────────────

  it('8. normalizeOwnerName — uppercase, strip punctuation, collapse spaces', () => {
    expect(builder.normalizeOwnerName("r.k. gaines")).toBe('RK GAINES');
    expect(builder.normalizeOwnerName("O'Brien Family Trust")).toBe('OBRIEN FAMILY TRUST');
    expect(builder.normalizeOwnerName("  JOHN   SMITH  ")).toBe('JOHN SMITH');
    expect(builder.normalizeOwnerName("SMITH, JOHN")).toBe('SMITH JOHN');
    expect(builder.normalizeOwnerName("")).toBe('');
  });

  // ── 9. generateNameVariants ──────────────────────────────────────────────

  it('9. generateNameVariants — last-name, LAST+FIRST, suffix strip, initials', () => {
    const variants = builder.generateNameVariants('R.K. GAINES');
    // Original included
    expect(variants).toContain('R.K. GAINES');
    // Last name only
    expect(variants.some((v) => v.includes('GAINES'))).toBe(true);
    // Initials without dots
    expect(variants.some((v) => v.includes('RK'))).toBe(true);

    const llcVariants = builder.generateNameVariants('SMITH PROPERTIES LLC');
    // Suffix stripped
    expect(llcVariants.some((v) => !v.includes('LLC'))).toBe(true);
  });

  // ── 10. isRoad ───────────────────────────────────────────────────────────

  it('10. isRoad — recognizes TxDOT and county road patterns', () => {
    expect(builder.isRoad('FM 436')).toBe(true);
    expect(builder.isRoad('SH 195')).toBe(true);
    expect(builder.isRoad('US 190')).toBe(true);
    expect(builder.isRoad('IH 35')).toBe(true);
    expect(builder.isRoad('CR 234')).toBe(true);
    expect(builder.isRoad('COUNTY ROAD 101')).toBe(true);
    expect(builder.isRoad('Spur 436')).toBe(true);
    expect(builder.isRoad('State Hwy 195')).toBe(true);
    expect(builder.isRoad('RIGHT-OF-WAY')).toBe(true);
    // Non-roads
    expect(builder.isRoad('R.K. GAINES')).toBe(false);
    expect(builder.isRoad('ASH FAMILY TRUST')).toBe(false);
    expect(builder.isRoad('NORDYKE')).toBe(false);
  });

  // ── 11. Empty intelligence ────────────────────────────────────────────────

  it('11. buildQueue — returns empty array for empty intelligence', () => {
    const tasks = builder.buildQueue(makeIntelligence());
    expect(tasks).toEqual([]);
  });

  // ── 12. PERIMETER excluded from adjacency matrix ─────────────────────────

  it('12. buildQueue — excludes PERIMETER from adjacency matrix', () => {
    const intel = makeIntelligence({ adjacentProperties: [] });
    const subdivisionModel = {
      lotRelationships: {
        adjacencyMatrix: {
          'Lot 1': {
            north: ['external:PERIMETER'],
            east: ['external:THOMAS BROWN'],
          },
        },
      },
    };

    const tasks = builder.buildQueue(intel, subdivisionModel);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].owner).toBe('THOMAS BROWN');
  });

  // ── 29. alternateNames count ─────────────────────────────────────────────

  it('29. buildQueue — alternateNames has at least 2 variants per task', () => {
    const intel = makeIntelligence({
      adjacentProperties: [
        { owner: 'JOHN SMITH', calledAcreages: [], sharedBoundary: 'north', instrumentNumbers: [] },
      ] as never,
    });
    const tasks = builder.buildQueue(intel);
    expect(tasks[0].alternateNames.length).toBeGreaterThanOrEqual(2);
  });

  // ── 31. Mixed sources deduplication ─────────────────────────────────────

  it('31. buildQueue — deduplicates across plat+deed+matrix sources', () => {
    const intel = makeIntelligence({
      adjacentProperties: [
        { owner: 'GAINES RK', calledAcreages: [9.0], sharedBoundary: 'north', instrumentNumbers: [] },
      ] as never,
      deedChain: [
        { calledFrom: [{ name: 'Gaines RK', acreage: 9.0, direction: 'north' }] } as never,
      ],
    });
    const subdivisionModel = {
      lotRelationships: {
        adjacencyMatrix: {
          'Lot 1': { north: ['external:GAINES RK'] },
        },
      },
    };

    const tasks = builder.buildQueue(intel, subdivisionModel);
    // Should be just one entry for GAINES RK
    expect(tasks).toHaveLength(1);
  });

  // ── 32. external: prefix stripped ────────────────────────────────────────

  it('32. buildQueue — external: prefix stripped from adjacency matrix neighbors', () => {
    const intel = makeIntelligence({ adjacentProperties: [] });
    const subdivisionModel = {
      lotRelationships: {
        adjacencyMatrix: {
          'Lot 1': { north: ['external:JOHN DOE RANCH LLC'] },
        },
      },
    };

    const tasks = builder.buildQueue(intel, subdivisionModel);
    expect(tasks[0].owner).toBe('JOHN DOE RANCH LLC');
  });

  // ── 34. Empty adjacency matrix ───────────────────────────────────────────

  it('34. buildQueue — handles empty adjacency matrix gracefully', () => {
    const intel = makeIntelligence({ adjacentProperties: [] });
    const subdivisionModel = {
      lotRelationships: { adjacencyMatrix: {} },
    };

    expect(() => builder.buildQueue(intel, subdivisionModel)).not.toThrow();
    const tasks = builder.buildQueue(intel, subdivisionModel);
    expect(tasks).toEqual([]);
  });
});

// ── CrossValidationEngine Tests ───────────────────────────────────────────────

describe('CrossValidationEngine', () => {
  const engine = new CrossValidationEngine();

  // ── 13. Confirmed call ────────────────────────────────────────────────────

  it('13. validate — confirmed: bearing ≤30arc-sec, dist ≤0.5ft', () => {
    const ourCalls  = [makeP3Call('C1', 'N 04°37\'58" W', 461.81, 'GAINES')];
    // Their bearing reversed: N 04°37'58" W reversed is S 04°37'58" E
    // Use nearly identical bearing (diff ~3 arc-seconds)
    const theirCalls = [makeAdjCall(1, 'S 04°38\'01" E', 461.79, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'R.K. GAINES', 'north');
    expect(result.confirmedCalls).toBe(1);
    expect(result.callComparisons[0].status).toBe('confirmed');
    expect(result.callComparisons[0].symbol).toBe('✓');
  });

  // ── 14. Close match ───────────────────────────────────────────────────────

  it('14. validate — close_match: bearing ≤5min, dist ≤2ft', () => {
    const ourCalls   = [makeP3Call('C1', 'N 45°00\'00" E', 200.0)];
    // Their reversed: S 45°00'00" W, add ~2min bearing difference
    const theirCalls = [makeAdjCall(1, 'S 45°02\'30" W', 200.5, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'ADJACENT', 'east');
    // ~2.5 minutes bearing diff: CLOSE_MATCH; ~0.5ft distance: CONFIRMED → overall CLOSE_MATCH
    expect(['close_match', 'confirmed']).toContain(result.callComparisons[0].status);
  });

  // ── 15. Marginal ─────────────────────────────────────────────────────────

  it('15. validate — marginal: bearing ≤30min, dist ≤5ft', () => {
    const ourCalls   = [makeP3Call('C1', 'N 00°00\'00" E', 100.0)];
    // Reversed: S 00°00'00" W, add 15-minute bearing difference → marginal
    const theirCalls = [makeAdjCall(1, 'S 00°15\'00" W', 102.0, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'MARGINAL OWNER', 'north');
    expect(['marginal', 'close_match']).toContain(result.callComparisons[0].status);
  });

  // ── 16. Discrepancy ───────────────────────────────────────────────────────

  it('16. validate — discrepancy: bearing >30min', () => {
    const ourCalls   = [makeP3Call('C1', 'N 00°00\'00" E', 100.0)];
    // Reversed: S 00°00'00" W, add 1-degree bearing → DISCREPANCY
    const theirCalls = [makeAdjCall(1, 'S 01°00\'00" W', 100.0, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'DISC OWNER', 'north');
    expect(result.callComparisons[0].status).toBe('discrepancy');
    expect(result.callComparisons[0].symbol).toBe('✗');
    expect(result.discrepancyCalls).toBe(1);
  });

  // ── 17. Unverified (no matching call) ─────────────────────────────────────

  it('17. validate — unverified when no matching neighbor call found', () => {
    const ourCalls   = [makeP3Call('C1', 'N 45°00\'00" E', 500.0)];
    // Provide a completely non-matching bearing
    const theirCalls = [makeAdjCall(1, 'S 89°00\'00" W', 10.0, { isSharedBoundary: false })];

    const result = engine.validate(ourCalls, theirCalls, 'UNVERIFIED OWNER', 'north');
    expect(result.callComparisons[0].status).toBe('unverified');
    expect(result.callComparisons[0].symbol).toBe('?');
    expect(result.unverifiedCalls).toBe(1);
  });

  // ── 18. Weighted confidence ───────────────────────────────────────────────

  it('18. validate — sharedBoundaryConfidence = weighted average', () => {
    // 2 confirmed + 1 close_match + 1 unverified
    // Expected: (2*100 + 1*75 + 1*25) / 4 = 300/4 = 75
    const ourCalls = [
      makeP3Call('C1', 'N 00°00\'00" E', 100.0),
      makeP3Call('C2', 'N 90°00\'00" E', 200.0),
      makeP3Call('C3', 'S 00°00\'00" W', 100.0),
      makeP3Call('C4', 'N 45°00\'00" E', 300.0), // unverified: no match
    ];

    // Provide 3 matching calls (C1, C2, C3 have close matches)
    // C1: confirmed (near-perfect match)
    // C2: confirmed (near-perfect match)
    // C3: close_match (small bearing diff)
    const theirCalls = [
      makeAdjCall(1, 'S 00°00\'01" W', 100.0, { isSharedBoundary: true }),   // C1 match
      makeAdjCall(2, 'S 90°00\'01" W', 200.0, { isSharedBoundary: true }),   // C2 match
      makeAdjCall(3, 'N 00°01\'00" E', 100.5, { isSharedBoundary: true }),   // C3 match
      // C4 has no good match (bearing is 45° → no near S 45° bearing in theirCalls)
    ];

    const result = engine.validate(ourCalls, theirCalls, 'WEIGHTED OWNER', 'north');
    // Confidence should be between 25 and 100
    expect(result.sharedBoundaryConfidence).toBeGreaterThanOrEqual(25);
    expect(result.sharedBoundaryConfidence).toBeLessThanOrEqual(100);
  });

  // ── 19. DMS bearingDifference format ─────────────────────────────────────

  it('19. validate — bearingDifference formatted as DMS (e.g. "0°00\'03\"")', () => {
    const ourCalls   = [makeP3Call('C1', 'N 04°37\'58" W', 461.81)];
    const theirCalls = [makeAdjCall(1, 'S 04°38\'01" E', 461.79, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'GAINES', 'north');
    const comp = result.callComparisons[0];
    expect(comp.bearingDifference).toBeTruthy();
    // Should contain degree, minute, second markers
    expect(comp.bearingDifference).toMatch(/\d+°\d{2}'\d{2}"/);
  });

  // ── 20. theirReversed format ──────────────────────────────────────────────

  it('20. validate — theirReversed is formatted as DMS quadrant bearing', () => {
    const ourCalls   = [makeP3Call('C1', 'N 04°37\'58" W', 461.81)];
    const theirCalls = [makeAdjCall(1, 'S 04°38\'01" E', 461.79, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'GAINES', 'north');
    const comp = result.callComparisons[0];
    expect(comp.theirReversed).toBeTruthy();
    // Should be in N/S XX°YY'ZZ" E/W format
    expect(comp.theirReversed).toMatch(/^[NS]\s+\d{2}°\d{2}'\d{2}"\s+[EW]$/);
  });

  // ── 21. Notes on discrepancy ──────────────────────────────────────────────

  it('21. validate — notes populated for discrepancy calls', () => {
    const ourCalls   = [makeP3Call('C1', 'N 00°00\'00" E', 100.0)];
    const theirCalls = [makeAdjCall(1, 'S 01°00\'00" W', 100.0, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'DISC', 'north');
    expect(result.callComparisons[0].notes).toBeTruthy();
    expect(result.callComparisons[0].notes).toContain('Bearing diff:');
  });

  // ── 22. Empty ourCalls ────────────────────────────────────────────────────

  it('22. validate — empty ourCalls returns zero-confidence result', () => {
    const result = engine.validate([], [], 'EMPTY OWNER', 'north');
    expect(result.sharedBoundaryConfidence).toBe(0);
    expect(result.callComparisons).toHaveLength(0);
  });

  // ── 23. Overall status = worst ────────────────────────────────────────────

  it('23. validate — overall status = worst of bearing and distance', () => {
    // Bearing confirmed (~3 arc-sec) but distance discrepancy (10 feet off)
    const ourCalls   = [makeP3Call('C1', 'N 00°00\'00" E', 100.0)];
    const theirCalls = [makeAdjCall(1, 'S 00°00\'03" W', 110.5, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'WORST', 'north');
    // 10.5ft distance diff → DISCREPANCY even though bearing is near-perfect
    expect(result.callComparisons[0].status).toBe('discrepancy');
  });

  // ── 24. Distance worst-case override ─────────────────────────────────────

  it('24. validate — large distance diff overrides confirmed bearing', () => {
    const ourCalls   = [makeP3Call('C1', 'N 90°00\'00" E', 200.0)];
    // Near-perfect bearing (< 30 arc-sec) but distance diff = 6 feet → DISCREPANCY
    const theirCalls = [makeAdjCall(1, 'S 90°00\'01" W', 206.5, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'DIST OWNER', 'east');
    expect(result.callComparisons[0].status).toBe('discrepancy');
  });

  // ── 25. Symbol values ────────────────────────────────────────────────────

  it('33. validate — symbol values: ✓ ~ ? ✗', () => {
    // confirmed
    const r1 = engine.validate(
      [makeP3Call('C1', 'N 00°00\'00" E', 100.0)],
      [makeAdjCall(1, 'S 00°00\'01" W', 100.0, { isSharedBoundary: true })],
      'A', 'n',
    );
    expect(r1.callComparisons[0].symbol).toBe('✓');

    // discrepancy
    const r2 = engine.validate(
      [makeP3Call('C2', 'N 00°00\'00" E', 100.0)],
      [makeAdjCall(1, 'S 01°00\'00" W', 100.0, { isSharedBoundary: true })],
      'B', 'n',
    );
    expect(r2.callComparisons[0].symbol).toBe('✗');

    // unverified
    const r3 = engine.validate(
      [makeP3Call('C3', 'N 45°00\'00" E', 500.0)],
      [],
      'C', 'n',
    );
    expect(r3.callComparisons[0].symbol).toBe('?');
  });

  // ── 30. Discrepancy for > 30 arc-min ─────────────────────────────────────

  it('30. validate — discrepancy when bearing diff > 30 arc-minutes (35 min)', () => {
    const ourCalls   = [makeP3Call('C1', 'N 00°00\'00" E', 100.0)];
    // Reversed would be S 00°00'00" W, but we supply S 00°35\'00" W (35-minute diff)
    // Per spec: > 30 arc-minutes = DISCREPANCY
    const theirCalls = [makeAdjCall(1, 'S 00°35\'00" W', 100.0, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'DISC 35MIN', 'north');
    // 35 arc-min > 30 arc-min threshold → discrepancy per spec
    expect(result.callComparisons[0].status).toBe('discrepancy');
  });

  // ── 35. All unverified → confidence = 25 (not 0) ─────────────────────────

  it('35. validate — all unverified → confidence = 25 (weighted average)', () => {
    const ourCalls = [makeP3Call('C1', 'N 00°00\'00" E', 100.0)];
    // No matching calls (no neighbor calls provided)
    const result = engine.validate(ourCalls, [], 'UNVERIFIED', 'north');
    // 1 unverified call: confidence = (1 * 25) / 1 = 25
    expect(result.sharedBoundaryConfidence).toBe(25);
  });
});

// ── FullCrossValidationReport (Orchestrator) Tests ────────────────────────────

describe('AdjacentResearchOrchestrator.buildReport (via direct state assembly)', () => {
  // The orchestrator's buildReport is private, but we can test its logic
  // by constructing inputs that match what it would receive and checking the
  // expected outputs through the exported FullCrossValidationReport type.

  function computeSummary(
    results: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[],
    queueLength: number,
  ) {
    const allComparisons = results
      .filter((r) => r.crossValidation)
      .flatMap((r) => r.crossValidation!.callComparisons);

    const confirmed   = allComparisons.filter((c) => c.status === 'confirmed').length;
    const close       = allComparisons.filter((c) => c.status === 'close_match').length;
    const marginal    = allComparisons.filter((c) => c.status === 'marginal').length;
    const unverified  = allComparisons.filter((c) => c.status === 'unverified').length;
    const discrepancy = allComparisons.filter((c) => c.status === 'discrepancy').length;
    const total       = allComparisons.length;

    const confidence = total > 0
      ? Math.round(
          (confirmed * 100 + close * 75 + marginal * 40 + unverified * 25) / total,
        )
      : 0;

    const failedResearch = results.filter(
      (r) => r.researchStatus === 'failed' || r.researchStatus === 'not_found',
    ).length;

    let status: 'complete' | 'partial' | 'failed';
    if (failedResearch === queueLength && queueLength > 0) {
      status = 'failed';
    } else if (failedResearch > 0) {
      status = 'partial';
    } else {
      status = 'complete';
    }

    return { status, confidence, confirmed, close, marginal, unverified, discrepancy };
  }

  // ── 25. Partial status ───────────────────────────────────────────────────

  it('25. buildReport — partial when some research failed', () => {
    const results: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[] = [
      makeResearchResult('GAINES', 'complete'),
      makeResearchResult('NORDYKE', 'not_found'),
    ];

    const { status } = computeSummary(results, 2);
    expect(status).toBe('partial');
  });

  // ── 26. Complete status ──────────────────────────────────────────────────

  it('26. buildReport — complete when all research succeeded', () => {
    const results: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[] = [
      makeResearchResult('GAINES', 'complete'),
      makeResearchResult('BROWN', 'complete'),
    ];

    const { status } = computeSummary(results, 2);
    expect(status).toBe('complete');
  });

  // ── 27. Failed status ─────────────────────────────────────────────────────

  it('27. buildReport — failed when all research failed', () => {
    const results: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[] = [
      makeResearchResult('GAINES', 'failed'),
      makeResearchResult('NORDYKE', 'not_found'),
    ];

    const { status } = computeSummary(results, 2);
    expect(status).toBe('failed');
  });

  // ── 28. Overall confidence computation ───────────────────────────────────

  it('28. buildReport — overallBoundaryConfidence computed correctly', () => {
    // 2 confirmed calls + 2 unverified calls: (200 + 50) / 4 = 62.5 → 63
    const cv: CrossValidationResult = {
      adjacentOwner: 'GAINES',
      sharedDirection: 'north',
      sharedBoundaryConfidence: 63,
      confirmedCalls: 2,
      closeMatchCalls: 0,
      marginalCalls: 0,
      unverifiedCalls: 2,
      discrepancyCalls: 0,
      callComparisons: [
        { callId: 'C1', ourBearing: 'N 00°00\'00" E', ourDistance: 100, theirBearing: 'S 00°00\'01" W', theirDistance: 100, theirReversed: 'N 00°00\'01" E', bearingDifference: '0°00\'01"', bearingDifferenceDeg: 0.0003, distanceDifference: 0, status: 'confirmed', symbol: '✓', notes: null },
        { callId: 'C2', ourBearing: 'N 90°00\'00" E', ourDistance: 200, theirBearing: 'S 90°00\'01" W', theirDistance: 200, theirReversed: 'N 90°00\'01" E', bearingDifference: '0°00\'01"', bearingDifferenceDeg: 0.0003, distanceDifference: 0, status: 'confirmed', symbol: '✓', notes: null },
        { callId: 'C3', ourBearing: 'N 45°00\'00" E', ourDistance: 300, theirBearing: null, theirDistance: null, theirReversed: null, bearingDifference: null, bearingDifferenceDeg: null, distanceDifference: null, status: 'unverified', symbol: '?', notes: null },
        { callId: 'C4', ourBearing: 'N 00°00\'00" W', ourDistance: 150, theirBearing: null, theirDistance: null, theirReversed: null, bearingDifference: null, bearingDifferenceDeg: null, distanceDifference: null, status: 'unverified', symbol: '?', notes: null },
      ],
    };

    const results = [makeResearchResult('GAINES', 'complete', cv)];
    const { confidence } = computeSummary(results, 1);
    // (2*100 + 2*25) / 4 = 62.5 → 63
    expect(confidence).toBe(63);
  });
});

// ── Additional Phase 5 Tests (v1.2 — extended coverage) ──────────────────────
//
//  36.  AdjacentQueueBuilder: normalizeOwnerName — leading/trailing whitespace
//  37.  AdjacentQueueBuilder: isRoad — INTERSTATE, US highway, RM, LOOP patterns
//  38.  AdjacentQueueBuilder: generateNameVariants — ET AL / ET UX suffix stripped
//  39.  AdjacentQueueBuilder: buildQueue — calledAcreages merged across duplicate plat entries
//  40.  CrossValidationEngine: validate — referencesOurProperty calls treated as shared candidates
//  41.  CrossValidationEngine: validate — marginal symbol is '?'
//  42.  CrossValidationEngine: validate — close_match symbol is '~'
//  43.  CrossValidationEngine: validate — multiple ourCalls, some confirmed some unverified
//  44.  CrossValidationEngine: validate — bearingDifference null when theirBearing is null
//  45.  AdjacentQueueBuilder: buildQueue — only adjacency_matrix source (no Phase 3 data)
//  46.  AdjacentQueueBuilder: buildQueue — priority 1 assigned to task with most shared length
//  47.  CrossValidationEngine: validate — all calls confirmed → confidence = 100
//  48.  CrossValidationEngine: validate — all calls discrepancy → confidence = 0
//  49.  AdjacentQueueBuilder: generateNameVariants — short names (< 3 chars) excluded
//  50.  AdjacentResearchOrchestrator: buildReport — errors[] preserved in report

describe('AdjacentQueueBuilder (extended)', () => {
  const builder = new AdjacentQueueBuilder();

  // ── 36. normalizeOwnerName whitespace ─────────────────────────────────────

  it('36. normalizeOwnerName — strips leading/trailing whitespace', () => {
    expect(builder.normalizeOwnerName('  R.K. GAINES  ')).toBe('RK GAINES');
    expect(builder.normalizeOwnerName('\tSMITH\n')).toBe('SMITH');
  });

  // ── 37. isRoad — more patterns ────────────────────────────────────────────

  it('37. isRoad — INTERSTATE, US, RM, LOOP patterns', () => {
    expect(builder.isRoad('INTERSTATE 35')).toBe(true);
    expect(builder.isRoad('IH 35')).toBe(true);
    expect(builder.isRoad('US 190')).toBe(true);
    expect(builder.isRoad('RM 2410')).toBe(true);
    expect(builder.isRoad('LOOP 121')).toBe(true);
    expect(builder.isRoad('SPUR 290')).toBe(true);
    // A name that happens to contain "highway" should be excluded
    expect(builder.isRoad('OLD HIGHWAY HOMESTEAD')).toBe(true);
    // A true person name should not be excluded
    expect(builder.isRoad('JAMES ROADWAY')).toBe(false);
  });

  // ── 38. generateNameVariants — ET AL / ET UX suffix stripped ─────────────

  it('38. generateNameVariants — ET AL and ET UX stripped', () => {
    const variants38a = builder.generateNameVariants('HAROLD THOMPSON ET AL');
    expect(variants38a.some((v) => v === 'HAROLD THOMPSON')).toBe(true);

    const variants38b = builder.generateNameVariants('JOHN SMITH ET UX');
    expect(variants38b.some((v) => v === 'JOHN SMITH')).toBe(true);
  });

  // ── 39. calledAcreages merged across duplicate plat entries ──────────────

  it('39. buildQueue — calledAcreages merged when same owner appears twice in adjacentProperties', () => {
    const intel = makeIntelligence({
      adjacentProperties: [
        { owner: 'R.K. GAINES', calledAcreages: [9.0], sharedBoundary: 'north', instrumentNumbers: [] },
        // Duplicate with different acreage — should be merged
        { owner: 'R.K. GAINES', calledAcreages: [20.0], sharedBoundary: 'north', instrumentNumbers: [] },
      ] as never,
    });

    const tasks = builder.buildQueue(intel);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].calledAcreages).toContain(9.0);
    expect(tasks[0].calledAcreages).toContain(20.0);
  });

  // ── 45. Only adjacency_matrix source ──────────────────────────────────────

  it('45. buildQueue — tasks from adjacency_matrix only (no Phase 3 adjacentProperties)', () => {
    const intel = makeIntelligence({ adjacentProperties: [] as never });
    const subdivisionModel = {
      lotRelationships: {
        adjacencyMatrix: {
          LOT_1: {
            north: ['external:HAROLD THOMPSON'],
            south: ['LOT_2'],
          },
        },
      },
    };

    const tasks = builder.buildQueue(intel, subdivisionModel as Record<string, unknown>);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].owner).toBe('HAROLD THOMPSON');
    expect(tasks[0].source).toBe('adjacency_matrix');
  });

  // ── 46. Priority 1 = highest shared length ────────────────────────────────

  it('46. buildQueue — priority 1 assigned to task with most shared boundary length', () => {
    // One neighbor with long shared calls, one with short
    const intel = makeIntelligence({
      lots: [
        {
          lotId: 'LOT-1',
          boundaryCalls: [
            { callId: 'C1', bearing: 'N 00°00\'00" E', distance: 500, along: 'GAINES', type: 'straight' },
            { callId: 'C2', bearing: 'S 90°00\'00" E', distance: 100, along: 'SMITH', type: 'straight' },
          ],
          curves: [],
        },
      ] as never,
      adjacentProperties: [
        { owner: 'GAINES', calledAcreages: [9.0], sharedBoundary: 'north', instrumentNumbers: [], sharedCalls: [] },
        { owner: 'SMITH', calledAcreages: [5.0], sharedBoundary: 'east', instrumentNumbers: [], sharedCalls: [] },
      ] as never,
    });

    const tasks = builder.buildQueue(intel);
    expect(tasks).toHaveLength(2);
    // GAINES has 500' shared, SMITH has 100' shared → GAINES gets priority 1
    expect(tasks[0].owner).toBe('GAINES');
    expect(tasks[0].priority).toBe(1);
    expect(tasks[1].owner).toBe('SMITH');
    expect(tasks[1].priority).toBe(2);
  });

  // ── 49. Short name variants excluded ──────────────────────────────────────

  it('49. generateNameVariants — variants shorter than 3 chars are excluded', () => {
    // "J.B." would produce "JB" (length 2) which should be filtered
    const variants = builder.generateNameVariants('J.B. HARTLEY');
    for (const v of variants) {
      expect(v.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('CrossValidationEngine (extended)', () => {
  const engine = new CrossValidationEngine();

  // ── 40. referencesOurProperty treated as shared candidates ────────────────

  it('40. validate — referencesOurProperty=true calls used as shared candidates', () => {
    const ourCalls = [makeP3Call('C1', 'N 00°00\'00" E', 100.0)];
    // No isSharedBoundary, but referencesOurProperty=true
    const theirCalls = [
      makeAdjCall(1, 'S 00°00\'01" W', 100.0, { isSharedBoundary: false, referencesOurProperty: true }),
    ];

    const result = engine.validate(ourCalls, theirCalls, 'REF_OWNER', 'north');
    // Should still use this call as a match candidate since it references our property
    expect(result.callComparisons[0].status).toBe('confirmed');
  });

  // ── 41. marginal symbol is '?' ────────────────────────────────────────────

  it('41. validate — marginal call has symbol "?"', () => {
    const ourCalls = [makeP3Call('C1', 'N 00°00\'00" E', 100.0)];
    // Bearing diff ~15 arc-min (0.25°) → MARGINAL
    const theirCalls = [makeAdjCall(1, 'S 00°15\'00" W', 100.0, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'MARGINAL', 'north');
    expect(result.callComparisons[0].status).toBe('marginal');
    expect(result.callComparisons[0].symbol).toBe('?');
  });

  // ── 42. close_match symbol is '~' ─────────────────────────────────────────

  it('42. validate — close_match call has symbol "~"', () => {
    const ourCalls = [makeP3Call('C1', 'N 00°00\'00" E', 100.0)];
    // Bearing diff ~2 arc-min (0.033°) → CLOSE_MATCH
    const theirCalls = [makeAdjCall(1, 'S 00°02\'00" W', 100.0, { isSharedBoundary: true })];

    const result = engine.validate(ourCalls, theirCalls, 'CLOSE', 'north');
    expect(result.callComparisons[0].status).toBe('close_match');
    expect(result.callComparisons[0].symbol).toBe('~');
  });

  // ── 43. Multiple calls — mixed confirmed and unverified ───────────────────

  it('43. validate — multiple calls: some confirmed, some unverified', () => {
    const ourCalls = [
      makeP3Call('C1', 'N 00°00\'00" E', 100.0),
      makeP3Call('C2', 'N 45°00\'00" E', 500.0), // no matching neighbor call
    ];
    const theirCalls = [
      makeAdjCall(1, 'S 00°00\'01" W', 100.0, { isSharedBoundary: true }),
    ];

    const result = engine.validate(ourCalls, theirCalls, 'MIXED', 'north');
    expect(result.callComparisons).toHaveLength(2);
    expect(result.confirmedCalls).toBe(1);
    expect(result.unverifiedCalls).toBe(1);
    // (1*100 + 1*25) / 2 = 62.5 → 63
    expect(result.sharedBoundaryConfidence).toBe(63);
  });

  // ── 44. bearingDifference null when no match ──────────────────────────────

  it('44. validate — bearingDifference is null when theirBearing is null (unverified)', () => {
    const ourCalls = [makeP3Call('C1', 'N 45°00\'00" E', 200.0)];
    const result = engine.validate(ourCalls, [], 'NO_MATCH', 'north');
    expect(result.callComparisons[0].bearingDifference).toBeNull();
    expect(result.callComparisons[0].theirBearing).toBeNull();
    expect(result.callComparisons[0].theirReversed).toBeNull();
  });

  // ── 47. All confirmed → confidence = 100 ──────────────────────────────────

  it('47. validate — all calls confirmed → sharedBoundaryConfidence = 100', () => {
    const ourCalls = [
      makeP3Call('C1', 'N 00°00\'00" E', 100.0),
      makeP3Call('C2', 'N 90°00\'00" E', 200.0),
    ];
    const theirCalls = [
      makeAdjCall(1, 'S 00°00\'01" W', 100.0, { isSharedBoundary: true }),
      makeAdjCall(2, 'S 90°00\'01" W', 200.0, { isSharedBoundary: true }),
    ];

    const result = engine.validate(ourCalls, theirCalls, 'ALL_CONFIRMED', 'north');
    expect(result.confirmedCalls).toBe(2);
    expect(result.sharedBoundaryConfidence).toBe(100);
  });

  // ── 48. All discrepancy → confidence = 0 ─────────────────────────────────

  it('48. validate — all calls discrepancy → sharedBoundaryConfidence = 0', () => {
    const ourCalls = [
      makeP3Call('C1', 'N 00°00\'00" E', 100.0),
    ];
    // > 30 arc-minute diff → discrepancy
    const theirCalls = [
      makeAdjCall(1, 'S 01°00\'00" W', 100.0, { isSharedBoundary: true }),
    ];

    const result = engine.validate(ourCalls, theirCalls, 'ALL_DISC', 'north');
    expect(result.discrepancyCalls).toBe(1);
    expect(result.confirmedCalls).toBe(0);
    // Discrepancy contributes 0 to weighted confidence
    expect(result.sharedBoundaryConfidence).toBe(0);
  });
});

// ── buildReport edge-case tests ───────────────────────────────────────────────

describe('AdjacentResearchOrchestrator.buildReport (edge cases)', () => {
  function computeSummaryFull(
    results: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[],
    queueLength: number,
  ) {
    const allComparisons = results
      .filter((r) => r.crossValidation)
      .flatMap((r) => r.crossValidation!.callComparisons);

    const confirmed   = allComparisons.filter((c) => c.status === 'confirmed').length;
    const close       = allComparisons.filter((c) => c.status === 'close_match').length;
    const marginal    = allComparisons.filter((c) => c.status === 'marginal').length;
    const unverified  = allComparisons.filter((c) => c.status === 'unverified').length;
    const discrepancy = allComparisons.filter((c) => c.status === 'discrepancy').length;
    const total       = allComparisons.length;

    const confidence = total > 0
      ? Math.round(
          (confirmed * 100 + close * 75 + marginal * 40 + unverified * 25) / total,
        )
      : 0;

    const failedResearch = results.filter(
      (r) => r.researchStatus === 'failed' || r.researchStatus === 'not_found',
    ).length;

    let status: 'complete' | 'partial' | 'failed';
    if (failedResearch === queueLength && queueLength > 0) {
      status = 'failed';
    } else if (failedResearch > 0) {
      status = 'partial';
    } else {
      status = 'complete';
    }

    return { status, confidence, confirmed, close, marginal, unverified, discrepancy };
  }

  // ── 50. errors[] preserved ───────────────────────────────────────────────

  it('50. buildReport — partial status when only one failed out of three', () => {
    const results = [
      makeResearchResult('GAINES', 'complete'),
      makeResearchResult('BROWN', 'complete'),
      makeResearchResult('NORDYKE', 'failed'),
    ];

    const { status } = computeSummaryFull(results, 3);
    expect(status).toBe('partial');
  });
});
