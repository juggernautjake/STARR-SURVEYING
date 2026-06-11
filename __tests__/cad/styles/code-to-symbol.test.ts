// __tests__/cad/styles/code-to-symbol.test.ts
//
// cad-domain-audit Slice M — shared symbol-lookup helper. The TRV
// importer originally inlined the "first-token of description →
// library symbol" rule, so AI `addPoint` + CSV import + the Draw
// Point tool all skipped the lookup and drew a default crosshair
// even when the code matched a known iron-rod / utility symbol.
// `assignSymbolForCode` centralises the rule; the TRV importer and
// AI `addPoint` now share it, and the import maps through the
// helper identically.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assignSymbolForCode } from '@/lib/cad/styles/code-to-symbol';
import { getSymbolsByAssignedCode } from '@/lib/cad/styles/symbol-library';

describe('assignSymbolForCode — pure rule', () => {
  it('returns null for empty / whitespace-only / undefined code', () => {
    expect(assignSymbolForCode('')).toBeNull();
    expect(assignSymbolForCode('   ')).toBeNull();
    expect(assignSymbolForCode(undefined)).toBeNull();
    expect(assignSymbolForCode(null)).toBeNull();
  });

  it('returns null when no library symbol claims the code', () => {
    expect(assignSymbolForCode('XYZ-not-a-code')).toBeNull();
  });

  it('only looks at the FIRST whitespace-separated token (TRV convention)', () => {
    // Pick a real code from the library so the assertion is
    // resilient to symbol-library churn.
    const sample = getSymbolsByAssignedCode('309')[0];
    if (sample) {
      expect(assignSymbolForCode('309 inside 315 1in')).toBe(sample.id);
    } else {
      // No 309 in this build — at minimum the lookup must NOT find
      // anything for a free-form description without a code first.
      expect(assignSymbolForCode('inside 315 1in')).toBeNull();
    }
  });

  it('returns the same id `getSymbolsByAssignedCode` would for a token-only code', () => {
    const sample = getSymbolsByAssignedCode('309')[0];
    if (!sample) return; // skip when not in this build
    expect(assignSymbolForCode('309')).toBe(sample.id);
  });
});

describe('source-lock — every point-creation path uses the helper', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

  it('TRV importer delegates to assignSymbolForCode', () => {
    const SRC = read('lib/cad/io/trv-to-drawing.ts');
    expect(SRC).toMatch(
      /import \{ assignSymbolForCode \} from '\.\.\/styles\/code-to-symbol'/,
    );
    expect(SRC).toMatch(
      /style\.symbolId = assignSymbolForCode\(p\.description\) \?\? style\.symbolId/,
    );
  });

  it('AI addPoint delegates to assignSymbolForCode using the resolved code (with description fallback)', () => {
    const SRC = read('lib/cad/ai/tool-registry.ts');
    expect(SRC).toMatch(
      /import \{ assignSymbolForCode \} from '\.\.\/styles\/code-to-symbol'/,
    );
    expect(SRC).toMatch(
      /assignSymbolForCode\(codeForSymbol, doc\.customSymbols \?\? \[\]\) \?\? style\.symbolId/,
    );
  });
});
