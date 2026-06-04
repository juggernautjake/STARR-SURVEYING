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

describe('Slice 5 — closed-shape infill fills (source-locked)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'delivery', 'pdf-writer.ts'),
    'utf8',
  );
  it('reuses the canvas fill pipeline (resolveVisibleFillLayers + generateFillPattern)', () => {
    expect(SRC).toMatch(/import \{ resolveVisibleFillLayers \} from '\.\.\/styles\/fill-stack';/);
    expect(SRC).toMatch(/generateFillPattern,\s*\n\s*patternLineWeight,/);
    expect(SRC).toMatch(/const layers = resolveVisibleFillLayers\(f\.style\)/);
  });
  it('matches the on-screen world-constant pattern density/size constants', () => {
    expect(SRC).toMatch(/const PDF_PATTERN_WORLD_DETAIL = 3;/);
    expect(SRC).toMatch(/const PDF_PATTERN_DENSITY_MULT = 2;/);
    expect(SRC).toMatch(/const PDF_PATTERN_SIZE_MULT = 0\.85;/);
    expect(SRC).toMatch(/const pps = xform\.scale \/ PDF_PATTERN_WORLD_DETAIL;/);
  });
  it('uses the same FNV-1a hash seed as the canvas so the stipple layout matches', () => {
    expect(SRC).toMatch(/function hashSeed\(id: string\): number/);
    expect(SRC).toMatch(/seed: hashSeed\(f\.id \+ ':' \+ layer\.pattern\)/);
  });
  it('clips each fill to the boundary ring via the jsPDF path clip', () => {
    expect(SRC).toMatch(/pdf\.saveGraphicsState\(\)/);
    expect(SRC).toMatch(/pdf\.clip\(\);\s*\n\s*pdf\.discardPath\(\)/);
    expect(SRC).toMatch(/pdf\.restoreGraphicsState\(\)/);
  });
  it('honors per-layer opacity via a jsPDF GState', () => {
    expect(SRC).toMatch(/import jsPDF, \{ GState \} from 'jspdf';/);
    expect(SRC).toMatch(/new GState\(\{ opacity: alpha, 'stroke-opacity': alpha \}\)/);
  });
  it('draws SOLID layers as a filled bbox rect, patterns as dots + stroked lines', () => {
    expect(SRC).toMatch(/if \(layer\.pattern === 'SOLID'\)[\s\S]*?pdf\.rect\(minX, minY, width, height, 'F'\)/);
    expect(SRC).toMatch(/pdf\.circle\(minX \+ d\.x \* pps, minY \+ d\.y \* pps, Math\.max\(0\.0006, d\.r \* pps\), 'F'\)/);
    expect(SRC).toMatch(/patternLineWeight\(layer\.scale \* PDF_PATTERN_SIZE_MULT\) \* pps/);
  });
  it('runs the fill as a pre-pass before the stroke loop (fills under linework)', () => {
    expect(SRC).toMatch(/for \(const f of features\) \{\s*\n\s*drawFeatureFill\(pdf, f, xform, samples, plotStyle\);\s*\n\s*\}/);
  });
});

describe('Slice 6 — TEXT features + bearing/distance/area labels (source-locked)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'delivery', 'pdf-writer.ts'),
    'utf8',
  );
  it('renders TEXT features + feature labels in a pass after the linework', () => {
    expect(SRC).toMatch(/if \(f\.type === 'TEXT'\) drawTextFeature\(pdf, f, doc, xform, plotStyle\)/);
    expect(SRC).toMatch(/drawFeatureLabels\(pdf, f, doc, xform, plotStyle\)/);
    // reset font so the title block isn't left in a label's font.
    expect(SRC).toMatch(/pdf\.setFont\('helvetica', 'normal'\)/);
  });
  it('sizes text at the true plot scale (stylePt × scale × drawingScale × xform.scale)', () => {
    expect(SRC).toMatch(/function plotPointSize/);
    expect(SRC).toMatch(/stylePt \* labelScale \* drawingScale \* xform\.scale/);
  });
  it('maps arbitrary font families to a jsPDF core font + combined bold/italic style', () => {
    expect(SRC).toMatch(/function mapFontFamily/);
    expect(SRC).toMatch(/bold && italic \? 'bolditalic' : bold \? 'bold' : italic \? 'italic' : 'normal'/);
  });
  it('keeps text upright via a readable-angle normalizer', () => {
    expect(SRC).toMatch(/function readableAngleDeg/);
    expect(SRC).toMatch(/if \(deg > 90\) deg -= 180;\s*\n\s*else if \(deg < -90\) deg \+= 180;/);
  });
  it('anchors BEARING/DISTANCE at the segment midpoint and AREA at the centroid', () => {
    expect(SRC).toMatch(/function labelAnchorWorld/);
    expect(SRC).toMatch(/const maxSeg = g\.type === 'POLYGON' \? verts\.length : verts\.length - 1;/);
    expect(SRC).toMatch(/k === 'AREA' \|\| k === 'PERIMETER'/);
  });
  it('honors line-relative vs direct label offset, converting world units to paper', () => {
    expect(SRC).toMatch(/label\.rotation !== null && !label\.userPositioned/);
    expect(SRC).toMatch(/dx = \(Math\.cos\(θ\) \* along - Math\.sin\(θ\) \* perp\) \* xform\.scale/);
    expect(SRC).toMatch(/dy = -label\.offset\.y \* labelScale \* xform\.scale/);
  });
  it('reads TEXT feature font/alignment from feature.properties', () => {
    expect(SRC).toMatch(/f\.properties\.fontSize \?\? 12/);
    expect(SRC).toMatch(/f\.properties\.textAlign \?\? 'left'/);
    expect(SRC).toMatch(/baseline: 'middle'/);
  });
});

describe('Slice 7 — monument symbols + legend (source-locked)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'delivery', 'pdf-writer.ts'),
    'utf8',
  );
  it('resolves a POINT feature symbol from the library and plots it at its mm size', () => {
    expect(SRC).toMatch(/import \{ findSymbol \} from '\.\.\/styles\/symbol-library';/);
    expect(SRC).toMatch(/function drawPointFeature/);
    expect(SRC).toMatch(/findSymbol\(f\.style\.symbolId, doc\.customSymbols \?\? \[\]\)/);
    expect(SRC).toMatch(/function symbolPlotSizeIn/);
    expect(SRC).toMatch(/mm \/ MM_PER_INCH/);
  });
  it('renders the same SymbolDefinition paths the canvas uses, as jsPDF vectors', () => {
    expect(SRC).toMatch(/import \{ parseSVGPathData \} from '\.\.\/styles\/symbol-renderer';/);
    expect(SRC).toMatch(/function renderSymbolPdf/);
    // CIRCLE / RECT / PATH all handled, with curve support.
    expect(SRC).toMatch(/pdf\.circle\(c\.x, c\.y, r, op\)/);
    expect(SRC).toMatch(/pdf\.curveTo\(c1\.x, c1\.y, c2\.x, c2\.y, p\.x, p\.y\)/);
    expect(SRC).toMatch(/const scale = sizeIn \/ 10;/);
  });
  it('INHERIT path colors resolve to the feature ink; NONE skips the path', () => {
    expect(SRC).toMatch(/function symPathHex/);
    expect(SRC).toMatch(/if \(spec === 'NONE'\) return null;/);
    expect(SRC).toMatch(/if \(spec === 'INHERIT'\) return baseHex;/);
  });
  it('falls back to a crosshair when the point carries no symbol', () => {
    expect(SRC).toMatch(/\/\/ Fallback crosshair\./);
    expect(SRC).toMatch(/pdf\.line\(p\.x - s, p\.y, p\.x \+ s, p\.y\)/);
  });
  it('collects only the symbols + non-solid line types actually used', () => {
    expect(SRC).toMatch(/function collectLegendEntries/);
    expect(SRC).toMatch(/if \(ltId && ltId !== 'SOLID' && !lineTypes\.has\(ltId\)\)/);
  });
  it('draws a LEGEND box on a white knockout, gated on the showLegend option', () => {
    expect(SRC).toMatch(/function drawLegend/);
    expect(SRC).toMatch(/pdf\.rect\(x, y, boxW, boxH, 'FD'\)/);
    expect(SRC).toMatch(/pdf\.text\('LEGEND'/);
    expect(SRC).toMatch(/if \(options\.showLegend !== false\)/);
    expect(SRC).toMatch(/drawLegend\(pdf, collectLegendEntries\(features, doc\), margin \+ 0\.3, margin \+ 0\.3, plotStyle\)/);
  });
});
