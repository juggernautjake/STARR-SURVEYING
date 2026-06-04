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

describe('Slice 2 — north arrow + graphic scale bar (source-locked)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'delivery', 'pdf-writer.ts'),
    'utf8',
  );
  it('draws a north arrow that respects the drawing rotation, gated on visibility', () => {
    expect(SRC).toMatch(/function drawNorthArrow/);
    expect(SRC).toMatch(/tb\?\.northArrowVisible !== false/);
    expect(SRC).toMatch(/doc\.settings\.drawingRotationDeg \?\? 0/);
  });
  it('draws a checkered graphic scale bar with the written scale, gated on visibility', () => {
    expect(SRC).toMatch(/function drawScaleBar/);
    expect(SRC).toMatch(/tb\?\.scaleBarVisible !== false/);
    expect(SRC).toMatch(/drawScaleBar\(pdf, margin \+ 0\.35,[\s\S]*?effectiveScale\)/);
    // written scale + FEET label in the bar.
    expect(SRC).toMatch(/`1" = \$\{plotScale\}'`/);
    expect(SRC).toMatch(/'FEET'/);
  });
});

describe('Slice 3 — full classic title block (source-locked)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'delivery', 'pdf-writer.ts'),
    'utf8',
  );
  it('builds an ALL-CAPS "<TYPE> OF <PROJECT>" drawing title, defaulting to BOUNDARY SURVEY', () => {
    expect(SRC).toMatch(/tb\.surveyType \|\| 'BOUNDARY SURVEY'/);
    expect(SRC).toMatch(/\$\{surveyType\} OF \$\{tb\.projectName\.toUpperCase\(\)\}/);
  });
  it('shows the firm name and the surveyor with an RPLS license number', () => {
    expect(SRC).toMatch(/tb\.firmName/);
    expect(SRC).toMatch(/, RPLS #\$\{tb\.surveyorLicense\}/);
  });
  it('lays out a CLIENT / JOB NO. / DATE / SCALE / SHEET field grid', () => {
    expect(SRC).toMatch(/\['CLIENT', tb\.clientName\]/);
    expect(SRC).toMatch(/\['JOB NO\.', tb\.projectNumber\]/);
    expect(SRC).toMatch(/\['DATE', tb\.surveyDate\]/);
    expect(SRC).toMatch(/\['SCALE', scaleText\]/);
    expect(SRC).toMatch(/\['SHEET', sheet\]/);
    // empty fields are filtered out so the grid never shows blank labels.
    expect(SRC).toMatch(/\.filter\(\(\[, v\]\) => v && String\(v\)\.trim\(\)\.length > 0\)/);
  });
  it('renders the SHEET value as "<n> OF <total>" when totalSheets is set', () => {
    expect(SRC).toMatch(/\$\{tb\.sheetNumber\}\$\{tb\.totalSheets \? ` OF \$\{tb\.totalSheets\}` : ''\}/);
  });
});

describe('Slice 4 — line-weight hierarchy + line types (source-locked)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'delivery', 'pdf-writer.ts'),
    'utf8',
  );
  it('maps the authored mm line weight to paper inches with a hairline floor', () => {
    expect(SRC).toMatch(/const MM_PER_INCH = 25\.4;/);
    expect(SRC).toMatch(/function resolvePlotWeightIn/);
    expect(SRC).toMatch(/feature\.style\.lineWeight \?\? layer\?\.lineWeight \?\? 0\.5/);
    expect(SRC).toMatch(/Math\.max\(MIN_PLOT_WEIGHT_IN, mm \/ MM_PER_INCH\)/);
  });
  it('resolves each feature line type to a dash pattern in paper inches via the plot scale', () => {
    expect(SRC).toMatch(/function resolveDashPatternIn/);
    expect(SRC).toMatch(/feature\.style\.lineTypeId \?\? layer\?\.lineTypeId \?\? 'SOLID'/);
    expect(SRC).toMatch(/resolveLineTypeWithFallback\(id, doc\.customLineTypes \?\? \[\]\)/);
    expect(SRC).toMatch(/lt\.dashPattern\.map\(\(d\) => Math\.max\(0\.002, d \* xform\.scale\)\)/);
  });
  it('applies the per-feature weight + dash in drawFeature, points always solid', () => {
    expect(SRC).toMatch(/pdf\.setLineWidth\(resolvePlotWeightIn\(f, layer\)\)/);
    expect(SRC).toMatch(/f\.type === 'POINT' \? null : resolveDashPatternIn\(f, layer, doc, xform\)/);
    expect(SRC).toMatch(/pdf\.setLineDashPattern\(dash \?\? \[\], 0\)/);
  });
  it('resets the dash pattern to solid after the feature loop', () => {
    expect(SRC).toMatch(/pdf\.setLineDashPattern\(\[\], 0\);\s*\n\s*\/\/ Reset to solid|Reset to solid so the framing[\s\S]*?pdf\.setLineDashPattern\(\[\], 0\)/);
  });
});
