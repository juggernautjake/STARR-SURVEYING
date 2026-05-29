// __tests__/cad/ui/property-panel-area.test.ts
//
// Slice 228 of cad-area-calculation-multi-unit-2026-05-29.md. Locks
// the source-level contract that the new generic Area block in
// PropertyPanel.tsx wires through `computeFeatureArea` +
// `sqFtToAreaUnit` so every closed shape (POLYGON / CIRCLE /
// ELLIPSE / closed POLYLINE / closed MIXED_GEOMETRY) reports its
// area in the surveyor's display-pref unit + sq-ft + acres
// fallback.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'PropertyPanel.tsx'),
  'utf8',
);

describe('PropertyPanel area readout — source-level wiring', () => {
  it('imports the new computeFeatureArea (replacing the old computeAreaFromPoints2D)', () => {
    expect(SRC).toContain("import { computeFeatureArea } from '@/lib/cad/geometry/area';");
    expect(SRC).not.toContain("import { computeAreaFromPoints2D }");
  });

  it('imports the display-unit helpers so the area renders in the surveyor preference', () => {
    expect(SRC).toContain("import { sqFtToAreaUnit, areaUnitLabel }");
  });

  it('mounts a generic Area block with data-testid="property-panel-area"', () => {
    expect(SRC).toContain('data-testid="property-panel-area"');
  });

  it('the block only renders when squareFeet > 0 (open shapes stay quiet)', () => {
    expect(SRC).toMatch(/if \(a\.squareFeet <= 0\) return null;/);
  });

  it('drives the primary line from the surveyor display preference', () => {
    expect(SRC).toMatch(/sqFtToAreaUnit\(a\.squareFeet,\s*displayPrefs\)/);
    expect(SRC).toMatch(/areaUnitLabel\(displayPrefs\)/);
  });

  it('the secondary line always shows sq ft + acres so the conversion is one glance away', () => {
    expect(SRC).toMatch(/a\.squareFeet\.toLocaleString\('en-US'/);
    expect(SRC).toMatch(/a\.acres\.toFixed\(4\)/);
  });

  it('shows an extra m² fallback when the preferred unit is neither SQ_FT nor ACRES', () => {
    expect(SRC).toMatch(/showFallback = displayPrefs\.areaUnit !== 'SQ_FT' && displayPrefs\.areaUnit !== 'ACRES'/);
    expect(SRC).toMatch(/showFallback && \(/);
  });

  it('labels the formula used (shoelace / π·r² / π·a·b / closed polyline / closed mixed)', () => {
    // Locks the per-geometryKind label tokens so a future refactor
    // can't silently drop the surveyor's "I know which formula
    // produced this number" affordance.
    expect(SRC).toContain("'shoelace'");
    expect(SRC).toContain("'π·r²'");
    expect(SRC).toContain("'π·a·b'");
    expect(SRC).toContain("'closed polyline'");
    expect(SRC).toContain("'closed mixed'");
  });

  it('the POLYGON branch keeps its perimeter line (P:) — Slice 228 only swapped the A: row', () => {
    expect(SRC).toMatch(/P:\s\{formatDistance/);
  });

  it('the old POLYGON-only A: line was removed (now handled by the generic block)', () => {
    // The old code formatted as `A: {sqft} sq ft ({acres} ac)`.
    // Slice 228 collapses that into the generic block; lock the
    // removal so we can't double-render.
    expect(SRC).not.toMatch(/A: \{a\.squareFeet\.toFixed\(2\)\} sq ft \(/);
  });
});
