// __tests__/cad/delivery/pdf-writer-framing.test.ts
//
// cad-survey-print-pdf Slice 1 — the PDF plots at a ROUND engineering
// scale that fits, and a heavy frame border + true scale are drawn.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { roundPlotScale } from '@/lib/cad/delivery/pdf-writer';

describe('roundPlotScale — snaps the fit to a standard engineering scale', () => {
  const ext = (w: number, h: number) => ({ min: { x: 0, y: 0 }, max: { x: w, y: h } });

  it('a 300ft-wide drawing in a ~21in area → 1"=20\'', () => {
    expect(roundPlotScale(ext(300, 150), 21, 15)).toBe(20);
  });
  it('a small 50ft drawing clamps up to the minimum 1"=10\'', () => {
    expect(roundPlotScale(ext(50, 30), 21, 15)).toBe(10);
  });
  it('always returns a value from the standard ladder (never an odd ratio)', () => {
    const s = roundPlotScale(ext(437, 280), 21, 15);
    expect([10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 1000, 2000]).toContain(s);
    // and it must be large enough to fit (needed = 437/21 ≈ 20.8 → 30).
    expect(s).toBeGreaterThanOrEqual(437 / 21);
  });
  it('a huge tract scales up past the named ladder in round thousands', () => {
    expect(roundPlotScale(ext(50000, 40000), 21, 15) % 1000).toBe(0);
  });
});

describe('exportToPdf framing wiring (source-locked)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'delivery', 'pdf-writer.ts'),
    'utf8',
  );
  it('plots FIT_TO_PAGE at the round scale (not a raw fit)', () => {
    expect(SRC).toMatch(/scaleMode === 'FIXED' \? fixedScale : roundPlotScale\(extents, drawWidth, drawHeight\)/);
  });
  it('draws the heavy frame border', () => {
    expect(SRC).toMatch(/drawBorder\(pdf, pageWidth, pageHeight, margin\)/);
    expect(SRC).toMatch(/function drawBorder/);
  });
  it('passes the true plot scale to the title strip', () => {
    expect(SRC).toMatch(/drawTitleStrip\(pdf, doc, pageWidth, margin, titleStripHeight, effectiveScale\)/);
    expect(SRC).toMatch(/1" = \$\{plotScale\}'/);
  });
});
